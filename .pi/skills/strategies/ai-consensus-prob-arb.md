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
---
Trade when |market_price - ensemble_p| >=0.15 and >=3 models agree.
