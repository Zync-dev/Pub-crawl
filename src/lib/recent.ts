// Husker de ture, man har været med i, på denne enhed.
export type RecentCrawl = { code: string; name: string };

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

export function forgetCrawl(code: string) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(readRecent().filter((c) => c.code !== code)),
    );
  } catch {}
}
