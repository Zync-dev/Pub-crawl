import { challengeOutcome, challengePoints, requiredVotes, type ChallengeScore } from "./challenge-points";
import { DRINK_BY_KIND, DRINK_KINDS, formatUnits } from "./drinks";
import type { Challenge, ChallengeVote } from "./games-types";
import { distanceMeters, formatDistance, walkingMinutes } from "./geo";
import { formatCopenhagenTime } from "./live-link";
import type { Photo, StopRating } from "./reviews-types";
import { lastIn, type RollCall, type RollCallAnswer } from "./roll-call";
import { formatRoundCount, roundStandings, type BuyerCount, type Round } from "./rounds";
import { compareStanding, roundUnits } from "./stats";
import type { Crawl, Drink, DrinkKind, Member, Stop } from "./types";

// Aftenens regnskab. Alt regnes ud her i rene funktioner uden React og database,
// så det kan testes, og så siden og delebilledet altid siger det samme.

// Migration 0011_recap.sql giver stops en afgangstid. Uden den gætter vi ud fra gåturen.
export type RecapStop = Stop & { left_at?: string | null };

export type RecapStatus = "empty" | "live" | "done";

export type RecapLeg = {
  stop: RecapStop;
  // Nummeret i den rækkefølge, I faktisk kom forbi.
  order: number;
  arrivedAt: number;
  // null, så længe I stadig er der.
  leftAt: number | null;
  // true, når afgangen er regnet ud og ikke skrevet af databasen.
  leftEstimated: boolean;
  stayMs: number;
  here: boolean;
  // Lige linje fra pubben før. 0 for den første.
  walkMeters: number;
  // Drinks (uden vand) skrevet ind på pubben.
  drinks: number;
};

const ms = (iso: string | null | undefined) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "da");

// Så længe uden nyt (check-in, afgang eller drink), så er aftenen slut, også selv om ingen trykkede Videre.
export const EVENING_OVER_MS = 3 * 60 * 60_000;

// Det seneste, turen skrev ned: en check-in, en afgang eller en drink.
export function lastActivity(stops: RecapStop[], drinks: Drink[]): number | null {
  let last: number | null = null;
  for (const t of [
    ...stops.flatMap((s) => [ms(s.visited_at), ms(s.left_at)]),
    ...drinks.map((d) => ms(d.created_at)),
  ]) {
    if (t !== null && (last === null || t > last)) last = t;
  }
  return last;
}

// Er aftenen slut? Først når nogen har tjekket ind, og der er gået længe nok uden nyt.
export function eveningOver(stops: RecapStop[], drinks: Drink[], now: number) {
  if (!stops.some((s) => ms(s.visited_at) !== null)) return false;
  const last = lastActivity(stops, drinks);
  return last !== null && now - last >= EVENING_OVER_MS;
}

// Er ruten gået, er I i gang, eller er I slet ikke begyndt?
// over: aftenen er slut, selv om ingen trykkede Videre eller fik de sidste pubs med.
export function recapStatus(stops: Stop[], currentStopId: string | null, over = false): RecapStatus {
  if (!stops.some((s) => s.visited_at)) return currentStopId ? "live" : "empty";
  if (over) return "done";
  if (currentStopId) return "live";
  return stops.every((s) => s.visited_at) ? "done" : "live";
}

// Efter sidste drink på en pub blev I typisk lidt endnu.
const AFTER_LAST_DRINK_MS = 30 * 60_000;

