const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export interface SpecialistResponse {
  specialist_id: string
  text: string
  thinking_process: string
}

export interface ChatResponse {
  responses: SpecialistResponse[]
}

export async function sendChatMessage(
  projectId: string,
  message: string,
  specialistIds: string[]
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      message,
      specialist_ids: specialistIds,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? 'Chat request failed')
  }
  return res.json()
}
