"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { safeDestination } from "@/lib/safe-destination";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Loader2,
  ChevronDown,
  ArrowLeft,
  KeyRound,
  Clock,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ─── Constants ────────────────────────────────────────────────────────────────

const QUOTES = [
  "Excellence is not an act, but a habit.",
  "Precision in every detail, power in every action.",
  "Protocol is the invisible architecture of power.",
  "Command the room, secure the objective.",
  "The standard is perfection. We accept nothing less.",
];

const OSCAR_OPTIONS = [
  { value: "Command", label: "Command", sub: "HQ & Leadership" },
  { value: "Alpha Oscar", label: "Alpha Oscar", sub: "Eagle Square" },
  { value: "Compliance Oscar", label: "Compliance Oscar", sub: "Grooming & Dress Code" },
  { value: "November (Den)", label: "November (Den)", sub: "Lounge & Menus" },
  { value: "November (Nest)", label: "November (Nest)", sub: "Hotels, rooms & guest experience" },
  { value: "Serial Oscar", label: "Serial Oscar", sub: "Social Media" },
  { value: "Tango Oscar", label: "Tango Oscar", sub: "Transport" },
  { value: "Victor Oscar", label: "Victor Oscar", sub: "Theatre" },
  { value: "Welfare Oscar", label: "Welfare Oscar", sub: "Meals & Welfare" },
];

const TEAM_OPTIONS = [
  { value: "strength", label: "Team Strength" },
  { value: "wisdom", label: "Team Wisdom" },
  { value: "swift", label: "Team Swift" },
];

const LOGIN_REQUEST_TIMEOUT_MS = 12_000;
const RESET_STORAGE_KEY = "tcnp_reset_session";

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-semibold text-gray-300 mb-1.5 uppercase tracking-[0.15em]"
    >
      {children}
    </label>
  );
}

const INPUT_CLS =
  "w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-white placeholder-gray-400 text-base " +
  "focus:outline-none focus:ring-2 focus:ring-orange-500/60 focus:border-orange-500/40 focus:bg-white/8 " +
  "transition-all duration-200 shadow-inner";

function GlassInput({
  id,
  type = "text",
  value,
  onChange,
  required,
  placeholder,
  autoComplete,
  autoCapitalize,
  autoCorrect,
  spellCheck,
  inputMode,
  className = "",
  children,
}: {
  id: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  autoCapitalize?: string;
  autoCorrect?: string;
  spellCheck?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        spellCheck={spellCheck}
        inputMode={inputMode}
        className={`${INPUT_CLS} ${className}`}
      />
      {children}
    </div>
  );
}

