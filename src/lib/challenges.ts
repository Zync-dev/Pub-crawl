// Udfordringer, der trækkes, når I ankommer til en pub. {navn} bliver til en tilfældig deltager.
export const CHALLENGES = [
  "Alle skal starte med en drink, de aldrig har prøvet før",
  "På denne bar vælges én hånd, og man må kun drikke med den hånd resten af aftenen. {navn} starter med at vælge.",
  "Vælg et ord (f.eks. 'øl'), som ingen må sige hele aftenen. Siger man det = straf (som i aftaler indbyrdes). {navn} vælger ordet.",
  "{navn} har på dette værtshus ansvaret for at vælge en drink, som alle skal smage.",
  "{navn} skal på denne bar udføre en \"dare\", som bestemmes af gruppen - eller tage en strafdrink.",
  "Når i sætter jer ned, må ingen rejse sig, før alle har drukket færdig.",
  "På dette værtshus, skal i alle rejse jer og danse mindst 30 sekunder på et vilkårligt tidspunkt. {navn} vælger tidspunktet.",
  "Alle skal på denne bar bestille noget forskelligt, og ingen må sige hvad de bestiller. Straftår til alle, hvis to bestiller det samme.",
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
