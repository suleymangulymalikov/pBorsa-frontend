import { api } from "./client";

export type Position = {
  symbol: string;
  quantity?: string | number;
  qty?: string | number;
  side?: "long" | "short" | string;

  marketValue?: string | number;
  costBasis?: string | number;

  averageEntryPrice?: string | number;
  avgEntryPrice?: string | number;
  currentPrice?: string | number;

  unrealizedPnL?: string | number;
  unrealizedPl?: string | number;
  unrealizedPnLPercent?: string | number;
  unrealizedPlpc?: string | number;

  [key: string]: unknown;
};

export async function getPositions(userId: number) {
  // ✅ correct backend path (AccountController)
  return api.get<Position[]>(`/api/v1/account/${userId}/positions`);
}
