/**
 * up-stage extension — hard sequencer for the 6-stage cycle.
 *
 * Pi-migration Wave D Task 4. Per spec §5.5/§12.
 *
 * Each cycle stage (Sense → Frame → Score → Decide → Critique → Commit) has
 * an allowlist of tools the agent may call inside that stage. Calls to
 * tools outside the allowlist increment a session-scoped violation
 * counter; the third strike aborts the cycle (signal.abort) and writes
 * an ABORTED_STAGE_VIOLATION lifecycle event. Stage transitions are
 * driven by the synthetic `stage_advance` tool which validates the
 * requested next stage against the legal-transition map. The
 * Critique → Commit transition is additionally gated on
 * lastDecision ∈ {BUY, SELL}; a HOLD ends the cycle at Critique.
 */
import { Type } from "@sinclair/typebox";
import type { PiLike } from "./up-tools";

export type Stage = "Sense" | "Frame" | "Score" | "Decide" | "Critique" | "Commit";

export const STAGES: Stage[] = ["Sense", "Frame", "Score", "Decide", "Critique", "Commit"];

/**
 * Per-stage tool allowlists.
 *
 * Names are the real Wave B daemon handler names (77 across 9 MCPs).
 * `skill:<name>` calls are also accepted in the Frame stage by the gate
 * logic below (skills are dynamic so we cannot enumerate them).
 */
export const STAGE_ALLOWLISTS: Record<Stage, string[]> = {
  Sense: [
    // Top-of-book + microstructure
    "snapshot_get_top_of_book", "snapshot_get_orderbook", "snapshot_get_market_detail",
    "snapshot_orderbook_imbalance", "snapshot_recent_trades", "snapshot_maker_eligibility",
    "snapshot_spoof_detector",
    // Discovery
    "discovery_find_markets", "discovery_get_market", "discovery_list_signals",
    "discovery_analyze_event", "discovery_correlated_markets", "discovery_cross_venue_match",
    // History
    "history_get_price_candles", "history_get_trade_tape", "history_zscore_and_hurst",
    "history_technical_indicators", "history_vpin_analysis", "history_cohort_flow",
    "history_smart_gap_detail",
    // Intel + signals
    "intel_smart_money_confluence", "intel_basket_consensus", "intel_pre_news_drift",
    "intel_signal_track_record", "intel_calibration_curve", "intel_sport_model_edge",
    "intel_term_structure_skew", "intel_news_age", "intel_oracle_dispute_status",
    "intel_uma_governance_feed", "intel_logical_inconsistency", "intel_scheduled_catalysts",
    "intel_wallet_edge_by_category", "intel_hydrate_signal",
    // Wallet + whale
    "wallet_follow_trader", "wallet_get_live_position", "wallet_get_wallet_balances",
    "wallet_get_wallet_intel", "wallet_list_followed_traders", "wallet_portfolio_exposure",
    "wallet_portfolio_pnl", "wallet_time_to_close", "wallet_track_trader_calibration",
    "wallet_track_trader_category_calibration",
    "whale_top_holders", "whale_cluster_flow_window", "whale_cluster_membership",
    "whale_get_global_oi", "whale_list_whales", "whale_smart_money_flow_summary",
    "whale_whale_flow",
    // Registry + cross-venue
    "registry_list_registered_markets", "registry_get_registration_status",
    "registry_ingest_freshness", "registry_ingest_health",
    "social_cross_platform_spread", "social_cross_venue_arb_score",
    "social_find_kalshi_twin", "social_kalshi_fee_calc", "social_uma_dispute_risk",
  ],
  Frame: [
    "decide_score_market_efficiency",
    // skill:* invocations are also permitted in Frame (handled by gate logic).
  ],
  Score: [
    "decide_score_market_efficiency", "decide_bayesian_edge_posterior",
    "decide_compute_expected_return", "decide_confluence_score",
    "decide_fee_adjusted_edge", "decide_kelly_position_size",
    "decide_orderbook_imbalance_signal", "decide_posterior_update",
    "decide_regime_classifier", "decide_time_decay_fair_value",
    "decide_analyze_resolution_criteria",
  ],
  Decide: [
    "decide_analyze_multi_leg_strategy", "decide_detect_negrisk_arbitrage",
    "polypi_order_estimate_order_fill", "order_preview",
  ],
  Critique: [
    "agent_findings_write",
  ],
  Commit: [
    "polypi_order_place_order", "agent_findings_write",
  ],
};

