import { describe, expect, it } from "vitest";
import { buildPromoPost, discountPercent, formatShortPeriod, toHashtag, whatsappNumber } from "@/lib/domain/promo-copy";

const base = {
  companyName: "Loja do João",
  promotionName: "Semana do Cliente",
  startsOn: "2026-11-24",
  endsOn: "2026-11-30",
  items: [
    { name: "Camiseta Básica", from: "R$ 49,90", to: "R$ 39,90", discountPercent: 20 },
    { name: "Boné", from: "R$ 39,90", to: "R$ 39,90", discountPercent: null },
  ],
  phone: "(67) 99999-0000",
};

describe("texto de divulgação", () => {
  it("WhatsApp usa *negrito* e ~riscado~ e cita só dados cadastrados", () => {
    const text = buildPromoPost({ ...base, channel: "whatsapp", emojis: false });
    expect(text).toContain("*SEMANA DO CLIENTE*");
    expect(text).toContain("• *Camiseta Básica*: de ~R$ 49,90~ por *R$ 39,90* (-20%)");
    expect(text).toContain("• *Boné*: de ~R$ 39,90~ por *R$ 39,90*"); // sem % quando não há desconto
    expect(text).not.toContain("Boné*: de ~R$ 39,90~ por *R$ 39,90* (-");
    expect(text).toContain("Válido de 24/11 a 30/11");
    expect(text).toContain("Chame no WhatsApp: (67) 99999-0000");
    expect(text).toContain("*Loja do João*");
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u); // sem emojis quando desativados
  });

  it("Instagram não usa marcação do WhatsApp e termina com hashtags", () => {
    const text = buildPromoPost({ ...base, channel: "instagram", emojis: false });
    expect(text).not.toContain("*");
    expect(text).not.toContain("~");
    expect(text.trim().endsWith("#promocao #lojadojoao")).toBe(true);
  });

  it("com emojis ligados inclui marcadores; sem telefone omite a linha de contato", () => {
    const text = buildPromoPost({ ...base, phone: null, channel: "whatsapp", emojis: true });
    expect(text).toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(text).not.toContain("Chame no WhatsApp");
  });

  it("limita a 10 produtos e informa quantos ficaram de fora", () => {
    const items = Array.from({ length: 13 }, (_, i) => ({ name: `Item ${i + 1}`, from: "R$ 10,00", to: "R$ 8,00", discountPercent: 20 }));
    const text = buildPromoPost({ ...base, items, channel: "whatsapp", emojis: false });
    expect(text).toContain("Item 10");
    expect(text).not.toContain("Item 11");
    expect(text).toContain("e mais 3 produtos");
    expect(buildPromoPost({ ...base, items: items.slice(0, 11), channel: "whatsapp", emojis: false })).toContain("e mais 1 produto\n");
  });

  it("promoção de um dia diz 'em'", () => {
    expect(buildPromoPost({ ...base, startsOn: "2026-11-28", endsOn: "2026-11-28", channel: "whatsapp", emojis: false })).toContain("Válido em 28/11");
  });
});

describe("auxiliares de divulgação", () => {
  it("percentual de desconto", () => {
    expect(discountPercent(100, 80)).toBe(20);
    expect(discountPercent(49.9, 39.9)).toBe(20);
    expect(discountPercent(100, 100)).toBeNull();
    expect(discountPercent(0, 0)).toBeNull();
    expect(discountPercent(100, 0)).toBe(100);
  });
  it("período curto", () => {
    expect(formatShortPeriod("2026-11-24", "2026-11-30")).toBe("24/11 a 30/11");
    expect(formatShortPeriod("2026-12-28", "2027-01-03")).toBe("28/12/2026 a 03/01/2027");
    expect(formatShortPeriod("2026-11-24", "2026-11-24")).toBe("24/11");
  });
  it("hashtag e número de WhatsApp", () => {
    expect(toHashtag("Açaí & Cia. do Zé!")).toBe("acaiciadoze");
    expect(whatsappNumber("(67) 99999-0000")).toBe("5567999990000");
    expect(whatsappNumber("+55 67 3333-4444")).toBe("556733334444");
    expect(whatsappNumber("123")).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });
});
