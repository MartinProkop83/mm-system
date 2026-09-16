/**
 * Sdílené typy a výpočty modulu „Nastavení → Servisní karta".
 *
 * Server-safe (spadá pod `app/*.ts` v tsconfig.server.json) — žádné DOM API, aby to mohly
 * importovat jak API routy, tak klientské komponenty, stejně jako `engine-family-rules.ts`.
 */

export type CounterUnit = "hours" | "days" | "race_weekends";
export type MaterialAttributeType = "dropdown" | "number" | "text";

export type EngineCategory = {
  id: string;
  code: string;
  nameCs: string;
  nameEn: string;
  sortOrder: number;
  /** null = kategorie počítadlo nemá; celá logika intervalů se pro ni přeskočí. */
  counterUnit: CounterUnit | null;
  /** Dokud je false, kategorie jede po staré servisní kartě (piston_minutes / rod_minutes). */
  serviceCardMigrated: boolean;
  archivedAt: number | null;
};

export type ServiceType = {
  id: string;
  engineCategoryId: string;
  code: string;
  nameCs: string;
  nameEn: string;
  descriptionCs: string;
  descriptionEn: string;
  sortOrder: number;
  archivedAt: number | null;
};

export type ServiceCardItem = {
  id: string;
  engineCategoryId: string;
  nameCs: string;
  nameEn: string;
  materialCategoryId: string | null;
  intervalMinutes: number | null;
  warnPercent: number;
  legacyPartKey: string | null;
  /** Ovlivňuje jen NOVÉ zápisy — jestli formulář nabídne jednu variantu, nebo opakovatelný
   *  seznam „varianta + počet kusů". Staré záznamy se čtou podle toho, co je v nich skutečně
   *  uložené, ne podle aktuální hodnoty tohoto přepínače. */
  allowMultipleVariants: boolean;
  sortOrder: number;
  archivedAt: number | null;
};

export type MaterialCategory = {
  id: string;
  engineCategoryId: string;
  nameCs: string;
  nameEn: string;
  sortOrder: number;
  archivedAt: number | null;
};

export type MaterialAttribute = {
  id: string;
  materialCategoryId: string;
  nameCs: string;
  nameEn: string;
  attributeType: MaterialAttributeType;
  unit: string;
  /** Jen pro typ `dropdown`; u ostatních prázdné pole. */
  options: string[];
  /** Pole technických údajů, kterému atribut odpovídá — díky tomu pozná servis rozchod hodnot. */
  technicalFieldId: string | null;
  sortOrder: number;
  archivedAt: number | null;
};

export type MaterialVariant = {
  id: string;
  materialCategoryId: string;
  name: string;
  /** Mapa `materialAttributes.id` → hodnota. */
  attributeValues: Record<string, string>;
  archivedAt: number | null;
};

/** Kopie materiálu v době zápisu — historie se čte odsud, ne z živého katalogu. */
export type MaterialSnapshot = {
  name: string;
  values: Array<{ nameCs: string; nameEn: string; value: string; unit: string }>;
};

export type ServiceRecordItem = {
  id: string;
  serviceRecordId: string;
  serviceCardItemId: string | null;
  itemNameCsSnapshot: string;
  itemNameEnSnapshot: string;
  materialVariantId: string | null;
  materialSnapshot: MaterialSnapshot | null;
  /** Kolik kusů této varianty. Víc variant u jedné položky = víc řádků se stejným
   *  serviceCardItemId, seskup je podle toho, ne podle tohoto pole. */
  quantity: number;
  sortOrder: number;
};

export type ServiceRecord = {
  id: string;
  engineId: string;
  serviceTypeId: string | null;
  /** Starý, oboujazyčně slepený text — dřívější záznamy bez `serviceTypeSnapshotCs/En`. */
  serviceTypeSnapshot: string;
  /** Prázdné u záznamů zapsaných před rozdělením podle jazyka — pak se čte `serviceTypeSnapshot`. */
  serviceTypeSnapshotCs: string;
  serviceTypeSnapshotEn: string;
  serviceDate: string;
  /** Volitelný čas HH:MM. Prázdný = neznámý, takový záznam patří na začátek svého dne. */
  serviceTime: string;
  /** Stav motohodin v minutách; null u kategorií bez počítadla i u záznamů z doby před ním. */
  counterMinutes: number | null;
  mechanicId: string | null;
  mechanicNameSnapshot: string;
  note: string;
  cancelledReason: string;
  cancelledAt: number | null;
  cancelledBy: string;
  /** Neprázdné, když mechanik vědomě nechal rozejít rozměr v servisu a v technických údajích. */
  divergenceNote: string;
  createdBy: string;
  createdAt: number;
  items: ServiceRecordItem[];
};

