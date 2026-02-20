"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { postSetup, type SetupRequest } from "@/lib/api";
import { storeTokenPair } from "@/lib/auth";

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

      storeTokenPair({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });

      router.replace("/");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Setup failed";
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8 text-slate-100">
      <section className="w-full max-w-lg rounded-lg border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
        <h1 className="text-2xl font-semibold">First-Run Setup</h1>
        <p className="mt-2 text-sm text-slate-300">
          Create your organization and first admin account to start using EstimatePro PH.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
          <div>
            <label htmlFor="organizationName" className="mb-1 block text-sm font-medium">
              Organization Name
            </label>
            <input
              id="organizationName"
              value={form.organizationName}
              onChange={(event) => updateField("organizationName", event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-offset-2 focus:border-slate-500 focus:ring-2 focus:ring-slate-500"
            />
            {errors.organizationName ? (
              <p className="mt-1 text-sm text-rose-400">{errors.organizationName}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="adminFullName" className="mb-1 block text-sm font-medium">
              Admin Full Name
            </label>
            <input
              id="adminFullName"
              value={form.adminFullName}
              onChange={(event) => updateField("adminFullName", event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-offset-2 focus:border-slate-500 focus:ring-2 focus:ring-slate-500"
            />
            {errors.adminFullName ? (
              <p className="mt-1 text-sm text-rose-400">{errors.adminFullName}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="adminEmail" className="mb-1 block text-sm font-medium">
              Admin Email
            </label>
            <input
              id="adminEmail"
              type="email"
              value={form.adminEmail}
              onChange={(event) => updateField("adminEmail", event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-offset-2 focus:border-slate-500 focus:ring-2 focus:ring-slate-500"
            />
            {errors.adminEmail ? <p className="mt-1 text-sm text-rose-400">{errors.adminEmail}</p> : null}
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-offset-2 focus:border-slate-500 focus:ring-2 focus:ring-slate-500"
            />
            {errors.password ? <p className="mt-1 text-sm text-rose-400">{errors.password}</p> : null}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={(event) => updateField("confirmPassword", event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-offset-2 focus:border-slate-500 focus:ring-2 focus:ring-slate-500"
            />
            {errors.confirmPassword ? (
              <p className="mt-1 text-sm text-rose-400">{errors.confirmPassword}</p>
            ) : null}
          </div>

          {submitError ? <p className="text-sm text-rose-400">{submitError}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting || hasErrors}
            className="w-full rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Setting up..." : "Create Organization"}
          </button>
        </form>
      </section>
    </main>
  );
}
