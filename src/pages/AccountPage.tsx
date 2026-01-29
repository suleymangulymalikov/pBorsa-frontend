import {
  EmailAuthProvider,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
} from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import { api } from "../api/client";

import type { AccountInfo } from "../api/account";
import {
  getAccountInfo,
  getPortfolioValue,
  getUnrealizedPnl,
  refreshAccountInfo,
} from "../api/account";
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

function fmtMoney(v: unknown) {
  if (v === null || v === undefined || v === "") return "-";
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
  const [hasCreds, setHasCreds] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [paperTrading, setPaperTrading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [missingAlpaca, setMissingAlpaca] = useState(false);
  const [section, setSection] = useState<
    "profile" | "portfolio" | "security" | "credentials" | "actions"
  >("profile");

  const canTrade = useMemo(() => {
    if (!account) return null;
    if (account.status && account.status !== "ACTIVE") return false;
    if (account.tradingBlocked) return false;
    if (account.accountBlocked) return false;
    if (account.tradeSuspendedByUser) return false;
    return true;
  }, [account]);

  function extractErrorMessage(error: any) {
    if (!error) return "Request failed";
    const raw =
      typeof error?.message === "string" ? error.message : String(error);
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed?.error === "string") return parsed.error;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  function isMissingAlpacaError(message: string) {
    return message.toLowerCase().includes("alpaca credentials not found");
  }

  async function loadAll(uid: number) {
    setLoading(true);
    setError(null);
    setMessage(null);
    setMissingAlpaca(false);

    try {
      const results = await Promise.allSettled([
        getAccountInfo(uid),
        getPortfolioValue(uid),
        getUnrealizedPnl(uid),
        getCredentialsStatus(uid),
      ]);

      const [accRes, pvRes, pnlRes, credsRes] = results;

      if (accRes.status === "fulfilled") {
        setAccount(accRes.value);
      } else {
        const msg = extractErrorMessage(accRes.reason);
        if (isMissingAlpacaError(msg)) setMissingAlpaca(true);
        else setError(msg);
        setAccount(null);
      }

      if (pvRes.status === "fulfilled") {
        setPortfolioValue(pvRes.value);
      } else {
        const msg = extractErrorMessage(pvRes.reason);
        if (isMissingAlpacaError(msg)) setMissingAlpaca(true);
        else setError(msg);
        setPortfolioValue(null);
      }

      if (pnlRes.status === "fulfilled") {
        setUnrealizedPnl(pnlRes.value);
      } else {
        const msg = extractErrorMessage(pnlRes.reason);
        if (isMissingAlpacaError(msg)) setMissingAlpaca(true);
        else setError(msg);
        setUnrealizedPnl(null);
      }

      if (credsRes.status === "fulfilled") {
        setHasCreds(credsRes.value);
      } else {
        const msg = extractErrorMessage(credsRes.reason);
        setError(msg);
        setHasCreds(null);
      }
    } catch (e: any) {
      setError(extractErrorMessage(e));
      setAccount(null);
      setPortfolioValue(null);
      setUnrealizedPnl(null);
      setHasCreds(null);
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
        const errorMessage =
          e?.message || "Unable to load user information. Please try again.";
        setError(errorMessage);
      }
    });

    return () => unsub();
  }, [nav]);

  const onRefresh = async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);
    setMessage(null);
    setMissingAlpaca(false);

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
      const msg = extractErrorMessage(e);
      if (isMissingAlpacaError(msg)) {
        setMissingAlpaca(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const onSaveCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await registerCredentials(userId, { apiKey, secretKey, paperTrading });
      setMessage("Alpaca credentials saved.");
      setApiKey("");
      setSecretKey("");
      const status = await getCredentialsStatus(userId);
      setHasCreds(status);
    } catch (e: any) {
      const errorMessage =
        e?.message ||
        "Failed to save credentials. Please check your API keys and try again.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const onDeactivateCreds = async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await deactivateCredentials(userId);
      setHasCreds(false);
      setMessage("Credentials deactivated.");
    } catch (e: any) {
      const errorMessage =
        e?.message || "Failed to deactivate credentials. Please try again.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const onChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);

    if (!me?.email) {
      setPasswordError("Email not available.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setPasswordError("Not authenticated.");
      return;
    }

    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(
        me.email,
        currentPassword,
      );
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setPasswordMessage("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (e: any) {
      const errorCode = e?.code;
      let errorMessage = "Failed to update password. Please try again.";

      if (
        errorCode === "auth/wrong-password" ||
        errorCode === "auth/invalid-credential"
      ) {
        errorMessage = "Current password is incorrect. Please try again.";
      } else if (errorCode === "auth/weak-password") {
        errorMessage =
          "New password is too weak. Please use a stronger password.";
      } else if (errorCode === "auth/requires-recent-login") {
        errorMessage =
          "Please log out and log in again before changing your password.";
      } else if (e?.message) {
        errorMessage = e.message;
      }

      setPasswordError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const onDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);
    setDeleteMessage(null);

    const user = auth.currentUser;
    if (!user || !me?.email) {
      setDeleteError("Not authenticated.");
      return;
    }
    if (!deletePassword) {
      setDeleteError("Please enter your password to confirm.");
      return;
    }

    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(me.email, deletePassword);
      await reauthenticateWithCredential(user, credential);
      await deleteUser(user);
      setDeleteMessage("Account deleted.");
      nav("/login");
    } catch (e: any) {
      const errorCode = e?.code;
      let errorMessage = "Failed to delete account. Please try again.";

      if (
        errorCode === "auth/wrong-password" ||
        errorCode === "auth/invalid-credential"
      ) {
        errorMessage = "Incorrect password. Please try again.";
      } else if (errorCode === "auth/requires-recent-login") {
        errorMessage =
          "Please log out and log in again before deleting your account.";
      } else if (e?.message) {
        errorMessage = e.message;
      }

      setDeleteError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Account Settings</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Manage your profile, Alpaca credentials, and portfolio summary.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onRefresh}
              disabled={loading || !userId}
              className="rounded-lg border border-[#1f2e44] px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {loading ? "Loading..." : "Refresh from Alpaca"}
            </button>
            <button
              onClick={() => signOut(auth)}
              className="rounded-lg border border-[#1f2e44] px-4 py-2 text-sm text-white"
            >
              Sign out
            </button>
          </div>
        </div>

        {message && (
          <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {message}
          </div>
        )}
        {missingAlpaca && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#1f2e44] bg-[#0b1728] p-4 text-sm text-[var(--muted)]">
            <div>
              <div className="text-white">Connect your Alpaca account.</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Add API keys to unlock portfolio data, positions, and P/L.
              </div>
            </div>
            <button
              className="rounded-lg bg-[#1f6feb] px-4 py-2 text-sm font-semibold text-white"
              onClick={() => setSection("credentials")}
            >
              Configure Alpaca
            </button>
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[240px_1fr]">
          <aside className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#132033] text-white">
                {me?.displayName?.[0]?.toUpperCase() ?? "U"}
              </div>
              <div>
                <div className="text-sm font-semibold">
                  {me?.displayName ?? "User"}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {me?.email ?? "Loading..."}
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-2 text-xs text-[var(--muted)]">
              {[
                { id: "profile", label: "Profile" },
                { id: "portfolio", label: "Portfolio" },
                { id: "security", label: "Security" },
                { id: "credentials", label: "Credentials" },
                { id: "actions", label: "Account Actions" },
              ].map((item) => (
                <button
                  key={item.id}
                  className={`w-full rounded-lg px-3 py-2 text-left ${
                    section === item.id
                      ? "bg-[#132033] text-white"
                      : "hover:bg-[#132033]/60"
                  }`}
                  onClick={() => setSection(item.id as typeof section)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </aside>

          <div className="space-y-6">
            {section === "profile" && (
              <section className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
                <div className="text-sm font-semibold">Profile</div>
                <div className="mt-2 text-xs text-[var(--muted)]">
                  Update your personal details.
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Full Name
                    </label>
                    <input
                      className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white opacity-80"
                      value={me?.displayName ?? ""}
                      readOnly
                      disabled
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Email Address
                    </label>
                    <input
                      className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white opacity-80"
                      value={me?.email ?? ""}
                      readOnly
                      disabled
                    />
                  </div>
                </div>
              </section>
            )}

            {section === "portfolio" && (
              <section className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
                <div className="text-sm font-semibold">Portfolio Snapshot</div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-[#1a2b45] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Cash</div>
                    <div className="mt-2 text-2xl font-semibold">
                      {fmtMoney(account?.cash)} {account?.currency ?? ""}
                    </div>
                    <div className="mt-2 text-xs text-[var(--muted)]">
                      Buying power: {fmtMoney(account?.buyingPower)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#1a2b45] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">Equity</div>
                    <div className="mt-2 text-2xl font-semibold">
                      {fmtMoney(account?.equity)} {account?.currency ?? ""}
                    </div>
                    <div className="mt-2 text-xs text-[var(--muted)]">
                      Last equity: {fmtMoney(account?.lastEquity)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#1a2b45] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">
                      Total Value
                    </div>
                    <div className="mt-2 text-2xl font-semibold">
                      {fmtMoney(portfolioValue)} {account?.currency ?? ""}
                    </div>
                    <div className="mt-2 text-xs text-[var(--muted)]">
                      Long MV: {fmtMoney(account?.longMarketValue)} | Short MV:{" "}
                      {fmtMoney(account?.shortMarketValue)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#1a2b45] bg-[#0b1728] p-4">
                    <div className="text-xs text-[var(--muted)]">
                      Unrealized P&L
                    </div>
                    <div className="mt-2 text-2xl font-semibold">
                      {fmtMoney(unrealizedPnl)} {account?.currency ?? ""}
                    </div>
                    <div className="mt-2 text-xs text-[var(--muted)]">
                      Can trade:{" "}
                      {canTrade === null ? (
                        "-"
                      ) : canTrade ? (
                        <span className="text-emerald-300">Yes</span>
                      ) : (
                        <span className="text-red-300">No</span>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {section === "security" && (
              <section className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
                <div className="text-sm font-semibold">Security</div>
                <div className="mt-2 text-xs text-[var(--muted)]">
                  Change your password for this account.
                </div>
                <form onSubmit={onChangePassword} className="mt-4 grid gap-4">
                  <div>
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Current Password
                    </label>
                    <input
                      className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        New Password
                      </label>
                      <input
                        className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Confirm Password
                      </label>
                      <input
                        className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  {passwordError && (
                    <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
                      {passwordError}
                    </div>
                  )}
                  {passwordMessage && (
                    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                      {passwordMessage}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="rounded-lg bg-[#1f6feb] px-4 py-2 text-xs font-semibold text-white"
                      disabled={loading}
                    >
                      Update Password
                    </button>
                  </div>
                </form>
              </section>
            )}

            {section === "credentials" && (
              <section className="rounded-2xl border border-[#132033] bg-[#0f1b2d] p-6">
                <div className="text-sm font-semibold">Alpaca Credentials</div>
                <div className="mt-2 text-xs text-[var(--muted)]">
                  Connect your Alpaca account to enable trading and market data.
                </div>
                <div className="mt-4 flex items-center gap-3 text-xs">
                  <span>Status:</span>
                  <span
                    className={`rounded-full px-2 py-0.5 ${
                      hasCreds
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-amber-500/10 text-amber-300"
                    }`}
                  >
                    {hasCreds ? "Connected" : "Not set"}
                  </span>
                </div>

                <form
                  onSubmit={onSaveCreds}
                  className="mt-5 grid gap-4 md:grid-cols-2"
                >
                  <div>
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      API Key
                    </label>
                    <input
                      className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wide text-[var(--muted)]">
                      Secret Key
                    </label>
                    <input
                      className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white"
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                      required
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <input
                      type="checkbox"
                      checked={paperTrading}
                      onChange={(e) => setPaperTrading(e.target.checked)}
                      className="h-4 w-4 rounded border-[#1f2e44] bg-[#0b1728] text-[var(--accent)] focus:ring-[var(--accent)]/60"
                    />
                    Paper trading
                  </label>
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      className="rounded-lg border border-[#1f2e44] px-3 py-2 text-xs text-white"
                      disabled={loading || !userId}
                      onClick={onDeactivateCreds}
                    >
                      Deactivate
                    </button>
                    <button
                      type="submit"
                      className="rounded-lg bg-[#1f6feb] px-4 py-2 text-xs font-semibold text-white"
                      disabled={loading || !userId}
                    >
                      Save Credentials
                    </button>
                  </div>
                </form>
              </section>
            )}

            {section === "actions" && (
              <section className="rounded-2xl border border-[#2a1a1a] bg-[#1a0f12] p-6">
                <div className="text-sm font-semibold text-red-300">
                  Account Actions
                </div>
                <div className="mt-2 text-xs text-red-200/70">
                  Deleting your account only removes the Firebase login.
                </div>
                <form onSubmit={onDeleteAccount} className="mt-4 space-y-3">
                  <input
                    className="w-full rounded-lg border border-red-500/40 bg-[#140b0d] px-3 py-2 text-sm text-red-100 placeholder:text-red-300/50"
                    type="password"
                    placeholder="Confirm password to delete"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    required
                  />
                  {deleteError && (
                    <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
                      {deleteError}
                    </div>
                  )}
                  {deleteMessage && (
                    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                      {deleteMessage}
                    </div>
                  )}
                  <button
                    className="rounded-lg border border-red-500/40 px-4 py-2 text-xs text-red-200"
                    disabled={loading}
                  >
                    Delete account
                  </button>
                </form>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
