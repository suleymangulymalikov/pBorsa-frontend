import { onAuthStateChanged, signOut, getIdToken } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { auth } from "../lib/firebase";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { getAccountInfo, getPortfolioValue, getUnrealizedPnl } from "../api/account";
import { getPositions } from "../api/positions";
import { getUserStrategies } from "../api/strategies";

export default function DashboardPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [me, setMe] = useState<any>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [portfolioValue, setPortfolioValue] = useState<number | string | null>(
    null,
  );
  const [totalValue, setTotalValue] = useState<number | string | null>(null);
  const [totalValueDelta, setTotalValueDelta] = useState<number | null>(null);
  const [unrealizedPnl, setUnrealizedPnl] = useState<number | string | null>(
    null,
  );
  const [positionsCount, setPositionsCount] = useState<number | null>(null);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const filteredStrategies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return strategies;
    return strategies.filter((s) => {
      const name = String(s?.name ?? "").toLowerCase();
      const symbol = String(s?.symbol ?? "").toLowerCase();
      const base = String(
        s?.baseStrategy?.code ?? s?.baseStrategy?.name ?? "",
      ).toLowerCase();
      return name.includes(q) || symbol.includes(q) || base.includes(q);
    });
  }, [search, strategies]);

  const activeStrategies = useMemo(
    () => strategies.filter((s) => String(s?.status) === "ACTIVE").length,
    [strategies],
  );

  function fmtMoney(v: unknown) {
    if (v === null || v === undefined || v === "") return "-";
    const n = typeof v === "string" ? Number(v) : (v as number);
    if (Number.isNaN(n)) return String(v);
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function isNegative(v: unknown) {
    if (v === null || v === undefined || v === "") return false;
    const n = typeof v === "string" ? Number(v) : (v as number);
    if (Number.isNaN(n)) return false;
    return n < 0;
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        nav("/login", { replace: true });
        return;
      }

      setEmail(user.email);

      try {
        setLoading(true);
        setMeError(null);
        const data = await api.get<any>("/api/v1/users/me");
        setMe(data);

        const [pv, pnl, positions, userStrategies, account] = await Promise.all([
          getPortfolioValue(data.id),
          getUnrealizedPnl(data.id),
          getPositions(data.id),
          getUserStrategies(data.id),
          getAccountInfo(data.id),
        ]);

        setPortfolioValue(pv);
        setUnrealizedPnl(pnl);
        setPositionsCount(Array.isArray(positions) ? positions.length : 0);
        setStrategies(Array.isArray(userStrategies) ? userStrategies : []);
        setTotalValue(account?.equity ?? pv ?? null);
        if (account?.equity !== undefined && account?.lastEquity !== undefined) {
          const current =
            typeof account.equity === "string"
              ? Number(account.equity)
              : (account.equity as number);
          const last =
            typeof account.lastEquity === "string"
              ? Number(account.lastEquity)
              : (account.lastEquity as number);
          if (!Number.isNaN(current) && !Number.isNaN(last)) {
            setTotalValueDelta(current - last);
          } else {
            setTotalValueDelta(null);
          }
        } else {
          setTotalValueDelta(null);
        }
      } catch (e: any) {
        setMeError(e?.message ?? "Failed to load /me");
        setPortfolioValue(null);
        setUnrealizedPnl(null);
        setPositionsCount(null);
        setStrategies([]);
        setTotalValue(null);
        setTotalValueDelta(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [nav]);

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-white">
      <div className="border-b border-[#132033] bg-[#0b1422]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span className="text-[var(--accent)]">◆</span>
            pBorsa
          </div>
          <nav className="hidden items-center gap-6 text-sm text-[var(--muted)] md:flex">
            <button className="text-white" onClick={() => nav("/")}>
              Dashboard
            </button>
            <button onClick={() => nav("/market")}>Market Data</button>
            <button onClick={() => nav("/orders")}>Orders</button>
            <button onClick={() => nav("/positions")}>Positions</button>
            <button onClick={() => nav("/strategies")}>Strategies</button>
          </nav>
          <div className="relative">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-[#1f2e44] px-3 py-1.5 text-xs text-white">
                <span className="hidden sm:inline">{email ?? "Account"}</span>
                <span className="text-[var(--muted)]">▾</span>
              </summary>
              <div className="absolute right-0 mt-2 w-40 rounded-lg border border-[#1f2e44] bg-[#0f1b2d] p-2 text-xs shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
                <button
                  className="w-full rounded-md px-2 py-2 text-left text-white hover:bg-[#132033]"
                  onClick={() => nav("/account")}
                >
                  Account
                </button>
                <button
                  className="mt-1 w-full rounded-md px-2 py-2 text-left text-white hover:bg-[#132033]"
                  onClick={() => signOut(auth)}
                >
                  Sign out
                </button>
              </div>
            </details>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Strategy Dashboard</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Monitor and manage your active trading strategies.
            </p>
          </div>
        </div>

        {meError && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {meError}
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-[#1a2b45] bg-[#0f1b2d] p-4">
            <div className="text-xs text-[var(--muted)]">Active Strategies</div>
            <div className="mt-3 text-2xl font-semibold">
              {loading ? "…" : activeStrategies}
            </div>
          </div>
          <div className="rounded-xl border border-[#1a2b45] bg-[#0f1b2d] p-4">
            <div className="text-xs text-[var(--muted)]">Total Value</div>
            <div
              className={`mt-3 text-2xl font-semibold ${
                isNegative(totalValueDelta ?? totalValue)
                  ? "text-red-400"
                  : "text-emerald-400"
              }`}
            >
              {loading ? "…" : `$${fmtMoney(totalValue)}`}
            </div>
            <div
              className={`mt-1 text-xs ${
                isNegative(totalValueDelta)
                  ? "text-red-300"
                  : "text-emerald-300"
              }`}
            >
              {totalValueDelta === null
                ? "—"
                : `${totalValueDelta >= 0 ? "+" : ""}$${fmtMoney(
                    totalValueDelta,
                  )}`}
            </div>
          </div>
          <div className="rounded-xl border border-[#1a2b45] bg-[#0f1b2d] p-4">
            <div className="text-xs text-[var(--muted)]">Unrealized P/L</div>
            <div
              className={`mt-3 text-2xl font-semibold ${
                isNegative(unrealizedPnl) ? "text-red-400" : "text-emerald-400"
              }`}
            >
              {loading ? "…" : `$${fmtMoney(unrealizedPnl)}`}
            </div>
          </div>
          <div className="rounded-xl border border-[#1a2b45] bg-[#0f1b2d] p-4">
            <div className="text-xs text-[var(--muted)]">Open Positions</div>
            <div className="mt-3 text-2xl font-semibold">
              {loading ? "…" : (positionsCount ?? "-")}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-[#1a2b45] bg-gradient-to-br from-[#0f1b2d] via-[#0f1b2d] to-[#0b1525] p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#132742] text-white">
            +
          </div>
          <h2 className="mt-4 text-lg font-semibold">
            Create a New Trading Strategy
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
            Use your strategy builder to configure, backtest, and activate new
            strategies.
          </p>
          <button
            className="mt-4 rounded-lg bg-[#1f6feb] px-4 py-2 text-sm font-semibold"
            onClick={() => nav("/strategies")}
          >
            + Go to Strategy Editor
          </button>
        </div>

        <div className="mt-8 rounded-2xl border border-[#1a2b45] bg-[#0f1b2d] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">My Strategies</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                View and manage your saved strategies.
              </div>
            </div>
            <input
              className="w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white placeholder:text-[#6c7c95] md:w-60"
              placeholder="Search strategies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filteredStrategies.length === 0 ? (
            <div className="mt-4 text-sm text-[var(--muted)]">
              No strategies found.
            </div>
          ) : (
            <div className="mt-4 overflow-auto rounded-lg border border-[#132033]">
              <table className="min-w-full text-sm">
                <thead className="bg-[#0b1728] text-left text-xs text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3">Strategy Name</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Symbol</th>
                    <th className="px-4 py-3">Budget</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#132033]">
                  {filteredStrategies.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3">
                        {s.name ?? s.baseStrategy?.name ?? "Strategy"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            String(s.status) === "ACTIVE"
                              ? "bg-emerald-500/10 text-emerald-300"
                              : String(s.status) === "PREPARING"
                                ? "bg-blue-500/10 text-blue-300"
                                : "bg-amber-500/10 text-amber-300"
                          }`}
                        >
                          {s.status ?? "CREATED"}
                        </span>
                      </td>
                      <td className="px-4 py-3">{s.symbol ?? "-"}</td>
                      <td className="px-4 py-3">{s.budget ?? "-"}</td>
                      <td className="px-4 py-3 text-xs text-[var(--muted)]">
                        {s.updatedAt ? String(s.updatedAt) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
