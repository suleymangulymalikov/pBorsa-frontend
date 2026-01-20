import { onAuthStateChanged, signOut, getIdToken } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "../lib/firebase";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

async function copyIdToken() {
  const user = auth.currentUser;
  if (!user) return;

  const token = await getIdToken(user, true);
  await navigator.clipboard.writeText(token);
  alert("ID token copied to clipboard");
}

export default function DashboardPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [me, setMe] = useState<any>(null);
  const [meError, setMeError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        nav("/login", { replace: true });
        return;
      }

      setEmail(user.email);

      try {
        setMeError(null);
        const data = await api.get<any>("/api/v1/users/me");
        setMe(data);
      } catch (e: any) {
        setMeError(e?.message ?? "Failed to load /me");
      }
    });

    return () => unsub();
  }, [nav]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl rounded-xl border bg-white p-6 shadow">
        <h1 className="text-2xl font-semibold">Dashboard</h1>

        <p className="mt-2 text-gray-700">
          Firebase user: <span className="font-medium">{email ?? "..."}</span>
        </p>

        <div className="mt-6 rounded-xl border bg-gray-50 p-4">
          <div className="text-sm font-semibold">Backend /api/v1/users/me</div>

          {meError && (
            <div className="mt-2 text-sm text-red-700">Error: {meError}</div>
          )}

          {!meError && !me && (
            <div className="mt-2 text-sm text-gray-600">Loading...</div>
          )}

          {me && (
            <pre className="mt-2 overflow-auto rounded-lg bg-white p-3 text-xs">
              {JSON.stringify(me, null, 2)}
            </pre>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="rounded-lg bg-black px-4 py-2 text-sm text-white"
            onClick={() => nav("/credentials")}
          >
            Alpaca credentials
          </button>

          <button
            className="rounded-lg bg-black px-4 py-2 text-sm text-white"
            onClick={() => nav("/account")}
          >
            Account
          </button>

          <button
            className="rounded-lg bg-black px-4 py-2 text-sm text-white"
            onClick={() => nav("/positions")}
          >
            Positions
          </button>

          <button
            className="rounded-lg bg-black px-4 py-2 text-sm text-white"
            onClick={() => nav("/market")}
          >
            Market data
          </button>

          <button
            className="rounded-lg bg-black px-4 py-2 text-sm text-white"
            onClick={() => nav("/strategies")}
          >
            Strategies
          </button>

          <button
            className="rounded-lg bg-black px-4 py-2 text-sm text-white"
            onClick={() => nav("/orders")}
          >
            Orders
          </button>

          <button
            className="rounded-lg border px-4 py-2 text-sm"
            onClick={copyIdToken}
          >
            Copy Firebase ID token
          </button>

          <button
            className="rounded-lg border px-4 py-2 text-sm"
            onClick={() => signOut(auth)}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
