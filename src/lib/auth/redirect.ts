/** Aceita apenas caminhos internos ("/produtos"), evitando redirecionamento para sites externos. */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) return fallback;
  try {
    const url = new URL(value, "http://localhost");
    if (url.origin !== "http://localhost") return fallback;
  } catch {
    return fallback;
  }
  return value;
}
