-- Hydroelectric: same five dimensions as Technical, with hydro-specific weights and notes.
-- Updates existing rows so the decision engine uses hydro-appropriate scoring guidance.

UPDATE persona_dimensions
SET base_weight = 0.15,
    notes = 'Score based on ability to add capacity (MW) without major redesign; head/flow constraints, run-of-river vs reservoir, seasonal variability, multi-site or cascade replication, grid integration at scale. Penalize designs with no expansion path or disproportionate grid upgrades for modest gains.'
WHERE persona_name = 'Hydroelectric' AND dimension_name = 'Scalability';

UPDATE persona_dimensions
SET base_weight = 0.25,
    notes = 'Civil works, geology, environmental/permitting (FERC, water rights, fish passage), grid interconnection, turbine/equipment lead times, hydrology and feasibility studies, EPC and O&M contracting. Penalize more than three high-risk integration points or unclear ownership of critical path.'
WHERE persona_name = 'Hydroelectric' AND dimension_name = 'Execution Complexity';

UPDATE persona_dimensions
SET base_weight = 0.15,
    notes = 'Legacy turbine controls and SCADA, outdated instrumentation, deferred refurbishment, condition monitoring gaps. Score low if a large share of the asset base is high-risk or end-of-life without a funded remediation plan, or if automation is repeatedly deferred.'
WHERE persona_name = 'Hydroelectric' AND dimension_name = 'Technical Debt';

UPDATE persona_dimensions
SET base_weight = 0.30,
    notes = 'Dam safety and surveillance, spillway and flood risk, cybersecurity for SCADA/ICS/OT, environmental incident risk, regulatory compliance (e.g. FERC). Score low if critical systems lack controls or if there is past serious incident or material non-compliance.'
WHERE persona_name = 'Hydroelectric' AND dimension_name = 'Reliability / Security';

UPDATE persona_dimensions
SET base_weight = 0.15,
    notes = 'In-house hydro experience (civil, mechanical, electrical, hydrology), EPC and O&M partner capability, specialist contractors, knowledge transfer and succession. Penalize if key roles have no backup or no plan to acquire or partner for hydro experience.'
WHERE persona_name = 'Hydroelectric' AND dimension_name = 'Team Fit';
