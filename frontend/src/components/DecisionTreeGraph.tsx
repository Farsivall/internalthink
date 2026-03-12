import { useMemo, useRef, useEffect, useCallback, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { ForceGraphMethods } from 'react-force-graph-2d'
import type { ProjectDecisionSummary } from '../api/decision'

export type TreeGraphNode = {
  id: string
  decision?: ProjectDecisionSummary
  pathOutline?: true
  parentId?: string
  path?: PathOutlineItem
  isRecommended?: boolean
  x?: number
  y?: number
  fx?: number
  fy?: number
}

export type TreeGraphLink = { source: string; target: string }

/** Closer spacing so nodes aren’t too far apart */
const CHARGE_STRENGTH = -60
const LINK_DISTANCE = 100
const PATH_OUTLINE_LINK_DISTANCE = 200
const FLOWCHART_LEVEL_HEIGHT = 100
const FLOWCHART_NODE_SPACING = 140

/** Compute flowchart layout: top-to-bottom, equally spaced levels and siblings */
function computeFlowchartLayout(
  nodes: TreeGraphNode[],
  links: TreeGraphLink[],
  width: number,
  height: number
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  if (nodes.length === 0) return positions

  const nodeIds = new Set(nodes.map((n) => n.id))
  const childrenMap = new Map<string, string[]>()
  const getParentId = (node: TreeGraphNode): string | null => {
    if (node.decision?.parent_id) {
      const pid = `decision-${node.decision.parent_id}`
      return nodeIds.has(pid) ? pid : null
    }
    if (node.pathOutline && node.parentId) {
      const pid = `decision-${node.parentId}`
      return nodeIds.has(pid) ? pid : null
    }
    return null
  }
  nodes.forEach((n) => {
    const pid = getParentId(n)
    if (pid) {
      if (!childrenMap.has(pid)) childrenMap.set(pid, [])
      childrenMap.get(pid)!.push(n.id)
    }
  })
  const rootId = nodes.find((n) => !getParentId(n))?.id ?? nodes[0].id

  const levels: string[][] = [[rootId]]
  const visited = new Set<string>([rootId])
  let front = [rootId]
  while (front.length > 0) {
    const next: string[] = []
    front.forEach((id) => {
      ;(childrenMap.get(id) ?? []).forEach((cid) => {
        if (!visited.has(cid)) {
          visited.add(cid)
          next.push(cid)
        }
      })
    })
    if (next.length > 0) levels.push(next)
    front = next
  }

  const maxLevelSize = Math.max(...levels.map((l) => l.length), 1)
  const levelWidth = Math.min(width * 0.85, maxLevelSize * FLOWCHART_NODE_SPACING)
  const totalHeight = (levels.length - 1) * FLOWCHART_LEVEL_HEIGHT
  const startY = -totalHeight / 2

  levels.forEach((levelNodes, levelIndex) => {
    const n = levelNodes.length
    const y = startY + levelIndex * FLOWCHART_LEVEL_HEIGHT
    levelNodes.forEach((nodeId, i) => {
      const x = n <= 1 ? 0 : (i / Math.max(1, n - 1) - 0.5) * levelWidth
      positions.set(nodeId, { x, y })
    })
  })

  return positions
}

/** Distinct colour per node (golden-angle spread) */
function nodeColorByIndex(index: number, total: number): string {
  const hue = (index * 137.5) % 360
  return `hsla(${hue}, 65%, 58%, 0.95)`
}

function getDecisionsInSubtree(decisions: ProjectDecisionSummary[], rootId: string): ProjectDecisionSummary[] {
  const byId = new Map(decisions.map((d) => [d.id, d]))
  const result: ProjectDecisionSummary[] = []
  const queue = [rootId]
  const seen = new Set<string>()
  while (queue.length) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    const d = byId.get(id)
    if (d) {
      result.push(d)
      decisions.filter((c) => c.parent_id === id).forEach((c) => queue.push(c.id))
    }
  }
  return result
}

export type PathOutlineItem = {
  id?: string
  title: string
  description?: string
  favored_by?: Array<{ persona: string; reason: string }>
}

interface DecisionTreeGraphProps {
  decisions: ProjectDecisionSummary[]
  onDecisionClick: (decision: ProjectDecisionSummary) => void
  /** When set, show only this decision and its descendants (hierarchical sub-ecosystem) */
  focusedDecisionId?: string | null
  /** When set, pin nodes to these positions (lock) */
  lockedPositions?: Record<string, { x: number; y: number }> | null
  /** Called when simulation stops so parent can store positions for lock */
  onPositionsCapture?: (positions: Record<string, { x: number; y: number }>) => void
  /** Path outlines to show as branches from the selected node (synthesis paths) */
  pathOutlines?: { parentId: string; paths: PathOutlineItem[]; recommendedPathId?: string | null } | null
  /** Which path outline the user has clicked (show green highlight on this node) */
  selectedPathOutline?: { parentId: string; pathId: string } | null
  /** When user clicks a path outline node (to confirm / take this path) */
  onPathOutlineClick?: (parentId: string, path: PathOutlineItem) => void
}

