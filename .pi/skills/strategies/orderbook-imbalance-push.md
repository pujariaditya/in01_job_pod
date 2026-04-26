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
---
OBI > 0.6 persisting >=1s + spread <=2c. Sub-second cycle; deferred this wave.
