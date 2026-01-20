import { api } from "./client";

export type Position = {
  symbol: string;
  qty?: string | number;
  side?: "long" | "short" | string;

  marketValue?: string | number;
  costBasis?: string | number;

  avgEntryPrice?: string | number;
  currentPrice?: string | number;

  unrealizedPl?: string | number;
  unrealizedPlpc?: string | number;

  [key: string]: unknown;
};

export async function getPositions(userId: number) {
  // ✅ correct backend path (AccountController)
  return api.get<Position[]>(`/api/v1/account/${userId}/positions`);
}
