"use client";

import { Eye, EyeOff, ScanFace } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { Button, Field, IconButton, Input } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      setError("Email or password is incorrect.");
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="screentone flex min-h-screen items-center justify-center bg-paper p-4 text-ink">
      <div className="w-full max-w-sm rounded-panel border border-line bg-page p-8 shadow-pop animate-pop-in">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <ScanFace aria-hidden="true" className="h-5 w-5 text-action" />
            <h1 className="text-xl font-semibold text-ink">MangaLens</h1>
          </div>
          <p className="text-sm text-ink-2">Sign in to your workspace</p>
        </div>

        <form onSubmit={handleLogin} className="mt-6 flex flex-col gap-4">
          {error && (
            <div
              role="alert"
              className="rounded-control border border-shu/40 bg-shu-soft px-3 py-2 text-sm text-shu"
            >
              {error}
            </div>
          )}

          <Field label="Email">
            {({ id }) => (
              <Input
                id={id}
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            )}
          </Field>

          <Field label="Password">
            {({ id }) => (
              <div className="relative">
                <Input
                  id={id}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <IconButton
                  label={showPassword ? "Hide password" : "Show password"}
                  size="sm"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-0.5 top-0.5"
                >
                  {showPassword ? <Eye /> : <EyeOff />}
                </IconButton>
              </div>
            )}
          </Field>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            full
            loading={loading}
            className="mt-2"
          >
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
