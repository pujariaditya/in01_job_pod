---
name: combinatorial-logical-arb
priority: 4
requires_regimes: [EVENT_DRIVEN]
requires_tools: [decide.fee_adjusted_edge, decide.analyze_multi_leg_strategy, decide.detect_negrisk_arbitrage, discovery.correlated_markets, intel.logical_inconsistency]
fit_features:
  - name: liquidity_ok
    expr: "book_depth_top3_usd"
    threshold_min: 200000
min_edge_bps: 300
max_size_pct_of_budget: 0.03
kelly_fraction: 0.25
requires_subcycle: false
sources:
  - "navnoorbawa Medium combinatorial-arb"
  - "arxiv 2508.03474"
applicable:
  - { category: sports, subcategory: "*" }
  - { category: crypto, subcategory: "*" }
disallowed:
  - { category: weather, subcategory: "*" }
  - { category: news,    subcategory: "*" }
validation:
  scenarios:
    - name: combinatorial_arb_buy
      preconditions:
        - { signal: arb_quality,   op: ">=", value: 0.8 }
        - { signal: liquidity_usd, op: ">=", value: 200000 }
      expected_decision: BUY
      reason_must_contain: ["arb", "logical"]
      tolerance:
        false_negative_rate_max: 0.20
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
Trade logical violations between dependent markets. 62% of detections fail to realize — verify fee-adjusted edge first.
