import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { ApiError } from "@buildguard/api-client";
import { api } from "../api";
import { useAuth } from "../auth";

export function LoginPage() {
  const { token, login } = useAuth();
  const [email, setEmail] = useState("owner@buildguard.dev");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (token) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.loginCustomer({ email, password });
      login(res.accessToken, res.user);
    } catch (err) {
      setError(err instanceof ApiError ? "Invalid email or password." : "Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="logo">
          Build<span>Guard</span>
        </div>
        <p className="sub">Sign in to monitor your project</p>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
