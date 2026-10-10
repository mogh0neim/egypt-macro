"""The site's settings, read once from site.toml at the top of the repository.

A domain move is coming, and the address used to be typed in four places that
had to be changed together. Now it is one line in site.toml, and everything
that needs it imports it from here.

  SITE_URL     the public address, always ending in "/"
  GOATCOUNTER  the GoatCounter site code, or "" for no counting
"""

from __future__ import annotations

import pathlib
import re
import tomllib

_PATH = pathlib.Path(__file__).resolve().parent.parent / "site.toml"
_SETTINGS = tomllib.loads(_PATH.read_text(encoding="utf-8"))

SITE_URL = str(_SETTINGS.get("url") or "").strip()
if not re.fullmatch(r"https?://[^\s\"'<>]+", SITE_URL):
    raise SystemExit(f"site.toml: url must be a full address such as https://example.org/, not {SITE_URL!r}")
if not SITE_URL.endswith("/"):
    SITE_URL += "/"

# A site code is a GoatCounter subdomain: letters, digits and hyphens. Anything
# else is refused rather than written into every page.
GOATCOUNTER = str(_SETTINGS.get("goatcounter") or "").strip()
if GOATCOUNTER and not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,62}", GOATCOUNTER):
    raise SystemExit(f"site.toml: goatcounter must be a site code such as \"miqyas\", not {GOATCOUNTER!r}")