// Ruten, som den blev gået: ankomst, afgang og hvor længe I blev.
// over: aftenen er slut, så pubben, I stod på, lukkes med en anslået afgang.
export function recapRoute(
  stops: RecapStop[],
  drinks: Drink[],
  currentStopId: string | null,
  now: number,
  over = false,
): RecapLeg[] {
  const visited = stops
    .map((stop) => ({ stop, at: ms(stop.visited_at) }))
    .filter((v): v is { stop: RecapStop; at: number } => v.at !== null)
    .sort((a, b) => a.at - b.at || a.stop.position - b.stop.position);

  return visited.map(({ stop, at }, i) => {
    const prev = visited[i - 1];
    const next = visited[i + 1];
    const walkMeters = prev ? distanceMeters(prev.stop, stop) : 0;
    const here = stop.id === currentStopId && !over;
    const drinksHere = drinks.filter((d) => d.stop_id === stop.id);
    let leftAt: number | null = null;
    let leftEstimated = false;
    if (!here) {
      const recorded = ms(stop.left_at);
      if (recorded !== null && recorded >= at) {
        // Afgangen kan ikke ligge efter ankomsten til næste pub.
        leftAt = next ? Math.min(recorded, next.at) : recorded;
      } else if (next) {
        // Uden afgangstid: ankomsten til næste pub minus gåturen derhen.
        const walk = walkingMinutes(distanceMeters(stop, next.stop)) * 60_000;
        leftAt = Math.max(at, next.at - walk);
        leftEstimated = true;
      } else {
        // Sidste pub uden afgangstid: den planlagte tid eller en halv time efter sidste drink,
        // men aldrig ud i fremtiden.
        const lastDrink = Math.max(at, ...drinksHere.map((d) => ms(d.created_at) ?? at));
        const planned = at + stop.minutes * 60_000;
        const end = drinksHere.length ? Math.max(planned, lastDrink + AFTER_LAST_DRINK_MS) : planned;
        leftAt = Math.max(at, Math.min(now, end));
        leftEstimated = true;
      }
    }
    const end = leftAt ?? Math.max(at, now);
    return {
      stop,
      order: i + 1,
      arrivedAt: at,
      leftAt,
      leftEstimated,
      stayMs: Math.max(0, end - at),
      here,
      walkMeters,
      drinks: drinksHere.filter((d) => d.kind !== "water").length,
    };
  });
}

// Gået i alt, i lige linjer mellem de pubs, I har været på.
export function walkedMeters(legs: RecapLeg[]) {
  return legs.reduce((sum, leg) => sum + leg.walkMeters, 0);
}

export type DrinkTotals = { units: number; drinks: number; water: number };

export function drinkTotals(drinks: Drink[]): DrinkTotals {
  let units = 0;
  let water = 0;
  for (const d of drinks) {
    units += Number(d.units) || 0;
    if (d.kind === "water") water += 1;
  }
  return { units: Math.round(units * 10) / 10, drinks: drinks.length - water, water };
}

export type Drinker = { member: Member; units: number; drinks: number };

// Stillingen efter genstande. Kun dem, der har fået noget, og kun folk på holdet.
export function topDrinkers(members: Member[], drinks: Drink[], limit = 3): Drinker[] {
  const byId = new Map<string, Drinker>(members.map((m) => [m.user_id, { member: m, units: 0, drinks: 0 }]));
  for (const d of drinks) {
    const row = byId.get(d.user_id);
    if (!row) continue;
    row.units += Number(d.units) || 0;
    if (d.kind !== "water") row.drinks += 1;
  }
  // Samme afrunding og rækkefølge som Stillingen, så de altid er enige om, hvem der fører.
  return [...byId.values()]
    .map((r) => ({ ...r, units: roundUnits(r.units) }))
    .filter((r) => r.units > 0)
    .sort(compareStanding)
    .slice(0, limit);
}

export type PopularDrink = { kind: DrinkKind; label: string; count: number; share: number };

// Det, holdet bestilte mest af. Vand tæller ikke. Ved lighed vinder rækkefølgen i menuen.
export function popularDrink(drinks: Drink[]): PopularDrink | null {
  const counts = new Map<DrinkKind, number>();
  let total = 0;
  for (const d of drinks) {
    if (d.kind === "water") continue;
    counts.set(d.kind, (counts.get(d.kind) ?? 0) + 1);
    total += 1;
  }
  let best: { kind: DrinkKind; count: number } | null = null;
  for (const { kind } of DRINK_KINDS) {
    const count = counts.get(kind) ?? 0;
    if (count > 0 && (!best || count > best.count)) best = { kind, count };
  }
  if (!best) return null;
  return { ...best, label: DRINK_BY_KIND[best.kind].label, share: best.count / total };
}

export type RatedPub = { stop: Stop; average: number; count: number };

