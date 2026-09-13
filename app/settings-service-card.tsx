"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";
import { useModalA11y } from "./use-modal-a11y";
import {
  formatCounterMinutes,
  parseCounterMinutes,
  reorderById,
  suggestVariantName,
  type EngineCategory,
  type MaterialAttribute,
  type MaterialAttributeType,
  type MaterialCategory,
  type MaterialVariant,
  type ServiceCardItem,
  type ServiceType,
} from "./service-card-shared";

type Locale = "cs" | "en";
type Tab = "types" | "items" | "material";
type DefaultItemLink = { serviceTypeId: string; serviceCardItemId: string };

/** Souhrn přenosu staré historie — stejný tvar pro náhled i ostrý běh (db/runtime-schema.ts). */
type LegacyMigrationSummary = {
  categoryCode: string;
  records: number;
  alreadyImported: number;
  items: number;
  unmatchedPartKeys: string[];
  samples: Array<{ engineCode: string; serviceDate: string; serviceType: string; items: string[] }>;
};

type TechnicalFieldOption = { id: string; labelCs: string; labelEn: string; sectionCs: string };

type SettingsData = {
  technicalFields: TechnicalFieldOption[];
  categories: EngineCategory[];
  categoryId: string;
  serviceTypes: ServiceType[];
  defaultItems: DefaultItemLink[];
  cardItems: ServiceCardItem[];
  materialCategories: MaterialCategory[];
  materialAttributes: MaterialAttribute[];
  materialVariants: MaterialVariant[];
};

