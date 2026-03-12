const API_BASE = import.meta.env.VITE_API_URL ?? ''

export interface PersonaDimension {
  id: string
  persona_name: string
  dimension_name: string
  base_weight: number
  notes: string | null
  sort_order: number
}

export interface PersonaAvailableItem {
  id: string
  name: string
  slug: string
  type: 'base_persona' | 'subpersona'
  parent_slug: string | null
  description?: string | null
  domain?: string | null
  subdomain?: string | null
  primary_sources?: string[] | null
}

/** Full display names from Supabase (e.g. hydroelectric -> "Hydroelectric Power Specialist"). */
export async function getSpecialistDisplayNames(): Promise<Record<string, string>> {
  const base = API_BASE ? `${API_BASE}/api/personas/display-names` : '/api/personas/display-names'
  const res = await fetch(base)
  if (!res.ok) return {}
  return res.json()
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

export async function getAvailablePersonas(companyId?: string | null): Promise<PersonaAvailableItem[]> {
  const base = API_BASE ? `${API_BASE}/api/personas/available` : '/api/personas/available'
  const url = companyId ? `${base}?company_id=${encodeURIComponent(companyId)}` : base
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch available personas: ${res.statusText}`)
  }
  return res.json()
}

export async function installPersona(companyId: string, personaSlug: string): Promise<{ ok: boolean; persona_slug: string; company_id: string }> {
  const base = API_BASE ? `${API_BASE}/api/personas/install` : '/api/personas/install'
  const res = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_id: companyId, persona_slug: personaSlug }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? 'Failed to install persona')
  }
  return res.json()
}

