import type { Metadata } from "next";
import { Suspense } from "react";
import { RecapGate, RecapLoading } from "@/components/recap/recap-gate";

export const metadata: Metadata = {
  title: "Aftenens regnskab · Pub Crawl",
  description: "Ruten, stillingen, omgangene og billederne fra aftenen.",
  // Regnskabet er kun for holdet og skal ikke i søgemaskinerne.
  robots: { index: false, follow: false },
};

// Koden er kørselsdata under cacheComponents, så den læses inde i Suspense.
export default function Page({ params }: PageProps<"/t/[code]/regnskab">) {
  return (
    <Suspense fallback={<RecapLoading />}>
      {params.then(({ code }) => (
        <RecapGate code={code.toUpperCase()} />
      ))}
    </Suspense>
  );
}
