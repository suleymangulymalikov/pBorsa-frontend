import { api } from "./client";

export type AccountInfo = {
  accountId?: string;
  accountNumber?: string;
  status?: string; // e.g. "ACTIVE"
  currency?: string;

  cash?: string | number;
  portfolioValue?: string | number;
  buyingPower?: string | number;
  equity?: string | number;
  lastEquity?: string | number;

  longMarketValue?: string | number;
  shortMarketValue?: string | number;

  tradingBlocked?: boolean;
  transfersBlocked?: boolean;
  accountBlocked?: boolean;
  tradeSuspendedByUser?: boolean;

  patternDayTrader?: boolean;
  daytradeCount?: string | number;

  createdAt?: string;
  updatedAt?: string;
};

export async function getAccountInfo(userId: number) {
  return api.get<AccountInfo>(`/api/v1/account/${userId}`);
}

export async function refreshAccountInfo(userId: number) {
  return api.post<AccountInfo>(`/api/v1/account/${userId}/refresh`);
}

export async function getPortfolioValue(userId: number) {
  return api.get<string | number>(`/api/v1/account/${userId}/portfolio-value`);
}

export async function getUnrealizedPnl(userId: number) {
  return api.get<string | number>(`/api/v1/account/${userId}/unrealized-pnl`);
}
