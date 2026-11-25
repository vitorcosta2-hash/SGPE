import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { signOut } from "@/features/auth/actions";
import { requireAppContext } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { company, profile, user } = await requireAppContext();

  return (
    <AppShell
      companyName={company.name}
      userName={profile.full_name || user.email || "Usuário"}
      userEmail={user.email ?? ""}
      signOutAction={signOut}
    >
      {children}
    </AppShell>
  );
}
