import Image from "next/image";
import { cn } from "@/lib/cn";

/** Monograma "SG" (logo do projeto). "light" = branco, para fundos escuros. */
export function BrandMark({ tone = "dark", size = 32, className }: { tone?: "dark" | "light"; size?: number; className?: string }) {
  return (
    <Image
      src={tone === "light" ? "/brand/sg-logo-white.png" : "/brand/sg-logo-black.png"}
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      priority
    />
  );
}
