"""
Persona dimensions API — retrieve persona scoring dimensions (from personas.md) stored in Supabase.
Also list available personas (base + installed subpersonas) for chat from personas/company_personas.
"""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import require_supabase
from app.schemas.persona import PersonaDimensionResponse, PersonaAvailableItem, PersonaInstallRequest

router = APIRouter(prefix="/personas", tags=["personas"])


@router.get("/display-names")
def get_specialist_display_names():
    """Return slug -> display name for all specialists from Supabase (personas + sub_personas)."""
    try:
        supabase = require_supabase()
    except HTTPException:
        return {}
    try:
        base_r = supabase.table("personas").select("slug, name").execute()
        sub_r = supabase.table("sub_personas").select("slug, name").execute()
        out = {}
        for row in (base_r.data or []):
            slug = (row.get("slug") or "").strip()
            if slug:
                out[slug] = (row.get("name") or "").strip() or slug
        for row in (sub_r.data or []):
            slug = (row.get("slug") or "").strip()
            if slug:
                out[slug] = (row.get("name") or "").strip() or slug
        return out
    except Exception:
        return {}


@router.get("/available", response_model=List[PersonaAvailableItem])
def list_available_personas(
    company_id: Optional[str] = Query(None, description="Filter to base + installed for this company; if omitted, return all shared_library"),
):
    """
    List specialists available for chat/decisions. Returns base personas plus any subpersonas
    (e.g. Hydroelectric) that are either in shared_library (when company_id omitted) or installed
    for the company (company_personas). id/slug match backend specialist_id (legal, technical, hydroelectric, etc.).
    If personas table is missing (migration not applied), returns [] and frontend can keep using mock.
    """
    try:
        supabase = require_supabase()
    except HTTPException:
        raise
    try:
        if company_id and company_id.strip():
            cid = company_id.strip()
            # Base personas (always) + personas installed for this company
            base_r = supabase.table("personas").select("id").eq("type", "base_persona").execute()
            inst_r = supabase.table("company_personas").select("persona_id").eq("company_id", cid).eq("status", "active").execute()
            all_ids = {str(row["id"]) for row in (base_r.data or [])} | {str(row["persona_id"]) for row in (inst_r.data or [])}
            if not all_ids:
                return []
            rows_r = supabase.table("personas").select("id, name, slug, type, parent_persona_id, description, domain, subdomain").in_("id", list(all_ids)).order("type").order("slug").execute()
            rows = list(rows_r.data or [])
            parent_slugs = _resolve_parent_slugs(supabase, rows)
        else:
            rows = _fetch_shared_library_personas(supabase)
            parent_slugs = {}  # shared library rows already have parent_slug from sub_personas or None for base
        out = []
        for row in rows:
            slug = (row.get("slug") or "").strip()
            if not slug:
                continue
            pid = row.get("parent_persona_id")
            parent_slug = row["parent_slug"] if "parent_slug" in row else (parent_slugs.get(str(pid)) if pid else None)
            out.append(
                PersonaAvailableItem(
                    id=slug,
                    name=(row.get("name") or "").strip() or slug,
                    slug=slug,
                    type=(row.get("type") or "base_persona").strip(),
                    parent_slug=parent_slug,
                    description=(row.get("description") or "").strip() or None,
                    domain=(row.get("domain") or "").strip() or None,
                    subdomain=(row.get("subdomain") or "").strip() or None,
                    primary_sources=row.get("primary_sources") if "primary_sources" in row else None,
                )
            )
        return out
    except Exception:
        return []


def _resolve_parent_slugs(supabase, rows):
    parent_ids = {row["parent_persona_id"] for row in rows if row.get("parent_persona_id")}
    if not parent_ids:
        return {}
    pr = supabase.table("personas").select("id, slug").in_("id", list(parent_ids)).execute()
    return {str(p["id"]): (p.get("slug") or "").strip() for p in (pr.data or [])}


