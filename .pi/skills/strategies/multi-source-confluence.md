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
---
Enter only when >=3 of {news, flow, model_gap, OBI, momentum} align. Pairwise corr <0.5.
