---
name: smart-money-cluster-follow
priority: 3
requires_regimes: [TREND, EVENT_DRIVEN]
requires_tools: [whale.cluster_flow_window, whale.cluster_membership, whale.list_whales, history.cohort_flow, intel.smart_money_confluence, intel.wallet_edge_by_category, wallet.get_live_position, wallet.get_wallet_intel, wallet.list_followed_traders, wallet.follow_trader, wallet.track_trader_calibration, wallet.track_trader_category_calibration, wallet.portfolio_exposure, wallet.portfolio_pnl, wallet.get_wallet_balances, wallet.time_to_close]
fit_features:
  - name: cluster_size
    expr: "whale_count_30m"
    threshold_min: 2
  - name: cluster_win_rate
    expr: "cluster_win_rate_30m"
    threshold_min: 0.55
  - name: net_flow_signed
    expr: "whale_net_flow_30m_usd"
    threshold_min: 25000
min_edge_bps: 300
max_size_pct_of_budget: 0.05
kelly_fraction: 0.25
requires_subcycle: false
sources:
  - "polytrackhq.app — 55%+ win rate over 50+ trades"
  - "panewslab.com 27k-trade fragility analysis"
applicable:
  - { category: sports, subcategory: "*" }
  - { category: crypto, subcategory: "*" }
disallowed:
  - { category: weather, subcategory: "*" }
  - { category: news,    subcategory: "*" }
validation:
  scenarios:
    - name: cluster_alignment_buy
      preconditions:
        - { signal: cluster_size,            op: ">=", value: 5 }
        - { signal: smart_money_alignment,   op: ">=", value: 0.6 }
      expected_decision: BUY
      reason_must_contain: ["cluster", "smart money"]
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
Enter when >=2 distinct whales (>=55% wr) take same side within 30 min. Exit on whale exit >=50%, +100% PnL, or -30% stop.
