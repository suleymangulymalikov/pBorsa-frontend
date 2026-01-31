import { api } from "./client";

export type Timeframe =
  | "1Min"
  | "5Min"
  | "15Min"
  | "30Min"
  | "1Hour"
  | "4Hour"
  | "1Day"
  | "1Week";

export type StockBar = {
  symbol?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  tradeCount?: number;
  vwap?: number;
  timestamp?: string;
  bullish?: boolean;
  bearish?: boolean;
  [key: string]: unknown;
};

export type BarDataConfig = {
  supportedTimeframes?: Timeframe[];
  defaultTimeframe?: Timeframe;
  defaultBarsLimit?: number;
  maxBarsPerRequest?: number;
  updateIntervalSeconds?: number;
};

export async function getBarConfig() {
  return api.get<BarDataConfig>("/api/v1/bars/config");
}

export async function getBarsForChart(
  userId: number,
  symbol: string,
  timeframe: Timeframe,
  count?: number,
) {
  const qs = new URLSearchParams({
    timeframe,
    ...(count ? { count: String(count) } : {}),
  }).toString();

  return api.get<StockBar[]>(
    `/api/v1/bars/${userId}/${symbol}/chart?${qs}`,
  );
}

export async function getHistoricalBars(
  userId: number,
  symbol: string,
  timeframe: Timeframe,
  options?: { start?: string; end?: string; limit?: number },
) {
  const qs = new URLSearchParams({
    timeframe,
    ...(options?.start ? { start: options.start } : {}),
    ...(options?.end ? { end: options.end } : {}),
    ...(options?.limit ? { limit: String(options.limit) } : {}),
  }).toString();

  return api.get<StockBar[]>(
    `/api/v1/bars/${userId}/${symbol}/historical?${qs}`,
  );
}

export async function getLatestBar(
  userId: number,
  symbol: string,
  timeframe?: Timeframe,
) {
  const qs = new URLSearchParams({
    ...(timeframe ? { timeframe } : {}),
  }).toString();

  const suffix = qs ? `?${qs}` : "";
  return api.get<StockBar>(
    `/api/v1/bars/${userId}/${symbol}/latest${suffix}`,
  );
}

export async function getLatestBars(
  userId: number,
  symbols: string[],
  timeframe?: Timeframe,
) {
  const qs = new URLSearchParams({
    symbols: symbols.join(","),
    ...(timeframe ? { timeframe } : {}),
  }).toString();
  return api.get<Record<string, StockBar>>(
    `/api/v1/bars/${userId}/latest?${qs}`,
  );
}

/**
 * Returns the number of days to fetch per chunk based on timeframe.
 * Used for infinite scroll loading of historical data.
 */
export function getChunkSizeForTimeframe(timeframe: Timeframe): number {
  switch (timeframe) {
    case "1Min":
    case "5Min":
      return 3;
    case "15Min":
    case "30Min":
      return 7;
    case "1Hour":
      return 30;
    case "4Hour":
      return 90;
    case "1Day":
      return 365;
    case "1Week":
      return 730;
    default:
      return 30;
  }
}
