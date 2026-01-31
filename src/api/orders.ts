import { api } from "./client";

export type OrderDetail = {
  id?: string; // UUID
  orderId?: string; // Alpaca order ID
  userStrategyId?: number;

  symbol?: string;
  side?: string; // BUY/SELL etc
  quantity?: number | string;
  qty?: number | string;

  type?: string; // MARKET/LIMIT/STOP/STOP_LIMIT
  orderType?: string; // MARKET/LIMIT
  timeInForce?: string;
  limitPrice?: number | string | null;
  stopPrice?: number | string | null;

  status?: string;
  message?: string | null;

  createdAt?: string;
  updatedAt?: string;
  submittedAt?: string;
  filledAt?: string;
  expiredAt?: string;
  cancelledAt?: string;

  filledQuantity?: number | string;
  filledQty?: number | string;
  filledAveragePrice?: number | string | null;
  filledAvgPrice?: number | string;

  [key: string]: unknown;
};

export type OrderHistoryEntry = {
  id?: string; // UUID
  orderId?: string; // UUID

  status?: string;
  reason?: string;
  oldStatus?: string;
  newStatus?: string;

  message?: string;
  createdAt?: string;

  [key: string]: unknown;
};

export async function getOrdersByUserStrategy(
  userId: number,
  userStrategyId: number,
) {
  return api.get<OrderDetail[]>(
    `/api/v1/orders/${userId}/strategy/${userStrategyId}`,
  );
}

export async function getOrderDetail(userId: number, orderId: string) {
  return api.get<OrderDetail>(`/api/v1/orders/${userId}/${orderId}`);
}

export async function getOrderHistory(userId: number, orderId: string) {
  return api.get<OrderHistoryEntry[]>(
    `/api/v1/orders/${userId}/${orderId}/history`,
  );
}

export type FilledOrder = {
  symbol: string;
  quantity: number;
  side: "BUY" | "SELL";
  filledAt: string;
};

export async function getFilledOrdersByStrategy(
  userId: number,
  userStrategyId: number,
) {
  return api.get<FilledOrder[]>(
    `/api/v1/orders/${userId}/strategy/${userStrategyId}/filled`,
  );
}
