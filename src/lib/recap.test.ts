import { describe, expect, it } from "vitest";
import type { Challenge, ChallengeVote } from "./games-types";
import {
  buildRecap,
  challengeSummary,
  drinkTotals,
  eveningOver,
  EVENING_OVER_MS,
  fitText,
  formatDuration,
  formatLeg,
  formatRecapDate,
  formatRecapDay,
  joinAll,
  photoSummary,
  popularDrink,
  rankPubs,
  recapDate,
  recapFileName,
  recapRoute,
  recapStatus,
  recapStatusLabel,
  rollCallSummary,
  roundsSummary,
  SHARE_LINES,
  shareCard,
  topDrinkers,
  walkedMeters,
  type RecapInput,
  type RecapStop,
} from "./recap";
import type { Photo, StopRating } from "./reviews-types";
import type { RollCall, RollCallAnswer } from "./roll-call";
import type { Round } from "./rounds";
import { crawl, drink, member, stop } from "./test-fixtures";

const T = (hhmm: string) => `2026-11-06T${hhmm}:00.000Z`;
const at = (hhmm: string) => Date.parse(T(hhmm));
const MIN = 60_000;

const lukas = member("u1", "Lukas");
const mikkel = member("u2", "Mikkel");
const freja = member("u3", "Freja");
const members = [lukas, mikkel, freja];

// Tre pubs 500 m fra hinanden (ca. 0,0045 grader nord).
function pub(id: string, position: number, lat: number, patch: Partial<RecapStop> = {}): RecapStop {
  return { ...stop(id, position), lat, lng: 12.56, ...patch };
}

function round(id: string, buyer: string, createdAt = T("19:00")): Round {
  return { id, crawl_id: "c1", stop_id: null, buyer_id: buyer, created_by: "u1", created_at: createdAt };
}

function challenge(id: string, target: string | null, createdAt = T("19:00"), text = `Udfordring ${id}`): Challenge {
  return { id, crawl_id: "c1", stop_id: null, text, target_user_id: target, created_at: createdAt };
}

function vote(challengeId: string, user: string, done: boolean): ChallengeVote {
  return { challenge_id: challengeId, crawl_id: "c1", user_id: user, done, voted_at: T("19:30") };
}

function rating(stopId: string, user: string, stars: number): StopRating {
  return { stop_id: stopId, crawl_id: "c1", user_id: user, stars, created_at: T("19:00"), updated_at: T("19:00") };
}

function photo(id: string, createdAt: string): Photo {
  return { id, crawl_id: "c1", stop_id: null, user_id: "u1", path: `c1/ude/${id}.jpg`, width: null, height: null, created_at: createdAt };
}

function call(id: string, createdAt: string): RollCall {
  return { id, crawl_id: "c1", started_by: "u1", from_stop_id: null, to_stop_id: null, created_at: createdAt, closed_at: null };
}

function answer(callId: string, user: string, answeredAt: string): RollCallAnswer {
  return { roll_call_id: callId, user_id: user, crawl_id: "c1", answered_at: answeredAt };
}

describe("eveningOver", () => {
  const a = { ...stop("a", 0), visited_at: T("22:00") };
  it("er først slut efter tre timer uden check-in, afgang eller drink", () => {
    expect(eveningOver([a], [], at("22:00") + EVENING_OVER_MS - 1)).toBe(false);
    expect(eveningOver([a], [], at("22:00") + EVENING_OVER_MS)).toBe(true);
    const late = [drink("u1", "beer", 1, T("23:30"), "a")];
    expect(eveningOver([a], late, at("22:00") + EVENING_OVER_MS)).toBe(false);
  });

  it("slutter aldrig en aften, der ikke er begyndt", () => {
    expect(eveningOver([stop("a", 0)], [], at("23:00"))).toBe(false);
  });

  it("gør status til gået", () => {
    expect(recapStatus([a, stop("b", 1)], "a", true)).toBe("done");
    expect(recapStatus([stop("b", 1)], null, true)).toBe("empty");
  });
});

