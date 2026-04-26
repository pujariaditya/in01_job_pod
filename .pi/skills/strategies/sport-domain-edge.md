---
name: sport-domain-edge
priority: 4
requires_regimes: [EVENT_DRIVEN]
requires_tools: [intel.sport_model_edge, decide.fee_adjusted_edge, decide.compute_expected_return, intel.signal_track_record, intel.hydrate_signal]
fit_features: []
min_edge_bps: 300
max_size_pct_of_budget: 0.04
kelly_fraction: 0.25
requires_subcycle: false
sources:
  - "gist.github.com sigmabot-coder Polymarket sports"
applicable:
  - { category: sports, subcategory: "*" }
disallowed:
  - { category: weather, subcategory: "*" }
  - { category: crypto,  subcategory: "*" }
  - { category: news,    subcategory: "*" }
validation:
  scenarios:
    - name: smart_money_aligned_buy
      preconditions:
        - { signal: smart_money_alignment, op: ">=", value: 0.5 }
        - { signal: liquidity_usd,         op: ">=", value: 5000 }
      expected_decision: BUY
      reason_must_contain: ["smart money", "edge"]
      tolerance:
        false_negative_rate_max: 0.15
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
Sport-specific minimum edge (NCAAB >=3pp, soccer >=1 xG goal, NBA-injury >=2pp), >=2 sources concordant.
