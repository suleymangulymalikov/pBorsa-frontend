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

export type BacktestOrdersPageRequest = {
  page?: number;
  size?: number;
  sort?: string[];
};

export type BacktestPageSort = {
  empty?: boolean;
  sorted?: boolean;
  unsorted?: boolean;
};

export type BacktestPageable = {
  offset?: number;
  sort?: BacktestPageSort;
  paged?: boolean;
  pageNumber?: number;
  pageSize?: number;
  unpaged?: boolean;
};

export type BacktestOrdersPage = {
  totalPages?: number;
  totalElements?: number;
  size?: number;
  content?: BacktestOrder[];
  number?: number;
  sort?: BacktestPageSort;
  first?: boolean;
  last?: boolean;
  pageable?: BacktestPageable;
  numberOfElements?: number;
  empty?: boolean;
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
  buyOrdersCount?: number | null;
  sellOrdersCount?: number | null;
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

export async function getBacktestOrdersPage(
  userId: number,
  backtestId: number,
  req: BacktestOrdersPageRequest,
) {
  const params = new URLSearchParams();
  if (typeof req?.page === "number") {
    params.set("page", String(req.page));
  }
  if (typeof req?.size === "number") {
    params.set("size", String(req.size));
  }
  if (Array.isArray(req?.sort)) {
    req.sort.forEach((value) => {
      if (value) params.append("sort", value);
    });
  }

  const query = params.toString();
  const suffix = query ? `?${query}` : "";

  return api.get<BacktestOrdersPage>(
    `/api/v1/users/${userId}/backtests/${backtestId}/orders${suffix}`,
  );
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
