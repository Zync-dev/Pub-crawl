export const MEMBER_COLORS = [
  "#f5b83d",
  "#5ec8f2",
  "#f2709c",
  "#7ee08a",
  "#b48cf2",
  "#f2894b",
  "#4fd6c3",
  "#f2e14b",
  "#8ca8f2",
  "#e05e5e",
];

export function memberColor(index: number) {
  return MEMBER_COLORS[((index % 10) + 10) % 10];
}
