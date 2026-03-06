"""
Persona dimensions from Supabase — used by decision evaluation to apply the scoring matrix.
"""


def get_dimensions_grouped_by_persona(supabase) -> dict[str, list[dict]]:
    """
    Fetch all persona_dimensions and return them grouped by persona_name.
    Returns dict[persona_name, list[{dimension_name, base_weight, notes, sort_order}]].
    """
    if not supabase:
        return {}
    try:
        r = (
            supabase.table("persona_dimensions")
            .select("persona_name, dimension_name, base_weight, notes, sort_order")
            .order("persona_name")
            .order("sort_order")
            .execute()
        )
        rows = r.data or []
    except Exception:
        return {}
    out: dict[str, list[dict]] = {}
    for row in rows:
        name = (row.get("persona_name") or "").strip()
        if not name:
            continue
        if name not in out:
            out[name] = []
        out[name].append({
            "dimension_name": row.get("dimension_name") or "",
            "base_weight": float(row.get("base_weight") or 0),
            "notes": row.get("notes") or "",
            "sort_order": int(row.get("sort_order") or 0),
        })
    return out


# Map specialist_id (router/engine) to persona_name as stored in persona_dimensions.
# "Business Development" in SPECIALISTS is "Business Dev" in the DB.
SPECIALIST_ID_TO_PERSONA_NAME = {
    "legal": "Legal",
    "financial": "Financial",
    "technical": "Technical",
    "bd": "Business Dev",
    "tax": "Tax",
}
