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
---
SELL YES on extreme longshots (<=0.10) with >=$10k liquidity.
