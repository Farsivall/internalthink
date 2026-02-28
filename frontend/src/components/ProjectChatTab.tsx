import { useState, useRef, useEffect } from 'react'
import type { Specialist, ThreadMessage } from '../data/mock'
import { mockSpecialists, getProjectChat, getProject } from '../data/mock'

export function ProjectChatTab({ projectId }: { projectId: string }) {
  const project = getProject(projectId)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(['legal', 'financial', 'technical']))
  const [localMessages, setLocalMessages] = useState<ThreadMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [expandedThinkingId, setExpandedThinkingId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const thread = getProjectChat(projectId)
  const allMessages = [...thread, ...localMessages]

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

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    const userMsg: ThreadMessage = {
      id: `local-user-${Date.now()}`,
      sender: 'user',
      text,
      at: new Date().toISOString(),
    }
    setLocalMessages((prev) => [...prev, userMsg])
    setIsLoading(true)
    setTimeout(() => {
      setLocalMessages((prev) => [
        ...prev,
        {
          id: `local-spec-${Date.now()}`,
          sender: Array.from(selectedIds)[0] ?? 'legal',
          text: 'Reply from specialist (mock). Connect backend to get real responses.',
          at: new Date().toISOString(),
          thinkingProcess:
            '1. Parsed user query and identified key decision factors.\n2. Retrieved relevant context from attached documents (product brief, Slack).\n3. Applied specialist lens: risk assessment, compliance check, market fit.\n4. Generated response with caveats. [Mock – integrate AI for real reasoning.]',
        },
      ])
      setIsLoading(false)
    }, 800)
  }

  const specialistsInChat = mockSpecialists.filter((s) => selectedIds.has(s.id))

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[560px] rounded-xl border border-white/10 bg-surface-800/90 backdrop-blur overflow-hidden animate-fade-in">
      {/* Left: Chat area (WhatsApp style) */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-surface-800 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                className="p-2 rounded-full hover:bg-white/10 transition-colors shrink-0"
                title="Group info"
              >
                <ion-icon name="information-circle-outline" className="text-xl text-white/80" />
              </button>
              <div className="w-10 h-10 rounded-full bg-emerald-600/80 flex items-center justify-center shrink-0">
                <ion-icon name="people" size="small" className="text-white text-xl" />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-white truncate">{project?.name ?? 'Project chat'}</h2>
                <p className="text-xs text-white/50 truncate">
                  {specialistsInChat.length} specialist{specialistsInChat.length !== 1 ? 's' : ''} in chat
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" className="p-2 rounded-full hover:bg-white/10 transition-colors" title="Search">
                <ion-icon name="search-outline" className="text-xl text-white/70" />
              </button>
              <button type="button" className="p-2 rounded-full hover:bg-white/10 transition-colors" title="More">
                <ion-icon name="ellipsis-vertical" className="text-xl text-white/70" />
              </button>
            </div>
          </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-surface-900/40 p-4 space-y-2 min-h-0">
          {allMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/40 text-sm gap-2">
              <ion-icon name="chatbubbles-outline" className="text-4xl" />
              <p>No messages yet.</p>
              <p className="text-xs">Add specialists on the right and send a message.</p>
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

        {/* Input bar (WhatsApp style) */}
        <div className="p-2 border-t border-white/10 bg-surface-800 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-2.5 rounded-full hover:bg-white/10 text-white/60 transition-colors"
              title="Attach"
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
              <h3 className="font-semibold text-white">{project?.name ?? 'Project'}</h3>
              <p className="text-xs text-white/50">Group chat</p>
            </div>
          </div>
          {project?.description && (
            <p className="text-sm text-white/60 line-clamp-2">{project.description}</p>
          )}
        </div>

        {/* Specialists in this chat */}
        <div className="flex-1 overflow-y-auto p-3">
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
              Add at least one specialist to get replies.
            </p>
          )}
        </div>

        {/* Optional footer in sidebar */}
        <div className="p-3 border-t border-white/10">
          <button
            type="button"
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
