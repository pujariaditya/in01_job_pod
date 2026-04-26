---
name: same-market-rebalance-arb
priority: 5
requires_regimes: [ILLIQUID, EVENT_DRIVEN]
requires_tools: [decide.fee_adjusted_edge]
fit_features:
  - name: yes_plus_no_minus_one_bps
    expr: "10000 * (best_bid_yes + (1 - best_ask_yes) - 1)"
    threshold_min: 50
  - name: book_depth_ok
    expr: "book_depth_top3_usd"
    threshold_min: 500
  - name: time_to_resolution_h
    expr: "ttr_seconds / 3600"
    threshold_max: 168
min_edge_bps: 50
max_size_pct_of_budget: 0.05
kelly_fraction: 0.25
requires_subcycle: false
sources:
  - "arxiv 2508.03474 — Probabilistic Forest"
  - "newyorkcityservers.com arbitrage guide"
applicable:
  - { category: sports, subcategory: "*" }
  - { category: crypto, subcategory: "*" }
disallowed:
  - { category: weather, subcategory: "*" }
  - { category: news,    subcategory: "*" }
validation:
  scenarios:
    - name: arb_window_buy
      preconditions:
        - { signal: arb_quality,   op: ">=", value: 0.6 }
        - { signal: liquidity_usd, op: ">=", value: 500 }
      expected_decision: BUY
      reason_must_contain: ["arb"]
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
Buy YES + NO when sum < $1 net of fees. Hold to resolution.
