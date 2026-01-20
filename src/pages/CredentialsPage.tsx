import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import { api } from "../api/client";
import {
  deactivateCredentials,
  getCredentialsStatus,
  registerCredentials,
} from "../api/credentials";

type MeResponse = {
  id: number;
  firebaseUid: string;
  email: string;
  displayName?: string | null;
  provider?: string | null;
};

export default function CredentialsPage() {
  const nav = useNavigate();

  const [me, setMe] = useState<MeResponse | null>(null);
  const userId = me?.id;

  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [paperTrading, setPaperTrading] = useState(true);

  const [hasCreds, setHasCreds] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadMeAndStatus(uid?: number) {
    if (!uid) return;
    try {
      setError(null);
      const status = await getCredentialsStatus(uid);
      setHasCreds(status);
    } catch (e: any) {
      setHasCreds(null);
      setError(e?.message ?? "Failed to load credentials status");
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
        // get the backend user (includes numeric userId)
        const data = await api.get<MeResponse>("/api/v1/users/me");
        setMe(data);
        await loadMeAndStatus(data.id);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load /users/me");
      }
    });

    return () => unsub();
  }, [nav]);

  const onRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await registerCredentials(userId, { apiKey, secretKey, paperTrading });
      setMessage("Credentials registered successfully.");
      setApiKey("");
      setSecretKey("");
      await loadMeAndStatus(userId);
    } catch (e: any) {
      setError(e?.message ?? "Failed to register credentials");
    } finally {
      setLoading(false);
    }
  };

  const onDeactivate = async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await deactivateCredentials(userId);
      setMessage("Credentials deactivated.");
      await loadMeAndStatus(userId);
    } catch (e: any) {
      setError(e?.message ?? "Failed to deactivate credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-xl border bg-white p-6 shadow">
          <h1 className="text-2xl font-semibold">Alpaca Credentials</h1>
          <p className="mt-2 text-sm text-gray-700">
            These keys let your backend connect to Alpaca to fetch account data
            and place trades (paper or live).
          </p>

          <div className="mt-4 rounded-lg border bg-gray-50 p-4 text-sm">
            <div className="font-semibold">Current status</div>
            <div className="mt-1">
              {hasCreds === null ? (
                <span className="text-gray-500">Loading...</span>
              ) : hasCreds ? (
                <span className="font-medium text-green-700">Connected</span>
              ) : (
                <span className="font-medium text-amber-700">Not set</span>
              )}
            </div>
            {me?.email && (
              <div className="mt-2 text-xs text-gray-600">
                Logged in as: <span className="font-medium">{me.email}</span>
              </div>
            )}
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

        <form
          onSubmit={onRegister}
          className="rounded-xl border bg-white p-6 shadow"
        >
          <div className="text-sm font-semibold">Register / update</div>

          <label className="mt-4 block text-sm font-medium">API key</label>
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            required
          />

          <label className="mt-4 block text-sm font-medium">Secret key</label>
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            autoComplete="off"
            required
          />

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={paperTrading}
              onChange={(e) => setPaperTrading(e.target.checked)}
            />
            Paper trading
          </label>

          <button
            disabled={loading || !userId}
            className="mt-5 rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {loading ? "Saving..." : "Save credentials"}
          </button>
        </form>

        <div className="rounded-xl border bg-white p-6 shadow">
          <div className="text-sm font-semibold">Deactivate</div>
          <div className="mt-1 text-sm text-gray-600">
            Soft-deactivates your keys (backend won’t use them anymore).
          </div>
          <button
            disabled={loading || !userId}
            className="mt-4 rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-60"
            onClick={() => void onDeactivate()}
            type="button"
          >
            Deactivate credentials
          </button>
        </div>
      </div>
    </div>
  );
}
