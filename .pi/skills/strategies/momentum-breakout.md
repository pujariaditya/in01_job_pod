---
name: momentum-breakout
priority: 3
requires_regimes: [TREND]
requires_tools: [snapshot.orderbook_imbalance, decide.confluence_score, whale.get_global_oi, history.get_trade_tape, history.technical_indicators, history.get_price_candles]
fit_features:
  - name: vol_z
    expr: "realized_vol_30bar_z"
    threshold_min: 1.0
  - name: obi_aligned
    expr: "Math.abs(obi_top3)"
    threshold_min: 0.4
min_edge_bps: 250
max_size_pct_of_budget: 0.04
kelly_fraction: 0.25
requires_subcycle: false
sources:
  - "medium.com/illumination — 3+ confluence signals"
applicable:
  - { category: sports, subcategory: "*" }
  - { category: crypto, subcategory: "*" }
disallowed:
  - { category: weather, subcategory: "*" }
  - { category: news,    subcategory: "*" }
validation:
  scenarios:
    - name: momentum_breakout_buy
      preconditions:
        - { signal: abs_zscore_60min,        op: ">=", value: 2.0 }
        - { signal: ob_imbalance,            op: ">=", value: 0.4 }
        - { signal: volume_imbalance_5min,   op: ">=", value: 0.5 }
      expected_decision: BUY
      reason_must_contain: ["momentum", "breakout"]
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
20-bar break + 3x volume + OBI>=0.4. Trailing stop at 50% retracement, max 2h hold.
