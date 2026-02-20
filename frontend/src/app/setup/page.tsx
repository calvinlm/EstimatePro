"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { postSetup, type SetupRequest } from "@/lib/api";
import { storeAuthSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormState = SetupRequest;
type FormErrors = Partial<Record<keyof FormState, string>>;

const INITIAL_FORM: FormState = {
  organizationName: "",
  adminFullName: "",
  adminEmail: "",
  password: "",
  confirmPassword: "",
};

function validateForm(values: FormState): FormErrors {
  const errors: FormErrors = {};

  if (!values.organizationName.trim()) {
    errors.organizationName = "Organization name is required";
  }

  if (!values.adminFullName.trim()) {
    errors.adminFullName = "Admin full name is required";
  }

  if (!values.adminEmail.trim()) {
    errors.adminEmail = "Admin email is required";
  } else if (!/^\S+@\S+\.\S+$/.test(values.adminEmail.trim())) {
    errors.adminEmail = "Enter a valid email address";
  }

  if (values.password.length < 8) {
    errors.password = "Password must be at least 8 characters";
  }

  if (values.confirmPassword.length < 8) {
    errors.confirmPassword = "Confirm password must be at least 8 characters";
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = "Passwords must match";
  }

  return errors;
}

export default function SetupPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasErrors = useMemo(() => Object.keys(errors).length > 0, [errors]);

  function updateField(field: keyof FormState, value: string): void {
    setForm((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => {
      if (!previous[field]) {
        return previous;
      }

      const next = { ...previous };
      delete next[field];
      return next;
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitError("");

    const validationErrors = validateForm(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await postSetup({
        organizationName: form.organizationName.trim(),
        adminFullName: form.adminFullName.trim(),
        adminEmail: form.adminEmail.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
      });

      storeAuthSession(result);

      router.replace("/");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Setup failed";
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--color-bg)] px-4 py-8 text-[var(--color-text)]">
      <section className="w-full max-w-lg rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl">
        <h1 className="text-2xl font-semibold">First-Run Setup</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Create your organization and first admin account to start using EstimatePro PH.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
          <div>
            <Label htmlFor="organizationName">Organization Name</Label>
            <Input
              id="organizationName"
              value={form.organizationName}
              onChange={(event) => updateField("organizationName", event.target.value)}
            />
            {errors.organizationName ? (
              <p className="mt-1 text-sm text-rose-600 dark:text-rose-300">{errors.organizationName}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="adminFullName">Admin Full Name</Label>
            <Input
              id="adminFullName"
              value={form.adminFullName}
              onChange={(event) => updateField("adminFullName", event.target.value)}
            />
            {errors.adminFullName ? (
              <p className="mt-1 text-sm text-rose-600 dark:text-rose-300">{errors.adminFullName}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="adminEmail">Admin Email</Label>
            <Input
              id="adminEmail"
              type="email"
              value={form.adminEmail}
              onChange={(event) => updateField("adminEmail", event.target.value)}
            />
            {errors.adminEmail ? (
              <p className="mt-1 text-sm text-rose-600 dark:text-rose-300">{errors.adminEmail}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
            />
            {errors.password ? (
              <p className="mt-1 text-sm text-rose-600 dark:text-rose-300">{errors.password}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={(event) => updateField("confirmPassword", event.target.value)}
            />
            {errors.confirmPassword ? (
              <p className="mt-1 text-sm text-rose-600 dark:text-rose-300">{errors.confirmPassword}</p>
            ) : null}
          </div>

          {submitError ? (
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">
              {submitError}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={isSubmitting || hasErrors}
            className="w-full"
          >
            {isSubmitting ? "Setting up..." : "Create Organization"}
          </Button>
        </form>
      </section>
    </main>
  );
}
