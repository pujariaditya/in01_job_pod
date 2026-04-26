---
name: longshot-fade
priority: 3
requires_regimes: [MEAN_REVERT]
requires_tools: [decide.bayesian_edge_posterior]
fit_features:
  - name: longshot_band
    expr: "best_bid_yes"
    threshold_max: 0.10
  - name: ttr_d
    expr: "ttr_seconds / 86400"
    threshold_min: 1
  - name: liquidity_ok
    expr: "book_depth_top3_usd"
    threshold_min: 10000
min_edge_bps: 1500
max_size_pct_of_budget: 0.02
kelly_fraction: 0.25
requires_subcycle: false
sources:
  - "tradetheoutcome.com Polymarket accuracy report"
applicable:
  - { category: sports,   subcategory: "*" }
  - { category: crypto,   subcategory: "*" }
  - { category: politics, subcategory: election }
disallowed:
  - { category: weather, subcategory: "*" }
  - { category: news,    subcategory: "*" }
validation:
  scenarios:
    - name: longshot_fade_sell
      preconditions:
        - { signal: mid,                  op: "<=", value: 0.10 }
        - { signal: recent_realised_vol,  op: "<=", value: 0.5 }
      expected_decision: SELL
      reason_must_contain: ["longshot", "fade"]
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
SELL YES on extreme longshots (<=0.10) with >=$10k liquidity.
