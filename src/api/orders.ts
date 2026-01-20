import { api } from "./client";

export type OrderDetail = {
  id?: string; // UUID
  orderId?: string; // some DTOs use this
  userStrategyId?: number;

  symbol?: string;
  side?: string; // BUY/SELL etc
  qty?: number | string;

  orderType?: string; // MARKET/LIMIT
  timeInForce?: string;

  status?: string;

  submittedAt?: string;
  filledAt?: string;
  canceledAt?: string;

  filledQty?: number | string;
  filledAvgPrice?: number | string;

  [key: string]: unknown;
};

export type OrderHistoryEntry = {
  id?: string; // UUID
  orderId?: string; // UUID

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
