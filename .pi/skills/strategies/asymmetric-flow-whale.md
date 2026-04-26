---
name: asymmetric-flow-whale
priority: 3
requires_regimes: [TREND]
requires_tools: [whale.cluster_flow_window, whale.whale_flow, whale.smart_money_flow_summary, history.smart_gap_detail, intel.wallet_edge_by_category]
fit_features:
  - name: flow_threshold
    expr: "Math.abs(whale_net_flow_30m_usd)"
    threshold_min: 25000
  - name: distinct_wallets
    expr: "whale_count_30m"
    threshold_min: 2
min_edge_bps: 200
max_size_pct_of_budget: 0.04
kelly_fraction: 0.25
requires_subcycle: false
sources:
  - "alphascope.app order-flow"
  - "polywhaler.com tier definitions"
applicable:
  - { category: sports, subcategory: "*" }
  - { category: crypto, subcategory: "*" }
disallowed:
  - { category: weather, subcategory: "*" }
  - { category: news,    subcategory: "*" }
validation:
  scenarios:
    - name: whale_flow_buy
      preconditions:
        - { signal: volume_imbalance_5min,  op: ">=", value: 0.7 }
        - { signal: smart_money_alignment,  op: ">=", value: 0.4 }
      expected_decision: BUY
      reason_must_contain: ["whale", "flow"]
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
Whale 30m net flow >=|$25k| with >=2 distinct wallets, price hasn't lagged >10%.
