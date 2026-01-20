import { api } from "./client";

export type Quote = {
  symbol?: string;
  bidPrice?: number;
  askPrice?: number;
  bidSize?: number;
  askSize?: number;
  timestamp?: string;

  [key: string]: unknown;
};

export type Period = "MINUTE" | "HOUR" | "DAY";

// ✅ match your backend bar JSON (timestamp/open/high/low/close/volume)
export type Bar = {
  symbol?: string;
  timestamp?: string;

  open?: number;
  high?: number;
  low?: number;
  close?: number;

  volume?: number;
  tradeCount?: number;
  vwap?: number;

  bearish?: boolean;
  bullish?: boolean;

  [key: string]: unknown;
};

export type Trade = {
  symbol?: string;
  price?: number;
  size?: number;
  timestamp?: string;
  exchange?: string;
  tradeId?: string;
  tape?: string;
  conditions?: string;
  [key: string]: unknown;
};

export type Snapshot = {
  quotes?: Quote[];
  latestTrades?: Trade[];
  latestBars?: Bar[];
  snapshotTimestamp?: string;
  dataSource?: string;
  [key: string]: unknown;
};

export async function getQuote(userId: number, symbol: string) {
  return api.get<Quote>(`/api/v1/market-data/${userId}/quotes/${symbol}`);
}

export async function getBars(
  userId: number,
  symbol: string,
  timeframe: number,
  period: Period,
  limit: number,
) {
  const qs = new URLSearchParams({
    timeframe: String(timeframe),
    period,
    limit: String(limit),
  }).toString();

  return api.get<Bar[]>(`/api/v1/market-data/${userId}/bars/${symbol}?${qs}`);
}

export async function getSnapshot(userId: number, symbols: string[]) {
  const qs = new URLSearchParams({
    symbols: symbols.join(","),
  }).toString();
  return api.get<Snapshot>(`/api/v1/market-data/${userId}/snapshot?${qs}`);
}

export async function startPolling(
  userId: number,
  symbols: string[],
  intervalSeconds: number,
) {
  const qs = new URLSearchParams({
    symbols: symbols.join(","),
    intervalSeconds: String(intervalSeconds),
  }).toString();
  return api.post<string>(`/api/v1/market-data/${userId}/polling/start?${qs}`);
}

export async function addPollingSymbols(userId: number, symbols: string[]) {
  const qs = new URLSearchParams({
    symbols: symbols.join(","),
  }).toString();
  return api.post<void>(`/api/v1/market-data/${userId}/polling/symbols?${qs}`);
}

export async function removePollingSymbols(userId: number, symbols: string[]) {
  const qs = new URLSearchParams({
    symbols: symbols.join(","),
  }).toString();
  return api.delete<void>(
    `/api/v1/market-data/${userId}/polling/symbols?${qs}`,
  );
}

export async function getPollingQuotes(userId: number) {
  return api.get<Quote[]>(`/api/v1/market-data/${userId}/polling/quotes`);
}

export async function stopPolling(userId: number) {
  return api.post<void>(`/api/v1/market-data/${userId}/polling/stop`);
}
