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
---
Sport-specific minimum edge (NCAAB >=3pp, soccer >=1 xG goal, NBA-injury >=2pp), >=2 sources concordant.
