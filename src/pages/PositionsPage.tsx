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
  if (v === null || v === undefined || v === "") return "-";
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function fmtMoney(v: unknown) {
  if (v === null || v === undefined || v === "") return "-";
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtPct(v: unknown) {
  if (v === null || v === undefined || v === "") return "-";
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

  const totalUnrealized = useMemo(() => {
    const sum = positions.reduce((acc, p) => {
      const val = p.unrealizedPnL ?? p.unrealizedPl ?? undefined;
      const n = typeof val === "string" ? Number(val) : (val as number);
      if (Number.isNaN(n) || n === undefined) return acc;
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
      await refreshAccountInfo(userId);
      await load(userId);
      setMessage("Positions refreshed from Alpaca.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh positions");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-white">
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Positions</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Open positions for <span className="text-white">{me?.email ?? "..."}</span>
              </p>
            </div>
            <button
              onClick={onRefresh}
              disabled={loading || !userId}
              className="rounded-lg border border-[#1f2e44] px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {loading ? "Loading..." : "Refresh from Alpaca"}
            </button>
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

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-[#132033] bg-[#0f1b2d] p-4">
            <div className="text-xs text-[var(--muted)]">Open Positions</div>
            <div className="mt-2 text-2xl font-semibold">
              {positions.length}
            </div>
          </div>
          <div className="rounded-xl border border-[#132033] bg-[#0f1b2d] p-4">
            <div className="text-xs text-[var(--muted)]">Total Market Value</div>
            <div
              className={`mt-2 text-2xl font-semibold ${
                totalUnrealized < 0 ? "text-red-300" : "text-emerald-300"
              }`}
            >
              ${fmtMoney(totalMarketValue)}
            </div>
          </div>
          <div className="rounded-xl border border-[#132033] bg-[#0f1b2d] p-4">
            <div className="text-xs text-[var(--muted)]">Unrealized P/L</div>
            <div
              className={`mt-2 text-2xl font-semibold ${
                totalUnrealized < 0 ? "text-red-300" : "text-emerald-300"
              }`}
            >
              ${fmtMoney(totalUnrealized)}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="text-sm font-semibold">Positions Table</div>

          {loading && positions.length === 0 ? (
            <div className="mt-3 text-sm text-[var(--muted)]">Loading...</div>
          ) : positions.length === 0 ? (
            <div className="mt-3 text-sm text-[var(--muted)]">
              No open positions (paper account is empty).
            </div>
          ) : (
            <div className="mt-4 overflow-auto rounded-lg border border-[#132033]">
              <table className="min-w-full text-sm">
                <thead className="bg-[#0b1728] text-left text-xs text-[var(--muted)]">
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
                <tbody className="divide-y divide-[#132033]">
                  {positions.map((p) => {
                    const unrealized = p.unrealizedPnL ?? p.unrealizedPl ?? undefined;
                    const unrealizedPct =
                      p.unrealizedPnLPercent ?? p.unrealizedPlpc ?? undefined;
                    const qty = p.quantity ?? p.qty ?? undefined;
                    const avgEntry =
                      p.averageEntryPrice ?? p.avgEntryPrice ?? undefined;

                    const pl =
                      typeof unrealized === "string"
                        ? Number(unrealized)
                        : (unrealized as number | undefined);

                    const plClass =
                      pl === undefined || Number.isNaN(pl)
                        ? ""
                        : pl > 0
                          ? "text-emerald-300"
                          : pl < 0
                            ? "text-red-300"
                            : "";

                    return (
                      <tr key={p.symbol}>
                        <td className="px-4 py-3 font-medium">{p.symbol}</td>
                        <td className="px-4 py-3">{p.side ?? "-"}</td>
                        <td className="px-4 py-3">{fmtNum(qty)}</td>
                        <td className="px-4 py-3">{fmtMoney(avgEntry)}</td>
                        <td className="px-4 py-3">{fmtMoney(p.currentPrice)}</td>
                        <td className="px-4 py-3">{fmtMoney(p.marketValue)}</td>
                        <td className={`px-4 py-3 ${plClass}`}>
                          {fmtMoney(unrealized)}
                        </td>
                        <td className={`px-4 py-3 ${plClass}`}>
                          {fmtPct(unrealizedPct)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
