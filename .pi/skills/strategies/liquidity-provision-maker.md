---
name: liquidity-provision-maker
priority: 2
requires_regimes: [ILLIQUID]
requires_tools: [snapshot.maker_eligibility, snapshot.get_orderbook]
fit_features:
  - name: spread_ok
    expr: "spread_cents"
    threshold_min: 2
min_edge_bps: 50
max_size_pct_of_budget: 0.05
kelly_fraction: 0.25
requires_subcycle: false
sources:
  - "docs.polymarket.com Liquidity Rewards"
  - "medium.com/illumination — 0.5-2% monthly LP"
---
Post both sides near midpoint while market is reward-eligible. Withdraw 2 min before scheduled news.
