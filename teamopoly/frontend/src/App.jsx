import { useEffect, useState } from "react";
import GameBoard from "./components/GameBoard";
import AuthBar from "./components/AuthBar";
import { getDemoProject } from "./api";

export default function App() {
  const [projectId, setProjectId] = useState(null);
  const [currentUser, setCurrentUser] = useState(
    () => localStorage.getItem("teamopoly_user") || "alice"
  );

  // fetch demo project id once
  useEffect(() => {
    (async () => {
      try {
        const p = await getDemoProject();
        setProjectId(p?.project_id || "hack-demo");
      } catch {
        setProjectId("hack-demo");
      }
    })();
  }, []);

  // keep user selection persistent and in sync across tabs
  useEffect(() => {
    localStorage.setItem("teamopoly_user", currentUser);
  }, [currentUser]);
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "teamopoly_user" && e.newValue) {
        setCurrentUser(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!projectId) {
    return (
      <div className="min-h-screen grid place-items-center text-slate-600">
        Loading game board…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-gradient-to-r from-emerald-400 to-rose-400 text-white">
        <div className="mx-auto w-full max-w-screen-2xl px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Teamopoly</h1>
          <AuthBar currentUser={currentUser} setCurrentUser={setCurrentUser} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-2xl px-6 py-4">
        {/* key forces GameBoard to re-init when user switches */}
        <GameBoard key={currentUser} projectId={projectId} currentUser={currentUser} />
      </main>
    </div>
  );
}