describe("recapStatus", () => {
  it("er tom, når ingen pub er besøgt", () => {
    expect(recapStatus([], null)).toBe("empty");
    expect(recapStatus([stop("a", 0)], null)).toBe("empty");
  });

  it("er i gang, mens I er på en pub eller har pubs tilbage", () => {
    const a = { ...stop("a", 0), visited_at: T("18:00") };
    expect(recapStatus([a, stop("b", 1)], null)).toBe("live");
    expect(recapStatus([a], "a")).toBe("live");
  });

  it("er gået, når alle pubs er besøgt og ingen er aktuel", () => {
    const a = { ...stop("a", 0), visited_at: T("18:00") };
    expect(recapStatus([a], null)).toBe("done");
    expect(recapStatusLabel("done")).toBe("Ruten er gået");
    expect(recapStatusLabel("live")).toBe("Indtil nu");
  });
});

describe("recapRoute", () => {
  const a = pub("a", 0, 55.67, { visited_at: T("18:00"), left_at: T("18:40") });
  const b = pub("b", 1, 55.6745, { visited_at: T("18:50") });
  const c = pub("c", 2, 55.679, { visited_at: T("20:00"), minutes: 45 });

  it("følger rækkefølgen, I kom forbi i, ikke rutens", () => {
    const swapped = [{ ...b, position: 0 }, { ...a, position: 1 }, stop("x", 3)];
    const legs = recapRoute(swapped, [], null, at("23:00"));
    expect(legs.map((l) => l.stop.id)).toEqual(["a", "b"]);
    expect(legs.map((l) => l.order)).toEqual([1, 2]);
  });

  it("bruger afgangstiden fra databasen", () => {
    const [first] = recapRoute([a, b, c], [], null, at("23:00"));
    expect(first.leftAt).toBe(at("18:40"));
    expect(first.leftEstimated).toBe(false);
    expect(first.stayMs).toBe(40 * MIN);
  });

  it("gætter afgangen ud fra gåturen, når den mangler", () => {
    const legs = recapRoute([a, b, c], [], null, at("23:00"));
    const walk = legs[2].walkMeters;
    expect(walk).toBeGreaterThan(450);
    expect(walk).toBeLessThan(550);
    // ca. 500 m med 80 m/min. = 6 min. gåtur før 20:00.
    expect(legs[1].leftAt).toBe(at("20:00") - 6 * MIN);
    expect(legs[1].leftEstimated).toBe(true);
  });

  it("bruger den planlagte tid på sidste pub, men aldrig efter nu", () => {
    const legs = recapRoute([a, b, c], [], null, at("23:00"));
    expect(legs[2].leftAt).toBe(at("20:45"));
    const early = recapRoute([a, b, c], [], null, at("20:10"));
    expect(early[2].leftAt).toBe(at("20:10"));
  });

  it("bliver en halv time efter sidste drink på sidste pub, hvis det er senere end planen", () => {
    const drinks = [drink("u1", "beer", 1, T("21:00"), "c")];
    const legs = recapRoute([a, b, c], drinks, null, at("23:00"));
    expect(legs[2].leftAt).toBe(at("21:30"));
    expect(recapRoute([a, b, c], drinks, null, at("21:10"))[2].leftAt).toBe(at("21:10"));
  });

  it("lukker pubben, I stod på, når aftenen er slut", () => {
    const drinks = [drink("u1", "beer", 1, T("20:20"), "c")];
    const legs = recapRoute([a, b, c], drinks, "c", at("12:00") + 24 * 60 * MIN, true);
    expect(legs[2].here).toBe(false);
    expect(legs[2].leftAt).toBe(at("20:50"));
    expect(legs[2].stayMs).toBe(50 * MIN);
  });

  it("tæller tiden indtil nu på den pub, I er på", () => {
    const legs = recapRoute([a, b, c], [], "c", at("20:25"));
    expect(legs[2].here).toBe(true);
    expect(legs[2].leftAt).toBeNull();
    expect(legs[2].stayMs).toBe(25 * MIN);
  });

  it("lader ikke en afgang ligge efter næste ankomst eller før ankomsten", () => {
    const late = { ...a, left_at: T("19:30") };
    expect(recapRoute([late, b], [], null, at("23:00"))[0].leftAt).toBe(at("18:50"));
    const before = { ...a, left_at: T("17:00") };
    const leg = recapRoute([before, b], [], null, at("23:00"))[0];
    expect(leg.leftEstimated).toBe(true);
    expect(leg.leftAt).toBeGreaterThanOrEqual(at("18:00"));
  });

  it("tæller drinks uden vand pr. pub", () => {
    const drinks = [
      drink("u1", "beer", 1, T("18:10"), "a"),
      drink("u2", "water", 0, T("18:15"), "a"),
      drink("u2", "draft", 1.5, T("19:00"), "b"),
    ];
    const legs = recapRoute([a, b], drinks, null, at("23:00"));
    expect(legs.map((l) => l.drinks)).toEqual([1, 1]);
  });

  it("lægger gåturene sammen", () => {
    const legs = recapRoute([a, b, c], [], null, at("23:00"));
    expect(legs[0].walkMeters).toBe(0);
    expect(walkedMeters(legs)).toBeCloseTo(legs[1].walkMeters + legs[2].walkMeters);
    expect(walkedMeters([])).toBe(0);
  });
});

