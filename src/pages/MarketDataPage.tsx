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

function buildSparkPath(values: number[], height = 72) {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = height - ((v - min) / span) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
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
        const errorMessage =
          e?.message || "Unable to load user information. Please try again.";
        setError(errorMessage);
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
      const errorMessage =
        e?.message || "Failed to load market data. Please try again.";
      setError(errorMessage);
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
      const errorMessage =
        e?.message || "Failed to load snapshot. Please try again.";
      setError(errorMessage);
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
      const errorMessage =
        e?.message || "Failed to start polling. Please try again.";
      setError(errorMessage);
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
      const errorMessage =
        e?.message || "Failed to stop polling. Please try again.";
      setError(errorMessage);
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
      const errorMessage =
        e?.message || "Failed to add symbols. Please try again.";
      setError(errorMessage);
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
      const errorMessage =
        e?.message || "Failed to remove symbols. Please try again.";
      setError(errorMessage);
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
      const errorMessage =
        e?.message || "Failed to load polled quotes. Please try again.";
      setError(errorMessage);
      setPolledQuotes([]);
    } finally {
      setLoading(false);
    }
  };

  const quoteSpread =
    quote?.askPrice !== undefined && quote?.bidPrice !== undefined
      ? quote.askPrice - quote.bidPrice
      : null;
  const sparkValues = useMemo(
    () =>
      bars
        .map((b) => (typeof b.close === "number" ? b.close : null))
        .filter((v): v is number => v !== null),
    [bars],
  );
  const sparkPath = useMemo(() => buildSparkPath(sparkValues), [sparkValues]);

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-white">
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">Market Data</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Quotes, bars, snapshots, and polling for{" "}
                <span className="text-white">{me?.email ?? "..."}</span>
              </p>
            </div>
          </div>

          <form onSubmit={onFetch} className="mt-5 flex flex-wrap gap-3">
            <input
              className="w-40 rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="AAPL"
            />

            <select
              className="rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
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
              className="w-28 rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
              value={limit}
              min={1}
              max={500}
              onChange={(e) => setLimit(Number(e.target.value))}
            />

            <button
              disabled={loading || !userId}
              className="rounded-lg bg-[#1f6feb] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Loading..." : "Fetch"}
            </button>
          </form>

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

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
            <div className="text-sm font-semibold">Quote</div>
            {quote ? (
              <div className="mt-4 grid gap-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Symbol</div>
                    <div className="mt-1 text-lg font-semibold">
                      {quote.symbol ?? normalizedSymbol}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Timestamp</div>
                    <div className="mt-1 text-sm">
                      {fmtTime(quote.timestamp)}
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Bid</div>
                    <div className="mt-1 text-lg font-semibold">
                      {fmtNum(quote.bidPrice)}
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      Size {fmtNum(quote.bidSize)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Ask</div>
                    <div className="mt-1 text-lg font-semibold">
                      {fmtNum(quote.askPrice)}
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      Size {fmtNum(quote.askSize)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Spread</div>
                    <div className="mt-1 text-lg font-semibold">
                      {quoteSpread === null ? "-" : fmtNum(quoteSpread)}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-[var(--muted)]">
                No quote loaded.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
            <div className="text-sm font-semibold">Bars</div>
            {bars.length === 0 ? (
              <div className="mt-3 text-sm text-[var(--muted)]">
                No bars loaded.
              </div>
            ) : (
              <>
                <div className="mt-4 rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Close trend</div>
                  <div className="mt-2 h-[90px] w-full">
                    {sparkPath ? (
                      <svg viewBox="0 0 100 72" className="h-full w-full">
                        <defs>
                          <linearGradient
                            id="sparkLine"
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                          >
                            <stop offset="0%" stopColor="#38bdf8" />
                            <stop offset="100%" stopColor="#22c55e" />
                          </linearGradient>
                        </defs>
                        <path
                          d={sparkPath}
                          fill="none"
                          stroke="url(#sparkLine)"
                          strokeWidth="2"
                        />
                      </svg>
                    ) : (
                      <div className="text-xs text-[var(--muted)]">
                        Not enough data for a chart.
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 max-h-[360px] overflow-auto rounded-lg border border-[#132033]">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[#0b1728] text-left text-xs text-[var(--muted)]">
                      <tr>
                        <th className="px-4 py-3">Time</th>
                        <th className="px-4 py-3">Open</th>
                        <th className="px-4 py-3">High</th>
                        <th className="px-4 py-3">Low</th>
                        <th className="px-4 py-3">Close</th>
                        <th className="px-4 py-3">Volume</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#132033]">
                      {bars.map((b, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3">{fmtTime(b.timestamp)}</td>
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
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Snapshot</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Quick view for multiple symbols.
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <input
                className="min-w-[260px] rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
                value={pollSymbols}
                onChange={(e) => setPollSymbols(e.target.value)}
                placeholder="AAPL,MSFT,NVDA"
              />
              <button
                disabled={
                  loading || !userId || normalizedPollSymbols.length === 0
                }
                className="rounded-lg bg-[#1f6feb] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => void onSnapshot()}
              >
                {loading ? "Loading..." : "Load snapshot"}
              </button>
            </div>
          </div>

          {snapshot ? (
            <>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Quotes</div>
                  <div className="mt-2 text-2xl font-semibold">
                    {(snapshot.quotes ?? []).length}
                  </div>
                </div>
                <div className="rounded-xl border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">
                    Latest trades
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {(snapshot.latestTrades ?? []).length}
                  </div>
                </div>
                <div className="rounded-xl border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Latest bars</div>
                  <div className="mt-2 text-2xl font-semibold">
                    {(snapshot.latestBars ?? []).length}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Quotes</div>
                  {(snapshot.quotes ?? []).length === 0 ? (
                    <div className="mt-2 text-xs text-[var(--muted)]">
                      No quotes in snapshot.
                    </div>
                  ) : (
                    <div className="mt-3 max-h-[200px] overflow-auto">
                      <table className="min-w-full text-xs">
                        <thead className="text-left text-[var(--muted)]">
                          <tr>
                            <th className="py-1 pr-2">Symbol</th>
                            <th className="py-1 pr-2">Bid</th>
                            <th className="py-1 pr-2">Ask</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#132033]">
                          {(snapshot.quotes ?? []).slice(0, 8).map((q, idx) => (
                            <tr key={`${q.symbol ?? "sym"}-${idx}`}>
                              <td className="py-1 pr-2 font-semibold">
                                {q.symbol ?? "-"}
                              </td>
                              <td className="py-1 pr-2">
                                {fmtNum(q.bidPrice)}
                              </td>
                              <td className="py-1 pr-2">
                                {fmtNum(q.askPrice)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">
                    Latest trades
                  </div>
                  {(snapshot.latestTrades ?? []).length === 0 ? (
                    <div className="mt-2 text-xs text-[var(--muted)]">
                      No trades in snapshot.
                    </div>
                  ) : (
                    <div className="mt-3 max-h-[200px] overflow-auto">
                      <table className="min-w-full text-xs">
                        <thead className="text-left text-[var(--muted)]">
                          <tr>
                            <th className="py-1 pr-2">Symbol</th>
                            <th className="py-1 pr-2">Price</th>
                            <th className="py-1 pr-2">Size</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#132033]">
                          {(snapshot.latestTrades ?? [])
                            .slice(0, 8)
                            .map((t, idx) => (
                              <tr key={`${t.symbol ?? "sym"}-${idx}`}>
                                <td className="py-1 pr-2 font-semibold">
                                  {t.symbol ?? "-"}
                                </td>
                                <td className="py-1 pr-2">{fmtNum(t.price)}</td>
                                <td className="py-1 pr-2">{fmtNum(t.size)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-[#132033] bg-[#0b1728] p-4">
                  <div className="text-xs text-[var(--muted)]">Latest bars</div>
                  {(snapshot.latestBars ?? []).length === 0 ? (
                    <div className="mt-2 text-xs text-[var(--muted)]">
                      No bars in snapshot.
                    </div>
                  ) : (
                    <div className="mt-3 max-h-[200px] overflow-auto">
                      <table className="min-w-full text-xs">
                        <thead className="text-left text-[var(--muted)]">
                          <tr>
                            <th className="py-1 pr-2">Symbol</th>
                            <th className="py-1 pr-2">Close</th>
                            <th className="py-1 pr-2">Vol</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#132033]">
                          {(snapshot.latestBars ?? [])
                            .slice(0, 8)
                            .map((b, idx) => (
                              <tr key={`${b.symbol ?? "sym"}-${idx}`}>
                                <td className="py-1 pr-2 font-semibold">
                                  {b.symbol ?? "-"}
                                </td>
                                <td className="py-1 pr-2">{fmtNum(b.close)}</td>
                                <td className="py-1 pr-2">
                                  {fmtNum(b.volume)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="mt-3 text-sm text-[var(--muted)]">
              No snapshot loaded.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Polling</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Keep polling a watchlist of symbols.
              </div>
            </div>
            <div
              className={
                polling
                  ? "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200"
                  : "rounded-full border border-[#1f2e44] bg-[#0b1728] px-3 py-1 text-xs text-[var(--muted)]"
              }
            >
              {polling ? "Running" : "Stopped"}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              className="min-w-[260px] rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
              value={pollSymbols}
              onChange={(e) => setPollSymbols(e.target.value)}
              placeholder="AAPL,MSFT,NVDA"
            />
            <input
              type="number"
              className="w-28 rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
              min={1}
              max={60}
              value={pollInterval}
              onChange={(e) => setPollInterval(Number(e.target.value))}
            />
            <button
              disabled={
                loading || !userId || normalizedPollSymbols.length === 0
              }
              className="rounded-lg bg-[#1f6feb] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void onStartPolling()}
            >
              Start
            </button>
            <button
              disabled={loading || !userId || !polling}
              className="rounded-lg border border-[#1f2e44] px-4 py-2 text-sm text-white disabled:opacity-60"
              onClick={() => void onStopPolling()}
            >
              Stop
            </button>
            <button
              disabled={
                loading || !userId || normalizedPollSymbols.length === 0
              }
              className="rounded-lg border border-[#1f2e44] px-4 py-2 text-sm text-white disabled:opacity-60"
              onClick={() => void onAddSymbols()}
            >
              Add symbols
            </button>
            <button
              disabled={
                loading || !userId || normalizedPollSymbols.length === 0
              }
              className="rounded-lg border border-[#1f2e44] px-4 py-2 text-sm text-white disabled:opacity-60"
              onClick={() => void onRemoveSymbols()}
            >
              Remove symbols
            </button>
            <button
              disabled={loading || !userId}
              className="rounded-lg border border-[#1f2e44] px-4 py-2 text-sm text-white disabled:opacity-60"
              onClick={() => void onFetchPolled()}
            >
              Fetch polled quotes
            </button>
          </div>

          {polledQuotes.length > 0 ? (
            <>
              <div className="mt-3 text-xs text-[var(--muted)]">
                Last update: {fmtTime(polledQuotes[0]?.timestamp)}
              </div>
              <div className="mt-3 max-h-[300px] overflow-auto rounded-lg border border-[#132033]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#0b1728] text-left text-xs text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-3">Symbol</th>
                      <th className="px-4 py-3">Bid</th>
                      <th className="px-4 py-3">Ask</th>
                      <th className="px-4 py-3">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#132033]">
                    {polledQuotes.map((q, idx) => (
                      <tr key={`${q.symbol ?? "sym"}-${idx}`}>
                        <td className="px-4 py-3 font-medium">
                          {q.symbol ?? "-"}
                        </td>
                        <td className="px-4 py-3">{fmtNum(q.bidPrice)}</td>
                        <td className="px-4 py-3">{fmtNum(q.askPrice)}</td>
                        <td className="px-4 py-3">{fmtTime(q.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="mt-3 text-sm text-[var(--muted)]">
              No polled quotes loaded.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
