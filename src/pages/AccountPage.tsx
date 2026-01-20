import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import { api } from "../api/client";

// ✅ type-only import (FIX)
import type { AccountInfo } from "../api/account";

// ✅ value imports
import {
  getAccountInfo,
  getPortfolioValue,
  getUnrealizedPnl,
  refreshAccountInfo,
} from "../api/account";

type MeResponse = {
  id: number;
  firebaseUid: string;
  email: string;
  displayName?: string | null;
  provider?: string | null;
};

function fmtMoney(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function AccountPage() {
  const nav = useNavigate();

  const [me, setMe] = useState<MeResponse | null>(null);
  const userId = me?.id ?? null;

  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [portfolioValue, setPortfolioValue] = useState<string | number | null>(
    null,
  );
  const [unrealizedPnl, setUnrealizedPnl] = useState<string | number | null>(
    null,
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canTrade = useMemo(() => {
    if (!account) return null;
    if (account.status && account.status !== "ACTIVE") return false;
    if (account.tradingBlocked) return false;
    if (account.accountBlocked) return false;
    if (account.tradeSuspendedByUser) return false;
    return true;
  }, [account]);

  async function loadAll(uid: number) {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const [acc, pv, pnl] = await Promise.all([
        getAccountInfo(uid),
        getPortfolioValue(uid),
        getUnrealizedPnl(uid),
      ]);

      setAccount(acc);
      setPortfolioValue(pv);
      setUnrealizedPnl(pnl);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load account info");
      setAccount(null);
      setPortfolioValue(null);
      setUnrealizedPnl(null);
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
        await loadAll(data.id);
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
      const refreshed = await refreshAccountInfo(userId);
      setAccount(refreshed);

      const [pv, pnl] = await Promise.all([
        getPortfolioValue(userId),
        getUnrealizedPnl(userId),
      ]);
      setPortfolioValue(pv);
      setUnrealizedPnl(pnl);

      setMessage("Account refreshed from Alpaca.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-xl border bg-white p-6 shadow">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Account</h1>
              <p className="mt-2 text-sm text-gray-700">
                Alpaca account summary for{" "}
                <span className="font-medium">{me?.email ?? "..."}</span>
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

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-white p-5 shadow">
            <div className="text-sm font-semibold">Cash</div>
            <div className="mt-2 text-2xl font-semibold">
              {fmtMoney(account?.cash)} {account?.currency ?? ""}
            </div>
            <div className="mt-2 text-xs text-gray-600">
              Buying power: {fmtMoney(account?.buyingPower)}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow">
            <div className="text-sm font-semibold">Equity</div>
            <div className="mt-2 text-2xl font-semibold">
              {fmtMoney(account?.equity)} {account?.currency ?? ""}
            </div>
            <div className="mt-2 text-xs text-gray-600">
              Last equity: {fmtMoney(account?.lastEquity)}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow">
            <div className="text-sm font-semibold">Portfolio value</div>
            <div className="mt-2 text-2xl font-semibold">
              {fmtMoney(portfolioValue)} {account?.currency ?? ""}
            </div>
            <div className="mt-2 text-xs text-gray-600">
              Long MV: {fmtMoney(account?.longMarketValue)} · Short MV:{" "}
              {fmtMoney(account?.shortMarketValue)}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow">
            <div className="text-sm font-semibold">Unrealized P&amp;L</div>
            <div className="mt-2 text-2xl font-semibold">
              {fmtMoney(unrealizedPnl)} {account?.currency ?? ""}
            </div>
            <div className="mt-2 text-xs text-gray-600">
              Can trade:{" "}
              {canTrade === null ? (
                "—"
              ) : canTrade ? (
                <span className="font-medium text-green-700">Yes</span>
              ) : (
                <span className="font-medium text-red-700">No</span>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow">
          <div className="text-sm font-semibold">Details</div>
          {account ? (
            <pre className="mt-3 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">
              {JSON.stringify(account, null, 2)}
            </pre>
          ) : (
            <div className="mt-3 text-sm text-gray-600">No data</div>
          )}
        </div>
      </div>
    </div>
  );
}
