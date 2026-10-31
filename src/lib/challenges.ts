// Udfordringer, der trækkes, når I ankommer til en pub. {navn} bliver til en tilfældig deltager.
export const CHALLENGES = [
  "Skål med en fremmed og find ud af, hvad de hedder.",
  "{navn} vælger, hvad bordet skal synge, når der skåles næste gang.",
  "Find nogen i julesweater, og tag et billede med dem.",
  "Alle siger én ting, de er glade for i år. {navn} starter.",
  "{navn} skal lære bartenderen et nyt ord.",
  "Byt plads, så ingen sidder ved siden af den, de sad ved sidst.",
  "Gæt-en-sang: {navn} nynner, resten gætter. Taberen henter vand til bordet.",
  "Hvem kan tegne det bedste nisseansigt på en ølbrik? {navn} er dommer.",
  "Tag et gruppebillede, hvor alle laver den samme ansigtsgrimasse.",
  "{navn} finder det sjoveste på væggen og forklarer, hvorfor det hænger der.",
  "Alle bestiller noget, de aldrig har smagt før. Vand og sodavand tæller.",
  "Ingen siger \"øl\" før næste pub. Den, der gør, giver alle high five.",
  "Ryst hånd med alle ved bordet, som om I mødes for første gang.",
  "{navn} fortæller den bedste historie fra en tidligere J-dag.",
  "Sten, saks, papir-turnering. Vinderen bestemmer, hvem der henter næste omgang.",
  "Alle drikker et glas vand før næste omgang. Ingen undtagelser.",
  "{navn} skal få en fremmed til at give et julerim.",
  "Byt jakke med personen til venstre, indtil I går videre.",
  "Find tre røde ting på pubben. Den første, der finder dem, vinder.",
  "Skål på et andet sprog end dansk. {navn} vælger sproget.",
  "Hvem kan længst holde masken, mens {navn} kigger?",
  "Alle giver {navn} en kompliment.",
  "Lav en hurtig quiz: {navn} stiller tre spørgsmål om nogen ved bordet.",
  "Ingen telefoner på bordet, før I går videre. Taberen giver snacks.",
  "{navn} skal finde ud af, hvornår pubben åbnede første gang.",
  "Tag et billede af skiltet udenfor med hele flokken foran.",
  "Pegeleg: på tre peger alle på den, der falder i søvn først.",
  "Rundt om bordet: en julesang for hvert bogstav i alfabetet.",
  "{navn} skal sige skål til hele pubben.",
  "Ingen udfordring her. Nyd øllen.",
];

// Udfordringer uden noget at klare. Dem stemmer holdet ikke om, og de giver ingen point.
const NO_VOTE = new Set(["Ingen udfordring her. Nyd øllen."]);

export function needsVote(text: string) {
  return !NO_VOTE.has(text);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Er teksten lavet ud fra skabelonen? {navn} kan være hvem som helst, også én, der er gået hjem.
export function matchesTemplate(template: string, text: string) {
  if (!template.includes("{navn}")) return template === text;
  const [first, ...rest] = template.split("{navn}").map(escapeRegExp);
  // Står {navn} flere steder, er det det samme navn alle steder.
  return new RegExp(`^${first}(.+?)${rest.join("\\1")}$`).test(text);
}

// Returnerer også, hvem der blev trukket til {navn}, så udfordringen kan give point til dem.
// target er null, når skabelonen ikke har {navn} (en udfordring for hele holdet).
// previous er den udfyldte tekst fra sidst, så den samme skabelon ikke trækkes to gange i træk.
export function drawChallenge<T extends { name: string }>(
  people: T[],
  previous?: string | null,
): { text: string; target: T | null } {
  const pool = previous ? CHALLENGES.filter((c) => !matchesTemplate(c, previous)) : CHALLENGES;
  const template = pool[Math.floor(Math.random() * pool.length)];
  if (!template.includes("{navn}")) return { text: template, target: null };
  const target = people.length ? people[Math.floor(Math.random() * people.length)] : null;
  // Med en funktion, så $ i et navn ikke læses som et mønster ("Ca$$h" bliver ikke til "Ca$h").
  const name = target?.name ?? "Den yngste";
  return { text: template.replaceAll("{navn}", () => name), target };
}
