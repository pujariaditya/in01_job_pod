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
---
20-bar break + 3x volume + OBI>=0.4. Trailing stop at 50% retracement, max 2h hold.
