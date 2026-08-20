"""HTTP client for cbe.org.eg.

The site sits behind an F5 WAF that rejects anything that does not look like a
real browser. A plain `requests.get` returns a 200 with a "Request Rejected"
body, not an error status -- so every response is checked for that marker
rather than trusting the status code.

Three data surfaces are exposed here:

  1. `post_form`  -> the historical-data endpoints. Each dataset page carries a
     form whose `action` is either /api/statistics/GetHistoricalData or
     .../GetItemsHistoricalData. The form supplies a per-request antiforgery
     token, a uid and a DataSourceId, all of which must be echoed back.
  2. `listing`    -> /api/listing/{publications,News,circulars}, plain JSON.
  3. `download_list` -> /api/sitecore/DownloadList/DownloadListFilter, the
     Excel time-series archive. HTML fragment, not JSON.
"""

from __future__ import annotations

import http.cookiejar
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Iterable

BASE = "https://www.cbe.org.eg"

# The WAF checks these as a set; dropping the Sec-Fetch-* or sec-ch-ua headers
# is enough to get rejected even with a browser User-Agent.
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "sec-ch-ua": '"Chromium";v="126", "Not)A;Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
}

REJECTED_MARKER = "The requested URL was rejected"


class WAFRejected(RuntimeError):
    """The WAF returned its rejection page (HTTP 200 with an error body)."""


class CBEError(RuntimeError):
    pass


@dataclass
class FormSpec:
    """The hidden fields and controls of a historical-data form."""

    path: str
    action: str
    select_name: str | None = None
    select_options: list[str] = field(default_factory=list)
    radio_name: str | None = None
    radio_options: list[str] = field(default_factory=list)

    @property
    def needs_options(self) -> bool:
        return bool(self.select_options)


