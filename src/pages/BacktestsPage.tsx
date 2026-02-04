
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auth } from "../lib/firebase";
import { api } from "../api/client";
import BalanceChart, { type BalancePoint } from "../components/BalanceChart";
import Modal from "../components/Modal";
import StockChart, { type ChartMarker } from "../components/StockChart";
import StockSelect from "../components/StockSelect";
import { useStocks } from "../hooks/useStocks";
import {
  getHistoricalBars,
  getChunkSizeForTimeframe,
  type StockBar,
  type Timeframe,
} from "../api/barData";
import { getBaseStrategies, type BaseStrategy } from "../api/strategies";
import { extractErrorMessage } from "../api/errors";
import {
  createBacktest,
  deleteBacktest,
  getBacktest,
  getBacktestBalanceTimeline,
  getBacktestOrdersPage,
  getBacktests,
  startBacktest,
  type Backtest,
  type BacktestBalancePoint,
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

function getTimeframeBucketMs(timeframe: Timeframe): number {
  switch (timeframe) {
    case "1Min":
      return 60 * 1000;
    case "5Min":
      return 5 * 60 * 1000;
    case "15Min":
      return 15 * 60 * 1000;
    case "30Min":
      return 30 * 60 * 1000;
    case "1Hour":
      return 60 * 60 * 1000;
    case "4Hour":
      return 4 * 60 * 60 * 1000;
    case "1Day":
      return 24 * 60 * 60 * 1000;
    case "1Week":
      return 7 * 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
}

function roundToTimeframeBucket(timestampMs: number, bucketMs: number): number {
  return Math.floor(timestampMs / bucketMs) * bucketMs;
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

function sanitizeBalanceTimeline(points: BacktestBalancePoint[]): BalancePoint[] {
  return [...points]
    .map((p) => {
      if (!p?.timestamp) return null;
      const ts = String(p.timestamp);
      const t = new Date(ts).getTime();
      if (Number.isNaN(t)) return null;
      const rawBalance = p.balance;
      const balance =
        typeof rawBalance === "string" ? Number(rawBalance) : rawBalance;
      if (
        balance === null ||
        balance === undefined ||
        Number.isNaN(balance) ||
        !Number.isFinite(Number(balance))
      ) {
        return null;
      }
      return { timestamp: ts, balance: Number(balance) };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        new Date(a!.timestamp).getTime() - new Date(b!.timestamp).getTime(),
    ) as BalancePoint[];
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

const ORDER_ROW_HEIGHT = 44;
const ORDER_OVERSCAN = 6;
const ORDER_PAGE_SIZES = [25, 50, 100];

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
  const [allOrdersForChart, setAllOrdersForChart] = useState<BacktestOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [ordersPageIndex, setOrdersPageIndex] = useState(0);
  const [ordersPageSize, setOrdersPageSize] = useState(50);
  const [ordersTotalPages, setOrdersTotalPages] = useState(0);
  const [ordersTotalElements, setOrdersTotalElements] = useState(0);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const ordersContainerRef = useRef<HTMLDivElement | null>(null);
  const hasOrdersRef = useRef(false);
  const [ordersScrollTop, setOrdersScrollTop] = useState(0);
  const [ordersViewportHeight, setOrdersViewportHeight] = useState(0);

  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [earliestLoadedDate, setEarliestLoadedDate] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const loadMoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingChartRef = useRef(false);

  // Maximum number of consecutive empty fetches before giving up
  // For 1Min/5Min with 3-day chunks, 5 retries = 15 days coverage (handles long weekends/holidays)
  const MAX_EMPTY_FETCH_RETRIES = 5;

  const [pageError, setPageError] = useState<string | null>(null);
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

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
  const [balanceTimeline, setBalanceTimeline] = useState<BalancePoint[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceResetKey, setBalanceResetKey] = useState(0);

  const { stocks, loading: stocksLoading, error: stocksError } = useStocks();

  const normalizedSymbol = useMemo(() => symbol.trim().toUpperCase(), [symbol]);
  const ordersSort = useMemo(
    () => ["executedAt,desc", "createdAt,desc"],
    [],
  );

  const hasRunning = useMemo(
    () =>
      backtests.some((b) =>
        ["PREPARING", "RUNNING"].includes(String(b?.status ?? "")),
      ),
    [backtests],
  );

  const selectedBacktestFromList = useMemo(() => {
    if (selectedBacktestId === "") return null;
    return backtests.find((b) => b.id === selectedBacktestId) ?? null;
  }, [backtests, selectedBacktestId]);

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

  const ordersSummary = useMemo(() => {
    return { total: ordersTotalElements };
  }, [ordersTotalElements]);

  const selectedOrderCounts = useMemo(() => {
    return {
      buy:
        selectedBacktest?.buyOrdersCount ??
        selectedBacktestFromList?.buyOrdersCount ??
        0,
      sell:
        selectedBacktest?.sellOrdersCount ??
        selectedBacktestFromList?.sellOrdersCount ??
        0,
    };
  }, [
    selectedBacktest?.buyOrdersCount,
    selectedBacktest?.sellOrdersCount,
    selectedBacktestFromList?.buyOrdersCount,
    selectedBacktestFromList?.sellOrdersCount,
  ]);

  const selectedBacktestStatus = useMemo(() => {
    return selectedBacktestFromList?.status ?? selectedBacktest?.status ?? "-";
  }, [selectedBacktestFromList?.status, selectedBacktest?.status]);

  const ordersWindow = useMemo(() => {
    const total = orders.length;
    const safeHeight = Math.max(ordersViewportHeight, ORDER_ROW_HEIGHT);
    const baseStart = Math.floor(ordersScrollTop / ORDER_ROW_HEIGHT);
    const startIndex = Math.max(0, baseStart - ORDER_OVERSCAN);
    const visibleCount =
      Math.ceil(safeHeight / ORDER_ROW_HEIGHT) + ORDER_OVERSCAN * 2;
    const endIndex = Math.min(total, startIndex + visibleCount);
    return {
      total,
      startIndex,
      endIndex,
      topPad: startIndex * ORDER_ROW_HEIGHT,
      bottomPad: Math.max(0, total - endIndex) * ORDER_ROW_HEIGHT,
      visibleOrders: orders.slice(startIndex, endIndex),
    };
  }, [
    orders,
    ordersScrollTop,
    ordersViewportHeight,
  ]);

  const ordersDisplayRange = useMemo(() => {
    if (ordersTotalElements === 0 || ordersPageSize <= 0) {
      return { start: 0, end: 0, total: ordersTotalElements };
    }
    const start = ordersPageIndex * ordersPageSize + 1;
    const end = Math.min(
      (ordersPageIndex + 1) * ordersPageSize,
      ordersTotalElements,
    );
    return { start, end, total: ordersTotalElements };
  }, [
    ordersPageIndex,
    ordersPageSize,
    ordersTotalElements,
  ]);

  const ordersPageLabel =
    ordersTotalPages > 0
      ? `${ordersPageIndex + 1} of ${ordersTotalPages}`
      : "0 of 0";
  const canOrdersPageBack = ordersPageIndex > 0;
  const canOrdersPageForward =
    ordersTotalPages > 0 && ordersPageIndex < ordersTotalPages - 1;

  const chartMarkers = useMemo((): ChartMarker[] => {
    if (!selectedBacktest?.symbol) return [];
    if (chartBars.length === 0) return [];

    const bucketMs = getTimeframeBucketMs(chartTimeframe);
    const filteredOrders = allOrdersForChart.filter(
      (o) => o.symbol === selectedBacktest.symbol && o.executedAt,
    );

    // Build a set of actual bar timestamps (in seconds) for snapping markers
    const barTimestampsSec = new Set<number>();
    for (const bar of chartBars) {
      if (bar.timestamp) {
        const ts = new Date(bar.timestamp).getTime();
        if (!Number.isNaN(ts)) {
          barTimestampsSec.add(Math.floor(ts / 1000));
        }
      }
    }

    // Create sorted array for binary search to find closest bar
    const sortedBarTimes = Array.from(barTimestampsSec).sort((a, b) => a - b);

    // Helper to find the closest bar timestamp
    const findClosestBarTime = (targetSec: number): number | null => {
      if (sortedBarTimes.length === 0) return null;

      // Binary search for closest time
      let left = 0;
      let right = sortedBarTimes.length - 1;

      while (left < right) {
        const mid = Math.floor((left + right) / 2);
        if (sortedBarTimes[mid] < targetSec) {
          left = mid + 1;
        } else {
          right = mid;
        }
      }

      // Check if the found index or the previous one is closer
      const closest = sortedBarTimes[left];
      if (left > 0) {
        const prev = sortedBarTimes[left - 1];
        if (Math.abs(prev - targetSec) < Math.abs(closest - targetSec)) {
          return prev;
        }
      }

      // Only return if within the bucket timeframe (to avoid markers on wrong bars)
      const bucketSec = bucketMs / 1000;
      if (Math.abs(closest - targetSec) <= bucketSec) {
        return closest;
      }
      return null;
    };

    // Group orders by timeframe bucket and calculate net quantity
    const bucketMap = new Map<
      number,
      { buyQty: number; sellQty: number; bucketTimeSec: number; actualBarTime: number | null }
    >();

    for (const order of filteredOrders) {
      const timestampMs = new Date(order.executedAt!).getTime();
      if (Number.isNaN(timestampMs)) continue;

      const bucketKey = roundToTimeframeBucket(timestampMs, bucketMs);
      const bucketTimeSec = Math.floor(bucketKey / 1000);

      if (!bucketMap.has(bucketKey)) {
        // Find the actual bar time that matches this bucket
        const actualBarTime = findClosestBarTime(bucketTimeSec);
        bucketMap.set(bucketKey, { buyQty: 0, sellQty: 0, bucketTimeSec, actualBarTime });
      }

      const bucket = bucketMap.get(bucketKey)!;
      const qty = Number(order.quantity) || 0;
      if (order.side === "BUY") {
        bucket.buyQty += qty;
      } else if (order.side === "SELL") {
        bucket.sellQty += qty;
      }
    }

    // Convert buckets to markers - separate arrows for buys and sells
    const markers: ChartMarker[] = [];
    for (const bucket of bucketMap.values()) {
      // Use actual bar time if found, otherwise skip this marker
      const markerTime = bucket.actualBarTime;
      if (markerTime === null) continue;

      // Add buy marker if there were any buys
      if (bucket.buyQty > 0) {
        markers.push({
          time: markerTime as ChartMarker["time"],
          position: "belowBar",
          color: "#22c55e",
          shape: "arrowUp",
          text: bucket.buyQty.toFixed(1),
        });
      }

      // Add sell marker if there were any sells
      if (bucket.sellQty > 0) {
        markers.push({
          time: markerTime as ChartMarker["time"],
          position: "aboveBar",
          color: "#ef4444",
          shape: "arrowDown",
          text: bucket.sellQty.toFixed(1),
        });
      }
    }

    return markers;
  }, [allOrdersForChart, selectedBacktest?.symbol, chartTimeframe, chartBars]);

  const balanceRange = useMemo(() => {
    const start =
      selectedBacktest?.testingStart ?? balanceTimeline[0]?.timestamp;
    const end =
      selectedBacktest?.testingEnd ??
      balanceTimeline[balanceTimeline.length - 1]?.timestamp;
    return { start, end };
  }, [
    balanceTimeline,
    selectedBacktest?.testingStart,
    selectedBacktest?.testingEnd,
  ]);

  const resetOrdersState = useCallback(() => {
    setOrders([]);
    setAllOrdersForChart([]);
    setOrdersTotalPages(0);
    setOrdersTotalElements(0);
    setSelectedOrderId(null);
    hasOrdersRef.current = false;
  }, []);

  const selectBacktest = useCallback(
    (id: number | "") => {
      if (id === selectedBacktestId) return;
      setSelectedBacktestId(id);
      setOrdersPageIndex(0);
      resetOrdersState();
    },
    [resetOrdersState, selectedBacktestId],
  );

  async function loadBaseAndBacktests(uid: number) {
    setPageError(null);

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
      setPageError(extractErrorMessage(errorMessage));
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
      setPageError(null);

      try {
        const data = await getBacktest(uid, backtestId);
        setSelectedBacktest(data);
      } catch (e: any) {
        const errorMessage =
          e?.message || "Failed to load backtest detail. Please try again.";
        setPageError(extractErrorMessage(errorMessage));
        setSelectedBacktest(null);
        resetOrdersState();
        setBalanceTimeline([]);
      } finally {
        setDetailLoading(false);
      }
    },
    [resetOrdersState],
  );

  const loadOrdersPage = useCallback(
    async (uid: number, backtestId: number, page: number, size: number) => {
      setOrdersLoading(true);
      setPageError(null);

      try {
        const data = await getBacktestOrdersPage(uid, backtestId, {
          page,
          size,
          sort: ordersSort,
        });

        const content = Array.isArray(data?.content) ? data.content : [];
        const totalElements =
          typeof data?.totalElements === "number" &&
          Number.isFinite(data.totalElements)
            ? data.totalElements
            : content.length;
        const resolvedSize =
          typeof data?.size === "number" && Number.isFinite(data.size)
            ? data.size
            : size;
        const totalPages =
          typeof data?.totalPages === "number" &&
          Number.isFinite(data.totalPages)
            ? data.totalPages
            : resolvedSize > 0
              ? Math.ceil(totalElements / resolvedSize)
              : 0;

        setOrders(content);
        hasOrdersRef.current = content.length > 0;
        setOrdersTotalPages(totalPages);
        setOrdersTotalElements(totalElements);

        if (typeof data?.number === "number" && data.number !== page) {
          setOrdersPageIndex(data.number);
        } else if (totalPages > 0 && page > totalPages - 1) {
          setOrdersPageIndex(totalPages - 1);
        }
      } catch (e: any) {
        const errorMessage =
          e?.message || "Failed to load backtest orders. Please try again.";
        setPageError(extractErrorMessage(errorMessage));
        if (!hasOrdersRef.current) {
          resetOrdersState();
        }
      } finally {
        setOrdersLoading(false);
      }
    },
    [ordersSort, resetOrdersState],
  );

  const loadAllOrdersForChart = useCallback(
    async (uid: number, backtestId: number) => {
      try {
        // Fetch all orders with a large page size for chart display
        const data = await getBacktestOrdersPage(uid, backtestId, {
          page: 0,
          size: 10000,
          sort: ordersSort,
        });

        const content = Array.isArray(data?.content) ? data.content : [];
        setAllOrdersForChart(content);
      } catch {
        // Silently fail - chart will just not show markers
        setAllOrdersForChart([]);
      }
    },
    [ordersSort],
  );

  const refreshBacktestStatuses = useCallback(
    async (uid: number) => {
      try {
        const latest = await getBacktests(uid);
        if (!Array.isArray(latest) || latest.length === 0) return;

        const latestById = new Map(latest.map((b) => [b.id, b]));

        setBacktests((prev) => {
          let changed = false;
          const next = prev.map((b) => {
            const latestItem = latestById.get(b.id);
            if (!latestItem) return b;
            if (latestItem.status !== b.status) {
              changed = true;
              return { ...b, status: latestItem.status };
            }
            return b;
          });
          return changed ? next : prev;
        });

      } catch {
        // ignore polling errors
      }
    },
    [],
  );

  const loadChartData = useCallback(async () => {
    if (!userId || !selectedBacktest?.symbol) return;
    if (!selectedBacktest.testingStart || !selectedBacktest.testingEnd) return;
    
    // Prevent concurrent executions using ref (state check is not enough due to batched updates)
    if (isLoadingChartRef.current) return;
    isLoadingChartRef.current = true;

    setChartLoading(true);
    try {
      const minStart = new Date(selectedBacktest.testingStart);
      const chunkDays = getChunkSizeForTimeframe(chartTimeframe);
      let currentEnd = new Date(selectedBacktest.testingEnd);
      let retryCount = 0;
      let allBars: StockBar[] = [];

      // Loop to handle initial load falling on non-trading hours (weekends, holidays)
      while (retryCount < MAX_EMPTY_FETCH_RETRIES) {
        const bars = await getHistoricalBars(
          userId,
          selectedBacktest.symbol,
          chartTimeframe,
          {
            end: currentEnd.toISOString(),
            limit: 500,
          },
        );

        const cleanedBars = filterBarsToRange(
          sanitizeBars(Array.isArray(bars) ? bars : []),
          selectedBacktest.testingStart,
          selectedBacktest.testingEnd,
        );

        if (cleanedBars.length > 0) {
          allBars = cleanedBars;
          break;
        }

        // No bars found - extend the search window backwards
        retryCount++;
        const newEnd = new Date(
          currentEnd.getTime() - chunkDays * 24 * 60 * 60 * 1000,
        );

        // Check if we've gone past the minimum start
        if (newEnd <= minStart) {
          console.log(
            `Initial load: reached minimum start date with no data found`,
          );
          break;
        }

        console.log(
          `Initial load empty ${retryCount}/${MAX_EMPTY_FETCH_RETRIES}, extending range to ${newEnd.toISOString()}`,
        );
        currentEnd = newEnd;
      }

      setChartBars(allBars);
      setChartResetKey((k) => k + 1);

      if (allBars.length > 0 && allBars[0].timestamp) {
        setEarliestLoadedDate(allBars[0].timestamp);
      } else {
        // No bars found even after retries, set earliest to where we stopped searching
        setEarliestLoadedDate(currentEnd.toISOString());
      }

      setHasMoreHistory(true);
    } catch (e) {
      console.error("Failed to load chart data:", e);
      setChartBars([]);
      setEarliestLoadedDate(null);
    } finally {
      isLoadingChartRef.current = false;
      setChartLoading(false);
    }
  }, [
    userId,
    selectedBacktest?.symbol,
    selectedBacktest?.testingStart,
    selectedBacktest?.testingEnd,
    chartTimeframe,
  ]);

  const loadBalanceTimeline = useCallback(async () => {
    if (!userId || selectedBacktestId === "") return;
    setBalanceLoading(true);
    try {
      const data = await getBacktestBalanceTimeline(
        userId,
        selectedBacktestId as number,
      );
      const cleaned = sanitizeBalanceTimeline(
        Array.isArray(data) ? data : [],
      );
      setBalanceTimeline(cleaned);
      setBalanceResetKey((k) => k + 1);
    } catch (e) {
      console.error("Failed to load balance timeline:", e);
      setBalanceTimeline([]);
    } finally {
      setBalanceLoading(false);
    }
  }, [userId, selectedBacktestId]);

  const loadMoreHistory = useCallback(async () => {
    if (!userId || !selectedBacktest?.symbol || !earliestLoadedDate) return;
    if (!selectedBacktest.testingStart || !selectedBacktest.testingEnd) return;
    if (isLoadingMore || !hasMoreHistory) return;

    setIsLoadingMore(true);

    const minStart = new Date(selectedBacktest.testingStart);
    const chunkDays = getChunkSizeForTimeframe(chartTimeframe);
    let currentEarliest = new Date(earliestLoadedDate);
    let retryCount = 0;

    try {
      // Loop to handle consecutive empty fetches (weekends, holidays, non-trading hours)
      while (retryCount < MAX_EMPTY_FETCH_RETRIES) {
        const endDate = new Date(currentEarliest.getTime() - 1000);
        const startDate = new Date(
          endDate.getTime() - chunkDays * 24 * 60 * 60 * 1000,
        );
        const boundedStart = startDate < minStart ? minStart : startDate;

        // Check if we've reached or passed the minimum start date
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
          // No bars in this range - could be weekend/holiday/non-trading hours
          retryCount++;

          // Check if we've already reached the minimum start
          if (boundedStart.getTime() === minStart.getTime()) {
            setHasMoreHistory(false);
            return;
          }

          // Move the search window backwards and retry
          currentEarliest = boundedStart;
          console.log(
            `Empty fetch ${retryCount}/${MAX_EMPTY_FETCH_RETRIES}, extending range to ${boundedStart.toISOString()}`,
          );
          continue;
        }

        // Found data - update state
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

        return; // Successfully found and loaded data
      }

      // Exceeded max retries - stop searching
      console.log(
        `No data found after ${MAX_EMPTY_FETCH_RETRIES} consecutive empty fetches. Stopping.`,
      );
      setHasMoreHistory(false);
      // Update earliestLoadedDate to where we stopped searching
      setEarliestLoadedDate(currentEarliest.toISOString());
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
        setPageMessage(null);
        await loadBaseAndBacktests(meData.id);
      } catch (e: any) {
        const errorMessage =
          e?.message || "Unable to load user information. Please try again.";
        setPageError(extractErrorMessage(errorMessage));
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
    if (!userId || selectedBacktestId === "") {
      resetOrdersState();
      return;
    }
    void loadOrdersPage(
      userId,
      selectedBacktestId as number,
      ordersPageIndex,
      ordersPageSize,
    );
  }, [
    userId,
    selectedBacktestId,
    ordersPageIndex,
    ordersPageSize,
    loadOrdersPage,
    resetOrdersState,
  ]);

  useEffect(() => {
    if (!userId || selectedBacktestId === "") {
      setAllOrdersForChart([]);
      return;
    }
    void loadAllOrdersForChart(userId, selectedBacktestId as number);
  }, [userId, selectedBacktestId, loadAllOrdersForChart]);

  useEffect(() => {
    if (!userId || !hasRunning) return;

    const t = setInterval(() => {
      void refreshBacktestStatuses(userId);
    }, 3000);

    return () => clearInterval(t);
  }, [
    userId,
    hasRunning,
    refreshBacktestStatuses,
  ]);

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

  useEffect(() => {
    if (!userId || selectedBacktestId === "") {
      setBalanceTimeline([]);
      return;
    }
    void loadBalanceTimeline();
  }, [userId, selectedBacktestId, loadBalanceTimeline]);

  useEffect(() => {
    const el = ordersContainerRef.current;
    if (!el) return;
    const updateHeight = () => setOrdersViewportHeight(el.clientHeight);
    updateHeight();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateHeight);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, [ordersLoading, orders.length, selectedBacktestId]);

  useEffect(() => {
    setOrdersScrollTop(0);
    setSelectedOrderId(null);
    if (ordersContainerRef.current) {
      ordersContainerRef.current.scrollTop = 0;
    }
  }, [selectedBacktestId, ordersPageIndex]);

  const onOrdersScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      setOrdersScrollTop(event.currentTarget.scrollTop);
    },
    [],
  );

  const onOrdersPageSizeChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const nextSize = Number(event.target.value);
      if (!Number.isFinite(nextSize) || nextSize <= 0) return;
      setOrdersPageSize(nextSize);
      setOrdersPageIndex(0);
    },
    [],
  );

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    const sym = normalizedSymbol;

    if (!baseCode || !name.trim() || !sym) {
      setFormError("Please select a base strategy, enter a name, and a symbol.");
      return;
    }

    if (!budget || Number.isNaN(Number(budget)) || Number(budget) <= 0) {
      setFormError("Budget must be greater than 0.");
      return;
    }

    if (!testingStart || !testingEnd) {
      setFormError("Please select a testing start and end date.");
      return;
    }

    const startIso = new Date(testingStart).toISOString();
    const endIso = new Date(testingEnd).toISOString();
    if (new Date(startIso).getTime() >= new Date(endIso).getTime()) {
      setFormError("Testing start must be before testing end."); //
      return;
    }

    setLoading(true);
    setFormError(null);
    setPageMessage(null);

    try {
      await createBacktest(userId, {
        baseStrategyCode: baseCode,
        name: name.trim(),
        symbol: sym,
        budget: Number(budget),
        testingStart: startIso,
        testingEnd: endIso,
      });

      setPageMessage("Backtest created.");
      setName("");
      setShowCreateModal(false);
      await loadBaseAndBacktests(userId);
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to create backtest. Please try again.";
      setFormError(extractErrorMessage(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  const onStart = async (id: number) => {
    if (!userId) return;

    setLoading(true);
    setPageError(null);
    setPageMessage(null);

    try {
      await startBacktest(userId, id);
      setPageMessage("Backtest started.");
      await loadBacktestsOnly(userId);
      if (selectedBacktestId === id) {
        await loadBacktestDetail(userId, id);
        await loadOrdersPage(userId, id, ordersPageIndex, ordersPageSize);
      }
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to start backtest. Please try again.";
      setPageError(extractErrorMessage(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async (id: number) => {
    if (!userId) return;

    setLoading(true);
    setPageError(null);
    setPageMessage(null);

    try {
      await deleteBacktest(userId, id);
      setPageMessage("Backtest deleted.");
      await loadBacktestsOnly(userId);
      if (selectedBacktestId === id) {
        selectBacktest("");
        setSelectedBacktest(null);
        setChartBars([]);
        setBalanceTimeline([]);
      }
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to delete backtest. Please try again.";
      setPageError(extractErrorMessage(errorMessage));
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

          {pageMessage && (
            <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {pageMessage}
            </div>
          )}
          {pageError && (
            <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {pageError}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Base Strategies</div>
            <button
              onClick={() => {
                setFormError(null);
                setShowCreateModal(true);
              }}
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
          onClose={() => {
            setFormError(null);
            setShowCreateModal(false);
          }}
          title="Create Backtest"
        >
          <form onSubmit={onCreate}>
            {formError && (
              <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                {formError}
              </div>
            )}

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
            <StockSelect
              value={symbol}
              onChange={setSymbol}
              options={stocks}
              placeholder="Search by symbol or company"
              disabled={loading || stocksLoading}
              required
            />
            {stocksError ? (
              <div className="mt-1 text-xs text-red-200">
                {stocksError}
              </div>
            ) : null}

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
                onClick={() => {
                  setFormError(null);
                  setShowCreateModal(false);
                }}
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
                      status === "CREATED" ||
                      status === "COMPLETED" ||
                      status === "FAILED";
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
                        onClick={() => selectBacktest(b.id)}
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
                                selectBacktest(b.id);
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
              {selectedOrderCounts.buy}
            </div>
          </div>
          <div className="rounded-xl border border-[#132033] bg-[#0f1b2d] p-4">
            <div className="text-xs text-[var(--muted)]">SELL Orders</div>
            <div className="mt-2 text-2xl font-semibold text-amber-300">
              {selectedOrderCounts.sell}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">Orders List</div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-2 text-[var(--muted)]">
                Page size
                <select
                  className="rounded-md border border-[#1f2e44] bg-[#0b1728] px-2 py-1 text-xs text-white disabled:opacity-60"
                  value={ordersPageSize}
                  onChange={onOrdersPageSizeChange}
                  disabled={selectedBacktestId === "" || ordersLoading}
                >
                  {ORDER_PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="rounded-md border border-[#1f2e44] px-2 py-1 text-xs text-white disabled:opacity-60"
                type="button"
                onClick={() =>
                  setOrdersPageIndex((prev) => Math.max(prev - 1, 0))
                }
                disabled={!canOrdersPageBack || ordersLoading}
              >
                Prev
              </button>
              <div className="text-[var(--muted)]">Page {ordersPageLabel}</div>
              <button
                className="rounded-md border border-[#1f2e44] px-2 py-1 text-xs text-white disabled:opacity-60"
                type="button"
                onClick={() =>
                  setOrdersPageIndex((prev) =>
                    ordersTotalPages > 0
                      ? Math.min(prev + 1, ordersTotalPages - 1)
                      : prev,
                  )
                }
                disabled={!canOrdersPageForward || ordersLoading}
              >
                Next
              </button>
            </div>
          </div>

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
          ) : ordersLoading && ordersTotalElements === 0 ? (
            <div className="mt-3 text-sm text-[var(--muted)]">
              Loading orders.
            </div>
          ) : ordersTotalElements === 0 ? (
            <div className="mt-3 text-sm text-[var(--muted)]">
              No orders for this backtest yet.
            </div>
          ) : (
            <>
              <div className="mt-2 text-xs text-[var(--muted)]">
                Showing {ordersDisplayRange.start}-{ordersDisplayRange.end}
                {ordersLoading && (
                  <span className="ml-2 text-[var(--muted)]">
                    Refreshing...
                  </span>
                )}
              </div>
              <div
                ref={ordersContainerRef}
                onScroll={onOrdersScroll}
                className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-[#132033]"
              >
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
                    {ordersWindow.topPad > 0 && (
                      <tr aria-hidden="true">
                        <td
                          colSpan={6}
                          className="p-0"
                          style={{ height: ordersWindow.topPad }}
                        />
                      </tr>
                    )}
                    {ordersWindow.visibleOrders.map((o, idx) => {
                      const rowIndex = ordersWindow.startIndex + idx;
                      const isSelected = selectedOrderId === o.id;
                      const side = String(o.side ?? "").toUpperCase();
                      const sideClass =
                        side === "BUY"
                          ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/20"
                          : side === "SELL"
                            ? "bg-red-500/10 text-red-200 border-red-500/20"
                            : "bg-gray-500/10 text-gray-200 border-gray-500/20";
                      return (
                        <tr
                          key={o.id ?? `row-${rowIndex}`}
                          className={`transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-[#0b1728] border-l-2 border-l-[#1f6feb]"
                              : "hover:bg-[#0b1728]/50"
                          }`}
                          onClick={() => setSelectedOrderId(o.id)}
                          title="Click to view detail"
                        >
                          <td className="px-4 py-3 text-xs text-[var(--muted)]">
                            {ordersPageIndex * ordersPageSize + rowIndex + 1}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {o.symbol ?? "-"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex min-w-[56px] justify-center rounded-full border px-2 py-0.5 text-xs ${sideClass}`}
                            >
                              {o.side ?? "-"}
                            </span>
                          </td>
                          <td className="px-4 py-3">{fmtNum(o.quantity)}</td>
                          <td className="px-4 py-3">{fmtNum(o.price)}</td>
                          <td className="px-4 py-3">
                            {fmtTime(o.executedAt ?? o.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                    {ordersWindow.bottomPad > 0 && (
                      <tr aria-hidden="true">
                        <td
                          colSpan={6}
                          className="p-0"
                          style={{ height: ordersWindow.bottomPad }}
                        />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
            <div className="text-sm font-semibold">Selected Order Detail</div>

            {ordersLoading && ordersTotalElements === 0 ? (
              <div className="mt-3 text-sm text-[var(--muted)]">
                Loading order.
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
                    <BacktestBadge text={String(selectedBacktestStatus)} />
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
                  ? `Orders: ${selectedOrderCounts.buy} BUY, ${selectedOrderCounts.sell} SELL`
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

        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">Balance Timeline</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                {selectedBacktestId === ""
                  ? "Select a backtest to view balance timeline"
                  : "Balance updates at BUY/SELL events within the backtest range"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg border border-[#1f2e44] px-3 py-2 text-xs text-white disabled:opacity-60"
                onClick={() => void loadBalanceTimeline()}
                disabled={balanceLoading || selectedBacktestId === ""}
              >
                {balanceLoading ? "Loading..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[#132033] bg-[#0b1728] p-3">
            {selectedBacktestId === "" ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-[var(--muted)]">
                Select a backtest to view balance timeline
              </div>
            ) : balanceLoading ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-[var(--muted)]">
                Loading balance timeline...
              </div>
            ) : balanceTimeline.length === 0 ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-[var(--muted)]">
                No balance data available
              </div>
            ) : (
              <BalanceChart
                points={balanceTimeline}
                height={260}
                resetKey={balanceResetKey}
                minTime={balanceRange.start}
                maxTime={balanceRange.end}
                lockVisibleRange
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
