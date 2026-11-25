import type { Metadata } from "next";
import { FlashNotice } from "@/components/ui/flash-notice";
import { PageHeader, Panel, Section } from "@/components/ui/page";
import { updateCompany, updateProfile } from "@/features/configuracoes/actions";
import { CompanyForm, ProfileForm } from "@/features/configuracoes/components/settings-forms";
import { requireAppContext } from "@/lib/auth/session";
import { toInputNumber } from "@/lib/format";
import type { SearchParams } from "@/lib/search";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const ctx = await requireAppContext();
  const c = ctx.company;

  return (
    <>
      <PageHeader title="Configurações" description="Dados da empresa e preferências do sistema." />
      <FlashNotice code={params.aviso} />

      <Section title="Empresa">
        <Panel className="max-w-3xl">
          <CompanyForm
            action={updateCompany}
            readOnly={ctx.role !== "owner"}
            company={{
              name: c.name,
              contact_email: c.contact_email,
              contact_phone: c.contact_phone,
              timezone: c.timezone,
              default_min_stock: toInputNumber(c.default_min_stock),
              min_margin_percent: toInputNumber(c.min_margin_percent, 2),
            }}
          />
        </Panel>
      </Section>

      <Section title="Sua conta">
        <Panel className="max-w-3xl">
          <ProfileForm action={updateProfile} fullName={ctx.profile.full_name} email={ctx.user.email ?? ""} />
        </Panel>
      </Section>
    </>
  );
}
