---
name: zscore-mean-reversion
priority: 3
requires_regimes: [MEAN_REVERT]
requires_tools: [history.zscore_and_hurst, history.technical_indicators]
fit_features:
  - name: zscore_extreme
    expr: "Math.abs(zscore_30bar)"
    threshold_min: 2.0
  - name: hurst_low
    expr: "hurst_60bar"
    threshold_max: 0.45
  - name: ttr_h
    expr: "ttr_seconds / 3600"
    threshold_min: 24
min_edge_bps: 200
max_size_pct_of_budget: 0.03
kelly_fraction: 0.25
requires_subcycle: false
sources:
  - "harbourfrontquant — Hurst regime classifier"
---
Fade |z| >=2 deviations when Hurst<0.45 (mean-reverting regime).