export function DecisionTreeGraph({
  decisions,
  onDecisionClick,
  focusedDecisionId = null,
  lockedPositions = null,
  onPositionsCapture,
  pathOutlines = null,
  selectedPathOutline = null,
  onPathOutlineClick,
}: DecisionTreeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<ForceGraphMethods<TreeGraphNode, TreeGraphLink> | undefined>(undefined)
  const nodesRef = useRef<TreeGraphNode[]>([])
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })

  const displayDecisions = useMemo(() => {
    if (!focusedDecisionId) return decisions
    const subtree = getDecisionsInSubtree(decisions, focusedDecisionId)
    const focused = subtree[0]
    if (!focused?.parent_id) return subtree
    const byId = new Map(decisions.map((d) => [d.id, d]))
    const parent = byId.get(focused.parent_id)
    if (!parent) return subtree
    return [parent, ...subtree]
  }, [decisions, focusedDecisionId])

  const decisionOrderMap = useMemo(() => {
    const sorted = [...decisions].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return ta - tb
    })
    const map = new Map<string, number>()
    sorted.forEach((d, i) => map.set(d.id, i + 1))
    return map
  }, [decisions])

  const graphData = useMemo(() => {
    const nodes: TreeGraphNode[] = displayDecisions.map((d) => {
      const id = `decision-${d.id}`
      const pos = lockedPositions && !focusedDecisionId ? lockedPositions[id] : undefined
      return {
        id,
        decision: d,
        ...(pos && { x: pos.x, y: pos.y, fx: pos.x, fy: pos.y }),
      }
    })
    const links: TreeGraphLink[] = []
    displayDecisions.forEach((d) => {
      if (d.parent_id) {
        const parentInSet = displayDecisions.some((x) => x.id === d.parent_id)
        if (parentInSet) links.push({ source: `decision-${d.parent_id}`, target: `decision-${d.id}` })
      }
    })

    // Path outlines: synthetic branches from the selected node (shown in graph, not sidebar)
    if (pathOutlines && pathOutlines.paths.length > 0) {
      const parentNodeId = `decision-${pathOutlines.parentId}`
      if (nodes.some((n) => n.id === parentNodeId)) {
        pathOutlines.paths.forEach((path) => {
          const pathId = path.id ?? path.title
          const outlineNodeId = `path-outline-${pathOutlines.parentId}-${pathId}`
          const isRecommended =
            pathOutlines.recommendedPathId &&
            (path.id === pathOutlines.recommendedPathId || path.title === pathOutlines.recommendedPathId)
          nodes.push({
            id: outlineNodeId,
            pathOutline: true,
            parentId: pathOutlines.parentId,
            path: { ...path, id: path.id, title: path.title, description: path.description },
            isRecommended: !!isRecommended,
          })
          links.push({ source: parentNodeId, target: outlineNodeId })
        })
      }
    }

    if (focusedDecisionId && nodes.length > 0) {
      const layout = computeFlowchartLayout(nodes, links, dimensions.width, dimensions.height)
      nodes.forEach((n) => {
        const pos = layout.get(n.id)
        if (pos) {
          n.x = pos.x
          n.y = pos.y
          n.fx = pos.x
          n.fy = pos.y
        }
      })
    }

    nodesRef.current = nodes
    return { nodes, links }
  }, [displayDecisions, lockedPositions, focusedDecisionId, pathOutlines, dimensions])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0]?.contentRect ?? { width: 800, height: 500 }
      setDimensions({ width: Math.max(300, w), height: Math.max(300, h) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const prevFocusedRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevFocusedRef.current === focusedDecisionId) return
    prevFocusedRef.current = focusedDecisionId
    const fg = fgRef.current
    if (!fg?.zoomToFit || graphData.nodes.length === 0) return
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fg.zoomToFit(450, 60)
      })
    })
    return () => cancelAnimationFrame(id)
  }, [focusedDecisionId, graphData.nodes.length])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    if (!focusedDecisionId) {
      const charge = fg.d3Force('charge') as unknown as { strength?: (v: number) => unknown }
      if (charge?.strength) charge.strength(CHARGE_STRENGTH)
      const link = fg.d3Force('link') as unknown as { distance?: (v: number | ((link: { target?: { id?: string } }) => number)) => unknown }
      if (link?.distance) {
        link.distance((l: { target?: { id?: string } }) =>
          typeof l.target === 'object' && l.target?.id?.startsWith('path-outline-')
            ? PATH_OUTLINE_LINK_DISTANCE
            : LINK_DISTANCE
        )
      }
    }
    fg.d3ReheatSimulation()
  }, [graphData, focusedDecisionId])

  const isSelectedPathOutline = useCallback(
    (node: TreeGraphNode) =>
      !!node.pathOutline &&
      !!selectedPathOutline &&
      node.parentId === selectedPathOutline.parentId &&
      (node.path?.id ?? node.path?.title) === selectedPathOutline.pathId,
    [selectedPathOutline]
  )

  const nodeColor = useCallback(
    (node: TreeGraphNode) => {
      if (node.pathOutline) {
        if (isSelectedPathOutline(node)) return 'rgba(52,211,153,0.95)'
        return 'rgba(148,163,184,0.75)'
      }
      const i = graphData.nodes.findIndex((x) => x.decision && x.id === node.id)
      const decisionNodes = graphData.nodes.filter((n) => n.decision)
      return i >= 0 ? nodeColorByIndex(i, decisionNodes.length) : 'rgba(99,102,241,0.9)'
    },
    [graphData.nodes, isSelectedPathOutline]
  )

  const nodeLabel = useCallback(
    (node: TreeGraphNode) => (node.pathOutline && node.path ? node.path.title : node.decision?.title ?? ''),
    []
  )

  const handleNodeClick = useCallback(
    (node: { id: string }) => {
      const n = graphData.nodes.find((x) => x.id === node.id) as TreeGraphNode | undefined
      if (!n) return
      if (n.pathOutline && n.parentId && n.path && onPathOutlineClick) {
        onPathOutlineClick(n.parentId, n.path)
        return
      }
      if (n.decision) {
        fgRef.current?.d3ReheatSimulation?.()
        onDecisionClick(n.decision)
      }
    },
    [graphData.nodes, onDecisionClick, onPathOutlineClick]
  )

  const handleEngineStop = useCallback(() => {
    if (!onPositionsCapture || focusedDecisionId) return
    const positions: Record<string, { x: number; y: number }> = {}
    nodesRef.current.forEach((n) => {
      if (n.pathOutline) return
      if (typeof n.x === 'number' && typeof n.y === 'number') positions[n.id] = { x: n.x, y: n.y }
    })
    onPositionsCapture(positions)
  }, [onPositionsCapture, focusedDecisionId])

  if (graphData.nodes.length === 0) return null

  return (
    <div
      ref={containerRef}
      className="w-full h-[500px] rounded-xl overflow-hidden bg-surface-900/80 border border-white/10"
    >
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeColor={nodeColor}
        nodeLabel={nodeLabel}
        onNodeClick={handleNodeClick}
        linkColor={(link: TreeGraphLink & { target?: { id?: string } }) => {
          if (typeof link.target !== 'object' || !link.target?.id?.startsWith('path-outline-'))
            return 'rgba(255,255,255,0.3)'
          const isRecommendedLink =
            pathOutlines &&
            pathOutlines.recommendedPathId &&
            link.target.id === `path-outline-${pathOutlines.parentId}-${pathOutlines.recommendedPathId}`
          return isRecommendedLink ? 'rgba(251,191,36,0.9)' : 'rgba(148,163,184,0.5)'
        }}
        linkLineDash={(link: TreeGraphLink & { target?: { id?: string } }) =>
          typeof link.target === 'object' && link.target?.id?.startsWith('path-outline-') ? [6, 4] : []
        }
        backgroundColor="transparent"
        nodeRelSize={10}
        d3AlphaDecay={0.008}
        d3VelocityDecay={0.45}
        cooldownTicks={300}
        cooldownTime={800}
        warmupTicks={30}
        enableNodeDrag={true}
        dagMode={undefined}
        dagLevelDistance={undefined}
        onEngineStop={handleEngineStop}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const n = node as TreeGraphNode & { x?: number; y?: number }
          const label = nodeLabel(n)
          const color = nodeColor(n)
          const x = n.x ?? 0
          const y = n.y ?? 0
          const isPathOutline = !!n.pathOutline
          const size = isPathOutline ? 10 : 12
          const showOrder = !focusedDecisionId && n.decision
          const orderNum = showOrder ? decisionOrderMap.get(n.decision.id) : undefined
          ctx.beginPath()
          ctx.arc(x, y, size, 0, 2 * Math.PI)
          if (isPathOutline) {
            ctx.fillStyle = 'transparent'
            ctx.fill()
            ctx.setLineDash([4 / globalScale, 4 / globalScale])
            ctx.strokeStyle = color
            ctx.lineWidth = 2 / globalScale
            ctx.stroke()
            ctx.setLineDash([])
          } else {
            ctx.fillStyle = color
            ctx.fill()
            ctx.strokeStyle = 'rgba(255,255,255,0.45)'
            ctx.lineWidth = 1.5 / globalScale
            ctx.stroke()
          }
          if (orderNum != null) {
            ctx.font = `bold ${(10 / globalScale)}px sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillStyle = 'rgba(255,255,255,0.95)'
            ctx.fillText(String(orderNum), x, y)
          }
          ctx.font = `${(isPathOutline ? 10 : 12) / globalScale}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = isPathOutline ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.95)'
          ctx.fillText(label, x, y + size + (isPathOutline ? 10 : 12))
        }}
      />
    </div>
  )
}
