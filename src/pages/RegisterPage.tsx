import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useState } from "react";
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // Optional: set display name
      if (displayName.trim()) {
        await updateProfile(cred.user, { displayName: displayName.trim() });
      }

      nav("/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border bg-white p-6 shadow"
      >
        <h1 className="text-2xl font-semibold">Create account</h1>
        <p className="mt-2 text-sm text-gray-600">
          Sign up to start using pBorsa.
        </p>

        <label className="mt-6 block text-sm font-medium">
          Username (optional)
        </label>
        <input
          className="mt-1 w-full rounded-lg border px-3 py-2"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. John Doe"
        />

        <label className="mt-4 block text-sm font-medium">Email</label>
        <input
          className="mt-1 w-full rounded-lg border px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          placeholder="you@example.com"
        />

        <label className="mt-4 block text-sm font-medium">Password</label>
        <input
          className="mt-1 w-full rounded-lg border px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
          placeholder="Create a strong password"
        />

        <label className="mt-4 block text-sm font-medium">
          Confirm password
        </label>
        <input
          className="mt-1 w-full rounded-lg border px-3 py-2"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          type="password"
          required
          placeholder="Repeat password"
        />

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {loading ? "Creating..." : "Create account"}
        </button>

        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link className="font-medium underline" to="/login">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
