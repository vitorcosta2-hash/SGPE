import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "danger" | "danger-outline" | "ghost";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-navy text-white hover:bg-brand",
  secondary: "border border-line bg-white text-ink hover:bg-surface",
  danger: "bg-red-600 text-white hover:bg-red-700",
  "danger-outline": "border border-red-300 bg-white text-red-700 hover:bg-red-50",
  ghost: "text-brand hover:bg-surface",
};

const SIZES: Record<ButtonSize, string> = {
  md: "h-11 px-4 text-sm md:h-10",
  sm: "h-9 px-3 text-sm md:h-8",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

interface ButtonLinkProps extends Omit<ComponentProps<typeof Link>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
