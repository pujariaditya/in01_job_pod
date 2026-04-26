---
name: ai-consensus-prob-arb
priority: 4
requires_regimes: [EVENT_DRIVEN]
requires_tools: [decide.confluence_score, intel.sport_model_edge, intel.basket_consensus]
fit_features:
  - name: liquidity_ok
    expr: "book_depth_top3_usd"
    threshold_min: 50000
min_edge_bps: 1500
max_size_pct_of_budget: 0.04
kelly_fraction: 0.25
requires_subcycle: false
sources:
  - "medium.com/illumination — Beyond Simple Arbitrage"
applicable:
  - { category: news,     subcategory: "*" }
  - { category: politics, subcategory: policy }
  - { category: economy,  subcategory: "*" }
disallowed:
  - { category: weather, subcategory: "*" }
validation:
  scenarios:
    - name: model_disagreement_buy
      preconditions:
        - { signal: smart_money_alignment, op: ">=", value: 0.5 }
        - { signal: liquidity_usd,         op: ">=", value: 1000 }
      expected_decision: BUY
      reason_must_contain: ["consensus", "edge"]
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
Trade when |market_price - ensemble_p| >=0.15 and >=3 models agree.
