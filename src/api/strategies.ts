import { api } from "./client";

export type BaseStrategy = {
  code: string;
  name: string;
  description?: string;
  [key: string]: unknown;
};

export type UserStrategy = {
  id: number;
  baseStrategyCode?: string;
  name?: string;
  symbol?: string;
  status?: string; // CREATED / PREPARING / ACTIVE / STOPPED etc.
  budget?: number | string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type CreateUserStrategyRequest = {
  baseStrategyCode: string;
  name: string;
  symbol: string;
  budget: number; // ? REQUIRED by backend
};

export type UpdateUserStrategyRequest = {
  name?: string;
  status?: "ACTIVE" | "PAUSED" | "STOPPED";
};

export async function getBaseStrategies() {
  return api.get<BaseStrategy[]>("/api/v1/strategies");
}

export async function getUserStrategies(userId: number) {
  return api.get<UserStrategy[]>(`/api/v1/users/${userId}/strategies`);
}

export async function createUserStrategy(
  userId: number,
  req: CreateUserStrategyRequest,
) {
  return api.post<UserStrategy>(`/api/v1/users/${userId}/strategies`, req);
}

export async function activateUserStrategy(
  userId: number,
  userStrategyId: number,
) {
  return api.post<UserStrategy>(
    `/api/v1/users/${userId}/strategies/${userStrategyId}/activate`,
  );
}

export async function deleteUserStrategy(
  userId: number,
  userStrategyId: number,
) {
  return api.delete<void>(
    `/api/v1/users/${userId}/strategies/${userStrategyId}`,
  );
}

export async function updateUserStrategy(
  userId: number,
  userStrategyId: number,
  req: UpdateUserStrategyRequest,
) {
  return api.patch<UserStrategy>(
    `/api/v1/users/${userId}/strategies/${userStrategyId}`,
    req,
  );
}

export type StrategyPnL = {
  realizedPnl?: number | string;
  unrealizedPnl?: number | string;
  [key: string]: unknown;
};

export async function getStrategyPnL(userId: number, strategyId: number) {
  return api.get<StrategyPnL>(
    `/api/v1/users/${userId}/strategies/${strategyId}/pnl`,
  );
}
