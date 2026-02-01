import { api } from "./client";

export type StockInfo = {
  symbol: string;
  name?: string;
  [key: string]: unknown;
};

export async function getAvailableStocks() {
  return api.get<StockInfo[]>("/api/v1/stocks");
}