// Pubberne efter holdets stjerner: højeste snit, så flest stemmer, så ruten.
export function rankPubs(stops: Stop[], ratings: StopRating[]): RatedPub[] {
  return stops
    .map((stop) => {
      const here = ratings.filter((r) => r.stop_id === stop.id);
      const sum = here.reduce((s, r) => s + r.stars, 0);
      return { stop, average: here.length ? sum / here.length : 0, count: here.length };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.average - a.average || b.count - a.count || a.stop.position - b.stop.position);
}

export type RoundsSummary = { total: number; people: BuyerCount[] };

// Omgange pr. person. Omgange fra folk, der er gået hjem, tæller ikke.
export function roundsSummary(members: Member[], rounds: Round[]): RoundsSummary {
  const people = roundStandings(members, rounds.filter((r) => !r.id.startsWith("tmp-")));
  return { total: people.reduce((s, p) => s + p.count, 0), people };
}

export type VotedChallenge = {
  challenge: Challenge;
  target: Member | null;
  done: number;
  notDone: number;
  votes: number;
  completed: boolean;
};

export type ChallengeSummary = {
  completed: number;
  total: number;
  // Alle med flest point, hvis nogen har point.
  leaders: ChallengeScore<Member>[];
  scores: ChallengeScore<Member>[];
  // Den udfordring, flest stemte om. Ved lighed den med flest "klaret", så den første.
  mostVoted: VotedChallenge | null;
};

export function challengeSummary(
  challenges: Challenge[],
  votes: ChallengeVote[],
  members: Member[],
): ChallengeSummary {
  const { scores, completed, total } = challengePoints(challenges, votes, members);
  const top = scores[0]?.points ?? 0;
  const leaders = top > 0 ? scores.filter((s) => s.points === top) : [];
  const memberIds = new Set(members.map((m) => m.user_id));
  const needed = requiredVotes(members.length);
  let mostVoted: VotedChallenge | null = null;
  const ordered = challenges.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const challenge of ordered) {
    const o = challengeOutcome(challenge.id, votes, memberIds);
    if (o.total < needed) continue;
    if (mostVoted && (o.total < mostVoted.votes || (o.total === mostVoted.votes && o.done <= mostVoted.done))) continue;
    mostVoted = {
      challenge,
      target: members.find((m) => m.user_id === challenge.target_user_id) ?? null,
      done: o.done,
      notDone: o.notDone,
      votes: o.total,
      completed: o.completed,
    };
  }
  return { completed, total, leaders, scores, mostVoted };
}

export type RollCallSummary = {
  count: number;
  // Opråb, hvor alle på holdet nåede at svare.
  complete: number;
  // Hvor mange gange hver var sidst med. Flest først, kun dem med mindst én gang.
  lastCounts: { member: Member; count: number }[];
  // Dem, der oftest var sidst med (flere ved lighed).
  mostOftenLast: { members: Member[]; count: number } | null;
  // Tid fra opråbet startede, til den sidste svarede, i snit.
  averageGatherMs: number | null;
};

export function rollCallSummary(calls: RollCall[], answers: RollCallAnswer[], members: Member[]): RollCallSummary {
  const memberIds = new Set(members.map((m) => m.user_id));
  const counts = new Map<string, number>();
  let complete = 0;
  const gathers: number[] = [];
  for (const call of calls) {
    const mine = answers.filter((a) => a.roll_call_id === call.id && memberIds.has(a.user_id));
    if (members.length > 0 && new Set(mine.map((a) => a.user_id)).size === members.length) complete += 1;
    const last = lastIn(mine, members);
    if (!last) continue;
    counts.set(last.member.user_id, (counts.get(last.member.user_id) ?? 0) + 1);
    const started = ms(call.created_at);
    const ended = ms(last.at);
    if (started !== null && ended !== null && ended >= started) gathers.push(ended - started);
  }
  const lastCounts = members
    .map((member) => ({ member, count: counts.get(member.user_id) ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || byName(a.member, b.member));
  const top = lastCounts[0]?.count ?? 0;
  return {
    count: calls.length,
    complete,
    lastCounts,
    mostOftenLast: top > 0 ? { members: lastCounts.filter((r) => r.count === top).map((r) => r.member), count: top } : null,
    averageGatherMs: gathers.length ? gathers.reduce((s, g) => s + g, 0) / gathers.length : null,
  };
}

export type PhotoSummary = { count: number; mosaic: Photo[] };

// Antal billeder og et udvalg spredt over hele aftenen, i den rækkefølge de blev taget.
export function photoSummary(photos: Photo[], max = 6): PhotoSummary {
  const sorted = photos.slice().sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  if (sorted.length <= max || max <= 0) return { count: sorted.length, mosaic: max <= 0 ? [] : sorted };
  if (max === 1) return { count: sorted.length, mosaic: [sorted[sorted.length - 1]] };
  const picks = new Set<number>();
  for (let i = 0; i < max; i++) picks.add(Math.round((i * (sorted.length - 1)) / (max - 1)));
  return { count: sorted.length, mosaic: [...picks].sort((a, b) => a - b).map((i) => sorted[i]) };
}

// Aftenens dato: den første check-in, ellers da turen blev lavet.
export function recapDate(crawl: Pick<Crawl, "created_at">, stops: Stop[]): string {
  const first = stops
    .map((s) => s.visited_at)
    .filter((v): v is string => ms(v) !== null)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  return first ?? crawl.created_at;
}

const dateParts = new Intl.DateTimeFormat("da-DK", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Copenhagen",
});

// "fredag 6. november 2026"
export function formatRecapDate(iso: string) {
  const parts = Object.fromEntries(dateParts.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.weekday} ${parts.day}. ${parts.month} ${parts.year}`;
}

// "fredag 6. november", kort nok til sidehovedet på en telefon.
export function formatRecapDay(iso: string) {
  const parts = Object.fromEntries(dateParts.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.weekday} ${parts.day}. ${parts.month}`;
}

// "45 min.", "1 t. 20 min.", "2 t."
export function formatDuration(durationMs: number) {
  const minutes = Math.max(1, Math.round(durationMs / 60_000));
  if (minutes < 60) return `${minutes} min.`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} t. ${m} min.` : `${h} t.`;
}

export function formatTimes(n: number) {
  return n === 1 ? "1 gang" : `${n} gange`;
}

export function formatPoints(n: number) {
  return n === 1 ? "1 point" : `${n} point`;
}

// "Jonas", "Jonas og Mikkel", "Jonas, Mikkel og Freja".
export function joinAll(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} og ${names[names.length - 1]}`;
}

