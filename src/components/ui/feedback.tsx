import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type AlertVariant = "info" | "success" | "warning" | "error";

const ALERT_STYLES: Record<AlertVariant, { box: string; icon: typeof Info }> = {
  info: { box: "border-sky-200 bg-sky-50 text-sky-900", icon: Info },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CircleCheck },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: TriangleAlert },
  error: { box: "border-red-200 bg-red-50 text-red-900", icon: CircleAlert },
};

export function Alert({
  variant = "info",
  title,
  children,
  className,
}: {
  variant?: AlertVariant;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = ALERT_STYLES[variant];
  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-md border px-4 py-3 text-sm", box, className)}>
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}

export type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info";

const BADGE_STYLES: Record<BadgeVariant, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

export function Badge({ variant = "neutral", children }: { variant?: BadgeVariant; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap", BADGE_STYLES[variant])}>
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-md border border-dashed border-line px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-slate-400">{icon}</div> : null}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingBlock({ label = "Carregando…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-10 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden />
      {label}
    </div>
  );
}