describe("drinks", () => {
  const drinks = [
    drink("u1", "beer", 1, T("18:00")),
    drink("u1", "draft", 1.5, T("18:30")),
    drink("u2", "draft", 1.5, T("18:40")),
    drink("u2", "water", 0, T("18:45")),
    drink("u3", "beer", 1, T("19:00")),
    drink("u9", "shot", 1, T("19:00")),
  ];

  it("lægger genstande, drinks og vand sammen", () => {
    expect(drinkTotals(drinks)).toEqual({ units: 6, drinks: 5, water: 1 });
    expect(drinkTotals([])).toEqual({ units: 0, drinks: 0, water: 0 });
  });

  it("giver top 3 efter genstande og kun folk på holdet", () => {
    const top = topDrinkers(members, drinks);
    expect(top.map((t) => [t.member.name, t.units, t.drinks])).toEqual([
      ["Lukas", 2.5, 2],
      ["Mikkel", 1.5, 1],
      ["Freja", 1, 1],
    ]);
    expect(topDrinkers(members, drinks, 1)).toHaveLength(1);
    expect(topDrinkers(members, [])).toEqual([]);
  });

  it("finder den mest bestilte, uden vand og med menuens rækkefølge ved lighed", () => {
    // Øl og fadøl har 2 hver. Øl står før fadøl i menuen.
    expect(popularDrink(drinks)).toEqual({ kind: "beer", label: "Øl", count: 2, share: 0.4 });
    expect(popularDrink([drink("u1", "water", 0, T("18:00"))])).toBeNull();
  });
});

describe("rankPubs", () => {
  it("sorterer efter snit, så stemmer, så ruten", () => {
    const stops = [stop("a", 0), stop("b", 1), stop("c", 2), stop("d", 3)];
    const ratings = [
      rating("a", "u1", 4),
      rating("b", "u1", 5),
      rating("b", "u2", 2),
      rating("c", "u1", 4),
      rating("c", "u2", 4),
    ];
    const ranked = rankPubs(stops, ratings);
    expect(ranked.map((r) => r.stop.id)).toEqual(["c", "a", "b"]);
    expect(ranked[0]).toMatchObject({ average: 4, count: 2 });
    expect(rankPubs(stops, [])).toEqual([]);
  });
});

