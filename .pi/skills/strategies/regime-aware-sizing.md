---
name: regime-aware-sizing
priority: 1
requires_regimes: [TREND, MEAN_REVERT, EVENT_DRIVEN, ILLIQUID]
requires_tools: [decide.regime_classifier, decide.kelly_position_size, decide.posterior_update, whale.top_holders, discovery.find_markets, discovery.get_market, registry.register_market, registry.get_registration_status, registry.unregister_market, registry.list_registered_markets, registry.register_markets, registry.unregister_markets, registry.ingest_freshness, registry.ingest_health]
fit_features: []
min_edge_bps: 0
max_size_pct_of_budget: 0.05
kelly_fraction: 0.25
requires_subcycle: false
sources:
  - "harbourfrontquant — Hurst thresholds"
---
Meta-strategy. Sets kelly_fraction by regime (TREND 0.5, MEAN_REVERT/EVENT_DRIVEN 0.25, ILLIQUID 0.1) via decide.kelly_position_size. Apply at entry only.
