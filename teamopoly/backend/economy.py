# backend/economy.py
import sqlite3, os, json, time

DB_PATH = os.path.join(os.path.dirname(__file__), "teamopoly_demo.db")

DDL = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, avatar TEXT);
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT);
CREATE TABLE IF NOT EXISTS balances (user_id TEXT, project_id TEXT, tokens INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, project_id));
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT,
  owner_id TEXT,
  status TEXT,         -- todo | in_progress | help | done
  size TEXT,           -- S | M | L
  tokens_staked INTEGER DEFAULT 0,
  eta TEXT,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS txns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT, task_id TEXT, project_id TEXT,
  type TEXT, amount INTEGER, at INTEGER
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT, kind TEXT, payload TEXT, at INTEGER
);
-- NEW: per-task rich metadata persisted from the modal
CREATE TABLE IF NOT EXISTS task_meta (
  task_id TEXT PRIMARY KEY,
  notes TEXT DEFAULT '',
  tags TEXT DEFAULT '',          -- comma-separated
  members TEXT DEFAULT '',       -- comma-separated user ids
  tests_json TEXT DEFAULT '[]'   -- JSON array of {title,desc,code,checked}
);
"""

LANES = {"todo", "in_progress", "help", "done"}

def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c

def init_db():
    c = _conn()
    for stmt in DDL.strip().split(";\n"):
        if stmt.strip():
            c.execute(stmt)
    c.commit()
    c.close()

def seed_demo():
    c = _conn()
    # seed users
    users = [
        ("alice", "Alice", "https://github.com/alice.png"),
        ("bob", "Bob", "https://github.com/bob.png"),
        ("cara", "Cara", "https://github.com/cara.png"),
    ]
    for u in users:
        c.execute("INSERT OR IGNORE INTO users(id,name,avatar) VALUES(?,?,?)", u)
    # project
    pid = "hack-demo"
    c.execute("INSERT OR IGNORE INTO projects(id,name) VALUES(?,?)", (pid, "Hack Demo"))
    for uid in [u[0] for u in users]:
        c.execute("INSERT OR IGNORE INTO balances(user_id,project_id,tokens) VALUES(?,?,?)", (uid,pid,10))
    # starter tasks
    now = int(time.time())
    tasks = [
        ("t1", pid, "Implement Login UI", "alice", "todo", "M", 0, "2025-11-10", now),
        ("t2", pid, "Wire Auth API", "bob", "in_progress", "L", 0, "2025-11-10", now),
        ("t3", pid, "Write README", "cara", "help", "S", 2, "2025-11-09", now),
        ("t4", pid, "Unit tests for auth", "alice", "done", "M", 0, "2025-11-08", now),
    ]
    for t in tasks:
        c.execute("""INSERT OR IGNORE INTO tasks(id,project_id,title,owner_id,status,size,tokens_staked,eta,created_at)
                     VALUES(?,?,?,?,?,?,?,?,?)""", t)
    c.commit(); c.close()
    return pid

# ---------- Task Meta helpers (notes/tags/members/tests) ----------

def get_task_meta(task_id: str):
    c = _conn()
    row = c.execute("""
        SELECT COALESCE(notes,'')   AS notes,
               COALESCE(tags,'')    AS tags,
               COALESCE(members,'') AS members,
               COALESCE(tests_json,'[]') AS tests_json
        FROM task_meta WHERE task_id=?
    """, (task_id,)).fetchone()
    if not row:
        c.close()
        return {"notes": "", "tags": [], "members": [], "tests": []}
    out = {
        "notes": row["notes"],
        "tags": [t for t in (row["tags"] or "").split(",") if t.strip()],
        "members": [m for m in (row["members"] or "").split(",") if m.strip()],
        "tests": json.loads(row["tests_json"] or "[]"),
    }
    c.close()
    return out

def save_task_meta(task_id: str, title, notes, tags, members, tests):
    c = _conn()
    if title is not None:
        c.execute("UPDATE tasks SET title=? WHERE id=?", (title, task_id))
    c.execute("""
      INSERT INTO task_meta(task_id,notes,tags,members,tests_json)
      VALUES(?,?,?,?,?)
      ON CONFLICT(task_id) DO UPDATE SET
        notes=excluded.notes,
        tags=excluded.tags,
        members=excluded.members,
        tests_json=excluded.tests_json
    """, (task_id, notes or "", ",".join(tags or []), ",".join(members or []), json.dumps(tests or [])))
    c.commit(); c.close()
    return {"ok": True}

def _with_meta(task_row: dict):
    """Attach light meta for board list (tests_count, tags)."""
    c = _conn()
    m = c.execute("SELECT tests_json, tags FROM task_meta WHERE task_id=?", (task_row["id"],)).fetchone()
    c.close()
    if m:
        try:
            tests = json.loads(m["tests_json"] or "[]")
        except Exception:
            tests = []
        task_row["tests_count"] = len(tests)
        task_row["tags"] = [t for t in (m["tags"] or "").split(",") if t]
    else:
        task_row["tests_count"] = 0
        task_row["tags"] = []
    return task_row

# ---------- Board / economy ----------

def get_board(project_id):
    c=_conn()
    cols = {"todo":[], "in_progress":[], "help":[], "done":[]}
    for row in c.execute("SELECT * FROM tasks WHERE project_id=? ORDER BY created_at DESC", (project_id,)):
        d = dict(row)
        d = _with_meta(d)  # enrich with tests count & tags
        cols[d["status"]].append(d)
    balances = {}
    for row in c.execute("SELECT * FROM balances WHERE project_id=?", (project_id,)):
        balances[row["user_id"]] = row["tokens"]
    # fairness: simple normalized score
    users = [r["id"] for r in c.execute("SELECT id FROM users")]
    stats = {u: {"completed":0,"claims":0,"on_time":0,"total":0} for u in users}
    for row in c.execute("SELECT * FROM txns WHERE project_id=?", (project_id,)):
        u = row["user_id"] or ""
        if row["type"]=="COMPLETE": stats[u]["completed"]+=1
        if row["type"]=="CLAIM": stats[u]["claims"]+=1
    # crude ring score
    fi = {}
    def norm(v, vs): 
        mn=min(vs+[0]); mx=max(vs+[1])
        return 0 if mx==mn else (v-mn)/(mx-mn)
    compvs=[v["completed"] for v in stats.values()]
    claimvs=[v["claims"] for v in stats.values()]
    for u,s in stats.items():
        fi[u] = round(100*(0.4*norm(s["completed"],compvs)+0.4*norm(s["claims"],claimvs)+0.2*0.5),1)
    # events
    ev=[dict(r) for r in c.execute("SELECT * FROM events WHERE project_id=? ORDER BY at DESC LIMIT 10",(project_id,))]
    c.close()
    return {"columns": cols, "balances": balances, "fairness": fi, "events": ev}

def _mint(c, user_id, project_id, amount, task_id=None, typ="MINT"):
    c.execute("UPDATE balances SET tokens=tokens+? WHERE user_id=? AND project_id=?", (amount,user_id,project_id))
    c.execute("INSERT INTO txns(user_id,task_id,project_id,type,amount,at) VALUES(?,?,?,?,?,?)",
              (user_id, task_id, project_id, typ, amount, int(time.time())))

def create_task(project_id, title, owner_id, size, eta):
    size = size.upper()
    mint = {"S":3, "M":5, "L":8}.get(size,3)
    c=_conn()
    tid=f"t{int(time.time()*1000)%100000000}"
    c.execute("""INSERT INTO tasks(id,project_id,title,owner_id,status,size,tokens_staked,eta,created_at)
                 VALUES(?,?,?,?,?,?,0,?,?)""", (tid,project_id,title,owner_id,"todo",size,eta,int(time.time())))
    _mint(c, owner_id, project_id, mint, tid, "MINT")
    c.commit(); c.close()
    return {"id": tid, "mint": mint}

def stake_help(task_id, user_id, amount):
    c=_conn()
    row = c.execute("SELECT project_id,tokens_staked FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not row: 
        c.close(); return {"ok":False,"error":"task not found"}
    pid=row["project_id"]; staked=row["tokens_staked"]
    bal = c.execute("SELECT tokens FROM balances WHERE user_id=? AND project_id=?", (user_id,pid)).fetchone()
    if not bal or bal["tokens"]<amount: 
        c.close(); return {"ok":False,"error":"insufficient tokens"}
    c.execute("UPDATE balances SET tokens=tokens-? WHERE user_id=? AND project_id=?", (amount,user_id,pid))
    c.execute("UPDATE tasks SET tokens_staked=?, status='help' WHERE id=?", (staked+amount, task_id))
    c.execute("INSERT INTO txns(user_id,task_id,project_id,type,amount,at) VALUES(?,?,?,?,?,?)",
              (user_id, task_id, pid, "STAKE", -amount, int(time.time())))
    c.commit(); c.close()
    return {"ok":True}

def claim_help(task_id, helper_id):
    c=_conn()
    row = c.execute("SELECT project_id,tokens_staked FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not row: 
        c.close(); return {"ok":False,"error":"task not found"}
    pid=row["project_id"]; escrow=row["tokens_staked"]
    c.execute("UPDATE tasks SET tokens_staked=0, status='in_progress' WHERE id=?", (task_id,))
    _mint(c, helper_id, pid, escrow, task_id, "CLAIM")
    c.commit(); c.close()
    return {"ok":True,"payout":escrow}

def complete_task(task_id):
    c=_conn()
    row=c.execute("SELECT owner_id,project_id,size FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not row: 
        c.close(); return {"ok":False,"error":"task not found"}
    owner=row["owner_id"]; pid=row["project_id"]; size=row["size"]
    bonus={"S":2,"M":4,"L":6}.get(size,2)
    c.execute("UPDATE tasks SET status='done' WHERE id=?", (task_id,))
    _mint(c, owner, pid, bonus, task_id, "COMPLETE")
    c.commit(); c.close()
    return {"ok":True,"bonus":bonus}

def offer_trade(task_id, to_user):
    c=_conn()
    row=c.execute("SELECT project_id FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not row: 
        c.close(); return {"ok":False,"error":"task not found"}
    pid=row["project_id"]
    payload=json.dumps({"task_id":task_id,"to_user":to_user})
    c.execute("INSERT INTO events(project_id,kind,payload,at) VALUES(?,?,?,?)", (pid,"OFFER_TRADE",payload,int(time.time())))
    c.commit(); c.close()
    return {"ok":True}

def accept_trade(task_id, to_user):
    c=_conn()
    row=c.execute("SELECT project_id FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not row:
        c.close(); return {"ok":False,"error":"task not found"}
    pid=row["project_id"]
    c.execute("UPDATE tasks SET owner_id=? WHERE id=?", (to_user, task_id))
    _mint(c, to_user, pid, 2, task_id, "BONUS")
    c.commit(); c.close()
    return {"ok":True,"bonus":2}

def draw_chance(project_id):
    import random
    cards = [
        {"title":"Study Buddy", "effect":"+50% token payout for CLAIMs next 1h", "kind":"BUFF_CLAIM_50"},
        {"title":"Late Fee", "effect":"-2 tokens if ETA missed today", "kind":"PENALTY_ETA_2"},
        {"title":"Bug Bounty", "effect":"+3 tokens for first completed test task today", "kind":"BOUNTY_TEST_3"},
        {"title":"Coffee Boost", "effect":"+1 token on next task create", "kind":"BOOST_CREATE_1"},
    ]
    card = random.choice(cards)
    c=_conn()
    c.execute("INSERT INTO events(project_id,kind,payload,at) VALUES(?,?,?,?)",
              (project_id,"CHANCE", json.dumps(card), int(time.time())))
    c.commit(); c.close()
    return card

# -------------------------------------------------------------------
# NEW: move / reopen helpers used by /api/task/move and /api/task/reopen
# -------------------------------------------------------------------

def move_task(task_id: str, to_status: str):
    """Move a task to a different lane. No token transfer."""
    if to_status not in LANES:
        return {"ok": False, "error": f"invalid lane '{to_status}'"}
    c = _conn()
    row = c.execute("SELECT id FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not row:
        c.close(); return {"ok": False, "error": "task not found"}
    c.execute("UPDATE tasks SET status=? WHERE id=?", (to_status, task_id))
    c.commit(); c.close()
    return {"ok": True, "task_id": task_id, "lane": to_status}

def reopen_task(task_id: str):
    """
    Undo a completion: move from 'done' to 'in_progress' and reverse the COMPLETE payout.
    Uses the same bonus mapping as complete_task (S=2, M=4, L=6).
    """
    c = _conn()
    t = c.execute(
        "SELECT owner_id, project_id, size, status FROM tasks WHERE id=?",
        (task_id,)
    ).fetchone()
    if not t:
        c.close(); return {"ok": False, "error": "task not found"}

    owner, pid, size, status = t["owner_id"], t["project_id"], t["size"], t["status"]
    c.execute("UPDATE tasks SET status='in_progress' WHERE id=?", (task_id,))

    reversed_amt = 0
    if status == "done":
        bonus = {"S":2, "M":4, "L":6}.get((size or "M").upper(), 2)
        reversed_amt = bonus
        bal = c.execute("SELECT tokens FROM balances WHERE user_id=? AND project_id=?", (owner, pid)).fetchone()
        if bal is None:
            c.execute("INSERT INTO balances(user_id,project_id,tokens) VALUES(?,?,?)", (owner, pid, 0))
        c.execute("UPDATE balances SET tokens=tokens-? WHERE user_id=? AND project_id=?", (bonus, owner, pid))
        c.execute("INSERT INTO txns(user_id,task_id,project_id,type,amount,at) VALUES(?,?,?,?,?,?)",
                  (owner, task_id, pid, "REOPEN", -bonus, int(time.time())))
    c.commit(); c.close()
    return {"ok": True, "task_id": task_id, "lane": "in_progress", "reversed": reversed_amt}
