// frontend/src/components/TestModal.jsx
import { useEffect, useMemo, useState } from "react";

export default function TestModal({ open, onClose, task, onGenerate }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]); // [{title, desc, code, checked}]

  // Reset when opening on a different task
  useEffect(() => {
    if (open) {
      setUrl("");
      setError("");
      setSuggestions([]);
    }
  }, [open, task?.id]);

  async function handleGenerate() {
    setError("");
    setLoading(true);
    try {
      if (!url.trim()) throw new Error("Paste a GitHub file URL (…/blob/…/file.py|js)");
      const res = await onGenerate(url.trim()); // calls /api/tests/generate
      if (!res?.ok) throw new Error(res?.error || "Failed to generate");
      const list = (res.tests || []).map((t, i) => ({
        id: `${Date.now()}_${i}`,
        title: t.title || `Test ${i + 1}`,
        desc: t.desc || "",
        code: t.code || "",
        checked: true,
      }));
      setSuggestions(list);
      if (list.length === 0) setError("No tests found for that file. Try a different URL.");
    } catch (e) {
      setError(e.message || String(e));
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }

  async function copySelected() {
    const chosen = suggestions.filter(s => s.checked);
    if (chosen.length === 0) return;
    const blob = chosen
      .map(s => `# ${s.title}\n# ${s.desc}\n${s.code}`)
      .join("\n\n" + "-".repeat(60) + "\n\n");
    await navigator.clipboard.writeText(blob);
    // optional toast:
    alert(`Copied ${chosen.length} test(s) to clipboard`);
  }

  const disabled = loading || !open;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* card */}
      <div className="relative w-[min(960px,90vw)] max-h-[80vh] overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-lg font-semibold">AI Test Suggestions</h3>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-sm"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto" style={{ maxHeight: "68vh" }}>
          <div className="text-sm text-slate-600">
            Task: <span className="font-medium">{task?.title || "(untitled)"}</span>
          </div>

          <div className="flex gap-2">
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2"
              placeholder="Paste a GitHub file URL (e.g. https://github.com/.../blob/main/foo.py)"
            />
            <button
              onClick={handleGenerate}
              disabled={disabled}
              className={`px-4 py-2 rounded-lg text-white ${loading ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"}`}
            >
              {loading ? "Generating…" : "Generate Tests"}
            </button>
          </div>

          {error && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {suggestions.length === 0 && !loading && !error && (
              <div className="text-slate-500 text-sm">
                No suggestions yet.
                <div className="mt-1">
                  Try:{" "}
                  <code className="bg-slate-100 px-1 rounded">
                    https://github.com/CSE-116/ClassExampleCode/blob/master/python_example/GameItem.py
                  </code>
                </div>
              </div>
            )}

            {suggestions.map(s => (
              <label
                key={s.id}
                className="flex items-start gap-3 border rounded-lg p-3 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={s.checked}
                  onChange={e => {
                    const v = e.target.checked;
                    setSuggestions(prev =>
                      prev.map(x => (x.id === s.id ? { ...x, checked: v } : x))
                    );
                  }}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium">{s.title}</div>
                  {s.desc && <div className="text-sm text-slate-600">{s.desc}</div>}
                  {s.code && (
                    <pre className="mt-2 text-xs overflow-x-auto bg-slate-900 text-slate-50 p-3 rounded">
{String(s.code)}
                    </pre>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t">
          <div className="text-xs text-slate-500">
            Demo-friendly: copies tests. You could also auto-PR with GitHub API later.
          </div>
          <button
            onClick={copySelected}
            disabled={disabled || suggestions.filter(s => s.checked).length === 0}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white"
          >
            Copy Selected to Clipboard
          </button>
        </div>
      </div>
    </div>
  );
}
