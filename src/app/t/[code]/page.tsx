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
  return <p className="m-auto text-muted">Henter turen…</p>;
}