function GlassSelect({
  id,
  value,
  onChange,
  required,
  children,
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={onChange}
        required={required}
        className={`${INPUT_CLS} appearance-none pr-10 cursor-pointer`}
        style={{ colorScheme: "dark" }}
      >
        {children}
      </select>
      <ChevronDown
        className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export type AuthMode =
  | "login"
  | "signup"
  | "request_reset"
  | "waiting_approval"
  | "reset_password"
  | "rejected";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [formNotice, setFormNotice] = useState("");
  const [mode, setMode] = useState<AuthMode>("login");

  // Signup fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role] = useState("viewer");
  const [oscar, setOscar] = useState("");
  const [team, setTeam] = useState("");

  // Password reset fields
  const [resetEmail, setResetEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetRequestId, setResetRequestId] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Rotating quote
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [quoteFading, setQuoteFading] = useState(false);

  const router = useRouter();

  const advanceQuote = useCallback(() => {
    setQuoteFading(true);
    setTimeout(() => {
      setQuoteIndex((i) => (i + 1) % QUOTES.length);
      setQuoteFading(false);
    }, 600);
  }, []);

  useEffect(() => {
    const id = setInterval(advanceQuote, 8000);
    return () => clearInterval(id);
  }, [advanceQuote]);

  // ─── Restore Active Reset Session on Mount ───────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(RESET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // Valid within 2 hours
      if (parsed.resetToken && parsed.timestamp && Date.now() - parsed.timestamp < 2 * 3600 * 1000) {
        setResetRequestId(parsed.requestId || "");
        setResetToken(parsed.resetToken);
        setResetEmail(parsed.email || "");

        // Check current status
        fetch(`/api/auth/reset-password/status?token=${encodeURIComponent(parsed.resetToken)}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.status === "approved") {
              setMode("reset_password");
            } else if (data.status === "pending") {
              setMode("waiting_approval");
            } else if (data.status === "rejected") {
              setRejectionReason(data.rejectionReason || "");
              setMode("rejected");
            } else {
              sessionStorage.removeItem(RESET_STORAGE_KEY);
            }
          })
          .catch(() => {});
      }
    } catch {
      // Ignore sessionStorage parsing issues
    }
  }, []);

  // ─── Realtime Listener & Polling for Reset Approval ─────────────────────────

  useEffect(() => {
    if (mode !== "waiting_approval" || !resetRequestId || !resetToken) return;

    let cancelled = false;
    const supabase = createClient();

    // 1. Supabase Realtime Channel
    let channel: any = null;
    if (supabase) {
      channel = supabase
        .channel(`password-reset:${resetRequestId}`)
        .on("broadcast", { event: "status_changed" }, (payload: any) => {
          if (cancelled) return;
          const status = payload.payload?.status;
          if (status === "approved") {
            toast.success("Request approved! Please set your new password.");
            setMode("reset_password");
          } else if (status === "rejected") {
            setRejectionReason(payload.payload?.reason || "");
            setMode("rejected");
          }
        })
        .subscribe();
    }

    // 2. Fallback Polling every 2.5s for 100% guarantee
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/reset-password/status?token=${encodeURIComponent(resetToken)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        if (data.status === "approved") {
          toast.success("Request approved! Please set your new password.");
          setMode("reset_password");
        } else if (data.status === "rejected") {
          setRejectionReason(data.rejectionReason || "");
          setMode("rejected");
        } else if (data.status === "expired") {
          setFormError("Your reset request has expired. Please submit a new request.");
          setMode("request_reset");
          sessionStorage.removeItem(RESET_STORAGE_KEY);
        }
      } catch {
        // Silent polling failure
      }
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [mode, resetRequestId, resetToken]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormNotice("");
    setLoading(true);
    let loginSuccess = false;
    let requestTimedOut = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      requestTimedOut = true;
      controller.abort();
    }, LOGIN_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Failed to login");
      }

      loginSuccess = true;
      toast.success("Signed in securely.");
      await new Promise((resolve) => setTimeout(resolve, 200));

      if (typeof window !== "undefined") {
        window.location.href = safeDestination(new URLSearchParams(window.location.search).get("next"));
      } else {
        router.replace("/dashboard");
      }
    } catch (err: any) {
      if (!loginSuccess) {
        const message =
          requestTimedOut
            ? "Sign-in is taking longer than expected. Check your connection and try again."
            : err?.message === "Failed to fetch"
            ? "Unable to reach the TCNP application server. Please refresh and try again."
            : err?.message || "Failed to login";
        setFormError(message);
        toast.error(message);
      }
    } finally {
      window.clearTimeout(timeout);
      if (!loginSuccess) setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    setFormError("");
    setFormNotice("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          full_name: fullName.trim(),
          phone: phone.trim() || undefined,
          role,
          oscar: oscar.trim() || undefined,
          team: team || undefined,
        }),
      });

      let data: any = {};
      const ct = res.headers.get("content-type");
      if (ct?.includes("application/json")) {
        data = await res.json();
      } else {
        throw new Error("The server could not process your request. Your entries are still here; please try again.");
      }

      if (!res.ok) throw new Error(data.error || "Failed to sign up");
      setFormNotice("Access requested. An administrator must approve your account before you can sign in.");
      setMode("login");
      setPassword("");
    } catch (err: any) {
      setFormError(
        err.message === "Failed to fetch"
          ? "Unable to reach the server. Your entries are still here; please try again."
          : err.message || "Registration failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = (resetEmail || email).trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes("@")) {
      setFormError("Please enter a valid email address.");
      return;
    }

    setFormError("");
    setFormNotice("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to request password reset.");
      }

      setResetEmail(targetEmail);
      setResetRequestId(data.requestId);
      setResetToken(data.resetToken);

      // Save in sessionStorage
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          RESET_STORAGE_KEY,
          JSON.stringify({
            requestId: data.requestId,
            resetToken: data.resetToken,
            email: targetEmail,
            timestamp: Date.now(),
          })
        );
      }

      if (data.status === "approved") {
        toast.success("Request approved! Please create your new password.");
        setMode("reset_password");
      } else {
        toast.info("Reset request sent to administrators.");
        setMode("waiting_approval");
      }
    } catch (err: any) {
      setFormError(err.message || "Unable to submit reset request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("Passwords do not match. Please re-enter.");
      return;
    }

    setFormError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: resetToken,
          newPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to reset password.");
      }

      // Explicitly sign out any existing session
      const supabase = createClient();
      if (supabase) {
        await supabase.auth.signOut();
      }

      // Clear reset session storage
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(RESET_STORAGE_KEY);
      }

      // Transition to login screen with success notice
      setMode("login");
      setEmail(resetEmail || email);
      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setResetToken("");
      setResetRequestId("");
      setFormNotice("Password reset successfully! Please sign in with your new password.");
      toast.success("Password reset successfully! Please sign in with your new password.");
    } catch (err: any) {
      setFormError(err.message || "Failed to update password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelReset = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(RESET_STORAGE_KEY);
    }
    setResetToken("");
    setResetRequestId("");
    setFormError("");
    setFormNotice("");
    setMode("login");
  };

  const switchToSignup = () => {
    setFormError("");
    setFormNotice("");
    setMode("signup");
  };

  const switchToLogin = () => {
    setFormError("");
    setFormNotice("");
    setMode("login");
  };

  const switchToReset = () => {
    setFormError("");
    setFormNotice("");
    setResetEmail(email.trim());
    setMode("request_reset");
  };

  const isResetFlow =
    mode === "request_reset" ||
    mode === "waiting_approval" ||
    mode === "reset_password" ||
    mode === "rejected";

  return (
    <main className="min-h-dvh flex items-center justify-center bg-gray-950 relative overflow-x-hidden overflow-y-auto py-6 selection:bg-orange-500/30">
      {/* Background Image — composited once, no JS animation */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <Image
          src="/tcnp_cinematic_bg.png"
          alt=""
          fill
          className="object-cover opacity-40 brightness-75 contrast-110"
          priority
          sizes="100vw"
        />
        {/* Gradient overlays — static, GPU-composited */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-gray-950/70 via-transparent to-gray-950/70" />
      </div>

      {/* Ambient light blobs */}
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
        <div
          className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full opacity-30"
          style={{
            background: "radial-gradient(circle, rgba(37,99,235,0.35) 0%, transparent 70%)",
            willChange: "transform",
            animation: "floatBlob1 18s ease-in-out infinite alternate",
          }}
        />
        <div
          className="absolute bottom-[-15%] right-[-10%] w-[55%] h-[55%] rounded-full opacity-25"
          style={{
            background: "radial-gradient(circle, rgba(234,88,12,0.3) 0%, transparent 70%)",
            willChange: "transform",
            animation: "floatBlob2 22s ease-in-out infinite alternate",
          }}
        />
      </div>

      {/* ── Main card ─────────────────────────────────────────────────────── */}
      <div className="w-full max-w-[420px] relative z-10 px-5 sm:px-4">
        <div
          className="rounded-[2rem] border border-white/10 p-6 sm:p-10 overflow-hidden"
          style={{
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.05), 0 32px 80px rgba(0,0,0,0.7), 0 8px 24px rgba(0,0,0,0.5)",
            animation: "cardEnter 0.5s cubic-bezier(0.16,1,0.3,1) both",
          }}
        >
          {/* Card inner glow */}
          <div
            className="absolute -top-32 -left-32 w-80 h-80 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(234,88,12,0.08) 0%, transparent 65%)" }}
            aria-hidden="true"
          />

          {/* ── Header ──────────────────────────────────────────────── */}
          <div className="text-center mb-6 relative z-10">
            <div className="flex justify-center mb-4">
              <div className="relative h-16 w-16 ring-1 ring-white/10 rounded-2xl overflow-hidden drop-shadow-[0_0_20px_rgba(255,255,255,0.25)]">
                <Image
                  src="/tcnp_logo.png"
                  alt="TCNP logo"
                  fill
                  sizes="64px"
                  className="object-contain p-1"
                  priority
                />
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white leading-none">
              TCN Protocol
            </h1>
            <p className="text-xs font-semibold tracking-[0.22em] text-orange-300/60 uppercase mt-1.5">
              Central Application
            </p>
          </div>

          {/* ── Top Navigation Bar for Reset Flow ────────────────────── */}
          {isResetFlow ? (
            <div className="flex items-center justify-between mb-6 pb-2.5 border-b border-white/10 relative z-10">
              <button
                type="button"
                onClick={switchToLogin}
                className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Sign In</span>
              </button>
              <span className="text-xs uppercase font-bold tracking-widest text-orange-400/90">
                Password Recovery
              </span>
            </div>
          ) : (
            /* ── Mode toggle tabs ─────────────────────────────────── */
            <div
              className="relative flex bg-white/5 rounded-2xl p-1 mb-7"
              role="tablist"
              aria-label="Authentication mode"
            >
              <div
                className="absolute inset-y-1 rounded-xl bg-white/10 border border-white/10 transition-all duration-300"
                style={{
                  left: mode === "login" ? "4px" : "50%",
                  right: mode === "login" ? "50%" : "4px",
                }}
                aria-hidden="true"
              />
              <button
                role="tab"
                aria-selected={mode === "login"}
                aria-controls="login-form"
                onClick={switchToLogin}
                className={`relative z-10 flex-1 py-2 text-xs font-semibold rounded-xl transition-colors duration-200 tracking-wide ${
                  mode === "login" ? "text-white" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Sign In
              </button>
              <button
                role="tab"
                aria-selected={mode === "signup"}
                aria-controls="signup-form"
                onClick={switchToSignup}
                className={`relative z-10 flex-1 py-2 text-xs font-semibold rounded-xl transition-colors duration-200 tracking-wide ${
                  mode === "signup" ? "text-white" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Request Access
              </button>
            </div>
          )}

          {/* ── 1. Login Form ─────────────────────────────────────────── */}
          {mode === "login" && (
            <form
              id="login-form"
              role="tabpanel"
              onSubmit={handleLogin}
              className="space-y-5 relative z-10"
              style={{ animation: "formEnter 0.3s cubic-bezier(0.16,1,0.3,1) both" }}
              noValidate
            >
              <div>
                <FieldLabel htmlFor="login-email">Email Address</FieldLabel>
                <GlassInput
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="email"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <FieldLabel htmlFor="login-password">Password</FieldLabel>
                  <button
                    type="button"
                    onClick={switchToReset}
                    className="text-xs text-orange-400/90 hover:text-orange-300 transition-colors focus-visible:outline-none focus-visible:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <GlassInput
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="pr-12"
                >
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-200 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </GlassInput>
              </div>

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="relative w-full flex items-center justify-center gap-2.5 overflow-hidden text-white font-bold py-3.5 px-4 rounded-xl transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60"
                style={{
                  background: "linear-gradient(135deg, #9a3412 0%, #c2410c 100%)",
                  boxShadow: loading ? "none" : "0 0 24px rgba(234,88,12,0.35), 0 4px 12px rgba(0,0,0,0.3)",
                }}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                <span className="relative z-10 uppercase tracking-widest text-xs">
                  {loading ? "Authenticating…" : "Sign In"}
                </span>
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={switchToReset}
                  className="text-xs text-orange-400/90 hover:text-orange-300 transition-colors underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-400 rounded px-1"
                >
                  Forgot your password? Request reset from Admin
                </button>
              </div>
            </form>
          )}

          {/* ── 2. Request Reset Form ───────────────────────────────── */}
          {mode === "request_reset" && (
            <form
              onSubmit={handleRequestReset}
              className="space-y-5 relative z-10"
              style={{ animation: "formEnter 0.3s cubic-bezier(0.16,1,0.3,1) both" }}
              noValidate
            >
              <div className="text-center space-y-1 mb-2">
                <div className="w-10 h-10 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center mx-auto text-orange-400 mb-2">
                  <KeyRound className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight">Request Password Reset</h2>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Enter your registered email address. A reset request will be dispatched to administrators for approval.
                </p>
              </div>

              <div>
                <FieldLabel htmlFor="reset-email">Your Registered Email</FieldLabel>
                <GlassInput
                  id="reset-email"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="email"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="relative w-full flex items-center justify-center gap-2.5 overflow-hidden text-white font-bold py-3.5 px-4 rounded-xl transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60"
                style={{
                  background: "linear-gradient(135deg, #9a3412 0%, #c2410c 100%)",
                  boxShadow: loading ? "none" : "0 0 24px rgba(234,88,12,0.35), 0 4px 12px rgba(0,0,0,0.3)",
                }}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                <span className="relative z-10 uppercase tracking-widest text-xs">
                  {loading ? "Submitting Request…" : "Request Reset from Admin"}
                </span>
              </button>

              <button
                type="button"
                onClick={switchToLogin}
                className="w-full text-center text-xs text-gray-400 hover:text-white transition-colors py-1"
              >
                Cancel and return to Sign In
              </button>
            </form>
          )}

          {/* ── 3. Waiting Approval View (Real-time Live Sync) ──────── */}
          {mode === "waiting_approval" && (
            <div
              className="space-y-6 relative z-10 text-center py-2"
              style={{ animation: "formEnter 0.3s cubic-bezier(0.16,1,0.3,1) both" }}
            >
              {/* Radar pulse animation */}
              <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                <div
                  className="absolute inset-0 rounded-full border-2 border-orange-500/30 animate-ping"
                  style={{ animationDuration: "3s" }}
                />
                <div
                  className="absolute inset-2 rounded-full border border-orange-500/50 animate-pulse"
                  style={{ animationDuration: "2s" }}
                />
                <div className="relative w-12 h-12 rounded-full bg-orange-500/20 border border-orange-500/50 flex items-center justify-center text-orange-400 shadow-[0_0_20px_rgba(234,88,12,0.4)]">
                  <Clock className="h-6 w-6 animate-pulse" />
                </div>
              </div>

              <div className="space-y-2">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Command Approval Pending
                </span>
                <h2 className="text-xl font-bold text-white tracking-tight">Request Dispatched</h2>
                <p className="text-xs text-gray-300 leading-relaxed px-2">
                  Your password reset request for{" "}
                  <strong className="text-orange-300 font-semibold">{resetEmail}</strong> has been sent to
                  administrators.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-left space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span>Live connection active</span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Keep this window open. As soon as an administrator approves your request, this screen will
                  automatically update to allow you to set your new password.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCancelReset}
                className="w-full text-center text-xs text-gray-500 hover:text-gray-300 transition-colors py-2 border border-white/10 rounded-xl hover:bg-white/5"
              >
                Cancel Request & Return to Sign In
              </button>
            </div>
          )}

          {/* ── 4. Set New Password Form (Approved) ─────────────────── */}
          {mode === "reset_password" && (
            <form
              onSubmit={handleConfirmReset}
              className="space-y-5 relative z-10"
              style={{ animation: "formEnter 0.3s cubic-bezier(0.16,1,0.3,1) both" }}
              noValidate
            >
              <div className="text-center space-y-1 mb-2">
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 mb-2">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Request Approved
                </span>
                <h2 className="text-xl font-bold text-white tracking-tight mt-1">Create New Password</h2>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Choose a new secure password for <strong className="text-white">{resetEmail}</strong>.
                </p>
              </div>

              <div>
                <FieldLabel htmlFor="new-password">New Password</FieldLabel>
                <GlassInput
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="Min. 6 characters"
                  autoComplete="new-password"
                  className="pr-12"
                >
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-200 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </GlassInput>
              </div>

              <div>
                <FieldLabel htmlFor="confirm-password">Confirm Password</FieldLabel>
                <GlassInput
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  className="pr-12"
                >
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-200 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </GlassInput>
              </div>

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="relative w-full flex items-center justify-center gap-2.5 overflow-hidden text-white font-bold py-3.5 px-4 rounded-xl transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60"
                style={{
                  background: "linear-gradient(135deg, #15803d 0%, #16a34a 100%)",
                  boxShadow: loading ? "none" : "0 0 24px rgba(22,163,74,0.35), 0 4px 12px rgba(0,0,0,0.3)",
                }}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                <span className="relative z-10 uppercase tracking-widest text-xs">
                  {loading ? "Updating Password…" : "Save New Password"}
                </span>
              </button>
            </form>
          )}

          {/* ── 5. Rejected View ────────────────────────────────────── */}
          {mode === "rejected" && (
            <div
              className="space-y-6 relative z-10 text-center py-2"
              style={{ animation: "formEnter 0.3s cubic-bezier(0.16,1,0.3,1) both" }}
            >
              <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
                <ShieldAlert className="h-6 w-6" />
              </div>

              <div className="space-y-2">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  Request Declined
                </span>
                <h2 className="text-xl font-bold text-white tracking-tight">Clearance Not Approved</h2>
                <p className="text-xs text-gray-300 leading-relaxed px-2">
                  An administrator has declined the reset request for{" "}
                  <strong className="text-white font-semibold">{resetEmail}</strong>.
                </p>
                {rejectionReason && (
                  <p className="mt-2 text-xs text-rose-300/90 bg-rose-950/40 border border-rose-500/20 p-2.5 rounded-lg">
                    Note: {rejectionReason}
                  </p>
                )}
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={switchToReset}
                  className="w-full text-center text-xs font-semibold uppercase tracking-wider py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white transition-colors"
                >
                  Submit Another Request
                </button>
                <button
                  type="button"
                  onClick={handleCancelReset}
                  className="w-full text-center text-xs text-gray-500 hover:text-gray-300 transition-colors py-2"
                >
                  Return to Sign In
                </button>
              </div>
            </div>
          )}

          {formError && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-red-400/40 bg-red-950/40 p-3 text-sm leading-6 text-red-100"
            >
              {formError}
            </p>
          )}

          {formNotice && (
            <p
              role="status"
              className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-3 text-sm leading-6 text-emerald-100 flex items-start gap-2"
            >
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              <span>{formNotice}</span>
            </p>
          )}

          {/* ── 6. Signup Form ────────────────────────────────────────── */}
          {mode === "signup" && (
            <form
              id="signup-form"
              role="tabpanel"
              onSubmit={handleSignup}
              className="space-y-4 relative z-10"
              style={{ animation: "formEnter 0.3s cubic-bezier(0.16,1,0.3,1) both" }}
              noValidate
            >
              {/* Row: name + phone */}
              <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
                <div>
                  <FieldLabel htmlFor="signup-name">Full Name</FieldLabel>
                  <GlassInput
                    id="signup-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    placeholder="Amina Okafor"
                    autoComplete="name"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="signup-phone">Phone</FieldLabel>
                  <GlassInput
                    id="signup-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+234 800 000 0000"
                    autoComplete="tel"
                    inputMode="tel"
                  />
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="signup-email">Email Address</FieldLabel>
                <GlassInput
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="email"
                />
              </div>

              <div>
                <FieldLabel htmlFor="signup-password">Password</FieldLabel>
                <GlassInput
                  id="signup-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Min. 6 characters"
                  autoComplete="new-password"
                  className="pr-12"
                >
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-200 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </GlassInput>
              </div>

              {/* Row: Oscar + Team */}
              <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
                <div>
                  <FieldLabel htmlFor="signup-oscar">Oscar Unit</FieldLabel>
                  <GlassSelect
                    id="signup-oscar"
                    value={oscar}
                    onChange={(e) => setOscar(e.target.value)}
                  >
                    <option value="" className="bg-gray-900 text-gray-400">
                      Select…
                    </option>
                    {OSCAR_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value} className="bg-gray-900 text-white">
                        {o.label}
                      </option>
                    ))}
                  </GlassSelect>
                </div>
                <div>
                  <FieldLabel htmlFor="signup-team">Team</FieldLabel>
                  <GlassSelect
                    id="signup-team"
                    value={team}
                    onChange={(e) => setTeam(e.target.value)}
                    required
                  >
                    <option value="" className="bg-gray-900 text-gray-400">
                      Select…
                    </option>
                    {TEAM_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value} className="bg-gray-900 text-white">
                        {t.label}
                      </option>
                    ))}
                  </GlassSelect>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="relative w-full flex items-center justify-center gap-2.5 overflow-hidden rounded-xl py-3.5 px-4 text-white font-bold transition-all duration-200 border border-white/15 hover:bg-white/15 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                <span className="uppercase tracking-widest text-xs">
                  {loading ? "Submitting…" : "Submit Request"}
                </span>
              </button>
            </form>
          )}

          {/* ── Footer ──────────────────────────────────────────────── */}
          <p className="mt-6 text-center text-xs text-gray-600 tracking-widest uppercase relative z-10">
            Command Center · Secure Access
          </p>
        </div>

        {/* Rotating quote */}
        <div className="mt-6 text-center px-6" aria-live="polite" aria-atomic="true">
          <p
            className="text-gray-500 text-xs italic leading-relaxed transition-opacity duration-500"
            style={{ opacity: quoteFading ? 0 : 0.7 }}
          >
            &ldquo;{QUOTES[quoteIndex]}&rdquo;
          </p>
        </div>
      </div>

      {/* ── CSS for keyframes ─────────────────────────────────────── */}
      <style>{`
        @keyframes cardEnter {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes formEnter {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatBlob1 {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(4%, 3%) scale(1.05); }
        }
        @keyframes floatBlob2 {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(-4%, -3%) scale(1.08); }
        }
      `}</style>
    </main>
  );
}