/**
 * Legal stage transitions. Critique can either advance to Commit (on
 * a BUY/SELL decision) or loop back to Sense (HOLD path). Commit always
 * loops back to Sense to start the next cycle.
 */
const TRANSITIONS: Record<Stage, Stage[]> = {
  Sense: ["Frame"],
  Frame: ["Score"],
  Score: ["Decide"],
  Decide: ["Critique"],
  Critique: ["Commit", "Sense"],
  Commit: ["Sense"],
};

const VIOLATION_LIMIT = 3;

export interface UpStageOptions {
  lifecycleWriter: (ev: {
    customerId: string; jobId: string; scope: string;
    fromState: string; toState: string; reason?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void> | void;
  jobId: string;
  customerId: string;
}

export async function installUpStage(
  pi: PiLike,
  opts: UpStageOptions,
): Promise<void> {
  pi.registerTool({
    name: "stage_advance",
    label: "Advance cycle stage",
    description:
      "Move the cycle to the next stage. Allowed transitions: " +
      "Sense→Frame→Score→Decide→Critique→Commit (or Critique→Sense to skip).",
    parameters: Type.Object({
      next: Type.Union(STAGES.map((s) => Type.Literal(s))),
    }),
    async execute(_id, params: any, _signal, _onUpdate, ctx: any) {
      const cur = (ctx.session.metadata.stage as Stage) ?? "Sense";
      const allowed = TRANSITIONS[cur] ?? [];
      if (!allowed.includes(params.next)) {
        return {
          content: [{
            type: "text",
            text: `cannot advance from ${cur} to ${params.next}; allowed: ${allowed.join(", ")}`,
          }],
          isError: true,
        };
      }
      // BUY/SELL/HOLD gate: Critique → Commit only when last decision is BUY or SELL.
      if (cur === "Critique" && params.next === "Commit") {
        const dec = ctx.session.metadata.lastDecision as string | undefined;
        if (dec !== "BUY" && dec !== "SELL") {
          return {
            content: [{
              type: "text",
              text: `cannot advance Critique → Commit when decision=${dec ?? "unset"}; HOLD ends the cycle here`,
            }],
            isError: true,
          };
        }
      }
      const prev = cur;
      ctx.session.metadata.stage = params.next;
      ctx.session.metadata.violations = 0;
      await opts.lifecycleWriter({
        customerId: opts.customerId,
        jobId: opts.jobId,
        scope: "cycle",
        fromState: prev,
        toState: params.next,
      });
      return { content: [{ type: "text", text: `advanced to ${params.next}` }] };
    },
  });

  pi.on("tool_call", async (event: any, ctx: any) => {
    if (event.tool === "stage_advance") return;
    const stage = (ctx.session.metadata.stage as Stage) ?? "Sense";
    const allow = STAGE_ALLOWLISTS[stage] ?? [];
    // skill:* invocations are dynamic; permitted in Frame stage only.
    const isSkillCall = typeof event.tool === "string" && event.tool.startsWith("skill:");
    if (allow.includes(event.tool) || (isSkillCall && stage === "Frame")) return;
    // Disallowed: increment violation, possibly abort.
    const v = (ctx.session.metadata.violations as number) ?? 0;
    ctx.session.metadata.violations = v + 1;
    if (v + 1 >= VIOLATION_LIMIT) {
      ctx.signal.abort?.("stage violation limit reached");
      await opts.lifecycleWriter({
        customerId: opts.customerId,
        jobId: opts.jobId,
        scope: "cycle",
        fromState: stage,
        toState: "ABORTED_STAGE_VIOLATION",
        reason: `${VIOLATION_LIMIT} disallowed tool calls in ${stage}`,
        metadata: { last_tool: event.tool },
      });
    }
    return {
      allow: false,
      reason: `tool ${event.tool} not allowed in ${stage}; allowed: ${allow.slice(0, 5).join(", ")}...`,
    };
  });
}