const content = {
  cs: {
    title: "Servisní karta",
    intro: "Typy servisu, položky karty a katalog materiálu — zvlášť pro každou kategorii motoru.",
    category: "Kategorie motoru",
    tabs: { types: "Typy servisu", items: "Položky karty", material: "Materiál" },
    loading: "Načítám nastavení…",
    loadError: "Nastavení se nepodařilo načíst.",
    retry: "Zkusit znovu",
    forbidden: "Tuto část může spravovat pouze superadmin.",
    dragHint: "Přetažením změníš pořadí",
    code: "Kód",
    name: "Název",
    nameCs: "Název CZ",
    nameEn: "Název EN",
    description: "Popis",
    defaults: "Výchozí položky",
    active: "Aktivní",
    inactive: "Neaktivní",
    actions: "Akce",
    edit: "Upravit",
    remove: "Odebrat",
    cancel: "Zrušit",
    save: "Uložit",
    saving: "Ukládám…",
    addType: "Přidat typ servisu",
    editType: "Upravit typ servisu",
    newType: "Nový typ servisu",
    noTypes: "Zatím žádné typy servisu",
    noTypesHelp: "Přidej první typ tlačítkem níže. Pořadí pak nastavíš přetažením.",
    takeFrom: "Převzít z…",
    takeFromHint: "Jednorázově zkopíruje zaškrtnuté položky. Žádná trvalá vazba — pozdější změna zdrojového typu se sem nepromítne.",
    defaultItemsLegend: "Výchozí položky tohoto typu",
    ofItems: (selected: number, total: number) => `${selected} ze ${total}`,
    noDefaults: "Bez výchozích položek",
    addItem: "Přidat položku",
    editItem: "Upravit položku karty",
    newItem: "Nová položka karty",
    noItems: "Zatím žádné položky karty",
    noItemsHelp: "Položky jsou dlaždice na servisní kartě motoru.",
    materialCategory: "Kategorie materiálu",
    noMaterial: "— bez materiálu —",
    materialHint: "Vyplněná kategorie znamená, že mechanik dostane u položky dropdown s variantami. Prázdná = jen zaškrtávátko.",
    interval: "Interval",
    intervalHint: "Ve tvaru HH:MM, stejně jako motohodiny. Prázdné = položka se nehlídá.",
    warnPercent: "Varovný práh",
    warnPercentHint: "Od kolika procent intervalu dlaždice zoranžoví.",
    materialCategories: "Kategorie materiálu",
    addMaterialCategory: "Přidat kategorii",
    editMaterialCategory: "Upravit kategorii materiálu",
    newMaterialCategory: "Nová kategorie materiálu",
    noMaterialCategories: "Zatím žádné kategorie materiálu",
    attributes: "Atributy",
    attributesHint: "Atributy patří ke kategorii, ne ke katalogu jako celku. Písty mají značku a rozměr, těsnění typ a sílu.",
    addAttribute: "Přidat atribut",
    editAttribute: "Upravit atribut",
    newAttribute: "Nový atribut",
    noAttributes: "Tato kategorie zatím nemá atributy",
    type: "Typ",
    unit: "Jednotka",
    attributeTypes: { dropdown: "Výběr", number: "Číslo", text: "Text" },
    options: "Hodnoty výběru",
    optionsHint: "Napiš hodnotu a potvrď Enterem. Křížkem štítek smažeš.",
    optionPlaceholder: "Hodnota a Enter…",
    technicalField: "Odpovídá poli technických údajů",
    technicalFieldNone: "— nepropojeno —",
    technicalFieldHint: "Když je propojeno, formulář servisu pozná, že se vybraný materiál liší od technických údajů, a nabídne jejich srovnání.",
    technicalFieldEmpty: "Tato rodina zatím nemá žádné pole typu Výběr v technických údajích.",
    dropWarn: (count: number) => `Přepnutím z Výběru zahodíš ${count === 1 ? "1 hodnotu" : count < 5 ? `${count} hodnoty` : `${count} hodnot`}.`,
    dropTitle: "Zahodit hodnoty výběru?",
    dropIntro: (count: number) => `Atribut přestane být Výběr, takže ${count === 1 ? "jeho jediná hodnota" : "jeho hodnoty"} zmizí. Vrátit je zpět bude znamenat napsat je znovu.`,
    dropList: "Co se zahodí",
    dropKeepHint: "Chceš-li je zachovat, zruš tenhle dialog a nech typ na Výběru.",
    dropConfirm: "Zahodit a uložit",
    variants: "Varianty",
    variantsHint: "To, co mechanik vybírá z dropdownu. Atributy nikdy nevyplňuje ručně.",
    addVariant: "Přidat variantu",
    editVariant: "Upravit variantu",
    newVariant: "Nová varianta",
    noVariants: "Tato kategorie zatím nemá varianty",
    variantName: "Název varianty",
    variantNameHint: "Předvyplní se složením hodnot atributů, ale můžeš ho přepsat.",
    selectMaterialCategory: "Vyber kategorii materiálu vlevo.",
    legacyTitle: "Tato kategorie zatím jede po staré servisní kartě.",
    legacyIntro: "Definice níže se uloží, ale karta motoru je zatím nepoužívá. Přepnutím se karta začne generovat odsud.",
    switchOver: "Přepnout na novou kartu",
    switching: "Přepínám…",
    missingItems: "Nejdřív přidej aspoň jednu položku karty.",
    missingIntervals: (names: string) => `Doplň interval u položek: ${names}.`,
    switchTitle: "Přepnout kategorii na novou servisní kartu?",
    switchLoses: "Co zanikne",
    switchLosesText: "Automatický reset počítadel Píst od výměny a Ojnice / klika při zaškrtnutí dílu ve formuláři servisu.",
    switchGains: "Co ho nahradí",
    switchGainsText: "Stav dlaždic počítaný z intervalů, které jsi u položek nastavil. Historie se převede a u každého motoru vznikne výchozí záznam dopočítaný z dnešních motohodin, aby dlaždice nezačaly od nuly.",
    switchIrreversible: "Staré sloupce se nemažou, jen se přestanou aktualizovat.",
    switchConfirm: "Přepnout",
    switchDone: (count: number) => `Kategorie je přepnutá. Výchozích záznamů: ${count}.`,
    confirmRemove: (name: string) => `Odebrat „${name}“? Zmizí z nabídky při novém zápisu, ale v historii zůstane.`,
    genericError: "Změnu se nepodařilo uložit.",
    duplicateCode: "Typ servisu s tímto kódem už existuje.",
    invalidInterval: "Interval zadej ve tvaru HH:MM.",
    historyTitle: "Stará historie servisu čeká na přenos",
    historyIntro: "Záznamy ze staré servisní karty se do nové historie nepřenesou samy. Nejdřív si prohlédni náhled, teprve pak spusť přenos.",
    historyPreview: "Náhled přenosu",
    historyPreviewing: "Počítám…",
    historyRun: "Přenést historii",
    historyRunning: "Přenáším…",
    historyNothing: "Není co přenášet — stará historie je prázdná nebo už přenesená.",
    historyCount: (records: number, items: number) => `K přenesení: ${records} záznamů, ${items} položek.`,
    historyUnmatched: (keys: string) => `Bez odpovídající položky karty (přenese se jen název): ${keys}`,
    historySamples: "Ukázka prvních záznamů",
    historyDone: (records: number) => `Přeneseno ${records} záznamů.`,
    historyDryRunNote: "Náhled nic nezapisuje.",
    revertTitle: "Přenesená historie",
    revertIntro: "Přenos šel vrátit — smaže se jen to, co založil. Ruční zápisy mechaniků zůstanou.",
    revertCount: (records: number) => `Z přenosu pochází ${records} záznamů.`,
    revertButton: "Vrátit přenos",
    revertRunning: "Vracím…",
    revertConfirmTitle: "Vrátit přenos staré historie?",
    revertWhatGoes: "Co se smaže",
    revertWatchOut: "Na co si dát pozor",
    revertConfirmBody: "Smažou se výhradně záznamy založené přenosem. Ručních zápisů ani záznamů dopočítaných při přepnutí kategorie se to nedotkne.",
    revertConfirmWarn: "Pokud někdo přenesený záznam mezitím upravil nebo stornoval, zmizí i ta úprava.",
    revertConfirmSafe: "Stará tabulka engine_service_entries zůstává nedotčená, takže přenos jde pak spustit znovu.",
    revertConfirm: "Vrátit přenos",
    revertDone: (records: number) => `Vráceno ${records} záznamů.`,
  },
  en: {
    title: "Service card",
    intro: "Service types, card items and the material catalogue — per engine category.",
    category: "Engine category",
    tabs: { types: "Service types", items: "Card items", material: "Material" },
    loading: "Loading settings…",
    loadError: "Settings could not be loaded.",
    retry: "Try again",
    forbidden: "Only a superadmin can manage this section.",
    dragHint: "Drag to reorder",
    code: "Code",
    name: "Name",
    nameCs: "Name CZ",
    nameEn: "Name EN",
    description: "Description",
    defaults: "Default items",
    active: "Active",
    inactive: "Inactive",
    actions: "Actions",
    edit: "Edit",
    remove: "Remove",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    addType: "Add service type",
    editType: "Edit service type",
    newType: "New service type",
    noTypes: "No service types yet",
    noTypesHelp: "Add the first one below. Order is then set by dragging.",
    takeFrom: "Take from…",
    takeFromHint: "Copies the ticked items once. No lasting link — later changes to the source type are not reflected here.",
    defaultItemsLegend: "Default items for this type",
    ofItems: (selected: number, total: number) => `${selected} of ${total}`,
    noDefaults: "No default items",
    addItem: "Add card item",
    editItem: "Edit card item",
    newItem: "New card item",
    noItems: "No card items yet",
    noItemsHelp: "Items are the tiles on an engine's service card.",
    materialCategory: "Material category",
    noMaterial: "— no material —",
    materialHint: "A material category means the mechanic gets a variant dropdown for this item. Empty means a plain tick box.",
    interval: "Interval",
    intervalHint: "As HH:MM, same as running hours. Empty means the item is not tracked.",
    warnPercent: "Warning threshold",
    warnPercentHint: "The share of the interval at which the tile turns amber.",
    materialCategories: "Material categories",
    addMaterialCategory: "Add category",
    editMaterialCategory: "Edit material category",
    newMaterialCategory: "New material category",
    noMaterialCategories: "No material categories yet",
    attributes: "Attributes",
    attributesHint: "Attributes belong to a category, not to the catalogue as a whole. Pistons have a brand and a size, gaskets a type and a thickness.",
    addAttribute: "Add attribute",
    editAttribute: "Edit attribute",
    newAttribute: "New attribute",
    noAttributes: "This category has no attributes yet",
    type: "Type",
    unit: "Unit",
    attributeTypes: { dropdown: "Dropdown", number: "Number", text: "Text" },
    options: "Dropdown values",
    optionsHint: "Type a value and press Enter. The × removes a chip.",
    optionPlaceholder: "Value, then Enter…",
    technicalField: "Matches technical-data field",
    technicalFieldNone: "— not linked —",
    technicalFieldHint: "When linked, the service form notices that the chosen material differs from the technical data and offers to reconcile them.",
    technicalFieldEmpty: "This family has no Dropdown field in its technical data yet.",
    dropWarn: (count: number) => `Switching away from Dropdown discards ${count} value${count === 1 ? "" : "s"}.`,
    dropTitle: "Discard the dropdown values?",
    dropIntro: (count: number) => `The attribute stops being a Dropdown, so ${count === 1 ? "its only value" : "its values"} will be gone. Getting them back means typing them again.`,
    dropList: "What gets discarded",
    dropKeepHint: "To keep them, cancel this dialog and leave the type as Dropdown.",
    dropConfirm: "Discard and save",
    variants: "Variants",
    variantsHint: "What the mechanic picks from the dropdown. They never fill in attributes by hand.",
    addVariant: "Add variant",
    editVariant: "Edit variant",
    newVariant: "New variant",
    noVariants: "This category has no variants yet",
    variantName: "Variant name",
    variantNameHint: "Pre-filled from the attribute values, but you can overwrite it.",
    selectMaterialCategory: "Pick a material category on the left.",
    legacyTitle: "This category still uses the legacy service card.",
    legacyIntro: "The definitions below are saved but not yet used by the engine card. Switching over makes the card generate from here.",
    switchOver: "Switch to the new card",
    switching: "Switching…",
    missingItems: "Add at least one card item first.",
    missingIntervals: (names: string) => `Set an interval for: ${names}.`,
    switchTitle: "Switch this category to the new service card?",
    switchLoses: "What goes away",
    switchLosesText: "The automatic reset of the Piston since replacement and Rod / crank counters when a part is ticked in the service form.",
    switchGains: "What replaces it",
    switchGainsText: "Tile state computed from the intervals you set on the items. History is carried over and each engine gets a starting record derived from today's running hours, so tiles do not start from zero.",
    switchIrreversible: "The old columns are not dropped, they just stop being updated.",
    switchConfirm: "Switch",
    switchDone: (count: number) => `Category switched over. Starting records: ${count}.`,
    confirmRemove: (name: string) => `Remove "${name}"? It disappears from new entries but stays visible in history.`,
    genericError: "The change could not be saved.",
    duplicateCode: "A service type with this code already exists.",
    invalidInterval: "Enter the interval as HH:MM.",
    historyTitle: "Legacy service history is waiting to be carried over",
    historyIntro: "Records from the old service card are not carried over automatically. Check the preview first, then run the transfer.",
    historyPreview: "Preview transfer",
    historyPreviewing: "Counting…",
    historyRun: "Carry history over",
    historyRunning: "Transferring…",
    historyNothing: "Nothing to carry over — the legacy history is empty or already transferred.",
    historyCount: (records: number, items: number) => `To transfer: ${records} records, ${items} items.`,
    historyUnmatched: (keys: string) => `No matching card item (only the name is carried over): ${keys}`,
    historySamples: "Sample of the first records",
    historyDone: (records: number) => `${records} records transferred.`,
    historyDryRunNote: "The preview writes nothing.",
    revertTitle: "Imported history",
    revertIntro: "The transfer can be undone — only what it created is removed. Entries made by mechanics stay.",
    revertCount: (records: number) => `${records} records come from the transfer.`,
    revertButton: "Undo transfer",
    revertRunning: "Undoing…",
    revertConfirmTitle: "Undo the legacy history transfer?",
    revertWhatGoes: "What gets deleted",
    revertWatchOut: "Watch out for",
    revertConfirmBody: "Only records created by the transfer are deleted. Manual entries and records derived when switching a category over are untouched.",
    revertConfirmWarn: "If someone has since edited or cancelled an imported record, that change goes too.",
    revertConfirmSafe: "The legacy engine_service_entries table stays untouched, so the transfer can be run again afterwards.",
    revertConfirm: "Undo transfer",
    revertDone: (records: number) => `${records} records undone.`,
  },
} as const;

type Copy = (typeof content)[Locale];

const API = "/api/service-card-settings";

