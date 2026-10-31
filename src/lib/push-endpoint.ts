// Push-tjenesterne, som browserne bruger. /api/push sender kun hertil, så ruten ikke kan bruges til
// at sende kald til en fremmed server. Samme liste står i databasen (0014_review_db.sql).
const HOSTS = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);
// Edge og Windows får et endpoint som wns2-par02p.notify.windows.com.
const SUFFIXES = [".notify.windows.com"];

export function isPushEndpoint(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname;
  return HOSTS.has(host) || SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length);
}
