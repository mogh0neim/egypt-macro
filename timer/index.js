// Minute-precise starter for the two jobs whose timing matters.
//
// GitHub's own schedule is unreliable: a job set for 08:20 UTC has been seen
// starting at 14:30. A Cloudflare scheduled trigger is accurate to the minute,
// so it only does one thing: ask GitHub to start the job NOW. GitHub then does
// the real work (it is the machine CBE's firewall is known to accept).
//
//   11:00 UTC daily  -> mpc-watch   (14:00 Cairo in summer, 13:00 in winter, so
//                       always before CBE's earliest usual 17:00 announcement;
//                       the job exits at once if today is not an MPC day)
//   05:30 UTC daily  -> scrape-daily (07:30 Cairo)
//
// The only secret is GITHUB_TOKEN: a fine-grained token that can do one thing,
// "Actions: read and write" on this one repository.

const REPO = "mogh0neim/egypt-macro";

const JOBS = {
  "0 11 * * *": "mpc-watch.yml",
  "30 5 * * *": "scrape-daily.yml",
};

export default {
  async scheduled(event, env) {
    const workflow = JOBS[event.cron];
    if (!workflow) throw new Error(`no job for schedule ${event.cron}`);
    if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN secret is not set");

    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "miqyas-timer",
        },
        body: JSON.stringify({ ref: "main" }),
      },
    );
    // GitHub answers 204 when it has queued the run.
    if (res.status !== 204) {
      throw new Error(`GitHub refused ${workflow}: ${res.status} ${await res.text()}`);
    }
  },
};
