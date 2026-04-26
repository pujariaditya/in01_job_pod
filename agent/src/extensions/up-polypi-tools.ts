import { Type, type TSchema } from "@sinclair/typebox";

export interface PolypiToolDef {
  name: string;        // e.g. "polypi_order_place_order"
  endpoint: string;    // e.g. "/v1/order/place_order"
  description: string;
  parameters: TSchema; // typebox schema for the request body
}

// Reusable parameter schemas
const _customerOnly = Type.Object({
  customer_id: Type.String({ minLength: 1 }),
});

const _customerMarket = Type.Object({
  customer_id: Type.String({ minLength: 1 }),
  market_id: Type.String({ minLength: 1 }),
});

const _customerOrder = Type.Object({
  customer_id: Type.String({ minLength: 1 }),
  order_id: Type.String({ minLength: 1 }),
});

export const POLYPI_TOOLS: PolypiToolDef[] = [
  // --- account (8) ---
  {
    name: "polypi_account_compute_pnl",
    endpoint: "/v1/account/compute_pnl",
    description: "Compute realized + unrealized PnL across the customer's portfolio.",
    parameters: _customerOnly,
  },
  {
    name: "polypi_account_get_account_health",
    endpoint: "/v1/account/get_account_health",
    description: "Return account health flags (margin, balance, recent activity).",
    parameters: _customerOnly,
  },
  {
    name: "polypi_account_get_exposure_by_resolution_date",
    endpoint: "/v1/account/get_exposure_by_resolution_date",
    description: "Return open-position exposure bucketed by underlying market's resolution date.",
    parameters: _customerOnly,
  },
  {
    name: "polypi_account_get_portfolio_snapshot",
    endpoint: "/v1/account/get_portfolio_snapshot",
    description: "Return total portfolio value + breakdown by market.",
    parameters: _customerOnly,
  },
  {
    name: "polypi_account_get_position_balance",
    endpoint: "/v1/account/get_position_balance",
    description: "Return the customer's current position size in a specific market.",
    parameters: _customerMarket,
  },
  {
    name: "polypi_account_get_wallet_balance",
    endpoint: "/v1/account/get_wallet_balance",
    description: "Return the customer's free USDC + total wallet balance.",
    parameters: _customerOnly,
  },
  {
    name: "polypi_account_list_redeemable_positions",
    endpoint: "/v1/account/list_redeemable_positions",
    description: "List positions in resolved markets that can be redeemed for payout.",
    parameters: _customerOnly,
  },
  {
    name: "polypi_account_redeem_position",
    endpoint: "/v1/account/redeem_position",
    description: "Submit a redemption transaction for a resolved-market position.",
    parameters: _customerMarket,
  },

  // --- order (9) ---
  {
    name: "polypi_order_cancel_all_orders",
    endpoint: "/v1/order/cancel_all_orders",
    description: "Cancel ALL of the customer's open orders across all markets.",
    parameters: _customerOnly,
  },
  {
    name: "polypi_order_cancel_order",
    endpoint: "/v1/order/cancel_order",
    description: "Cancel a single open order by id.",
    parameters: _customerOrder,
  },
  {
    name: "polypi_order_close_position",
    endpoint: "/v1/order/close_position",
    description: "Submit a market order to close the customer's position in a market.",
    parameters: _customerMarket,
  },
  {
    name: "polypi_order_estimate_order_fill",
    endpoint: "/v1/order/estimate_order_fill",
    description: "Estimate slippage + expected fill price for a hypothetical order.",
    parameters: Type.Object({
      customer_id: Type.String({ minLength: 1 }),
      market_id: Type.String({ minLength: 1 }),
      side: Type.Union([Type.Literal("BUY"), Type.Literal("SELL")]),
      size_usd: Type.Number({ minimum: 0 }),
    }),
  },
  {
    name: "polypi_order_get_order_status",
    endpoint: "/v1/order/get_order_status",
    description: "Return the current status (open/filled/cancelled) of an order by id.",
    parameters: _customerOrder,
  },
  {
    name: "polypi_order_list_orders",
    endpoint: "/v1/order/list_orders",
    description: "List the customer's open orders.",
    parameters: _customerOnly,
  },
  {
    name: "polypi_order_merge_position",
    endpoint: "/v1/order/merge_position",
    description: "Merge YES + NO positions in the same market into USDC (if both held).",
    parameters: _customerMarket,
  },
  {
    name: "polypi_order_place_order",
    endpoint: "/v1/order/place_order",
    description: "Submit a signed order (BUY or SELL) to a Polymarket market.",
    parameters: Type.Object({
      customer_id: Type.String({ minLength: 1 }),
      market_id: Type.String({ minLength: 1 }),
      side: Type.Union([Type.Literal("BUY"), Type.Literal("SELL")]),
      size_usd: Type.Number({ minimum: 0 }),
    }),
  },
  {
    name: "polypi_order_replace_order",
    endpoint: "/v1/order/replace_order",
    description: "Cancel an existing order and place a replacement with new size/price.",
    parameters: Type.Object({
      customer_id: Type.String({ minLength: 1 }),
      order_id: Type.String({ minLength: 1 }),
      new_size_usd: Type.Number({ minimum: 0 }),
    }),
  },
];
