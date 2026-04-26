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
applicable:
  - { category: sports, subcategory: "*" }
  - { category: crypto, subcategory: "*" }
disallowed:
  - { category: weather, subcategory: "*" }
  - { category: news,    subcategory: "*" }
validation:
  scenarios:
    - name: cross_venue_arb_buy
      preconditions:
        - { signal: arb_quality, op: ">=", value: 0.7 }
      expected_decision: BUY
      reason_must_contain: ["arb", "venue"]
      tolerance:
        false_negative_rate_max: 0.20
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
Cross-Polymarket-Kalshi spread arb. Requires sub-second execution; deferred this wave.
