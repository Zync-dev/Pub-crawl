import { appIcon } from "@/lib/app-icon";

// Androids tilpassede ikon: formen skæres til af telefonen.
export function GET() {
  return appIcon(512, { maskable: true });
}
