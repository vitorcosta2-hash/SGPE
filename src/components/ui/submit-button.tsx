"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "./button";
import { Spinner } from "./spinner";

interface SubmitButtonProps {
  children: ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
}

/** Botão de envio que mostra estado de carregamento e evita cliques duplos. */
export function SubmitButton({ children, pendingText, variant = "primary", size = "md", className, disabled }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending ? <Spinner /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
