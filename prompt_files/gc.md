Chat: Group profile modal and add/remove from My personas

Goal





Group profile: Clicking the group profile (info icon in the chat header) opens a modal/sheet.



In the modal: User can remove specialists from the chat and add specialists from My personas (same source as the Personas page: base + installed).



Sidebar: The right-hand "Specialists in chat" list stays in sync: adding/removing in the group profile updates selectedIds, so the sidebar reflects the same set.

Current behavior





Header: ProjectChatTab.tsx has an info icon (lines 569–576) with title "Group info" but no onClick.



Sidebar: Shows "Specialists in chat" and lists mockSpecialists; each row toggles via toggleSpecialist(s.id) (updates selectedIds). Count is selectedIds.size / mockSpecialists.length.



Data: Specialists list is hardcoded mockSpecialists from frontend/src/data/mock.ts. Personas page uses getAvailablePersonas(companyId) from frontend/src/api/personas.ts.

Implementation

1. Source "My personas" in chat





In ProjectChatTab, load available personas when the tab is relevant (e.g. on mount or when group profile opens):





Call getAvailablePersonas(companyId) with companyId from localStorage.getItem('personas_company_id') (same key as Personas page).



Map API items to { id: slug, name, color }[]; use a shared color map (e.g. from mock or a small util) for known slugs (legal, financial, technical, hydroelectric, bd, tax) and a default for others.



Keep fallback to mockSpecialists when the API is not configured or returns empty, so chat still works without the Personas API.



Store the result in state, e.g. availablePersonas: { id: string; name: string; color: string }[], and use this list for both the sidebar and the group profile modal (single source of truth for “who can be in chat”).

2. Group profile modal





Add state: groupProfileOpen: boolean (default false).



Header info button (group chat only, not in DM): set onClick to () => setGroupProfileOpen(true).



Modal content (when groupProfileOpen):





Title: e.g. "Group profile" or "Chat participants".



In this chat: List current participants (each id in selectedIds), with a Remove control. Remove: setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; }).



Add from My personas: List personas that are in availablePersonas but not in selectedIds, with an Add control. Add: setSelectedIds(prev => new Set(prev).add(id)).



Close: Overlay click or a "Done" / "Close" button sets groupProfileOpen to false.



Reuse the same styling patterns as the rest of the app (e.g. dark surface, white/60 text, rounded panels).

3. Sidebar uses same list





Sidebar "Specialists in chat" list should render from availablePersonas (not only mockSpecialists), so that any persona from "My personas" can appear there. Each row still toggles with toggleSpecialist(id) so the sidebar continues to add/remove from selectedIds.



Count text can show selectedIds.size / availablePersonas.length.

4. Optional: DM and call popover





DM: When in DM mode, the header shows back arrow; the group profile button is not shown (current behavior). No change required.



Call popover "Who to call": Can keep using the same availablePersonas list so call participants are chosen from the same set. Optional follow-up if you want call and group profile to share one picker.

Files to touch







File



Change





frontend/src/components/ProjectChatTab.tsx



Load availablePersonas from getAvailablePersonas(companyId) with fallback to mockSpecialists; add groupProfileOpen state; wire header info button to open modal; add Group profile modal (in chat / add from My personas); sidebar uses availablePersonas and same selectedIds.





frontend/src/api/personas.ts



Already exports getAvailablePersonas; ensure type used (e.g. PersonaAvailableItem) is compatible with mapping to { id, name, color } (slug as id, name, color from a small map or default). No API change required.

Data flow

flowchart LR
  API[getAvailablePersonas]
  Avail[availablePersonas state]
  Selected[selectedIds state]
  Sidebar[Sidebar list]
  Modal[Group profile modal]
  API --> Avail
  Avail --> Sidebar
  Avail --> Modal
  Selected --> Sidebar
  Selected --> Modal
  Modal -->|add/remove| Selected
  Sidebar -->|toggle| Selected





Backend: Chat API already validates specialist_ids against SPECIALISTS (legal, financial, technical, hydroelectric, bd, tax). As long as "My personas" only includes those (or the backend is later extended), no backend change is required for this feature.