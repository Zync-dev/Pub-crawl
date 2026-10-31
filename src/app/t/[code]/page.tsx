import { Suspense } from "react";
import { CrawlGate } from "@/components/crawl-gate";

export default function Page({ params }: PageProps<"/t/[code]">) {
  return (
    <Suspense fallback={<Loading />}>
      {params.then(({ code }) => (
        <CrawlGate code={code.toUpperCase()} />
      ))}
    </Suspense>
  );
}

function Loading() {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-green-800">
      <p className="pc-eyebrow text-gold-300">Henter turen</p>
    </main>
  );
}