/**
 * Stav dlaždice položky.
 * - `none` — nic se neměří: kategorie nemá počítadlo, položka nemá interval, nebo zatím
 *   není žádný záznam. Dlaždice zůstává neutrální, bez čísel.
 * - `unmeasured` — záznamy existují, ale všechny vznikly v době bez počítadla
 *   (`counterMinutes === null`). Takové se ve výpočtu přeskakují, neberou se jako nula.
 * - `ok` / `warn` / `over` — zelená / oranžová / červená.
 */
export type TileState = "none" | "unmeasured" | "ok" | "warn" | "over";

export type TileStatus = {
  state: TileState;
  /** Najeto od poslední výměny, v minutách. Null, když se neměří. */
  runMinutes: number | null;
  intervalMinutes: number | null;
  /** Poslední nestornovaný záznam s touto položkou — i když neměl counterMinutes. */
  lastRecord: ServiceRecord | null;
};

/** sort_order se ukládá po desítkách, aby vložení doprostřed přepsalo jeden řádek místo všech. */
export const SORT_STEP = 10;

/** Přepočte pořadí na 10, 20, 30… ve výsledném pořadí seznamu. */
export function resequence<T extends { id: string }>(items: T[]): Array<{ id: string; sortOrder: number }> {
  return items.map((item, index) => ({ id: item.id, sortOrder: (index + 1) * SORT_STEP }));
}

