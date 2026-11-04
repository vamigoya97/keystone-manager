"use client";

import { useCallback, useState } from "react";
import { useAuthedFetch } from "@/lib/useAccess";

/** JSON calls to /api/admin/* with the operator's Privy token. Throws on non-2xx. */
export function useAdminApi() {
  const authedFetch = useAuthedFetch();
  return useCallback(
    async <T,>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> => {
      const { json, ...rest } = init;
      const res = await authedFetch(path, {
        ...rest,
        ...(json !== undefined
          ? { body: JSON.stringify(json), headers: { "Content-Type": "application/json" } }
          : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error((data as { error?: string }).error || `Request failed (${res.status})`);
        (err as Error & { status?: number }).status = res.status;
        throw err;
      }
      return data as T;
    },
    [authedFetch]
  );
}

export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
    });
  }, []);
  return { copy, copied };
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border-subtle bg-surface-raised p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h3 className="text-[13px] font-semibold tracking-wide">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  busy?: boolean;
};

export function Button({ variant = "ghost", busy, children, className = "", disabled, ...rest }: ButtonProps) {
  const styles = {
    primary: "bg-accent text-surface hover:brightness-110 font-semibold",
    ghost: "border border-border-default text-text-primary hover:bg-surface-elevated",
    danger: "border border-rose/30 text-rose hover:bg-rose-dim",
  }[variant];
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl px-4 text-[12px] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-text-secondary">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] text-text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:border-accent/60 focus:outline-none";

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "bad" | "warn"; children: React.ReactNode }) {
  const styles = {
    neutral: "bg-surface-elevated text-text-secondary",
    good: "bg-accent-dim text-accent",
    bad: "bg-rose-dim text-rose",
    warn: "bg-amber-dim text-amber",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${styles}`}>
      {children}
    </span>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "bad" | "warn"; children: React.ReactNode }) {
  const styles = {
    neutral: "border-border-subtle text-text-secondary",
    bad: "border-rose/30 bg-rose-dim text-rose",
    warn: "border-amber/30 bg-amber-dim text-amber",
  }[tone];
  return <div className={`rounded-xl border px-3.5 py-2.5 text-[12px] leading-relaxed ${styles}`}>{children}</div>;
}
