import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import { api } from "../api/client";
import { useStocks } from "../hooks/useStocks";

import type { BaseStrategy, UserStrategy, StrategyPnL } from "../api/strategies";
import {
  activateUserStrategy,
  createUserStrategy,
  deleteUserStrategy,
  getBaseStrategies,
  getStrategyPnL,
  getUserStrategies,
  updateUserStrategy,
} from "../api/strategies";
import { extractErrorMessage } from "../api/errors";
import Modal from "../components/Modal";
import StockSelect from "../components/StockSelect";

type MeResponse = {
  id: number;
  firebaseUid: string;
  email: string;
};

function Badge({ text }: { text: string }) {
  const cls =
    text === "ACTIVE"
      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
      : text === "CREATED"
        ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
        : text === "PREPARING"
          ? "bg-blue-500/10 text-blue-300 border-blue-500/20"
          : "bg-gray-500/10 text-gray-300 border-gray-500/20";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}
    >
      {text}
    </span>
  );
}

// backend returns nested baseStrategy; support both shapes
function getBaseCode(s: any): string {
  return (
    s?.baseStrategyCode ?? s?.baseStrategy?.code ?? s?.baseStrategy?.name ?? "-"
  );
}

function formatPnL(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (Number.isNaN(n)) return "-";
  const formatted = n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n >= 0 ? `+$${formatted}` : `-$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isPnLNegative(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  const n = typeof value === "string" ? Number(value) : (value as number);
  return !Number.isNaN(n) && n < 0;
}

export default function StrategiesPage() {
  const nav = useNavigate();

  const [me, setMe] = useState<MeResponse | null>(null);
  const userId = me?.id ?? null;

  const [baseStrategies, setBaseStrategies] = useState<BaseStrategy[]>([]);
  const [userStrategies, setUserStrategies] = useState<UserStrategy[]>([]);

  const [loading, setLoading] = useState(false);

  const [pageError, setPageError] = useState<string | null>(null);
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editCurrentStatus, setEditCurrentStatus] = useState<string>("CREATED");

  // form
  const [baseCode, setBaseCode] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("AAPL");
  const [budget, setBudget] = useState<string>("1000");

  // modal
  const [showCreateModal, setShowCreateModal] = useState(false);

  // PnL data
  const [pnlData, setPnlData] = useState<Record<number, StrategyPnL>>({});

  const { stocks, loading: stocksLoading, error: stocksError } = useStocks();

  const normalizedSymbol = useMemo(() => symbol.trim().toUpperCase(), [symbol]);

  const hasPreparing = useMemo(
    () =>
      userStrategies.some((s: any) => String(s?.status ?? "") === "PREPARING"),
    [userStrategies],
  );

  async function loadAll(uid: number) {
    setPageError(null);

    try {
      const [bases, users] = await Promise.all([
        getBaseStrategies(),
        getUserStrategies(uid),
      ]);

      setBaseStrategies(Array.isArray(bases) ? bases : []);
      setUserStrategies(Array.isArray(users) ? users : []);

      if (!baseCode && Array.isArray(bases) && bases.length > 0) {
        setBaseCode(String(bases[0].code));
      }

      // Fetch PnL for ACTIVE strategies
      const userList = Array.isArray(users) ? users : [];
      const activeStrategies = userList.filter(
        (s: any) => String(s?.status ?? "") === "ACTIVE"
      );

      if (activeStrategies.length > 0) {
        const pnlResults = await Promise.allSettled(
          activeStrategies.map((s: any) => getStrategyPnL(uid, s.id))
        );

        const newPnlData: Record<number, StrategyPnL> = {};
        pnlResults.forEach((result, index) => {
          if (result.status === "fulfilled") {
            const strategyId = activeStrategies[index].id;
            newPnlData[strategyId] = result.value;
          }
        });
        setPnlData(newPnlData);
      }
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to load strategies. Please try again.";
      setPageError(extractErrorMessage(errorMessage));
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        nav("/login", { replace: true });
        return;
      }

      try {
        const meData = await api.get<MeResponse>("/api/v1/users/me");
        setMe(meData);

        setLoading(true);
        setPageMessage(null);
        await loadAll(meData.id);
      } catch (e: any) {
        const errorMessage =
          e?.message || "Unable to load user information. Please try again.";
        setPageError(extractErrorMessage(errorMessage));
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [nav]);

  // auto-refresh while any is PREPARING
  useEffect(() => {
    if (!userId) return;
    if (!hasPreparing) return;

    const t = setInterval(() => {
      void loadAll(userId);
    }, 3000);

    return () => clearInterval(t);
  }, [userId, hasPreparing]);

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

    setLoading(true);
    setFormError(null);
    setPageMessage(null);

    try {
      await createUserStrategy(userId, {
        baseStrategyCode: baseCode,
        name: name.trim(),
        symbol: sym,
        budget: Number(budget),
      });

      setPageMessage("Strategy created.");
      setName("");
      setShowCreateModal(false);
      await loadAll(userId);
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to create strategy. Please try again.";
      setFormError(extractErrorMessage(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  const onActivate = async (id: number) => {
    if (!userId) return;

    setLoading(true);
    setPageError(null);
    setPageMessage(null);

    try {
      await activateUserStrategy(userId, id);
      setPageMessage(
        "Activation requested. It may stay PREPARING for a short time.",
      );
      await loadAll(userId);
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to activate strategy. Please try again.";
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
      await deleteUserStrategy(userId, id);
      setPageMessage("Strategy deleted.");
      await loadAll(userId);
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to delete strategy. Please try again.";
      setPageError(extractErrorMessage(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  const onStop = async (id: number) => {
    if (!userId) return;

    setLoading(true);
    setPageError(null);
    setPageMessage(null);

    try {
      await updateUserStrategy(userId, id, { status: "STOPPED" });
      setPageMessage("Strategy stopped.");
      await loadAll(userId);
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to stop strategy. Please try again.";
      setPageError(extractErrorMessage(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  const onStartEdit = (s: any) => {
    setEditingId(s.id);
    setEditName(String(s.name ?? ""));
    const status = String(s.status ?? "CREATED");
    setEditCurrentStatus(status);
  };

  const onCancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditCurrentStatus("CREATED");
  };

  const onSaveEdit = async (id: number) => {
    if (!userId) return;
    if (!editName.trim()) {
      setPageError("Name is required.");
      return;
    }

    const req = {
      name: editName.trim(),
    };

    setLoading(true);
    setPageError(null);
    setPageMessage(null);

    try {
      await updateUserStrategy(userId, id, req);
      setPageMessage("Strategy updated.");
      setEditingId(null);
      await loadAll(userId);
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to update strategy. Please try again.";
      setPageError(extractErrorMessage(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-white">
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <h1 className="text-2xl font-semibold">Strategies</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Create and activate trading strategies for{" "}
            <span className="text-white">{me?.email ?? "..."}</span>
          </p>

          {hasPreparing && (
            <div className="mt-3 text-xs text-blue-300">
              One or more strategies are PREPARING - auto-refresh is running.
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
              + Create Strategy
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
          title="Create Strategy"
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
              placeholder="strategy 1"
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
            <div className="mt-1 text-xs text-[var(--muted)]">
              Used by the strategy to limit how much it can trade.
            </div>

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
                {loading ? "Working..." : "Create strategy"}
              </button>
            </div>
          </form>
        </Modal>

        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Your Strategies</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Activate one to start producing orders.
              </div>
            </div>

            <button
              disabled={loading || !userId}
              className="rounded-lg border border-[#1f2e44] px-4 py-2 text-sm text-white disabled:opacity-60"
              onClick={() => userId && loadAll(userId)}
              type="button"
            >
              Refresh
            </button>
          </div>

          {userStrategies.length === 0 ? (
            <div className="mt-3 text-sm text-[var(--muted)]">
              You have no strategies yet. Create one above.
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
                    <th className="px-4 py-3">Budget</th>
                    <th className="px-4 py-3">P/L</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#132033]">
                  {[...userStrategies]
                    .sort((a: any, b: any) => {
                      const rank = (s: any) => {
                        const status = String(s?.status ?? "");
                        if (status === "ACTIVE") return 0;
                        if (status === "PREPARING") return 1;
                        if (status === "PAUSED") return 2;
                        if (status === "CREATED") return 3;
                        if (status === "STOPPED") return 4;
                        return 5;
                      };
                      return rank(a) - rank(b);
                    })
                    .map((s: any) => {
                      const status = String(s?.status ?? "-");
                      const disableActivate =
                        loading ||
                        status === "ACTIVE" ||
                        status === "PREPARING" ||
                        status === "STOPPED";
                      const canDelete =
                        status === "CREATED" || status === "STOPPED";
                      const canStop =
                        status === "ACTIVE" || status === "PAUSED";

                      return (
                        <tr key={s.id}>
                          <td className="px-4 py-3 font-mono text-xs">
                            {s.id}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {editingId === s.id ? (
                              <input
                                className="w-full rounded-md border border-[#1f2e44] bg-[#0b1728] px-2 py-1 text-xs text-white"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                              />
                            ) : (
                              (s.name ?? "-")
                            )}
                          </td>
                          <td className="px-4 py-3">{getBaseCode(s)}</td>
                          <td className="px-4 py-3">{s.symbol ?? "-"}</td>
                          <td className="px-4 py-3">
                            {String(s.budget ?? "-")}
                          </td>
                          <td className="px-4 py-3">
                            {status === "ACTIVE" && pnlData[s.id] ? (
                              <div className="text-xs">
                                <div
                                  className={
                                    isPnLNegative(pnlData[s.id]?.unrealizedPnl)
                                      ? "text-red-400"
                                      : "text-emerald-400"
                                  }
                                  title="Unrealized P/L"
                                >
                                  {formatPnL(pnlData[s.id]?.unrealizedPnl)}
                                </div>
                                {pnlData[s.id]?.realizedPnl !== undefined && (
                                  <div
                                    className={`mt-0.5 text-[10px] ${
                                      isPnLNegative(pnlData[s.id]?.realizedPnl)
                                        ? "text-red-400/70"
                                        : "text-emerald-400/70"
                                    }`}
                                    title="Realized P/L"
                                  >
                                    R: {formatPnL(pnlData[s.id]?.realizedPnl)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-[var(--muted)]">
                                -
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge text={status} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              {editingId === s.id ? (
                                <>
                                  <button
                                    className="rounded-lg bg-[#1f6feb] px-3 py-1.5 text-xs text-white disabled:opacity-60"
                                    disabled={loading}
                                    onClick={() => void onSaveEdit(s.id)}
                                    type="button"
                                  >
                                    Save
                                  </button>
                                  <button
                                    className="rounded-lg border border-[#1f2e44] px-3 py-1.5 text-xs text-white disabled:opacity-60"
                                    disabled={loading}
                                    onClick={onCancelEdit}
                                    type="button"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="rounded-lg bg-[#1f6feb] px-3 py-1.5 text-xs text-white disabled:opacity-60"
                                    disabled={disableActivate}
                                    onClick={() => void onActivate(s.id)}
                                    type="button"
                                  >
                                    Activate
                                  </button>
                                  <Link
                                    to="/orders"
                                    state={{ strategyId: s.id }}
                                    className="rounded-lg border border-[#1f2e44] px-3 py-1.5 text-xs text-white hover:bg-[#1f2e44]/50 disabled:opacity-60 inline-block"
                                    title="View orders for this strategy"
                                  >
                                    Orders
                                  </Link>
                                  <button
                                    className="rounded-lg border border-[#1f2e44] px-3 py-1.5 text-xs text-white disabled:opacity-60"
                                    disabled={loading}
                                    onClick={() => void onStartEdit(s)}
                                    type="button"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="rounded-lg border border-[#1f2e44] px-3 py-1.5 text-xs text-white disabled:opacity-60"
                                    disabled={loading || !canStop}
                                    onClick={() => void onStop(s.id)}
                                    type="button"
                                    title={
                                      canStop
                                        ? "Stop strategy"
                                        : "Only ACTIVE or PAUSED can be stopped"
                                    }
                                  >
                                    Stop
                                  </button>
                                  <button
                                    className="rounded-lg border border-[#1f2e44] px-3 py-1.5 text-xs text-white disabled:opacity-60"
                                    disabled={loading || !canDelete}
                                    onClick={() => void onDelete(s.id)}
                                    type="button"
                                    title="Delete strategy"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
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
      </div>
    </div>
  );
}
