-- Greenfield v2 schema. 4 tables. Minimal operational state only.
-- See docs/superpowers/specs/2026-04-19-ingestion-state-of-art-design.md

CREATE TYPE market_state AS ENUM (
    'pending',
    'active',
    'closing',
    'resolved',
    'purging'
);

CREATE TABLE markets (
    condition_id        TEXT PRIMARY KEY,
    event_slug          TEXT NOT NULL,
    slug                TEXT NOT NULL,
    question            TEXT,
    category            TEXT,
    outcomes            JSONB,
    neg_risk            BOOLEAN NOT NULL DEFAULT FALSE,
    status              TEXT,
    close_at            TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ,
    winning_outcome_index SMALLINT,
    yes_token_id        TEXT,
    no_token_id         TEXT,
    end_date            TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_markets_event_slug ON markets(event_slug);
CREATE INDEX idx_markets_status ON markets(status);

CREATE TABLE asset_tokens (
    asset_id        TEXT PRIMARY KEY,
    market_id       TEXT NOT NULL REFERENCES markets(condition_id) ON DELETE CASCADE,
    outcome_index   SMALLINT NOT NULL
);

CREATE INDEX idx_asset_tokens_market_id ON asset_tokens(market_id);

CREATE TABLE registered_markets (
    market_id       TEXT PRIMARY KEY REFERENCES markets(condition_id) ON DELETE CASCADE,
    event_slug      TEXT NOT NULL,
    event_url       TEXT NOT NULL,
    state           market_state NOT NULL DEFAULT 'pending',
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at       TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    purge_reason    TEXT,
    purge_attempts  SMALLINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_registered_markets_state ON registered_markets(state);
CREATE INDEX idx_registered_markets_event_slug ON registered_markets(event_slug);

CREATE TABLE market_ingest_state (
    market_id       TEXT PRIMARY KEY REFERENCES registered_markets(market_id) ON DELETE CASCADE,
    last_trade_ts   TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Wave B — analytics-legacy tier.
-- These survive per-market purge (unlike the raw trades__{mid} QuestDB tables).
-- ---------------------------------------------------------------------------

CREATE TABLE wallet_profiles (
    address           TEXT PRIMARY KEY,
    pseudonym         TEXT,
    first_trade_ts    TIMESTAMPTZ,
    smart_score       DOUBLE PRECISION,
    brier_score       DOUBLE PRECISION,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_profiles_smart_score ON wallet_profiles (smart_score DESC NULLS LAST);

CREATE TABLE wallet_outcomes (
    wallet_address    TEXT NOT NULL,
    market_id         TEXT NOT NULL,
    resolved_at       TIMESTAMPTZ NOT NULL,
    final_pnl_usd     DOUBLE PRECISION NOT NULL,
    correct           BOOLEAN,
    PRIMARY KEY (wallet_address, market_id, resolved_at)
) PARTITION BY RANGE (resolved_at);

-- Default partition for any bootstrap. Monthly partitions pre-created by control.
CREATE TABLE wallet_outcomes_default PARTITION OF wallet_outcomes DEFAULT;
CREATE INDEX idx_wallet_outcomes_wallet ON wallet_outcomes (wallet_address);
CREATE INDEX idx_wallet_outcomes_market ON wallet_outcomes (market_id);

CREATE TABLE signal_history (
    id                BIGSERIAL,
    market_id         TEXT NOT NULL,
    signal_type       TEXT NOT NULL,
    confidence        DOUBLE PRECISION NOT NULL,
    fired_at          TIMESTAMPTZ NOT NULL,
    expires_at        TIMESTAMPTZ,
    resolved_correct  BOOLEAN,
    payload           JSONB,
    PRIMARY KEY (id, fired_at)
) PARTITION BY RANGE (fired_at);

CREATE TABLE signal_history_default PARTITION OF signal_history DEFAULT;
CREATE INDEX idx_signal_history_market_ts ON signal_history (market_id, fired_at DESC);
CREATE INDEX idx_signal_history_type_ts ON signal_history (signal_type, fired_at DESC);

CREATE TABLE baskets (
    id           BIGSERIAL PRIMARY KEY,
    owner        TEXT NOT NULL,
    name         TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner, name)
);

CREATE TABLE basket_members (
    basket_id    BIGINT NOT NULL REFERENCES baskets(id) ON DELETE CASCADE,
    market_id    TEXT NOT NULL,
    added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (basket_id, market_id)
);

CREATE TABLE alert_subscriptions (
    id             BIGSERIAL PRIMARY KEY,
    owner          TEXT NOT NULL,
    signal_type    TEXT NOT NULL,
    market_filter  JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alert_subscriptions_owner ON alert_subscriptions (owner);
CREATE INDEX idx_alert_subscriptions_type ON alert_subscriptions (signal_type);

CREATE TABLE follow_list (
    id              BIGSERIAL PRIMARY KEY,
    owner           TEXT NOT NULL,
    wallet_address  TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner, wallet_address)
);
