---
name: cross-venue-spread-arb
priority: 5
requires_regimes: [EVENT_DRIVEN, ILLIQUID]
requires_tools: [discovery.cross_venue_match, decide.fee_adjusted_edge, social.find_kalshi_twin, social.cross_venue_arb_score, social.cross_platform_spread, social.uma_dispute_risk]
fit_features:
  - name: cross_venue_spread_pct
    expr: "0"
    threshold_min: 600
min_edge_bps: 600
max_size_pct_of_budget: 0.05
kelly_fraction: 0.25
requires_subcycle: true
sources:
  - "trevorlasn.com cross-venue guide"
  - "eventarb.com calculator"
---
Cross-Polymarket-Kalshi spread arb. Requires sub-second execution; deferred this wave.
