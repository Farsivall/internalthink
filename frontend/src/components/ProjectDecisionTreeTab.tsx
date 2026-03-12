import { useRef, useEffect, useState, useCallback } from 'react'
import {
  getProjectDecisions,
  getDecision,
  evaluateDecision,
  type ProjectDecisionSummary,
} from '../api/decision'
import type { DecisionEvaluateResponse } from '../api/decision'
import { mockSpecialists } from '../data/mock'
import { DecisionBreakdownModal } from './DecisionBreakdownModal'
import { DecisionTreeGraph } from './DecisionTreeGraph'

function getPersonaColor(name: string): string {
  const byName: Record<string, string> = {}
  mockSpecialists.forEach((s) => {
    byName[s.name] = s.color
    if (s.name === 'Business Development') byName['Business Dev'] = s.color
  })
  return byName[name] ?? '#6b7280'
}

export function ProjectDecisionTreeTab({ projectId }: { projectId: string }) {
  const [decisions, setDecisions] = useState<ProjectDecisionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [breakdownDecision, setBreakdownDecision] = useState<DecisionEvaluateResponse | null>(null)
  const [breakdownLoadingId, setBreakdownLoadingId] = useState<string | null>(null)
  const [selectedDecision, setSelectedDecision] = useState<ProjectDecisionSummary | null>(null)
  const [sidebarDecision, setSidebarDecision] = useState<DecisionEvaluateResponse | null>(null)
  const [sidebarLoading, setSidebarLoading] = useState(false)
  const [focusedDecisionId, setFocusedDecisionId] = useState<string | null>(null)
  const [lockPositions, setLockPositions] = useState(false)
  const [lockedPositions, setLockedPositions] = useState<Record<string, { x: number; y: number }> | null>(null)
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({})
  const [addBranchParentId, setAddBranchParentId] = useState<string | null>(null)
  const [addBranchSubmitting, setAddBranchSubmitting] = useState(false)
  const [addBranchError, setAddBranchError] = useState<string | null>(null)
  const [takePathSubmitting, setTakePathSubmitting] = useState<string | null>(null)
  const [selectedPathOutline, setSelectedPathOutline] = useState<{
    parentId: string
    path: { id?: string; title: string; description?: string; favored_by?: Array<{ persona: string; reason: string }> }
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getProjectDecisions(projectId)
      .then((data) => {
        if (!cancelled) setDecisions(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load decisions')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const openBreakdown = (decisionId: string) => {
    setBreakdownLoadingId(decisionId)
    getDecision(decisionId)
      .then((data) => setBreakdownDecision(data))
      .catch(() => setBreakdownDecision(null))
      .finally(() => setBreakdownLoadingId(null))
  }

  const handleDecisionClick = useCallback((decision: ProjectDecisionSummary) => {
    setSelectedPathOutline(null)
    setSelectedDecision(decision)
    setFocusedDecisionId(decision.id)
    setSidebarDecision(null)
    setSidebarLoading(true)
    getDecision(decision.id)
      .then((data) => setSidebarDecision(data))
      .catch(() => setSidebarDecision(null))
      .finally(() => setSidebarLoading(false))
  }, [])

  const exitFocus = useCallback(() => {
    setFocusedDecisionId(null)
  }, [])

  const onPositionsCapture = useCallback((positions: Record<string, { x: number; y: number }>) => {
    positionsRef.current = positions
  }, [])

  const handleLockChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked
    setLockPositions(checked)
    if (checked) {
      setLockedPositions({ ...positionsRef.current })
    } else {
      setLockedPositions(null)
    }
  }, [])

  const focusedDecision = focusedDecisionId
    ? decisions.find((d) => d.id === focusedDecisionId)
    : null

  const handleAddBranch = useCallback((parentId: string) => {
    setAddBranchParentId(parentId)
    setAddBranchError(null)
  }, [])

  const handlePathOutlineSelect = useCallback(
    (parentId: string, path: { id?: string; title: string; description?: string; favored_by?: Array<{ persona: string; reason: string }> }) => {
      setSelectedPathOutline({ parentId, path })
      setAddBranchError(null)
    },
    []
  )

  const handleTakePath = useCallback(
    (parentId: string, path: { id?: string; title: string; description?: string }) => {
      setTakePathSubmitting(path.id ?? path.title)
      setAddBranchError(null)
      evaluateDecision(projectId, {
        title: path.title,
        description: path.description || path.title,
        parent_id: parentId,
      })
        .then(() => getProjectDecisions(projectId).then(setDecisions))
        .then(() => {
          setTakePathSubmitting(null)
          setSelectedPathOutline(null)
        })
        .catch((err: unknown) => {
          setAddBranchError(err instanceof Error ? err.message : 'Failed to create branch')
          setTakePathSubmitting(null)
        })
    },
    [projectId]
  )

  const handleAddBranchSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const form = e.currentTarget
      const title = (form.querySelector('[name="branch-title"]') as HTMLInputElement)?.value?.trim()
      const description = (
        form.querySelector('[name="branch-description"]') as HTMLTextAreaElement
      )?.value?.trim()
      if (!addBranchParentId || !title || !description) return
      setAddBranchSubmitting(true)
      setAddBranchError(null)
      evaluateDecision(projectId, {
        title,
        description,
        parent_id: addBranchParentId,
      })
        .then(() => {
          return getProjectDecisions(projectId).then(setDecisions)
        })
        .then(() => {
          setAddBranchParentId(null)
          setAddBranchSubmitting(false)
        })
        .catch((err: unknown) => {
          setAddBranchError(err instanceof Error ? err.message : 'Failed to create branch')
          setAddBranchSubmitting(false)
        })
    },
    [projectId, addBranchParentId]
  )

  return (
    <div className="animate-fade-in flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 mb-4 shrink-0 flex-wrap">
        <p className="text-white/60 text-sm">
          {focusedDecisionId
            ? 'Viewing this decision and its branches. Drag nodes to rearrange.'
            : 'Click a decision to expand its branch. Drag nodes; lock positions to keep layout.'}
        </p>
        <div className="flex items-center gap-4">
          {focusedDecisionId && focusedDecision && (
            <div className="flex items-center gap-2">
              <span className="text-white/50 text-xs">Viewing branch:</span>
              <span className="text-white/90 text-sm truncate max-w-[200px]" title={focusedDecision.title}>
                {focusedDecision.title}
              </span>
              <button
                type="button"
                onClick={exitFocus}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white/90 hover:bg-white/20 border border-white/20"
              >
                Exit to full tree
              </button>
            </div>
          )}
          {!focusedDecisionId && (
            <label className="flex items-center gap-2 cursor-pointer text-white/70 text-sm">
              <input
                type="checkbox"
                checked={lockPositions}
                onChange={handleLockChange}
                className="rounded border-white/30 bg-white/5 text-indigo-400 focus:ring-indigo-500"
              />
              Lock positions
            </label>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 rounded-xl border border-dashed border-white/20 bg-surface-800/30 flex items-center justify-center min-h-[400px]">
          <p className="text-white/60 text-sm">Loading decisions…</p>
        </div>
      ) : error ? (
        <div className="flex-1 rounded-xl border border-dashed border-red-500/40 bg-red-950/40 flex items-center justify-center min-h-[400px]">
          <p className="text-red-200 text-sm">Could not load decisions: {error}</p>
        </div>
      ) : decisions.length === 0 ? (
        <div className="flex-1 rounded-xl border border-dashed border-white/20 bg-surface-800/30 flex flex-col items-center justify-center min-h-[400px] gap-2">
          <ion-icon name="git-branch-outline" className="text-4xl text-white/30" />
          <p className="text-white/50 text-sm">No decisions yet.</p>
          <p className="text-white/40 text-xs">Evaluate a decision in the Chat tab to build the tree.</p>
        </div>
      ) : (
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <DecisionTreeGraph
              decisions={decisions}
              onDecisionClick={handleDecisionClick}
              focusedDecisionId={focusedDecisionId}
              lockedPositions={lockPositions ? lockedPositions : null}
              onPositionsCapture={onPositionsCapture}
              pathOutlines={
                selectedDecision && focusedDecisionId && sidebarDecision?.paths?.length
                  ? {
                      parentId: selectedDecision.id,
                      paths: sidebarDecision.paths,
                      recommendedPathId:
                        sidebarDecision.recommended_path?.path_id ??
                        sidebarDecision.recommended_path?.title ??
                        null,
                    }
                  : null
              }
              selectedPathOutline={
                selectedPathOutline && selectedDecision && selectedPathOutline.parentId === selectedDecision.id
                  ? { parentId: selectedPathOutline.parentId, pathId: selectedPathOutline.path.id ?? selectedPathOutline.path.title }
                  : null
              }
              onPathOutlineClick={handlePathOutlineSelect}
            />
          </div>
          {selectedDecision && (
            <div className="w-72 shrink-0 rounded-xl border border-white/10 bg-surface-800/80 p-4 overflow-y-auto flex flex-col gap-3">
              {sidebarLoading ? (
                <p className="text-xs text-white/50">Loading…</p>
              ) : sidebarDecision ? (
                <>
                  {selectedPathOutline && selectedPathOutline.parentId === selectedDecision.id ? (
                    <>
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-3 flex-1 min-h-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-emerald-400/90">Selected path</p>
                          <button
                            type="button"
                            onClick={() => setSelectedPathOutline(null)}
                            className="text-[10px] text-white/50 hover:text-white/80 shrink-0"
                          >
                            Clear
                          </button>
                        </div>
                        <h4 className="text-sm font-semibold text-white leading-snug">
                          {selectedPathOutline.path.title}
                        </h4>
                        {selectedPathOutline.path.description ? (
                          <p className="text-xs text-white/85 leading-relaxed overflow-y-auto max-h-[180px]">
                            {selectedPathOutline.path.description}
                          </p>
                        ) : (
                          <p className="text-xs text-white/50 italic">No description.</p>
                        )}
                        <button
                          type="button"
                          disabled={!!takePathSubmitting}
                          onClick={() => handleTakePath(selectedPathOutline.parentId, selectedPathOutline.path)}
                          className="w-full rounded border border-emerald-500/50 bg-emerald-950/30 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-950/50 disabled:opacity-50"
                        >
                          {takePathSubmitting === (selectedPathOutline.path.id ?? selectedPathOutline.path.title)
                            ? 'Creating…'
                            : 'Take this path'}
                        </button>
                      </div>
                      <div className="rounded border border-white/10 bg-white/5 p-2.5 space-y-1">
                        <p className="text-[10px] font-medium text-white/50 uppercase tracking-wide">
                          Parent decision
                        </p>
                        <p className="text-xs font-medium text-white/90 truncate">{selectedDecision.title}</p>
                        <p className="text-[11px] text-white/60 leading-relaxed line-clamp-3">
                          {sidebarDecision.decision_summary || selectedDecision.summary || '—'}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <h4 className="text-sm font-semibold text-white">{selectedDecision.title}</h4>
                      {(sidebarDecision.decision_summary || selectedDecision.summary) && (
                        <div>
                          <p className="text-xs font-medium text-white/60 mb-0.5">Decision summary</p>
                          <p className="text-xs text-white/85 leading-relaxed line-clamp-4">
                            {sidebarDecision.decision_summary || selectedDecision.summary}
                          </p>
                        </div>
                      )}
                      {sidebarDecision.core_tensions && sidebarDecision.core_tensions.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-white/60 mb-0.5">Core tensions</p>
                          <ul className="text-xs text-white/75 space-y-0.5 list-disc list-inside">
                            {sidebarDecision.core_tensions.slice(0, 3).map((t, i) => (
                              <li key={i} className="line-clamp-1">{t}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {addBranchError && (
                        <div className="rounded-lg border border-red-500/30 bg-red-950/30 px-2.5 py-2 text-xs text-red-200">
                          {addBranchError}
                          <button
                            type="button"
                            onClick={() => setAddBranchError(null)}
                            className="ml-2 underline"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                      {sidebarDecision.paths && sidebarDecision.paths.length > 0 && (
                        <p className="text-[11px] text-white/50">
                          Potential paths appear as branches from this node. Click a path in the graph to see details, or make your own branch below.
                        </p>
                      )}
                      <div>
                        <p className="text-xs font-medium text-white/60 mb-1.5">Persona scores</p>
                        <div className="flex flex-col gap-1.5">
                          {(sidebarDecision.persona_scores?.length
                            ? sidebarDecision.persona_scores.map((ps) => ({
                                name: ps.persona_name,
                                score: ps.total_score,
                              }))
                            : sidebarDecision.scores.map((s) => ({
                                name: s.specialist_name,
                                score: (s.score ?? 5) * 10,
                              }))
                          ).map(({ name, score }) => (
                            <div key={name} className="flex items-center gap-2">
                              <span className="text-xs text-white/80 w-24 shrink-0 truncate">{name}</span>
                              <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(100, Math.max(0, score))}%`,
                                    backgroundColor: getPersonaColor(name),
                                  }}
                                />
                              </div>
                              <span className="text-xs text-white/70 w-8 text-right">{score}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <p className="text-xs text-white/50">Could not load decision details.</p>
              )}
              <button
                type="button"
                onClick={() => handleAddBranch(selectedDecision.id)}
                className="mt-1 flex items-center gap-1.5 rounded-lg border border-dashed border-white/30 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10"
              >
                <ion-icon name="add-circle-outline" className="text-base" />
                Make your own branch
              </button>
              <button
                type="button"
                onClick={() => openBreakdown(selectedDecision.id)}
                className="mt-1 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-500/80 text-white hover:bg-indigo-500 border border-indigo-400/50"
              >
                View full breakdown
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedDecision(null)
                  setSidebarDecision(null)
                  setSelectedPathOutline(null)
                }}
                className="text-xs text-white/50 hover:text-white/80 mt-2"
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}

      {breakdownDecision && (
        <DecisionBreakdownModal
          decision={breakdownDecision}
          onClose={() => setBreakdownDecision(null)}
          branchedDecisions={
            selectedDecision
              ? decisions
                  .filter((d) => d.parent_id === selectedDecision.id)
                  .map((d) => ({ id: d.id, title: d.title }))
              : []
          }
          onAddBranch={handleAddBranch}
          parentDecisionId={
            breakdownDecision?.decision_id ?? selectedDecision?.id ?? null
          }
        />
      )}

      {addBranchParentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface-800 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Add new branch</h3>
            <p className="text-xs text-white/60 mb-4">
              Create a new decision linked to this node. It will appear as a child in the tree.
            </p>
            <form onSubmit={handleAddBranchSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-white/60 mb-1">Title</label>
                <input
                  name="branch-title"
                  type="text"
                  required
                  placeholder="e.g. Pilot with 3 customers"
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40"
                />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1">Description</label>
                <textarea
                  name="branch-description"
                  required
                  rows={3}
                  placeholder="What this branch decision is about..."
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 resize-none"
                />
              </div>
              {addBranchError && (
                <p className="text-xs text-red-400">{addBranchError}</p>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddBranchParentId(null)
                    setAddBranchError(null)
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm text-white/70 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addBranchSubmitting}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50"
                >
                  {addBranchSubmitting ? 'Creating…' : 'Create branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
