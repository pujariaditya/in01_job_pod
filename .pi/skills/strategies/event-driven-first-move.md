---
name: event-driven-first-move
priority: 5
requires_regimes: [EVENT_DRIVEN]
requires_tools: [intel.news_age, snapshot.recent_trades, history.get_trade_tape, discovery.analyze_event]
fit_features:
  - name: news_fresh
    expr: "news_age_min == null ? 9999 : news_age_min"
    threshold_max: 5
  - name: depth_ok
    expr: "book_depth_top3_usd"
    threshold_min: 20000
  - name: primary_source
    expr: "news_primary_source ? 1 : 0"
    threshold_min: 1
min_edge_bps: 300
max_size_pct_of_budget: 0.04
kelly_fraction: 0.25
requires_subcycle: false
sources:
  - "tokenmetrics.com — 2-15min window CPI Jan-2026"
  - "cnbc.com — Maduro raid insider trading 2026-04-23"
---
Enter <=5 min after primary-source news; depth >=$20k. Avoid insider-suspect markets.