describe("roundsSummary", () => {
  it("tæller omgange pr. person og springer midlertidige rækker over", () => {
    const rounds = [round("r1", "u2"), round("r2", "u2"), round("r3", "u1"), round("tmp-1", "u1"), round("r4", "u9")];
    const s = roundsSummary(members, rounds);
    expect(s.total).toBe(3);
    expect(s.people.map((p) => [p.member.name, p.count])).toEqual([
      ["Mikkel", 2],
      ["Lukas", 1],
      ["Freja", 0],
    ]);
  });
});

describe("challengeSummary", () => {
  const challenges = [
    challenge("c1", "u2", T("18:00")),
    challenge("c2", null, T("19:00")),
    challenge("c3", "u3", T("20:00")),
  ];

  it("finder vinderen og deler førstepladsen ved lighed", () => {
    const votes = [vote("c1", "u1", true), vote("c1", "u3", true), vote("c2", "u1", true), vote("c2", "u2", true)];
    const s = challengeSummary(challenges, votes, members);
    expect(s.completed).toBe(2);
    expect(s.total).toBe(3);
    expect(s.leaders.map((l) => [l.member.name, l.points])).toEqual([["Mikkel", 2]]);

    const tie = challengeSummary(challenges, [vote("c2", "u1", true), vote("c2", "u2", true)], members);
    expect(tie.leaders.map((l) => l.member.name)).toEqual(["Freja", "Lukas", "Mikkel"]);
  });

  it("har ingen vinder uden point", () => {
    const s = challengeSummary(challenges, [vote("c1", "u1", false), vote("c1", "u3", false)], members);
    expect(s.leaders).toEqual([]);
  });

  it("finder den mest stemte udfordring, ved lighed den med flest klaret", () => {
    const votes = [
      vote("c1", "u1", false),
      vote("c1", "u3", false),
      vote("c3", "u1", true),
      vote("c3", "u2", false),
      vote("c2", "u1", true),
      vote("c2", "u2", true),
      vote("c2", "u3", true),
      vote("c2", "u9", true),
    ];
    const s = challengeSummary(challenges, votes, members);
    // Stemmen fra u9 tæller ikke, men c2 har stadig flest.
    expect(s.mostVoted).toMatchObject({ votes: 3, done: 3, completed: true, target: null });
    expect(s.mostVoted?.challenge.id).toBe("c2");

    const two = challengeSummary(challenges, votes.slice(0, 4), members);
    expect(two.mostVoted?.challenge.id).toBe("c3");
    expect(two.mostVoted?.target?.name).toBe("Freja");
  });

  it("kræver nok stemmer, før en udfordring er mest stemt", () => {
    expect(challengeSummary(challenges, [vote("c1", "u1", true)], members).mostVoted).toBeNull();
    expect(challengeSummary([], [], members)).toMatchObject({ completed: 0, total: 0, mostVoted: null });
  });
});

describe("rollCallSummary", () => {
  it("finder den, der oftest var sidst med, og tiden til holdet var samlet", () => {
    const calls = [call("r1", T("19:00")), call("r2", T("20:00")), call("r3", T("21:00")), call("r4", T("22:00"))];
    const answers = [
      answer("r1", "u1", T("19:00")),
      answer("r1", "u3", T("19:02")),
      answer("r1", "u2", T("19:04")),
      answer("r2", "u1", T("20:00")),
      answer("r2", "u2", T("20:06")),
      answer("r3", "u1", T("21:00")),
      answer("r3", "u3", T("21:01")),
      answer("r3", "u2", T("21:02")),
      // Kun starteren svarede: ingen sidst med.
      answer("r4", "u1", T("22:00")),
    ];
    const s = rollCallSummary(calls, answers, members);
    expect(s.count).toBe(4);
    expect(s.complete).toBe(2);
    expect(s.mostOftenLast).toEqual({ members: [mikkel], count: 3 });
    expect(s.lastCounts.map((l) => [l.member.name, l.count])).toEqual([["Mikkel", 3]]);
    expect(s.averageGatherMs).toBe(4 * MIN);
  });

  it("deler pladsen ved lighed og ignorerer folk, der er gået hjem", () => {
    const calls = [call("r1", T("19:00")), call("r2", T("20:00"))];
    const answers = [
      answer("r1", "u1", T("19:00")),
      answer("r1", "u2", T("19:03")),
      answer("r1", "u9", T("19:09")),
      answer("r2", "u1", T("20:00")),
      answer("r2", "u3", T("20:01")),
    ];
    const s = rollCallSummary(calls, answers, members);
    expect(s.mostOftenLast?.members.map((m) => m.name)).toEqual(["Freja", "Mikkel"]);
    expect(s.mostOftenLast?.count).toBe(1);
  });

  it("er tom uden opråb", () => {
    expect(rollCallSummary([], [], members)).toEqual({
      count: 0,
      complete: 0,
      lastCounts: [],
      mostOftenLast: null,
      averageGatherMs: null,
    });
  });
});

