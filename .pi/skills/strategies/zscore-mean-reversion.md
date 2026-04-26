---
name: zscore-mean-reversion
priority: 3
requires_regimes: [MEAN_REVERT]
requires_tools: [history.zscore_and_hurst, history.technical_indicators]
fit_features:
  - name: zscore_extreme
    expr: "Math.abs(zscore_30bar)"
    threshold_min: 2.0
  - name: hurst_low
    expr: "hurst_60bar"
    threshold_max: 0.45
  - name: ttr_h
    expr: "ttr_seconds / 3600"
    threshold_min: 24
min_edge_bps: 200
max_size_pct_of_budget: 0.03
kelly_fraction: 0.25
requires_subcycle: false
sources:
  - "harbourfrontquant — Hurst regime classifier"
applicable:
  - { category: sports, subcategory: "*" }
  - { category: crypto, subcategory: "*" }
disallowed:
  - { category: weather, subcategory: "*" }
  - { category: news,    subcategory: "*" }
validation:
  scenarios:
    - name: extreme_zscore_negative_fade
      preconditions:
        - { signal: abs_zscore_60min, op: ">=", value: 2.5 }
        - { signal: ob_imbalance,     op: "<=", value: -0.3 }
      expected_decision: SELL
      reason_must_contain: ["z-score", "fade"]
      tolerance:
        false_negative_rate_max: 0.10
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
Fade |z| >=2 deviations when Hurst<0.45 (mean-reverting regime).
