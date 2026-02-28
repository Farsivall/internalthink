import { useState, useRef, useEffect } from 'react'
import type { PersonaScore } from '../data/mock'
import type { ThreadMessage } from '../data/mock'

export function PersonaChatPanel({
  personas,
  threadsByPersona,
  onSendMessage,
  isLoading,
}: {
  personas: PersonaScore[]
  /** Thread messages per persona (key = personaId) */
  threadsByPersona: Record<string, ThreadMessage[]>
  onSendMessage?: (text: string) => void
  isLoading?: boolean
}) {
  const [activePersona, setActivePersona] = useState(personas[0]?.personaId ?? '')
  const [input, setInput] = useState('')
  const [localByPersona, setLocalByPersona] = useState<Record<string, ThreadMessage[]>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const activePersonaInfo = personas.find((p) => p.personaId === activePersona)

  const thread = threadsByPersona[activePersona] ?? []
  const localMessages = localByPersona[activePersona] ?? []
  const allMessages = [...thread, ...localMessages]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [allMessages.length])

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    const userMsg: ThreadMessage = {
      id: `local-${Date.now()}`,
      sender: 'user',
      text,
      at: new Date().toISOString(),
    }
    setLocalByPersona((prev) => ({
      ...prev,
      [activePersona]: [...(prev[activePersona] ?? []), userMsg],
    }))
    onSendMessage?.(text)
  }

  return (
    <div className="flex flex-col rounded-xl bg-surface-800/90 backdrop-blur border border-white/10 overflow-hidden animate-fade-in h-[420px]">
      {/* Persona tabs */}
      <div className="flex border-b border-white/10 shrink-0">
        {personas.map((p) => (
          <button
            key={p.personaId}
            type="button"
            onClick={() => setActivePersona(p.personaId)}
            className={`px-4 py-3 text-sm font-medium transition-all duration-200 ${
              activePersona === p.personaId
                ? 'border-b-2 text-white bg-surface-700/50'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
            style={activePersona === p.personaId ? { borderBottomColor: p.color } : {}}
          >
            {p.personaName}
          </button>
        ))}
      </div>

      {/* Chat messages - WhatsApp style */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {allMessages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-white/40 text-sm">
            No messages yet. Ask this persona anything about the decision.
          </div>
        ) : (
          allMessages.map((m) => {
            const isUser = m.sender === 'user'
            const persona = !isUser ? personas.find((p) => p.personaId === m.sender) : null
            return (
              <div
                key={m.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-2 max-w-[85%] ${isUser ? 'flex-row-reverse' : ''}`}>
                  {!isUser && persona && (
                    <div
                      className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: persona.color }}
                    >
                      {persona.personaName.slice(0, 1)}
                    </div>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-2.5 ${
                      isUser
                        ? 'bg-emerald-600/80 text-white rounded-br-md'
                        : 'bg-surface-700 text-white/90 border border-white/10 rounded-bl-md'
                    }`}
                  >
                    {!isUser && persona && (
                      <p className="text-xs font-medium mb-1" style={{ color: persona.color }}>
                        {persona.personaName}
                        {m.score != null && (
                          <span className="ml-2 text-white/60">Score: {m.score}/10</span>
                        )}
                      </p>
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>
                    {!isUser && (m.objections?.length || m.evidenceGaps?.length) && (
                      <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
                        {m.objections?.length ? (
                          <p className="text-xs text-amber-400/90">Objections: {m.objections.join('; ')}</p>
                        ) : null}
                        {m.evidenceGaps?.length ? (
                          <p className="text-xs text-red-400/90">Evidence gaps: {m.evidenceGaps.join('; ')}</p>
                        ) : null}
                      </div>
                    )}
                    <p className={`text-[10px] mt-1 ${isUser ? 'text-emerald-200/70' : 'text-white/40'}`}>
                      {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>
            )
          })
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-2 max-w-[85%]">
              {activePersonaInfo && (
                <div
                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: activePersonaInfo.color }}
                >
                  {activePersonaInfo.personaName.slice(0, 1)}
                </div>
              )}
              <div className="rounded-2xl rounded-bl-md px-4 py-2.5 bg-surface-700 border border-white/10">
                <span className="text-white/50 text-sm">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input - WhatsApp style */}
      <div className="p-3 border-t border-white/10 bg-surface-800/80 shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={`Message ${activePersonaInfo?.personaName ?? 'persona'}...`}
            className="flex-1 rounded-xl px-4 py-2.5 bg-surface-700 border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
