// Stjerner og billeder (0007): stop_ratings, rate_stop, photos og storage-bucketten "photos".
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Stop } from "@/lib/types";
import { addStop, denied, leave, newCrawl, noRows, ok, users, uuid, type TestCrawl, type TestUser } from "./helpers";

type Rating = { stop_id: string; crawl_id: string; user_id: string; stars: number; created_at: string; updated_at: string };

let a: TestUser, b: TestUser, o: TestUser;
let crawl: TestCrawl, other: TestCrawl;
let stop: Stop, otherStop: Stop;

// Den mindste gyldige JPEG er ikke nødvendig: bucketten tjekker kun type og størrelse.
const JPEG = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9])], { type: "image/jpeg" });
const uploaded: { u: TestUser; path: string }[] = [];

function rate(u: TestUser, stopId: string, stars: number) {
  return u.c.rpc("rate_stop", { p_stop: stopId, p_stars: stars }).single<Rating>();
}

const photoPath = (crawlId: string, folder: string, ext = "jpg") => `${crawlId}/${folder}/${uuid()}.${ext}`;

async function upload(u: TestUser, path: string, body: Blob = JPEG, contentType = "image/jpeg") {
  const res = await u.c.storage.from("photos").upload(path, body, { contentType, upsert: false });
  if (!res.error) uploaded.push({ u, path });
  return res;
}

beforeAll(async () => {
  ({ a, b, o } = users());
  crawl = await newCrawl(a, b);
  stop = ok(await addStop(a, crawl.id));
  // En anden tur, hvor o er med, til test på tværs af ture.
  other = await newCrawl(o);
  otherStop = ok(await addStop(o, other.id, "Anden pub"));
});

afterAll(async () => {
  for (const { u, path } of uploaded) await u.c.storage.from("photos").remove([path]);
  await leave(crawl, b, a);
  await leave(other, o);
});

