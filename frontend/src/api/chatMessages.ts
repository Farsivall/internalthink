const API_BASE = import.meta.env.VITE_API_URL ?? ''

export interface ChatMessage {
  id: string
  sender: string
  text: string
  at: string
  thinkingProcess?: string
}

export async function getProjectChat(projectId: string): Promise<ChatMessage[]> {
  const url = API_BASE ? `${API_BASE}/api/chat/messages?project_id=${encodeURIComponent(projectId)}` : `/api/chat/messages?project_id=${encodeURIComponent(projectId)}`
  const res = await fetch(url)
  if (!res.ok) return []
  return res.json()
}
