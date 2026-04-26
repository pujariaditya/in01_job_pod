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
---
Whale 30m net flow >=|$25k| with >=2 distinct wallets, price hasn't lagged >10%.
