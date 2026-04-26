---
name: orderbook-imbalance-push
priority: 4
requires_regimes: [TREND]
requires_tools: [snapshot.orderbook_imbalance, snapshot.get_orderbook, decide.orderbook_imbalance_signal, history.vpin_analysis]
fit_features:
  - name: obi
    expr: "Math.abs(obi_top3)"
    threshold_min: 0.6
  - name: persistence
    expr: "obi_persistence_sec"
    threshold_min: 1.0
  - name: spread_ok
    expr: "spread_cents"
    threshold_max: 2
min_edge_bps: 100
max_size_pct_of_budget: 0.03
kelly_fraction: 0.25
requires_subcycle: true
sources:
  - "emergentmind.com OBI — 0.6 directional"
applicable:
  - { category: sports, subcategory: "*" }
  - { category: crypto, subcategory: "*" }
disallowed:
  - { category: weather, subcategory: "*" }
  - { category: news,    subcategory: "*" }
validation:
  scenarios:
    - name: imbalance_push_buy
      preconditions:
        - { signal: ob_imbalance,    op: ">=", value: 0.5 }
        - { signal: tob_spread_bps,  op: "<=", value: 50 }
      expected_decision: BUY
      reason_must_contain: ["imbalance"]
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
OBI > 0.6 persisting >=1s + spread <=2c. Sub-second cycle; deferred this wave.