export type RecapInput = {
  crawl: Pick<Crawl, "name" | "created_at" | "current_stop_id">;
  members: Member[];
  stops: RecapStop[];
  drinks: Drink[];
  rounds: Round[];
  challenges: Challenge[];
  votes: ChallengeVote[];
  ratings: StopRating[];
  photos: Photo[];
  rollCalls: RollCall[];
  rollCallAnswers: RollCallAnswer[];
  now: number;
};

export type Recap = {
  name: string;
  date: string;
  status: RecapStatus;
  route: RecapLeg[];
  plannedStops: number;
  walkedMeters: number;
  totals: DrinkTotals;
  top: Drinker[];
  popular: PopularDrink | null;
  pubs: RatedPub[];
  rounds: RoundsSummary;
  challenges: ChallengeSummary;
  rollCalls: RollCallSummary;
  photos: PhotoSummary;
};

export function buildRecap(input: RecapInput): Recap {
  const memberIds = new Set(input.members.map((m) => m.user_id));
  // Drinks og billeder fra folk, der er gået hjem, er allerede væk i databasen. Her for en sikkerheds skyld.
  const drinks = input.drinks.filter((d) => memberIds.has(d.user_id));
  const over = eveningOver(input.stops, drinks, input.now);
  const route = recapRoute(input.stops, drinks, input.crawl.current_stop_id, input.now, over);
  return {
    name: input.crawl.name,
    date: recapDate(input.crawl, input.stops),
    status: recapStatus(input.stops, input.crawl.current_stop_id, over),
    route,
    plannedStops: input.stops.length,
    walkedMeters: walkedMeters(route),
    totals: drinkTotals(drinks),
    top: topDrinkers(input.members, drinks, 3),
    popular: popularDrink(drinks),
    pubs: rankPubs(input.stops, input.ratings),
    rounds: roundsSummary(input.members, input.rounds),
    challenges: challengeSummary(input.challenges, input.votes, input.members),
    rollCalls: rollCallSummary(input.rollCalls, input.rollCallAnswers, input.members),
    photos: photoSummary(input.photos),
  };
}

// "Ruten er gået" eller "Indtil nu", til overskrifter og delebilledet.
export function recapStatusLabel(status: RecapStatus) {
  if (status === "done") return "Ruten er gået";
  if (status === "live") return "Indtil nu";
  return "Ikke begyndt endnu";
}

// "21:15 til 22:05 · 50 min." eller "Siden 21:15 · 20 min. indtil nu".
export function formatLeg(leg: RecapLeg) {
  const from = formatCopenhagenTime(new Date(leg.arrivedAt).toISOString());
  if (leg.leftAt === null) return `Siden ${from} · ${formatDuration(leg.stayMs)} indtil nu`;
  const to = formatCopenhagenTime(new Date(leg.leftAt).toISOString());
  return `${from} til ${leg.leftEstimated ? "ca. " : ""}${to} · ${formatDuration(leg.stayMs)}`;
}

