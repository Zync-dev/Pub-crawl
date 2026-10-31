import { describe, expect, it, vi } from "vitest";
import { CHALLENGES, drawChallenge, matchesTemplate } from "./challenges";

const people = [
  { user_id: "u1", name: "Lukas" },
  { user_id: "u2", name: "Mikkel" },
  { user_id: "u3", name: "Freja" },
];

// Math.random, så den peger på skabelon nummer index i en pulje af size skabeloner.
const at = (index: number, size: number) => (index + 0.5) / size;

describe("matchesTemplate", () => {
  it("genkender en udfyldt skabelon uanset navnet", () => {
    const template = "{navn} skal sige skål til hele pubben.";
    expect(matchesTemplate(template, "Mikkel skal sige skål til hele pubben.")).toBe(true);
    expect(matchesTemplate(template, "Den yngste skal sige skål til hele pubben.")).toBe(true);
    expect(matchesTemplate(template, "skal sige skål til hele pubben.")).toBe(false);
    expect(matchesTemplate(template, "Mikkel skal sige skål til hele baren.")).toBe(false);
  });

  it("tager tegn som ? og ( bogstaveligt", () => {
    const template = "Hvem kan holde et ansigt (længst), mens {navn} kigger på dem?";
    expect(matchesTemplate(template, "Hvem kan holde et ansigt (længst), mens Freja kigger på dem?")).toBe(true);
    expect(matchesTemplate(template, "Hvem kan holde et ansigt længst, mens Freja kigger på dem")).toBe(false);
  });

  it("kræver det samme navn, når {navn} står flere gange", () => {
    const template = "{navn} og {navn} igen";
    expect(matchesTemplate(template, "Bo og Bo igen")).toBe(true);
    expect(matchesTemplate(template, "Bo og Ida igen")).toBe(false);
  });

  it("sammenligner fællesudfordringer direkte", () => {
    expect(matchesTemplate("Ingen udfordring her. Nyd øllen.", "Ingen udfordring her. Nyd øllen.")).toBe(true);
    expect(matchesTemplate("Ingen udfordring her. Nyd øllen.", "Ingen udfordring her.")).toBe(false);
  });

  it("forveksler ingen af udfordringerne med hinanden", () => {
    for (const template of CHALLENGES) {
      for (const name of ["Lukas", "Den yngste", "Anne Sofie"]) {
        const text = template.replaceAll("{navn}", name);
        expect(CHALLENGES.filter((c) => matchesTemplate(c, text))).toEqual([template]);
      }
    }
  });
});

describe("drawChallenge med den forrige udfordring", () => {
  it("trækker ikke den samme skabelon igen, når den sidste var udfyldt med et navn", () => {
    const index = CHALLENGES.findIndex((c) => c.includes("{navn}"));
    const previous = CHALLENGES[index].replaceAll("{navn}", "Mikkel");
    // Puljen er én kortere, og Math.random peger på den plads, skabelonen ville have haft.
    vi.spyOn(Math, "random").mockReturnValueOnce(at(index, CHALLENGES.length - 1)).mockReturnValueOnce(0);
    const drawn = drawChallenge(people, previous);
    expect(drawn.text).toBe(CHALLENGES[index + 1].replaceAll("{navn}", "Lukas"));
  });

  it("trækker aldrig den samme to gange i træk, uanset hvem der var med", () => {
    for (const template of CHALLENGES) {
      const previous = template.replaceAll("{navn}", "Mikkel");
      for (let i = 0; i < 5; i++) {
        expect(matchesTemplate(template, drawChallenge(people, previous).text)).toBe(false);
      }
    }
  });

  it("kan trække alle skabeloner, når der ikke er nogen forrige", () => {
    vi.spyOn(Math, "random").mockReturnValue(at(CHALLENGES.length - 1, CHALLENGES.length));
    expect(drawChallenge(people, null).text).toBe(CHALLENGES[CHALLENGES.length - 1]);
  });
});

describe("drawChallenge og målet", () => {
  it("vælger målet blandt holdet og skriver det samme navn i teksten", () => {
    const index = CHALLENGES.findIndex((c) => c.includes("{navn}"));
    for (let p = 0; p < people.length; p++) {
      vi.spyOn(Math, "random")
        .mockReturnValueOnce(at(index, CHALLENGES.length))
        .mockReturnValueOnce(at(p, people.length));
      const drawn = drawChallenge(people);
      expect(drawn.target).toBe(people[p]);
      expect(drawn.text).toContain(people[p].name);
      expect(drawn.text).not.toContain("{navn}");
    }
  });

  it("giver altid et mål fra listen eller null", () => {
    for (let i = 0; i < 50; i++) {
      const drawn = drawChallenge(people);
      if (drawn.target) expect(people).toContain(drawn.target);
      else expect(drawn.text).not.toContain("{navn}");
    }
  });
});
