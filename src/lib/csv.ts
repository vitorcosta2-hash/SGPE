/**
 * Geração de CSV para abrir diretamente no Excel/LibreOffice em português:
 *   - separador ponto e vírgula, codificação UTF-8 com BOM, quebra de linha CRLF;
 *   - números com vírgula decimal;
 *   - proteção contra injeção de fórmulas (=, +, -, @) em textos.
 */
export type CsvValue = string | number | boolean | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvValue;
}

const BOM = "\uFEFF";

export function csvEscape(value: CsvValue): string {
  if (value == null) return "";
  let text: string;
  if (typeof value === "number") {
    text = Number.isFinite(value) ? String(value).replace(".", ",") : "";
  } else if (typeof value === "boolean") {
    text = value ? "Sim" : "Não";
  } else {
    text = value;
    // Neutraliza fórmulas: células de texto iniciadas por = + - @ ou tab/CR.
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  }
  if (/[";\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const header = columns.map((c) => csvEscape(c.header)).join(";");
  const lines = rows.map((row) => columns.map((c) => csvEscape(c.value(row))).join(";"));
  return BOM + [header, ...lines].join("\r\n") + "\r\n";
}
