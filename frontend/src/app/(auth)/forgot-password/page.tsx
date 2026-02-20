"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPassword } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await forgotPassword({ email: email.trim() });
    } finally {
      setIsSubmitted(true);
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-bg)] px-4 py-10">
      <section className="w-full max-w-md rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
          EstimatePro PH
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Forgot Password</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Enter your account email to request a password reset link.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Send Reset Link"}
          </Button>
        </form>

        {isSubmitted ? (
          <p className="mt-4 text-sm text-[var(--color-text-muted)]">
            If an account exists for that email, a reset link has been sent.
          </p>
        ) : null}

        <p className="mt-4 text-sm">
          <Link href="/login" className="font-medium text-[var(--color-accent-strong)] hover:underline">
            Back to login
          </Link>
        </p>
      </section>
    </main>
  );
}