describe("stop_ratings og rate_stop", () => {
  it("sætter og ændrer ens egen stjerne", async () => {
    const first = ok(await rate(a, stop.id, 4));
    expect(first).toMatchObject({ stop_id: stop.id, crawl_id: crawl.id, user_id: a.id, stars: 4 });
    const second = ok(await rate(a, stop.id, 5));
    expect(second.stars).toBe(5);
    expect(new Date(second.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(first.updated_at).getTime());
    expect(ok(await a.c.from("stop_ratings").select("user_id").eq("stop_id", stop.id))).toHaveLength(1);
  });

  it("afviser 0 og 6 stjerner og en ukendt pub", async () => {
    denied(await rate(a, stop.id, 0), "invalid_stars");
    denied(await rate(a, stop.id, 6), "invalid_stars");
    denied(await rate(a, uuid(), 3), "stop_not_found");
  });

  it("udenforstående kan hverken se eller give stjerner", async () => {
    denied(await rate(o, stop.id, 1), "stop_not_found");
    denied(await o.c.from("stop_ratings").insert({ stop_id: stop.id, crawl_id: crawl.id, stars: 1 }));
    expect(ok(await o.c.from("stop_ratings").select("user_id").eq("crawl_id", crawl.id))).toEqual([]);
  });

  it("kan ikke give eller rette stjerner i en andens navn", async () => {
    denied(await b.c.from("stop_ratings").insert({ stop_id: stop.id, crawl_id: crawl.id, user_id: a.id, stars: 1 }));
    noRows(await b.c.from("stop_ratings").update({ stars: 1 }).eq("stop_id", stop.id).eq("user_id", a.id).select());
    noRows(await b.c.from("stop_ratings").delete().eq("stop_id", stop.id).eq("user_id", a.id).select());
    expect(ok(await b.c.from("stop_ratings").select("stars").eq("user_id", a.id).single<{ stars: number }>()).stars).toBe(5);
  });

  it("kun stjernerne kan rettes, ikke turen", async () => {
    ok(await a.c.from("stop_ratings").update({ stars: 3 }).eq("stop_id", stop.id).eq("user_id", a.id));
    denied(await a.c.from("stop_ratings").update({ crawl_id: other.id }).eq("stop_id", stop.id).eq("user_id", a.id));
  });

  it("en på holdet kan give og slette sin egen direkte", async () => {
    ok(await b.c.from("stop_ratings").insert({ stop_id: stop.id, crawl_id: crawl.id, stars: 2 }));
    expect(ok(await b.c.from("stop_ratings").delete().eq("stop_id", stop.id).eq("user_id", b.id).select())).toHaveLength(1);
  });
});

describe("billeder i storage", () => {
  let aPhoto: string, bPhoto: string, oPhoto: string;

  it("photo_path_member kender kun ens egne ture", async () => {
    expect(ok(await a.c.rpc("photo_path_member", { p_name: `${crawl.id}/ude/x.jpg` }))).toBe(true);
    expect(ok(await a.c.rpc("photo_path_member", { p_name: `${other.id}/ude/x.jpg` }))).toBe(false);
    expect(ok(await a.c.rpc("photo_path_member", { p_name: "../ude/x.jpg" }))).toBe(false);
  });

  it("kan lægges op i ens egen turs mappe", async () => {
    aPhoto = photoPath(crawl.id, stop.id);
    ok(await upload(a, aPhoto));
    bPhoto = photoPath(crawl.id, "ude", "webp");
    ok(await upload(b, bPhoto, new Blob([JPEG], { type: "image/webp" }), "image/webp"));
    oPhoto = photoPath(other.id, otherStop.id);
    ok(await upload(o, oPhoto));
  });

  it("kan ikke lægges op i en anden turs mappe", async () => {
    denied(await upload(a, photoPath(other.id, otherStop.id)));
    denied(await upload(o, photoPath(crawl.id, stop.id)));
  });

  it("afviser skæve stier, forkert filtype og for store filer", async () => {
    denied(await upload(a, `${crawl.id}/${uuid()}.jpg`));
    denied(await upload(a, `not-a-uuid/ude/${uuid()}.jpg`));
    denied(await upload(a, photoPath(crawl.id, "ude", "png"), new Blob([JPEG], { type: "image/png" }), "image/png"));
    const big = new Blob([new Uint8Array(4_200_000)], { type: "image/jpeg" });
    denied(await upload(a, photoPath(crawl.id, "ude"), big));
  });

  it("kan ikke overskrives", async () => {
    const res = await a.c.storage.from("photos").upload(aPhoto, JPEG, { contentType: "image/jpeg", upsert: true });
    denied(res);
  });

  // Rettet i 0014: før kunne holdet se filer, hvis række var slettet.
  it("en fil uden række ses kun af den, der lagde den op", async () => {
    ok(await a.c.storage.from("photos").download(aPhoto));
    denied(await b.c.storage.from("photos").createSignedUrl(aPhoto, 60));
    denied(await b.c.storage.from("photos").download(aPhoto));
    const list = await b.c.storage.from("photos").list(`${crawl.id}/${stop.id}`);
    expect(list.data ?? []).toEqual([]);
  });

  it("kan ikke ses på tværs af ture", async () => {
    denied(await o.c.storage.from("photos").createSignedUrl(aPhoto, 60));
    denied(await o.c.storage.from("photos").download(aPhoto));
    denied(await a.c.storage.from("photos").createSignedUrl(oPhoto, 60));
    denied(await a.c.storage.from("photos").download(oPhoto));
    const list = await a.c.storage.from("photos").list(`${other.id}/${otherStop.id}`);
    expect(list.data ?? []).toEqual([]);
  });

  it("en andens fil kan ikke slettes", async () => {
    const res = await b.c.storage.from("photos").remove([aPhoto]);
    expect(res.data ?? []).toEqual([]);
    ok(await a.c.storage.from("photos").download(aPhoto));
  });

  describe("photos-tabellen", () => {
    let row: { id: string };

    it("peger kun på en fil, man selv har lagt op i turen", async () => {
      row = ok(await a.c.from("photos").insert({ crawl_id: crawl.id, stop_id: stop.id, path: aPhoto }).select("id").single());
      ok(await b.c.from("photos").insert({ crawl_id: crawl.id, path: bPhoto }));
      // b kan ikke gøre a's fil til sin.
      denied(await b.c.from("photos").insert({ crawl_id: crawl.id, path: photoPathFrom(aPhoto) }));
      denied(await b.c.from("photos").insert({ crawl_id: crawl.id, path: aPhoto }));
      // En fil fra en anden tur kan ikke hænges på denne.
      denied(await o.c.from("photos").insert({ crawl_id: crawl.id, path: oPhoto }));
      denied(await a.c.from("photos").insert({ crawl_id: crawl.id, path: oPhoto }));
      denied(await a.c.from("photos").insert({ crawl_id: crawl.id, path: aPhoto, user_id: b.id }));
    });

    it("ses af holdet, men ikke udefra", async () => {
      expect(ok(await b.c.from("photos").select("id").eq("crawl_id", crawl.id))).toHaveLength(2);
      expect(ok(await o.c.from("photos").select("id").eq("crawl_id", crawl.id))).toEqual([]);
    });

    it("filen kan ses af holdet, når rækken findes", async () => {
      const signed = ok(await b.c.storage.from("photos").createSignedUrl(aPhoto, 60));
      expect(signed.signedUrl).toContain("token=");
      ok(await b.c.storage.from("photos").download(aPhoto));
      denied(await o.c.storage.from("photos").download(aPhoto));
    });

    it("kan kun slettes af den, der tog billedet", async () => {
      noRows(await b.c.from("photos").delete().eq("id", row.id).select());
      noRows(await o.c.from("photos").delete().eq("id", row.id).select());
      expect(ok(await a.c.from("photos").delete().eq("id", row.id).select())).toHaveLength(1);
      // Også hvis filen ikke nåede at blive slettet, kan holdet ikke længere se den. Signerede links spørger
      // altid databasen. download kan få et svar fra Supabases CDN, fordi b hentede filen lige før.
      denied(await b.c.storage.from("photos").createSignedUrl(aPhoto, 60));
      ok(await a.c.storage.from("photos").createSignedUrl(aPhoto, 60));
    });
  });
});

// Samme fil, men en anden mappe i stien. Bruges til at prøve en sti, der ikke findes i storage.
function photoPathFrom(path: string) {
  const [crawlId, , file] = path.split("/");
  return `${crawlId}/ude/${file}`;
}
