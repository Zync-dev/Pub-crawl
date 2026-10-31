import { describe, expect, it } from "vitest";
import {
  addSettled,
  dropSettled,
  entryKey,
  markSent,
  markWaiting,
  mergeDrinks,
  outboxStorageKey,
  parseOutbox,
  pruneSettled,
  queueRemoval,
  queueRestore,
  retryable,
  validEntry,
  waitingCount,
  waitingDrinkIds,
  type OutboxEntry,
} from "./drink-outbox";
import type { Drink } from "./types";

function drink(id: string, created_at: string, patch: Partial<Drink> = {}): Drink {
  return { id, crawl_id: "c1", user_id: "u1", stop_id: "s1", kind: "beer", units: 1, created_at, ...patch };
}

const insert = (d: Drink, extra: Partial<Extract<OutboxEntry, { op: "insert" }>> = {}): OutboxEntry => ({
  op: "insert",
  drink: d,
  ...extra,
});
const del = (id: string, waiting?: boolean): OutboxEntry => ({ op: "delete", id, ...(waiting ? { waiting } : {}) });

const a = drink("a", "2026-11-06T20:00:00.000Z");
const b = drink("b", "2026-11-06T20:10:00.000Z");
const c = drink("c", "2026-11-06T20:20:00.000Z");

describe("nøgler", () => {
  it("giver hver række en nøgle efter handling og id", () => {
    expect(entryKey(insert(a))).toBe("insert:a");
    expect(entryKey(del("a"))).toBe("delete:a");
    expect(outboxStorageKey("c1", "u1")).toBe("pc-drink-outbox:c1:u1");
  });
});

describe("parseOutbox og validEntry", () => {
  it("læser køen fra sidst og giver alt mærket", () => {
    const raw = JSON.stringify([insert(a), del("b"), insert(c, { sent: true })]);
    expect(parseOutbox(raw)).toEqual([
      { op: "insert", drink: a, waiting: true },
      { op: "delete", id: "b", waiting: true },
      { op: "insert", drink: c, sent: true, waiting: true },
    ]);
  });

  it("smider ødelagte rækker væk", () => {
    const raw = JSON.stringify([
      null,
      42,
      { op: "delete" },
      { op: "insert" },
      { op: "insert", drink: { id: "x" } },
      { op: "update", id: "y" },
      insert(a),
    ]);
    expect(parseOutbox(raw).map(entryKey)).toEqual(["insert:a"]);
    expect(validEntry({ op: "delete", id: 1 })).toBe(false);
  });

  it("giver en tom kø for intet, noget andet end en liste og ugyldig JSON", () => {
    expect(parseOutbox(null)).toEqual([]);
    expect(parseOutbox("")).toEqual([]);
    expect(parseOutbox("{}")).toEqual([]);
    expect(parseOutbox("[{")).toEqual([]);
  });
});

describe("retryable", () => {
  it("prøver igen uden svar, ved timeout, udløbet login og serverfejl", () => {
    expect(retryable(0)).toBe(true);
    expect(retryable(0, "")).toBe(true);
    expect(retryable(401, "PGRST301")).toBe(true);
    expect(retryable(408, "x")).toBe(true);
    expect(retryable(429, "x")).toBe(true);
    expect(retryable(503, "x")).toBe(true);
  });

  it("giver op ved endelige afslag", () => {
    expect(retryable(403, "42501")).toBe(false);
    expect(retryable(409, "23503")).toBe(false);
    expect(retryable(400, "22P02")).toBe(false);
  });
});

describe("markWaiting og markSent", () => {
  it("mærker kun den ene række, når der er en nøgle", () => {
    const queue = [insert(a), insert(b)];
    expect(markWaiting(queue, "insert:b")).toEqual([insert(a), insert(b, { waiting: true })]);
  });

  it("mærker alt uden nøgle", () => {
    expect(markWaiting([insert(a), del("b")], undefined).every((e) => e.waiting)).toBe(true);
  });

  it("giver den samme liste tilbage, når intet ændres", () => {
    const queue = [insert(a, { waiting: true })];
    expect(markWaiting(queue)).toBe(queue);
    expect(markWaiting(queue, "insert:x")).toBe(queue);
    expect(markSent(queue, "delete:a")).toBe(queue);
  });

  it("husker, at en indsættelse blev sendt uden svar", () => {
    const queue = [insert(a), del("b")];
    const next = markSent(queue, "insert:a");
    expect(next[0]).toEqual(insert(a, { sent: true }));
    expect(markSent(next, "insert:a")).toBe(next);
  });
});

