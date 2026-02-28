import { useState, useRef, useEffect, useCallback } from 'react'
import type { Specialist, ThreadMessage } from '../data/mock'
import { mockSpecialists } from '../data/mock'
import { sendChatMessage } from '../api/chat'
import { getProjectChat as fetchProjectChat } from '../api/chatMessages'
import { isVoiceAvailable, getVoiceAudio } from '../api/voice'
import { evaluateDecision } from '../api/decision'
import type { DecisionEvaluateResponse } from '../api/decision'

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
  const [decisionResult, setDecisionResult] = useState<DecisionEvaluateResponse | null>(null)

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
  const sendMessageTextRef = useRef<(text: string) => void>(() => {})

  useEffect(() => {
    inCallRef.current = inCall
  }, [inCall])

  useEffect(() => {
    if (!callPopoverOpen) return
    const handler = (e: MouseEvent) => {
      if (callPopoverRef.current && !callPopoverRef.current.contains(e.target as Node)) {
        setCallPopoverOpen(false)
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
        setMessages(
          msgs.map((m) => ({
            id: m.id,
            sender: m.sender,
            text: m.text,
            at: m.at,
            thinkingProcess: m.thinkingProcess,
          }))
        )
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
      const specialistIds = Array.from(voiceCallTargetIds ?? selectedIds)
      try {
        const { responses } = await sendChatMessage(projectId, text.trim(), specialistIds)
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
    [projectId, selectedIds, voiceCallTargetIds]
  )
  sendMessageTextRef.current = sendMessageText

  const handleSend = async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
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
    setIsListening(false)
    setSpeakingNow(null)
    lastAutoPlayedIdRef.current = null
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
  }, [inCall, dmSpecialistId, voiceCallTargetIds, isLoading, allMessages, playVoice, playGroupReplyBatch, restartListening])

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
              {(dmSpecialistId || selectedIds.size > 0) && (
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
                        ) : dmSpecialistId && specialistsInChat[0] ? (
                          <button
                            type="button"
                            onClick={() => startCallWith(new Set([dmSpecialistId!]))}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-white hover:bg-white/10"
                          >
                            <div
                              className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
                              style={{ backgroundColor: specialistsInChat[0].color }}
                            >
                              {specialistsInChat[0].name.slice(0, 1)}
                            </div>
                            <span>Start call with {specialistsInChat[0].name}</span>
                          </button>
                        ) : (
                          <>
                            {specialistsInChat.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => startCallWith(new Set([s.id]))}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-white hover:bg-white/10"
                              >
                                <div
                                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
                                  style={{ backgroundColor: s.color }}
                                >
                                  {s.name.slice(0, 1)}
                                </div>
                                <span>Start call with {s.name}</span>
                              </button>
                            ))}
                            {specialistsInChat.length > 1 && (
                              <button
                                type="button"
                                onClick={() => startCallWith(selectedIds)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-white hover:bg-white/10 border-t border-white/10 mt-1 pt-2"
                              >
                                <ion-icon name="people" className="text-lg text-white/70" />
                                <span>Start group call</span>
                              </button>
                            )}
                          </>
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
              const hasThinking = !isUser && m.thinkingProcess
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
                      <button
                        type="button"
                        className={`rounded-2xl px-4 py-2.5 shadow-sm text-left transition-opacity ${
                          isUser
                            ? 'bg-emerald-600/90 text-white rounded-br-md cursor-default'
                            : hasThinking
                              ? 'bg-surface-700 text-white/90 border border-white/10 rounded-bl-md hover:border-white/20 cursor-pointer'
                              : 'bg-surface-700 text-white/90 border border-white/10 rounded-bl-md cursor-default'
                        }`}
                        onClick={() => hasThinking && setExpandedThinkingId((id) => (id === m.id ? null : m.id))}
                      >
                        {!isUser && specialist && (
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
                        <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>
                                <p className={`text-[10px] mt-1 flex items-center gap-1 justify-end ${isUser ? 'text-emerald-200/70' : 'text-white/40'}`}>
                          {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {isUser && <ion-icon name="checkmark-done" className="text-xs" />}
                          {!isUser && voiceAvailable && (
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
                        </p>
                      </button>
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
                        setDecisionResult(res)
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
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Message"
              className="flex-1 rounded-full px-4 py-2.5 bg-surface-700 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
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

        {/* Decision scoring (when + → Evaluate a decision has been used) */}
        {decisionResult && (
          <div className="p-3 border-b border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-white/70">Decision scoring</span>
              <button
                type="button"
                onClick={() => setDecisionResult(null)}
                className="text-xs text-white/50 hover:text-white/80"
              >
                Dismiss
              </button>
            </div>
            <p className="font-medium text-white text-sm mb-3 truncate" title={decisionResult.decision_title}>
              {decisionResult.decision_title}
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {decisionResult.scores.map((s) => {
                const spec = mockSpecialists.find((m) => m.id === s.specialist_id)
                const color = spec?.color ?? '#6b7280'
                return (
                  <div
                    key={s.specialist_id}
                    className="rounded-lg bg-surface-700/80 border border-white/10 p-2"
                    style={{ borderLeftWidth: 3, borderLeftColor: color }}
                  >
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-xs font-medium text-white/90">{s.specialist_name}</span>
                      <span className="text-xs font-bold text-white/90">{s.score}/10</span>
                    </div>
                    <p className="text-[11px] text-white/70 line-clamp-2">{s.summary}</p>
                    {s.objections.length > 0 && (
                      <ul className="mt-1 text-[10px] text-white/50 list-disc list-inside">
                        {s.objections.slice(0, 2).map((o, i) => (
                          <li key={i}>{o}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="mt-3 space-y-1.5 text-[11px]">
              <p><span className="text-white/50">Agreement:</span> <span className="text-white/80">{decisionResult.agreement}</span></p>
              <p><span className="text-white/50">Tradeoffs:</span> <span className="text-white/80">{decisionResult.tradeoffs}</span></p>
            </div>
          </div>
        )}

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
