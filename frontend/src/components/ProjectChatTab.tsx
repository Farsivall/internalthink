import { useState, useRef, useEffect, useCallback } from 'react'
import type { Specialist, ThreadMessage } from '../data/mock'
import { mockSpecialists } from '../data/mock'
import { sendChatMessage } from '../api/chat'
import { getProjectChat as fetchProjectChat } from '../api/chatMessages'
import { isVoiceAvailable, getVoiceAudio } from '../api/voice'
import { evaluateDecision, getDecision, getProjectDecisions } from '../api/decision'
import type { DecisionEvaluateResponse, ProjectDecisionSummary } from '../api/decision'

const mentionMap: Record<string, string> = {
  '@legal': 'legal',
  '@financial': 'financial',
  '@technical': 'technical',
  '@bd': 'bd',
  '@tax': 'tax',
}

function extractMentionedSpecialists(text: string): string[] {
  const lower = text.toLowerCase()
  const ids = new Set<string>()
  for (const [token, id] of Object.entries(mentionMap)) {
    if (lower.includes(token)) {
      ids.add(id)
    }
  }
  return Array.from(ids)
}

function getSpecialistColor(id: string): string {
  const spec = mockSpecialists.find((s) => s.id === id)
  return spec?.color ?? '#6b7280'
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  }
}

