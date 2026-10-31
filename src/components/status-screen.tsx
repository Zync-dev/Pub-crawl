"use client";

import Link from "next/link";
import { House } from "lucide-react";
import type { ReactNode } from "react";
import { Icon, Logo } from "./ds";

// Den grønne side med skiltet og et cremefarvet kort. Bruges af fejlsiderne og "findes ikke".
export function StatusScreen({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <main className="pc-on-dark flex min-h-dvh flex-1 flex-col bg-green-800 px-4 pb-[max(32px,env(safe-area-inset-bottom))] pt-[max(48px,env(safe-area-inset-top))]">
      <div className="pc-fade-in flex flex-1 items-center justify-center py-6">
        <Logo size={0.8} />
      </div>
      <div
        className="pc-enter mx-auto w-full max-w-sm rounded-[var(--radius-md)] bg-cream-100 p-5 text-body"
        style={{ border: "var(--rule-double)", animationDelay: "80ms" }}
      >
        <p className="pc-label text-oxblood-700">{eyebrow}</p>
        <h1 className="mb-3 mt-2 font-serif text-[30px] italic leading-[1.05] text-green-800">{title}</h1>
        {children && <div className="mb-5 text-[15px]">{children}</div>}
        <div className="flex flex-col gap-3">{actions}</div>
      </div>
    </main>
  );
}

// Link tilbage til forsiden i knappens skikkelse.
export function HomeLink({ variant = "secondary" }: { variant?: "primary" | "secondary" }) {
  return (
    <Link href="/" className={`pc-btn pc-btn--${variant} pc-btn--lg pc-btn--full`}>
      <Icon name={House} size={20} />
      Til forsiden
    </Link>
  );
}
