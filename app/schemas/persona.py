"""Persona dimension definitions and decision persona scores (from personas.md)."""

from datetime import datetime
from uuid import UUID
from typing import Optional
from pydantic import BaseModel, ConfigDict


class PersonaDimensionResponse(BaseModel):
    id: UUID
    persona_name: str
    dimension_name: str
    base_weight: float
    notes: Optional[str] = None
    sort_order: int
    model_config = ConfigDict(from_attributes=True)


class DimensionScoreResponse(BaseModel):
    Name: str
    Score: int
    KeyRisks: list[str] = []
    TradeOffs: list[str] = []
    EvidenceGaps: list[str] = []


class DecisionPersonaScoreResponse(BaseModel):
    id: UUID
    decision_id: UUID
    persona_name: str
    total_score: int
    dimensions: list[dict]  # list of DimensionScoreResponse-shaped objects
    what_would_change_my_mind: list[str] = []
    high_structural_risk: bool = False
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)
