
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth } from "../lib/firebase";
import { api } from "../api/client";
import Modal from "../components/Modal";
import StockChart, { type ChartMarker } from "../components/StockChart";
import {
  getHistoricalBars,
  getChunkSizeForTimeframe,
  type StockBar,
  type Timeframe,
} from "../api/barData";
import { getBaseStrategies, type BaseStrategy } from "../api/strategies";
import {
  createBacktest,
  deleteBacktest,
  getBacktest,
  getBacktests,
  startBacktest,
  type Backtest,
  type BacktestOrder,
} from "../api/backtests";

type MeResponse = {
  id: number;
  firebaseUid: string;
  email: string;
};

function fmtNum(v: unknown) {
  if (v === null || v === undefined || v === "") return "-";
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function fmtTime(value: unknown) {
  if (!value) return "-";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function fmtDate(value: unknown) {
  if (!value) return "-";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString();
}

function fmtStatus(value: unknown) {
  if (!value) return "-";
  return String(value).replace(/_/g, " ");
}

function formatPnL(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (Number.isNaN(n)) return "-";
  const formatted = n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n >= 0
    ? `+$${formatted}`
    : `-$${Math.abs(n).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}

function isNegative(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  const n = typeof value === "string" ? Number(value) : (value as number);
  return !Number.isNaN(n) && n < 0;
}

function formatPercent(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (Number.isNaN(n)) return "-";
  return `${(n * 100).toFixed(2)}%`;
}

function formatWinRate(total?: number | null, wins?: number | null): string {
  if (total === null || total === undefined) return "-";
  if (wins === null || wins === undefined) return "-";
  const t = Number(total);
  const w = Number(wins);
  if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(w)) return "-";
  return `${((w / t) * 100).toFixed(2)}%`;
}

function toUtcTimestamp(value: string): number | null {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor(t / 1000);
}

function sanitizeBars(bars: StockBar[]) {
  return [...bars]
    .filter((b) => b.timestamp)
    .sort((a, b) => {
      const ta = new Date(a.timestamp ?? 0).getTime();
      const tb = new Date(b.timestamp ?? 0).getTime();
      return ta - tb;
    });
}

function filterBarsToRange(
  bars: StockBar[],
  start?: string,
  end?: string,
): StockBar[] {
  if (!start && !end) return bars;
  const startMs = start ? new Date(start).getTime() : null;
  const endMs = end ? new Date(end).getTime() : null;
  return bars.filter((b) => {
    if (!b.timestamp) return false;
    const t = new Date(b.timestamp).getTime();
    if (Number.isNaN(t)) return false;
    if (startMs !== null && t < startMs) return false;
    if (endMs !== null && t > endMs) return false;
    return true;
  });
}

function BacktestBadge({ text }: { text: string }) {
  const status = String(text ?? "-");
  const cls =
    status === "COMPLETED"
      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
      : status === "RUNNING"
        ? "bg-blue-500/10 text-blue-300 border-blue-500/20"
        : status === "PREPARING"
          ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
          : status === "CREATED"
            ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
            : status === "FAILED"
              ? "bg-red-500/10 text-red-300 border-red-500/20"
              : "bg-gray-500/10 text-gray-300 border-gray-500/20";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}
    >
      {fmtStatus(status)}
    </span>
  );
}

export default function BacktestsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const userId = me?.id ?? null;

  const [baseStrategies, setBaseStrategies] = useState<BaseStrategy[]>([]);
  const [backtests, setBacktests] = useState<Backtest[]>([]);

  const [selectedBacktestId, setSelectedBacktestId] = useState<number | "">(
    "",
  );
  const [selectedBacktest, setSelectedBacktest] = useState<Backtest | null>(
    null,
  );
  const [orders, setOrders] = useState<BacktestOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [earliestLoadedDate, setEarliestLoadedDate] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const loadMoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [baseCode, setBaseCode] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("AAPL");
  const [budget, setBudget] = useState<string>("10000");
  const [testingStart, setTestingStart] = useState("");
  const [testingEnd, setTestingEnd] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);

  const [chartBars, setChartBars] = useState<StockBar[]>([]);
  const [chartTimeframe, setChartTimeframe] = useState<Timeframe>("1Day");
  const [chartResetKey, setChartResetKey] = useState(0);
  const [showCandles, setShowCandles] = useState(true);
  const [showLine, setShowLine] = useState(false);
  const [showVolume, setShowVolume] = useState(true);

  const normalizedSymbol = useMemo(() => symbol.trim().toUpperCase(), [symbol]);

  const hasRunning = useMemo(
    () =>
      backtests.some((b) =>
        ["PREPARING", "RUNNING"].includes(String(b?.status ?? "")),
      ),
    [backtests],
  );

  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return orders.find((o) => o.id === selectedOrderId) ?? null;
  }, [orders, selectedOrderId]);

  const sortedBacktests = useMemo(() => {
    const rank = (status: string) => {
      if (status === "RUNNING") return 0;
      if (status === "PREPARING") return 1;
      if (status === "CREATED") return 2;
      if (status === "COMPLETED") return 3;
      if (status === "FAILED") return 4;
      return 5;
    };
    return [...backtests].sort(
      (a, b) => rank(String(a.status ?? "")) - rank(String(b.status ?? "")),
    );
  }, [backtests]);

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const at = new Date(a.executedAt ?? a.createdAt ?? 0).getTime();
      const bt = new Date(b.executedAt ?? b.createdAt ?? 0).getTime();
      return bt - at;
    });
  }, [orders]);

  const ordersSummary = useMemo(() => {
    const total = orders.length;
    const buyCount = orders.filter((o) => o.side === "BUY").length;
    const sellCount = orders.filter((o) => o.side === "SELL").length;
    return { total, buyCount, sellCount };
  }, [orders]);

  const chartMarkers = useMemo((): ChartMarker[] => {
    if (!selectedBacktest?.symbol) return [];
    return orders
      .filter((o) => o.symbol === selectedBacktest.symbol)
      .map((order) => {
        const time = order.executedAt ? toUtcTimestamp(order.executedAt) : null;
        if (!time) return null;
        const isBuy = order.side === "BUY";
        return {
          time: time as ChartMarker["time"],
          position: isBuy ? "belowBar" : "aboveBar",
          color: isBuy ? "#22c55e" : "#ef4444",
          shape: isBuy ? "arrowUp" : "arrowDown",
          text: String(order.quantity ?? ""),
        } as ChartMarker;
      })
      .filter(Boolean) as ChartMarker[];
  }, [orders, selectedBacktest?.symbol]);

  async function loadBaseAndBacktests(uid: number) {
    setError(null);

    try {
      const [bases, tests] = await Promise.all([
        getBaseStrategies(),
        getBacktests(uid),
      ]);

      setBaseStrategies(Array.isArray(bases) ? bases : []);
      setBacktests(Array.isArray(tests) ? tests : []);

      if (!baseCode && Array.isArray(bases) && bases.length > 0) {
        setBaseCode(String(bases[0].code));
      }
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to load backtests. Please try again.";
      setError(errorMessage);
    }
  }

  async function loadBacktestsOnly(uid: number) {
    try {
      const tests = await getBacktests(uid);
      setBacktests(Array.isArray(tests) ? tests : []);
    } catch (e) {
      // ignore, the main error banner is set elsewhere
    }
  }

  const loadBacktestDetail = useCallback(
    async (uid: number, backtestId: number) => {
      setDetailLoading(true);
      setError(null);

      try {
        const data = await getBacktest(uid, backtestId);
        setSelectedBacktest(data);
        setOrders(Array.isArray(data.orders) ? data.orders : []);
        setSelectedOrderId(null);
      } catch (e: any) {
        const errorMessage =
          e?.message || "Failed to load backtest detail. Please try again.";
        setError(errorMessage);
        setSelectedBacktest(null);
        setOrders([]);
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  const loadChartData = useCallback(async () => {
    if (!userId || !selectedBacktest?.symbol) return;
    if (!selectedBacktest.testingStart || !selectedBacktest.testingEnd) return;

    setChartLoading(true);
    try {
      const bars = await getHistoricalBars(
        userId,
        selectedBacktest.symbol,
        chartTimeframe,
        {
          end: selectedBacktest.testingEnd,
          limit: 500,
        },
      );
      const cleanedBars = filterBarsToRange(
        sanitizeBars(Array.isArray(bars) ? bars : []),
        selectedBacktest.testingStart,
        selectedBacktest.testingEnd,
      );
      setChartBars(cleanedBars);
      setChartResetKey((k) => k + 1);
      if (cleanedBars.length > 0 && cleanedBars[0].timestamp) {
        setEarliestLoadedDate(cleanedBars[0].timestamp);
      } else {
        setEarliestLoadedDate(null);
      }
      setHasMoreHistory(true);
    } catch (e) {
      console.error("Failed to load chart data:", e);
      setChartBars([]);
      setEarliestLoadedDate(null);
    } finally {
      setChartLoading(false);
    }
  }, [
    userId,
    selectedBacktest?.symbol,
    selectedBacktest?.testingStart,
    selectedBacktest?.testingEnd,
    chartTimeframe,
  ]);

  const loadMoreHistory = useCallback(async () => {
    if (!userId || !selectedBacktest?.symbol || !earliestLoadedDate) return;
    if (!selectedBacktest.testingStart || !selectedBacktest.testingEnd) return;
    if (isLoadingMore || !hasMoreHistory) return;

    setIsLoadingMore(true);

    try {
      const earliestDate = new Date(earliestLoadedDate);
      const endDate = new Date(earliestDate.getTime() - 1000);
      const chunkDays = getChunkSizeForTimeframe(chartTimeframe);
      const startDate = new Date(
        endDate.getTime() - chunkDays * 24 * 60 * 60 * 1000,
      );

      const minStart = new Date(selectedBacktest.testingStart);
      const boundedStart = startDate < minStart ? minStart : startDate;

      if (endDate <= minStart) {
        setHasMoreHistory(false);
        return;
      }

      const data = await getHistoricalBars(
        userId,
        selectedBacktest.symbol,
        chartTimeframe,
        {
          start: boundedStart.toISOString(),
          end: endDate.toISOString(),
          limit: 5000,
        },
      );

      const newBars = filterBarsToRange(
        sanitizeBars(Array.isArray(data) ? data : []),
        selectedBacktest.testingStart,
        selectedBacktest.testingEnd,
      );

      if (newBars.length === 0) {
        setHasMoreHistory(false);
        return;
      }

      setChartBars((prev) => {
        const existingTimestamps = new Set(prev.map((b) => b.timestamp));
        const uniqueNewBars = newBars.filter(
          (b) => !existingTimestamps.has(b.timestamp),
        );
        return [...uniqueNewBars, ...prev];
      });

      if (newBars.length > 0 && newBars[0].timestamp) {
        setEarliestLoadedDate(newBars[0].timestamp);
      }

      if (boundedStart.getTime() === minStart.getTime()) {
        setHasMoreHistory(false);
      }
    } catch (e) {
      console.error("Failed to load more history:", e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    userId,
    selectedBacktest?.symbol,
    selectedBacktest?.testingStart,
    selectedBacktest?.testingEnd,
    earliestLoadedDate,
    isLoadingMore,
    hasMoreHistory,
    chartTimeframe,
  ]);

  const onScrollNearStart = useCallback(() => {
    if (loadMoreTimeoutRef.current) return;
    loadMoreTimeoutRef.current = setTimeout(() => {
      loadMoreTimeoutRef.current = null;
      if (!isLoadingMore) {
        void loadMoreHistory();
      }
    }, 300);
  }, [isLoadingMore, loadMoreHistory]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      try {
        const meData = await api.get<MeResponse>("/api/v1/users/me");
        setMe(meData);

        setLoading(true);
        setMessage(null);
        await loadBaseAndBacktests(meData.id);
      } catch (e: any) {
        const errorMessage =
          e?.message || "Unable to load user information. Please try again.";
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!userId) return;
    if (selectedBacktestId === "") return;
    void loadBacktestDetail(userId, selectedBacktestId as number);
  }, [userId, selectedBacktestId, loadBacktestDetail]);

  useEffect(() => {
    if (!userId || !hasRunning) return;

    const t = setInterval(() => {
      void loadBacktestsOnly(userId);
      if (selectedBacktestId !== "") {
        void loadBacktestDetail(userId, selectedBacktestId as number);
      }
    }, 3000);

    return () => clearInterval(t);
  }, [userId, hasRunning, selectedBacktestId, loadBacktestDetail]);

  useEffect(() => {
    if (selectedBacktest?.symbol) {
      void loadChartData();
    } else {
      setChartBars([]);
      setEarliestLoadedDate(null);
    }
  }, [
    selectedBacktest?.symbol,
    selectedBacktest?.testingStart,
    selectedBacktest?.testingEnd,
    chartTimeframe,
    loadChartData,
  ]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    const sym = normalizedSymbol;

    if (!baseCode || !name.trim() || !sym) {
      setError("Please select a base strategy, enter a name, and a symbol.");
      return;
    }

    if (!budget || Number.isNaN(Number(budget)) || Number(budget) <= 0) {
      setError("Budget must be greater than 0.");
      return;
    }

    if (!testingStart || !testingEnd) {
      setError("Please select a testing start and end date.");
      return;
    }

    const startIso = new Date(testingStart).toISOString();
    const endIso = new Date(testingEnd).toISOString();

    if (new Date(startIso).getTime() >= new Date(endIso).getTime()) {
      setError("Testing start must be before testing end.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await createBacktest(userId, {
        baseStrategyCode: baseCode,
        name: name.trim(),
        symbol: sym,
        budget: Number(budget),
        testingStart: startIso,
        testingEnd: endIso,
      });

      setMessage("Backtest created.");
      setName("");
      setShowCreateModal(false);
      await loadBaseAndBacktests(userId);
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to create backtest. Please try again.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const onStart = async (id: number) => {
    if (!userId) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await startBacktest(userId, id);
      setMessage("Backtest started.");
      await loadBacktestsOnly(userId);
      if (selectedBacktestId === id) {
        await loadBacktestDetail(userId, id);
      }
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to start backtest. Please try again.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async (id: number) => {
    if (!userId) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await deleteBacktest(userId, id);
      setMessage("Backtest deleted.");
      await loadBacktestsOnly(userId);
      if (selectedBacktestId === id) {
        setSelectedBacktestId("");
        setSelectedBacktest(null);
        setOrders([]);
        setChartBars([]);
      }
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to delete backtest. Please try again.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-white">
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <h1 className="text-2xl font-semibold">Backtests</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Create, run, and review strategy backtests for{" "}
            <span className="text-white">{me?.email ?? "..."}</span>
          </p>

          {hasRunning && (
            <div className="mt-3 text-xs text-blue-300">
              One or more backtests are PREPARING/RUNNING - auto-refresh is
              running.
            </div>
          )}

          {message && (
            <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {message}
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Base Strategies</div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="rounded-lg bg-[#1f6feb] px-4 py-2 text-sm font-semibold text-white"
            >
              + Create Backtest
            </button>
          </div>
          {baseStrategies.length === 0 ? (
            <div className="mt-3 text-sm text-[var(--muted)]">
              No base strategies found.
            </div>
          ) : (
            <div className="mt-4 overflow-auto rounded-lg border border-[#132033]">
              <table className="min-w-full text-sm">
                <thead className="bg-[#0b1728] text-left text-xs text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#132033]">
                  {baseStrategies.map((s) => (
                    <tr key={s.code}>
                      <td className="px-4 py-3 font-mono text-xs text-white">
                        {s.code}
                      </td>
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3 text-[var(--muted)]">
                        {s.description ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Create Backtest"
        >
          <form onSubmit={onCreate}>
            <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">
              Base strategy
            </label>
            <select
              className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
              value={baseCode}
              onChange={(e) => setBaseCode(e.target.value)}
              disabled={loading || baseStrategies.length === 0}
            >
              {baseStrategies.length === 0 ? (
                <option value="">No base strategies</option>
              ) : (
                baseStrategies.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code} - {b.name}
                  </option>
                ))
              )}
            </select>

            <label className="mt-4 block text-xs uppercase tracking-wide text-[var(--muted)]">
              Name
            </label>
            <input
              className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Backtest 1"
              required
            />

            <label className="mt-4 block text-xs uppercase tracking-wide text-[var(--muted)]">
              Symbol
            </label>
            <input
              className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="AAPL"
              required
            />

            <label className="mt-4 block text-xs uppercase tracking-wide text-[var(--muted)]">
              Budget (USD)
            </label>
            <input
              type="number"
              className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
              value={budget}
              min={0.01}
              step={0.01}
              onChange={(e) => setBudget(e.target.value)}
              required
            />

            <label className="mt-4 block text-xs uppercase tracking-wide text-[var(--muted)]">
              Testing Start (local)
            </label>
            <input
              type="datetime-local"
              className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
              value={testingStart}
              onChange={(e) => setTestingStart(e.target.value)}
              required
            />

            <label className="mt-4 block text-xs uppercase tracking-wide text-[var(--muted)]">
              Testing End (local)
            </label>
            <input
              type="datetime-local"
              className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
              value={testingEnd}
              onChange={(e) => setTestingEnd(e.target.value)}
              required
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg border border-[#1f2e44] px-4 py-2 text-sm text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !userId || baseStrategies.length === 0}
                className="rounded-lg bg-[#1f6feb] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? "Working..." : "Create backtest"}
              </button>
            </div>
          </form>
        </Modal>

        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Your Backtests</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Run a backtest to generate orders and results.
              </div>
            </div>

            <button
              disabled={loading || !userId}
              className="rounded-lg border border-[#1f2e44] px-4 py-2 text-sm text-white disabled:opacity-60"
              onClick={() => userId && loadBacktestsOnly(userId)}
              type="button"
            >
              Refresh
            </button>
          </div>

          {backtests.length === 0 ? (
            <div className="mt-3 text-sm text-[var(--muted)]">
              You have no backtests yet. Create one above.
            </div>
          ) : (
            <div className="mt-4 overflow-auto rounded-lg border border-[#132033]">
              <table className="min-w-full text-sm">
                <thead className="bg-[#0b1728] text-left text-xs text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Base</th>
                    <th className="px-4 py-3">Symbol</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">P/L</th>
                    <th className="px-4 py-3">Win Rate</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#132033]">
                  {sortedBacktests.map((b) => {
                    const status = String(b.status ?? "-");
                    const canStart = status === "CREATED";
                    const canDelete =
                      status === "CREATED" || status === "COMPLETED";
                    const isSelected = selectedBacktestId === b.id;
                    const winRate = formatWinRate(
                      b.totalTrades ?? null,
                      b.winningTrades ?? null,
                    );

                    return (
                      <tr
                        key={b.id}
                        className={`transition-colors ${
                          isSelected
                            ? "bg-[#0b1728] border-l-2 border-l-[#1f6feb]"
                            : "hover:bg-[#0b1728]/50"
                        }`}
                        onClick={() => setSelectedBacktestId(b.id)}
                        title="Click to view details"
                      >
                        <td className="px-4 py-3 font-mono text-xs">
                          {b.id}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {b.name ?? "-"}
                        </td>
                        <td className="px-4 py-3">
                          {b.baseStrategy?.code ?? b.baseStrategyCode ?? "-"}
                        </td>
                        <td className="px-4 py-3">{b.symbol ?? "-"}</td>
                        <td className="px-4 py-3 text-xs text-[var(--muted)]">
                          {fmtDate(b.testingStart)} {"\u2192"}{" "}
                          {fmtDate(b.testingEnd)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              isNegative(b.pnl)
                                ? "text-red-400"
                                : "text-emerald-400"
                            }
                          >
                            {formatPnL(b.pnl)}
                          </span>
                        </td>
                        <td className="px-4 py-3">{winRate}</td>
                        <td className="px-4 py-3">
                          <BacktestBadge text={status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded-lg border border-[#1f2e44] px-3 py-1.5 text-xs text-white disabled:opacity-60"
                              disabled={loading}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBacktestId(b.id);
                              }}
                              type="button"
                            >
                              View
                            </button>
                            <button
                              className="rounded-lg bg-[#1f6feb] px-3 py-1.5 text-xs text-white disabled:opacity-60"
                              disabled={loading || !canStart}
                              onClick={(e) => {
                                e.stopPropagation();
                                void onStart(b.id);
                              }}
                              type="button"
                            >
                              Start
                            </button>
                            <button
                              className="rounded-lg border border-[#1f2e44] px-3 py-1.5 text-xs text-white disabled:opacity-60"
                              disabled={loading || !canDelete}
                              onClick={(e) => {
                                e.stopPropagation();
                                void onDelete(b.id);
                              }}
                              type="button"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-[#132033] bg-[#0f1b2d] p-4">
            <div className="text-xs text-[var(--muted)]">Total Orders</div>
            <div className="mt-2 text-2xl font-semibold">
              {ordersSummary.total}
            </div>
          </div>
          <div className="rounded-xl border border-[#132033] bg-[#0f1b2d] p-4">
            <div className="text-xs text-[var(--muted)]">BUY Orders</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-300">
              {ordersSummary.buyCount}
            </div>
          </div>
          <div className="rounded-xl border border-[#132033] bg-[#0f1b2d] p-4">
            <div className="text-xs text-[var(--muted)]">SELL Orders</div>
            <div className="mt-2 text-2xl font-semibold text-amber-300">
              {ordersSummary.sellCount}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="text-sm font-semibold">Orders List</div>

          {selectedBacktestId === "" ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="text-sm font-medium text-amber-200">
                  Select a Backtest to View Orders
                </div>
                <div className="mt-1 text-xs text-amber-300/80">
                  Choose a backtest from the list above to load its orders.
                </div>
              </div>
            </div>
          ) : detailLoading ? (
            <div className="mt-3 text-sm text-[var(--muted)]">
              Loading backtest details.
            </div>
          ) : orders.length === 0 ? (
            <div className="mt-3 text-sm text-[var(--muted)]">
              No orders for this backtest yet.
            </div>
          ) : (
            <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-[#132033]">
              <table className="min-w-full text-sm">
                <thead className="bg-[#0b1728] text-left text-xs text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3 w-12">#</th>
                    <th className="px-4 py-3">Symbol</th>
                    <th className="px-4 py-3">Side</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Price</th>
                    <th className="px-4 py-3">Executed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#132033]">
                  {sortedOrders.map((o, idx) => {
                    const isSelected = selectedOrderId === o.id;
                    return (
                      <tr
                        key={o.id ?? `row-${idx}`}
                        className={`transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-[#0b1728] border-l-2 border-l-[#1f6feb]"
                            : "hover:bg-[#0b1728]/50"
                        }`}
                        onClick={() => setSelectedOrderId(o.id)}
                        title="Click to view detail"
                      >
                        <td className="px-4 py-3 text-xs text-[var(--muted)]">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {o.symbol ?? "-"}
                        </td>
                        <td className="px-4 py-3">{o.side ?? "-"}</td>
                        <td className="px-4 py-3">{fmtNum(o.quantity)}</td>
                        <td className="px-4 py-3">{fmtNum(o.price)}</td>
                        <td className="px-4 py-3">
                          {fmtTime(o.executedAt ?? o.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
            <div className="text-sm font-semibold">Selected Order Detail</div>

            {detailLoading ? (
              <div className="mt-3 text-sm text-[var(--muted)]">
                Loading detail.
              </div>
            ) : !selectedOrder ? (
              <div className="mt-3 text-sm text-[var(--muted)]">
                Click an order from the list to view its details.
              </div>
            ) : (
              <div className="mt-4 grid gap-4 text-sm">
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Order ID</div>
                  <div className="mt-1 font-mono text-xs">
                    {selectedOrder.id ?? "-"}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Symbol</div>
                    <div className="mt-1">{selectedOrder.symbol ?? "-"}</div>
                  </div>
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Side</div>
                    <div className="mt-1">{selectedOrder.side ?? "-"}</div>
                  </div>
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Quantity</div>
                    <div className="mt-1">
                      {fmtNum(selectedOrder.quantity)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Price</div>
                    <div className="mt-1">{fmtNum(selectedOrder.price)}</div>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Executed</div>
                    <div className="mt-1">
                      {fmtTime(selectedOrder.executedAt)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Created</div>
                    <div className="mt-1">
                      {fmtTime(selectedOrder.createdAt)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
            <div className="text-sm font-semibold">Backtest Summary</div>

            {detailLoading ? (
              <div className="mt-3 text-sm text-[var(--muted)]">
                Loading summary.
              </div>
            ) : !selectedBacktest ? (
              <div className="mt-3 text-sm text-[var(--muted)]">
                Select a backtest to view its summary.
              </div>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Backtest ID</div>
                  <div className="mt-1">{selectedBacktest.id}</div>
                </div>
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Status</div>
                  <div className="mt-1">
                    <BacktestBadge text={String(selectedBacktest.status)} />
                  </div>
                </div>
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Name</div>
                  <div className="mt-1">{selectedBacktest.name ?? "-"}</div>
                </div>
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Base</div>
                  <div className="mt-1">
                    {selectedBacktest.baseStrategy?.code ??
                      selectedBacktest.baseStrategyCode ??
                      "-"}
                  </div>
                </div>
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Symbol</div>
                  <div className="mt-1">{selectedBacktest.symbol ?? "-"}</div>
                </div>
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Budget</div>
                  <div className="mt-1">
                    {fmtNum(selectedBacktest.budget)}
                  </div>
                </div>
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">
                    Testing Start
                  </div>
                  <div className="mt-1">
                    {fmtTime(selectedBacktest.testingStart)}
                  </div>
                </div>
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Testing End</div>
                  <div className="mt-1">
                    {fmtTime(selectedBacktest.testingEnd)}
                  </div>
                </div>
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">P/L</div>
                  <div
                    className={`mt-1 ${
                      isNegative(selectedBacktest.pnl)
                        ? "text-red-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {formatPnL(selectedBacktest.pnl)}
                  </div>
                </div>
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Max Drawdown</div>
                  <div className="mt-1">
                    {formatPercent(selectedBacktest.maxDrawdown)}
                  </div>
                </div>
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Total Trades</div>
                  <div className="mt-1">
                    {fmtNum(selectedBacktest.totalTrades)}
                  </div>
                </div>
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">
                    Winning Trades
                  </div>
                  <div className="mt-1">
                    {fmtNum(selectedBacktest.winningTrades)}
                  </div>
                </div>
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Win Rate</div>
                  <div className="mt-1">
                    {formatWinRate(
                      selectedBacktest.totalTrades ?? null,
                      selectedBacktest.winningTrades ?? null,
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Created</div>
                  <div className="mt-1">
                    {fmtTime(selectedBacktest.createdAt)}
                  </div>
                </div>
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Updated</div>
                  <div className="mt-1">
                    {fmtTime(selectedBacktest.updatedAt)}
                  </div>
                </div>
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Completed</div>
                  <div className="mt-1">
                    {fmtTime(selectedBacktest.completedAt)}
                  </div>
                </div>
                {selectedBacktest.errorMessage && (
                  <div className="md:col-span-2 rounded-lg border border-red-500/40 bg-red-500/10 p-4">
                    <div className="text-xs uppercase tracking-wide text-red-200">
                      Error Message
                    </div>
                    <div className="mt-2 text-xs text-red-100">
                      {selectedBacktest.errorMessage}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">
                {selectedBacktest?.symbol
                  ? `${selectedBacktest.symbol} Price Chart`
                  : "Price Chart"}
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                {selectedBacktest?.symbol
                  ? `Orders: ${ordersSummary.buyCount} BUY, ${ordersSummary.sellCount} SELL`
                  : "Select a backtest to view chart with order markers"}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
                value={chartTimeframe}
                onChange={(e) => setChartTimeframe(e.target.value as Timeframe)}
                disabled={!selectedBacktest?.symbol}
              >
                <option value="1Min">1Min</option>
                <option value="5Min">5Min</option>
                <option value="15Min">15Min</option>
                <option value="30Min">30Min</option>
                <option value="1Hour">1Hour</option>
                <option value="4Hour">4Hour</option>
                <option value="1Day">1Day</option>
                <option value="1Week">1Week</option>
              </select>
              <button
                className="rounded-lg border border-[#1f2e44] px-3 py-2 text-xs text-white disabled:opacity-60"
                onClick={() => void loadChartData()}
                disabled={chartLoading || !selectedBacktest?.symbol}
              >
                {chartLoading ? "Loading..." : "Refresh"}
              </button>
              {isLoadingMore && (
                <span className="text-xs text-[var(--muted)]">
                  Loading more...
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showCandles}
                onChange={(e) => setShowCandles(e.target.checked)}
                disabled={!selectedBacktest?.symbol}
              />
              Candles
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showLine}
                onChange={(e) => setShowLine(e.target.checked)}
                disabled={!selectedBacktest?.symbol}
              />
              Line
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showVolume}
                onChange={(e) => setShowVolume(e.target.checked)}
                disabled={!selectedBacktest?.symbol}
              />
              Volume
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-[#132033] bg-[#0b1728] p-3">
            {!selectedBacktest?.symbol ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-[var(--muted)]">
                Select a backtest to view the chart
              </div>
            ) : chartLoading ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-[var(--muted)]">
                Loading chart data...
              </div>
            ) : chartBars.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-[var(--muted)]">
                No price data available
              </div>
            ) : (
              <StockChart
                bars={chartBars}
                showCandles={showCandles}
                showLine={showLine}
                showVolume={showVolume}
                resetKey={chartResetKey}
                timeframe={chartTimeframe}
                markers={chartMarkers}
                height={300}
                onScrollNearStart={onScrollNearStart}
              />
            )}
          </div>

          {selectedBacktest?.symbol && (
            <div className="mt-3 flex items-center gap-4 text-xs text-[var(--muted)]">
              <div className="flex items-center gap-1">
                <span
                  className="inline-block h-0 w-0"
                  style={{
                    borderLeft: "5px solid transparent",
                    borderRight: "5px solid transparent",
                    borderBottom: "8px solid #22c55e",
                  }}
                />
                <span>BUY</span>
              </div>
              <div className="flex items-center gap-1">
                <span
                  className="inline-block h-0 w-0"
                  style={{
                    borderLeft: "5px solid transparent",
                    borderRight: "5px solid transparent",
                    borderTop: "8px solid #ef4444",
                  }}
                />
                <span>SELL</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
