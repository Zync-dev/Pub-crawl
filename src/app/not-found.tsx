import type { Metadata } from "next";
import { HomeLink, StatusScreen } from "@/components/status-screen";

export const metadata: Metadata = {
  title: "Den pub findes ikke · Pub Crawl",
};

// Vises for alle adresser, appen ikke kender.
export default function NotFound() {
  return (
    <StatusScreen
      eyebrow="Forkert adresse"
      title="Den pub findes ikke"
      actions={<HomeLink variant="primary" />}
    >
      <p>Linket fører ingen steder hen. Tjek koden, eller start forfra.</p>
    </StatusScreen>
  );
}
