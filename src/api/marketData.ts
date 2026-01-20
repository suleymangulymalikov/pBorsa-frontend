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
