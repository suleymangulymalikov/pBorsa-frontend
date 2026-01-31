import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { type UTCTimestamp } from "lightweight-charts";
import { auth } from "../lib/firebase";
import { api } from "../api/client";

import type { OrderDetail, OrderHistoryEntry, FilledOrder } from "../api/orders";
import {
  getOrderDetail,
  getOrderHistory,
  getOrdersByUserStrategy,
  getFilledOrdersByStrategy,
} from "../api/orders";
import { getHistoricalBars, getChunkSizeForTimeframe, type StockBar, type Timeframe } from "../api/barData";
import StockChart, { type ChartMarker } from "../components/StockChart";

type MeResponse = {
  id: number;
  firebaseUid: string;
  email: string;
  displayName?: string | null;
  provider?: string | null;
};

type UserStrategy = {
  id: number;
  name?: string;
  symbol?: string;
  status?: string;
  baseStrategyCode?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
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

function fmtStatus(value: unknown) {
  if (!value) return "-";
  return String(value).replace(/_/g, " ");
}

function pickOrderId(o: OrderDetail): string | null {
  if (typeof o.id === "string") return o.id;
  if (typeof o.orderId === "string") return o.orderId;
  return null;
}

function toUtcTimestamp(value: string): UTCTimestamp | null {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor(t / 1000) as UTCTimestamp;
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

function OrderBadge({ status }: { status: string }) {
  let cls = "bg-gray-500/10 text-gray-300 border-gray-500/20";

  if (status === "FILLED") {
    cls = "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  } else if (status === "ACCEPTED" || status === "ACCEPTED_BY_APP") {
    cls = "bg-blue-500/10 text-blue-300 border-blue-500/20";
  } else if (status === "NEW" || status === "PENDING_NEW") {
    cls = "bg-amber-500/10 text-amber-300 border-amber-500/20";
  } else if (status === "CANCELED" || status === "REJECTED") {
    cls = "bg-red-500/10 text-red-300 border-red-500/20";
  } else if (status === "PARTIALLY_FILLED") {
    cls = "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}
    >
      {fmtStatus(status)}
    </span>
  );
}

export default function OrdersPage() {
  const nav = useNavigate();
  const location = useLocation();

  const [me, setMe] = useState<MeResponse | null>(null);
  const userId = me?.id ?? null;

  const [strategies, setStrategies] = useState<UserStrategy[]>([]);
  const [strategyId, setStrategyId] = useState<number | "">("");

  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderDetail, setSelectedOrderDetail] =
    useState<OrderDetail | null>(null);
  const [selectedOrderHistory, setSelectedOrderHistory] = useState<
    OrderHistoryEntry[]
  >([]);

  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Chart state
  const [chartBars, setChartBars] = useState<StockBar[]>([]);
  const [filledOrders, setFilledOrders] = useState<FilledOrder[]>([]);
  const [chartTimeframe, setChartTimeframe] = useState<Timeframe>("1Day");
  const [chartLoading, setChartLoading] = useState(false);
  const [chartResetKey, setChartResetKey] = useState(0);

  // Chart display options
  const [showCandles, setShowCandles] = useState(true);
  const [showLine, setShowLine] = useState(false);
  const [showVolume, setShowVolume] = useState(true);

  // Infinite scroll states
  const [earliestLoadedDate, setEarliestLoadedDate] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const loadMoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedStrategy = useMemo(() => {
    if (strategyId === "") return null;
    return strategies.find((s) => s.id === strategyId) ?? null;
  }, [strategies, strategyId]);

  const ordersSummary = useMemo(() => {
    const total = orders.length;
    const accepted = orders.filter((o) =>
      ["ACCEPTED", "ACCEPTED_BY_APP"].includes(String(o.status)),
    ).length;
    const pending = orders.filter((o) =>
      ["NEW", "PENDING_NEW"].includes(String(o.status)),
    ).length;
    return { total, accepted, pending };
  }, [orders]);

  const sortedOrders = useMemo(() => {
    const rank = (status: string) => {
      if (status === "FILLED") return 0;
      if (status === "ACCEPTED" || status === "ACCEPTED_BY_APP") return 1;
      if (status === "NEW" || status === "PENDING_NEW") return 2;
      if (status === "PARTIALLY_FILLED") return 3;
      if (status === "CANCELED") return 4;
      if (status === "REJECTED") return 5;
      return 6;
    };

    return [...orders].sort((a, b) => {
      const aStatus = String(a.status ?? "");
      const bStatus = String(b.status ?? "");
      const r = rank(aStatus) - rank(bStatus);
      if (r !== 0) return r;

      const aTime = new Date(
        String(a.submittedAt ?? a.createdAt ?? a.updatedAt ?? 0),
      ).getTime();
      const bTime = new Date(
        String(b.submittedAt ?? b.createdAt ?? b.updatedAt ?? 0),
      ).getTime();
      return bTime - aTime;
    });
  }, [orders]);

  const sortedStrategies = useMemo(() => {
    const rank = (s: UserStrategy) => {
      const status = String(s.status ?? "");
      if (status === "ACTIVE") return 0;
      if (status === "PREPARING") return 1;
      if (status === "PAUSED") return 2;
      if (status === "CREATED") return 3;
      if (status === "STOPPED") return 4;
      return 5;
    };
    return [...strategies].sort((a, b) => rank(a) - rank(b));
  }, [strategies]);

  const chartMarkers = useMemo((): ChartMarker[] => {
    if (!selectedStrategy?.symbol) return [];
    return filledOrders
      .filter((o) => o.symbol === selectedStrategy.symbol)
      .map((order) => {
        const time = toUtcTimestamp(order.filledAt);
        if (!time) return null;
        const isBuy = order.side === "BUY";
        return {
          time,
          position: isBuy ? "belowBar" : "aboveBar",
          color: isBuy ? "#22c55e" : "#ef4444",
          shape: isBuy ? "arrowUp" : "arrowDown",
          text: String(order.quantity),
        } as ChartMarker;
      })
      .filter(Boolean) as ChartMarker[];
  }, [filledOrders, selectedStrategy?.symbol]);

  const filledOrdersSummary = useMemo(() => {
    const buyCount = filledOrders.filter((o) => o.side === "BUY").length;
    const sellCount = filledOrders.filter((o) => o.side === "SELL").length;
    return { buyCount, sellCount };
  }, [filledOrders]);

  const loadChartData = useCallback(async () => {
    if (!userId || strategyId === "" || !selectedStrategy?.symbol) return;
    setChartLoading(true);
    try {
      const [filled, bars] = await Promise.all([
        getFilledOrdersByStrategy(userId, strategyId as number),
        getHistoricalBars(userId, selectedStrategy.symbol, chartTimeframe, { limit: 500 }),
      ]);
      setFilledOrders(Array.isArray(filled) ? filled : []);
      const cleanedBars = sanitizeBars(bars);
      setChartBars(cleanedBars);
      setChartResetKey((k) => k + 1);

      // Track earliest loaded date for infinite scroll
      if (cleanedBars.length > 0 && cleanedBars[0].timestamp) {
        setEarliestLoadedDate(cleanedBars[0].timestamp);
      } else {
        setEarliestLoadedDate(null);
      }
      setHasMoreHistory(true);
    } catch (e) {
      console.error("Failed to load chart data:", e);
      setFilledOrders([]);
      setChartBars([]);
      setEarliestLoadedDate(null);
    } finally {
      setChartLoading(false);
    }
  }, [userId, strategyId, selectedStrategy?.symbol, chartTimeframe]);

  const loadMoreHistory = useCallback(async () => {
    if (!userId || !selectedStrategy?.symbol || !earliestLoadedDate || isLoadingMore || !hasMoreHistory) {
      return;
    }

    setIsLoadingMore(true);

    try {
      // Calculate end time as 1 second before the earliest loaded date
      const earliestDate = new Date(earliestLoadedDate);
      const endDate = new Date(earliestDate.getTime() - 1000);

      // Calculate start based on chunk size for the timeframe
      const chunkDays = getChunkSizeForTimeframe(chartTimeframe);
      const startDate = new Date(endDate.getTime() - chunkDays * 24 * 60 * 60 * 1000);

      const data = await getHistoricalBars(userId, selectedStrategy.symbol, chartTimeframe, {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        limit: 5000,
      });

      const newBars = sanitizeBars(Array.isArray(data) ? data : []);

      if (newBars.length === 0) {
        setHasMoreHistory(false);
        return;
      }

      setChartBars((prev) => {
        // Filter out duplicates based on timestamp
        const existingTimestamps = new Set(prev.map((b) => b.timestamp));
        const uniqueNewBars = newBars.filter((b) => !existingTimestamps.has(b.timestamp));
        return [...uniqueNewBars, ...prev];
      });

      // Update earliest loaded date
      if (newBars.length > 0 && newBars[0].timestamp) {
        setEarliestLoadedDate(newBars[0].timestamp);
      }
    } catch (e) {
      console.error("Failed to load more history:", e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [userId, selectedStrategy?.symbol, earliestLoadedDate, isLoadingMore, hasMoreHistory, chartTimeframe]);

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
    if (strategyId !== "" && selectedStrategy?.symbol) {
      void loadChartData();
    } else {
      setChartBars([]);
      setFilledOrders([]);
      setEarliestLoadedDate(null);
    }
  }, [strategyId, selectedStrategy?.symbol, chartTimeframe, loadChartData]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        nav("/login", { replace: true });
        return;
      }

      try {
        setError(null);
        setMessage(null);

        const meData = await api.get<MeResponse>("/api/v1/users/me");
        setMe(meData);

        const userStrategies = await api.get<UserStrategy[]>(
          `/api/v1/users/${meData.id}/strategies`,
        );

        setStrategies(Array.isArray(userStrategies) ? userStrategies : []);

        // Check if we have a strategyId from navigation state
        const navState = location.state as { strategyId?: number } | null;
        if (navState?.strategyId && typeof navState.strategyId === "number") {
          setStrategyId(navState.strategyId);
        }
      } catch (e: any) {
        const errorMessage =
          e?.message ||
          "Unable to load user information and strategies. Please try again.";
        setError(errorMessage);
      }
    });

    return () => unsub();
  }, [nav, location.state]);

  // Auto-load orders when strategyId changes
  useEffect(() => {
    if (strategyId !== "") {
      void loadOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategyId]);

  const loadOrders = async () => {
    if (!userId || strategyId === "") return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const data = await getOrdersByUserStrategy(userId, strategyId);
      setOrders(Array.isArray(data) ? data : []);
      setMessage("Orders loaded.");

      setSelectedOrderId(null);
      setSelectedOrderDetail(null);
      setSelectedOrderHistory([]);
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to load orders. Please try again.";
      setError(errorMessage);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const onSelectOrder = async (order: OrderDetail) => {
    if (!userId) return;

    const oid = pickOrderId(order);
    if (!oid) {
      setError("This order item has no order id field (id/orderId).");
      return;
    }

    setSelectedOrderDetail(null);
    setSelectedOrderHistory([]);
    setSelectedOrderId(oid);
    setDetailLoading(true);
    setError(null);
    setMessage(null);

    try {
      const [detail, history] = await Promise.all([
        getOrderDetail(userId, oid),
        getOrderHistory(userId, oid),
      ]);

      setSelectedOrderDetail(detail);
      setSelectedOrderHistory(Array.isArray(history) ? history : []);
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to load order details. Please try again.";
      setError(errorMessage);
      setSelectedOrderDetail(null);
      setSelectedOrderHistory([]);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-white">
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            View orders created by your strategies for{" "}
            <span className="text-white">{me?.email ?? "..."}</span>
          </p>

          <div className="mt-5 flex flex-wrap items-end gap-3">
            <div className="min-w-[260px]">
              <label className="block text-xs uppercase tracking-wide text-[var(--muted)]">
                User strategy
              </label>
              <select
                className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
                value={strategyId}
                onChange={(e) => {
                  const v = e.target.value;
                  setStrategyId(v === "" ? "" : Number(v));
                }}
              >
                <option value="">Select a strategy.</option>
                {sortedStrategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.id} - {s.name ?? s.baseStrategyCode ?? "Strategy"}{" "}
                    {s.symbol ? `(${s.symbol})` : ""}{" "}
                    {s.status ? `- ${s.status}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <button
              disabled={loading || !userId || strategyId === ""}
              className="rounded-lg border border-[#1f2e44] px-4 py-2 text-sm text-white disabled:opacity-60"
              onClick={() => void loadOrders()}
            >
              {loading ? "Loading..." : "Refresh Orders"}
            </button>
          </div>

          {selectedStrategy && (
            <div className="mt-4 text-xs text-[var(--muted)]">
              Selected:{" "}
              <span className="text-white">
                #{selectedStrategy.id} {selectedStrategy.name ?? ""}{" "}
                {selectedStrategy.symbol ? `(${selectedStrategy.symbol})` : ""}
              </span>
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

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-[#132033] bg-[#0f1b2d] p-4">
            <div className="text-xs text-[var(--muted)]">Total Orders</div>
            <div className="mt-2 text-2xl font-semibold">
              {ordersSummary.total}
            </div>
          </div>
          <div className="rounded-xl border border-[#132033] bg-[#0f1b2d] p-4">
            <div className="text-xs text-[var(--muted)]">Pending</div>
            <div className="mt-2 text-2xl font-semibold text-amber-300">
              {ordersSummary.pending}
            </div>
          </div>
          <div className="rounded-xl border border-[#132033] bg-[#0f1b2d] p-4">
            <div className="text-xs text-[var(--muted)]">Accepted</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-300">
              {ordersSummary.accepted}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="text-sm font-semibold">Orders List</div>

          {strategyId === "" ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="text-sm font-medium text-amber-200">
                  Select a Strategy to View Orders
                </div>
                <div className="mt-1 text-xs text-amber-300/80">
                  Choose a strategy from the dropdown above. Orders will load
                  automatically.
                </div>
              </div>
              <div className="text-xs text-[var(--muted)]">
                Tip: You can also view orders from the Strategies page by
                clicking "Orders" on any strategy.
              </div>
            </div>
          ) : orders.length === 0 ? (
            <div className="mt-3 text-sm text-[var(--muted)]">
              No orders for this strategy yet.
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
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#132033]">
                  {sortedOrders.map((o, idx) => {
                    const oid = pickOrderId(o) ?? `row-${idx}`;
                    const isSelected =
                      selectedOrderId && pickOrderId(o) === selectedOrderId;
                    const qty = o.quantity ?? o.qty ?? "-";
                    const type = o.type ?? o.orderType ?? "-";
                    const submitted =
                      o.submittedAt ?? o.createdAt ?? o.updatedAt ?? "-";
                    const status = String(o.status ?? "");

                    return (
                      <tr
                        key={oid}
                        className={`transition-colors cursor-pointer ${
                          isSelected
                            ? "bg-[#0b1728] border-l-2 border-l-[#1f6feb]"
                            : "hover:bg-[#0b1728]/50"
                        }`}
                        onClick={() => void onSelectOrder(o)}
                        title="Click to view detail + history"
                      >
                        <td className="px-4 py-3 text-xs text-[var(--muted)]">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {o.symbol ?? "-"}
                        </td>
                        <td className="px-4 py-3">{o.side ?? "-"}</td>
                        <td className="px-4 py-3">{fmtNum(qty)}</td>
                        <td className="px-4 py-3">{type}</td>
                        <td className="px-4 py-3">
                          <OrderBadge status={status} />
                        </td>
                        <td className="px-4 py-3">
                          {submitted ? fmtTime(submitted) : "-"}
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
            ) : !selectedOrderDetail ? (
              <div className="mt-3 text-sm text-[var(--muted)]">
                Click an order from the list to view its details.
              </div>
            ) : (
              <div className="mt-4 grid gap-4 text-sm">
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Order ID</div>
                  <div className="mt-1 font-mono text-xs">
                    {pickOrderId(selectedOrderDetail) ?? "-"}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Symbol</div>
                    <div className="mt-1">
                      {selectedOrderDetail.symbol ?? "-"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Side</div>
                    <div className="mt-1">
                      {selectedOrderDetail.side ?? "-"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Quantity</div>
                    <div className="mt-1">
                      {fmtNum(
                        selectedOrderDetail.quantity ?? selectedOrderDetail.qty,
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Type</div>
                    <div className="mt-1">
                      {fmtStatus(
                        selectedOrderDetail.type ??
                          selectedOrderDetail.orderType,
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Status</div>
                    <div className="mt-1">
                      {fmtStatus(selectedOrderDetail.status)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">
                      Time in Force
                    </div>
                    <div className="mt-1">
                      {selectedOrderDetail.timeInForce ?? "-"}
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Created</div>
                    <div className="mt-1">
                      {fmtTime(selectedOrderDetail.createdAt)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Submitted</div>
                    <div className="mt-1">
                      {fmtTime(selectedOrderDetail.submittedAt)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Updated</div>
                    <div className="mt-1">
                      {fmtTime(selectedOrderDetail.updatedAt)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
            <div className="text-sm font-semibold">Order History</div>

            {detailLoading ? (
              <div className="mt-3 text-sm text-[var(--muted)]">
                Loading history.
              </div>
            ) : selectedOrderId && selectedOrderHistory.length === 0 ? (
              <div className="mt-3 text-sm text-[var(--muted)]">
                No history entries found.
              </div>
            ) : selectedOrderHistory.length > 0 ? (
              <div className="mt-4 space-y-3">
                {selectedOrderHistory.map((h, idx) => {
                  const status = h.status ?? h.newStatus ?? "-";
                  const reason = h.reason ?? h.oldStatus ?? "-";

                  return (
                    <div
                      key={h.id ?? `${idx}`}
                      className="rounded-lg border border-[#132033] bg-[#0b1728] p-3"
                    >
                      <div className="text-xs text-[var(--muted)]">
                        {fmtTime(h.createdAt)}
                      </div>
                      <div className="mt-1 text-sm font-semibold">
                        {fmtStatus(status)}
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        Reason: {fmtStatus(reason)}
                      </div>
                      {h.message && (
                        <div className="mt-2 text-xs text-[var(--muted)]">
                          {h.message}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 text-sm text-[var(--muted)]">
                Select an order to see its status history.
              </div>
            )}
          </div>
        </div>

        {/* Chart Section */}
        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">
                {selectedStrategy?.symbol
                  ? `${selectedStrategy.symbol} Price Chart`
                  : "Price Chart"}
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                {selectedStrategy?.symbol
                  ? `Filled orders: ${filledOrdersSummary.buyCount} BUY, ${filledOrdersSummary.sellCount} SELL`
                  : "Select a strategy to view chart with order markers"}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
                value={chartTimeframe}
                onChange={(e) => setChartTimeframe(e.target.value as Timeframe)}
                disabled={!selectedStrategy?.symbol}
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
                disabled={chartLoading || !selectedStrategy?.symbol}
              >
                {chartLoading ? "Loading..." : "Refresh"}
              </button>
              {isLoadingMore && (
                <span className="text-xs text-[var(--muted)]">Loading more...</span>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showCandles}
                onChange={(e) => setShowCandles(e.target.checked)}
                disabled={!selectedStrategy?.symbol}
              />
              Candles
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showLine}
                onChange={(e) => setShowLine(e.target.checked)}
                disabled={!selectedStrategy?.symbol}
              />
              Line
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showVolume}
                onChange={(e) => setShowVolume(e.target.checked)}
                disabled={!selectedStrategy?.symbol}
              />
              Volume
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-[#132033] bg-[#0b1728] p-3">
            {!selectedStrategy?.symbol ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-[var(--muted)]">
                Select a strategy to view the chart
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

          {selectedStrategy?.symbol && (
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
