import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { Spinner } from "@/components/ds";
import { PublicLive, PublicLiveHeader } from "@/components/public-live";
import { fetchPublicCrawl } from "@/lib/live-link";

// Samme opslag til metadata og siden. undefined betyder, at Supabase ikke svarede.
const load = cache(async (token: string) => {
  try {
    return await fetchPublicCrawl(token);
  } catch {
    return undefined;
  }
});

const description = "Se, hvor holdet er lige nu, og find vej derhen.";

export async function generateMetadata({ params }: PageProps<"/se/[token]">): Promise<Metadata> {
  const { token } = await params;
  const crawl = await load(token);
  const title = crawl ? `Find holdet · ${crawl.name}` : "Find holdet";
  return {
    title,
    description,
    openGraph: { title, description, type: "website", locale: "da_DK" },
    // Linket skal ikke i søgemaskinerne.
    robots: { index: false, follow: false },
  };
}

// Parametren er kørselsdata under cacheComponents, så den læses inde i Suspense.
export default function Page({ params }: PageProps<"/se/[token]">) {
  return (
    <Suspense fallback={<Loading />}>
      {params.then(({ token }) => (
        <Live token={token} />
      ))}
    </Suspense>
  );
}

async function Live({ token }: { token: string }) {
  const initial = await load(token);
  return <PublicLive token={token} initial={initial} />;
}

function Loading() {
  return (
    <div className="flex min-h-dvh flex-col bg-cream-200">
      <PublicLiveHeader eyebrow="Sent på den?" />
      <div className="flex flex-col items-center gap-3 py-16 text-green-800">
        <Spinner size={26} label="Henter turen" />
        <p className="pc-eyebrow text-muted">Henter turen</p>
      </div>
    </div>
  );
}