def _fetch_shared_library_personas(supabase):
    """Base personas from personas table + all subpersonas from sub_personas table (merged list)."""
    base_r = (
        supabase.table("personas")
        .select("id, name, slug, type, parent_persona_id, description, domain, subdomain")
        .eq("visibility", "shared_library")
        .eq("type", "base_persona")
        .order("slug")
        .execute()
    )
    sub_r = supabase.table("sub_personas").select("id, name, slug, parent_slug, description, domain, subdomain, primary_sources").execute()
    base_list = list(base_r.data or [])
    sub_list = []
    for r in (sub_r.data or []):
        primary_sources = r.get("primary_sources")
        if isinstance(primary_sources, list):
            primary_sources = [str(x) for x in primary_sources if x]
        else:
            primary_sources = None
        sub_list.append({
            "id": r["id"],
            "name": r["name"],
            "slug": r["slug"],
            "type": "subpersona",
            "parent_persona_id": None,
            "parent_slug": (r.get("parent_slug") or "").strip() or None,
            "description": (r.get("description") or "").strip() or None,
            "domain": (r.get("domain") or "").strip() or None,
            "subdomain": (r.get("subdomain") or "").strip() or None,
            "primary_sources": primary_sources,
        })
    return base_list + sub_list


@router.post("/install", response_model=dict)
def install_persona(body: PersonaInstallRequest):
    """Install a persona into a company workspace (adds row to company_personas). Resolves slug from personas first, then from sub_personas (materializes into personas on install)."""
    try:
        supabase = require_supabase()
    except HTTPException:
        raise
    cid = (body.company_id or "").strip()
    slug = (body.persona_slug or "").strip()
    if not cid or not slug:
        raise HTTPException(status_code=400, detail="company_id and persona_slug required")
    try:
        pr = supabase.table("personas").select("id").eq("slug", slug).limit(1).execute()
        rows = pr.data or []
        if rows:
            persona_id = str(rows[0]["id"])
        else:
            # Resolve from sub_personas and materialize into personas
            sub_r = supabase.table("sub_personas").select("id, name, slug, parent_slug, description, domain, subdomain, default_instructions, visibility, is_searchable").eq("slug", slug).limit(1).execute()
            sub_rows = sub_r.data or []
            if not sub_rows:
                raise HTTPException(status_code=404, detail=f"Persona not found: {slug}")
            sub = sub_rows[0]
            parent_r = supabase.table("personas").select("id").eq("slug", (sub.get("parent_slug") or "").strip()).limit(1).execute()
            parent_rows = parent_r.data or []
            parent_persona_id = str(parent_rows[0]["id"]) if parent_rows else None
            insert_r = (
                supabase.table("personas")
                .insert(
                    {
                        "name": (sub.get("name") or "").strip(),
                        "slug": (sub.get("slug") or "").strip(),
                        "type": "subpersona",
                        "parent_persona_id": parent_persona_id,
                        "description": (sub.get("description") or "").strip() or None,
                        "domain": (sub.get("domain") or "").strip() or None,
                        "subdomain": (sub.get("subdomain") or "").strip() or None,
                        "default_instructions": (sub.get("default_instructions") or "").strip() or None,
                        "visibility": (sub.get("visibility") or "shared_library").strip(),
                        "is_searchable": bool(sub.get("is_searchable", True)),
                    }
                )
                .execute()
            )
            if not insert_r.data or len(insert_r.data) < 1:
                raise HTTPException(status_code=500, detail="Failed to create persona from sub_persona")
            persona_id = str(insert_r.data[0]["id"])
        supabase.table("company_personas").insert({
            "company_id": cid,
            "persona_id": persona_id,
            "status": "active",
            "added_from_library": True,
        }).execute()
        return {"ok": True, "persona_slug": slug, "company_id": cid}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dimensions", response_model=List[PersonaDimensionResponse])
def list_persona_dimensions(
    persona_name: Optional[str] = Query(None, description="Filter by persona (e.g. Financial, Legal)"),
):
    """
    List persona dimension definitions: name, base weight, notes per dimension.
    Matches the structure in prompt_files/personas.md.
    """
    try:
        supabase = require_supabase()
    except HTTPException:
        raise
    try:
        q = supabase.table("persona_dimensions").select("*").order("persona_name").order("sort_order")
        if persona_name and persona_name.strip():
            q = q.eq("persona_name", persona_name.strip())
        r = q.execute()
        return list(r.data or [])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
