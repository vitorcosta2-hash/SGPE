import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const CONTROL =
  "block w-full rounded-md border bg-white px-3 text-ink placeholder:text-slate-400 transition-colors focus:border-accent disabled:bg-surface disabled:text-muted";

function controlClasses(invalid: boolean | undefined, extra?: string) {
  return cn(CONTROL, invalid ? "border-red-500" : "border-line hover:border-slate-400", extra);
}

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {required ? <span aria-hidden className="ml-0.5 text-red-600">*</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid, className, ...props }: InputProps) {
  return <input aria-invalid={invalid || undefined} className={controlClasses(invalid, cn("h-11 md:h-10", className))} {...props} />;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export function Select({ invalid, className, children, ...props }: SelectProps) {
  return (
    <select aria-invalid={invalid || undefined} className={controlClasses(invalid, cn("h-11 md:h-10", className))} {...props}>
      {children}
    </select>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ invalid, className, rows = 3, ...props }: TextareaProps) {
  return <textarea rows={rows} aria-invalid={invalid || undefined} className={controlClasses(invalid, cn("py-2", className))} {...props} />;
}

export function Checkbox({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-ink", className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-line accent-brand" {...props} />
      {label}
    </label>
  );
}
