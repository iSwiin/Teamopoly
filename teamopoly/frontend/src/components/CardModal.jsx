import { useEffect, useMemo, useState } from "react";
import { getUsers, getTaskMeta, saveTaskMeta, generateTests } from "../api";

export default function CardModal({ task, onClose, onSaved }) {
  const [users, setUsers] = useState([]);
  const [title, setTitle] = useState(task?.title || "");
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [members, setMembers] = useState([]);
  const [tests, setTests] = useState([]); // persisted
  const [url, setUrl] = useState("");     // github file
  const [suggestions, setSuggestions] = useState([]); // generated
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const u = await getUsers();
      setUsers(u.users || []);
      const m = await getTaskMeta(task.id);
      const meta = m.meta || {};
      setNotes(meta.notes || "");
      setMembers(meta.members || []);
      setTests(meta.tests || []);
      setTagsInput((meta.tags || []).join(", "));
    })();
  }, [task.id]);

  const tags = useMemo(
    () => tagsInput.split(",").map(t => t.trim()).filter(Boolean),
    [tagsInput]
  );

  async function handleGenerate() {
    if (!url) return;
    setBusy(true);
    try {
      const res = await generateTests(url);
      const list = (res.tests || []).map((t, i) => ({
        title: t.title || `Test ${i+1}`,
        desc: t.desc || "",
        code: t.code || "",
        checked: false,   // checkbox in the card (completion)
        _pick: true       // checkbox in the suggestion list (accept/deny)
      }));
      setSuggestions(list);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  function acceptSelected() {
    const accepted = suggestions.filter(s => s._pick).map(({_pick,...rest}) => rest);
    setTests(prev => [...prev, ...accepted]);
    setSuggestions([]); // clear
  }

  async function handleSave() {
    await saveTaskMeta({
      task_id: task.id,
      title,
      notes,
      tags,
      members,
      tests
    });
    onSaved?.();
    onClose?.();
  }

  function toggleTestChecked(idx, value) {
    setTests(prev => prev.map((t,i) => i===idx ? {...t, checked:value} : t));
  }

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}/>
      <div className="absolute left-1/2 top-10 -translate-x-1/2 w-[min(1100px,96vw)] rounded-xl bg-white shadow-2xl">
        <div className="p-5 border-b flex items-center gap-3">
          <input
            value={title}
            onChange={e=>setTitle(e.target.value)}
            className="flex-1 text-xl font-semibold border rounded px-3 py-2"
          />
          <button onClick={handleSave} className="px-3 py-2 rounded bg-emerald-600 text-white">Save</button>
          <button onClick={onClose} className="px-3 py-2 rounded bg-slate-200">Close</button>
        </div>

        <div className="grid lg:grid-cols-[2fr_1fr] gap-6 p-5">
          {/* Left: Description/Notes + Tests */}
          <div className="space-y-6">
            {/* Notes */}
            <section>
              <div className="text-sm font-semibold mb-2">Description / Notes</div>
              <textarea
                value={notes}
                onChange={e=>setNotes(e.target.value)}
                className="w-full min-h-[180px] border rounded px-3 py-2"
                placeholder="Write acceptance criteria, handy links, etc."
              />
            </section>

            {/* Tests (persisted) */}
            <section>
              <div className="text-sm font-semibold mb-2">Tests</div>
              {tests.length === 0 && (
                <div className="text-slate-500 text-sm">No tests yet — generate some on the right, or paste your own.</div>
              )}
              <ul className="space-y-2">
                {tests.map((t, i) => (
                  <li key={i} className="border rounded p-3">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={!!t.checked}
                        onChange={e=>toggleTestChecked(i, e.target.checked)}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium">{t.title}</div>
                        {t.desc && <div className="text-xs text-slate-600">{t.desc}</div>}
                        {t.code && (
                          <pre className="mt-2 text-xs bg-slate-50 p-2 rounded overflow-x-auto">
{t.code}
                          </pre>
                        )}
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Right: Tags / Members / AI Test generator */}
          <div className="space-y-6">
            {/* Members */}
            <section>
              <div className="text-sm font-semibold mb-2">Members</div>
              <div className="flex flex-wrap gap-2">
                {users.map(u => {
                  const sel = members.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() =>
                        setMembers(m => sel ? m.filter(x=>x!==u.id) : [...m, u.id])
                      }
                      className={`px-3 py-1 rounded-full text-sm border ${sel ? "bg-emerald-600 text-white" : "bg-white"}`}
                    >
                      @{u.id}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Tags */}
            <section>
              <div className="text-sm font-semibold mb-2">Tags</div>
              <input
                value={tagsInput}
                onChange={e=>setTagsInput(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="comma, separated, tags"
              />
              {tags.length>0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {tags.map(t => (
                    <span key={t} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs">#{t}</span>
                  ))}
                </div>
              )}
            </section>

            {/* AI generator */}
            <section>
              <div className="text-sm font-semibold mb-2">AI Test Suggestions</div>
              <input
                value={url}
                onChange={e=>setUrl(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="Paste a GitHub 'blob' URL (e.g. https://github.com/.../blob/main/foo.py)"
              />
              <div className="mt-2 flex gap-2">
                <button onClick={handleGenerate} disabled={busy} className="px-3 py-2 rounded bg-blue-600 text-white">
                  {busy ? "Generating…" : "Generate Tests"}
                </button>
                <button onClick={acceptSelected} disabled={suggestions.length===0} className="px-3 py-2 rounded bg-emerald-600 text-white">
                  Accept Selected
                </button>
              </div>

              {/* Suggestions list */}
              {suggestions.length>0 && (
                <ul className="mt-3 space-y-2 max-h-64 overflow-auto pr-1">
                  {suggestions.map((s, i) => (
                    <li key={i} className="border rounded p-3">
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={!!s._pick}
                          onChange={e=>{
                            const v = e.target.checked;
                            setSuggestions(prev => prev.map((x,j)=> j===i ? {...x, _pick:v} : x));
                          }}
                          className="mt-1"
                        />
                        <div>
                          <div className="font-medium">{s.title}</div>
                          {s.desc && <div className="text-xs text-slate-600">{s.desc}</div>}
                          {s.code && (
                            <pre className="mt-2 text-xs bg-slate-50 p-2 rounded overflow-x-auto">
{s.code}
                            </pre>
                          )}
                        </div>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
