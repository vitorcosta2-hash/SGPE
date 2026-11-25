"use client";

import { useEffect } from "react";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Mantém apenas o identificador no console; mensagens internas não são exibidas ao usuário.
    console.error("[sgpe] erro de página", error.digest ?? "");
  }, [error]);

  return (
    <div className="mx-auto max-w-lg space-y-4 py-16">
      <Alert variant="error" title="Algo deu errado">
        Não foi possível carregar esta página. Tente novamente; se o problema continuar, volte ao início.
      </Alert>
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  );
}
