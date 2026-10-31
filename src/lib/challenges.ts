// Udfordringer, der trækkes, når I ankommer til en pub. {navn} bliver til en tilfældig deltager.
export const CHALLENGES = [
  "Skål med en fremmed og find ud af, hvad de hedder.",
  "{navn} vælger, hvad bordet skal synge, når der skåles næste gang.",
  "Find nogen på pubben, der har julesweater på, og tag et billede med dem.",
  "Alle skal sige en ting, de er glade for i år. {navn} starter.",
  "{navn} skal lære bartenderen et nyt ord.",
  "Byt plads, så ingen sidder ved siden af den, de sad ved sidst.",
  "Gæt-en-sang: {navn} nynner, resten gætter. Taberen henter vand til bordet.",
  "Hvem kan tegne det bedste nisseansigt på en ølbrik? {navn} er dommer.",
  "Tag et gruppebillede, hvor alle laver den samme ansigtsgrimasse.",
  "{navn} skal finde den sjoveste ting på væggen og forklare, hvorfor den hænger der.",
  "Alle bestiller noget, de aldrig har smagt før. Vand og sodavand tæller.",
  "Ingen må sige \"øl\" før næste pub. Den, der siger det, giver et high five til alle.",
  "Ryst hånd med alle ved bordet som om, I mødes for første gang.",
  "{navn} fortæller den bedste historie fra en tidligere J-dag.",
  "Sten, saks, papir-turnering. Vinderen bestemmer, hvem der henter næste omgang.",
  "Alle drikker et glas vand, før næste omgang. Ingen undtagelser.",
  "{navn} skal få en fremmed til at give et julerim.",
  "Byt jakke med personen til venstre, indtil I går videre.",
  "Find tre ting på pubben, der er røde. Første hold, der finder dem, vinder.",
  "Skål på et andet sprog end dansk. {navn} vælger sproget.",
  "Hvem kan holde et ansigt uden at grine længst, mens {navn} kigger på dem?",
  "Alle giver {navn} en kompliment.",
  "Lav en hurtig quiz: {navn} stiller tre spørgsmål om nogen ved bordet.",
  "Ingen telefoner på bordet, før I går videre. Den, der tager sin frem, betaler snacks.",
  "{navn} skal finde ud af, hvornår pubben åbnede første gang.",
  "Tag et billede af skiltet udenfor med hele flokken foran.",
  "Pegeleg: på tre peger alle på den, der mest sandsynligt falder i søvn først.",
  "Sig navnet på en julesang for hvert bogstav i alfabetet, rundt om bordet.",
  "{navn} skal sige skål til hele pubben.",
  "Fri runde! Nyd det.",
];

export function drawChallenge(names: string[], previous?: string | null) {
  const pool = CHALLENGES.filter((c) => c !== previous);
  const template = pool[Math.floor(Math.random() * pool.length)];
  const name = names.length
    ? names[Math.floor(Math.random() * names.length)]
    : "Den yngste";
  return template.replaceAll("{navn}", name);
}
