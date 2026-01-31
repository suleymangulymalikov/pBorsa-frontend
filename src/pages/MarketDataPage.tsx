import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import { api } from "../api/client";
import {
  type BarDataConfig,
  type StockBar,
  type Timeframe,
  getBarConfig,
  getChunkSizeForTimeframe,
  getHistoricalBars,
  getLatestBar,
  getLatestBars,
} from "../api/barData";
import StockChart, { type ChartHover } from "../components/StockChart";

type MeResponse = {
  id: number;
  firebaseUid: string;
  email: string;
};

type DatePreset = "1W" | "1M" | "3M" | "6M" | "1Y" | "YTD" | "ALL";

const FALLBACK_TIMEFRAMES: Timeframe[] = [
  "1Min",
  "5Min",
  "15Min",
  "30Min",
  "1Hour",
  "4Hour",
  "1Day",
  "1Week",
];

function fmtNum(value: unknown, max = 4) {
  if (value === null || value === undefined || value === "") return "-";
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString(undefined, { maximumFractionDigits: max });
}

function fmtTime(value: unknown) {
  if (!value) return "-";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function normalizeSymbols(value: string) {
  const seen = new Set<string>();
  return value
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((symbol) => {
      if (!symbol || seen.has(symbol)) return false;
      seen.add(symbol);
      return true;
    });
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

function getDateRangeFromPreset(preset: DatePreset): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString();
  let start: Date;

  switch (preset) {
    case "1W":
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "1M":
      start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      break;
    case "3M":
      start = new Date(now);
      start.setMonth(start.getMonth() - 3);
      break;
    case "6M":
      start = new Date(now);
      start.setMonth(start.getMonth() - 6);
      break;
    case "1Y":
      start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      break;
    case "YTD":
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case "ALL":
      start = new Date(2000, 0, 1);
      break;
    default:
      start = new Date(now);
      start.setMonth(start.getMonth() - 1);
  }

  return { start: start.toISOString(), end };
}

export default function MarketDataPage() {
  const nav = useNavigate();

  const [me, setMe] = useState<MeResponse | null>(null);
  const userId = me?.id ?? null;

  const [config, setConfig] = useState<BarDataConfig | null>(null);
  const [timeframeOptions, setTimeframeOptions] = useState<Timeframe[]>(
    FALLBACK_TIMEFRAMES,
  );
  const [timeframe, setTimeframe] = useState<Timeframe>("5Min");
  const [datePreset, setDatePreset] = useState<DatePreset>("1M");

  const [symbolsInput, setSymbolsInput] = useState("AAPL,MSFT,NVDA");
  const [symbols, setSymbols] = useState<string[]>(
    normalizeSymbols("AAPL,MSFT,NVDA"),
  );
  const [activeSymbol, setActiveSymbol] = useState("AAPL");

  const [bars, setBars] = useState<StockBar[]>([]);
  const [latestBars, setLatestBars] = useState<Record<string, StockBar>>({});
  const [hover, setHover] = useState<ChartHover | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [showCandles, setShowCandles] = useState(true);
  const [showLine, setShowLine] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [chartResetKey, setChartResetKey] = useState(0);

  // Infinite scroll states
  const [earliestLoadedDate, setEarliestLoadedDate] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const loadMoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateIntervalSeconds = config?.updateIntervalSeconds ?? 30;
  const lastBar = bars[bars.length - 1];

  const paramsRef = useRef({
    userId,
    activeSymbol,
    datePreset,
    timeframe,
    config,
  });

  paramsRef.current = {
    userId,
    activeSymbol,
    datePreset,
    timeframe,
    config,
  };

  const refreshWatchlist = useCallback(async () => {
    if (!userId || symbols.length === 0) return;
    setLoadingLatest(true);
    setError(null);
    try {
      const data = await getLatestBars(userId, symbols, timeframe);
      setLatestBars(data || {});
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to load latest bars for watchlist.";
      setError(errorMessage);
    } finally {
      setLoadingLatest(false);
    }
  }, [symbols, timeframe, userId]);

  const loadBars = useCallback(async () => {
    const {
      userId: currentUserId,
      activeSymbol: currentSymbol,
      datePreset: currentPreset,
      timeframe: currentTimeframe,
      config: currentConfig,
    } = paramsRef.current;

    if (!currentUserId || !currentSymbol) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { start, end } = getDateRangeFromPreset(currentPreset);
      const limit = currentConfig?.maxBarsPerRequest ?? 5000;

      const data = await getHistoricalBars(currentUserId, currentSymbol, currentTimeframe, {
        start,
        end,
        limit,
      });

      const cleaned = sanitizeBars(Array.isArray(data) ? data : []);
      setBars(cleaned);
      setChartResetKey((k) => k + 1);
      setMessage(`Loaded ${cleaned.length} bars for ${currentSymbol}.`);

      // Track earliest loaded date for infinite scroll
      if (cleaned.length > 0 && cleaned[0].timestamp) {
        setEarliestLoadedDate(cleaned[0].timestamp);
      } else {
        setEarliestLoadedDate(null);
      }
      setHasMoreHistory(true);

      setLatestBars((prev) => ({
        ...prev,
        ...(cleaned.length
          ? { [currentSymbol]: cleaned[cleaned.length - 1] }
          : {}),
      }));
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to load bars. Please try again.";
      setError(errorMessage);
      setBars([]);
      setEarliestLoadedDate(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const onApplyWatchlist = () => {
    const next = normalizeSymbols(symbolsInput);
    if (next.length === 0) {
      setError("Please add at least one symbol.");
      return;
    }
    setSymbols(next);
    if (!next.includes(activeSymbol)) {
      setActiveSymbol(next[0]);
    }
    setError(null);
    void refreshWatchlist();
  };

  const onRemoveSymbol = (symbol: string) => {
    const next = symbols.filter((s) => s !== symbol);
    setSymbols(next);
    setSymbolsInput(next.join(","));
    if (activeSymbol === symbol) {
      setActiveSymbol(next[0] ?? "");
    }
  };

  const loadMoreHistory = useCallback(async () => {
    if (!userId || !activeSymbol || !earliestLoadedDate || isLoadingMore || !hasMoreHistory) {
      return;
    }

    setIsLoadingMore(true);

    try {
      // Calculate end time as 1 second before the earliest loaded date
      const earliestDate = new Date(earliestLoadedDate);
      const endDate = new Date(earliestDate.getTime() - 1000);

      // Calculate start based on chunk size for the timeframe
      const chunkDays = getChunkSizeForTimeframe(timeframe);
      const startDate = new Date(endDate.getTime() - chunkDays * 24 * 60 * 60 * 1000);

      const data = await getHistoricalBars(userId, activeSymbol, timeframe, {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        limit: config?.maxBarsPerRequest ?? 5000,
      });

      const newBars = sanitizeBars(Array.isArray(data) ? data : []);

      if (newBars.length === 0) {
        setHasMoreHistory(false);
        return;
      }

      setBars((prev) => {
        // Filter out duplicates based on timestamp
        const existingTimestamps = new Set(prev.map((b) => b.timestamp));
        const uniqueNewBars = newBars.filter((b) => !existingTimestamps.has(b.timestamp));
        return [...uniqueNewBars, ...prev];
      });

      // Update earliest loaded date
      if (newBars.length > 0 && newBars[0].timestamp) {
        setEarliestLoadedDate(newBars[0].timestamp);
      }
    } catch (e: any) {
      // Silent fail for infinite scroll loading
      console.error("Failed to load more history:", e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [userId, activeSymbol, earliestLoadedDate, isLoadingMore, hasMoreHistory, timeframe, config]);

  const onScrollNearStart = useCallback(() => {
    // Debounce the load more calls
    if (loadMoreTimeoutRef.current) {
      return;
    }
    loadMoreTimeoutRef.current = setTimeout(() => {
      loadMoreTimeoutRef.current = null;
      void loadMoreHistory();
    }, 300);
  }, [loadMoreHistory]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        nav("/login", { replace: true });
        return;
      }

      try {
        setError(null);
        const data = await api.get<MeResponse>("/api/v1/users/me");
        setMe(data);

        const cfg = await getBarConfig();
        if (cfg) {
          setConfig(cfg);
          const supported =
            cfg.supportedTimeframes
              ?.filter((tf): tf is Timeframe =>
                FALLBACK_TIMEFRAMES.includes(tf as Timeframe),
              )
              .filter(Boolean) ?? [];
          const options = supported.length ? supported : FALLBACK_TIMEFRAMES;
          setTimeframeOptions(options);
          const defaultTf =
            cfg.defaultTimeframe && options.includes(cfg.defaultTimeframe)
              ? cfg.defaultTimeframe
              : options[0];
          setTimeframe(defaultTf);
        }
      } catch (e: any) {
        const errorMessage =
          e?.message || "Unable to load configuration. Please try again.";
        setError(errorMessage);
      }
    });

    return () => unsub();
  }, [nav]);

  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    if (!userId || !activeSymbol) return;
    setRequestKey((k) => k + 1);
  }, [userId, activeSymbol, timeframe, datePreset]);

  useEffect(() => {
    if (!requestKey) return;
    void loadBars();
  }, [requestKey, loadBars]);

  useEffect(() => {
    if (!userId || !activeSymbol) return;

    let cancelled = false;
    const intervalMs = Math.max(5, updateIntervalSeconds) * 1000;

    const poll = async () => {
      try {
        const latest = await getLatestBar(userId, activeSymbol, timeframe);
        if (cancelled || !latest?.timestamp) return;

        const latestTimestamp = latest.timestamp;
        setBars((prev) => {
          if (prev.length === 0) return [latest];
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.timestamp === latestTimestamp) {
            next[next.length - 1] = { ...last, ...latest };
          } else if (
            new Date(latestTimestamp).getTime() >
            new Date(last?.timestamp ?? "1970-01-01").getTime()
          ) {
            next.push(latest);
          }
          return next;
        });
        setLatestBars((prev) => ({ ...prev, [activeSymbol]: latest }));
      } catch {
        // Keep silent on polling errors
      }
    };

    const id = setInterval(() => {
      void poll();
    }, intervalMs);

    void poll();

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [userId, activeSymbol, timeframe, updateIntervalSeconds]);

  useEffect(() => {
    if (!userId || symbols.length === 0) return;
    void refreshWatchlist();
  }, [refreshWatchlist, userId, symbols.length]);

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-white">
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">Market Data</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                OHLCV bars for{" "}
                <span className="text-white">{me?.email ?? "..."}</span>
              </p>
            </div>
            <div className="rounded-lg border border-[#132033] bg-[#0b1728] px-3 py-2 text-xs text-[var(--muted)]">
              Live updates every {updateIntervalSeconds}s
            </div>
          </div>

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
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">Watchlist</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Pick one symbol to display in the chart.
              </div>
            </div>
            <button
              className="rounded-lg border border-[#1f2e44] px-3 py-2 text-xs text-white disabled:opacity-60"
              onClick={() => void refreshWatchlist()}
              disabled={loadingLatest || !userId}
            >
              {loadingLatest ? "Refreshing..." : "Refresh latest"}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              className="min-w-[260px] rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
              value={symbolsInput}
              onChange={(e) => setSymbolsInput(e.target.value)}
              placeholder="AAPL,MSFT,NVDA"
            />
            <button
              onClick={onApplyWatchlist}
              className="rounded-lg bg-[#1f6feb] px-4 py-2 text-sm font-semibold text-white"
            >
              Apply watchlist
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {symbols.map((symbol) => {
              const latest = latestBars[symbol];
              return (
                <div
                  key={symbol}
                  className={
                    activeSymbol === symbol
                      ? "flex items-center gap-2 rounded-full border border-[#1f6feb]/60 bg-[#1f6feb]/20 px-3 py-1 text-xs text-white"
                      : "flex items-center gap-2 rounded-full border border-[#1f2e44] bg-[#0b1728] px-3 py-1 text-xs text-white"
                  }
                >
                  <button
                    className="font-semibold"
                    onClick={() => setActiveSymbol(symbol)}
                  >
                    {symbol}
                  </button>
                  <span className="text-[var(--muted)]">
                    {latest?.close !== undefined ? fmtNum(latest.close, 2) : "-"}
                  </span>
                  <button
                    className="text-[var(--muted)] hover:text-white"
                    onClick={() => onRemoveSymbol(symbol)}
                    title="Remove symbol"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">Chart settings</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Customize selection and chart style.
              </div>
            </div>
            <button
              onClick={() => setRequestKey((k) => k + 1)}
              disabled={loading || !userId || !activeSymbol}
              className="rounded-lg bg-[#1f6feb] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Loading..." : "Load chart"}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Timeframe
            </label>
            <select
              className="rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            >
              {timeframeOptions.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Period
            </label>
            <div className="flex overflow-hidden rounded-lg border border-[#1f2e44]">
              {(["1W", "1M", "3M", "6M", "1Y", "YTD", "ALL"] as DatePreset[]).map((preset) => (
                <button
                  key={preset}
                  className={
                    datePreset === preset
                      ? "bg-[#1f6feb] px-3 py-2 text-xs font-semibold text-white"
                      : "px-3 py-2 text-xs text-white hover:bg-[#1f2e44]"
                  }
                  onClick={() => setDatePreset(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
            {isLoadingMore && (
              <span className="text-xs text-[var(--muted)]">Loading more...</span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showCandles}
                onChange={(e) => setShowCandles(e.target.checked)}
              />
              Candles
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showLine}
                onChange={(e) => setShowLine(e.target.checked)}
              />
              Line
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showVolume}
                onChange={(e) => setShowVolume(e.target.checked)}
              />
              Volume
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">
                {activeSymbol || "Chart"}
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Hover to inspect a specific bar.
              </div>
            </div>
            <div className="rounded-lg border border-[#132033] bg-[#0b1728] px-3 py-2 text-xs text-[var(--muted)]">
              {hover?.time ? `Hover ${fmtTime(hover.time)}` : "Latest bar"}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-3">
              <div className="text-[10px] uppercase text-[var(--muted)]">
                Open
              </div>
              <div className="mt-1 text-sm font-semibold">
                {fmtNum(hover?.open ?? lastBar?.open, 2)}
              </div>
            </div>
            <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-3">
              <div className="text-[10px] uppercase text-[var(--muted)]">
                High
              </div>
              <div className="mt-1 text-sm font-semibold">
                {fmtNum(hover?.high ?? lastBar?.high, 2)}
              </div>
            </div>
            <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-3">
              <div className="text-[10px] uppercase text-[var(--muted)]">
                Low
              </div>
              <div className="mt-1 text-sm font-semibold">
                {fmtNum(hover?.low ?? lastBar?.low, 2)}
              </div>
            </div>
            <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-3">
              <div className="text-[10px] uppercase text-[var(--muted)]">
                Close
              </div>
              <div className="mt-1 text-sm font-semibold">
                {fmtNum(hover?.close ?? lastBar?.close, 2)}
              </div>
            </div>
            <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-3">
              <div className="text-[10px] uppercase text-[var(--muted)]">
                Volume
              </div>
              <div className="mt-1 text-sm font-semibold">
                {fmtNum(hover?.volume ?? lastBar?.volume, 0)}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[#132033] bg-[#0b1728] p-3">
            {bars.length === 0 ? (
              <div className="text-sm text-[var(--muted)]">
                No bars loaded yet.
              </div>
            ) : (
              <StockChart
                bars={bars}
                showCandles={showCandles}
                showLine={showLine}
                showVolume={showVolume}
                resetKey={chartResetKey}
                timeframe={timeframe}
                onHover={setHover}
                onScrollNearStart={onScrollNearStart}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
