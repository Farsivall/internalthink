const API_BASE = import.meta.env.VITE_API_URL ?? ''

export interface PersonaDimension {
  id: string
  persona_name: string
  dimension_name: string
  base_weight: number
  notes: string | null
  sort_order: number
}

export async function getPersonaDimensions(personaName?: string): Promise<PersonaDimension[]> {
  const params = new URLSearchParams()
  if (personaName) params.set('persona_name', personaName)
  const base = API_BASE ? `${API_BASE}/api/personas/dimensions` : '/api/personas/dimensions'
  const url = params.toString() ? `${base}?${params.toString()}` : base
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch persona dimensions: ${res.statusText}`)
  }
  return res.json()
}

