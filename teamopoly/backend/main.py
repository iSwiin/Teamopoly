# backend/main.py
import os
from typing import Dict, List, Any

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# game/economy helpers
from economy import (
    init_db, seed_demo, get_board,
    create_task, stake_help, claim_help, complete_task,
    offer_trade, accept_trade, draw_chance,
    move_task, reopen_task,
    _conn,  # for /api/users
)

# AI test generator helper
from ai_tests import generate_tests

# ---------- boot ----------
load_dotenv()
init_db()
DEFAULT_PROJECT_ID = seed_demo()

app = FastAPI(title="Teamopoly API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- GitHub client (for generator) ----------
GITHUB_API = "https://api.github.com"
TOKEN = os.getenv("GITHUB_TOKEN", "")
HEADERS = {"Accept": "application/vnd.github+json"} | (
    {"Authorization": f"Bearer {TOKEN}"} if TOKEN else {}
)

# ---------- health ----------
@app.get("/health")
def health():
    return {"ok": True, "project_id": DEFAULT_PROJECT_ID}

# ---------- demo helper ----------
@app.get("/api/demo/project")
def api_demo_project():
    return {"project_id": DEFAULT_PROJECT_ID}

# ---------- users (demo login selector) ----------
@app.get("/api/users")
def api_users():
    c = _conn()
    rows = [dict(r) for r in c.execute("SELECT id, name, avatar FROM users ORDER BY id")]
    c.close()
    return {"users": rows}

# ---------- board ----------
@app.get("/api/board/{project_id}")
def api_board(project_id: str):
    return get_board(project_id)

# ---------- models ----------
class CreateTaskReq(BaseModel):
    project_id: str
    title: str
    owner_id: str
    size: str = "M"     # S | M | L
    eta: str = ""       # display only

class StakeReq(BaseModel):
    task_id: str
    user_id: str
    amount: int

class ClaimReq(BaseModel):
    task_id: str
    helper_id: str

class TradeReq(BaseModel):
    task_id: str
    to_user: str

class MoveTaskReq(BaseModel):
    task_id: str
    to_status: str   # todo | in_progress | help | done

class ReopenReq(BaseModel):
    task_id: str

class ProjectReq(BaseModel):
    project_id: str

class SprintGenReq(BaseModel):
    repo: str  # "owner/repo" or full https://github.com/owner/repo

class TestGenReq(BaseModel):
    url: str   # GitHub file URL (https://github.com/.../blob/.../file.py|js|ts)

# ---------- task create / stake / claim / complete ----------
@app.post("/api/task/create")
def api_create_task(b: CreateTaskReq):
    return create_task(b.project_id, b.title, b.owner_id, b.size, b.eta)

@app.post("/api/task/stake")
def api_stake(b: StakeReq):
    return stake_help(b.task_id, b.user_id, b.amount)

@app.post("/api/task/claim_help")
def api_claim(b: ClaimReq):
    return claim_help(b.task_id, b.helper_id)

@app.post("/api/task/complete")
def api_complete(body: Dict[str, str]):
    return complete_task(body["task_id"])

# ---------- move / reopen (drag-and-drop) ----------
@app.post("/api/task/move")
def api_move(b: MoveTaskReq):
    # frontend sends { task_id, to_status }
    return move_task(b.task_id, b.to_status)

@app.post("/api/task/reopen")
def api_reopen(b: ReopenReq):
    return reopen_task(b.task_id)

# ---------- trading ----------
@app.post("/api/task/offer_trade")
def api_offer_trade(b: TradeReq):
    return offer_trade(b.task_id, b.to_user)

@app.post("/api/task/accept_trade")
def api_accept_trade(b: TradeReq):
    return accept_trade(b.task_id, b.to_user)

# ---------- chance cards ----------
@app.post("/api/chance/draw")
def api_chance(b: ProjectReq):
    return draw_chance(b.project_id)

# ======================================================================
#                     AI Sprint Generator (ghost cards)
# ======================================================================

def _parse_owner_repo(raw: str):
    s = (raw or "").strip()
    if "github.com/" in s:
        s = s.split("github.com/", 1)[1]
    s = s.strip("/")
    parts = s.split("/")
    if len(parts) >= 2:
        return parts[0], parts[1]
    return None, None

@app.post("/api/ai/generate")
async def ai_generate(body: SprintGenReq):
    """
    Given a repo link or 'owner/repo', suggest a few sprint cards.
    Heuristic: read open issues; else return a smart fallback.
    """
    owner, repo = _parse_owner_repo(body.repo or "")

    def fallback():
        return {
            "suggestions": [
                {"title": "Scaffold CI workflow",                "size": "S", "eta": "2025-11-12", "owner": "", "lane": "todo"},
                {"title": "Add unit tests for core utils",       "size": "M", "eta": "2025-11-13", "owner": "", "lane": "in_progress"},
                {"title": "Refactor large PR into smaller ones", "size": "L", "eta": "2025-11-15", "owner": "", "lane": "help"},
            ]
        }

    if not owner or not repo:
        return fallback()

    try:
        async with httpx.AsyncClient(timeout=20, headers=HEADERS) as client:
            issues = (await client.get(
                f"{GITHUB_API}/repos/{owner}/{repo}/issues",
                params={"state": "open", "per_page": 10}
            )).json()
    except Exception:
        issues = []

    suggestions: List[Dict[str, str]] = []
    if isinstance(issues, list) and issues:
        for it in issues:
            title = it.get("title", "Task")
            labels = [(l or {}).get("name", "").lower() for l in (it.get("labels") or [])]
            lane = "todo"
            if any(x in labels for x in ["wip", "in progress"]): lane = "in_progress"
            if any(x in labels for x in ["help", "help wanted", "good first issue"]): lane = "help"

            L = len(title)
            size = "S" if L < 40 else "M" if L < 80 else "L"

            suggestions.append({
                "title": title,
                "size": size,
                "eta": "2025-11-14",
                "owner": "",
                "lane": lane
            })
        return {"suggestions": suggestions}

    return fallback()

# ======================================================================
#                     AI Test Generator (modal on card)
# ======================================================================

@app.post("/api/tests/generate")
async def api_generate_tests(b: TestGenReq):
    """
    Accepts a GitHub 'blob' URL and returns generated test candidates.
    Converts blob URL to raw, fetches code, then builds pytest/Jest stubs.
    """
    url = (b.url or "").strip()
    if not url:
        return {"ok": False, "error": "Missing URL", "tests": []}

    # https://github.com/owner/repo/blob/branch/path.py -> raw content URL
    raw = url
    if "github.com/" in url and "/blob/" in url:
        raw = url.replace("https://github.com/", "https://raw.githubusercontent.com/").replace("/blob/", "/")

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(raw)
        if resp.status_code >= 400:
            return {"ok": False, "error": f"Fetch failed: {resp.status_code}", "tests": []}
        code = resp.text

    language = (
        "python" if url.endswith(".py")
        else "javascript" if any(url.endswith(x) for x in (".js", ".mjs", ".cjs", ".ts"))
        else "text"
    )
    bundle = generate_tests(language, code)
    return {"ok": True, **bundle}

# ======================================================================
#                        Task meta (notes/tags/tests)
# ======================================================================

def _ensure_meta_table():
    c = _conn()
    c.execute("""
      CREATE TABLE IF NOT EXISTS task_meta(
        task_id     TEXT PRIMARY KEY,
        title       TEXT,
        description TEXT,
        tags        TEXT,   -- comma string
        members     TEXT,   -- comma string of user ids
        tests       TEXT    -- JSON: [{id,label,code,checked}]
      )
    """)
    c.commit(); c.close()

_ensure_meta_table()

class TaskMeta(BaseModel):
    task_id: str
    title: str = ""
    description: str = ""
    tags: str = ""        # comma-separated
    members: str = ""     # comma-separated user ids
    tests: List[Dict[str, Any]] = []  # selected/accepted tests to keep

@app.get("/api/task/meta/{task_id}")
def api_get_task_meta(task_id: str):
    c = _conn()
    row = c.execute("SELECT * FROM task_meta WHERE task_id=?", (task_id,)).fetchone()
    c.close()
    if not row:
        return {"task_id": task_id, "title": "", "description": "", "tags": "", "members": "", "tests": []}
    import json
    return {
        "task_id": row["task_id"],
        "title": row["title"] or "",
        "description": row["description"] or "",
        "tags": row["tags"] or "",
        "members": row["members"] or "",
        "tests": json.loads(row["tests"] or "[]"),
    }

@app.post("/api/task/meta/save")
def api_save_task_meta(b: TaskMeta):
    import json
    c = _conn()
    c.execute("""
      INSERT INTO task_meta(task_id,title,description,tags,members,tests)
      VALUES(?,?,?,?,?,?)
      ON CONFLICT(task_id) DO UPDATE SET
        title=excluded.title,
        description=excluded.description,
        tags=excluded.tags,
        members=excluded.members,
        tests=excluded.tests
    """, (b.task_id, b.title, b.description, b.tags, b.members, json.dumps(b.tests)))
    c.commit(); c.close()
    return {"ok": True}

# ======================================================================
#    Minimal stubs for summary/score so optional UI bits don’t 404
# ======================================================================

class RepoReq(BaseModel):
    owner: str
    repo: str

@app.post("/api/summary")
async def summary_stub(body: RepoReq):
    return {
        "repo": f"{body.owner}/{body.repo}",
        "contributors": {
            "alice": {"prs_merged": 2, "reviews_given": 3, "issues_closed": 1, "small_prs": 2, "mega_prs": 0,
                      "coverage_delta": 1, "review_response_hours": 6, "writing": 3, "coding": 8,
                      "reviewing": 5, "planning": 2, "testing": 3}
        },
        "tiles": [{"name": "src", "type": "property"}],
        "suggestions": ["Demo data; connect a real repo for live stats."]
    }

@app.post("/api/score")
async def score_stub(body: Dict[str, Dict]):
    contributors: Dict[str, Dict] = body.get("contributors", {})
    return {"scores": {u: 1.0 for u in contributors.keys()}}
