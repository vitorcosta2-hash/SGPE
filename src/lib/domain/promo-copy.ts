/**
 * Texto de divulgação de promoções (WhatsApp e redes sociais), montado a partir
 * dos dados cadastrados: nunca inventa preço, produto ou condição.
 */

export interface PromoPostItem {
  name: string;
  /** Preço cadastrado, já formatado (ex.: "R$ 49,90"). */
  from: string;
  /** Preço promocional, já formatado. */
  to: string;
  /** Percentual de desconto arredondado (0 a 100) ou null se não calculável. */
  discountPercent: number | null;
}

export type PromoChannel = "whatsapp" | "instagram";

export interface PromoPostInput {
  companyName: string;
  promotionName: string;
  /** Datas YYYY-MM-DD. */
  startsOn: string;
  endsOn: string;
  items: PromoPostItem[];
  phone?: string | null;
  emojis: boolean;
  channel: PromoChannel;
}

const MAX_ITEMS = 10;

/** Percentual de desconto entre preço cadastrado e promocional (inteiro; null se base inválida ou sem desconto). */
export function discountPercent(base: number, promo: number): number | null {
  if (!(base > 0) || !(promo >= 0) || promo >= base) return null;
  return Math.round(((base - promo) / base) * 100);
}

/** "24/11 a 30/11" (ou com ano se atravessar anos; "24/11" se for um dia só). */
export function formatShortPeriod(startsOn: string, endsOn: string): string {
  const [sy, sm, sd] = startsOn.split("-");
  const [ey, em, ed] = endsOn.split("-");
  if (startsOn === endsOn) return `${sd}/${sm}`;
  if (sy !== ey) return `${sd}/${sm}/${sy} a ${ed}/${em}/${ey}`;
  return `${sd}/${sm} a ${ed}/${em}`;
}

/** Hashtag segura: só letras e números sem acento ("Loja do João" -> "lojadojoao"). */
export function toHashtag(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase()
    .slice(0, 30);
}

/** Telefone para link do WhatsApp (somente dígitos, com 55 se parecer nacional). Retorna null se inválido. */
export function whatsappNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  return null;
}

export function buildPromoPost(input: PromoPostInput): string {
  const { channel, emojis } = input;
  const wa = channel === "whatsapp";
  const bold = (t: string) => (wa ? `*${t}*` : t);
  const strike = (t: string) => (wa ? `~${t}~` : t);
  const fire = emojis ? "🔥 " : "";
  const tag = emojis ? " 🏷️" : "";
  const lines: string[] = [];

  lines.push(`${fire}${bold(input.promotionName.toUpperCase())}`);
  lines.push("");

  const shown = input.items.slice(0, MAX_ITEMS);
  for (const item of shown) {
    const pct = item.discountPercent ? ` (-${item.discountPercent}%)` : "";
    lines.push(`• ${bold(item.name)}: de ${strike(item.from)} por ${bold(item.to)}${pct}`);
  }
  if (input.items.length > shown.length) {
    const rest = input.items.length - shown.length;
    lines.push(`• e mais ${rest} ${rest === 1 ? "produto" : "produtos"}`);
  }

  lines.push("");
  lines.push(`${emojis ? "📅 " : ""}Válido ${input.startsOn === input.endsOn ? "em" : "de"} ${formatShortPeriod(input.startsOn, input.endsOn)}`);

  const phone = input.phone?.trim();
  if (phone) lines.push(`${emojis ? "📲 " : ""}${wa ? "Chame no WhatsApp" : "Fale com a gente"}: ${phone}`);

  lines.push("");
  lines.push(`${bold(input.companyName)}${tag}`);

  if (!wa) {
    const hashtags = ["promocao", toHashtag(input.companyName)].filter(Boolean).map((h) => `#${h}`);
    lines.push("");
    lines.push(hashtags.join(" "));
  }
  return lines.join("\n");
}
