import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";

export default function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      nav("/");
    } catch (err: any) {
      setError(err?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-white">
      <div className="min-h-screen lg:grid lg:grid-cols-2">
        <section
          className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex"
          style={{
            background:
              "linear-gradient(135deg, #4b4b4b 0%, #3d4b5f 45%, #1a2c41 100%)",
          }}
        >
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 right-10 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <span className="text-[var(--accent)]">↗</span>
              pBorsa
            </div>
            <h1 className="mt-16 text-4xl font-semibold leading-tight">
              Harness the Power of
              <br />
              Data.
            </h1>
            <p className="mt-4 max-w-sm text-sm text-white/70">
              Algorithmic trading, simplified. Log in to access your portfolio,
              strategies, and live market tools.
            </p>
          </div>
          <div className="relative z-10 text-xs text-white/50">
            Built for research, speed, and clarity.
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-12 lg:px-12">
          <div className="w-full max-w-md">
            <div className="mb-6 lg:hidden">
              <div className="text-lg font-semibold text-white">pBorsa</div>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Log in to access your trading workspace.
              </p>
            </div>

            <form
              onSubmit={onSubmit}
              className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-bg)] p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)]"
            >
              <h1 className="text-2xl font-semibold">Welcome Back</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Use your email and password to sign in.
              </p>

              <label className="mt-6 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Email Address
              </label>
              <input
                className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white placeholder:text-[#6c7c95] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/60"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="Enter your email"
                required
              />

              <div className="mt-5 flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Password
                </label>
              </div>
              <input
                className="mt-2 w-full rounded-lg border border-[#1f2e44] bg-[#0b1728] px-3 py-2 text-sm text-white placeholder:text-[#6c7c95] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/60"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="Enter your password"
                required
              />

              {error && (
                <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <button
                disabled={loading}
                className="mt-6 w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#04210f] shadow-[0_10px_30px_rgba(46,204,113,0.35)] disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Log In"}
              </button>

              <div className="mt-6 text-center text-xs text-[var(--muted)]">
                New to pBorsa?{" "}
                <Link className="font-semibold text-white" to="/register">
                  Create an account
                </Link>
              </div>

              <div className="mt-8 flex justify-center gap-4 text-[10px] text-[var(--muted)]"></div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
