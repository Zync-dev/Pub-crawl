const KEY = "pubcrawl.name";

export function readName() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(KEY, name.trim());
  } catch {}
}
