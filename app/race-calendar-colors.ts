export const raceCalendarColors = [
  { id: "green", labelCs: "Světle zelená", labelEn: "Light green", accent: "#16a34a", background: "#dcfce7", text: "#166534", muted: "#3f6212" },
  { id: "dark-green", labelCs: "Tmavě zelená", labelEn: "Dark green", accent: "#14532d", background: "#14532d", text: "#ffffff", muted: "#d1fae5" },
  { id: "magenta", labelCs: "Purpurová", labelEn: "Magenta", accent: "#a21caf", background: "#fae8ff", text: "#86198f", muted: "#701a75" },
  { id: "pink", labelCs: "Růžová", labelEn: "Pink", accent: "#db2777", background: "#fce7f3", text: "#9d174d", muted: "#831843" },
  { id: "red", labelCs: "Světle červená", labelEn: "Light red", accent: "#ef4444", background: "#fee2e2", text: "#b91c1c", muted: "#7f1d1d" },
  { id: "dark-red", labelCs: "Tmavě červená", labelEn: "Dark red", accent: "#7f1d1d", background: "#7f1d1d", text: "#ffffff", muted: "#fecaca" },
  { id: "teal", labelCs: "Tyrkysová", labelEn: "Teal", accent: "#0d9488", background: "#ccfbf1", text: "#0f766e", muted: "#115e59" },
  { id: "yellow", labelCs: "Žlutá", labelEn: "Yellow", accent: "#eab308", background: "#fef9c3", text: "#854d0e", muted: "#713f12" },
  { id: "brown", labelCs: "Hnědá", labelEn: "Brown", accent: "#78350f", background: "#f5e7d3", text: "#5f370e", muted: "#713f12" },
  { id: "orange", labelCs: "Oranžová", labelEn: "Orange", accent: "#f97316", background: "#ffedd5", text: "#c2410c", muted: "#9a3412" },
  { id: "blue", labelCs: "Světle modrá", labelEn: "Light blue", accent: "#3b82f6", background: "#dbeafe", text: "#1d4ed8", muted: "#1e40af" },
  { id: "dark-blue", labelCs: "Tmavě modrá", labelEn: "Dark blue", accent: "#1e3a8a", background: "#1e3a8a", text: "#ffffff", muted: "#dbeafe" },
  { id: "white", labelCs: "Bílá", labelEn: "White", accent: "#98a2b3", background: "#ffffff", text: "#344054", muted: "#667085" },
  { id: "gray", labelCs: "Šedá", labelEn: "Gray", accent: "#667085", background: "#e4e7ec", text: "#344054", muted: "#475467" },
  { id: "black", labelCs: "Černá", labelEn: "Black", accent: "#101828", background: "#101828", text: "#ffffff", muted: "#d0d5dd" },
  { id: "purple", labelCs: "Fialová", labelEn: "Purple", accent: "#7f56d9", background: "#ede9fe", text: "#6d28d9", muted: "#5b21b6" },
  { id: "ochre", labelCs: "Okrová", labelEn: "Ochre", accent: "#a16207", background: "#fef3c7", text: "#854d0e", muted: "#713f12" },
  { id: "dark", labelCs: "Tmavě šedá", labelEn: "Dark gray", accent: "#344054", background: "#344054", text: "#ffffff", muted: "#eaecf0" },
  { id: "light-gray", labelCs: "Světle šedá", labelEn: "Light gray", accent: "#98a2b3", background: "#f2f4f7", text: "#344054", muted: "#667085" },
  { id: "lime", labelCs: "Limetková", labelEn: "Lime", accent: "#65a30d", background: "#ecfccb", text: "#3f6212", muted: "#365314" },
  { id: "mint", labelCs: "Mátová", labelEn: "Mint", accent: "#059669", background: "#d1fae5", text: "#047857", muted: "#065f46" },
  { id: "cyan", labelCs: "Azurová", labelEn: "Cyan", accent: "#0891b2", background: "#cffafe", text: "#0e7490", muted: "#155e75" },
  { id: "indigo", labelCs: "Indigová", labelEn: "Indigo", accent: "#4f46e5", background: "#e0e7ff", text: "#4338ca", muted: "#3730a3" },
  { id: "coral", labelCs: "Korálová", labelEn: "Coral", accent: "#f97066", background: "#fff1f0", text: "#b42318", muted: "#912018" },
] as const;

export type RaceCalendarColor = (typeof raceCalendarColors)[number]["id"];

export function normalizeRaceCalendarColor(value: unknown): RaceCalendarColor {
  const candidate = String(value ?? "").trim();
  return raceCalendarColors.some((color) => color.id === candidate) ? candidate as RaceCalendarColor : "blue";
}

export function raceCalendarColorDefinition(value: unknown) {
  const normalized = normalizeRaceCalendarColor(value);
  return raceCalendarColors.find((color) => color.id === normalized) ?? raceCalendarColors[0];
}
