---
name: multi-source-confluence
priority: 4
requires_regimes: [EVENT_DRIVEN, TREND]
requires_tools: [decide.confluence_score, discovery.correlated_markets, intel.basket_consensus]
fit_features:
  - name: signal_count
    expr: "recent_signals.length"
    threshold_min: 3
min_edge_bps: 250
max_size_pct_of_budget: 0.04
kelly_fraction: 0.25
requires_subcycle: false
sources:
  - "theboard.world — Multi-Source Intelligence Fusion"
applicable:
  - { category: sports,   subcategory: "*" }
  - { category: crypto,   subcategory: "*" }
  - { category: politics, subcategory: "*" }
disallowed:
  - { category: weather, subcategory: "*" }
  - { category: news,    subcategory: "*" }
validation:
  scenarios:
    - name: triple_confluence_buy
      preconditions:
        - { signal: smart_money_alignment,  op: ">=", value: 0.4 }
        - { signal: ob_imbalance,           op: ">=", value: 0.4 }
        - { signal: volume_imbalance_5min,  op: ">=", value: 0.4 }
      expected_decision: BUY
      reason_must_contain: ["confluence"]
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
    - { condition: market_is_closing, decision_must_not_be: BUY }
---
Enter only when >=3 of {news, flow, model_gap, OBI, momentum} align. Pairwise corr <0.5.