/** Přesune položku `draggedId` na místo `targetId` a vrátí nové pořadí. */
export function reorderById<T extends { id: string }>(items: T[], draggedId: string, targetId: string): T[] {
  if (draggedId === targetId) return items;
  const from = items.findIndex((item) => item.id === draggedId);
  const to = items.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Klíč pro chronologické řazení. Záznam bez času se řadí na začátek dne — prázdný řetězec je
 * menší než kterékoli „HH:MM", takže vyjde dřív než cokoli téhož dne s časem.
 */
export function chronologicalKey(record: Pick<ServiceRecord, "serviceDate" | "serviceTime">) {
  return `${record.serviceDate} ${record.serviceTime}`;
}

/**
 * Najeto od poslední výměny a z toho barva dlaždice.
 *
 * Poslední záznam se bere podle **maxima `counterMinutes`**, ne podle data ani pořadí zápisu —
 * mechanik může servis zapsat zpětně, až když už existuje novější záznam.
 */
export function tileStatus(
  item: ServiceCardItem,
  records: ServiceRecord[],
  currentCounterMinutes: number,
  counterUnit: CounterUnit | null,
): TileStatus {
  const relevant = records.filter((record) =>
    !record.cancelledAt && record.items.some((recordItem) => recordItem.serviceCardItemId === item.id));
  // Dva servisy téhož dne rozlišuje čas; bez času platí začátek dne.
  const lastRecord = relevant.reduce<ServiceRecord | null>((latest, record) =>
    !latest || chronologicalKey(record) > chronologicalKey(latest) ? record : latest, null);

  if (!counterUnit || item.intervalMinutes === null || item.intervalMinutes <= 0 || relevant.length === 0) {
    return { state: "none", runMinutes: null, intervalMinutes: item.intervalMinutes, lastRecord };
  }

  const measured = relevant.filter((record) => record.counterMinutes !== null);
  if (measured.length === 0) {
    return { state: "unmeasured", runMinutes: null, intervalMinutes: item.intervalMinutes, lastRecord };
  }

  const lastCounter = Math.max(...measured.map((record) => record.counterMinutes as number));
  const runMinutes = Math.max(0, currentCounterMinutes - lastCounter);
  const warnAt = (item.intervalMinutes * item.warnPercent) / 100;
  const state: TileState = runMinutes > item.intervalMinutes ? "over" : runMinutes >= warnAt ? "warn" : "ok";
  return { state, runMinutes, intervalMinutes: item.intervalMinutes, lastRecord };
}

/** Editace servisního záznamu je povolená 24 hodin od zápisu; potom už jen storno. */
export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithinEditWindow(record: Pick<ServiceRecord, "createdAt" | "cancelledAt">, now = Date.now()) {
  return !record.cancelledAt && now - record.createdAt <= EDIT_WINDOW_MS;
}

/**
 * „Typ servisu" v aktuálním jazyce. Záznamy zapsané před rozdělením snapshotu podle jazyka
 * mají `serviceTypeSnapshotCs`/`En` prázdné — u nich se vrátí starý, oboujazyčně slepený
 * text (jinou volbu nemají, žádný jazyk z něj nejde zpětně bezpečně rozdělit).
 */
export function localizedServiceTypeSnapshot(
  record: Pick<ServiceRecord, "serviceTypeSnapshot" | "serviceTypeSnapshotCs" | "serviceTypeSnapshotEn">,
  locale: "cs" | "en",
): string {
  const perLocale = locale === "cs" ? record.serviceTypeSnapshotCs : record.serviceTypeSnapshotEn;
  return perLocale || record.serviceTypeSnapshot;
}

/** Minuty → „16:29". Stejný formát, jaký používá záložka Motohodiny. */
export function formatCounterMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "";
  const safe = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/** „16:29" → minuty. Vrací null pro prázdný nebo neplatný vstup. */
export function parseCounterMinutes(value: string): number | null {
  const match = /^(\d{1,4}):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Předvyplněný název varianty — hodnoty atributů v pořadí `sortOrder`, spojené mezerou
 * („Vertex" + „41.86" → „Vertex 41.86"). Uživatel ho může ručně přepsat.
 */
export function suggestVariantName(attributes: MaterialAttribute[], values: Record<string, string>): string {
  return attributes
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((attribute) => values[attribute.id]?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

export type ServiceRecordItemGroup = {
  /** Klíč skupiny — `serviceCardItemId ?? id` prvního řádku, viz níže proč. */
  key: string;
  serviceCardItemId: string | null;
  itemNameCsSnapshot: string;
  itemNameEnSnapshot: string;
  variants: Array<{ name: string; quantity: number }>;
};

/**
 * Seskupí řádky jednoho servisního záznamu podle položky karty — víc variant u jedné položky
 * (Gufera) jsou v datech víc řádků se stejným `serviceCardItemId`, tahle funkce je spojí
 * zpátky do jedné položky se seznamem variant. Používá se stejně v dlaždici, v historii na
 * kartě motoru i v reportu servisní historie, aby všechna tři místa četla víc-variantní
 * záznam identicky bez ohledu na to, jak je dnes nastavený přepínač u položky karty.
 *
 * Řádky bez `serviceCardItemId` (stará historie s nerozpoznaným dílem) se nikdy neslučují
 * mezi sebou — každá je vlastní skupina podle svého `id`, i kdyby jich v jednom záznamu bylo
 * víc s null `serviceCardItemId` zároveň.
 */
export function groupServiceRecordItems(items: ServiceRecordItem[]): ServiceRecordItemGroup[] {
  const order: string[] = [];
  const groups = new Map<string, ServiceRecordItemGroup>();
  for (const item of items) {
    const key = item.serviceCardItemId ?? `row:${item.id}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, serviceCardItemId: item.serviceCardItemId, itemNameCsSnapshot: item.itemNameCsSnapshot, itemNameEnSnapshot: item.itemNameEnSnapshot, variants: [] };
      groups.set(key, group);
      order.push(key);
    }
    if (item.materialSnapshot) group.variants.push({ name: item.materialSnapshot.name, quantity: item.quantity });
  }
  return order.map((key) => groups.get(key) as ServiceRecordItemGroup);
}

/**
 * Řádky pro zobrazení variant jedné položky — jeden řetězec na variantu, ne jeden spojený
 * text: „41.82" u jednoho kusu jedné varianty (beze změny oproti dřívějšímu jednoduchému
 * zápisu), „3× 41.82" u víc kusů, dvě položky pole „1× …" a „2× …" u víc variant zároveň.
 * Prázdné pole (zaškrtávací položka bez materiálu) vrátí prázdné pole.
 *
 * Volající si řádky poskládá podle místa, které má k dispozici — každý na vlastní řádek
 * (dlaždice, rozbalená historie), nebo je spojí oddělovačem, který se v názvech variant
 * nevyskytuje (report, kde na víc řádků není místo) — NIKDY čárkou, ta je běžnou součástí
 * názvů v katalogu materiálu (např. „OIL SEAL, 25 X 38 X 7 MM").
 */
export function formatVariantList(variants: Array<{ name: string; quantity: number }>): string[] {
  if (variants.length === 0) return [];
  if (variants.length === 1 && variants[0].quantity === 1) return [variants[0].name];
  return variants.map((variant) => `${variant.quantity}× ${variant.name}`);
}
