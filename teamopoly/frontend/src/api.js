// frontend/src/api.js

// ---------- Base URL ----------
// Dev hits FastAPI locally; prod uses same origin (no double /api/api)
export const API = import.meta.env.DEV ? "http://127.0.0.1:8000" : "";

// Small helper with better errors
async function jfetch(path, init = {}) {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${path} → ${text}`);
  }
  return res.json();
}

/* ------------------------------------------------------------------
   GitHub / Fairness dashboard
------------------------------------------------------------------ */

export async function fetchSummary(owner, repo) {
  return jfetch("/api/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, repo }),
  });
}

export async function fetchScores(contributors, weights) {
  return jfetch("/api/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contributors, weights }),
  });
}

/* ------------------------------------------------------------------
   Scrum board (issues/PRs)
------------------------------------------------------------------ */

export async function fetchScrumBoard(owner, repo) {
  return jfetch("/api/scrum", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, repo }),
  });
}

// Back-compat alias if any code still imports fetchScrum
export { fetchScrumBoard as fetchScrum };

export async function moveCard(owner, repo, number, to_column) {
  return jfetch("/api/scrum/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, repo, number, to_column }),
  });
}

export async function tradeTask(owner, repo, number, to_user) {
  return jfetch("/api/scrum/trade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, repo, number, to_user }),
  });
}

export async function fetchContribStats(owner, repo) {
  return jfetch("/api/stats/contributors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, repo }),
  });
}

/* ------------------------------------------------------------------
   Teamopoly (Monopoly x Trello game board)
------------------------------------------------------------------ */

export const getDemoProject = async () =>
  jfetch("/api/demo/project");

export const getBoard = async (projectId) =>
  jfetch(`/api/board/${projectId}`);

export const createTask = async (payload) =>
  jfetch("/api/task/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const stakeTask = async (payload) =>
  jfetch("/api/task/stake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const claimHelp = async (payload) =>
  jfetch("/api/task/claim_help", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const completeTask = async (task_id) =>
  jfetch("/api/task/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id }),
  });

export const offerTrade = async (payload) =>
  jfetch("/api/task/offer_trade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const acceptTrade = async (payload) =>
  jfetch("/api/task/accept_trade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

export const drawChance = async (project_id) =>
  jfetch("/api/chance/draw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id }),
  });

// Keep older import sites working (some code used tradeCard)
export { tradeTask as tradeCard };

/* ---------- Lane moves + reopen (undo payout) ---------- */

export const moveTask = async (payload) =>
  jfetch("/api/task/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Backend expects { task_id, to_status: "todo"|"in_progress"|"help"|"done" }
    body: JSON.stringify(payload),
  });

export const reopenTask = async (task_id) =>
  jfetch("/api/task/reopen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id }),
  });

/* ---------- AI Sprint Generator ---------- */

export const generateSprint = async (repo) =>
  jfetch("/api/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo }),
  });

/* ---------- Demo users (login switcher) ---------- */

export const getUsers = async () => jfetch("/api/users");

/* ---------- AI Test Suggestions (GitHub file URL -> tests) ---------- */

export async function generateTests(url) {
  return jfetch("/api/tests/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

export const getTaskMeta = (task_id) =>
  jfetch(`/api/task/meta/${task_id}`);

export const saveTaskMeta = (payload) =>
  jfetch("/api/task/meta/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
