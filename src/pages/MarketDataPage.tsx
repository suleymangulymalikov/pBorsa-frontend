import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import { api } from "../api/client";

import type { Bar, Period, Quote, Snapshot, Trade } from "../api/marketData";
import {
  addPollingSymbols,
  getBars,
  getPollingQuotes,
  getQuote,
  getSnapshot,
  removePollingSymbols,
  startPolling,
  stopPolling,
} from "../api/marketData";

type MeResponse = {
  id: number;
  firebaseUid: string;
  email: string;
  displayName?: string | null;
  provider?: string | null;
};

type UiTf = "1Min" | "5Min" | "15Min" | "1Hour" | "1Day";

function fmtNum(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function tfToBackend(tf: UiTf): { timeframe: number; period: Period } {
  switch (tf) {
    case "1Min":
      return { timeframe: 1, period: "MINUTE" };
    case "5Min":
      return { timeframe: 5, period: "MINUTE" };
    case "15Min":
      return { timeframe: 15, period: "MINUTE" };
    case "1Hour":
      return { timeframe: 1, period: "HOUR" };
    case "1Day":
    default:
      return { timeframe: 1, period: "DAY" };
  }
}

export default function MarketDataPage() {
  const nav = useNavigate();

  const [me, setMe] = useState<MeResponse | null>(null);
  const userId = me?.id ?? null;

  const [symbol, setSymbol] = useState("AAPL");
  const [uiTf, setUiTf] = useState<UiTf>("1Day");
  const [limit, setLimit] = useState(50);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const [pollSymbols, setPollSymbols] = useState("AAPL,MSFT");
  const [pollInterval, setPollInterval] = useState(5);
  const [polling, setPolling] = useState(false);
  const [polledQuotes, setPolledQuotes] = useState<Quote[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const normalizedSymbol = useMemo(() => symbol.trim().toUpperCase(), [symbol]);
  const normalizedPollSymbols = useMemo(
    () =>
      pollSymbols
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    [pollSymbols],
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        nav("/login", { replace: true });
        return;
      }

      try {
        setError(null);
        const data = await api.get<MeResponse>("/api/v1/users/me");
        setMe(data);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load /users/me");
      }
    });

    return () => unsub();
  }, [nav]);

  const onFetch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!userId) return;

    const sym = normalizedSymbol;
    if (!sym) return;

    const { timeframe, period } = tfToBackend(uiTf);

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const [q, b] = await Promise.all([
        getQuote(userId, sym),
        getBars(userId, sym, timeframe, period, limit),
      ]);

      setQuote(q);
      setBars(Array.isArray(b) ? b : []);
      setMessage(`Loaded market data for ${sym}.`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load market data");
      setQuote(null);
      setBars([]);
    } finally {
      setLoading(false);
    }
  };

  const onSnapshot = async () => {
    if (!userId) return;
    if (normalizedPollSymbols.length === 0) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const data = await getSnapshot(userId, normalizedPollSymbols);
      setSnapshot(data);
      setMessage("Snapshot loaded.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load snapshot");
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  };

  const onStartPolling = async () => {
    if (!userId) return;
    if (normalizedPollSymbols.length === 0) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await startPolling(userId, normalizedPollSymbols, pollInterval);
      setPolling(true);
      setMessage("Polling started.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to start polling");
    } finally {
      setLoading(false);
    }
  };

  const onStopPolling = async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await stopPolling(userId);
      setPolling(false);
      setMessage("Polling stopped.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to stop polling");
    } finally {
      setLoading(false);
    }
  };

  const onAddSymbols = async () => {
    if (!userId) return;
    if (normalizedPollSymbols.length === 0) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await addPollingSymbols(userId, normalizedPollSymbols);
      setMessage("Symbols added to polling.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to add symbols");
    } finally {
      setLoading(false);
    }
  };

  const onRemoveSymbols = async () => {
    if (!userId) return;
    if (normalizedPollSymbols.length === 0) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await removePollingSymbols(userId, normalizedPollSymbols);
      setMessage("Symbols removed from polling.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to remove symbols");
    } finally {
      setLoading(false);
    }
  };

  const onFetchPolled = async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const data = await getPollingQuotes(userId);
      setPolledQuotes(Array.isArray(data) ? data : []);
      setMessage("Polled quotes loaded.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load polled quotes");
      setPolledQuotes([]);
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
              <h1 className="text-2xl font-semibold">Market Data</h1>
              <p className="mt-2 text-sm text-gray-700">
                Quote + historical bars for{" "}
                <span className="font-medium">{me?.email ?? "..."}</span>
              </p>
            </div>
          </div>

          <form onSubmit={onFetch} className="mt-5 flex flex-wrap gap-3">
            <input
              className="w-40 rounded-lg border px-3 py-2 text-sm"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="AAPL"
            />

            <select
              className="rounded-lg border px-3 py-2 text-sm"
              value={uiTf}
              onChange={(e) => setUiTf(e.target.value as UiTf)}
            >
              <option value="1Min">1Min</option>
              <option value="5Min">5Min</option>
              <option value="15Min">15Min</option>
              <option value="1Hour">1Hour</option>
              <option value="1Day">1Day</option>
            </select>

            <input
              type="number"
              className="w-28 rounded-lg border px-3 py-2 text-sm"
              value={limit}
              min={1}
              max={500}
              onChange={(e) => setLimit(Number(e.target.value))}
            />

            <button
              disabled={loading || !userId}
              className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {loading ? "Loading..." : "Fetch"}
            </button>
          </form>

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
            <div className="text-sm font-semibold">Quote</div>
            {quote ? (
              <div className="mt-3 space-y-2 text-sm">
                <div>
                  <span className="text-gray-600">Symbol:</span>{" "}
                  <span className="font-medium">
                    {quote.symbol ?? normalizedSymbol}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Bid:</span>{" "}
                  <span className="font-medium">{fmtNum(quote.bidPrice)}</span>{" "}
                  <span className="text-gray-500">
                    ({fmtNum(quote.bidSize)})
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Ask:</span>{" "}
                  <span className="font-medium">{fmtNum(quote.askPrice)}</span>{" "}
                  <span className="text-gray-500">
                    ({fmtNum(quote.askSize)})
                  </span>
                </div>

                <pre className="mt-3 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">
                  {JSON.stringify(quote, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="mt-3 text-sm text-gray-600">No quote loaded.</div>
            )}
          </div>

          <div className="rounded-xl border bg-white p-6 shadow">
            <div className="text-sm font-semibold">Bars</div>
            {bars.length === 0 ? (
              <div className="mt-3 text-sm text-gray-600">No bars loaded.</div>
            ) : (
              <div className="mt-4 overflow-auto rounded-lg border">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Open</th>
                      <th className="px-4 py-3">High</th>
                      <th className="px-4 py-3">Low</th>
                      <th className="px-4 py-3">Close</th>
                      <th className="px-4 py-3">Volume</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {bars.map((b, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3">
                          {b.timestamp ? String(b.timestamp) : "—"}
                        </td>
                        <td className="px-4 py-3">{fmtNum(b.open)}</td>
                        <td className="px-4 py-3">{fmtNum(b.high)}</td>
                        <td className="px-4 py-3">{fmtNum(b.low)}</td>
                        <td className="px-4 py-3">{fmtNum(b.close)}</td>
                        <td className="px-4 py-3">{fmtNum(b.volume)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow">
          <div className="text-sm font-semibold">Snapshot</div>
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              className="min-w-[260px] rounded-lg border px-3 py-2 text-sm"
              value={pollSymbols}
              onChange={(e) => setPollSymbols(e.target.value)}
              placeholder="AAPL,MSFT,NVDA"
            />
            <button
              disabled={loading || !userId || normalizedPollSymbols.length === 0}
              className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
              onClick={() => void onSnapshot()}
            >
              {loading ? "Loading..." : "Load snapshot"}
            </button>
          </div>

          {snapshot ? (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs font-semibold text-gray-600">
                  Quotes
                </div>
                <div className="mt-2 text-sm">
                  {(snapshot.quotes ?? []).length} items
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs font-semibold text-gray-600">
                  Latest trades
                </div>
                <div className="mt-2 text-sm">
                  {(snapshot.latestTrades ?? []).length} items
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs font-semibold text-gray-600">
                  Latest bars
                </div>
                <div className="mt-2 text-sm">
                  {(snapshot.latestBars ?? []).length} items
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-gray-600">No snapshot loaded.</div>
          )}

          {snapshot && (
            <pre className="mt-4 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">
              {JSON.stringify(snapshot, null, 2)}
            </pre>
          )}
        </div>

        <div className="rounded-xl border bg-white p-6 shadow">
          <div className="text-sm font-semibold">Polling</div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              className="min-w-[260px] rounded-lg border px-3 py-2 text-sm"
              value={pollSymbols}
              onChange={(e) => setPollSymbols(e.target.value)}
              placeholder="AAPL,MSFT,NVDA"
            />
            <input
              type="number"
              className="w-28 rounded-lg border px-3 py-2 text-sm"
              min={1}
              max={60}
              value={pollInterval}
              onChange={(e) => setPollInterval(Number(e.target.value))}
            />
            <button
              disabled={loading || !userId || normalizedPollSymbols.length === 0}
              className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
              onClick={() => void onStartPolling()}
            >
              Start
            </button>
            <button
              disabled={loading || !userId || !polling}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-60"
              onClick={() => void onStopPolling()}
            >
              Stop
            </button>
            <button
              disabled={loading || !userId || normalizedPollSymbols.length === 0}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-60"
              onClick={() => void onAddSymbols()}
            >
              Add symbols
            </button>
            <button
              disabled={loading || !userId || normalizedPollSymbols.length === 0}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-60"
              onClick={() => void onRemoveSymbols()}
            >
              Remove symbols
            </button>
            <button
              disabled={loading || !userId}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-60"
              onClick={() => void onFetchPolled()}
            >
              Fetch polled quotes
            </button>
          </div>

          <div className="mt-3 text-xs text-gray-600">
            Status: {polling ? "Running" : "Stopped"}
          </div>

          {polledQuotes.length > 0 ? (
            <div className="mt-4 overflow-auto rounded-lg border">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3">Symbol</th>
                    <th className="px-4 py-3">Bid</th>
                    <th className="px-4 py-3">Ask</th>
                    <th className="px-4 py-3">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {polledQuotes.map((q, idx) => (
                    <tr key={`${q.symbol ?? "sym"}-${idx}`}>
                      <td className="px-4 py-3 font-medium">
                        {q.symbol ?? "-"}
                      </td>
                      <td className="px-4 py-3">{fmtNum(q.bidPrice)}</td>
                      <td className="px-4 py-3">{fmtNum(q.askPrice)}</td>
                      <td className="px-4 py-3">
                        {q.timestamp ? String(q.timestamp) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-3 text-sm text-gray-600">
              No polled quotes loaded.
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-6 shadow">
          <div className="text-sm font-semibold">Raw bars data</div>
          <pre className="mt-3 overflow-auto rounded-lg bg-gray-50 p-3 text-xs">
            {JSON.stringify(bars, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