describe("photoSummary", () => {
  const photos = Array.from({ length: 10 }, (_, i) => photo(`p${i}`, T(`2${i % 4}:${String(10 + i).padStart(2, "0")}`)));

  it("viser alle, når der er få", () => {
    const s = photoSummary(photos.slice(0, 4));
    expect(s.count).toBe(4);
    expect(s.mosaic).toHaveLength(4);
  });

  it("spreder udvalget over hele aftenen", () => {
    const s = photoSummary(photos, 6);
    expect(s.count).toBe(10);
    expect(s.mosaic).toHaveLength(6);
    const sorted = photos.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
    expect(s.mosaic[0].id).toBe(sorted[0].id);
    expect(s.mosaic[5].id).toBe(sorted[9].id);
    const times = s.mosaic.map((p) => p.created_at);
    expect(times).toEqual(times.slice().sort());
  });

  it("klarer grænserne", () => {
    expect(photoSummary([], 6)).toEqual({ count: 0, mosaic: [] });
    expect(photoSummary(photos, 1).mosaic).toHaveLength(1);
    expect(photoSummary(photos, 0).mosaic).toEqual([]);
  });
});

describe("formatering", () => {
  it("skriver varigheder kort", () => {
    expect(formatDuration(0)).toBe("1 min.");
    expect(formatDuration(45 * MIN)).toBe("45 min.");
    expect(formatDuration(80 * MIN)).toBe("1 t. 20 min.");
    expect(formatDuration(120 * MIN)).toBe("2 t.");
  });

  it("skriver datoen på dansk i dansk tid", () => {
    expect(formatRecapDate("2026-11-06T18:00:00.000Z")).toBe("fredag 6. november 2026");
    // 23:30 UTC er lørdag i København.
    expect(formatRecapDate("2026-11-06T23:30:00.000Z")).toBe("lørdag 7. november 2026");
  });

  it("skriver en kort dato til sidehovedet", () => {
    expect(formatRecapDay(T("21:00"))).toBe("fredag 6. november");
  });

  it("tager datoen fra første check-in", () => {
    const stops = [{ ...stop("a", 0), visited_at: T("19:00") }, { ...stop("b", 1), visited_at: T("18:00") }];
    expect(recapDate(crawl({ created_at: "2026-11-01T10:00:00.000Z" }), stops)).toBe(T("18:00"));
    expect(recapDate(crawl({ created_at: "2026-11-01T10:00:00.000Z" }), [])).toBe("2026-11-01T10:00:00.000Z");
  });

  it("skriver en pub med tider i dansk tid", () => {
    const a = pub("a", 0, 55.67, { visited_at: T("18:00"), left_at: T("18:40") });
    const b = pub("b", 1, 55.6745, { visited_at: T("18:50") });
    const legs = recapRoute([a, b], [], "b", at("19:10"));
    expect(formatLeg(legs[0])).toBe("19:00 til 19:40 · 40 min.");
    expect(formatLeg(legs[1])).toBe("Siden 19:50 · 20 min. indtil nu");
    const guessed = recapRoute([{ ...a, left_at: null }, b], [], null, at("23:00"));
    expect(formatLeg(guessed[0])).toMatch(/^19:00 til ca\. 19:4\d · 4\d min\.$/);
  });

  it("sætter navne sammen", () => {
    expect(joinAll([])).toBe("");
    expect(joinAll(["Jonas"])).toBe("Jonas");
    expect(joinAll(["Jonas", "Mikkel", "Freja"])).toBe("Jonas, Mikkel og Freja");
  });

  it("laver et filnavn uden danske bogstaver", () => {
    expect(recapFileName("J-dag på Nørrebro")).toBe("regnskab-j-dag-paa-noerrebro.png");
    expect(recapFileName("Ærø!")).toBe("regnskab-aeroe.png");
    expect(recapFileName("!!!")).toBe("regnskab.png");
  });

  it("klipper tekst, så den passer", () => {
    const measure = (s: string) => s.length * 10;
    expect(fitText("Kronen", 100, measure)).toBe("Kronen");
    expect(fitText("Den Gyldne Fortun", 100, measure)).toBe("Den Gyldn…");
    expect(measure(fitText("Den Gyldne Fortun", 100, measure))).toBeLessThanOrEqual(100);
    expect(fitText("Kronen", 5, measure)).toBe("…");
  });
});

