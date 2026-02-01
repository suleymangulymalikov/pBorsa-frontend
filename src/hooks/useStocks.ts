import { useCallback, useEffect, useState } from "react";
import { getAvailableStocks, type StockInfo } from "../api/stocks";

type UseStocksResult = {
  stocks: StockInfo[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

let cachedStocks: StockInfo[] | null = null;
let inflight: Promise<StockInfo[]> | null = null;

function normalizeStocks(list: StockInfo[]): StockInfo[] {
  const map = new Map<string, StockInfo>();
  for (const item of list) {
    if (!item) continue;
    const symbol = String(item.symbol ?? "")
      .trim()
      .toUpperCase();
    if (!symbol) continue;
    const name = item.name ? String(item.name) : undefined;
    const existing = map.get(symbol);
    if (!existing) {
      map.set(symbol, { ...item, symbol, name });
      continue;
    }
    if (!existing.name && name) {
      map.set(symbol, { ...existing, name });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.symbol.localeCompare(b.symbol),
  );
}

async function fetchStocks(): Promise<StockInfo[]> {
  if (cachedStocks) return cachedStocks;
  if (!inflight) {
    inflight = getAvailableStocks()
      .then((data) => normalizeStocks(Array.isArray(data) ? data : []))
      .finally(() => {
        inflight = null;
      });
  }
  cachedStocks = await inflight;
  return cachedStocks;
}

export function useStocks(): UseStocksResult {
  const [stocks, setStocks] = useState<StockInfo[]>(cachedStocks ?? []);
  const [loading, setLoading] = useState(!cachedStocks);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      cachedStocks = await getAvailableStocks().then((data) =>
        normalizeStocks(Array.isArray(data) ? data : []),
      );
      setStocks(cachedStocks);
    } catch (e: any) {
      const message = e?.message || "Failed to load stocks.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cachedStocks) {
      setStocks(cachedStocks);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchStocks()
      .then((data) => {
        if (cancelled) return;
        setStocks(data);
      })
      .catch((e: any) => {
        if (cancelled) return;
        const message = e?.message || "Failed to load stocks.";
        setError(message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { stocks, loading, error, refresh };
}
