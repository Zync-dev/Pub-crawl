import { newId } from "./uuid";

// Et nyt emne til hver kanal. Supabase giver den gamle kanal tilbage, så længe den stadig er ved at
// lukke, og så lytter den nye aldrig. Det sker, når Next viser en side igen fra <Activity>.
// Ikke til kanaler med broadcast: der skal alle på holdet have det samme emne.
export function liveTopic(name: string, crawlId: string) {
  return `${name}:${crawlId}:${newId()}`;
}
