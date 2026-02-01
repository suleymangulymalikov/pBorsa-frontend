import { api } from "./client";

export type BacktestBaseStrategy = {
  id: number;
  code: string;
  name: string;
  description?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type BacktestOrder = {
  id: number;
  symbol?: string;
  side?: "BUY" | "SELL" | string;
  quantity?: number | string;
  price?: number | string;
  executedAt?: string;
  createdAt?: string;
  [key: string]: unknown;
};

export type BacktestBalancePoint = {
  timestamp?: string;
  balance?: number | string;
  [key: string]: unknown;
};

export type Backtest = {
  id: number;
  name?: string;
  baseStrategy?: BacktestBaseStrategy | null;
  baseStrategyCode?: string;
  symbol?: string;
  budget?: number | string;
  testingStart?: string;
  testingEnd?: string;
  status?: string;
  pnl?: number | string | null;
  maxDrawdown?: number | string | null;
  totalTrades?: number | null;
  winningTrades?: number | null;
  errorMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
  orders?: BacktestOrder[] | null;
  [key: string]: unknown;
};

export type CreateBacktestRequest = {
  baseStrategyCode: string;
  name: string;
  symbol: string;
  budget: number;
  testingStart: string;
  testingEnd: string;
};

export async function getBacktests(userId: number) {
  return api.get<Backtest[]>(`/api/v1/users/${userId}/backtests`);
}

export async function getBacktest(userId: number, backtestId: number) {
  return api.get<Backtest>(`/api/v1/users/${userId}/backtests/${backtestId}`);
}

export async function getBacktestBalanceTimeline(
  userId: number,
  backtestId: number,
) {
  return api.get<BacktestBalancePoint[]>(
    `/api/v1/users/${userId}/backtests/${backtestId}/balance-timeline`,
  );
}

export async function createBacktest(
  userId: number,
  req: CreateBacktestRequest,
) {
  return api.post<Backtest>(`/api/v1/users/${userId}/backtests`, req);
}

export async function startBacktest(userId: number, backtestId: number) {
  return api.post<Backtest>(
    `/api/v1/users/${userId}/backtests/${backtestId}/start`,
  );
}

export async function deleteBacktest(userId: number, backtestId: number) {
  return api.delete<void>(
    `/api/v1/users/${userId}/backtests/${backtestId}`,
  );
}
