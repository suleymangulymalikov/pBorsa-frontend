import { signOut } from "firebase/auth";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import { useAuth } from "../auth/AuthProvider";

export default function AppLayout() {
  const nav = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-white">
      <div className="border-b border-[#132033] bg-[#0b1422]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span className="text-[var(--accent)]">◆</span>
            pBorsa
          </div>
          <nav className="hidden items-center gap-6 text-sm text-[var(--muted)] md:flex">
            <button
              className={isActive("/") ? "text-white" : undefined}
              onClick={() => nav("/")}
            >
              Dashboard
            </button>
            <button
              className={isActive("/market") ? "text-white" : undefined}
              onClick={() => nav("/market")}
            >
              Market Data
            </button>
            <button
              className={isActive("/orders") ? "text-white" : undefined}
              onClick={() => nav("/orders")}
            >
              Orders
            </button>
            <button
              className={isActive("/positions") ? "text-white" : undefined}
              onClick={() => nav("/positions")}
            >
              Positions
            </button>
            <button
              className={isActive("/strategies") ? "text-white" : undefined}
              onClick={() => nav("/strategies")}
            >
              Strategies
            </button>
          </nav>
          <div className="relative">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-[#1f2e44] px-3 py-1.5 text-xs text-white">
                <span className="hidden sm:inline">
                  {user?.email ?? "Account"}
                </span>
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
      <Outlet />
    </div>
  );
}
