// Use proxy in dev ('' = same origin) or explicit URL when set
const API_BASE = import.meta.env.VITE_API_URL ?? ''

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
  const url = API_BASE ? `${API_BASE}/api/chat` : '/api/chat'
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        message,
        specialist_ids: specialistIds,
      }),
    })
  } catch (e) {
    throw new Error(
      `Could not reach backend. Is it running? Start with: ./run.sh (or uvicorn app.main:app --reload --port 8000)`
    )
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    const msg = err.detail ?? err.message ?? 'Chat request failed'
    throw new Error(
      res.status === 500
        ? `Backend error (500): ${msg}. Ensure the backend is running with ./run.sh and ANTHROPIC_API_KEY is set in .env.`
        : msg
    )
  }
  return res.json()
}
