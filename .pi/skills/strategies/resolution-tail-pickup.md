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
applicable:
  - { category: sports,   subcategory: "*" }
  - { category: politics, subcategory: election }
  - { category: crypto,   subcategory: event }
disallowed:
  - { category: weather, subcategory: "*" }
  - { category: news,    subcategory: "*" }
validation:
  scenarios:
    - name: tail_pickup_buy
      preconditions:
        - { signal: mins_to_close,         op: "<=", value: 60 }
        - { signal: mid,                   op: ">=", value: 0.95 }
        - { signal: smart_money_alignment, op: ">=", value: 0.3 }
      expected_decision: BUY
      reason_must_contain: ["tail", "resolution"]
      tolerance:
        false_negative_rate_max: 0.15
    - name: calm_market_no_signal
      preconditions:
        - { signal: abs_zscore_60min, op: "<", value: 1.0 }
      expected_decision: HOLD
      reason_must_contain: ["no signal"]
  forbidden:
    - { condition: not_admitted,      decision_must_not_be: BUY }
    - { condition: not_admitted,      decision_must_not_be: SELL }
---
Buy YES at >=0.997 within 6h of resolution if no oracle dispute.
