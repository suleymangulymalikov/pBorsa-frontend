import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function pickOrderId(o: OrderDetail): string | null {
  if (typeof o.id === "string") return o.id;
  if (typeof o.orderId === "string") return o.orderId;
  return null;
}

export default function OrdersPage() {
  const nav = useNavigate();

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
      } catch (e: any) {
        setError(e?.message ?? "Failed to load user / strategies");
      }
    });

    return () => unsub();
  }, [nav]);

  const loadOrders = async () => {
    if (!userId || strategyId === "") return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const data = await getOrdersByUserStrategy(userId, strategyId);
      setOrders(Array.isArray(data) ? data : []);
      setMessage("Orders loaded.");

      // reset selection
      setSelectedOrderId(null);
      setSelectedOrderDetail(null);
      setSelectedOrderHistory([]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load orders");
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
      setError(e?.message ?? "Failed to load order detail/history");
      setSelectedOrderDetail(null);
      setSelectedOrderHistory([]);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-xl border bg-white p-6 shadow">
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="mt-2 text-sm text-gray-700">
            View orders created by your strategies (paper trading) for{" "}
            <span className="font-medium">{me?.email ?? "..."}</span>
          </p>

          <div className="mt-5 flex flex-wrap items-end gap-3">
            <div className="min-w-[260px]">
              <label className="block text-xs font-medium text-gray-600">
                User strategy
              </label>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={strategyId}
                onChange={(e) => {
                  const v = e.target.value;
                  setStrategyId(v === "" ? "" : Number(v));
                }}
              >
                <option value="">Select a strategy…</option>
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.id} — {s.name ?? s.baseStrategyCode ?? "Strategy"}{" "}
                    {s.symbol ? `(${s.symbol})` : ""}{" "}
                    {s.status ? `— ${s.status}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <button
              disabled={loading || !userId || strategyId === ""}
              className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
              onClick={() => void loadOrders()}
            >
              {loading ? "Loading..." : "Load orders"}
            </button>

            <button
              disabled={loading || !userId || strategyId === ""}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-60"
              onClick={() => void loadOrders()}
            >
              Refresh
            </button>
          </div>

          {selectedStrategy && (
            <div className="mt-4 text-xs text-gray-600">
              Selected:{" "}
              <span className="font-medium">
                #{selectedStrategy.id} {selectedStrategy.name ?? ""}{" "}
                {selectedStrategy.symbol ? `(${selectedStrategy.symbol})` : ""}
              </span>
            </div>
          )}

          {message && (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              {message}
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-6 shadow">
          <div className="text-sm font-semibold">Orders list</div>

          {strategyId === "" ? (
            <div className="mt-3 text-sm text-gray-600">
              Choose a strategy, then click “Load orders”.
            </div>
          ) : orders.length === 0 ? (
            <div className="mt-3 text-sm text-gray-600">
              No orders for this strategy yet.
            </div>
          ) : (
            <div className="mt-4 overflow-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left">
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
                <tbody className="divide-y">
                  {orders.map((o, idx) => {
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
                        className={isSelected ? "bg-gray-50" : ""}
                        onClick={() => void onSelectOrder(o)}
                        style={{ cursor: "pointer" }}
                        title="Click to view detail + history"
                      >
                        <td className="px-4 py-3 font-mono text-xs">
                          {pickOrderId(o) ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {o.symbol ?? "-"}
                        </td>
                        <td className="px-4 py-3">{o.side ?? "-"}</td>
                        <td className="px-4 py-3">{fmtNum(qty)}</td>
                        <td className="px-4 py-3">{type}</td>
                        <td className="px-4 py-3">{o.status ?? "-"}</td>
                        <td className="px-4 py-3">
                          {submitted ? String(submitted) : "-"}
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
          <div className="rounded-xl border bg-white p-6 shadow">
            <div className="text-sm font-semibold">Selected order detail</div>

            {detailLoading ? (
              <div className="mt-3 text-sm text-gray-600">Loading detail…</div>
            ) : !selectedOrderDetail ? (
              <div className="mt-3 text-sm text-gray-600">
                Click an order from the list to view its details.
              </div>
            ) : (
              <pre className="mt-3 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">
                {JSON.stringify(selectedOrderDetail, null, 2)}
              </pre>
            )}
          </div>

          <div className="rounded-xl border bg-white p-6 shadow">
            <div className="text-sm font-semibold">Order history</div>

            {detailLoading ? (
              <div className="mt-3 text-sm text-gray-600">Loading history…</div>
            ) : selectedOrderId && selectedOrderHistory.length === 0 ? (
              <div className="mt-3 text-sm text-gray-600">
                No history entries found.
              </div>
            ) : selectedOrderHistory.length > 0 ? (
              <div className="mt-4 overflow-auto rounded-lg border">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-4 py-3">When</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {selectedOrderHistory.map((h, idx) => {
                      const status = h.status ?? h.newStatus ?? "-";
                      const reason = h.reason ?? h.oldStatus ?? "-";

                      return (
                        <tr key={h.id ?? `${idx}`}>
                          <td className="px-4 py-3">
                            {h.createdAt ? String(h.createdAt) : "-"}
                          </td>
                          <td className="px-4 py-3">{status}</td>
                          <td className="px-4 py-3">{reason}</td>
                          <td className="px-4 py-3">{h.message ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 text-sm text-gray-600">
                Select an order to see its status history.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow">
          <div className="text-sm font-semibold">Raw orders</div>
          <pre className="mt-3 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">
            {JSON.stringify(orders, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
