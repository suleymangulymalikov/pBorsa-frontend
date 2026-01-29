import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import { api } from "../api/client";

import type { OrderDetail, OrderHistoryEntry } from "../api/orders";
import {
  getOrderDetail,
  getOrderHistory,
  getOrdersByUserStrategy,
} from "../api/orders";

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
              className="rounded-lg bg-[#1f6feb] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void loadOrders()}
            >
              {loading ? "Loading..." : "Load orders"}
            </button>

            <button
              disabled={loading || !userId || strategyId === ""}
              className="rounded-lg border border-[#1f2e44] px-4 py-2 text-sm text-white disabled:opacity-60"
              onClick={() => void loadOrders()}
            >
              Refresh
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
            <div className="mt-3 text-sm text-[var(--muted)]">
              Choose a strategy, then click "Load orders".
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
                    <th className="px-4 py-3">Order ID</th>
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

                    return (
                      <tr
                        key={oid}
                        className={isSelected ? "bg-[#0b1728]" : ""}
                        onClick={() => void onSelectOrder(o)}
                        style={{ cursor: "pointer" }}
                        title="Click to view detail + history"
                      >
                        <td className="px-4 py-3 font-mono text-xs">
                          {pickOrderId(o) ?? "-"}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {o.symbol ?? "-"}
                        </td>
                        <td className="px-4 py-3">{o.side ?? "-"}</td>
                        <td className="px-4 py-3">{fmtNum(qty)}</td>
                        <td className="px-4 py-3">{type}</td>
                        <td className="px-4 py-3">{fmtStatus(o.status)}</td>
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
      </div>
    </div>
  );
}
