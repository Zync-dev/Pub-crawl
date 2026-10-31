// Husker de ture, man har været med i, på denne enhed.
// id'et gør, at turen stadig kan findes, når arrangøren har lavet en ny kode, mens appen var lukket.
export type RecentCrawl = { code: string; name: string; id?: string };

const KEY = "pubcrawl.recent";

export function readRecent(): RecentCrawl[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentCrawl[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberCrawl(crawl: RecentCrawl) {
  try {
    const list = readRecent().filter((c) => c.code !== crawl.code);
    localStorage.setItem(KEY, JSON.stringify([crawl, ...list].slice(0, 10)));
  } catch {
    // Privat vindue eller fuld lagerplads: så husker vi bare ikke turen.
  }
}

// Turen, der sidst blev husket med den kode (og dermed dens id, hvis vi har det).
export function recentByCode(code: string): RecentCrawl | null {
  return readRecent().find((c) => c.code === code) ?? null;
}

export function forgetCrawl(code: string) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(readRecent().filter((c) => c.code !== code)),
    );
  } catch {}
}