describe("queueRemoval", () => {
  it("fjerner bare en drink, der aldrig er sendt", () => {
    expect(queueRemoval([insert(a), insert(b)], "a", null)).toEqual({ next: [insert(b)], flush: false });
  });

  it("sætter en sletning i kø, når drinken er på vej op", () => {
    expect(queueRemoval([insert(a), insert(b)], "a", "insert:a")).toEqual({
      next: [insert(a), insert(b), del("a")],
      flush: true,
    });
  });

  it("sletter en drink, der blev sendt uden svar, for den kan ligge på serveren", () => {
    expect(queueRemoval([insert(a, { sent: true, waiting: true }), insert(b)], "a", null)).toEqual({
      next: [insert(b), del("a")],
      flush: true,
    });
  });

  it("sætter en sletning i kø for en drink, der allerede er gemt", () => {
    expect(queueRemoval([insert(b)], "a", null)).toEqual({ next: [insert(b), del("a")], flush: true });
    expect(queueRemoval([], "a", null)).toEqual({ next: [del("a")], flush: true });
  });

  it("sletter ikke to gange", () => {
    expect(queueRemoval([del("a")], "a", null)).toBeNull();
    expect(queueRemoval([insert(a), del("a")], "a", "insert:a")).toBeNull();
  });
});

describe("addSettled og pruneSettled", () => {
  it("erstatter en tidligere række med samme id og rydder de gamle", () => {
    let list = addSettled([], "a", a, 1_000);
    list = addSettled(list, "b", b, 2_000);
    list = addSettled(list, "a", null, 3_000);
    expect(list).toEqual([
      { id: "b", drink: b, until: 2_000 },
      { id: "a", drink: null, until: 3_000 },
    ]);
    expect(pruneSettled(list, 2_000).map((s) => s.id)).toEqual(["a"]);
    expect(pruneSettled(list, 3_000)).toEqual([]);
  });
});

describe("mergeDrinks", () => {
  it("giver de hentede drinks uændret, når intet venter", () => {
    const fetched = [b, a];
    expect(mergeDrinks(fetched, [], [])).toBe(fetched);
  });

  it("lægger ventende drinks oven på de hentede i tidsorden", () => {
    expect(mergeDrinks([c, a], [insert(b)], []).map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("viser en drink, der er sendt igen, kun én gang, og den hentede vinder", () => {
    const fetched = { ...a, stop_id: null };
    const merged = mergeDrinks([fetched], [insert(a, { sent: true })], [{ id: "a", drink: a, until: 1 }]);
    expect(merged).toEqual([fetched]);
  });

  it("skjuler ventende sletninger og sletninger, der lige er sendt", () => {
    const merged = mergeDrinks([a, b, c], [del("a")], [{ id: "c", drink: null, until: 1 }]);
    expect(merged.map((d) => d.id)).toEqual(["b"]);
  });

  it("skjuler en ventende drink, der er slettet igen", () => {
    expect(mergeDrinks([], [insert(a), del("a")], [])).toEqual([]);
  });

  it("holder en sendt drink fremme, selv om genhentningen er forældet", () => {
    expect(mergeDrinks([b], [], [{ id: "a", drink: a, until: 1 }]).map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("sorterer tider i blandede formater som tid", () => {
    const db = drink("db", "2026-11-06T20:00:00.5+00:00");
    const local = drink("local", "2026-11-06T20:00:00.400Z");
    expect(mergeDrinks([db], [insert(local)], []).map((d) => d.id)).toEqual(["local", "db"]);
  });
});

describe("waitingDrinkIds og waitingCount", () => {
  it("tæller mærkede rækker og giver id'erne på mærkede drinks", () => {
    const queue = [insert(a, { waiting: true }), insert(b), del("c", true)];
    expect([...waitingDrinkIds(queue)]).toEqual(["a"]);
    expect(waitingCount(queue)).toBe(2);
    expect(waitingCount([])).toBe(0);
  });
});

describe("queueRestore", () => {
  it("dropper en sletning, der ikke er sendt, og lægger den samme drink i køen", () => {
    expect(queueRestore([del("a")], a, null)).toEqual([insert(a)]);
  });

  it("lader en sletning, der er på vej, blive og sender drinken bagefter", () => {
    expect(queueRestore([del("a")], a, "delete:a")).toEqual([del("a"), insert(a)]);
  });

  it("lægger en drink, der er slettet på serveren, ind igen med samme id og tid", () => {
    const next = queueRestore([], a, null);
    expect(next).toEqual([insert(a)]);
    expect(next?.[0]).toMatchObject({ drink: { id: "a", created_at: a.created_at, stop_id: "s1" } });
  });

  it("gør intet, når drinken allerede ligger i køen", () => {
    expect(queueRestore([insert(a)], a, null)).toBeNull();
  });
});

describe("dropSettled", () => {
  it("fjerner skjulningen af en slettet drink og giver samme liste, når der intet er", () => {
    const list = addSettled([], "a", null, 10);
    expect(dropSettled(list, "a")).toEqual([]);
    expect(dropSettled(list, "b")).toBe(list);
  });
});
