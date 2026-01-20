import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import { api } from "../api/client";

import type { Position } from "../api/positions";
import { getPositions } from "../api/positions";
import { refreshAccountInfo } from "../api/account";

type MeResponse = {
  id: number;
  firebaseUid: string;
  email: string;
  displayName?: string | null;
  provider?: string | null;
};

function fmtNum(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function fmtMoney(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtPct(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (Number.isNaN(n)) return String(v);
  const pct = Math.abs(n) <= 1 ? n * 100 : n;
  return `${pct.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

export default function PositionsPage() {
  const nav = useNavigate();

  const [me, setMe] = useState<MeResponse | null>(null);
  const userId = me?.id ?? null;

  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const totalMarketValue = useMemo(() => {
    const sum = positions.reduce((acc, p) => {
      const v = p.marketValue;
      const n = typeof v === "string" ? Number(v) : (v as number);
      if (Number.isNaN(n)) return acc;
      return acc + n;
    }, 0);
    return sum;
  }, [positions]);

  async function load(uid: number) {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const data = await getPositions(uid);
      setPositions(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load positions");
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        nav("/login", { replace: true });
        return;
      }

      try {
        setError(null);
        setMessage(null);
        const data = await api.get<MeResponse>("/api/v1/users/me");
        setMe(data);
        await load(data.id);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load /users/me");
      }
    });

    return () => unsub();
  }, [nav]);

  const onRefresh = async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      // ✅ backend-supported refresh
      await refreshAccountInfo(userId);
      // then re-fetch positions
      await load(userId);

      setMessage("Positions refreshed from Alpaca.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh positions");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-xl border bg-white p-6 shadow">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Positions</h1>
              <p className="mt-2 text-sm text-gray-700">
                Open positions for{" "}
                <span className="font-medium">{me?.email ?? "..."}</span>
              </p>
              <p className="mt-1 text-xs text-gray-600">
                Total market value:{" "}
                <span className="font-medium">
                  {fmtMoney(totalMarketValue)}
                </span>
              </p>
            </div>

            <button
              onClick={onRefresh}
              disabled={loading || !userId}
              className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {loading ? "Loading..." : "Refresh from Alpaca"}
            </button>
          </div>

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
          <div className="text-sm font-semibold">Positions table</div>

          {loading && positions.length === 0 ? (
            <div className="mt-3 text-sm text-gray-600">Loading...</div>
          ) : positions.length === 0 ? (
            <div className="mt-3 text-sm text-gray-600">
              No open positions (paper account is empty).
            </div>
          ) : (
            <div className="mt-4 overflow-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3">Symbol</th>
                    <th className="px-4 py-3">Side</th>
                    <th className="px-4 py-3">Qty</th>
                    <th className="px-4 py-3">Avg entry</th>
                    <th className="px-4 py-3">Current</th>
                    <th className="px-4 py-3">Market value</th>
                    <th className="px-4 py-3">Unrealized P&amp;L</th>
                    <th className="px-4 py-3">Unrealized %</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {positions.map((p) => {
                    const pl =
                      typeof p.unrealizedPl === "string"
                        ? Number(p.unrealizedPl)
                        : (p.unrealizedPl as number | undefined);

                    const plClass =
                      pl === undefined || Number.isNaN(pl)
                        ? ""
                        : pl > 0
                          ? "text-green-700"
                          : pl < 0
                            ? "text-red-700"
                            : "";

                    return (
                      <tr key={p.symbol}>
                        <td className="px-4 py-3 font-medium">{p.symbol}</td>
                        <td className="px-4 py-3">{p.side ?? "—"}</td>
                        <td className="px-4 py-3">{fmtNum(p.qty)}</td>
                        <td className="px-4 py-3">
                          {fmtMoney(p.avgEntryPrice)}
                        </td>
                        <td className="px-4 py-3">
                          {fmtMoney(p.currentPrice)}
                        </td>
                        <td className="px-4 py-3">{fmtMoney(p.marketValue)}</td>
                        <td className={`px-4 py-3 ${plClass}`}>
                          {fmtMoney(p.unrealizedPl)}
                        </td>
                        <td className={`px-4 py-3 ${plClass}`}>
                          {fmtPct(p.unrealizedPlpc)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-6 shadow">
          <div className="text-sm font-semibold">Raw data</div>
          <pre className="mt-3 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">
            {JSON.stringify(positions, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