function DecisionPieChart({ decision }: { decision: DecisionEvaluateResponse }) {
  const total = decision.scores.reduce((sum, s) => sum + Math.max(s.score * 10, 0), 0) || 1
  const cx = 60
  const cy = 60
  const r = 48
  let cumulative = 0

  const segmentData = decision.scores.map((s) => {
    const value = Math.max(s.score * 10, 0)
    const startAngle = (cumulative / total) * 360
    const endAngle = ((cumulative + value) / total) * 360
    cumulative += value
    const midAngle = (startAngle + endAngle) / 2
    const labelPos = polarToCartesian(cx, cy, r * 0.55, midAngle)
    return {
      ...s,
      startAngle,
      endAngle,
      value,
      labelPos,
      color: getSpecialistColor(s.specialist_id),
    }
  })

  const segments = segmentData.map((s) => {
    const largeArc = s.endAngle - s.startAngle > 180 ? 1 : 0
    const start = polarToCartesian(cx, cy, r, s.endAngle)
    const end = polarToCartesian(cx, cy, r, s.startAngle)
    const d = [
      `M ${cx} ${cy}`,
      `L ${start.x} ${start.y}`,
      `A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`,
      'Z',
    ].join(' ')
    return (
      <g key={s.specialist_id}>
        <path d={d} fill={s.color} stroke="rgba(0,0,0,0.2)" strokeWidth={1} />
        <text
          x={s.labelPos.x}
          y={s.labelPos.y}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-white text-[10px] font-bold"
          style={{ textShadow: '0 0 2px rgba(0,0,0,0.8)' }}
        >
          {s.score * 10}
        </text>
      </g>
    )
  })

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 120 120" className="w-36 h-36 shrink-0">
        <g>{segments}</g>
      </svg>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 text-[11px]">
        {segmentData.map((s) => (
          <span key={s.specialist_id} className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-white/90">{s.specialist_name}</span>
            <span className="text-white/60">({s.score * 10})</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Wrap specialist names in the text with colour-coded spans */
function ColorCodedText({ text }: { text: string }) {
  const names = mockSpecialists.map((s) => s.name)
  const parts: { str: string; color?: string }[] = []
  let remaining = text
  while (remaining.length > 0) {
    let best: { name: string; index: number } | null = null
    for (const name of names) {
      const i = remaining.indexOf(name)
      if (i !== -1 && (best === null || i < best.index)) best = { name, index: i }
    }
    if (best === null) {
      parts.push({ str: remaining })
      break
    }
    if (best.index > 0) parts.push({ str: remaining.slice(0, best.index) })
    const spec = mockSpecialists.find((s) => s.name === best!.name)
    const color = spec ? getSpecialistColor(spec.id) : undefined
    parts.push({ str: best.name, color })
    remaining = remaining.slice(best.index + best.name.length)
  }
  return (
    <span>
      {parts.map((p, i) =>
        p.color ? (
          <span key={i} className="font-medium" style={{ color: p.color }}>
            {p.str}
          </span>
        ) : (
          <span key={i}>{p.str}</span>
        )
      )}
    </span>
  )
}

function DecisionBreakdownModal({
  decision,
  onClose,
}: {
  decision: DecisionEvaluateResponse
  onClose: () => void
}) {
  const agreementItems = decision.agreement
    .split(/[\.\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

  const tradeoffItems = decision.tradeoffs
    .split(/[\.\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-800 border border-white/10 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-semibold text-white">Decision breakdown</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/70"
          >
            <ion-icon name="close" className="text-lg" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <p className="text-xs text-white/50 mb-1">Decision</p>
            <p className="text-sm font-medium text-white">{decision.decision_title}</p>
          </div>

          <div className="space-y-5">
            <div className="flex justify-center">
              <DecisionPieChart decision={decision} />
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-white/70 mb-1.5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500/80" />
                  What they agree on
                </p>
                <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
                  <div className="divide-y divide-white/10">
                    {agreementItems.map((s, i) => (
                      <div key={i} className="px-3 py-2.5 text-sm text-white/85 leading-relaxed">
                        <ColorCodedText text={s} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-white/70 mb-1.5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500/80" />
                  Tradeoffs between departments
                </p>
                <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
                  <div className="divide-y divide-white/10">
                    {tradeoffItems.map((s, i) => {
                      const [headline, detail] = s.split(/:\s+/, 2)
                      return (
                        <div key={i} className="px-3 py-2.5 text-sm text-white/85 leading-relaxed space-y-1">
                          <p className="font-medium">
                            <ColorCodedText text={headline ?? s} />
                          </p>
                          {detail && (
                            <p className="text-white/80">
                              <ColorCodedText text={detail} />
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs text-white/50 mb-2">Per-persona breakdown (by specialism)</p>
            <div className="space-y-5">
              {decision.scores.map((s) => {
                const color = getSpecialistColor(s.specialist_id)
                return (
                  <div
                    key={s.specialist_id}
                    className="rounded-xl bg-surface-700/80 border border-white/10 p-4"
                    style={{ borderLeft: `4px solid ${color}` }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className="text-sm font-semibold text-white"
                        style={{ color }}
                      >
                        {s.specialist_name}
                      </span>
                      <span className="text-xs text-white/50">Score (0–100)</span>
                      <span className="text-sm font-bold text-white">{s.score * 10}/100</span>
                    </div>
                    <div className="space-y-2.5 text-xs leading-relaxed">
                      <div>
                        <p className="text-white/50 mb-0.5">Score explanation</p>
                        <p className="text-white/85 leading-relaxed">{s.summary}</p>
                      </div>
                      {s.objections.length > 0 && (
                        <div>
                          <p className="text-white/50 mb-0.5">Key risks / objections</p>
                          <ul className="list-disc list-inside text-white/75 space-y-0.5">
                            {s.objections.map((o, i) => (
                              <li key={i}>{o}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div>
                        <p className="text-white/50 mb-0.5">Trade-offs (from this lens)</p>
                        <p className="text-white/60 italic">— Reflected in summary and objections above.</p>
                      </div>
                      <div>
                        <p className="text-white/50 mb-0.5">Evidence gaps</p>
                        <p className="text-white/60">—</p>
                      </div>
                      <div>
                        <p className="text-white/50 mb-0.5">Conditions that could change assessment</p>
                        <p className="text-white/60">—</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const SpeechRecognitionAPI =
  typeof window !== 'undefined' &&
  ((window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition)

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  abort(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

export function ProjectChatTab({
  projectId,
  projectName,
  projectDescription,
  onOpenDocuments,
}: {
  projectId: string
  projectName?: string
  projectDescription?: string
  onOpenDocuments?: () => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(['legal', 'financial', 'technical']))
  const [voiceAvailable, setVoiceAvailable] = useState(false)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [expandedThinkingId, setExpandedThinkingId] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  /** DM: when set, we're in a 1:1 chat with this specialist (opened via plus → choose specialist → confirm) */
  const [dmSpecialistId, setDmSpecialistId] = useState<string | null>(null)
  /** Plus menu: choice → pick specialist (DM) or decision form */
  const [plusOpen, setPlusOpen] = useState(false)
  const [plusStep, setPlusStep] = useState<'choice' | 'pick' | 'confirm' | 'decision_form'>('choice')
  const [plusSelectedSpecialist, setPlusSelectedSpecialist] = useState<Specialist | null>(null)
  /** Decision evaluation: form fields and result */
  const [decisionFormTitle, setDecisionFormTitle] = useState('')
  const [decisionFormDescription, setDecisionFormDescription] = useState('')
  const [decisionFormContext, setDecisionFormContext] = useState('')
  const [decisionLoading, setDecisionLoading] = useState(false)
  const [decisionResultsByMessageId, setDecisionResultsByMessageId] = useState<
    Record<string, DecisionEvaluateResponse>
  >({})
  const [openDecisionMessageId, setOpenDecisionMessageId] = useState<string | null>(null)
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')

  /** Voice call (DM or group): listen → send → play reply → listen again */
  const [inCall, setInCall] = useState(false)
  const [isListening, setIsListening] = useState(false)
  /** In group call: name of specialist currently speaking ("Legal", "Technical", etc.) */
  const [speakingNow, setSpeakingNow] = useState<string | null>(null)
  /** Call micropopover: open/closed */
  const [callPopoverOpen, setCallPopoverOpen] = useState(false)
  const callPopoverRef = useRef<HTMLDivElement>(null)
  /** When in call: who we're talking to (overrides selectedIds for sending). DM = [dmSpecialistId], group single = [id], group all = selectedIds */
  const [voiceCallTargetIds, setVoiceCallTargetIds] = useState<Set<string> | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const inCallRef = useRef(false)
  const lastAutoPlayedIdRef = useRef<string | null>(null)
  /** When in a decision call: message count at call start so we only auto-play new replies (listen first). */
  const messagesLengthAtCallStartRef = useRef(0)
  const sendMessageTextRef = useRef<(text: string) => void>(() => {})
  const [activeCallDecisionId, setActiveCallDecisionId] = useState<string | null>(null)
  const [latestDecisionForCall, setLatestDecisionForCall] = useState<ProjectDecisionSummary | null>(null)
  const [loadingDecisionForCall, setLoadingDecisionForCall] = useState(false)
  const [decisionForCallError, setDecisionForCallError] = useState<string | null>(null)
  /** In call popover: who to call (1 or more specialists, or all). Used to start the call; during call this is voiceCallTargetIds. */
  const [callParticipantIds, setCallParticipantIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    inCallRef.current = inCall
  }, [inCall])

  // Decision call: record message count at call start so we only auto-play new replies (listen first).
  useEffect(() => {
    if (inCall && activeCallDecisionId) {
      messagesLengthAtCallStartRef.current = allMessages.length
    }
  }, [inCall, activeCallDecisionId])

  // When call popover opens, init "who to call" from current chat selection (or all if none), and fetch latest decision.
  useEffect(() => {
    if (!callPopoverOpen) return
    const initial =
      dmSpecialistId
        ? new Set<string>([dmSpecialistId])
        : selectedIds.size > 0
          ? new Set(selectedIds)
          : new Set(mockSpecialists.map((s) => s.id))
    setCallParticipantIds(initial)
  }, [callPopoverOpen, dmSpecialistId, selectedIds])

  // When the call popover is open, fetch the most recent decision so it can be used as call context.
  useEffect(() => {
    if (!callPopoverOpen || loadingDecisionForCall || latestDecisionForCall || !projectId) return
    setLoadingDecisionForCall(true)
    setDecisionForCallError(null)
    getProjectDecisions(projectId)
      .then((list) => {
        setLatestDecisionForCall(list[0] ?? null)
      })
      .catch((err: unknown) => {
        setDecisionForCallError(err instanceof Error ? err.message : 'Failed to load decisions for call')
      })
      .finally(() => setLoadingDecisionForCall(false))
  }, [callPopoverOpen, loadingDecisionForCall, latestDecisionForCall, projectId])

  useEffect(() => {
    if (!callPopoverOpen) return
    const handler = (e: MouseEvent) => {
      if (callPopoverRef.current && !callPopoverRef.current.contains(e.target as Node)) {
        setCallPopoverOpen(false)
        setLatestDecisionForCall(null)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [callPopoverOpen])

  useEffect(() => {
    isVoiceAvailable().then(setVoiceAvailable)
  }, [])

  useEffect(() => {
    fetchProjectChat(projectId)
      .then((msgs) => {
        const threadMessages = msgs.map((m) => ({
          id: m.id,
          sender: m.sender,
          text: m.text,
          at: m.at,
          thinkingProcess: m.thinkingProcess,
          decisionId: m.decisionId,
        }))
        setMessages(threadMessages)

        // For any decision bubbles, hydrate their full breakdowns from the backend.
        // We key results by message id so clicking the bubble (which uses m.id) always works.
        const messageDecisionPairs = threadMessages
          .filter((m) => typeof m.decisionId === 'string' && m.decisionId.length > 0)
          .map((m) => ({ messageId: m.id, decisionId: m.decisionId as string }))

        if (messageDecisionPairs.length > 0) {
          Promise.all(
            messageDecisionPairs.map(async ({ messageId, decisionId }) => {
              try {
                const d = await getDecision(decisionId)
                return { messageId, decision: d }
              } catch {
                return null
              }
            })
          ).then((results) => {
            const map: Record<string, DecisionEvaluateResponse> = {}
            for (const item of results) {
              if (item && item.messageId) {
                map[item.messageId] = item.decision
              }
            }
            if (Object.keys(map).length > 0) {
              setDecisionResultsByMessageId((prev) => ({ ...prev, ...map }))
            }
          })
        }
      })
      .catch(() => setMessages([]))
  }, [projectId])

  const allMessages = dmSpecialistId
    ? messages.filter((m) => m.sender === 'user' || m.sender === dmSpecialistId)
    : messages

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [allMessages.length])

  const toggleSpecialist = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openDmWithSpecialist = (spec: Specialist) => {
    setPlusSelectedSpecialist(spec)
    setPlusStep('confirm')
  }

  const confirmDm = () => {
    if (plusSelectedSpecialist) {
      setDmSpecialistId(plusSelectedSpecialist.id)
      setSelectedIds(new Set([plusSelectedSpecialist.id]))
      setPlusOpen(false)
      setPlusStep('pick')
      setPlusSelectedSpecialist(null)
    }
  }

  const closeDm = () => {
    if (inCall) endCall()
    setDmSpecialistId(null)
    setSelectedIds(new Set(['legal', 'financial', 'technical']))
  }

  /** Play a single blob and resolve when ended (for group call sequence) */
  const playBlob = useCallback((blob: Blob): Promise<void> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => {
        URL.revokeObjectURL(url)
        resolve()
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Playback failed'))
      }
      audio.play().catch(reject)
    })
  }, [])

  const playVoice = useCallback(
    async (msg: ThreadMessage, onPlaybackEnded?: () => void, voiceCall?: boolean) => {
      if (msg.sender === 'user' || !voiceAvailable) return
      if (playingId === msg.id) {
        audioRef.current?.pause()
        setPlayingId(null)
        onPlaybackEnded?.()
        return
      }
      if (playingId) audioRef.current?.pause()
      setPlayingId(msg.id)
      try {
        const blob = await getVoiceAudio(msg.sender, msg.text, voiceCall ? { voiceCall: true } : undefined)
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => {
          URL.revokeObjectURL(url)
          setPlayingId(null)
          onPlaybackEnded?.()
        }
        audio.onerror = () => {
          setPlayingId(null)
          onPlaybackEnded?.()
        }
        await audio.play()
      } catch {
        setPlayingId(null)
        onPlaybackEnded?.()
      }
    },
    [voiceAvailable, playingId]
  )

  /** Group call: play each specialist's reply in order (no spoken intro); status bar shows who's talking */
  const playGroupReplyBatch = useCallback(
    async (batch: ThreadMessage[], onAllDone: () => void) => {
      if (!voiceAvailable || batch.length === 0) {
        onAllDone()
        return
      }
      try {
        for (const msg of batch) {
          if (msg.sender === 'user') continue
          const specialist = mockSpecialists.find((s) => s.id === msg.sender)
          const name = specialist?.name ?? msg.sender
          setSpeakingNow(name)
          try {
            const blob = await getVoiceAudio(msg.sender, msg.text, { voiceCall: true })
            await playBlob(blob)
          } catch {
            // skip on error
          }
        }
      } finally {
        setSpeakingNow(null)
        onAllDone()
      }
    },
    [voiceAvailable, playBlob]
  )

  const sendMessageText = useCallback(
    async (text: string) => {
      if (!text.trim()) return
      const userMsg: ThreadMessage = {
        id: `local-user-${Date.now()}`,
        sender: 'user',
        text: text.trim(),
        at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsLoading(true)
      const mentionIds = extractMentionedSpecialists(text)
      const specialistIds = (mentionIds.length > 0 ? mentionIds : Array.from(voiceCallTargetIds ?? selectedIds))
      try {
        const { responses } = await sendChatMessage(
          projectId,
          text.trim(),
          specialistIds,
          activeCallDecisionId ?? undefined
        )
        const now = new Date().toISOString()
        const newMessages: ThreadMessage[] = responses.map((r, i) => ({
          id: `local-spec-${Date.now()}-${i}`,
          sender: r.specialist_id,
          text: r.text,
          at: now,
          thinkingProcess: r.thinking_process,
        }))
        setMessages((prev) => [...prev, ...newMessages])
      } catch (err) {
        const fallback: ThreadMessage = {
          id: `local-spec-${Date.now()}`,
          sender: specialistIds[0] ?? 'legal',
          text: `Could not reach AI: ${err instanceof Error ? err.message : 'Unknown error'}. Is the backend running at http://localhost:8000?`,
          at: new Date().toISOString(),
          thinkingProcess: 'Backend unavailable or API key not configured.',
        }
        setMessages((prev) => [...prev, fallback])
      } finally {
        setIsLoading(false)
      }
    },
    [projectId, selectedIds, voiceCallTargetIds, activeCallDecisionId]
  )
  sendMessageTextRef.current = sendMessageText

  const handleSend = async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    setMentionOpen(false)
    setMentionQuery('')
    await sendMessageText(text)
  }

  const restartListening = useCallback(() => {
    if (!inCallRef.current || !recognitionRef.current) return
    try {
      recognitionRef.current.start()
      setIsListening(true)
    } catch {
      setIsListening(false)
    }
  }, [])

  const startCallWith = useCallback((targetIds: Set<string>) => {
    if (!voiceAvailable || !SpeechRecognitionAPI || targetIds.size === 0) return
    setVoiceCallTargetIds(targetIds)
    setInCall(true)
    setCallPopoverOpen(false)
    lastAutoPlayedIdRef.current = null
    setSpeakingNow(null)
    try {
      recognitionRef.current?.start()
      setIsListening(true)
    } catch {
      setInCall(false)
      setVoiceCallTargetIds(null)
    }
  }, [voiceAvailable])

  /** Start a decision call: participants + decision context, then listen first (mic on immediately). */
  const startDecisionCall = useCallback(
    (participantIds: Set<string>, decisionId: string) => {
      if (!voiceAvailable || !SpeechRecognitionAPI || participantIds.size === 0) return
      setVoiceCallTargetIds(participantIds)
      setActiveCallDecisionId(decisionId)
      setInCall(true)
      setCallPopoverOpen(false)
      setLatestDecisionForCall(null)
      lastAutoPlayedIdRef.current = null
      setSpeakingNow(null)
      try {
        recognitionRef.current?.start()
        setIsListening(true)
      } catch {
        setInCall(false)
        setVoiceCallTargetIds(null)
        setActiveCallDecisionId(null)
      }
    },
    [voiceAvailable]
  )

  const startCall = useCallback(() => {
    if (dmSpecialistId) {
      startCallWith(new Set([dmSpecialistId]))
    } else if (selectedIds.size > 0) {
      startCallWith(selectedIds)
    }
  }, [dmSpecialistId, selectedIds, startCallWith])

  const endCall = useCallback(() => {
    setInCall(false)
    setVoiceCallTargetIds(null)
    setActiveCallDecisionId(null)
    setIsListening(false)
    setSpeakingNow(null)
    lastAutoPlayedIdRef.current = null
    messagesLengthAtCallStartRef.current = 0
    try {
      recognitionRef.current?.abort()
    } catch {}
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPlayingId(null)
  }, [])

  useEffect(() => {
    if (!SpeechRecognitionAPI) return
    const rec = new SpeechRecognitionAPI()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = 'en-US'
    rec.onresult = (e: { results: ArrayLike<ArrayLike<{ transcript?: string }>> }) => {
      const transcript = e.results[0]?.[0]?.transcript
      if (typeof transcript === 'string' && transcript.trim()) {
        sendMessageTextRef.current(transcript.trim())
      }
    }
    rec.onend = () => {
      if (inCallRef.current) setIsListening(false)
    }
    rec.onerror = () => setIsListening(false)
    recognitionRef.current = rec
    return () => {
      try {
        rec.abort()
      } catch {}
    }
  }, [])

  useEffect(() => {
    if (!inCall || isLoading || allMessages.length === 0) return
    const last = allMessages[allMessages.length - 1]
    if (last.sender === 'user') return
    if (lastAutoPlayedIdRef.current === last.id) return

    // Decision call: listen first — only auto-play replies that arrived after the user spoke during this call.
    if (activeCallDecisionId && allMessages.length <= messagesLengthAtCallStartRef.current) return

    const isSingleReply = dmSpecialistId || (voiceCallTargetIds?.size === 1)
    if (isSingleReply) {
      lastAutoPlayedIdRef.current = last.id
      playVoice(last, () => {
        if (inCallRef.current) restartListening()
      }, true)
      return
    }

    const batch: ThreadMessage[] = []
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const m = allMessages[i]
      if (m.sender === 'user') break
      batch.unshift(m)
    }
    if (batch.length === 0) return
    lastAutoPlayedIdRef.current = last.id
    playGroupReplyBatch(batch, () => {
      if (inCallRef.current) restartListening()
    })
  }, [inCall, dmSpecialistId, voiceCallTargetIds, activeCallDecisionId, isLoading, allMessages, playVoice, playGroupReplyBatch, restartListening])

  const specialistsInChat = mockSpecialists.filter((s) => selectedIds.has(s.id))

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[560px] rounded-xl border border-white/10 bg-surface-800/90 backdrop-blur overflow-hidden animate-fade-in">
      {/* Left: Chat area (WhatsApp style) */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Chat header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-surface-800 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {dmSpecialistId ? (
                <button
                  type="button"
                  onClick={closeDm}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors shrink-0"
                  title="Back to group chat"
                >
                  <ion-icon name="arrow-back" className="text-xl text-white/80" />
                </button>
              ) : (
                <button
                  type="button"
                  className="p-2 rounded-full hover:bg-white/10 transition-colors shrink-0"
                  title="Group info"
                >
                  <ion-icon name="information-circle-outline" className="text-xl text-white/80" />
                </button>
              )}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={dmSpecialistId && specialistsInChat[0] ? { backgroundColor: specialistsInChat[0].color } : {}}
              >
                {dmSpecialistId && specialistsInChat[0] ? (
                  <span className="text-white font-bold text-sm">{specialistsInChat[0].name.slice(0, 1)}</span>
                ) : (
                  <ion-icon name="people" size="small" className="text-white text-xl" />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-white truncate">
                  {dmSpecialistId && specialistsInChat[0]
                    ? `${specialistsInChat[0].name} — ${projectName ?? 'Project'}`
                    : projectName ?? 'Project chat'}
                </h2>
                <p className="text-xs text-white/50 truncate">
                  {dmSpecialistId ? 'Direct message' : `${specialistsInChat.length} specialist${specialistsInChat.length !== 1 ? 's' : ''} in chat`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 relative" ref={callPopoverRef}>
              {projectId && (
                inCall ? (
                  <button
                    type="button"
                    onClick={endCall}
                    className="p-2.5 rounded-full bg-red-600/90 text-white hover:bg-red-500 transition-colors"
                    title="End call"
                  >
                    <ion-icon name="call" className="text-xl" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setCallPopoverOpen((o) => !o)}
                      className="p-2.5 rounded-full bg-emerald-600/90 text-white hover:bg-emerald-500 transition-colors"
                      title="Start voice call"
                    >
                      <ion-icon name="call-outline" className="text-xl" />
                    </button>
                    {callPopoverOpen && (
                      <div className="absolute right-0 top-full mt-1 z-30 min-w-[200px] py-1 rounded-xl bg-surface-800 border border-white/10 shadow-xl">
                        {(!voiceAvailable || !SpeechRecognitionAPI) ? (
                          <div className="px-3 py-3 text-sm text-white/70">
                            {!voiceAvailable && (
                              <p>Voice requires ElevenLabs. Add <code className="text-xs bg-white/10 px-1 rounded">ELEVENLABS_API_KEY</code> to .env</p>
                            )}
                            {voiceAvailable && !SpeechRecognitionAPI && (
                              <p>Voice not supported in this browser. Use Chrome or Edge.</p>
                            )}
                          </div>
                        ) : (
                          <div className="px-2 py-1 min-w-[240px]">
                            <p className="px-1 pb-1 text-[11px] uppercase tracking-wide text-white/40">
                              Who to call
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {mockSpecialists.map((s) => {
                                const selected = callParticipantIds.has(s.id)
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => {
                                      setCallParticipantIds((prev) => {
                                        const next = new Set(prev)
                                        if (next.has(s.id)) next.delete(s.id)
                                        else next.add(s.id)
                                        return next
                                      })
                                    }}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                                      selected ? 'ring-1 ring-white/30' : 'opacity-80 hover:opacity-100'
                                    }`}
                                    style={{
                                      backgroundColor: selected ? s.color + '40' : 'transparent',
                                      color: s.color,
                                    }}
                                  >
                                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: s.color }}>
                                      {s.name.slice(0, 1)}
                                    </span>
                                    {s.name}
                                    {selected && <ion-icon name="checkmark" className="text-sm" />}
                                  </button>
                                )
                              })}
                              <button
                                type="button"
                                onClick={() => {
                                  const allIds = new Set(mockSpecialists.map((x) => x.id))
                                  setCallParticipantIds(allIds)
                                }}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white/80 hover:bg-white/10"
                              >
                                <ion-icon name="people" />
                                All
                              </button>
                            </div>

                            <div className="mt-2 pt-2 border-t border-white/10">
                              <p className="px-1 pb-1 text-[11px] uppercase tracking-wide text-white/40">
                                Decision context
                              </p>
                              <p className="px-1 text-[11px] text-white/50 mb-1">
                                AI will answer only from this decision and project docs.
                              </p>
                              {loadingDecisionForCall ? (
                                <div className="px-3 py-2 text-xs text-white/60">Loading most recent decision…</div>
                              ) : decisionForCallError ? (
                                <div className="px-3 py-2 text-xs text-red-300">
                                  Could not load decisions: {decisionForCallError}
                                </div>
                              ) : latestDecisionForCall ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (callParticipantIds.size === 0) return
                                    startDecisionCall(new Set(callParticipantIds), latestDecisionForCall.id)
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-xs text-white/80"
                                >
                                  <div className="flex items-center gap-2">
                                    <ion-icon
                                      name="git-branch-outline"
                                      className="text-base text-accent-cyan shrink-0"
                                    />
                                    <div className="min-w-0">
                                      <p className="font-medium truncate">
                                        Start call — {callParticipantIds.size} specialist{callParticipantIds.size !== 1 ? 's' : ''}
                                      </p>
                                      <p className="text-[11px] text-white/50 truncate">
                                        {latestDecisionForCall.title}
                                      </p>
                                    </div>
                                  </div>
                                </button>
                              ) : (
                                <div className="px-3 py-2 text-xs text-white/50">
                                  No decisions yet. Run an evaluation first.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )
              )}
              <button type="button" className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Search">
                <ion-icon name="search-outline" className="text-xl text-white/70" />
              </button>
              <button type="button" className="p-2 rounded-full hover:bg-white/10 transition-colors" title="More">
                <ion-icon name="ellipsis-vertical" className="text-xl text-white/70" />
              </button>
            </div>
          </div>

        {/* WhatsApp-style voice call module (overlay when in call) */}
        {inCall && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-surface-900/95 backdrop-blur-sm p-6">
            <div className="flex flex-col items-center gap-6 max-w-md w-full">
              <p className="text-sm text-white/50">Voice call — {projectName ?? 'Project'}</p>
              <div className="flex flex-wrap items-end justify-center gap-8">
                {Array.from(voiceCallTargetIds ?? selectedIds).map((id) => {
                  const spec = mockSpecialists.find((s) => s.id === id)
                  if (!spec) return null
                  const isSpeaking = speakingNow === spec.name
                  return (
                    <div key={id} className="flex flex-col items-center gap-2">
                      <div
                        className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white shrink-0 transition-all ${
                          isSpeaking ? 'ring-4 ring-emerald-400/80 scale-105' : ''
                        }`}
                        style={{ backgroundColor: spec.color }}
                      >
                        {spec.name.slice(0, 1)}
                      </div>
                      <span className="text-sm font-medium text-white/90">{spec.name}</span>
                      <span className="text-xs text-white/60 min-h-[1rem]">
                        {isSpeaking ? (
                          <span className="text-emerald-300">{spec.name} is speaking</span>
                        ) : isLoading && !speakingNow ? (
                          'Thinking…'
                        ) : null}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="text-sm text-white/60 min-h-[1.5rem]">
                {isListening ? (
                  <span className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    Listening… speak now
                  </span>
                ) : isLoading && !speakingNow ? (
                  'Consultants thinking…'
                ) : speakingNow ? (
                  `${speakingNow} is speaking`
                ) : (
                  'Connecting…'
                )}
              </p>
              <button
                type="button"
                onClick={endCall}
                className="flex items-center justify-center w-14 h-14 rounded-full bg-red-600 text-white hover:bg-red-500 transition-colors"
                title="End call"
              >
                <ion-icon name="call" className="text-2xl" />
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-surface-900/40 p-4 space-y-2 min-h-0">
          {allMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-8 max-w-lg mx-auto text-center">
              {dmSpecialistId && specialistsInChat[0] ? (
                <>
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mb-4"
                    style={{ backgroundColor: specialistsInChat[0].color }}
                  >
                    {specialistsInChat[0].name.slice(0, 1)}
                  </div>
                  <h3 className="font-medium text-white/80 mb-2">Direct message with {specialistsInChat[0].name}</h3>
                  <p className="text-sm text-white/60 leading-relaxed">
                    About {projectName ?? 'this project'}. Send a message to start the conversation.
                  </p>
                </>
              ) : (
                <>
                  <ion-icon name="document-text-outline" className="text-4xl text-white/40 mb-4" />
                  <h3 className="font-medium text-white/80 mb-2">{projectName ?? 'Project'}</h3>
                  <p className="text-sm text-white/60 leading-relaxed">
                    {projectDescription ?? 'No project summary available.'}
                  </p>
                  <p className="text-xs text-white/40 mt-4">Add specialists on the right or use + to start a direct chat.</p>
                </>
              )}
            </div>
          ) : (
            allMessages.map((m) => {
              const isUser = m.sender === 'user'
              const specialist = !isUser ? mockSpecialists.find((s) => s.id === m.sender) : null
              const decision = decisionResultsByMessageId[m.id]
              const isDecisionMsg = m.sender === 'decision'
              const hasThinking = !isUser && m.thinkingProcess && !isDecisionMsg
              const isExpanded = expandedThinkingId === m.id
              return (
                <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex gap-2 max-w-[85%] ${isUser ? 'flex-row-reverse' : ''}`}>
                    {!isUser && specialist && (
                      <div
                        className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: specialist.color }}
                      >
                        {specialist.name.slice(0, 1)}
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <div
                        role="button"
                        className={`rounded-2xl px-4 py-2.5 shadow-sm text-left transition-opacity ${
                          isUser
                            ? 'bg-emerald-600/90 text-white rounded-br-md cursor-default'
                            : isDecisionMsg
                              ? 'bg-surface-700 text-white/90 border border-accent-cyan/40 rounded-bl-md hover:border-accent-cyan/70 cursor-pointer'
                              : hasThinking
                                ? 'bg-surface-700 text-white/90 border border-white/10 rounded-bl-md hover:border-white/20 cursor-pointer'
                                : 'bg-surface-700 text-white/90 border border-white/10 rounded-bl-md cursor-default'
                        }`}
                        onClick={async () => {
                          if (isDecisionMsg) {
                            let data = decisionResultsByMessageId[m.id]
                            if (!data && 'decisionId' in m && m.decisionId) {
                              try {
                                data = await getDecision(m.decisionId)
                                setDecisionResultsByMessageId((prev) => ({ ...prev, [m.id]: data }))
                              } catch {
                                return
                              }
                            }
                            if (data) setOpenDecisionMessageId(m.id)
                          } else if (hasThinking) {
                            setExpandedThinkingId((id) => (id === m.id ? null : m.id))
                          }
                        }}
                      >
                        {!isUser && specialist && !isDecisionMsg && (
                          <p className="text-xs font-medium mb-1 flex items-center gap-1" style={{ color: specialist.color }}>
                            {specialist.name}
                            {hasThinking && (
                              <ion-icon
                                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                className="text-[10px] opacity-70"
                              />
                            )}
                          </p>
                        )}
                        {isDecisionMsg ? (
                          <p className="flex items-center gap-2 text-sm text-white/90">
                            <ion-icon name="git-branch-outline" className="text-base text-accent-cyan" />
                            <span className="truncate">{m.text}</span>
                          </p>
                        ) : (
                          <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>
                        )}
                        <p className={`text-[10px] mt-1 flex items-center gap-1 justify-end ${isUser ? 'text-emerald-200/70' : 'text-white/40'}`}>
                          {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {isUser && <ion-icon name="checkmark-done" className="text-xs" />}
                          {!isUser && specialist && voiceAvailable && !isDecisionMsg && (
                            <button
                              type="button"
                              onClick={() => playVoice(m)}
                              className="p-1 rounded hover:bg-white/10"
                              title="Play voice"
                            >
                              <ion-icon
                                name={playingId === m.id ? 'stop-circle' : 'play-circle'}
                                className="text-base"
                              />
                            </button>
                          )}
                          {hasThinking && !isExpanded && (
                            <span className="text-white/40">Click to see thinking</span>
                          )}
                          {isDecisionMsg && (
                            <span className="text-white/40">Click to see full breakdown</span>
                          )}
                        </p>
                      </div>
                      {hasThinking && isExpanded && (
                        <div className="rounded-xl px-4 py-3 bg-surface-800/90 border border-white/10 text-xs text-white/70 whitespace-pre-wrap">
                          <p className="font-medium text-white/80 mb-2 flex items-center gap-1">
                            <ion-icon name="bulb-outline" />
                            Thinking process
                          </p>
                          <p className="leading-relaxed">{m.thinkingProcess}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-surface-600 shrink-0 flex items-center justify-center">
                  <ion-icon name="ellipsis-horizontal" className="text-white/60" />
                </div>
                <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-surface-700 border border-white/10">
                  <span className="text-white/50 text-sm">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Plus menu: choice → chat with specialist (pick/confirm) or evaluate decision (form) */}
        {plusOpen && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-surface-800 border border-white/10 rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <h3 className="font-semibold text-white">
                  {plusStep === 'choice' && 'What do you want to do?'}
                  {plusStep === 'pick' && 'Who do you want to talk to?'}
                  {plusStep === 'confirm' && 'Confirm'}
                  {plusStep === 'decision_form' && 'Evaluate a decision'}
                </h3>
                <button
                  type="button"
                  onClick={() => { setPlusOpen(false); setPlusStep('choice'); setPlusSelectedSpecialist(null) }}
                  className="p-2 rounded-full hover:bg-white/10 text-white/70"
                >
                  <ion-icon name="close" className="text-xl" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {plusStep === 'choice' && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setPlusStep('pick')}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-white/10 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-emerald-600/80 flex items-center justify-center">
                        <ion-icon name="chatbubble-outline" className="text-white text-xl" />
                      </div>
                      <span className="flex-1 text-sm text-white">Chat with a specialist</span>
                      <ion-icon name="chevron-forward" className="text-white/50 text-lg" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlusStep('decision_form')}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-white/10 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-amber-600/80 flex items-center justify-center">
                        <ion-icon name="document-text-outline" className="text-white text-xl" />
                      </div>
                      <span className="flex-1 text-sm text-white">Evaluate a decision</span>
                      <ion-icon name="chevron-forward" className="text-white/50 text-lg" />
                    </button>
                  </div>
                )}

                {plusStep === 'decision_form' && (
                  <form
                    className="space-y-4"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (!decisionFormTitle.trim() || !decisionFormDescription.trim()) return
                      setDecisionLoading(true)
                      try {
                        const res = await evaluateDecision(projectId, {
                          title: decisionFormTitle.trim(),
                          description: decisionFormDescription.trim(),
                          context: decisionFormContext.trim() || undefined,
                        })
                        const now = new Date().toISOString()
                        const decisionMsgId = `decision-${Date.now()}`
                        setMessages((prev) => [
                          ...prev,
                          {
                            id: decisionMsgId,
                            sender: 'decision',
                            text: res.decision_title,
                            at: now,
                          },
                        ])
                        setDecisionResultsByMessageId((prev) => ({
                          ...prev,
                          [decisionMsgId]: res,
                        }))
                        setPlusOpen(false)
                        setPlusStep('choice')
                        setDecisionFormTitle('')
                        setDecisionFormDescription('')
                        setDecisionFormContext('')
                      } catch (err) {
                        console.error(err)
                      } finally {
                        setDecisionLoading(false)
                      }
                    }}
                  >
                    <p className="text-xs text-white/50 mb-2">Basic info about the decision</p>
                    <div>
                      <label className="block text-xs font-medium text-white/60 mb-1">Title *</label>
                      <input
                        type="text"
                        value={decisionFormTitle}
                        onChange={(e) => setDecisionFormTitle(e.target.value)}
                        placeholder="e.g. Narrow to personal statements only"
                        className="w-full rounded-lg px-3 py-2 bg-surface-700 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/60 mb-1">Description *</label>
                      <textarea
                        value={decisionFormDescription}
                        onChange={(e) => setDecisionFormDescription(e.target.value)}
                        placeholder="What’s the decision? Key assumptions, constraints..."
                        rows={3}
                        className="w-full rounded-lg px-3 py-2 bg-surface-700 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/60 mb-1">Extra context (optional)</label>
                      <textarea
                        value={decisionFormContext}
                        onChange={(e) => setDecisionFormContext(e.target.value)}
                        placeholder="Any additional context for the specialists..."
                        rows={2}
                        className="w-full rounded-lg px-3 py-2 bg-surface-700 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => { setPlusStep('choice') }}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-white/20 text-white/80 hover:bg-white/10"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={decisionLoading || !decisionFormTitle.trim() || !decisionFormDescription.trim()}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {decisionLoading ? 'Evaluating…' : 'Evaluate'}
                      </button>
                    </div>
                  </form>
                )}

                {plusStep === 'pick' && (
                  <ul className="space-y-1">
                    {mockSpecialists.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => openDmWithSpecialist(s)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-white/10 transition-colors"
                        >
                          <div
                            className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white"
                            style={{ backgroundColor: s.color }}
                          >
                            {s.name.slice(0, 1)}
                          </div>
                          <span className="flex-1 text-sm text-white">{s.name}</span>
                          <ion-icon name="chevron-forward" className="text-white/50 text-lg" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {plusStep === 'confirm' && (
                  <div className="space-y-4">
                    {plusSelectedSpecialist && (
                      <>
                        <p className="text-sm text-white/80">
                          Chat with <strong style={{ color: plusSelectedSpecialist.color }}>{plusSelectedSpecialist.name}</strong> about this project?
                        </p>
                        <div className="rounded-xl bg-surface-700/80 border border-white/10 p-3">
                          <p className="text-xs text-white/50 mb-1">Project</p>
                          <p className="font-medium text-white">{projectName ?? 'Project'}</p>
                          {projectDescription && (
                            <p className="text-sm text-white/60 mt-1 line-clamp-2">{projectDescription}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setPlusStep('pick'); setPlusSelectedSpecialist(null) }}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-white/20 text-white/80 hover:bg-white/10"
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            onClick={confirmDm}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
                          >
                            Start chat
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Input bar (WhatsApp style) */}
        <div className="p-2 border-t border-white/10 bg-surface-800 shrink-0 relative">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setPlusOpen(true); setPlusStep('choice'); setPlusSelectedSpecialist(null) }}
              className="p-2.5 rounded-full hover:bg-white/10 text-white/60 transition-colors"
              title="Add: chat or evaluate decision"
            >
              <ion-icon name="add-circle-outline" className="text-2xl" />
            </button>
            <div className="relative flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => {
                  const val = e.target.value
                  setInput(val)
                  const beforeCursor = val.slice(0, e.target.selectionStart ?? val.length)
                  const match = beforeCursor.match(/@([\w]*)$/)
                  if (match) {
                    setMentionOpen(true)
                    setMentionQuery(match[1].toLowerCase())
                  } else {
                    setMentionOpen(false)
                    setMentionQuery('')
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                    return
                  }
                }}
                placeholder="Message"
                className="w-full rounded-full px-4 py-2.5 bg-surface-700 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
              {mentionOpen && (
                <div className="absolute left-0 bottom-full mb-1 w-56 rounded-xl bg-surface-800 border border-white/10 shadow-xl z-10">
                  <ul className="max-h-56 overflow-y-auto py-1">
                    {mockSpecialists
                      .filter((s) => {
                        if (!mentionQuery) return true
                        return (
                          s.name.toLowerCase().includes(mentionQuery) ||
                          s.id.toLowerCase().includes(mentionQuery)
                        )
                      })
                      .map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-white hover:bg-white/10"
                            onClick={() => {
                              const val = input
                              const match = val.match(/@[\w]*$/)
                              const handle = `@${s.id}`
                              const next =
                                match && match.index !== undefined
                                  ? val.slice(0, match.index) + handle + ' ' + val.slice(match.index + match[0].length)
                                  : val + handle + ' '
                              setInput(next)
                              setMentionOpen(false)
                              setMentionQuery('')
                            }}
                          >
                            <span
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                              style={{ backgroundColor: s.color }}
                            >
                              {s.name.slice(0, 1)}
                            </span>
                            <span className="flex-1 truncate">
                              <span className="text-white/90 mr-1">{s.name}</span>
                              <span className="text-white/40">@{s.id}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isLoading || selectedIds.size === 0}
              className="p-2.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Send"
            >
              <ion-icon name="send" className="text-xl" />
            </button>
          </div>
        </div>
        {openDecisionMessageId && decisionResultsByMessageId[openDecisionMessageId] ? (
          <DecisionBreakdownModal
            decision={decisionResultsByMessageId[openDecisionMessageId]}
            onClose={() => setOpenDecisionMessageId(null)}
          />
        ) : null}
      </div>

      {/* Right: Group details + Specialists in chat */}
      <aside className="w-72 border-l border-white/10 bg-surface-800/95 flex flex-col shrink-0">
        {/* Group / project info */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-emerald-600/80 flex items-center justify-center">
              <ion-icon name="document-text" className="text-white text-2xl" />
            </div>
            <div>
              <h3 className="font-semibold text-white">{projectName ?? 'Project'}</h3>
              <p className="text-xs text-white/50">Group chat</p>
            </div>
          </div>
          {projectDescription && (
            <p className="text-sm text-white/60 line-clamp-2">{projectDescription}</p>
          )}
        </div>

        {/* Specialists in this chat (or DM info) */}
        <div className="flex-1 overflow-y-auto p-3">
          {dmSpecialistId ? (
            <div className="space-y-3">
              <p className="text-xs font-medium text-white/70">Direct message</p>
              {specialistsInChat[0] && (
                <div
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/10"
                  style={{ borderLeft: `3px solid ${specialistsInChat[0].color}` }}
                >
                  <div
                    className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white"
                    style={{ backgroundColor: specialistsInChat[0].color }}
                  >
                    {specialistsInChat[0].name.slice(0, 1)}
                  </div>
                  <span className="text-sm text-white">{specialistsInChat[0].name}</span>
                </div>
              )}
              <button
                type="button"
                onClick={closeDm}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              >
                <ion-icon name="people-outline" />
                <span>Back to group chat</span>
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-white/60">Specialists in chat</span>
                <span className="text-xs text-white/40">{selectedIds.size}/5</span>
              </div>
              <ul className="space-y-1">
                {mockSpecialists.map((s) => {
                  const inChat = selectedIds.has(s.id)
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => toggleSpecialist(s.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                          inChat ? 'bg-white/10' : 'hover:bg-white/5'
                        }`}
                      >
                        <div
                          className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white"
                          style={{ backgroundColor: inChat ? s.color : undefined }}
                        >
                          {inChat ? s.name.slice(0, 1) : <ion-icon name="add" className="text-white/60" />}
                        </div>
                        <span className={`flex-1 text-sm truncate ${inChat ? 'text-white' : 'text-white/50'}`}>
                          {s.name}
                        </span>
                        {inChat ? (
                          <ion-icon name="checkmark-circle" style={{ color: s.color }} className="shrink-0 text-lg" />
                        ) : (
                          <ion-icon name="add-circle-outline" className="shrink-0 text-lg text-white/40" />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {selectedIds.size === 0 && (
                <p className="text-xs text-amber-400/90 mt-3 px-1">
                  Add at least one specialist to get replies, or use + to start a direct chat.
                </p>
              )}
            </>
          )}
        </div>

        {/* Optional footer in sidebar */}
        <div className="p-3 border-t border-white/10">
          <button
            type="button"
            onClick={() => onOpenDocuments?.()}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/60 hover:bg-white/5 hover:text-white/80 transition-colors"
          >
            <ion-icon name="document-attach-outline" />
            <span>Document attachments</span>
          </button>
        </div>
      </aside>
    </div>
  )
}
