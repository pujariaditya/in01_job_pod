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
---
Trade logical violations between dependent markets. 62% of detections fail to realize — verify fee-adjusted edge first.
