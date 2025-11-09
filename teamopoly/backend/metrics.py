from typing import Dict, List
import httpx
import os

GITHUB_API = "https://api.github.com"
TOKEN = os.getenv("GITHUB_TOKEN", "")

HEADERS = {"Accept": "application/vnd.github+json"} | (
    {"Authorization": f"Bearer {TOKEN}"} if TOKEN else {}
)

# Simple, conservative categorization by filepath keywords
AREAS = {
    "writing": ["/docs", ".md"],
    "coding": ["/src", ".py", ".js", ".ts", ".go", ".java", ".php", ".cpp"],
    "reviewing": ["review"],
    "planning": ["/plans", "/design", "/spec"],
    "testing": ["/test", "/tests", ".spec.", ".test."],
}

def _as_list(x):
    return x if isinstance(x, list) else []

def _as_dict(x):
    return x if isinstance(x, dict) else {}

async def fetch_repo_summary(owner: str, repo: str, since: str | None = None, until: str | None = None) -> Dict:
    """Summarize PRs, reviews, and rough activity areas per contributor."""
    async with httpx.AsyncClient(timeout=20) as client:
        prs_resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/pulls",
            params={"state": "all", "per_page": 20},
            headers=HEADERS,
        )
        prs = _as_list(prs_resp.json())  # if it's an error dict/string, this becomes []

        contributions: Dict[str, Dict] = {}
        for pr in prs:
            pr = _as_dict(pr)
            pr_url = pr.get("url")
            if not pr_url:
                continue

            user = _as_dict(pr.get("user")).get("login") or "unknown"
            merged = bool(pr.get("merged_at"))

            files = _as_list((await client.get(pr_url + "/files", headers=HEADERS)).json())
            area_counts = {k: 0 for k in AREAS}
            for f in files:
                f = _as_dict(f)
                fp = f.get("filename", "")
                for area, keys in AREAS.items():
                    if any(k in fp for k in keys):
                        area_counts[area] += 1

            reviews = _as_list((await client.get(pr_url + "/reviews", headers=HEADERS)).json())
            reviews_given = len(reviews)

            d = contributions.setdefault(
                user,
                {
                    "prs_opened": 0,
                    "prs_merged": 0,
                    "reviews_given": 0,
                    "issues_closed": 0,
                    "small_prs": 0,
                    "mega_prs": 0,
                    "coverage_delta": 0,
                    "review_response_hours": 0.0,
                    "writing": 0,
                    "coding": 0,
                    "reviewing": 0,
                    "planning": 0,
                    "testing": 0,
                },
            )
            d["prs_opened"] += 1
            if merged:
                d["prs_merged"] += 1
            d["reviews_given"] += reviews_given

            nfiles = len(files)
            if nfiles <= 5:
                d["small_prs"] += 1
            if nfiles >= 50:
                d["mega_prs"] += 1

            for area, v in area_counts.items():
                d[area] += v

        return {"repo": f"{owner}/{repo}", "contributors": contributions}