describe("buildRecap og shareCard", () => {
  function input(patch: Partial<RecapInput> = {}): RecapInput {
    const a = pub("a", 0, 55.67, { name: "Kronen", visited_at: T("18:00"), left_at: T("18:40") });
    const b = pub("b", 1, 55.6745, { name: "Hjørnet", visited_at: T("18:50") });
    return {
      crawl: crawl({ current_stop_id: null }),
      members,
      stops: [a, b],
      drinks: [
        drink("u1", "draft", 1.5, T("18:10"), "a"),
        drink("u2", "draft", 1.5, T("18:20"), "a"),
        drink("u3", "beer", 1, T("19:00"), "b"),
        drink("u9", "shot", 1, T("19:00"), "b"),
      ],
      rounds: [round("r1", "u2")],
      challenges: [challenge("c1", "u3")],
      votes: [vote("c1", "u1", true), vote("c1", "u2", true)],
      ratings: [rating("a", "u1", 5), rating("b", "u1", 3)],
      photos: [photo("p1", T("18:30"))],
      rollCalls: [call("r1", T("18:40"))],
      rollCallAnswers: [answer("r1", "u1", T("18:40")), answer("r1", "u2", T("18:43"))],
      now: at("21:00"),
      ...patch,
    };
  }

  it("samler hele regnskabet", () => {
    const r = buildRecap(input());
    expect(r.name).toBe("J-dag 2026");
    expect(r.status).toBe("done");
    expect(r.route).toHaveLength(2);
    // Drinken fra u9, der er gået hjem, tæller ikke.
    expect(r.totals).toEqual({ units: 4, drinks: 3, water: 0 });
    expect(r.top[0].member.name).toBe("Lukas");
    expect(r.popular?.label).toBe("Fadøl");
    expect(r.pubs[0].stop.name).toBe("Kronen");
    expect(r.rounds.total).toBe(1);
    expect(r.challenges.leaders[0].member.name).toBe("Freja");
    expect(r.rollCalls.mostOftenLast?.members[0].name).toBe("Mikkel");
    expect(r.photos.count).toBe(1);
  });

  it("siger indtil nu midt på turen", () => {
    const r = buildRecap(input({ crawl: crawl({ current_stop_id: "b" }) }));
    expect(r.status).toBe("live");
    const card = shareCard(r);
    expect(card.subtitle).toBe("fredag 6. november 2026 · Indtil nu");
  });

  it("bygger delebilledets indhold", () => {
    const card = shareCard(buildRecap(input()));
    expect(card.eyebrow).toBe("Aftenens regnskab");
    expect(card.title).toBe("J-dag 2026");
    expect(card.subtitle).toBe("fredag 6. november 2026 · Ruten er gået");
    expect(card.figures.map((f) => f.label)).toEqual(["Genstande", "Drinks", "Pubber", "Gået"]);
    expect(card.figures[0].value).toBe("4");
    expect(card.figures[2].value).toBe("2");
    // Seks højdepunkter og et billede, men kun plads til fem: billedet og "Mest bestilt" ryger.
    expect(card.lines).toHaveLength(SHARE_LINES);
    expect(card.lines.map((l) => l.label)).toEqual([
      "Stillingen",
      "Aftenens bedste pub",
      "Flest udfordringspoint",
      "Flest omgange",
      "Oftest sidst med",
    ]);
    expect(card.lines[0].value).toBe("1. Lukas 1,5  ·  2. Mikkel 1,5  ·  3. Freja 1");
    expect(card.lines[1].value).toBe("Kronen · 5,0 stjerner");
    expect(card.route).toBe("Kronen  ·  Hjørnet");
    expect(shareCard(buildRecap(input()), 2).lines).toHaveLength(2);
  });

  it("tager det mest bestilte og billederne med, når der er plads", () => {
    const card = shareCard(buildRecap(input({ rollCalls: [], rollCallAnswers: [], challenges: [], votes: [] })));
    expect(card.lines.map((l) => l.label)).toEqual([
      "Stillingen",
      "Aftenens bedste pub",
      "Mest bestilt",
      "Flest omgange",
      "Billeder",
    ]);
  });

  it("deler flest omgange ved lighed", () => {
    const card = shareCard(buildRecap(input({ rounds: [round("r1", "u2"), round("r2", "u1"), round("r3", "u3")] })));
    expect(card.lines.find((l) => l.label === "Flest omgange")?.value).toBe("Freja, Lukas og Mikkel · 1 omgang");
  });

  it("slutter aftenen, når der er gået længe uden nyt, også uden Videre", () => {
    // Sidste check-in 18:50 og sidste drink 19:00 på Hjørnet, som stadig er aktuel.
    const live = buildRecap(input({ crawl: crawl({ current_stop_id: "b" }), now: at("21:59") }));
    expect(live.status).toBe("live");
    expect(live.route[1].here).toBe(true);
    const next = buildRecap(input({ crawl: crawl({ current_stop_id: "b" }), now: at("19:00") + EVENING_OVER_MS }));
    expect(next.status).toBe("done");
    const last = next.route[1];
    expect(last.here).toBe(false);
    expect(last.leftEstimated).toBe(true);
    // En halv time efter sidste drink (19:30) er senere end planen (30 min., 19:20).
    expect(last.leftAt).toBe(at("19:30"));
    expect(shareCard(next).subtitle).toBe("fredag 6. november 2026 · Ruten er gået");
  });

  it("slutter også, når de sidste planlagte pubs blev sprunget over", () => {
    const skipped = input({ stops: [...input().stops, stop("c", 2)] });
    expect(buildRecap(skipped).status).toBe("live");
    expect(buildRecap({ ...skipped, now: at("23:00") }).status).toBe("done");
  });

  it("viser pubs som besøgt/planlagt og har ingen linjer uden data", () => {
    const empty = buildRecap(
      input({ stops: [stop("a", 0), stop("b", 1)], drinks: [], rounds: [], challenges: [], votes: [], ratings: [], photos: [], rollCalls: [], rollCallAnswers: [] }),
    );
    expect(empty.status).toBe("empty");
    const card = shareCard(empty);
    expect(card.lines).toEqual([]);
    expect(card.figures[2].value).toBe("0/2");
    expect(card.figures[3].value).toBe("0 m");
  });

  it("indeholder ingen emojis", () => {
    const card = shareCard(buildRecap(input()));
    expect(JSON.stringify(card)).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
