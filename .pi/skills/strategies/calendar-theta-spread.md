---
name: calendar-theta-spread
priority: 2
requires_regimes: [TREND, MEAN_REVERT]
requires_tools: [intel.term_structure_skew, decide.time_decay_fair_value]
fit_features:
  - name: ttr_short
    expr: "ttr_seconds / 86400"
    threshold_max: 7
min_edge_bps: 100
max_size_pct_of_budget: 0.03
kelly_fraction: 0.25
requires_subcycle: false
sources:
  - "threadingontheedge Substack — calendar spreads"
---
Sell faster-decay near-dated, buy slower-decay long-dated. Requires sibling markets >=5pp tenor skew.