class CBEClient:
    def __init__(self, *, delay: float = 1.0, retries: int = 3, timeout: int = 180):
        self.delay = delay
        self.retries = retries
        self.timeout = timeout
        self._jar = http.cookiejar.CookieJar()
        self._opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self._jar)
        )
        self._last_request = 0.0

    # ---------- low level ----------

    def _throttle(self) -> None:
        elapsed = time.time() - self._last_request
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self._last_request = time.time()

    def _open(self, req: urllib.request.Request) -> bytes:
        last_exc: Exception | None = None
        for attempt in range(self.retries):
            self._throttle()
            try:
                body = self._opener.open(req, timeout=self.timeout).read()
            except (urllib.error.URLError, TimeoutError) as exc:
                last_exc = exc
                time.sleep(2 ** attempt)
                continue
            # The WAF answers 200 with an HTML rejection page. Only sniff the
            # head of the body so we do not decode megabytes of xlsx.
            if REJECTED_MARKER.encode() in body[:1000]:
                raise WAFRejected(
                    f"WAF rejected {req.full_url}. "
                    "The client IP or headers are not accepted."
                )
            return body
        raise CBEError(f"{req.full_url} failed after {self.retries} attempts") from last_exc

    @staticmethod
    def _encode(url: str) -> str:
        """Percent-encode non-ASCII path characters.

        Some news slugs are Arabic and some contain an en-dash, which urllib
        cannot put on the wire as-is. `safe` keeps the characters that are
        already legal in a path, including % so an encoded URL survives a
        second pass unchanged.
        """
        split = urllib.parse.urlsplit(url)
        return urllib.parse.urlunsplit(
            (
                split.scheme,
                split.netloc,
                urllib.parse.quote(split.path, safe="/%:@!$&'()*+,;=~-._"),
                urllib.parse.quote(split.query, safe="/%:@!$&'()*+,;=?~-._"),
                split.fragment,
            )
        )

    def get_bytes(self, path: str, *, referer: str | None = None) -> bytes:
        headers = dict(BROWSER_HEADERS)
        if referer:
            headers["Referer"] = BASE + referer
        url = path if path.startswith("http") else BASE + path
        return self._open(urllib.request.Request(self._encode(url), headers=headers))

    def get(self, path: str, *, referer: str | None = None) -> str:
        return self.get_bytes(path, referer=referer).decode("utf-8", "replace")

    def _post(self, path: str, data: list[tuple[str, str]], referer: str) -> bytes:
        headers = dict(BROWSER_HEADERS)
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        headers["X-Requested-With"] = "XMLHttpRequest"
        headers["Referer"] = BASE + referer
        req = urllib.request.Request(
            BASE + path,
            data=urllib.parse.urlencode(data).encode(),
            headers=headers,
        )
        return self._open(req)

    # ---------- historical data forms ----------

    _RE_ACTION = re.compile(r'<form[^>]*action="([^"]+)"[^>]*id="historicalDataForm"')
    _RE_TOKEN = re.compile(r'__RequestVerificationToken" type="hidden" value="([^"]+)"')
    _RE_UID = re.compile(r'id="uid" name="uid" type="hidden" value="([^"]+)"')
    _RE_DSID = re.compile(r'name="DataSourceId" type="hidden" value="([^"]+)"')
    _RE_SELECT = re.compile(r'<select[^>]*name="([^"]+)"[^>]*>(.*?)</select>', re.S)
    _RE_OPTION = re.compile(r'<option value="([^"]*)"')
    _RE_RADIO = re.compile(
        r'<input[^>]*class="radio-input"[^>]*value="([^"]*)"[^>]*name="([^"]*)"'
    )

    def form_spec(self, path: str) -> FormSpec:
        html = self.get(path)
        idx = html.find('id="historicalDataForm"')
        if idx < 0:
            raise CBEError(f"no historicalDataForm on {path}")
        start = html.rfind("<form", 0, idx)
        end = html.find("</form>", idx)
        frag = html[start:end]

        action = self._RE_ACTION.search(frag)
        if not action:
            # action attribute precedes id on some pages; fall back to a plain scan
            m = re.search(r'action="([^"]+)"', frag)
            if not m:
                raise CBEError(f"no form action on {path}")
            action_url = m.group(1)
        else:
            action_url = action.group(1)

        spec = FormSpec(path=path, action=action_url)

        sel = self._RE_SELECT.search(frag)
        if sel:
            spec.select_name = sel.group(1)
            spec.select_options = self._RE_OPTION.findall(sel.group(2))

        radios = self._RE_RADIO.findall(frag)
        if radios:
            spec.radio_name = radios[0][1]
            spec.radio_options = [r[0] for r in radios]

        return spec

    def historical(
        self,
        spec: FormSpec,
        date_from: str,
        date_to: str,
        *,
        options: Iterable[str] | None = None,
        radio: str | None = None,
        submit_action: int = 1,
    ) -> bytes:
        """Fetch one historical-data table.

        Dates are dd/mm/yyyy. `submit_action` 1=HTML table, 2=xlsx, 3=HTML, 4=PDF.
        The antiforgery token is single-use per page load, so the page is
        re-fetched for every call.
        """
        html = self.get(spec.path)
        token = self._RE_TOKEN.search(html)
        uid = self._RE_UID.search(html)
        dsid = self._RE_DSID.search(html)
        if not (token and uid and dsid):
            raise CBEError(f"missing form tokens on {spec.path}")

        data: list[tuple[str, str]] = [
            ("__RequestVerificationToken", token.group(1)),
            ("uid", uid.group(1)),
            ("DataSourceId", dsid.group(1)),
            ("FallbackUrl", spec.path),
            ("LanguageName", "en"),
            ("FromDateRaw", date_from),
            ("ToDateRaw", date_to),
        ]
        if spec.select_name:
            chosen = list(options) if options is not None else spec.select_options
            data += [(spec.select_name, o) for o in chosen]
        if spec.radio_name:
            data.append((spec.radio_name, radio or spec.radio_options[0]))
        data.append(("SubmitAction", str(submit_action)))

        return self._post(spec.action, data, referer=spec.path)

    # ---------- listing APIs ----------

    def listing(
        self, kind: str, datasource_id: str, *, page_size: int = 1000, page_no: int = 0
    ) -> dict[str, Any]:
        """kind is one of 'publications', 'News', 'circulars'."""
        params = urllib.parse.urlencode(
            {
                "pageNo": page_no,
                "pageSize": page_size,
                "datasourceItemId": datasource_id,
            }
        )
        headers = dict(BROWSER_HEADERS)
        headers["X-Requested-With"] = "XMLHttpRequest"
        headers["Referer"] = BASE + "/en/news-publications/publications"
        req = urllib.request.Request(
            f"{BASE}/api/listing/{kind}?{params}", headers=headers
        )
        return json.loads(self._open(req).decode("utf-8", "replace"))

    # ---------- Excel archive ----------

    def download_list(
        self, category_guid: str, *, page_size: int = 1000, page_number: int = 1
    ) -> str:
        """HTML fragment listing the xlsx files for one time-series category.

        `category_guid` must be brace-wrapped: {F0167056-43D2-...}.
        """
        data = [
            ("category", category_guid),
            ("pageSize", str(page_size)),
            ("pageNumber", str(page_number)),
        ]
        return self._post(
            "/api/sitecore/DownloadList/DownloadListFilter",
            data,
            referer="/en/economic-research/time-series/downloadlist",
        ).decode("utf-8", "replace")


def probe() -> tuple[bool, str]:
    """Phase 0 gate: can this host reach CBE at all?

    Returns (ok, message). Used by the GitHub Actions connectivity check.
    """
    client = CBEClient(delay=0)
    try:
        html = client.get("/en/economic-research/statistics/cbe-exchange-rates")
    except WAFRejected as exc:
        return False, f"WAF REJECTED: {exc}"
    except Exception as exc:  # noqa: BLE001 - the probe reports anything
        return False, f"{type(exc).__name__}: {exc}"

    m = re.search(r"Rates for Date:\s*([0-9/]+)", html)
    if not m:
        return False, "page fetched but no rate table found (layout changed?)"
    return True, f"OK - live page reachable, rates dated {m.group(1)}"


if __name__ == "__main__":
    import sys

    ok, msg = probe()
    print(msg)
    sys.exit(0 if ok else 1)