export type ShareFigure = { value: string; label: string };
export type ShareLine = { label: string; value: string };

export type ShareCard = {
  eyebrow: string;
  title: string;
  subtitle: string;
  figures: ShareFigure[];
  lines: ShareLine[];
  route: string;
  footer: string;
};

// Så mange højdepunkter er der plads til på delebilledet over ruten.
export const SHARE_LINES = 5;

// Indholdet af delebilledet. Er der flere højdepunkter end plads, ryger billederne først,
// så det mest bestilte (tallene står allerede øverst), så de nederste.
export function shareCard(recap: Recap, maxLines = SHARE_LINES): ShareCard {
  const lines: (ShareLine & { spare?: number })[] = [];
  if (recap.top.length) {
    lines.push({
      label: "Stillingen",
      value: recap.top.map((t, i) => `${i + 1}. ${t.member.name} ${formatUnits(t.units)}`).join("  ·  "),
    });
  }
  const best = recap.pubs[0];
  if (best) {
    lines.push({
      label: "Aftenens bedste pub",
      value: `${best.stop.name} · ${best.average.toLocaleString("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} stjerner`,
    });
  }
  if (recap.popular) {
    lines.push({ label: "Mest bestilt", value: `${recap.popular.label} · ${recap.popular.count} stk.`, spare: 1 });
  }
  if (recap.challenges.leaders.length) {
    const l = recap.challenges.leaders;
    lines.push({
      label: "Flest udfordringspoint",
      value: `${joinAll(l.map((s) => s.member.name))} · ${formatPoints(l[0].points)}`,
    });
  }
  const topRounds = recap.rounds.people[0]?.count ?? 0;
  if (recap.rounds.total > 0 && topRounds > 0) {
    const buyers = recap.rounds.people.filter((p) => p.count === topRounds);
    lines.push({
      label: "Flest omgange",
      value: `${joinAll(buyers.map((p) => p.member.name))} · ${formatRoundCount(topRounds)}`,
    });
  }
  if (recap.rollCalls.mostOftenLast) {
    const l = recap.rollCalls.mostOftenLast;
    lines.push({
      label: "Oftest sidst med",
      value: `${joinAll(l.members.map((m) => m.name))} · ${formatTimes(l.count)}`,
    });
  }
  if (recap.photos.count > 0) {
    lines.push({ label: "Billeder", value: recap.photos.count === 1 ? "1 billede" : `${recap.photos.count} billeder`, spare: 2 });
  }
  const kept = lines
    .map((line, i) => ({ line, i, spare: line.spare ?? 0 }))
    .sort((a, b) => a.spare - b.spare || a.i - b.i)
    .slice(0, Math.max(0, maxLines))
    .sort((a, b) => a.i - b.i)
    .map(({ line: { label, value } }) => ({ label, value }));

  const visited = recap.route.length;
  return {
    eyebrow: "Aftenens regnskab",
    title: recap.name,
    subtitle: `${formatRecapDate(recap.date)} · ${recapStatusLabel(recap.status)}`,
    figures: [
      { value: formatUnits(recap.totals.units), label: "Genstande" },
      { value: String(recap.totals.drinks), label: "Drinks" },
      { value: recap.plannedStops > visited ? `${visited}/${recap.plannedStops}` : String(visited), label: "Pubber" },
      { value: formatDistance(recap.walkedMeters), label: "Gået" },
    ],
    lines: kept,
    route: recap.route.map((l) => l.stop.name).join("  ·  "),
    footer: "God øl · godt selskab",
  };
}

// Kort tekst til at klippe en linje, så den passer i bredden. measure gives udefra (canvas).
export function fitText(text: string, maxWidth: number, measure: (s: string) => number) {
  if (measure(text) <= maxWidth) return text;
  const ellipsis = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(text.slice(0, mid).trimEnd() + ellipsis) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? ellipsis : text.slice(0, lo).trimEnd() + ellipsis;
}

// "regnskab-j-dag-2026.png". Danske bogstaver skrives om, så filnavnet virker overalt.
export function recapFileName(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `regnskab${slug ? `-${slug}` : ""}.png`;
}
