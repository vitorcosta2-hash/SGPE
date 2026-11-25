"use client";

import { Printer } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Imprimir comprovante", icon }: { label?: string; icon?: ReactNode }) {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      {icon ?? <Printer aria-hidden className="h-4 w-4" />} {label}
    </Button>
  );
}
