"use client";

import { ChevronRight, ScrollText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "../ds";

// Aftenens regnskab ligger på /t/[code]/regnskab. Koden kommer helst fra turen selv,
// ellers fra adressen. useParams bruges ikke: efter en ny kode retter use-arranger adressen
// med replaceState, og så følger usePathname med, men useParams giver stadig den gamle kode.
function useRecapHref(code?: string) {
  const pathname = usePathname();
  const fromPath = /^\/t\/([^/]+)/i.exec(pathname ?? "")?.[1];
  const value = (code ?? fromPath ?? "").toUpperCase();
  return value ? `/t/${encodeURIComponent(value)}/regnskab` : null;
}

// Det store kort øverst i Stillingen.
export function RecapCard({ code, done }: { code?: string; done?: boolean }) {
  const href = useRecapHref(code);
  if (!href) return null;
  return (
    <Link
      href={href}
      className="pc-card pc-card--inverse pc-card--framed pc-on-dark pc-enter flex min-h-[44px] items-center gap-3 no-underline active:translate-y-px"
      style={{ padding: "14px 16px", color: "var(--cream-100)" }}
    >
      <span
        className="flex shrink-0 items-center justify-center rounded-full"
        style={{ width: 44, height: 44, background: "var(--gold-500)", color: "var(--green-900)" }}
        aria-hidden
      >
        <Icon name={ScrollText} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="pc-label block" style={{ color: "var(--gold-500)" }}>
          {done === undefined ? "Aftenens regnskab" : done ? "Ruten er gået" : "Indtil nu"}
        </span>
        <span className="mt-1 block font-serif text-[24px] italic leading-tight">Se aftenens regnskab</span>
        <span className="mt-0.5 block text-[13px]" style={{ color: "rgba(251,245,230,.75)" }}>
          Ruten, stillingen og billederne. Klar til at dele.
        </span>
      </span>
      <Icon name={ChevronRight} size={22} color="var(--gold-500)" />
    </Link>
  );
}

// Knappen i Nu, når ruten er gået.
export function RecapButton({ code }: { code?: string }) {
  const href = useRecapHref(code);
  if (!href) return null;
  return (
    <Link href={href} className="pc-btn pc-btn--gold pc-btn--lg pc-btn--full">
      <Icon name={ScrollText} size={20} />
      Se aftenens regnskab
    </Link>
  );
}
