---
name: calendar-theta-spread
priority: 2
requires_regimes: [TREND, MEAN_REVERT]
requires_tools: [intel.term_structure_skew, decide.time_decay_fair_value]
fit_features:
  - name: ttr_short
    expr: "ttr_seconds / 86400"
    threshold_max: 7
min_edge_bps: 100
max_size_pct_of_budget: 0.03
kelly_fraction: 0.25
requires_subcycle: false
sources:
  - "threadingontheedge Substack — calendar spreads"
applicable:
  - { category: sports,   subcategory: event }
  - { category: politics, subcategory: election }
  - { category: crypto,   subcategory: event }
disallowed:
  - { category: weather, subcategory: "*" }
  - { category: news,    subcategory: "*" }
validation:
  scenarios:
    - name: theta_window_engagement
      preconditions:
        - { signal: mins_to_close,   op: "<=", value: 240 }
        - { signal: tob_spread_bps,  op: "<=", value: 80 }
      expected_decision: HOLD
      reason_must_contain: ["calendar", "theta"]
      tolerance:
        false_negative_rate_max: 0.30
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
Sell faster-decay near-dated, buy slower-decay long-dated. Requires sibling markets >=5pp tenor skew.
