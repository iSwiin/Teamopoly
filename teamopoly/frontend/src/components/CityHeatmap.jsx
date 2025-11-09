// frontend/src/components/CityHeatmap.jsx
import { useMemo, useState } from "react"

/**
 * Collaboration Heatmap (Monopoly-board vibes)
 * - Board edges = lanes: top=To-Do, right=In-Progress, bottom=Help, left=Done
 * - Center = city skyline per teammate (buildings grow with tokens / completions)
 * - Bridges = visualized "help" demand (owner → Help Pool)
 *
 * Props:
 *   board: { columns: {todo,in_progress,help,done}, balances, events, fairness }
 */
export default function CityHeatmap({ board }) {
  const [show, setShow] = useState(true)

  const lanes = board?.columns || { todo: [], in_progress: [], help: [], done: [] }
  const balances = board?.balances || {}
  const fairness = board?.fairness || {}

  // derive user list (ordered for consistent layout)
  const users = useMemo(() => {
    const set = new Set(Object.keys(balances))
    // also collect owners from tasks just in case
    for (const col of Object.values(lanes)) {
      for (const t of col) if (t.owner_id) set.add(t.owner_id)
    }
    return Array.from(set).sort()
  }, [balances, lanes])

  // completions per user (done lane)
  const doneCounts = useMemo(() => {
    const c = {}
    for (const t of lanes.done || []) {
      const u = t.owner_id || t.owner || "unknown"
      c[u] = (c[u] || 0) + 1
    }
    return c
  }, [lanes])

  // building height driver: tokens + done count
  const userStats = useMemo(() => {
    return users.map(u => {
      const tokens = Number(balances[u] || 0)
      const completed = Number(doneCounts[u] || 0)
      const score = tokens + completed * 2
      // normalize to pixels
      const h = clamp(mapRange(score, 0, maxScore(balances, doneCounts), 24, 140), 24, 140)
      const fair = Number(fairness?.[u] || 50) // 0..100
      return { user: u, tokens, completed, height: h, fair }
    })
  }, [users, balances, doneCounts, fairness])

  // help “bridges”: N lines from owner → Help Pool for each card in help
  const helpEdges = useMemo(() => {
    const edges = []
    for (const t of lanes.help || []) {
      const owner = t.owner_id || t.owner || "unknown"
      edges.push({ from: owner, weight: 1 })
    }
    return edges
  }, [lanes])

  return (
    <section className="w-full rounded-2xl border bg-white p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Collaboration Heatmap</h3>
        <button
          onClick={() => setShow(s => !s)}
          className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>

      {show && (
        <div className="relative w-full">
          {/* Outer frame */}
          <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden bg-gradient-to-br from-emerald-50 via-rose-50 to-sky-50 border">

            {/* Monopoly-style edge lanes */}
            <EdgeLane side="top"    title="To-Do"        count={(lanes.todo||[]).length}        tone="amber" />
            <EdgeLane side="right"  title="In-Progress"  count={(lanes.in_progress||[]).length} tone="emerald" />
            <EdgeLane side="bottom" title="Help"         count={(lanes.help||[]).length}        tone="sky" />
            <EdgeLane side="left"   title="Done"         count={(lanes.done||[]).length}        tone="violet" />

            {/* Center city */}
            <svg className="absolute inset-10 w-[calc(100%-5rem)] h-[calc(100%-5rem)]">
              {/* Help Pool node */}
              <defs>
                <linearGradient id="pool" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopOpacity="1" stopColor="#38bdf8" />
                  <stop offset="100%" stopOpacity="1" stopColor="#0ea5e9" />
                </linearGradient>
              </defs>

              {/* Bridges (owner → help pool) */}
              {helpEdges.map((e, i) => {
                const from = polarUser(users, e.from, svgCenter(this), 140, users.length)
                const to = svgCenter(this)
                const path = cubicPath(from.x, from.y, to.x, to.y)
                return (
                  <path key={i} d={path}
                    fill="none"
                    stroke="#0ea5e9"
                    strokeOpacity="0.45"
                    strokeWidth={2 + Math.min(4, e.weight)}
                    strokeDasharray="6 6">
                  </path>
                )
              })}

              {/* Pool circle */}
              <circle cx="50%" cy="50%" r="36" fill="url(#pool)" opacity="0.25" />
              <circle cx="50%" cy="50%" r="30" fill="url(#pool)" />
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
                    fontSize="12" fill="white" style={{ fontWeight: 700 }}>
                Help Pool
              </text>

              {/* User “districts” laid around a ring */}
              {userStats.map((s, idx) => {
                const p = polarUser(users, s.user, svgCenter(this), 160, users.length)
                const barW = 22
                const x = p.x - barW/2
                const y = p.y - s.height
                const fairHue = Math.round(mapRange(s.fair, 0, 100, 0, 130)) // red->green-ish
                const fill = `hsl(${fairHue} 65% 45%)`
                return (
                  <g key={s.user}>
                    {/* stem */}
                    <rect x={x+barW/2 - 2} y={p.y - 8} width={4} height={8} rx={2} fill="#94a3b8" />
                    {/* building */}
                    <rect x={x} y={y} width={barW} height={s.height} rx={6} fill={fill} opacity="0.9" />
                    {/* roof accent */}
                    <rect x={x+3} y={y+6} width={barW-6} height={4} rx={2} fill="white" opacity="0.35" />
                    {/* name tag */}
                    <text x={p.x} y={p.y + 14} textAnchor="middle" fontSize="11" fill="#0f172a">@{s.user}</text>
                    {/* stats */}
                    <text x={p.x} y={p.y + 28} textAnchor="middle" fontSize="10" fill="#475569">
                      {s.tokens}🪙 · {s.completed}✓
                    </text>
                  </g>
                )
              })}
            </svg>

            {/* Tiny city grid background (purely decorative) */}
            <div className="absolute inset-10 pointer-events-none opacity-20"
                 style={{ backgroundImage: 'linear-gradient(#00000011 1px, transparent 1px), linear-gradient(90deg,#00000011 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
          </div>
        </div>
      )}
    </section>
  )
}

function EdgeLane({ side, title, count, tone }) {
  const common = "absolute flex items-center justify-center text-xs font-semibold text-slate-700"
  const toneBg = {
    amber: "bg-amber-100 border-amber-300",
    emerald: "bg-emerald-100 border-emerald-300",
    sky: "bg-sky-100 border-sky-300",
    violet: "bg-violet-100 border-violet-300",
  }[tone] || "bg-slate-100 border-slate-300"

  const pos = {
    top:    "top-0 left-0 right-0 h-10 border-b",
    right:  "top-0 right-0 bottom-0 w-10 border-l rotate-90 origin-right",
    bottom: "bottom-0 left-0 right-0 h-10 border-t",
    left:   "top-0 left-0 bottom-0 w-10 border-r -rotate-90 origin-left",
  }[side]

  return (
    <div className={`${common} ${toneBg} ${pos}`}>
      <span className="px-2 py-0.5 rounded bg-white/60 border text-[11px]">
        {title}: <b>{count}</b>
      </span>
    </div>
  )
}

/* ---------------- helpers ---------------- */

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)) }
function mapRange(v, inMin, inMax, outMin, outMax){
  if (inMax === inMin) return (outMin + outMax)/2
  return outMin + (v - inMin) * (outMax - outMin) / (inMax - inMin)
}
function maxScore(balances, doneCounts){
  const u = new Set([...Object.keys(balances || {}), ...Object.keys(doneCounts || {})])
  let m = 0
  u.forEach(k => { m = Math.max(m, Number(balances[k]||0) + 2*Number(doneCounts[k]||0)) })
  return m || 10
}
function svgCenter(ctx){ return { x: 0.5*ctx?.width || 0.5*800, y: 0.5*ctx?.height || 0.5*400 } }
// Position a user around a circle
function polarUser(users, u, center, radius, n){
  const idx = Math.max(0, users.indexOf(u))
  const angle = (idx / Math.max(1,n)) * Math.PI * 2 - Math.PI/2
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) }
}
function cubicPath(x1,y1,x2,y2){
  const cx1 = x1 + (x2-x1)*0.25, cy1 = y1 - 40
  const cx2 = x1 + (x2-x1)*0.75, cy2 = y2 - 40
  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`
}
