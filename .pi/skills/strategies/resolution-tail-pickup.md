---
name: resolution-tail-pickup
priority: 4
requires_regimes: [EVENT_DRIVEN]
requires_tools: [intel.oracle_dispute_status, decide.analyze_resolution_criteria, decide.time_decay_fair_value]
fit_features:
  - name: price_floor
    expr: "best_ask_yes"
    threshold_min: 0.997
  - name: time_to_resolution_h
    expr: "ttr_seconds / 3600"
    threshold_max: 6
  - name: dispute_active
    expr: "oracle_dispute_active ? 1 : 0"
    threshold_max: 0
min_edge_bps: 30
max_size_pct_of_budget: 0.02
kelly_fraction: 0.25
requires_subcycle: false
sources:
  - "chaincatcher.com — '0.997 club'"
  - "bloomberg.com France weather probe (2026-04-23)"
---
Buy YES at >=0.997 within 6h of resolution if no oracle dispute.
