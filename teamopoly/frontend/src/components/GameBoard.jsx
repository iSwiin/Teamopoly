// frontend/src/components/GameBoard.jsx
import { useEffect, useMemo, useState } from 'react'
import {
  getBoard, createTask, stakeTask, claimHelp, completeTask,
  offerTrade, acceptTrade, drawChance, moveTask, reopenTask,
  generateSprint, generateTests
} from '../api'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import CityHeatmap from './CityHeatmap'
import CardModal from './CardModal'

const LANE_META = {
  todo:        { title: 'To-Do 🏠',       bg: 'bg-amber-50'   },
  in_progress: { title: 'In-Progress 🚂', bg: 'bg-emerald-50' },
  help:        { title: 'Help Needed 🧰', bg: 'bg-sky-50'     },
  done:        { title: 'Done 🎉',        bg: 'bg-violet-50'  },
}

// Stretch the board to feel like a “page-length” workspace
const BOARD_HEIGHT = 'min(140vh, calc(100vh + 600px))'

export default function GameBoard({ projectId, currentUser = 'alice' }) {
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(false)

  // modal state
  const [openModal, setOpenModal] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)

  // quick create inputs
  const [newTitle, setNewTitle] = useState('Build Landing Page')
  const [newOwner, setNewOwner] = useState(currentUser || 'alice')
  const [newSize, setNewSize]   = useState('M')
  const [newETA, setNewETA]     = useState('2025-11-10')

  useEffect(() => { setNewOwner(currentUser || 'alice') }, [currentUser])

  // Sprint generator
  const [repoInput, setRepoInput] = useState('withastro/astro')
  const [ghosts, setGhosts] = useState([])

  const balances = useMemo(() => board?.balances || {}, [board])

  async function refresh() {
    setLoading(true)
    const b = await getBoard(projectId)
    setBoard(b)
    setLoading(false)
  }
  useEffect(() => { refresh() }, [projectId])

  // Close/reset modal on project switch to avoid stuck overlay
  useEffect(() => {
    setOpenModal(false)
    setSelectedTask(null)
  }, [projectId])

  // ----- actions -----
  async function handleCreate() {
    await createTask({ project_id: projectId, title: newTitle, owner_id: newOwner, size: newSize, eta: newETA })
    await refresh()
  }
  async function handleStake(id, amount, e) {
    e?.stopPropagation()
    const amt = Number(amount || 0)
    if (Number.isNaN(amt) || amt < 0) return
    await stakeTask({ task_id: id, user_id: currentUser, amount: amt })
    await refresh()
  }
  async function handleClaim(id, helper, e) {
    e?.stopPropagation()
    await claimHelp({ task_id: id, helper_id: helper || currentUser })
    await refresh()
  }
  async function handleComplete(id, e) {
    e?.stopPropagation()
    await completeTask(id)
    await refresh()
  }
  async function handleTrade(id, to_user, e) {
    e?.stopPropagation()
    await offerTrade({ task_id: id, to_user })
    await acceptTrade({ task_id: id, to_user })
    await refresh()
  }

  // ----- Sprint generator (ghosts) -----
  async function handleGenerateSprint() {
    try {
      const res = await generateSprint(repoInput)
      const list = (res?.suggestions || []).map((s, i) => ({
        id: `ghost_${Date.now()}_${i}`,
        title: s.title,
        size: s.size || 'M',
        eta: s.eta || newETA,
        owner: s.owner || currentUser,
        lane: (['todo','in_progress','help','done'].includes(s.lane) ? s.lane : 'todo')
      }))
      setGhosts(g => [...g, ...list])
    } catch (e) {
      alert(`Could not generate sprint: ${e.message}`)
    }
  }
  async function acceptGhost(ghost) {
    await createTask({
      project_id: projectId,
      title: ghost.title,
      owner_id: ghost.owner || currentUser,
      size: ghost.size || 'M',
      eta: ghost.eta || newETA
    })
    setGhosts(gs => gs.filter(g => g.id !== ghost.id))
    await refresh()
  }
  function denyGhost(ghost) {
    setGhosts(gs => gs.filter(g => g.id !== ghost.id))
  }
  const ghostsByLane = useMemo(() => {
    const out = { todo:[], in_progress:[], help:[], done:[] }
    for (const g of ghosts) (out[g.lane] || out.todo).push(g)
    return out
  }, [ghosts])

  // ----- DnD handlers -----
  function optimisticMove(taskId, fromLane, toLane) {
    setBoard(prev => {
      if (!prev) return prev
      const cols = structuredClone(prev.columns)
      const fromArr = [...(cols[fromLane] || [])]
      const toArr = [...(cols[toLane] || [])]
      const idx = fromArr.findIndex(t => String(t.id) === String(taskId))
      if (idx === -1) return prev
      const [item] = fromArr.splice(idx, 1)
      item.status = toLane
      toArr.unshift(item)
      cols[fromLane] = fromArr
      cols[toLane] = toArr
      return { ...prev, columns: cols }
    })
  }

  async function onDragEnd(result) {
    const { destination, source, draggableId } = result
    if (!destination) return
    const fromLane = source.droppableId
    const toLane = destination.droppableId
    if (fromLane === toLane) return

    // ghosts aren’t draggable
    if (String(draggableId).startsWith('ghost_')) return

    // optimistic swap
    optimisticMove(draggableId, fromLane, toLane)

    try {
      if (toLane === 'done') {
        await completeTask(draggableId)
      } else if (fromLane === 'done' && toLane !== 'done') {
        await reopenTask(draggableId)
      } else {
        await moveTask({ task_id: draggableId, to_status: toLane })
      }
    } catch {
      await refresh() // revert on error
    }
  }

  if (!board) {
    return <div className="rounded-2xl border bg-white p-6 text-slate-600">Loading board…</div>
  }

  return (
    <section
      className="w-full rounded-2xl border bg-white p-4"
      style={{ height: BOARD_HEIGHT, display: 'flex', flexDirection: 'column' }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-3 shrink-0">
        <h2 className="text-xl font-semibold">Monopoly × Trello Board</h2>
        <div className="ml-auto hidden md:flex flex-wrap gap-2">
          {Object.entries(balances).map(([u,v]) => (
            <span key={u} className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm">
              @{u}: <b>{v}</b> 🪙
            </span>
          ))}
        </div>
        <button
          onClick={async () => {
            const res = await drawChance(projectId)
            alert(`🎲 Chance: ${res.title || res.card?.title || 'New rule!'}\n\n${res.effect || res.card?.text || ''}`)
            await refresh()
          }}
          className="px-3 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-sm shadow"
        >
          Draw Chance
        </button>
      </div>

      {/* Creator */}
      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[minmax(280px,1fr)_auto_auto_auto_auto] shrink-0">
        <input value={newTitle} onChange={e=>setNewTitle(e.target.value)} className="border rounded-lg px-3 py-2" placeholder="Task title"/>
        <input value={newOwner} onChange={e=>setNewOwner(e.target.value)} className="border rounded-lg px-3 py-2 w-32" placeholder="owner (login)"/>
        <select value={newSize} onChange={e=>setNewSize(e.target.value)} className="border rounded-lg px-3 py-2 w-28">
          <option>S</option><option>M</option><option>L</option>
        </select>
        <input value={newETA} onChange={e=>setNewETA(e.target.value)} className="border rounded-lg px-3 py-2 w-40" placeholder="YYYY-MM-DD"/>
        <button onClick={handleCreate} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white">+ Create (mints)</button>
      </div>

      {/* Generator */}
      <div className="mb-4 flex flex-wrap gap-2 items-center shrink-0">
        <input
          value={repoInput}
          onChange={e=>setRepoInput(e.target.value)}
          className="border rounded-lg px-3 py-2 min-w-[260px]"
          placeholder="owner/repo or https://github.com/owner/repo"
        />
        <button onClick={handleGenerateSprint} className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
          Generate Sprint (ghosts)
        </button>
        {ghosts.length > 0 && <span className="text-slate-500 text-sm">Suggestions pending: {ghosts.length}</span>}
      </div>

      {/* Collaboration Heatmap */}
      <CityHeatmap board={board} />

      {/* Lanes with DnD */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch flex-1 min-h-0 overflow-hidden">
          {Object.entries(LANE_META).map(([laneKey, meta]) => (
            <Droppable key={laneKey} droppableId={laneKey}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`rounded-2xl border ${meta.bg} p-4 flex flex-col min-h-0 h-full transition-shadow ${snapshot.isDraggingOver ? 'shadow-lg' : ''}`}
                >
                  <div className="text-lg font-semibold mb-3 shrink-0">{meta.title}</div>
                  <div
                    className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto overscroll-contain pr-1"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                  >
                    {(board.columns?.[laneKey] || []).map((task, index) => (
                      <Draggable key={String(task.id)} draggableId={String(task.id)} index={index}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            onClick={() => { setSelectedTask(task); setOpenModal(true) }}
                            className={`w-full rounded-xl bg-white border shadow-sm p-4 overflow-hidden min-h-[200px] flex flex-col cursor-pointer ${dragSnapshot.isDragging ? 'ring-2 ring-emerald-400' : ''}`}
                          >
                            <div className="flex items-start gap-2">
                              <span className="font-semibold leading-tight break-words flex-1">{task.title}</span>
                              <span className="text-[10px] px-2 py-1 rounded bg-rose-100 text-rose-700">AI Tests</span>
                            </div>
                            <CardBody
                              task={task}
                              onStake={(id,amt,e)=>handleStake(id,amt,e)}
                              onClaim={(id,u,e)=>handleClaim(id,u,e)}
                              onComplete={(id,e)=>handleComplete(id,e)}
                              onTrade={(id,u,e)=>handleTrade(id,u,e)}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}

                    {/* Ghosts after real tasks (not draggable) */}
                    {(ghostsByLane[laneKey] || []).map(g => (
                      <GhostCard key={g.id} ghost={g} onAccept={acceptGhost} onDeny={denyGhost} />
                    ))}

                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      {loading && <div className="mt-3 text-sm text-slate-500 shrink-0">Refreshing…</div>}

      {/* ✅ Only mount the modal when truly open and we have a task */}
      {openModal && selectedTask && (
        <CardModal
          key={selectedTask.id}
          open={true}
          task={selectedTask}
          generateTests={generateTests}
          onClose={() => {
            setOpenModal(false)
            setSelectedTask(null)
          }}
          onSaved={() => {
            refresh()
            setOpenModal(false)
            setSelectedTask(null)
          }}
        />
      )}
    </section>
  )
}

function CardBody({ task, onStake, onClaim, onComplete, onTrade }) {
  const [stakeAmt, setStakeAmt]   = useState(3)
  const [helper, setHelper]       = useState('bob')
  const [tradeUser, setTradeUser] = useState('alice')
  const reward = task.size === 'L' ? 8 : task.size === 'M' ? 5 : 3

  return (
    <>
      <div className="text-xs text-slate-600">
        Owner: @{task.owner_id || task.owner} • Size: {task.size} • ETA: {task.eta}
      </div>
      <div className="mt-2 text-xs text-slate-500 space-y-1">
        <div>Reward: <b>{reward}</b> tokens • Risk: Medium</div>
        <div>Acceptance: write tests • peer review • update docs</div>
      </div>

      <div className="mt-auto pt-3 flex flex-wrap gap-2 items-center">
        <input
          value={stakeAmt}
          onChange={e => setStakeAmt(e.target.value)}
          className="w-16 border rounded px-2 py-1 text-sm"
          inputMode="numeric"
          onClick={(e)=>e.stopPropagation()}
        />
        <button
          onClick={(e)=>onStake(task.id, Number(stakeAmt), e)}
          className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white text-sm"
        >
          Stake
        </button>

        <button
          onClick={(e)=>onComplete(task.id, e)}
          className="px-3 py-1 rounded bg-black text-white text-sm"
        >
          Complete
        </button>

        <input
          value={helper}
          onChange={e => setHelper(e.target.value)}
          className="w-28 sm:w-32 border rounded px-2 py-1 text-sm"
          placeholder="@helper"
          onClick={(e)=>e.stopPropagation()}
        />
        <button
          onClick={(e)=>onClaim(task.id, helper, e)}
          className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm"
        >
          Claim Help
        </button>

        <input
          value={tradeUser}
          onChange={e => setTradeUser(e.target.value)}
          className="w-28 sm:w-32 border rounded px-2 py-1 text-sm"
          placeholder="@to_user"
          onClick={(e)=>e.stopPropagation()}
        />
        <button
          onClick={(e)=>onTrade(task.id, tradeUser, e)}
          className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm"
        >
          Trade
        </button>
      </div>
    </>
  )
}

function GhostCard({ ghost, onAccept, onDeny }) {
  const reward = ghost.size === 'L' ? 8 : ghost.size === 'M' ? 5 : 3
  return (
    <div className="w-full rounded-xl border-2 border-dashed p-4 overflow-hidden min-h-[180px] flex flex-col bg-slate-100/70 text-slate-600">
      <div className="font-semibold line-clamp-2">{ghost.title}</div>
      <div className="text-xs">Suggested • Size: {ghost.size} • ETA: {ghost.eta || 'TBD'}</div>
      <div className="mt-2 text-xs text-slate-500 space-y-1">
        <div>Estimated reward: ~{reward} tokens</div>
        <div>This is a suggestion — Accept to mint as a real task.</div>
      </div>
      <div className="mt-auto pt-3 flex gap-2">
        <button onClick={() => onAccept(ghost)} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm">Accept</button>
        <button onClick={() => onDeny(ghost)} className="px-3 py-1 rounded bg-slate-400 hover:bg-slate-500 text-white text-sm">Deny</button>
      </div>
    </div>
  )
}
