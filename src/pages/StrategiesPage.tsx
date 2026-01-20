import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import { api } from "../api/client";

import type { BaseStrategy, UserStrategy } from "../api/strategies";
import {
  activateUserStrategy,
  createUserStrategy,
  deleteUserStrategy,
  getBaseStrategies,
  getUserStrategies,
} from "../api/strategies";

type MeResponse = {
  id: number;
  firebaseUid: string;
  email: string;
};

function Badge({ text }: { text: string }) {
  const cls =
    text === "ACTIVE"
      ? "bg-green-50 text-green-800 border-green-200"
      : text === "CREATED"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : text === "PREPARING"
          ? "bg-blue-50 text-blue-800 border-blue-200"
          : "bg-gray-50 text-gray-800 border-gray-200";

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
    s?.baseStrategyCode ?? s?.baseStrategy?.code ?? s?.baseStrategy?.name ?? "—"
  );
}

export default function StrategiesPage() {
  const nav = useNavigate();

  const [me, setMe] = useState<MeResponse | null>(null);
  const userId = me?.id ?? null;

  const [baseStrategies, setBaseStrategies] = useState<BaseStrategy[]>([]);
  const [userStrategies, setUserStrategies] = useState<UserStrategy[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // form
  const [baseCode, setBaseCode] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("AAPL");
  const [budget, setBudget] = useState<number>(1000);

  const normalizedSymbol = useMemo(() => symbol.trim().toUpperCase(), [symbol]);

  const hasPreparing = useMemo(
    () =>
      userStrategies.some((s: any) => String(s?.status ?? "") === "PREPARING"),
    [userStrategies],
  );

  async function loadAll(uid: number) {
    setError(null);

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
    } catch (e: any) {
      setError(e?.message ?? "Failed to load strategies");
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
        setMessage(null);
        await loadAll(meData.id);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load /users/me");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [nav]); // eslint-disable-line react-hooks/exhaustive-deps

  // auto-refresh while any is PREPARING
  useEffect(() => {
    if (!userId) return;
    if (!hasPreparing) return;

    const t = setInterval(() => {
      void loadAll(userId);
    }, 3000);

    return () => clearInterval(t);
  }, [userId, hasPreparing]); // eslint-disable-line react-hooks/exhaustive-deps

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    const sym = normalizedSymbol;

    if (!baseCode || !name.trim() || !sym) {
      setError("Please select a base strategy, enter a name, and a symbol.");
      return;
    }

    if (!budget || Number.isNaN(Number(budget)) || Number(budget) <= 0) {
      setError("Budget must be greater than 0.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await createUserStrategy(userId, {
        baseStrategyCode: baseCode,
        name: name.trim(),
        symbol: sym,
        budget: Number(budget),
      });

      setMessage("Strategy created.");
      setName("");
      await loadAll(userId);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create strategy");
    } finally {
      setLoading(false);
    }
  };

  const onActivate = async (id: number) => {
    if (!userId) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await activateUserStrategy(userId, id);
      setMessage(
        "Activation requested. It may stay PREPARING for a short time.",
      );
      await loadAll(userId);
    } catch (e: any) {
      setError(e?.message ?? "Failed to activate strategy");
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async (id: number) => {
    if (!userId) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await deleteUserStrategy(userId, id);
      setMessage("Strategy deleted.");
      await loadAll(userId);
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete strategy");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-xl border bg-white p-6 shadow">
          <h1 className="text-2xl font-semibold">Strategies</h1>
          <p className="mt-2 text-sm text-gray-700">
            Create and activate trading strategies for{" "}
            <span className="font-medium">{me?.email ?? "..."}</span>
          </p>

          {hasPreparing && (
            <div className="mt-3 text-xs text-blue-700">
              One or more strategies are PREPARING — auto-refresh is running…
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

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-white p-6 shadow">
            <div className="text-sm font-semibold">Base strategies</div>
            {baseStrategies.length === 0 ? (
              <div className="mt-3 text-sm text-gray-600">
                No base strategies found.
              </div>
            ) : (
              <div className="mt-4 overflow-auto rounded-lg border">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {baseStrategies.map((s) => (
                      <tr key={s.code}>
                        <td className="px-4 py-3 font-mono text-xs">
                          {s.code}
                        </td>
                        <td className="px-4 py-3 font-medium">{s.name}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {s.description ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <form
            onSubmit={onCreate}
            className="rounded-xl border bg-white p-6 shadow"
          >
            <div className="text-sm font-semibold">Create user strategy</div>

            <label className="mt-4 block text-sm font-medium">
              Base strategy
            </label>
            <select
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={baseCode}
              onChange={(e) => setBaseCode(e.target.value)}
              disabled={loading || baseStrategies.length === 0}
            >
              {baseStrategies.length === 0 ? (
                <option value="">No base strategies</option>
              ) : (
                baseStrategies.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code} — {b.name}
                  </option>
                ))
              )}
            </select>

            <label className="mt-4 block text-sm font-medium">Name</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="strategy 1"
              required
            />

            <label className="mt-4 block text-sm font-medium">Symbol</label>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="AAPL"
              required
            />

            <label className="mt-4 block text-sm font-medium">
              Budget (USD)
            </label>
            <input
              type="number"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              value={budget}
              min={0.01}
              step={0.01}
              onChange={(e) => setBudget(Number(e.target.value))}
              required
            />
            <div className="mt-1 text-xs text-gray-500">
              Used by the strategy to limit how much it can trade.
            </div>

            <button
              disabled={loading || !userId || baseStrategies.length === 0}
              className="mt-5 rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {loading ? "Working..." : "Create strategy"}
            </button>
          </form>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Your strategies</div>
              <div className="mt-1 text-xs text-gray-600">
                Activate one to start producing orders.
              </div>
            </div>

            <button
              disabled={loading || !userId}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-60"
              onClick={() => userId && loadAll(userId)}
              type="button"
            >
              Refresh
            </button>
          </div>

          {userStrategies.length === 0 ? (
            <div className="mt-3 text-sm text-gray-600">
              You have no strategies yet. Create one above.
            </div>
          ) : (
            <div className="mt-4 overflow-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Base</th>
                    <th className="px-4 py-3">Symbol</th>
                    <th className="px-4 py-3">Budget</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {userStrategies.map((s: any) => {
                    const status = String(s?.status ?? "—");
                    const disableActivate =
                      loading || status === "ACTIVE" || status === "PREPARING";

                    return (
                      <tr key={s.id}>
                        <td className="px-4 py-3 font-mono text-xs">{s.id}</td>
                        <td className="px-4 py-3 font-medium">
                          {s.name ?? "—"}
                        </td>
                        <td className="px-4 py-3">{getBaseCode(s)}</td>
                        <td className="px-4 py-3">{s.symbol ?? "—"}</td>
                        <td className="px-4 py-3">{String(s.budget ?? "—")}</td>
                        <td className="px-4 py-3">
                          <Badge text={status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded-lg bg-black px-3 py-1.5 text-xs text-white disabled:opacity-60"
                              disabled={disableActivate}
                              onClick={() => void onActivate(s.id)}
                              type="button"
                            >
                              Activate
                            </button>

                            <button
                              className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-60"
                              disabled={loading}
                              onClick={() => void onDelete(s.id)}
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

        <div className="rounded-xl border bg-white p-6 shadow">
          <div className="text-sm font-semibold">Raw user strategies</div>
          <pre className="mt-3 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">
            {JSON.stringify(userStrategies, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
