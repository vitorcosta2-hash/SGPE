"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, MessageCircle, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/fields";
import { cn } from "@/lib/cn";
import { formatShortPeriod, buildPromoPost, discountPercent, whatsappNumber, type PromoChannel } from "@/lib/domain/promo-copy";
import { formatCurrency } from "@/lib/format";

interface Props {
  companyName: string;
  promotionName: string;
  startsOn: string;
  endsOn: string;
  phone: string | null;
  currency: string;
  items: { name: string; from: number; to: number }[];
}

type Format = "feed" | "story";
const SIZES: Record<Format, { w: number; h: number; label: string }> = {
  feed: { w: 1080, h: 1080, label: "Feed (quadrado)" },
  story: { w: 1080, h: 1920, label: "Story / Status (vertical)" },
};

const FONT = "Inter Variable, Inter, system-ui, sans-serif";

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

/** Quebra o título em até `maxLines` linhas que cabem em `maxWidth`. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = fit(ctx, lines.slice(maxLines - 1).join(" "), maxWidth);
    return kept;
  }
  return lines.map((l) => fit(ctx, l, maxWidth));
}

function drawArt(canvas: HTMLCanvasElement, format: Format, p: Props) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { w, h } = SIZES[format];
  canvas.width = w;
  canvas.height = h;
  const M = 80;
  const money = (n: number) => formatCurrency(n, p.currency);

  // Fundo e faixa de destaque
  ctx.fillStyle = "#0B2545";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#00A8E8";
  ctx.fillRect(0, 0, w, 14);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // Empresa
  ctx.fillStyle = "#B8C7DB";
  ctx.font = `600 32px ${FONT}`;
  ctx.fillText(fit(ctx, p.companyName.toUpperCase(), w - M * 2), M, 112);

  // Título
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 ${format === "story" ? 92 : 80}px ${FONT}`;
  const titleLines = wrap(ctx, p.promotionName, w - M * 2 - 220, 2);
  const titleLine = format === "story" ? 108 : 94;
  titleLines.forEach((l, i) => ctx.fillText(l, M, 220 + i * titleLine));
  const titleBottom = 220 + (titleLines.length - 1) * titleLine;

  // Selo com o maior desconto
  const percents = p.items.map((i) => discountPercent(i.from, i.to)).filter((x): x is number => x !== null);
  if (percents.length > 0) {
    const max = Math.max(...percents);
    const min = Math.min(...percents);
    const cx = w - M - 95;
    const cy = 190;
    ctx.fillStyle = "#00A8E8";
    ctx.beginPath();
    ctx.arc(cx, cy, 95, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0B2545";
    ctx.textAlign = "center";
    if (min !== max) {
      ctx.font = `700 26px ${FONT}`;
      ctx.fillText("ATÉ", cx, cy - 32);
    }
    ctx.font = `800 ${min !== max ? 54 : 60}px ${FONT}`;
    ctx.fillText(`-${max}%`, cx, cy + (min !== max ? 34 : 24));
    ctx.textAlign = "left";
  }

  // Período
  const periodY = titleBottom + 62;
  ctx.fillStyle = "#00A8E8";
  ctx.font = `600 36px ${FONT}`;
  ctx.fillText(`Válido ${p.startsOn === p.endsOn ? "em" : "de"} ${formatShortPeriod(p.startsOn, p.endsOn)}`, M, periodY);

  // Produtos
  const footerH = 150;
  const top = periodY + 56;
  const rowH = format === "story" ? 138 : 118;
  const gap = 14;
  const maxRows = Math.max(1, Math.floor((h - footerH - top + gap) / rowH));
  const needMore = p.items.length > maxRows;
  const rows = needMore ? maxRows - 1 : p.items.length;
  const shown = p.items.slice(0, Math.max(rows, 1));

  shown.forEach((item, i) => {
    const y = top + i * rowH;
    ctx.fillStyle = "#134074";
    ctx.beginPath();
    ctx.roundRect(M, y, w - M * 2, rowH - gap, 18);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `600 34px ${FONT}`;
    ctx.fillText(fit(ctx, item.name, 540), M + 30, y + 50);
    ctx.fillStyle = "#B8C7DB";
    ctx.font = `400 26px ${FONT}`;
    const from = `de ${money(item.from)}`;
    ctx.fillText(from, M + 30, y + 86);
    if (item.to < item.from) {
      const fw = ctx.measureText(from).width;
      ctx.fillRect(M + 30 + 28, y + 77, fw - 28, 2); // risco sobre o preço antigo
    }
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `800 52px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(money(item.to), w - M - 30, y + 70);
    ctx.textAlign = "left";
  });
  if (needMore) {
    const rest = p.items.length - shown.length;
    ctx.fillStyle = "#B8C7DB";
    ctx.font = `500 30px ${FONT}`;
    ctx.fillText(`e mais ${rest} ${rest === 1 ? "produto" : "produtos"} na promoção`, M, top + shown.length * rowH + 34);
  }

  // Rodapé
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText(fit(ctx, p.companyName, w - M * 2), M, h - 78);
  if (p.phone) {
    ctx.fillStyle = "#B8C7DB";
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText(fit(ctx, p.phone, w - M * 2), M, h - 36);
  }
}

/** Arte (PNG) e texto prontos para WhatsApp e redes sociais, gerados a partir dos dados da promoção. */
export function PromoShare(props: Props) {
  const { companyName, promotionName, startsOn, endsOn, phone, currency, items } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [format, setFormat] = useState<Format>("feed");
  const [channel, setChannel] = useState<PromoChannel>("whatsapp");
  const [emojis, setEmojis] = useState(true);
  const [edited, setEdited] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const generated = useMemo(
    () =>
      buildPromoPost({
        companyName,
        promotionName,
        startsOn,
        endsOn,
        phone,
        emojis,
        channel,
        items: items.map((i) => ({
          name: i.name,
          from: formatCurrency(i.from, currency),
          to: formatCurrency(i.to, currency),
          discountPercent: discountPercent(i.from, i.to),
        })),
      }),
    [companyName, promotionName, startsOn, endsOn, phone, emojis, channel, items, currency],
  );
  const text = edited ?? generated;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await Promise.all([document.fonts.load(`800 40px "Inter Variable"`), document.fonts.load(`400 26px "Inter Variable"`)]);
      } catch {
        /* usa a fonte reserva */
      }
      if (!cancelled && canvasRef.current) drawArt(canvasRef.current, format, props);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [format, props]);

  const blob = useCallback(
    () => new Promise<Blob | null>((resolve) => canvasRef.current?.toBlob((b) => resolve(b), "image/png") ?? resolve(null)),
    [],
  );
  const fileName = `promocao-${promotionName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "arte"}-${format}.png`;

  async function download() {
    const b = await blob();
    if (!b) return;
    const url = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setNotice(null);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setNotice("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
    }
  }

  async function share() {
    const b = await blob();
    if (!b) return;
    const file = new File([b], fileName, { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else if (navigator.share) await navigator.share({ text });
      else setNotice("Seu navegador não tem o menu de compartilhar. Baixe a arte e copie o texto.");
    } catch {
      /* a pessoa cancelou o compartilhamento */
    }
  }

  const waNumber = whatsappNumber(phone);
  const waHref = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <div className="space-y-3">
        <div role="tablist" aria-label="Formato da arte" className="flex gap-1.5">
          {(Object.keys(SIZES) as Format[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={format === f}
              onClick={() => setFormat(f)}
              className={cn(
                "h-9 rounded-md border px-3 text-sm transition-colors",
                format === f ? "border-navy bg-navy text-white" : "border-line bg-white text-ink hover:bg-surface",
              )}
            >
              {SIZES[f].label}
            </button>
          ))}
        </div>
        <canvas
          ref={canvasRef}
          className={cn("w-full rounded-md border border-line bg-navy", format === "story" ? "max-w-[18rem]" : "max-w-sm")}
          role="img"
          aria-label={`Arte da promoção ${promotionName}`}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={download}>
            <Download aria-hidden className="h-4 w-4" /> Baixar PNG
          </Button>
          {canNativeShare ? (
            <Button variant="secondary" onClick={share}>
              <Share2 aria-hidden className="h-4 w-4" /> Compartilhar
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Onde vai publicar" htmlFor="promo-channel">
            <Select
              id="promo-channel"
              value={channel}
              onChange={(e) => {
                setChannel(e.target.value as PromoChannel);
                setEdited(null);
              }}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram / Facebook</option>
            </Select>
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox
              label="Incluir emojis"
              checked={emojis}
              onChange={(e) => {
                setEmojis(e.target.checked);
                setEdited(null);
              }}
            />
          </div>
        </div>
        <Field label="Texto da publicação" htmlFor="promo-text" hint="Você pode editar antes de copiar. Os preços vêm do cadastro da promoção.">
          <Textarea id="promo-text" rows={14} value={text} onChange={(e) => setEdited(e.target.value)} className="font-mono text-[13px] leading-relaxed" />
        </Field>
        {edited !== null ? (
          <button type="button" onClick={() => setEdited(null)} className="text-sm text-brand hover:underline">
            Restaurar texto gerado
          </button>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={copy}>
            {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />} {copied ? "Texto copiado" : "Copiar texto"}
          </Button>
          <a href={waHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-medium text-ink transition-colors hover:bg-surface md:h-10">
            <MessageCircle aria-hidden className="h-4 w-4" /> Abrir no WhatsApp
          </a>
        </div>
        <p className="text-xs text-muted">
          O WhatsApp abre com o texto pronto para você escolher o contato ou grupo. Para enviar a imagem junto, baixe a arte e anexe
          {waNumber ? "" : " (cadastre o telefone da empresa em Configurações para incluí-lo na arte e no texto)"}.
        </p>
        {notice ? <p role="status" className="text-sm text-amber-800">{notice}</p> : null}
      </div>
    </div>
  );
}
