"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("delta_oscar");
  const [oscar, setOscar] = useState("");
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const [displayText, setDisplayText] = useState("Excellence is not an act, but a habit.");

  const router = useRouter();
  const supabase = createClient();

  const QUOTES = [
    "Excellence is not an act, but a habit.",
    "Precision in every detail, power in every action.",
    "Protocol is the invisible architecture of power.",
    "Command the room, secure the objective.",
    "The standard is perfection. We accept nothing less."
  ];

  // Soft Morphing Engine
  useEffect(() => {
    const interval = setInterval(() => {
      setIsFading(true);

      setTimeout(() => {
        const nextIndex = (quoteIndex + 1) % QUOTES.length;
        setDisplayText(QUOTES[nextIndex]);
        setQuoteIndex(nextIndex);
        setIsFading(false);
      }, 800); // 800ms fade out, swap, then fade back in

    }, 10000);
    return () => clearInterval(interval);
  }, [quoteIndex]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName, phone, role, oscar: oscar.trim() || undefined })
      });

      let data = {};
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error("Non-JSON API response:", text);
        throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      }

      if (!res.ok) throw new Error((data as any).error || "Failed to sign up");
      toast.success("Clearance requested successfully. Waiting for Admin approval.");
      setMode('login');
      setPassword('');
    } catch (err: any) {
      toast.error(err.message || "An error occurred during sign up.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    let loginSuccess = false;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      if (data.user) {
        loginSuccess = true;
        toast.success("Login successful!");

        // Small delay for iOS to process
        await new Promise(resolve => setTimeout(resolve, 200));

        // Use window.location for iOS Safari compatibility
        // This is more reliable than Next.js router on iOS
        if (typeof window !== 'undefined') {
          window.location.href = '/dashboard';
        } else {
          router.replace("/dashboard");
        }
      }
    } catch (error: any) {
      // Only show error if login was not successful
      if (!loginSuccess) {
        console.error("Login error:", error);

        let message = "Failed to login";
        if (error?.message === "Failed to fetch") {
          message = "Unable to connect to server. Please check your internet connection.";
        } else if (error?.message) {
          message = error.message;
        }

        toast.error(message);
      }
    } finally {
      if (!loginSuccess) setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 relative overflow-hidden selection:bg-orange-500/30">

      {/* Background cinematic action music mapping */}
      <audio src="/cinematic-action.mp3" autoPlay loop className="hidden" />

      {/* 1. Cinematic Wide Shot Background */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/tcnp_cinematic_bg.png"
          alt="TCNP Protocol Operations"
          fill
          className="object-cover opacity-[0.45] mix-blend-luminosity brightness-[0.8] contrast-[1.2]"
          priority
        />
        {/* Subtle slow pulsing vignette overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-gray-950/80 via-transparent to-gray-950/80" />
      </div>

      {/* 2. Abstract Neon Aurora Gradients */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-50 mix-blend-screen">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/30 blur-[130px] rounded-full animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-orange-600/20 blur-[150px] rounded-full hidden md:block animate-pulse" style={{ animationDuration: '12s' }} />
        <div className="absolute top-[30%] right-[10%] w-[30%] h-[30%] bg-purple-600/20 blur-[100px] rounded-full animate-pulse" style={{ animationDuration: '10s' }} />
      </div>

      {/* 3. The Login Card Container */}
      <div className="w-full max-w-md relative z-10 px-6 sm:px-4 animate-slide-up">
        <div className="bg-black/30 dark:bg-black/40 rounded-[2.5rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] border border-white/10 p-8 md:p-10 backdrop-blur-2xl ring-1 ring-white/5 overflow-hidden transition-all duration-500">

          {/* Internal ambient card glow */}
          <div className="absolute -top-32 -left-32 w-64 h-64 bg-orange-500/10 rounded-full blur-[80px] pointer-events-none" />

          {/* Header */}
          <div className="text-center mb-8 relative z-10">
            <div className="flex justify-center mb-4">
              <div className="relative h-20 w-20 drop-shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-transform duration-700 hover:scale-105">
                <Image src="/tcnp_logo.png" alt="TCNP Excellence" fill className="object-contain" priority />
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2 drop-shadow-lg">
              TCNP PLATFORM
            </h1>
            <p className="text-[11px] font-semibold tracking-[0.25em] text-orange-200/70 uppercase">
              Global Protocol Operations
            </p>
          </div>

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-6 relative z-10 animate-in fade-in zoom-in-95 duration-500">
              <div className="group">
                <label htmlFor="email" className="block text-xs font-medium text-gray-300 mb-2 uppercase tracking-wide">
                  Clearance Email
                </label>
                <input
                  id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="w-full px-5 py-4 rounded-xl border border-white/10 bg-white/5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-white/30 transition-all duration-300 shadow-inner"
                  placeholder="Enter email"
                />
              </div>

              <div className="group">
                <label htmlFor="password" className="block text-xs font-medium text-gray-300 mb-2 uppercase tracking-wide">
                  Security Key
                </label>
                <div className="relative">
                  <input
                    id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required
                    className="w-full px-5 py-4 rounded-xl border border-white/10 bg-white/5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-white/30 transition-all duration-300 shadow-inner pr-12"
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors duration-200 focus:outline-none z-10">
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 space-y-4">
                <button type="submit" disabled={loading} className="relative w-full group overflow-hidden bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-bold py-4 px-4 rounded-xl shadow-[0_0_20px_rgba(234,88,12,0.3)] hover:shadow-[0_0_30px_rgba(234,88,12,0.5)] transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed transform hover:-translate-y-0.5">
                  <span className="absolute top-0 -left-[100%] w-1/2 h-full bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-[-25deg] group-hover:animate-[shine_1s_ease-in-out_forwards]" />
                  <span className="relative z-10 uppercase tracking-widest text-sm text-shadow-sm">{loading ? 'Authenticating...' : 'Commence Operations'}</span>
                </button>
                <button type="button" onClick={() => setMode('signup')} className="w-full text-xs text-gray-400 hover:text-white transition-colors uppercase tracking-widest">
                  Request Clearance (Sign Up)
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4 relative z-10 animate-in fade-in zoom-in-95 duration-500">
              <div className="group">
                <label className="block text-xs font-medium text-gray-300 mb-1 uppercase tracking-wide">Official Name</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="John Doe" className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 shadow-inner" />
              </div>
              <div className="group">
                <label className="block text-xs font-medium text-gray-300 mb-1 uppercase tracking-wide">Clearance Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="Enter email" className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 shadow-inner" />
              </div>
              <div className="group">
                <label className="block text-xs font-medium text-gray-300 mb-1 uppercase tracking-wide">Security Key (Password)</label>
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 shadow-inner pr-12" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors duration-200 focus:outline-none z-10">
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              <div className="group">
                <label className="block text-xs font-medium text-gray-300 mb-1 uppercase tracking-wide">Oscar Callsign (Optional)</label>
                <div className="relative">
                  <select
                    value={oscar}
                    onChange={(e) => setOscar(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 shadow-inner appearance-none cursor-pointer"
                  >
                    <option value="" className="bg-gray-900 text-gray-400">Auto-generate based on name...</option>
                    <option value="Alpha Oscar" className="bg-gray-900 text-white">Alpha Oscar</option>
                    <option value="Delta Oscar" className="bg-gray-900 text-white">Delta Oscar</option>
                    <option value="Echo Oscar" className="bg-gray-900 text-white">Echo Oscar</option>
                    <option value="November Oscar" className="bg-gray-900 text-white">November Oscar</option>
                    <option value="Sierra Oscar" className="bg-gray-900 text-white">Sierra Oscar</option>
                    <option value="Tango Oscar" className="bg-gray-900 text-white">Tango Oscar</option>
                    <option value="Victor Oscar" className="bg-gray-900 text-white">Victor Oscar</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                  </div>
                </div>
              </div>

              <div className="pt-2 space-y-3">
                <button type="submit" disabled={loading} className="relative w-full group overflow-hidden bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold py-4 px-4 rounded-xl transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed">
                  <span className="relative z-10 uppercase tracking-widest text-sm text-shadow-sm">{loading ? 'Processing...' : 'Submit Clearance Request'}</span>
                </button>
                <button type="button" onClick={() => setMode('login')} className="w-full text-xs text-gray-400 hover:text-white transition-colors uppercase tracking-widest">
                  Back to Login
                </button>
              </div>
            </form>
          )}

          {/* Footer Insignia */}
          <div className="mt-8 text-center opacity-50 relative z-10">
            <p className="text-[10px] text-gray-400 tracking-wider">
              COMMAND CENTER
            </p>
          </div>
        </div>

        {/* Soft Morphing Quote */}
        <div className="mt-8 text-center px-4">
          <p className={`text-gray-400 text-sm italic serif mt-2 transition-opacity duration-700 ease-in-out ${isFading ? 'opacity-0' : 'opacity-80'}`}>
            "{displayText}"
          </p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes shine { 100% { left: 200%; } }
      `}} />
    </div>
  );
}
