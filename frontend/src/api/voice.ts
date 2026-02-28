const API_BASE = import.meta.env.VITE_API_URL ?? ''

export async function isVoiceAvailable(): Promise<boolean> {
  const url = API_BASE ? `${API_BASE}/api/voice/available` : '/api/voice/available'
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    const data = await res.json()
    return !!data.available
  } catch {
    return false
  }
}

const VOICE_CALL_SPEED = 0.9

export async function getVoiceAudio(
  specialistId: string,
  text: string,
  options?: { voiceCall?: boolean }
): Promise<Blob> {
  const url = API_BASE ? `${API_BASE}/api/voice` : '/api/voice'
  const body: Record<string, unknown> = {
    specialist_id: specialistId,
    text,
  }
  if (options?.voiceCall) {
    body.speed = VOICE_CALL_SPEED
    body.summarize_for_speech = true
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? 'Voice unavailable')
  }
  return res.blob()
}
