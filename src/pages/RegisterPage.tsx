import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";

export default function RegisterPage() {
  const nav = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordStrength = useMemo(() => {
    const val = password.trim();
    if (!val) {
      return { score: 0, label: "Weak", color: "bg-red-500", width: "w-1/12" };
    }

    let score = 0;
    if (val.length >= 8) score += 1;
    if (/[A-Z]/.test(val)) score += 1;
    if (/[0-9]/.test(val)) score += 1;
    if (/[^A-Za-z0-9]/.test(val)) score += 1;

    if (score <= 1) {
      return { score, label: "Weak", color: "bg-red-500", width: "w-1/4" };
    }
    if (score === 2) {
      return { score, label: "Fair", color: "bg-amber-500", width: "w-2/4" };
    }
    if (score === 3) {
      return { score, label: "Good", color: "bg-emerald-400", width: "w-3/4" };
    }
    return { score, label: "Strong", color: "bg-emerald-500", width: "w-full" };
  }, [password]);

  const passwordMismatch =
    password.length > 0 && confirm.length > 0 && password !== confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    if (passwordStrength.score <= 1) {
      setError("Password is too weak");
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // Optional: set display name
      if (displayName.trim()) {
        await updateProfile(cred.user, { displayName: displayName.trim() });
      }

      nav("/");
    } catch (err: any) {
      setError(err?.message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-white">
      <div className="min-h-screen px-6 py-12 lg:px-12">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6">
          <div className="text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-lg font-semibold hover:opacity-80 transition-opacity"
            >
              <span className="text-[var(--accent)]">◆</span>
              pBorsa
            </Link>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Automate your trading strategy. Sign up in seconds.
            </p>
          </div>

          <form
            onSubmit={onSubmit}
            className="w-full max-w-md rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-bg)] p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)]"
          >
            <h1 className="text-2xl font-semibold">Create Your Account</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Build your automated portfolio in minutes.
            </p>

            <label className="mt-6 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Username
            </label>
            <input
              className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white placeholder:text-[#6c7c95] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/60"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your username"
            />

            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Email Address
            </label>
            <input
              className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white placeholder:text-[#6c7c95] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/60"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              placeholder="Enter your email address"
            />

            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Password
            </label>
            <input
              className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white placeholder:text-[#6c7c95] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/60"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              placeholder="Create a strong password"
            />

            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[#1f2e44]">
              <div
                className={`h-full ${passwordStrength.width} ${passwordStrength.color}`}
              />
            </div>
            <div
              className={`mt-1 text-xs ${
                passwordStrength.label === "Weak"
                  ? "text-red-300"
                  : passwordStrength.label === "Fair"
                    ? "text-amber-300"
                    : "text-emerald-300"
              }`}
            >
              {passwordStrength.label}
            </div>

            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Confirm Password
            </label>
            <input
              className={`mt-2 w-full rounded-lg border bg-[#0b1728] px-3 py-2 text-sm text-white placeholder:text-[#6c7c95] focus:outline-none focus:ring-2 ${
                passwordMismatch
                  ? "border-red-500/60 focus:ring-red-400/60"
                  : "border-[#1f2e44] focus:ring-[var(--accent)]/60"
              }`}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              type="password"
              required
              placeholder="Confirm your password"
            />
            {passwordMismatch && (
              <div className="mt-2 text-xs text-red-300">
                Passwords do not match.
              </div>
            )}

            <label className="mt-4 flex items-start gap-2 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-[#1f2e44] bg-[#0b1728] text-[var(--accent)] focus:ring-[var(--accent)]/60"
                required
              />
              <span>
                I agree to the pBorsa{" "}
                <span className="text-white">Terms of Service</span> and{" "}
                <span className="text-white">Privacy Policy</span>.
              </span>
            </label>

            {error && (
              <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <button
              disabled={loading}
              className="mt-6 w-full rounded-lg bg-[#1f6feb] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(31,111,235,0.35)] disabled:opacity-60"
            >
              {loading ? "Creating..." : "Create Account"}
            </button>

            <div className="mt-6 text-center text-xs text-[var(--muted)]">
              Already have an account?{" "}
              <Link className="font-semibold text-white" to="/login">
                Log In
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
