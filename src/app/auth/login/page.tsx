"use client";

import { ScanFace } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid credentials");
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-text-main p-4 selection:bg-primary/30">
      {/* Background Orbs */}
      <div className="fixed top-1/4 -left-20 w-80 h-80 bg-primary/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="fixed bottom-1/4 -right-20 w-80 h-80 bg-secondary/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="w-full max-w-[440px] p-10 space-y-10 bg-surface/40 backdrop-blur-3xl rounded-[3rem] shadow-premium border border-border-muted glass-card animate-in fade-in zoom-in-95 duration-500 relative overflow-hidden">
        {/* Top Glow */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20 shadow-glow rotate-3 hover:rotate-6 transition-transform">
            <ScanFace className="w-10 h-10 text-primary" />
          </div>
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-black tracking-tighter uppercase italic select-none">
              Manga<span className="text-primary text-glow">Lens</span>
            </h1>
            <p className="text-text-dark font-bold text-xs uppercase tracking-[0.2em]">
              Precision AI Translation
            </p>
          </div>
        </div>

        {error && (
          <div className="p-4 text-sm font-bold text-red-200 bg-red-500/10 border border-red-500/20 rounded-2xl animate-in slide-in-from-top-2 duration-300 flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase tracking-widest text-text-dark ml-1">
              Secret Email
            </label>
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-5 py-4 bg-surface-raised/50 border border-border-muted rounded-2xl focus:ring-2 focus:ring-primary focus:outline-none transition-all placeholder:text-text-dark/30 font-medium"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black uppercase tracking-widest text-text-dark ml-1">
              Secure Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-5 py-4 bg-surface-raised/50 border border-border-muted rounded-2xl focus:ring-2 focus:ring-primary focus:outline-none transition-all placeholder:text-text-dark/30 font-medium"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 font-black text-xs uppercase tracking-[0.2em] text-white bg-primary rounded-2xl hover:bg-primary-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 border border-primary/20"
          >
            {loading ? "Authenticating..." : "Establish Connection"}
          </button>
        </form>

        <div className="pt-4 text-center">
          <p className="text-[10px] font-black text-text-dark uppercase tracking-widest opacity-50">
            Unauthorized access is prohibited
          </p>
        </div>
      </div>
    </div>
  );
}
