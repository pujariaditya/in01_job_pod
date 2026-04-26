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
applicable:
  - { category: sports,   subcategory: "*" }
  - { category: crypto,   subcategory: "*" }
  - { category: politics, subcategory: election }
disallowed:
  - { category: weather, subcategory: "*" }
  - { category: news,    subcategory: "*" }
validation:
  scenarios:
    - name: wide_spread_quiet_lp
      preconditions:
        - { signal: tob_spread_bps,       op: ">=", value: 100 }
        - { signal: recent_realised_vol,  op: "<=", value: 0.3 }
      expected_decision: BUY
      reason_must_contain: ["liquidity", "spread"]
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
Post both sides near midpoint while market is reward-eligible. Withdraw 2 min before scheduled news.
