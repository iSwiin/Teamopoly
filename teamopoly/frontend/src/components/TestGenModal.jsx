import { useState } from "react";
import { generateTests } from "../api";

export default function TestGenModal({ open, onClose, taskTitle }) {
  const [url, setUrl] = useState("");
  const [bundle, setBundle] = useState(null);
  const [selected, setSelected] = useState({}); // id -> bool
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  async function onGenerate() {
    setBusy(true);
    try {
      const res = await generateTests(url);
      setBundle(res);
      setSelected(Object.fromEntries((res.tests || []).map((t, i) => [i, true])));
    } catch (e) {
      alert(e.message || "Failed to generate");
    } finally {
      setBusy(false);
    }
  }

  function selectedCode() {
    if (!bundle?.tests) return "";
    const picks = bundle.tests
      .map((t, i) => (selected[i] ? t.code : null))
      .filter(Boolean)
      .join("\n\n");
    const header = bundle.language === "python"
      ? "import pytest\n# from <module> import *\n\n"
      : "// import { ... } from './module'\n\n";
    return header + picks;
  }

  function copySelected() {
    navigator.clipboard.writeText(selectedCode());
    alert("Copied selected tests to clipboard.");
  }

  function downloadSelected() {
    const code = selectedCode() || bundle?.full || "";
    const name = bundle?.file_name || "tests.txt";
    const blob = new Blob([code], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-lg font-semibold">Generate Tests</h3>
          <span className="text-slate-500">for <b>{taskTitle}</b></span>
          <button onClick={onClose} className="ml-auto px-2 py-1 rounded bg-slate-200 hover:bg-slate-300">Close</button>
        </div>

        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 border rounded px-3 py-2"
            placeholder="GitHub file URL (https://github.com/.../blob/.../file.py)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            onClick={onGenerate}
            disabled={busy || !url}
            className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            {busy ? "Generating..." : "Generate"}
          </button>
        </div>

        {!bundle && (
          <p className="text-sm text-slate-600">
            Paste a direct file link from GitHub. We’ll fetch it and propose unit-test stubs (pytest / Jest).
          </p>
        )}

        {bundle && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border rounded p-2">
              <div className="text-sm font-medium mb-2">Suggested tests</div>
              <div className="flex flex-col gap-2 max-h-72 overflow-auto pr-1">
                {bundle.tests?.length ? bundle.tests.map((t, i) => (
                  <label key={i} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={!!selected[i]}
                      onChange={(e) => setSelected(s => ({ ...s, [i]: e.target.checked }))}
                    />
                    <pre className="text-xs bg-slate-50 p-2 rounded overflow-x-auto whitespace-pre-wrap">{t.code}</pre>
                  </label>
                )) : <div className="text-sm text-slate-500">No functions detected.</div>}
              </div>
            </div>

            <div className="border rounded p-2">
              <div className="text-sm font-medium mb-2">Preview</div>
              <pre className="text-xs bg-slate-50 p-2 rounded max-h-72 overflow-auto whitespace-pre-wrap">
                {selectedCode()}
              </pre>
              <div className="mt-2 flex gap-2">
                <button onClick={copySelected} className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white">Copy</button>
                <button onClick={downloadSelected} className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white">Download</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
