import { Suspense } from "react";
import { CrawlGate, CrawlLoading } from "@/components/crawl-gate";

export default function Page({ params }: PageProps<"/t/[code]">) {
  return (
    <Suspense fallback={<CrawlLoading />}>
      {params.then(({ code }) => (
        <CrawlGate code={code.toUpperCase()} />
      ))}
    </Suspense>
  );
}

