"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/lib/api";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage("");

    if (!token) {
      setErrorMessage("Reset token is missing or invalid.");
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords must match.");
      return;
    }

    setIsSubmitting(true);

    try {
      await resetPassword({
        token,
        newPassword,
        confirmPassword,
      });
      setIsSuccess(true);
      setTimeout(() => {
        router.replace("/login");
      }, 1200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reset failed";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-bg)] px-4 py-10">
      <section className="w-full max-w-md rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
          EstimatePro PH
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Reset Password</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Set a new password to restore access to your account.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
          <div>
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div>
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          {errorMessage ? (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">
              {errorMessage}
            </p>
          ) : null}
          {isSuccess ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              Password reset successful. Redirecting to login...
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={isSubmitting || isSuccess}>
            {isSubmitting ? "Resetting..." : "Reset Password"}
          </Button>
        </form>

        <p className="mt-4 text-sm">
          <Link href="/login" className="font-medium text-[var(--color-accent-strong)] hover:underline">
            Back to login
          </Link>
        </p>
      </section>
    </main>
  );
}
