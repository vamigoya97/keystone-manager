"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { useAuthedFetch } from "@/lib/useAccess";
import { cn } from "@/lib/utils";
import { Alert as UiAlert, AlertDescription } from "@/components/ui/alert";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button as UiButton } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type AdminApi = <T>(path: string, init?: RequestInit & { json?: unknown }) => Promise<T>;

/**
 * Replaces the console's API calls, e.g. the design lab's sandbox, which
 * serves sample data and saves nothing. Unset in the real console.
 */
export const AdminApiOverride = createContext<AdminApi | null>(null);

/** JSON calls to /api/admin/* with the operator's Privy token. Throws on non-2xx. */
export function useAdminApi(): AdminApi {
  const override = useContext(AdminApiOverride);
  const authedFetch = useAuthedFetch();
  const real = useCallback(
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
  return override ?? real;
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

/**
 * The console's building blocks, all shadcn/ui (components/ui). The console
 * renders inside a "dark kit-shadcn" wrapper (ConsoleRoot), where shadcn's
 * dark neutral theme applies (app/globals.css).
 */

/** Wraps the console so shadcn/ui's theme applies to it and to its pop-ups. */
export function ConsoleRoot({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("dark kit-shadcn min-h-[100dvh] bg-background text-foreground antialiased", className)}>{children}</div>;
}

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
    <Card className={cn("gap-4 px-6", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3">
          {title && <CardTitle className="text-sm">{title}</CardTitle>}
          {action}
        </div>
      )}
      {children}
    </Card>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  busy?: boolean;
};

/** primary → shadcn default, ghost → outline, danger → outline in the destructive color. */
export function Button({ variant = "ghost", busy, children, className = "", disabled, ...rest }: ButtonProps) {
  return (
    <UiButton
      {...rest}
      size="sm"
      variant={variant === "primary" ? "default" : "outline"}
      disabled={disabled || busy}
      className={cn(variant === "danger" && "text-destructive hover:text-destructive", className)}
    >
      {busy && <Loader2Icon className="animate-spin" />}
      {children}
    </UiButton>
  );
}

/** A label above a control, with an optional description below. */
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
    // content-start: in a row of fields, a taller neighbour (one with a hint) mustn't push this input down.
    <label className="grid content-start gap-2">
      <span className="text-sm leading-none font-medium select-none">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "bad" | "warn"; children: React.ReactNode }) {
  return (
    <UiBadge
      variant={tone === "neutral" ? "secondary" : tone === "bad" ? "destructive" : "outline"}
      className={cn(tone === "warn" && "text-amber", tone === "good" && "text-emerald")}
    >
      {children}
    </UiBadge>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "bad" | "warn"; children: React.ReactNode }) {
  return (
    <UiAlert variant={tone === "bad" ? "destructive" : "default"} className={cn(tone === "warn" && "border-amber/40 text-amber")}>
      <AlertDescription className={cn(tone === "warn" && "text-amber/90")}>{children}</AlertDescription>
    </UiAlert>
  );
}

/** The keystone's tab bar (Details, Customize, Gallery…). */
export function TabBar<T extends string>({ tabs, value, onChange }: { tabs: readonly T[]; value: T; onChange: (t: T) => void }) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)}>
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t} value={t}>
            {t}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