async function api(method: string, body: Record<string, unknown>) {
  const response = await fetch(API, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as { error?: string; seededRecords?: number };
  if (!response.ok) throw new Error(data.error || "save_failed");
  return data;
}

/** OKN-J sdílí barevný tón s OKN, stejně jako všude jinde v aplikaci. */
function categoryTone(code: string) {
  return (code === "OKN-J" ? "okn" : code).toLowerCase();
}

function localized(locale: Locale, cs: string, en: string) {
  return locale === "cs" ? cs : en || cs;
}

export function ServiceCardSettings({ locale, role }: { locale: Locale; role: "superadmin" | "boss" | "mechanic" }) {
  const t = content[locale];
  const [data, setData] = useState<SettingsData | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [tab, setTab] = useState<Tab>("types");
  const [loading, setLoading] = useState(role === "superadmin");
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (targetCategoryId?: string) => {
    if (role !== "superadmin") return;
    setLoadError(false);
    try {
      const query = targetCategoryId ? `?categoryId=${encodeURIComponent(targetCategoryId)}` : "";
      const response = await fetch(`${API}${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const payload = (await response.json()) as SettingsData;
      setData(payload);
      setCategoryId(payload.categoryId);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<unknown>, successNotice = "") {
    setSaving(true);
    setError("");
    try {
      await action();
      await load(categoryId);
      // Prázdný text hlášku nemaže — akce si ji mohla nastavit sama.
      if (successNotice) setNotice(successNotice);
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "save_failed";
      setError(message === "duplicate" || message.includes("already exists") ? t.duplicateCode : t.genericError);
    } finally {
      setSaving(false);
    }
  }

  if (role !== "superadmin") {
    return (
      <section className="dash-panel settings-forbidden">
        <span aria-hidden="true">🔒</span>
        <h2>{t.title}</h2>
        <p>{t.forbidden}</p>
      </section>
    );
  }

  if (loading) return <section className="dash-panel"><LoadingState size="inline" label={t.loading} /></section>;
  if (loadError || !data) {
    return (
      <section className="dash-panel">
        <EmptyState variant="error" size="inline" icon="!" title={t.loadError}
          action={<button className="secondary-compact" type="button" onClick={() => void load()}>{t.retry}</button>} />
      </section>
    );
  }

  const category = data.categories.find((item) => item.id === categoryId) ?? null;

  return (
    <div className="service-card-settings">
      <article className="dash-panel settings-hero">
        <div>
          <span className="settings-kicker">MM SYSTEM · SERVICE CARD</span>
          <h2>{t.title}</h2>
          <p>{t.intro}</p>
        </div>
      </article>

      <div className="carb-unit-filters" aria-label={t.category}>
        <div className="carb-unit-category-tiles">
          {data.categories.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`carb-unit-tile tone-${categoryTone(item.code)}${item.id === categoryId ? " active" : ""}`}
              aria-pressed={item.id === categoryId}
              onClick={() => { setCategoryId(item.id); setNotice(""); setError(""); void load(item.id); }}
            >
              {item.code}
              {item.counterUnit && <small aria-label={locale === "cs" ? "Sleduje motohodiny" : "Tracks running hours"}>⏱</small>}
            </button>
          ))}
        </div>
      </div>

      {category && !category.serviceCardMigrated && (
        <LegacyCategoryPanel t={t} locale={locale} category={category} cardItems={data.cardItems} saving={saving}
          onSwitched={(count) => { setNotice(t.switchDone(count)); void load(categoryId); }}
          onError={() => setError(t.genericError)} />
      )}

      <LegacyHistoryPanel t={t} onError={() => setError(t.genericError)} />

      <nav className="engine-tabs" aria-label={t.title}>
        {(["types", "items", "material"] as Tab[]).map((item) => (
          <button key={item} type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{t.tabs[item]}</button>
        ))}
      </nav>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && !error && <p className="form-hint" role="status">{notice}</p>}

      {tab === "types" && <ServiceTypesTab t={t} locale={locale} data={data} categoryId={categoryId} saving={saving} run={run} />}
      {tab === "items" && <CardItemsTab t={t} locale={locale} data={data} category={category} categoryId={categoryId} saving={saving} run={run} />}
      {tab === "material" && <MaterialTab t={t} locale={locale} data={data} categoryId={categoryId} saving={saving} run={run} />}
    </div>
  );
}

/** Úchyt pro přetažení řádku — drag&drop stejně jako v plánu závodu (nativní HTML5, bez knihovny). */
function DragRow({ id, dragged, setDragged, onDrop, title, children }: {
  id: string;
  dragged: string | null;
  setDragged: (value: string | null) => void;
  onDrop: (draggedId: string, targetId: string) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <tr
      className={dragged === id ? "sc-dragging" : ""}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); if (dragged) onDrop(dragged, id); setDragged(null); }}
    >
      <td className="sc-handle-cell">
        <span
          className="sc-drag-handle"
          draggable
          role="button"
          tabIndex={-1}
          aria-label={title}
          title={title}
          onDragStart={() => setDragged(id)}
          onDragEnd={() => setDragged(null)}
        >⠿</span>
      </td>
      {children}
    </tr>
  );
}

function ActiveCell({ t, archivedAt }: { t: Copy; archivedAt: number | null }) {
  return <td><span className={`status-pill ${archivedAt ? "neutral" : "success"}`}>{archivedAt ? t.inactive : t.active}</span></td>;
}

function RowActions({ t, onEdit, onRemove, disabled }: { t: Copy; onEdit: () => void; onRemove: () => void; disabled: boolean }) {
  return (
    <td className="action-column">
      <div className="record-actions">
        <button type="button" onClick={onEdit} aria-label={t.edit} title={t.edit}>✎</button>
        <button className="delete" type="button" disabled={disabled} onClick={onRemove} aria-label={t.remove} title={t.remove}>🗑</button>
      </div>
    </td>
  );
}

// --- Záložka 1: Typy servisu -----------------------------------------------------------

function ServiceTypesTab({ t, locale, data, categoryId, saving, run }: {
  t: Copy; locale: Locale; data: SettingsData; categoryId: string; saving: boolean;
  run: (action: () => Promise<unknown>, notice?: string) => Promise<void>;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [editing, setEditing] = useState<ServiceType | "new" | null>(null);
  const types = data.serviceTypes;

  function defaultsFor(typeId: string) {
    return data.defaultItems.filter((link) => link.serviceTypeId === typeId).map((link) => link.serviceCardItemId);
  }

  function reorder(draggedId: string, targetId: string) {
    const next = reorderById(types, draggedId, targetId);
    void run(() => api("PUT", { kind: "reorder", resource: "serviceType", ids: next.map((item) => item.id) }));
  }

  return (
    <section className="dash-panel">
      <header className="settings-section-heading">
        <div><h3>{t.tabs.types}</h3><p>{t.takeFromHint}</p></div>
      </header>

      {types.length === 0 ? (
        <EmptyState size="inline" title={t.noTypes} description={t.noTypesHelp} />
      ) : (
        <div className="table-wrap">
          <table className="settings-table sc-table">
            <thead><tr>
              <th className="sc-handle-cell" aria-label={t.dragHint} /><th>{t.code}</th><th>{t.name}</th>
              <th>{t.defaults}</th><th>{t.active}</th><th className="action-column">{t.actions}</th>
            </tr></thead>
            <tbody>
              {types.map((type) => {
                const selected = defaultsFor(type.id).length;
                return (
                  <DragRow key={type.id} id={type.id} dragged={dragged} setDragged={setDragged} onDrop={reorder} title={t.dragHint}>
                    <td><span className="equipment-code">{type.code}</span></td>
                    <td><strong>{localized(locale, type.nameCs, type.nameEn)}</strong>
                      {localized(locale, type.descriptionCs, type.descriptionEn) && <small className="cell-note">{localized(locale, type.descriptionCs, type.descriptionEn)}</small>}</td>
                    <td>{selected > 0 ? t.ofItems(selected, data.cardItems.filter((item) => !item.archivedAt).length) : <span className="cell-note">{t.noDefaults}</span>}</td>
                    <ActiveCell t={t} archivedAt={type.archivedAt} />
                    <RowActions t={t} disabled={saving} onEdit={() => setEditing(type)}
                      onRemove={() => { if (window.confirm(t.confirmRemove(localized(locale, type.nameCs, type.nameEn)))) void run(() => api("DELETE", { kind: "serviceType", id: type.id })); }} />
                  </DragRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="sc-table-footer">
        <button className="primary-button" type="button" onClick={() => setEditing("new")}>＋ {t.addType}</button>
      </div>

      {editing && (
        <ServiceTypeModal
          t={t} locale={locale} saving={saving} data={data} categoryId={categoryId}
          type={editing === "new" ? null : editing}
          initialItemIds={editing === "new" ? [] : defaultsFor(editing.id)}
          onClose={() => setEditing(null)}
          onSubmit={async (values, itemIds) => {
            await run(async () => {
              const payload = {
                kind: "serviceType", categoryId, code: values.code, nameCs: values.nameCs, nameEn: values.nameEn,
                descriptionCs: values.descriptionCs, descriptionEn: values.descriptionEn, isActive: values.isActive,
              };
              const saved = editing === "new"
                ? await api("POST", payload) as { id: string }
                : await api("PUT", { ...payload, id: editing.id }) as { id: string };
              await api("PUT", { kind: "defaultItems", serviceTypeId: editing === "new" ? saved.id : editing.id, itemIds });
            });
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

type ServiceTypeValues = { code: string; nameCs: string; nameEn: string; descriptionCs: string; descriptionEn: string; isActive: boolean };

function ServiceTypeModal({ t, locale, saving, data, categoryId, type, initialItemIds, onClose, onSubmit }: {
  t: Copy; locale: Locale; saving: boolean; data: SettingsData; categoryId: string;
  type: ServiceType | null; initialItemIds: string[];
  onClose: () => void;
  onSubmit: (values: ServiceTypeValues, itemIds: string[]) => Promise<void>;
}) {
  const dialogRef = useModalA11y(onClose);
  const [values, setValues] = useState<ServiceTypeValues>({
    code: type?.code ?? "",
    nameCs: type?.nameCs ?? "",
    nameEn: type?.nameEn ?? "",
    descriptionCs: type?.descriptionCs ?? "",
    descriptionEn: type?.descriptionEn ?? "",
    isActive: !type?.archivedAt,
  });
  const [itemIds, setItemIds] = useState<string[]>(initialItemIds);
  const [takeFrom, setTakeFrom] = useState("");

  const availableItems = data.cardItems.filter((item) => !item.archivedAt || itemIds.includes(item.id));
  const otherTypes = data.serviceTypes.filter((other) => other.id !== type?.id && !other.archivedAt);

  /** Jednorázová kopie — nevzniká žádná vazba, pozdější změna zdroje se sem nepromítne. */
  function applyTakeFrom(sourceId: string) {
    setItemIds(data.defaultItems.filter((link) => link.serviceTypeId === sourceId).map((link) => link.serviceCardItemId));
    setTakeFrom("");
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form
        ref={dialogRef as React.RefObject<HTMLFormElement>}
        className="modal service-modal" role="dialog" aria-modal="true" aria-labelledby="sc-type-title" tabIndex={-1}
        onSubmit={(event) => { event.preventDefault(); void onSubmit(values, itemIds); }}
      >
        <header className="modal-header">
          <div><span className="eyebrow">SERVICE CARD · {data.categories.find((item) => item.id === categoryId)?.code}</span>
            <h2 id="sc-type-title">{type ? t.editType : t.newType}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>

        <div className="form-grid">
          <label><span>{t.code} *</span><input required maxLength={40} value={values.code} autoFocus
            onChange={(event) => setValues((current) => ({ ...current, code: event.target.value }))} /></label>
          <label><span>{t.nameCs} *</span><input required maxLength={160} value={values.nameCs}
            onChange={(event) => setValues((current) => ({ ...current, nameCs: event.target.value }))} /></label>
          <label><span>{t.nameEn}</span><input maxLength={160} value={values.nameEn}
            onChange={(event) => setValues((current) => ({ ...current, nameEn: event.target.value }))} /></label>
          <label className="settings-active-field">
            <span>{t.active}</span>
            <span className="settings-check"><input type="checkbox" checked={values.isActive}
              onChange={(event) => setValues((current) => ({ ...current, isActive: event.target.checked }))} />{t.active}</span>
          </label>
        </div>
        <label className="standalone-textarea"><span>{t.description}</span>
          <textarea rows={2} maxLength={600} value={locale === "cs" ? values.descriptionCs : values.descriptionEn}
            onChange={(event) => setValues((current) => locale === "cs" ? { ...current, descriptionCs: event.target.value } : { ...current, descriptionEn: event.target.value })} />
        </label>

        {otherTypes.length > 0 && (
          <div className="sc-take-from">
            <label><span>{t.takeFrom}</span>
              <select value={takeFrom} onChange={(event) => { if (event.target.value) applyTakeFrom(event.target.value); }}>
                <option value="">—</option>
                {otherTypes.map((other) => <option key={other.id} value={other.id}>{other.code} · {localized(locale, other.nameCs, other.nameEn)}</option>)}
              </select>
            </label>
            <small className="form-hint">{t.takeFromHint}</small>
          </div>
        )}

        <fieldset className="parts-fieldset">
          <legend>{t.defaultItemsLegend}</legend>
          {availableItems.length === 0 ? <p className="form-hint">{t.noItems}</p> : (
            <div className="parts-grid">
              {availableItems.map((item) => (
                <label key={item.id} className={itemIds.includes(item.id) ? "selected" : ""}>
                  <input type="checkbox" checked={itemIds.includes(item.id)}
                    onChange={() => setItemIds((current) => current.includes(item.id) ? current.filter((value) => value !== item.id) : [...current, item.id])} />
                  <span>✓</span>
                  <strong>{localized(locale, item.nameCs, item.nameEn)}</strong>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? t.saving : t.save}</button>
        </footer>
      </form>
    </div>
  );
}

// --- Záložka 2: Položky karty -----------------------------------------------------------

function CardItemsTab({ t, locale, data, category, categoryId, saving, run }: {
  t: Copy; locale: Locale; data: SettingsData; category: EngineCategory | null; categoryId: string; saving: boolean;
  run: (action: () => Promise<unknown>, notice?: string) => Promise<void>;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [editing, setEditing] = useState<ServiceCardItem | "new" | null>(null);
  // Interval a varovný práh dávají smysl jen tam, kde je co měřit.
  const tracksCounter = Boolean(category?.counterUnit);

  function reorder(draggedId: string, targetId: string) {
    const next = reorderById(data.cardItems, draggedId, targetId);
    void run(() => api("PUT", { kind: "reorder", resource: "cardItem", ids: next.map((item) => item.id) }));
  }

  return (
    <section className="dash-panel">
      <header className="settings-section-heading">
        <div><h3>{t.tabs.items}</h3><p>{t.materialHint}</p></div>
      </header>

      {data.cardItems.length === 0 ? (
        <EmptyState size="inline" title={t.noItems} description={t.noItemsHelp} />
      ) : (
        <div className="table-wrap">
          <table className="settings-table sc-table">
            <thead><tr>
              <th className="sc-handle-cell" aria-label={t.dragHint} /><th>{t.nameCs}</th><th>{t.nameEn}</th>
              <th>{t.materialCategory}</th>
              {tracksCounter && <th>{t.interval}</th>}
              {tracksCounter && <th>{t.warnPercent}</th>}
              <th>{t.active}</th><th className="action-column">{t.actions}</th>
            </tr></thead>
            <tbody>
              {data.cardItems.map((item) => {
                const material = data.materialCategories.find((entry) => entry.id === item.materialCategoryId);
                return (
                  <DragRow key={item.id} id={item.id} dragged={dragged} setDragged={setDragged} onDrop={reorder} title={t.dragHint}>
                    <td><strong>{item.nameCs}</strong></td>
                    <td>{item.nameEn}</td>
                    <td>{material ? localized(locale, material.nameCs, material.nameEn) : <span className="cell-note">—</span>}</td>
                    {tracksCounter && <td className="num">{item.intervalMinutes ? formatCounterMinutes(item.intervalMinutes) : <span className="cell-note">—</span>}</td>}
                    {tracksCounter && <td className="num">{item.intervalMinutes ? `${item.warnPercent} %` : <span className="cell-note">—</span>}</td>}
                    <ActiveCell t={t} archivedAt={item.archivedAt} />
                    <RowActions t={t} disabled={saving} onEdit={() => setEditing(item)}
                      onRemove={() => { if (window.confirm(t.confirmRemove(localized(locale, item.nameCs, item.nameEn)))) void run(() => api("DELETE", { kind: "cardItem", id: item.id })); }} />
                  </DragRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="sc-table-footer">
        <button className="primary-button" type="button" onClick={() => setEditing("new")}>＋ {t.addItem}</button>
      </div>

      {editing && (
        <CardItemModal
          t={t} saving={saving} data={data} tracksCounter={tracksCounter}
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await run(() => api(editing === "new" ? "POST" : "PUT", {
              kind: "cardItem", id: editing === "new" ? undefined : editing.id, categoryId,
              nameCs: values.nameCs, nameEn: values.nameEn, materialCategory: values.materialCategoryId || null,
              intervalMinutes: values.intervalMinutes, warnPercent: values.warnPercent, isActive: values.isActive,
            }));
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

type CardItemValues = { nameCs: string; nameEn: string; materialCategoryId: string; intervalMinutes: number | null; warnPercent: number; isActive: boolean };

function CardItemModal({ t, saving, data, tracksCounter, item, onClose, onSubmit }: {
  t: Copy; saving: boolean; data: SettingsData; tracksCounter: boolean; item: ServiceCardItem | null;
  onClose: () => void;
  onSubmit: (values: CardItemValues) => Promise<void>;
}) {
  const dialogRef = useModalA11y(onClose);
  const [nameCs, setNameCs] = useState(item?.nameCs ?? "");
  const [nameEn, setNameEn] = useState(item?.nameEn ?? "");
  const [materialCategoryId, setMaterialCategoryId] = useState(item?.materialCategoryId ?? "");
  const [interval, setInterval] = useState(formatCounterMinutes(item?.intervalMinutes ?? null));
  const [warnPercent, setWarnPercent] = useState(item?.warnPercent ?? 80);
  const [isActive, setIsActive] = useState(!item?.archivedAt);
  const [formError, setFormError] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Prázdný interval je platný — položka se prostě nehlídá. Neplatný tvar ale ne.
    const trimmed = interval.trim();
    const intervalMinutes = trimmed ? parseCounterMinutes(trimmed) : null;
    if (tracksCounter && trimmed && intervalMinutes === null) {
      setFormError(t.invalidInterval);
      return;
    }
    void onSubmit({ nameCs, nameEn, materialCategoryId, intervalMinutes: tracksCounter ? intervalMinutes : null, warnPercent, isActive });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={dialogRef as React.RefObject<HTMLFormElement>} className="modal settings-user-modal" role="dialog" aria-modal="true" aria-labelledby="sc-item-title" tabIndex={-1} onSubmit={submit}>
        <header className="modal-header">
          <div><span className="eyebrow">SERVICE CARD</span><h2 id="sc-item-title">{item ? t.editItem : t.newItem}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>

        <div className="form-grid">
          <label><span>{t.nameCs} *</span><input required maxLength={160} value={nameCs} autoFocus onChange={(event) => setNameCs(event.target.value)} /></label>
          <label><span>{t.nameEn}</span><input maxLength={160} value={nameEn} onChange={(event) => setNameEn(event.target.value)} /></label>
          <label><span>{t.materialCategory}</span>
            <select value={materialCategoryId} onChange={(event) => setMaterialCategoryId(event.target.value)}>
              <option value="">{t.noMaterial}</option>
              {data.materialCategories.filter((category) => !category.archivedAt).map((category) => (
                <option key={category.id} value={category.id}>{category.nameCs}</option>
              ))}
            </select>
            <small>{t.materialHint}</small>
          </label>
          {tracksCounter && (
            <label><span>{t.interval}</span>
              <input value={interval} inputMode="numeric" pattern="[0-9]{1,4}:[0-5][0-9]" placeholder="10:00" onChange={(event) => setInterval(event.target.value)} />
              <small>{t.intervalHint}</small>
            </label>
          )}
          {tracksCounter && (
            <label><span>{t.warnPercent}</span>
              <input type="number" min={1} max={100} value={warnPercent} onChange={(event) => setWarnPercent(Number(event.target.value))} />
              <small>{t.warnPercentHint}</small>
            </label>
          )}
          <label className="settings-active-field">
            <span>{t.active}</span>
            <span className="settings-check"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />{t.active}</span>
          </label>
        </div>

        {formError && <p className="form-error" role="alert">{formError}</p>}
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? t.saving : t.save}</button>
        </footer>
      </form>
    </div>
  );
}

// --- Záložka 3: Materiál ----------------------------------------------------------------

function MaterialTab({ t, locale, data, categoryId, saving, run }: {
  t: Copy; locale: Locale; data: SettingsData; categoryId: string; saving: boolean;
  run: (action: () => Promise<unknown>, notice?: string) => Promise<void>;
}) {
  const activeCategories = data.materialCategories;
  const [selectedId, setSelectedId] = useState("");
  const [dragged, setDragged] = useState<string | null>(null);
  const [attributeDragged, setAttributeDragged] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<MaterialCategory | "new" | null>(null);
  const [editingAttribute, setEditingAttribute] = useState<MaterialAttribute | "new" | null>(null);
  const [editingVariant, setEditingVariant] = useState<MaterialVariant | "new" | null>(null);

  const selected = activeCategories.find((category) => category.id === selectedId) ?? activeCategories[0] ?? null;
  const attributes = useMemo(
    () => data.materialAttributes.filter((attribute) => attribute.materialCategoryId === selected?.id),
    [data.materialAttributes, selected?.id],
  );
  const activeAttributes = attributes.filter((attribute) => !attribute.archivedAt);
  const variants = data.materialVariants.filter((variant) => variant.materialCategoryId === selected?.id);

  return (
    <div className="sc-material-grid">
      <section className="dash-panel sc-material-categories">
        <header className="settings-section-heading"><div><h3>{t.materialCategories}</h3></div></header>
        {activeCategories.length === 0 ? (
          <EmptyState size="inline" title={t.noMaterialCategories} />
        ) : (
          <ul className="sc-category-list">
            {activeCategories.map((category) => (
              <li
                key={category.id}
                className={`${category.id === selected?.id ? "active" : ""} ${dragged === category.id ? "sc-dragging" : ""} ${category.archivedAt ? "sc-archived" : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragged) {
                    const next = reorderById(activeCategories, dragged, category.id);
                    void run(() => api("PUT", { kind: "reorder", resource: "materialCategory", ids: next.map((item) => item.id) }));
                  }
                  setDragged(null);
                }}
              >
                <span className="sc-drag-handle" draggable title={t.dragHint} aria-label={t.dragHint}
                  onDragStart={() => setDragged(category.id)} onDragEnd={() => setDragged(null)}>⠿</span>
                <button type="button" onClick={() => setSelectedId(category.id)}>
                  {localized(locale, category.nameCs, category.nameEn)}
                  {category.archivedAt && <em>{t.inactive}</em>}
                </button>
                <span className="record-actions">
                  <button type="button" onClick={() => setEditingCategory(category)} aria-label={t.edit} title={t.edit}>✎</button>
                  <button className="delete" type="button" disabled={saving} aria-label={t.remove} title={t.remove}
                    onClick={() => { if (window.confirm(t.confirmRemove(localized(locale, category.nameCs, category.nameEn)))) void run(() => api("DELETE", { kind: "materialCategory", id: category.id })); }}>🗑</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="sc-table-footer">
          <button className="primary-button" type="button" onClick={() => setEditingCategory("new")}>＋ {t.addMaterialCategory}</button>
        </div>
      </section>

      <div className="sc-material-detail">
        {!selected ? (
          <section className="dash-panel"><EmptyState size="inline" title={t.selectMaterialCategory} /></section>
        ) : (
          <>
            <section className="dash-panel">
              <header className="settings-section-heading">
                <div><h3>{t.attributes} · {localized(locale, selected.nameCs, selected.nameEn)}</h3><p>{t.attributesHint}</p></div>
              </header>
              {attributes.length === 0 ? (
                <EmptyState size="inline" title={t.noAttributes} />
              ) : (
                <div className="table-wrap">
                  <table className="settings-table sc-table">
                    <thead><tr>
                      <th className="sc-handle-cell" aria-label={t.dragHint} /><th>{t.name}</th><th>{t.type}</th><th>{t.unit}</th>
                      <th>{t.options}</th><th>{t.active}</th><th className="action-column">{t.actions}</th>
                    </tr></thead>
                    <tbody>
                      {attributes.map((attribute) => (
                        <DragRow key={attribute.id} id={attribute.id} dragged={attributeDragged} setDragged={setAttributeDragged} title={t.dragHint}
                          onDrop={(draggedId, targetId) => {
                            const next = reorderById(attributes, draggedId, targetId);
                            void run(() => api("PUT", { kind: "reorder", resource: "materialAttribute", ids: next.map((item) => item.id) }));
                          }}>
                          <td><strong>{localized(locale, attribute.nameCs, attribute.nameEn)}</strong></td>
                          <td>{t.attributeTypes[attribute.attributeType]}</td>
                          <td>{attribute.unit || <span className="cell-note">—</span>}</td>
                          <td>{attribute.attributeType === "dropdown"
                            ? (attribute.options.length > 0
                              ? <span className="sc-chip-list">{attribute.options.map((option) => <b key={option}>{option}</b>)}</span>
                              : <span className="cell-note">—</span>)
                            : <span className="cell-note">—</span>}</td>
                          <ActiveCell t={t} archivedAt={attribute.archivedAt} />
                          <RowActions t={t} disabled={saving} onEdit={() => setEditingAttribute(attribute)}
                            onRemove={() => { if (window.confirm(t.confirmRemove(localized(locale, attribute.nameCs, attribute.nameEn)))) void run(() => api("DELETE", { kind: "materialAttribute", id: attribute.id })); }} />
                        </DragRow>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="sc-table-footer">
                <button className="primary-button" type="button" onClick={() => setEditingAttribute("new")}>＋ {t.addAttribute}</button>
              </div>
            </section>

            <section className="dash-panel">
              <header className="settings-section-heading">
                <div><h3>{t.variants}</h3><p>{t.variantsHint}</p></div>
              </header>
              {variants.length === 0 ? (
                <EmptyState size="inline" title={t.noVariants} />
              ) : (
                <div className="table-wrap">
                  <table className="settings-table sc-table">
                    <thead><tr>
                      <th>{t.variantName}</th>
                      {/* Sloupce se generují podle atributů vybrané kategorie. */}
                      {activeAttributes.map((attribute) => <th key={attribute.id}>{localized(locale, attribute.nameCs, attribute.nameEn)}{attribute.unit && ` (${attribute.unit})`}</th>)}
                      <th>{t.active}</th><th className="action-column">{t.actions}</th>
                    </tr></thead>
                    <tbody>
                      {variants.map((variant) => (
                        <tr key={variant.id}>
                          <td><strong>{variant.name}</strong></td>
                          {activeAttributes.map((attribute) => <td key={attribute.id}>{variant.attributeValues[attribute.id] || <span className="cell-note">—</span>}</td>)}
                          <ActiveCell t={t} archivedAt={variant.archivedAt} />
                          <RowActions t={t} disabled={saving} onEdit={() => setEditingVariant(variant)}
                            onRemove={() => { if (window.confirm(t.confirmRemove(variant.name))) void run(() => api("DELETE", { kind: "materialVariant", id: variant.id })); }} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="sc-table-footer">
                <button className="primary-button" type="button" onClick={() => setEditingVariant("new")}>＋ {t.addVariant}</button>
              </div>
            </section>
          </>
        )}
      </div>

      {editingCategory && (
        <NameModal
          t={t} saving={saving}
          title={editingCategory === "new" ? t.newMaterialCategory : t.editMaterialCategory}
          nameCs={editingCategory === "new" ? "" : editingCategory.nameCs}
          nameEn={editingCategory === "new" ? "" : editingCategory.nameEn}
          isActive={editingCategory === "new" ? true : !editingCategory.archivedAt}
          onClose={() => setEditingCategory(null)}
          onSubmit={async (values) => {
            await run(() => api(editingCategory === "new" ? "POST" : "PUT", {
              kind: "materialCategory", id: editingCategory === "new" ? undefined : editingCategory.id,
              categoryId, nameCs: values.nameCs, nameEn: values.nameEn, isActive: values.isActive,
            }));
            setEditingCategory(null);
          }}
        />
      )}

      {editingAttribute && selected && (
        <AttributeModal
          t={t} locale={locale} saving={saving} technicalFields={data.technicalFields ?? []}
          attribute={editingAttribute === "new" ? null : editingAttribute}
          onClose={() => setEditingAttribute(null)}
          onSubmit={async (values) => {
            await run(() => api(editingAttribute === "new" ? "POST" : "PUT", {
              kind: "materialAttribute", id: editingAttribute === "new" ? undefined : editingAttribute.id,
              materialCategoryId: selected.id, nameCs: values.nameCs, nameEn: values.nameEn,
              attributeType: values.attributeType, unit: values.unit, options: values.options,
              technicalFieldId: values.technicalFieldId || null, isActive: values.isActive,
            }));
            setEditingAttribute(null);
          }}
        />
      )}

      {editingVariant && selected && (
        <VariantModal
          t={t} locale={locale} saving={saving} attributes={activeAttributes}
          variant={editingVariant === "new" ? null : editingVariant}
          onClose={() => setEditingVariant(null)}
          onSubmit={async (values) => {
            await run(() => api(editingVariant === "new" ? "POST" : "PUT", {
              kind: "materialVariant", id: editingVariant === "new" ? undefined : editingVariant.id,
              materialCategoryId: selected.id, name: values.name, attributeValues: values.attributeValues, isActive: values.isActive,
            }));
            setEditingVariant(null);
          }}
        />
      )}
    </div>
  );
}

function NameModal({ t, saving, title, nameCs: initialCs, nameEn: initialEn, isActive: initialActive, onClose, onSubmit }: {
  t: Copy; saving: boolean; title: string; nameCs: string; nameEn: string; isActive: boolean;
  onClose: () => void;
  onSubmit: (values: { nameCs: string; nameEn: string; isActive: boolean }) => Promise<void>;
}) {
  const dialogRef = useModalA11y(onClose);
  const [nameCs, setNameCs] = useState(initialCs);
  const [nameEn, setNameEn] = useState(initialEn);
  const [isActive, setIsActive] = useState(initialActive);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={dialogRef as React.RefObject<HTMLFormElement>} className="modal settings-user-modal" role="dialog" aria-modal="true" aria-labelledby="sc-name-title" tabIndex={-1}
        onSubmit={(event) => { event.preventDefault(); void onSubmit({ nameCs, nameEn, isActive }); }}>
        <header className="modal-header">
          <div><span className="eyebrow">SERVICE CARD</span><h2 id="sc-name-title">{title}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>
        <div className="form-grid">
          <label><span>{t.nameCs} *</span><input required maxLength={160} value={nameCs} autoFocus onChange={(event) => setNameCs(event.target.value)} /></label>
          <label><span>{t.nameEn}</span><input maxLength={160} value={nameEn} onChange={(event) => setNameEn(event.target.value)} /></label>
          <label className="settings-active-field">
            <span>{t.active}</span>
            <span className="settings-check"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />{t.active}</span>
          </label>
        </div>
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? t.saving : t.save}</button>
        </footer>
      </form>
    </div>
  );
}

type AttributeValues = { nameCs: string; nameEn: string; attributeType: MaterialAttributeType; unit: string; options: string[]; technicalFieldId: string; isActive: boolean };

function AttributeModal({ t, locale, saving, attribute, technicalFields, onClose, onSubmit }: {
  t: Copy; locale: Locale; saving: boolean; attribute: MaterialAttribute | null; technicalFields: TechnicalFieldOption[];
  onClose: () => void;
  onSubmit: (values: AttributeValues) => Promise<void>;
}) {
  const dialogRef = useModalA11y(onClose);
  const [nameCs, setNameCs] = useState(attribute?.nameCs ?? "");
  const [nameEn, setNameEn] = useState(attribute?.nameEn ?? "");
  const [attributeType, setAttributeType] = useState<MaterialAttributeType>(attribute?.attributeType ?? "text");
  const [unit, setUnit] = useState(attribute?.unit ?? "");
  const [options, setOptions] = useState<string[]>(attribute?.options ?? []);
  const [technicalFieldId, setTechnicalFieldId] = useState(attribute?.technicalFieldId ?? "");
  const [isActive, setIsActive] = useState(!attribute?.archivedAt);
  const [confirmDrop, setConfirmDrop] = useState(false);

  // Hodnoty výběru dávají smysl jen u dropdownu — jinde je server zahodí. Dokud se typ nezmění,
  // zůstávají ve stavu, takže je pořád z čeho vypsat, co přesně se ztratí.
  const droppedOptions = attributeType !== "dropdown" ? options : [];

  function save() {
    void onSubmit({ nameCs, nameEn, attributeType, unit, options, technicalFieldId, isActive });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={dialogRef as React.RefObject<HTMLFormElement>} className="modal settings-user-modal" role="dialog" aria-modal="true" aria-labelledby="sc-attr-title" tabIndex={-1}
        onSubmit={(event) => {
          event.preventDefault();
          // Zahození je nevratné, tak se na něj zeptáme — ale až tady, ne při každém přepnutí typu.
          if (droppedOptions.length > 0) { setConfirmDrop(true); return; }
          save();
        }}>
        <header className="modal-header">
          <div><span className="eyebrow">SERVICE CARD · MATERIAL</span><h2 id="sc-attr-title">{attribute ? t.editAttribute : t.newAttribute}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>
        <div className="form-grid">
          <label><span>{t.nameCs} *</span><input required maxLength={160} value={nameCs} autoFocus onChange={(event) => setNameCs(event.target.value)} /></label>
          <label><span>{t.nameEn}</span><input maxLength={160} value={nameEn} onChange={(event) => setNameEn(event.target.value)} /></label>
          <label><span>{t.type} *</span>
            <select value={attributeType} onChange={(event) => setAttributeType(event.target.value as MaterialAttributeType)}>
              {(["dropdown", "number", "text"] as MaterialAttributeType[]).map((value) => <option key={value} value={value}>{t.attributeTypes[value]}</option>)}
            </select>
          </label>
          <label><span>{t.unit}</span><input maxLength={20} value={unit} placeholder="mm" onChange={(event) => setUnit(event.target.value)} /></label>
          <label><span>{t.technicalField}</span>
            {technicalFields.length === 0 ? <small className="cell-note">{t.technicalFieldEmpty}</small> : (
              <select value={technicalFieldId} onChange={(event) => setTechnicalFieldId(event.target.value)}>
                <option value="">{t.technicalFieldNone}</option>
                {technicalFields.map((field) => (
                  <option key={field.id} value={field.id}>{field.sectionCs} · {localized(locale, field.labelCs, field.labelEn)}</option>
                ))}
              </select>
            )}
            <small>{t.technicalFieldHint}</small>
          </label>
          <label className="settings-active-field">
            <span>{t.active}</span>
            <span className="settings-check"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />{t.active}</span>
          </label>
        </div>

        {attributeType === "dropdown" && <ChipsEditor t={t} options={options} onChange={setOptions} />}
        {droppedOptions.length > 0 && (
          <p className="form-hint sc-drop-warning" role="status">⚠ {t.dropWarn(droppedOptions.length)}</p>
        )}

        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? t.saving : t.save}</button>
        </footer>

        {confirmDrop && (
          <DropOptionsModal t={t} options={droppedOptions} saving={saving}
            onClose={() => setConfirmDrop(false)}
            onConfirm={() => { setConfirmDrop(false); save(); }} />
        )}
      </form>
    </div>
  );
}

/** Potvrzení, že se přepnutím typu opravdu zahodí hodnoty výběru — a kterých se to týká. */
function DropOptionsModal({ t, options, saving, onClose, onConfirm }: {
  t: Copy; options: string[]; saving: boolean; onClose: () => void; onConfirm: () => void;
}) {
  const dialogRef = useModalA11y(onClose);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal settings-user-modal" role="dialog" aria-modal="true" aria-labelledby="sc-drop-title" tabIndex={-1}>
        <header className="modal-header">
          <div><span className="eyebrow">SERVICE CARD · MATERIAL</span><h2 id="sc-drop-title">{t.dropTitle}</h2><p>{t.dropIntro(options.length)}</p></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>
        <fieldset className="parts-fieldset sc-chips-field">
          <legend>{t.dropList} — {t.dropWarn(options.length)}</legend>
          <span className="sc-chip-list">{options.map((option) => <b key={option}>{option}</b>)}</span>
        </fieldset>
        <p className="form-hint">{t.dropKeepHint}</p>
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="danger-compact" type="button" disabled={saving} onClick={onConfirm}>{saving ? t.saving : t.dropConfirm}</button>
        </footer>
      </section>
    </div>
  );
}

/** Chips editor — hodnota + Enter udělá štítek, křížek ho smaže. */
function ChipsEditor({ t, options, onChange }: { t: Copy; options: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function commit() {
    const value = draft.trim();
    if (!value || options.includes(value)) { setDraft(""); return; }
    onChange([...options, value]);
    setDraft("");
  }

  return (
    <fieldset className="parts-fieldset sc-chips-field">
      <legend>{t.options}</legend>
      <div className="sc-chips">
        {options.map((option) => (
          <span key={option}>
            {option}
            <button type="button" aria-label={`${t.remove} ${option}`} onClick={() => onChange(options.filter((value) => value !== option))}>×</button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={t.optionPlaceholder}
          onChange={(event) => setDraft(event.target.value)}
          // Enter potvrzuje štítek, ne odeslání formuláře.
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); commit(); }
            if (event.key === "Backspace" && !draft && options.length > 0) onChange(options.slice(0, -1));
          }}
          onBlur={commit}
        />
      </div>
      <small className="form-hint">{t.optionsHint}</small>
    </fieldset>
  );
}

function VariantModal({ t, locale, saving, attributes, variant, onClose, onSubmit }: {
  t: Copy; locale: Locale; saving: boolean; attributes: MaterialAttribute[]; variant: MaterialVariant | null;
  onClose: () => void;
  onSubmit: (values: { name: string; attributeValues: Record<string, string>; isActive: boolean }) => Promise<void>;
}) {
  const dialogRef = useModalA11y(onClose);
  const [values, setValues] = useState<Record<string, string>>(variant?.attributeValues ?? {});
  const [name, setName] = useState(variant?.name ?? "");
  // Dokud uživatel název nepřepsal, drží se složeniny hodnot atributů.
  const [nameTouched, setNameTouched] = useState(Boolean(variant));
  const [isActive, setIsActive] = useState(!variant?.archivedAt);

  const suggestion = suggestVariantName(attributes, values);
  const effectiveName = nameTouched ? name : suggestion;

  function setValue(attributeId: string, value: string) {
    setValues((current) => ({ ...current, [attributeId]: value }));
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={dialogRef as React.RefObject<HTMLFormElement>} className="modal settings-user-modal" role="dialog" aria-modal="true" aria-labelledby="sc-variant-title" tabIndex={-1}
        onSubmit={(event) => { event.preventDefault(); void onSubmit({ name: effectiveName, attributeValues: values, isActive }); }}>
        <header className="modal-header">
          <div><span className="eyebrow">SERVICE CARD · MATERIAL</span><h2 id="sc-variant-title">{variant ? t.editVariant : t.newVariant}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>

        <div className="form-grid">
          {attributes.map((attribute) => (
            <label key={attribute.id}>
              <span>{localized(locale, attribute.nameCs, attribute.nameEn)}{attribute.unit && ` (${attribute.unit})`}</span>
              {attribute.attributeType === "dropdown" ? (
                <select value={values[attribute.id] ?? ""} onChange={(event) => setValue(attribute.id, event.target.value)}>
                  <option value="">—</option>
                  {attribute.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : (
                <input
                  value={values[attribute.id] ?? ""}
                  inputMode={attribute.attributeType === "number" ? "decimal" : "text"}
                  onChange={(event) => setValue(attribute.id, event.target.value)}
                />
              )}
            </label>
          ))}
          <label><span>{t.variantName} *</span>
            <input required maxLength={200} value={effectiveName} onChange={(event) => { setNameTouched(true); setName(event.target.value); }} />
            <small>{t.variantNameHint}</small>
          </label>
          <label className="settings-active-field">
            <span>{t.active}</span>
            <span className="settings-check"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />{t.active}</span>
          </label>
        </div>

        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? t.saving : t.save}</button>
        </footer>
      </form>
    </div>
  );
}

// --- Přepnutí kategorie na novou kartu ---------------------------------------------------

/** Klíče položek, jejichž interval musí být vyplněný — dnes na nich stojí reset počítadel. */
const COUNTER_CRITICAL_KEYS = ["piston", "connecting_rod"] as const;

function LegacyCategoryPanel({ t, locale, category, cardItems, saving, onSwitched, onError }: {
  t: Copy; locale: Locale; category: EngineCategory; cardItems: ServiceCardItem[]; saving: boolean;
  onSwitched: (seededRecords: number) => void;
  onError: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [switching, setSwitching] = useState(false);

  const activeItems = cardItems.filter((item) => !item.archivedAt);
  const missingIntervals = category.counterUnit
    ? COUNTER_CRITICAL_KEYS
      .map((key) => activeItems.find((item) => item.legacyPartKey === key))
      .filter((item) => !item || item.intervalMinutes === null)
      .map((item, index) => item ? localized(locale, item.nameCs, item.nameEn) : COUNTER_CRITICAL_KEYS[index])
    : [];
  const blocker = activeItems.length === 0 ? t.missingItems : missingIntervals.length > 0 ? t.missingIntervals(missingIntervals.join(", ")) : "";

  async function switchOver() {
    setSwitching(true);
    try {
      const result = await api("POST", { kind: "migrateCategory", categoryId: category.id });
      onSwitched(result.seededRecords ?? 0);
      setConfirming(false);
    } catch {
      onError();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <>
      <article className="dash-panel sc-legacy-panel">
        <span className="sc-legacy-mark" aria-hidden="true">⚠</span>
        <div><h3>{t.legacyTitle}</h3><p>{t.legacyIntro}</p>{blocker && <p className="form-hint">{blocker}</p>}</div>
        <button className="primary-button" type="button" disabled={Boolean(blocker) || saving || switching} onClick={() => setConfirming(true)}>
          {switching ? t.switching : t.switchOver}
        </button>
      </article>

      {confirming && (
        <SwitchConfirmModal t={t} code={category.code} switching={switching} onClose={() => setConfirming(false)} onConfirm={switchOver} />
      )}
    </>
  );
}

function SwitchConfirmModal({ t, code, switching, onClose, onConfirm }: {
  t: Copy; code: string; switching: boolean; onClose: () => void; onConfirm: () => void;
}) {
  const dialogRef = useModalA11y(onClose);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal settings-user-modal" role="dialog" aria-modal="true" aria-labelledby="sc-switch-title" tabIndex={-1}>
        <header className="modal-header">
          <div><span className="eyebrow">SERVICE CARD · {code}</span><h2 id="sc-switch-title">{t.switchTitle}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>
        <dl className="sc-switch-summary">
          <div><dt>{t.switchLoses}</dt><dd>{t.switchLosesText}</dd></div>
          <div><dt>{t.switchGains}</dt><dd>{t.switchGainsText}</dd></div>
        </dl>
        <p className="form-hint">{t.switchIrreversible}</p>
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="primary-button" type="button" disabled={switching} onClick={onConfirm}>{switching ? t.switching : t.switchConfirm}</button>
        </footer>
      </section>
    </div>
  );
}

// --- Přenos staré historie ---------------------------------------------------------------

/**
 * Náhled a ruční spuštění přenosu staré historie.
 *
 * Přenos se ZÁMĚRNĚ nespouští sám při nasazení — nejdřív náhled, který nic nezapisuje,
 * teprve po kontrole ostrý běh. Panel se vůbec nezobrazí, když není co přenášet.
 */
function LegacyHistoryPanel({ t, onError }: { t: Copy; onError: () => void }) {
  const [preview, setPreview] = useState<LegacyMigrationSummary[] | null>(null);
  const [busy, setBusy] = useState<"preview" | "run" | "revert" | null>(null);
  const [done, setDone] = useState("");
  const [confirmRevert, setConfirmRevert] = useState(false);

  // Náhled se načte sám při otevření modulu, ať je hned vidět, jestli něco čeká.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API}?preview=migration`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { preview: LegacyMigrationSummary[] };
        if (!cancelled) setPreview(data.preview);
      } catch {
        // Náhled je doplňková informace — tichý neúspěch nesmí shodit celý modul.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const pending = (preview ?? []).filter((summary) => summary.records > 0);
  const importedTotal = (preview ?? []).reduce((sum, summary) => sum + summary.alreadyImported, 0);
  // Panel zmizí, až když není co přenést ani co vrátit.
  if (!preview || (pending.length === 0 && importedTotal === 0)) return null;

  const totalRecords = pending.reduce((sum, summary) => sum + summary.records, 0);
  const totalItems = pending.reduce((sum, summary) => sum + summary.items, 0);

  async function refreshPreview() {
    setBusy("preview");
    try {
      const response = await fetch(`${API}?preview=migration`, { cache: "no-store" });
      const data = (await response.json()) as { preview: LegacyMigrationSummary[] };
      setPreview(data.preview);
    } catch {
      onError();
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    setBusy("run");
    try {
      const result = await api("POST", { kind: "migrateHistory" }) as unknown as { migrated: LegacyMigrationSummary[] };
      setDone(t.historyDone(result.migrated.reduce((sum, summary) => sum + summary.records, 0)));
      await refreshPreview();
    } catch {
      onError();
    } finally {
      setBusy(null);
    }
  }

  async function revert() {
    setBusy("revert");
    try {
      const result = await api("POST", { kind: "revertHistoryImport" }) as unknown as { reverted: number };
      setDone(t.revertDone(result.reverted));
      setConfirmRevert(false);
      await refreshPreview();
    } catch {
      onError();
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="dash-panel sc-history-panel">
      {done && <p className="form-hint" role="status">{done}</p>}

      {pending.length > 0 && (
        <div className="sc-history-head">
          <span className="sc-legacy-mark" aria-hidden="true">⇄</span>
          <div>
            <h3>{t.historyTitle}</h3>
            <p>{t.historyIntro}</p>
            <p className="form-hint">{t.historyCount(totalRecords, totalItems)} {t.historyDryRunNote}</p>
          </div>
          <div className="tab-actions">
            <button className="secondary-compact" type="button" disabled={busy !== null} onClick={() => void refreshPreview()}>
              {busy === "preview" ? t.historyPreviewing : t.historyPreview}
            </button>
            <button className="primary-button" type="button" disabled={busy !== null} onClick={() => void run()}>
              {busy === "run" ? t.historyRunning : t.historyRun}
            </button>
          </div>
        </div>
      )}

      {/* Záchranná brzda — jediná cesta, jak přenos vrátit, když se do databáze nedostaneme jinudy. */}
      {importedTotal > 0 && (
        <div className="sc-history-head">
          <span className="sc-legacy-mark" aria-hidden="true">↶</span>
          <div>
            <h3>{t.revertTitle}</h3>
            <p>{t.revertIntro}</p>
            <p className="form-hint">{t.revertCount(importedTotal)}</p>
          </div>
          <div className="tab-actions">
            <button className="danger-compact" type="button" disabled={busy !== null} onClick={() => setConfirmRevert(true)}>
              {busy === "revert" ? t.revertRunning : t.revertButton}
            </button>
          </div>
        </div>
      )}

      {confirmRevert && (
        <RevertConfirmModal t={t} count={importedTotal} busy={busy === "revert"}
          onClose={() => setConfirmRevert(false)} onConfirm={() => void revert()} />
      )}

      {pending.map((summary) => (
        <div key={summary.categoryCode} className="sc-history-summary">
          <h4>{summary.categoryCode} — {t.historyCount(summary.records, summary.items)}</h4>
          {summary.unmatchedPartKeys.length > 0 && <p className="form-hint">{t.historyUnmatched(summary.unmatchedPartKeys.join(", "))}</p>}
          {summary.samples.length > 0 && (
            <>
              <p className="form-hint">{t.historySamples}</p>
              <div className="table-wrap">
                <table className="settings-table sc-table">
                  <thead><tr><th>{t.code}</th><th>{t.name}</th><th>{t.tabs.types}</th><th>{t.tabs.items}</th></tr></thead>
                  <tbody>
                    {summary.samples.map((sample, index) => (
                      <tr key={`${sample.engineCode}-${sample.serviceDate}-${index}`}>
                        <td><span className="equipment-code">{sample.engineCode}</span></td>
                        <td>{sample.serviceDate}</td>
                        <td>{sample.serviceType}</td>
                        <td>{sample.items.join(", ") || <span className="cell-note">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ))}
    </article>
  );
}

function RevertConfirmModal({ t, count, busy, onClose, onConfirm }: {
  t: Copy; count: number; busy: boolean; onClose: () => void; onConfirm: () => void;
}) {
  const dialogRef = useModalA11y(onClose);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal settings-user-modal" role="dialog" aria-modal="true" aria-labelledby="sc-revert-title" tabIndex={-1}>
        <header className="modal-header">
          <div><span className="eyebrow">SERVICE CARD</span><h2 id="sc-revert-title">{t.revertConfirmTitle}</h2><p>{t.revertCount(count)}</p></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>
        <dl className="sc-switch-summary">
          <div><dt>{t.revertWhatGoes}</dt><dd>{t.revertConfirmBody}</dd></div>
          <div><dt>{t.revertWatchOut}</dt><dd>{t.revertConfirmWarn}</dd></div>
        </dl>
        <p className="form-hint">{t.revertConfirmSafe}</p>
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="danger-compact" type="button" disabled={busy} onClick={onConfirm}>{busy ? t.revertRunning : t.revertConfirm}</button>
        </footer>
      </section>
    </div>
  );
}
