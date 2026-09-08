"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CatalogData, CarburetorRecord, DriverRecord } from "./catalog-pages";
import { vehicleServiceStatus } from "./catalog-pages";
import { CountrySelect } from "./country-select";
import { countryFlag } from "./countries";
import { RaceDeliveriesPanel } from "./race-deliveries";
import { RaceTeamVisitsPanel } from "./race-team-visits";
import { RaceFinancePanel } from "./race-finance";
import { RaceActivityPanel } from "./race-activity";
import { RaceSalesPanel } from "./race-sales";
import { RaceLogisticsPanel } from "./logistics-pages";
import { RaceChecklistPanel } from "./race-checklist-panel";
import { RaceLogoBadge } from "./race-logo-badge";
import { ClothingLightbox, type ClothingPhotoPreview } from "./clothing-photo";
import type { CircuitRecord } from "./circuits-page";
import { formatCount, pluralForm, type PluralForms } from "./pluralize";
import { EmptyState, LoadingState } from "./empty-state";
import { useModalA11y } from "./use-modal-a11y";

const DRIVER_FORMS: PluralForms = { cs: ["pilot", "piloti", "pilotů"], en: ["driver", "drivers"] };
const RACE_FORMS: PluralForms = { cs: ["závod", "závody", "závodů"], en: ["race", "races"] };
const MECHANIC_FORMS: PluralForms = { cs: ["mechanik", "mechanici", "mechaniků"], en: ["mechanic", "mechanics"] };
const VEHICLE_FORMS: PluralForms = { cs: ["auto", "auta", "aut"], en: ["vehicle", "vehicles"] };
const ENGINE_FORMS: PluralForms = { cs: ["motor", "motory", "motorů"], en: ["engine", "engines"] };
const CARBURETOR_FORMS: PluralForms = { cs: ["karburátor", "karburátory", "karburátorů"], en: ["carburetor", "carburetors"] };

type Locale = "cs" | "en";
type Role = "superadmin" | "boss" | "mechanic";

type RaceRecord = {
  id: string;
  raceTemplateId: string | null;
  circuitId: string | null;
  logoUrl: string;
  calendarColor: string;
  name: string;
  series: string;
  seriesRound: number | null;
  raceType: string;
  track: string;
  address: string;
  countryCode: string;
  startDate: string;
  endDate: string;
  departureDate: string;
  returnDate: string;
  organizer: string;
  notes: string;
  status: "planned" | "active" | "completed";
  categories: string[];
  driverCount: number;
  engineCount: number;
  carburetorCount: number;
  mechanicCount: number;
  vehicleCount: number;
  circuitName: string | null;
  circuitAddress: string | null;
  circuitWebsiteUrl: string | null;
  circuitMapsUrl: string | null;
  circuitLatitude: number | null;
  circuitLongitude: number | null;
  circuitDistanceKm: number | null;
  circuitDriveMinutes: number | null;
  circuitImageUrl: string;
};

type RaceFormState = {
  race: RaceRecord | null;
  mechanicIds: string[];
  vehicleIds: string[];
};

type EngineChoice = { id: string; code: string; family: string; currentConfiguration: string; upgradeCode: string; labelColor: string; status: string; soldAt?: number | null };

type RaceEntry = {
  id: string;
  category: string;
  driverId: string;
  driverName: string;
  teamId: string | null;
  teamName: string;
  engine1Id: string | null;
  engine1Code: string;
  engine1Configuration: string;
  engine2Id: string | null;
  engine2Code: string;
  engine2Configuration: string;
  engine3Id: string | null;
  engine3Code: string;
  engine3Configuration: string;
  carburetor1Id: string | null;
  carburetor1Code: string;
  carburetor2Id: string | null;
  carburetor2Code: string;
  carburetor3Id: string | null;
  carburetor3Code: string;
  isConfirmed: boolean;
  notes: string;
};

type AssignedMechanic = { id: string; mechanicId: string; mechanicName: string; vehicleId: string | null };
type AssignedVehicle = { id: string; vehicleId: string; vehicleName: string; licensePlate: string };
type RaceExtra = { id: string; category: string; resourceType: "engine" | "carburetor"; resourceId: string; resourceCode: string; notes: string };
type EquipmentAssignment = {
  resourceType: "engine" | "carburetor";
  resourceId: string;
  entryId: string;
  driverName: string;
  raceId: string;
  raceName: string;
  startDate: string;
  endDate: string;
  raceStatus: RaceRecord["status"];
  isExtra: number;
};
type RacePlan = { race: Pick<RaceRecord, "id" | "name" | "startDate" | "endDate" | "departureDate" | "returnDate" | "status">; entries: RaceEntry[]; mechanics: AssignedMechanic[]; vehicles: AssignedVehicle[]; extras: RaceExtra[]; equipmentAssignments: EquipmentAssignment[] };

type WeatherSnapshot = {
  available: boolean;
  reason?: string;
  current?: Record<string, number | string> | null;
  units?: Record<string, string>;
  forecast?: Array<{
    date: string;
    temperatureMin: number;
    temperatureMax: number;
    rainProbability: number;
    rainTotal: number;
    windMax: number;
    gustMax: number;
    humidityMax: number;
    weatherCode: number;
    hourly?: Array<{ hour: number; temperature: number; rainProbability: number; wind: number; weatherCode: number }>;
  }>;
};

const emptyCatalog: CatalogData = { raceTypes: [], teams: [], drivers: [], mechanics: [], vehicles: [], carburetors: [] };
const categoryOrder = ["BABY", "MINI", "MINI U10", "MINI GR3", "OKJ", "OKN-J", "OKN", "OK", "KZ"];

const text = {
  cs: {
    title: "Závody", subtitle: "Plánování souběžných závodů bez kolizí vybavení a posádky", newRace: "Nový závod", empty: "Zatím není založen žádný závod.", loading: "Načítám závody…", error: "Závody se nepodařilo načíst.",
    edit: "Upravit závod", remove: "Smazat závod", back: "Zpět na závody", print: "Vytisknout plán", planning: "Plán závodu", team: "Tým", driver: "Pilot", category: "Kategorie", actions: "Akce", addDriver: "Přidat pilota", editAssignment: "Upravit pilota", delete: "Odebrat", noDrivers: "V této kategorii zatím není přiřazený pilot.",
    mechanics: "Mechanici", cars: "Auta", add: "Přidat", extras: "Extra vybavení", addExtra: "Přidat extra", noResources: "Nejdříve přidej položky do základních seznamů v levém menu.", travel: "Cesta", raceDates: "Termín závodu", notes: "Poznámky", save: "Uložit", cancel: "Zrušit", saving: "Ukládám…", status: "Stav",
  },
  en: {
    title: "Races", subtitle: "Plan concurrent races without equipment or crew conflicts", newRace: "New race", empty: "No races yet.", loading: "Loading races…", error: "Could not load races.",
    edit: "Edit race", remove: "Delete race", back: "Back to races", print: "Print plan", planning: "Race plan", team: "Team", driver: "Driver", category: "Category", actions: "Actions", addDriver: "Add driver", editAssignment: "Edit driver", delete: "Remove", noDrivers: "No driver assigned in this category yet.",
    mechanics: "Mechanics", cars: "Cars", add: "Add", extras: "Extra equipment", addExtra: "Add extra", noResources: "First add records to the master lists in the left menu.", travel: "Travel", raceDates: "Race dates", notes: "Notes", save: "Save", cancel: "Cancel", saving: "Saving…", status: "Status",
  },
} as const;

export function RacePage({ locale, role, openRaceId = null, onDetailOpenChange }: { locale: Locale; role: Role; openRaceId?: string | null; onDetailOpenChange?: (open: boolean) => void }) {
  const l = text[locale];
  const [races, setRaces] = useState<RaceRecord[]>([]);
  const [catalog, setCatalog] = useState<CatalogData>(emptyCatalog);
  const [engines, setEngines] = useState<EngineChoice[]>([]);
  const [circuits, setCircuits] = useState<CircuitRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(openRaceId);

  useEffect(() => { onDetailOpenChange?.(selectedId !== null); }, [selectedId]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [raceForm, setRaceForm] = useState<RaceFormState | null>(null);
  const [listView, setListView] = useState<"cards" | "table">("cards");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [circuitFilter, setCircuitFilter] = useState("");
  const [archiveTypeFilter, setArchiveTypeFilter] = useState("");
  const canManage = role !== "mechanic";
  const selectedRace = races.find((race) => race.id === selectedId) ?? null;
  const seasonOrder = [...races].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const roundNumber = new Map(seasonOrder.map((race, index) => [race.id, index + 1]));
  const selectedIndex = selectedRace ? seasonOrder.findIndex((race) => race.id === selectedRace.id) : -1;
  const previousRace = selectedIndex > 0
    ? [...seasonOrder.slice(0, selectedIndex)].reverse().find((race) => race.categories.some((category) => selectedRace!.categories.includes(category))) ?? seasonOrder[selectedIndex - 1]
    : null;
  const availableCategories = [...new Set(seasonOrder.flatMap((race) => race.categories))].sort();
  const availableCircuits = [...new Set(seasonOrder.map((race) => race.circuitName).filter((name): name is string => Boolean(name)))].sort();
  const currentRaces = seasonOrder
    .filter((race) => race.status !== "completed")
    .filter((race) => !categoryFilter || race.categories.includes(categoryFilter))
    .filter((race) => !circuitFilter || race.circuitName === circuitFilter);
  const archivedRacesAll = races.filter((race) => race.status === "completed");
  const archiveTypeKey = (race: RaceRecord) => race.raceTemplateId ?? "no-type";
  const archiveTypeLabel = (race: RaceRecord) => race.raceType || race.name || (locale === "cs" ? "Bez typu" : "No type");
  const archiveTypeTiles = [...new Set(archivedRacesAll.map(archiveTypeKey))]
    .map((key) => {
      const races = archivedRacesAll.filter((race) => archiveTypeKey(race) === key);
      return { key, label: archiveTypeLabel(races[0]), count: races.length };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const archivedRaces = archiveTypeFilter ? archivedRacesAll.filter((race) => archiveTypeKey(race) === archiveTypeFilter) : archivedRacesAll;
  const archiveYears = [...new Set(archivedRaces.map((race) => race.startDate.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  const archiveByYear = archiveYears.map((year) => ({
    year,
    races: archivedRaces.filter((race) => race.startDate.slice(0, 4) === year).sort((a, b) => b.startDate.localeCompare(a.startDate)),
  }));

  async function load() {
    setLoading(true);
    try {
      const [raceResponse, catalogResponse, engineResponse, circuitResponse] = await Promise.all([
        fetch("/api/races", { cache: "no-store" }),
        fetch("/api/catalog", { cache: "no-store" }),
        fetch("/api/engines", { cache: "no-store" }),
        fetch("/api/circuits", { cache: "no-store" }),
      ]);
      if (!raceResponse.ok || !catalogResponse.ok || !engineResponse.ok || !circuitResponse.ok) throw new Error("load failed");
      const raceData = (await raceResponse.json()) as { races: RaceRecord[] };
      const catalogData = (await catalogResponse.json()) as CatalogData;
      const engineData = (await engineResponse.json()) as { engines: EngineChoice[] };
      const circuitData = (await circuitResponse.json()) as { circuits: CircuitRecord[] };
      setRaces(raceData.races);
      setCatalog(catalogData);
      setEngines(engineData.engines);
      setCircuits(circuitData.circuits);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (openRaceId) setSelectedId(openRaceId); }, [openRaceId]);

  async function archiveRace(race: RaceRecord) {
    if (role !== "superadmin") return;
    const confirmed = window.confirm(locale === "cs" ? `Opravdu smazat závod ${race.name}? Zmizí ze všech přehledů včetně archivu a v aplikaci ho už nepůjde znovu zobrazit.` : `Delete ${race.name}? It will disappear from every view including the archive and cannot be shown again in the app.`);
    if (!confirmed) return;
    const response = await fetch("/api/races", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: race.id }) });
    if (!response.ok) return showApiError(response, locale);
    setSelectedId(null);
    await load();
  }

  if (selectedRace) {
    return <>
      <RaceDetail race={selectedRace} catalog={catalog} engines={engines} locale={locale} role={role} previousRace={previousRace} onBack={() => setSelectedId(null)} onEdit={(mechanicIds, vehicleIds) => setRaceForm({ race: selectedRace, mechanicIds, vehicleIds })} onArchive={() => { void archiveRace(selectedRace); }} onRaceChanged={load} />
      {raceForm && <RaceForm locale={locale} race={raceForm.race} catalog={catalog} circuits={circuits} mechanicIds={raceForm.mechanicIds} vehicleIds={raceForm.vehicleIds} onClose={() => setRaceForm(null)} onSaved={async (id) => { setRaceForm(null); await load(); setSelectedId(id); }} />}
    </>;
  }

  return <div className="races-page">
    <section className="dash-panel race-directory-header">
      <div><span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM RACE CONTROL</span><h2>{l.title}</h2><p>{l.subtitle}</p></div>
      {canManage && <button className="primary-button" type="button" onClick={() => setRaceForm({ race: null, mechanicIds: [], vehicleIds: [] })}>＋ {l.newRace}</button>}
    </section>
    <section className="dash-panel data-panel race-directory-list">
      {loading && <LoadingState label={l.loading} />}
      {!loading && loadError && <EmptyState variant="error" icon="!" title={l.error} />}
      {!loading && !loadError && races.length === 0 && <EmptyState icon="⚑" title={l.empty} action={canManage && <button className="primary-button" type="button" onClick={() => setRaceForm({ race: null, mechanicIds: [], vehicleIds: [] })}>＋ {l.newRace}</button>} />}
      {!loading && !loadError && races.length > 0 && <>
        <div className="race-list-toggle no-print">
          <button className={listView === "cards" ? "active" : ""} type="button" aria-pressed={listView === "cards"} onClick={() => setListView("cards")}>{locale === "cs" ? "Karty" : "Cards"}</button>
          <button className={listView === "table" ? "active" : ""} type="button" aria-pressed={listView === "table"} onClick={() => setListView("table")}>{locale === "cs" ? "Tabulka" : "Table"}</button>
        </div>
        <div className="race-list-filters no-print">
          <label><span>{locale === "cs" ? "Kategorie" : "Category"}</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">{locale === "cs" ? "Všechny" : "All"}</option>{availableCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          <label><span>{locale === "cs" ? "Trať" : "Circuit"}</span><select value={circuitFilter} onChange={(event) => setCircuitFilter(event.target.value)}><option value="">{locale === "cs" ? "Všechny" : "All"}</option>{availableCircuits.map((circuitName) => <option key={circuitName} value={circuitName}>{circuitName}</option>)}</select></label>
        </div>
        {currentRaces.length === 0 && <EmptyState variant="filtered" size="compact" title={locale === "cs" ? "Žádný závod neodpovídá filtru." : "No race matches the filter."} />}
        {currentRaces.length > 0 && listView === "cards" && <div className="race-cards">{currentRaces.map((race) => <button className="race-card" key={race.id} type="button" onClick={() => setSelectedId(race.id)}>
          <RaceLogoBadge logoUrl={race.logoUrl} name={race.name} fallback={countryFlag(race.countryCode)} size="large" />
          <span className="race-card-main"><small>MM RACE CONTROL{(race.series || race.seriesRound) && ` · ${[race.series, race.seriesRound ? `Round ${race.seriesRound}` : ""].filter(Boolean).join(" · ")}`}</small><strong>{race.name}</strong><span>{formatDateRange(race.startDate, race.endDate, locale)} · {race.track}, {race.countryCode}</span><i>{race.categories.join(" · ")}</i></span>
          <span className="race-card-counts"><b>{race.driverCount}</b><small>{pluralForm(race.driverCount, locale, DRIVER_FORMS)}</small><em className={`race-status ${race.status}`}>{raceStatus(race.status, locale)}</em><em className={`race-readiness-pill ${raceIsBasicallyReady(race) ? "done" : "pending"}`}>{raceIsBasicallyReady(race) ? "✓" : "⚠"} {locale === "cs" ? "Připraveno" : "Ready"}</em></span>
        </button>)}</div>}
        {currentRaces.length > 0 && listView === "table" && <div className="results-panel">
          <table className="results">
            <thead><tr><th>{locale === "cs" ? "Pořadí" : "Order"}</th><th>{locale === "cs" ? "Závod" : "Race"}</th><th>{locale === "cs" ? "Datum" : "Date"}</th><th>{l.status}</th><th className="num-col">{locale === "cs" ? "Pilotů" : "Drivers"}</th><th className="num-col">{locale === "cs" ? "Motorů" : "Engines"}</th><th className="num-col">{locale === "cs" ? "Karb." : "Carbs"}</th><th>{locale === "cs" ? "Připraveno" : "Ready"}</th><th /></tr></thead>
            <tbody>{currentRaces.map((race) => <tr key={race.id}>
              <td className="r-round num">{roundNumber.get(race.id) ?? "—"}</td>
              <td className="r-name"><RaceLogoBadge logoUrl={race.logoUrl} name={race.name} fallback={countryFlag(race.countryCode)} size="small" /><span>{countryFlag(race.countryCode)} {race.name}<small>{race.track}</small></span></td>
              <td>{formatDateRange(race.startDate, race.endDate, locale)}</td>
              <td><span className={`r-status ${race.status === "active" ? "next" : "upcoming"}`}>{raceStatus(race.status, locale)}</span></td>
              <td className="num-col">{race.driverCount}</td>
              <td className="num-col">{race.engineCount}</td>
              <td className="num-col">{race.carburetorCount}</td>
              <td><em className={`race-readiness-pill ${raceIsBasicallyReady(race) ? "done" : "pending"}`}>{raceIsBasicallyReady(race) ? "✓" : "⚠"}</em></td>
              <td><button type="button" className="r-link" onClick={() => setSelectedId(race.id)}>{locale === "cs" ? "Otevřít" : "Open"}</button></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </>}
    </section>
    {!loading && !loadError && <section className="dash-panel data-panel race-archive">
      <header><span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM RACE ARCHIVE</span><h2>{locale === "cs" ? "Archiv závodů" : "Race archive"}</h2></header>
      {archivedRacesAll.length === 0 ? <EmptyState size="compact" title={locale === "cs" ? "Zatím žádný archivovaný závod." : "No archived races yet."} /> : <>
      {archiveTypeTiles.length > 1 && <div className="carb-unit-category-tiles no-print">
        <button type="button" className={`carb-unit-tile${archiveTypeFilter === "" ? " active" : ""}`} onClick={() => setArchiveTypeFilter("")}>{locale === "cs" ? "Vše" : "All"}<small>{archivedRacesAll.length}</small></button>
        {archiveTypeTiles.map((tile) => <button key={tile.key} type="button" className={`carb-unit-tile${archiveTypeFilter === tile.key ? " active" : ""}`} onClick={() => setArchiveTypeFilter(tile.key)}>{tile.label}<small>{tile.count}</small></button>)}
      </div>}
      {archiveByYear.length === 0 && <EmptyState variant="filtered" size="compact" title={locale === "cs" ? "Žádný archivovaný závod neodpovídá filtru." : "No archived race matches the filter."} />}
      {archiveByYear.map((group) => <div className="race-archive-year" key={group.year}>
        <h3>{group.year}<small>{formatCount(group.races.length, locale, RACE_FORMS)}</small></h3>
        <div className="race-archive-grid">{group.races.map((race) => <button className="race-archive-tile" key={race.id} type="button" onClick={() => setSelectedId(race.id)} title={`${race.name} · ${race.track} · ${formatDateRange(race.startDate, race.endDate, locale)}`}>
          <RaceLogoBadge logoUrl={race.logoUrl} name={race.name} fallback={countryFlag(race.countryCode)} size="large" />
          <span>{race.name}<small>{formatDateRange(race.startDate, race.endDate, locale)}</small></span>
        </button>)}</div>
      </div>)}
      </>}
    </section>}
    {raceForm && <RaceForm locale={locale} race={raceForm.race} catalog={catalog} circuits={circuits} mechanicIds={raceForm.mechanicIds} vehicleIds={raceForm.vehicleIds} onClose={() => setRaceForm(null)} onSaved={async (id) => { setRaceForm(null); await load(); setSelectedId(id); }} />}
  </div>;
}

type RaceDetailTab = "plan" | "pilots" | "crew" | "checklist" | "travel" | "sales" | "visitors" | "deliveries" | "notes" | "finance" | "activity";
const DEFAULT_TAB_ORDER: RaceDetailTab[] = ["plan", "pilots", "crew", "checklist", "travel", "sales", "visitors", "deliveries", "notes", "finance", "activity"];
const TAB_ORDER_STORAGE_PREFIX = "mm-race-detail-tab-order";

function loadTabOrder(raceId: string): RaceDetailTab[] {
  if (typeof window === "undefined") return DEFAULT_TAB_ORDER;
  try {
    const saved = window.localStorage.getItem(`${TAB_ORDER_STORAGE_PREFIX}:${raceId}`) ?? window.localStorage.getItem(TAB_ORDER_STORAGE_PREFIX);
    if (!saved) return DEFAULT_TAB_ORDER;
    const parsed = JSON.parse(saved) as string[];
    const known = parsed.filter((tab): tab is RaceDetailTab => DEFAULT_TAB_ORDER.includes(tab as RaceDetailTab));
    const result = [...known];
    for (const tab of DEFAULT_TAB_ORDER) {
      if (result.includes(tab)) continue;
      const precedingDefaultTabs = DEFAULT_TAB_ORDER.slice(0, DEFAULT_TAB_ORDER.indexOf(tab));
      let insertAt = 0;
      for (let index = precedingDefaultTabs.length - 1; index >= 0; index -= 1) {
        const knownIndex = result.indexOf(precedingDefaultTabs[index]);
        if (knownIndex !== -1) { insertAt = knownIndex + 1; break; }
      }
      result.splice(insertAt, 0, tab);
    }
    return result;
  } catch {
    return DEFAULT_TAB_ORDER;
  }
}

function saveTabOrder(raceId: string, order: RaceDetailTab[]) {
  try {
    window.localStorage.setItem(`${TAB_ORDER_STORAGE_PREFIX}:${raceId}`, JSON.stringify(order));
  } catch {
    // ignore storage failures (private browsing, quota, etc.)
  }
}

function RaceDetail({ race, catalog, engines, locale, role, previousRace, onBack, onEdit, onArchive, onRaceChanged }: { race: RaceRecord; catalog: CatalogData; engines: EngineChoice[]; locale: Locale; role: Role; previousRace?: { id: string; name: string; startDate: string; endDate: string } | null; onBack: () => void; onEdit: (mechanicIds: string[], vehicleIds: string[]) => void; onArchive: () => void; onRaceChanged: () => Promise<void> }) {
  const l = text[locale];
  const [plan, setPlan] = useState<RacePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [entryForm, setEntryForm] = useState<{ category: string; entry: RaceEntry | null } | null>(null);
  const [extraForm, setExtraForm] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<RaceDetailTab>("plan");
  const [logoPreview, setLogoPreview] = useState<ClothingPhotoPreview | null>(null);
  const [tabOrder, setTabOrder] = useState<RaceDetailTab[]>(DEFAULT_TAB_ORDER);
  const [draggedTab, setDraggedTab] = useState<RaceDetailTab | null>(null);
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const canManage = role !== "mechanic" && (race.status !== "completed" || role === "superadmin");
  const canViewFinance = role === "superadmin" || role === "boss";

  useEffect(() => {
    const order = loadTabOrder(race.id);
    setTabOrder(order);
    const firstVisible = order.find((tab) => (tab === "sales" || tab === "finance" || tab === "activity") ? canViewFinance : true);
    if (firstVisible) setDetailTab(firstVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [race.id]);

  function reorderTab(from: RaceDetailTab, to: RaceDetailTab) {
    if (from === to) return;
    setTabOrder((current) => {
      const next = current.filter((tab) => tab !== from);
      const targetIndex = next.indexOf(to);
      next.splice(targetIndex, 0, from);
      saveTabOrder(race.id, next);
      return next;
    });
  }

  const TAB_LABELS: Record<RaceDetailTab, string> = {
    plan: locale === "cs" ? "Plán závodu" : "Race plan",
    pilots: locale === "cs" ? "Piloti" : "Drivers",
    crew: locale === "cs" ? "Posádka a doprava" : "Crew and transport",
    checklist: locale === "cs" ? "Checklist" : "Checklist",
    travel: locale === "cs" ? "Cesta a ubytování" : "Travel and accommodation",
    sales: locale === "cs" ? "Prodej a servis" : "Sales and service",
    visitors: locale === "cs" ? "Jiné týmy" : "Other teams",
    deliveries: locale === "cs" ? "Předávky a platby" : "Deliveries and payments",
    notes: locale === "cs" ? "Poznatky ze závodu" : "Race notes",
    finance: locale === "cs" ? "Finance" : "Finance",
    activity: locale === "cs" ? "Historie" : "History",
  };
  const visibleTabOrder = tabOrder.filter((tab) => (tab === "sales" || tab === "finance" || tab === "activity") ? canViewFinance : true);

  function goToCategories() {
    requestAnimationFrame(() => document.getElementById("race-plan-categories")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function reorderEntries(fromId: string, toId: string) {
    if (fromId === toId || !plan) return;
    const current = plan.entries.map((entry) => entry.id);
    const next = current.filter((id) => id !== fromId);
    next.splice(next.indexOf(toId), 0, fromId);
    setPlan((currentPlan) => currentPlan ? { ...currentPlan, entries: next.map((id) => currentPlan.entries.find((entry) => entry.id === id)!) } : currentPlan);
    setReordering(true);
    try {
      const response = await fetch("/api/race-planning", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "reorder", raceId: race.id, order: next }),
      });
      if (response.ok) await loadPlan(true);
    } finally {
      setReordering(false);
    }
  }

  async function confirmAllPilots() {
    setConfirmingAll(true);
    try {
      const response = await fetch("/api/race-planning", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "confirmAll", raceId: race.id }),
      });
      if (response.ok) await loadPlan(true);
    } finally {
      setConfirmingAll(false);
    }
  }

  function renderCategoryStack(sectionId: string) {
    if (loading) return <section className="dash-panel"><LoadingState label={locale === "cs" ? "Načítám plán…" : "Loading plan…"} /></section>;
    if (!plan) return null;
    return <section className="race-category-stack" id={sectionId}>{race.categories.map((category) => {
      const entries = plan.entries.filter((entry) => entry.category === category);
      const extras = plan.extras
        .filter((extra) => extra.category === category)
        .sort((left, right) => left.resourceType === right.resourceType ? 0 : left.resourceType === "engine" ? -1 : 1);
      const assignedEngineIds = uniqueStrings(entries.flatMap((entry) => [entry.engine1Id, entry.engine2Id, entry.engine3Id]));
      const extraEngineIds = uniqueStrings(extras.filter((extra) => extra.resourceType === "engine").map((extra) => extra.resourceId));
      const assignedCarburetorIds = uniqueStrings(entries.flatMap((entry) => [entry.carburetor1Id, entry.carburetor2Id, entry.carburetor3Id]));
      const extraCarburetorIds = uniqueStrings(extras.filter((extra) => extra.resourceType === "carburetor").map((extra) => extra.resourceId));
      const isKz = category === "KZ";
      const maxEngines = isKz ? 2 : 3;
      const maxCarburetors = 3;
      // The header names only as many positions as anyone in the category currently uses —
      // it grows from "Motor 1" to "Motor 1, Motor 2" etc. the moment a second slot is filled.
      const usedEngineSlots = Math.min(maxEngines, Math.max(1, ...entries.map((entry) => [entry.engine1Id, entry.engine2Id, entry.engine3Id].filter(Boolean).length)));
      const usedCarburetorSlots = Math.min(maxCarburetors, Math.max(1, ...entries.map((entry) => [entry.carburetor1Id, entry.carburetor2Id, entry.carburetor3Id].filter(Boolean).length)));
      const engineHeaderLabels = Array.from({ length: usedEngineSlots }, (_, index) => `${locale === "cs" ? "Motor" : "Engine"} ${index + 1}`);
      const carburetorHeaderLabels = Array.from({ length: usedCarburetorSlots }, (_, index) => `${locale === "cs" ? "Karb." : "Carb."} ${index + 1}`);
      // Column width is driven by the widest code actually assigned at that position across
      // the whole category, so real codes never truncate; header + row chips share the exact
      // same px number, which is what keeps them aligned regardless of content length.
      const engineColumnWidths = engineHeaderLabels.map((text, index) => equipmentColumnWidth(text, uniqueStrings(entries.map((entry) => [entry.engine1Code, entry.engine2Code, entry.engine3Code][index]))));
      const carburetorColumnWidths = carburetorHeaderLabels.map((text, index) => equipmentColumnWidth(text, uniqueStrings(entries.map((entry) => [entry.carburetor1Code, entry.carburetor2Code, entry.carburetor3Code][index]))));
      return <article className={`dash-panel race-category category-${category.toLowerCase().replaceAll(" ", "-")}`} key={category}>
        <header><div className="category-heading"><span>{l.category}</span><h2>{category}</h2></div><CategoryLoadoutStats locale={locale} pilotCount={entries.length} engineCount={assignedEngineIds.length} extraEngineCount={extraEngineIds.length} carburetorCount={assignedCarburetorIds.length} extraCarburetorCount={extraCarburetorIds.length} /><div className="category-print-context print-only"><div><strong>{race.name}</strong><small>{formatDateRange(race.startDate, race.endDate, locale)} · {race.track}</small></div><img src="/machac-motors-logo.jpg" alt="Macháč Motors" /></div><div className="category-actions no-print">{canManage && <><button className="secondary-compact" type="button" onClick={() => setExtraForm(category)}>＋ {l.addExtra}</button><button className="primary-button" type="button" onClick={() => setEntryForm({ category, entry: null })}>＋ {l.addDriver}</button></>}</div></header>
        {entries.length === 0 ? <EmptyState size="compact" title={l.noDrivers} /> : <div className="race-entry-list"><div className={isKz ? "entry-table kz-table" : "entry-table"}>
          <div className="entry-table-head">
            <span>#</span>
            <span>{l.driver}</span>
            <span className="entry-equipment-head">{engineHeaderLabels.map((text, index) => <b key={text} style={equipmentColumnStyle(engineColumnWidths[index])}>{text}</b>)}</span>
            {!isKz && <span className="entry-equipment-head">{carburetorHeaderLabels.map((text, index) => <b key={text} style={equipmentColumnStyle(carburetorColumnWidths[index])}>{text}</b>)}</span>}
            <span>{l.notes}</span>
            <span>{l.status}</span>
            <span className="no-print">{l.actions}</span>
          </div>
          {entries.map((entry) => {
            const engineValues = [entry.engine1Id ?? "", entry.engine2Id ?? "", entry.engine3Id ?? ""];
            const carburetorValues = [entry.carburetor1Id ?? "", entry.carburetor2Id ?? "", entry.carburetor3Id ?? ""];
            const engineCodes = [entry.engine1Code, entry.engine2Code, entry.engine3Code];
            const engineConfigurations = [entry.engine1Configuration, entry.engine2Configuration, entry.engine3Configuration];
            const carburetorCodes = [entry.carburetor1Code, entry.carburetor2Code, entry.carburetor3Code];
            const engineChoices = engines.filter((engine) => engineMatches(engine.family, category) && engine.status !== "retired" && !isSold(engine.soldAt));
            const selectedEngines = engineValues.map((engineId) => engines.find((engine) => engine.id === engineId));
            const carburetorChoices = catalog.carburetors.filter((carburetor) => carbMatches(carburetor.family, category) && carburetor.status !== "retired" && !isSold(carburetor.soldAt));
            const entryTeam = entry.teamId ? catalog.teams.find((team) => team.id === entry.teamId) : undefined;
            const entryDriver = catalog.drivers.find((driver) => driver.id === entry.driverId);
            function renderEquipmentCell(type: "engine" | "carburetor", values: string[], codes: string[], configurations: string[], selectedList: Array<{ upgradeCode?: string; labelColor?: string } | undefined>, equipmentChoices: EngineChoice[] | CarburetorRecord[], max: number, columnWidths: number[]) {
              const filledCount = values.filter(Boolean).length;
              const slotIndexes = Array.from({ length: filledCount }, (_, i) => i);
              if (canManage && filledCount < max) slotIndexes.push(filledCount);
              const zoneLabel = type === "engine" ? (locale === "cs" ? "Motory" : "Engines") : (locale === "cs" ? "Karburátory" : "Carburetors");
              return <div className="entry-equipment-cell" data-equip-label={zoneLabel}>
                {slotIndexes.length === 0 && <span className="equipment-empty">—</span>}
                {slotIndexes.map((index) => {
                  const columnWidth = index < filledCount ? columnWidths[index] : undefined;
                  return canManage
                    ? <InlineEquipmentPicker key={`${type}-${index}-${values[index]}`} type={type} position={index + 1} entry={entry} value={values[index] ?? ""} code={codes[index] ?? ""} configuration={configurations[index] ?? ""} upgradeCode={selectedList[index]?.upgradeCode ?? ""} labelColor={selectedList[index]?.labelColor ?? ""} selectedIds={values} choices={equipmentChoices} plan={plan!} locale={locale} isAddSlot={index === filledCount} columnWidth={columnWidth} onChange={(value) => updateEquipment(entry, type, index + 1, value)} />
                    : <EquipmentValue key={`${type}-${index}`} code={codes[index] ?? ""} configuration={configurations[index] ?? ""} upgradeCode={selectedList[index]?.upgradeCode ?? ""} labelColor={selectedList[index]?.labelColor ?? ""} columnWidth={columnWidth} />;
                })}
              </div>;
            }
            return <div
              id={`race-entry-${entry.id}`}
              className={`entry-table-row ${entry.isConfirmed ? "confirmed" : "unconfirmed"} ${draggedEntryId === entry.id ? "dragging" : ""}`}
              key={entry.id}
            >
              <div
                className="entry-num"
                draggable={canManage && !reordering}
                onDragStart={() => setDraggedEntryId(entry.id)}
                onDragEnd={() => setDraggedEntryId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); if (draggedEntryId) void reorderEntries(draggedEntryId, entry.id); setDraggedEntryId(null); }}
                title={canManage ? (locale === "cs" ? "Přetažením změníš pořadí" : "Drag to reorder") : undefined}
              >#{driverNumber(catalog.drivers, entry.driverId)}</div>
              <div className="entry-driver"><strong>{entryDriver?.nationality && <span className="entry-flag">{countryFlag(entryDriver.nationality)}</span>}{entry.driverName}</strong><span className="entry-team">{entryTeam?.logoUrl && <RaceLogoBadge logoUrl={entryTeam.logoUrl} name={entryTeam.name} size="small" onOpen={setLogoPreview} />}{entry.teamName || "—"}</span></div>
              {renderEquipmentCell("engine", engineValues, engineCodes, engineConfigurations, selectedEngines, engineChoices, maxEngines, engineColumnWidths)}
              {!isKz && renderEquipmentCell("carburetor", carburetorValues, carburetorCodes, [], [], carburetorChoices, maxCarburetors, carburetorColumnWidths)}
              <div className="entry-note"><InlineDriverNote entry={entry} canManage={canManage} locale={locale} onSave={(notes) => updateEntryNote(entry, notes)} /></div>
              <div className="entry-status">{canManage ? <button className={`confirmation-toggle no-print ${entry.isConfirmed ? "confirmed" : "unconfirmed"}`} type="button" aria-pressed={entry.isConfirmed} onClick={() => { void toggleConfirmation(entry); }}>{entry.isConfirmed ? (locale === "cs" ? "✓ Potvrzen" : "✓ Confirmed") : (locale === "cs" ? "Nepotvrzen" : "Unconfirmed")}</button> : null}<span className={`print-only confirmation-label ${entry.isConfirmed ? "confirmed" : "unconfirmed"}`}>{entry.isConfirmed ? (locale === "cs" ? "Potvrzen" : "Confirmed") : (locale === "cs" ? "Nepotvrzen" : "Unconfirmed")}</span></div>
              <div className="entry-actions no-print">{canManage && <><button type="button" onClick={() => setEntryForm({ category, entry })} aria-label={l.editAssignment} title={l.editAssignment}>✎</button><button className="delete" type="button" onClick={() => { void remove("entry", entry.id); }} aria-label={l.delete} title={l.delete}>×</button></>}</div>
            </div>;
          })}
        </div></div>}
        {extras.length > 0 && <div className="race-extra-entry-list">{extras.map((extra) => <ExtraEquipmentRow key={extra.id} extra={extra} engine={extra.resourceType === "engine" ? engines.find((item) => item.id === extra.resourceId) : undefined} locale={locale} canManage={canManage} onRemove={() => remove("extra", extra.id)} />)}</div>}
      </article>;
    })}</section>;
  }

  async function loadPlan(silent = false) {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/race-planning?raceId=${encodeURIComponent(race.id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      setPlan((await response.json()) as RacePlan);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  function keepEntryInPlace(entryId: string, previousTop: number | null) {
    if (previousTop === null) return;
    requestAnimationFrame(() => {
      const nextTop = document.getElementById(`race-entry-${entryId}`)?.getBoundingClientRect().top;
      if (typeof nextTop === "number") window.scrollBy(0, nextTop - previousTop);
    });
  }

  function printRacePlan() {
    const previousTitle = document.title;
    document.body.dataset.printMode = "plan";
    document.title = racePrintTitle(race);
    window.print();
    window.setTimeout(() => { delete document.body.dataset.printMode; document.title = previousTitle; }, 500);
  }

  function printPilots() {
    const previousTitle = document.title;
    document.body.dataset.printMode = "pilots";
    document.title = `${racePrintTitle(race)}_pilots`;
    window.print();
    window.setTimeout(() => { delete document.body.dataset.printMode; document.title = previousTitle; }, 500);
  }

  useEffect(() => { void loadPlan(); }, [race.id]);

  async function assign(kind: "mechanic" | "vehicle", resourceId: string) {
    if (!resourceId) return;
    const response = await fetch("/api/race-planning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raceId: race.id, kind, [`${kind}Id`]: resourceId }) });
    if (!response.ok) return showApiError(response, locale);
    await loadPlan();
    await onRaceChanged();
  }

  async function remove(kind: "entry" | "mechanic" | "vehicle" | "extra", id: string) {
    const response = await fetch("/api/race-planning", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ raceId: race.id, kind, id }) });
    if (!response.ok) return showApiError(response, locale);
    await loadPlan();
    await onRaceChanged();
  }

  async function updateMechanicVehicle(mechanicRowId: string, vehicleId: string) {
    setPlan((current) => current ? { ...current, mechanics: current.mechanics.map((item) => item.id === mechanicRowId ? { ...item, vehicleId: vehicleId || null } : item) } : current);
    const response = await fetch("/api/race-planning", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ raceId: race.id, kind: "mechanic", id: mechanicRowId, vehicleId }) });
    if (!response.ok) {
      await showApiError(response, locale);
      await loadPlan();
      return;
    }
    await onRaceChanged();
  }

  async function updateEquipment(entry: RaceEntry, type: "engine" | "carburetor", position: number, resourceId: string) {
    const previousTop = document.getElementById(`race-entry-${entry.id}`)?.getBoundingClientRect().top ?? null;
    let engineIds = [entry.engine1Id ?? "", entry.engine2Id ?? "", entry.engine3Id ?? ""];
    let carburetorIds = [entry.carburetor1Id ?? "", entry.carburetor2Id ?? "", entry.carburetor3Id ?? ""];
    if (type === "engine") engineIds[position - 1] = resourceId;
    else carburetorIds[position - 1] = resourceId;
    // Keep slots gapless — Motor/Karb. 1 always fills first, so clearing a middle slot
    // shifts the remaining ones up instead of leaving a hole the UI would have to show.
    engineIds = compactSlots(engineIds);
    carburetorIds = compactSlots(carburetorIds);
    const response = await fetch("/api/race-planning", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "entry", raceId: race.id, id: entry.id, category: entry.category, driverId: entry.driverId, engineIds, carburetorIds, isConfirmed: entry.isConfirmed, notes: entry.notes }),
    });
    if (!response.ok) {
      await showApiError(response, locale);
      await loadPlan(true);
      keepEntryInPlace(entry.id, previousTop);
      return false;
    }
    await loadPlan(true);
    await onRaceChanged();
    keepEntryInPlace(entry.id, previousTop);
    return true;
  }

  async function toggleConfirmation(entry: RaceEntry) {
    const isConfirmed = !entry.isConfirmed;
    setPlan((current) => current ? { ...current, entries: current.entries.map((item) => item.id === entry.id ? { ...item, isConfirmed } : item) } : current);
    const response = await fetch("/api/race-planning", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "confirmation", raceId: race.id, id: entry.id, isConfirmed }),
    });
    if (!response.ok) {
      await showApiError(response, locale);
      await loadPlan();
      return;
    }
    await onRaceChanged();
  }

  async function updateEntryNote(entry: RaceEntry, notes: string) {
    const previousTop = document.getElementById(`race-entry-${entry.id}`)?.getBoundingClientRect().top ?? null;
    const response = await fetch("/api/race-planning", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "entry",
        raceId: race.id,
        id: entry.id,
        category: entry.category,
        driverId: entry.driverId,
        engineIds: [entry.engine1Id ?? "", entry.engine2Id ?? "", entry.engine3Id ?? ""],
        carburetorIds: [entry.carburetor1Id ?? "", entry.carburetor2Id ?? "", entry.carburetor3Id ?? ""],
        isConfirmed: entry.isConfirmed,
        notes,
      }),
    });
    if (!response.ok) {
      await showApiError(response, locale);
      await loadPlan(true);
      keepEntryInPlace(entry.id, previousTop);
      return false;
    }
    await loadPlan(true);
    keepEntryInPlace(entry.id, previousTop);
    return true;
  }

  const unassignedMechanics = catalog.mechanics.filter((item) => !plan?.mechanics.some((assigned) => assigned.mechanicId === item.id));
  const unassignedVehicles = catalog.vehicles.filter((item) => !plan?.vehicles.some((assigned) => assigned.vehicleId === item.id));

  const totalDrivers = plan?.entries.length ?? 0;
  const driversConfirmed = plan?.entries.filter((entry) => entry.isConfirmed).length ?? 0;
  const driversWithEngine = plan?.entries.filter((entry) => entry.engine1Id).length ?? 0;
  const carbApplicable = plan?.entries.filter((entry) => entry.category !== "KZ") ?? [];
  const driversWithCarburetor = carbApplicable.filter((entry) => entry.carburetor1Id).length;
  const hasMechanics = (plan?.mechanics.length ?? 0) > 0;
  const hasVehicles = (plan?.vehicles.length ?? 0) > 0;
  const vehiclesNeedingServiceCount = (plan?.vehicles ?? []).reduce((count, item) => {
    const vehicleRecord = catalog.vehicles.find((vehicle) => vehicle.id === item.vehicleId);
    const status = vehicleRecord ? vehicleServiceStatus(vehicleRecord) : "unknown";
    return status === "due" || status === "soon" ? count + 1 : count;
  }, 0);
  const isRaceReady = totalDrivers > 0 && driversWithEngine === totalDrivers && driversWithCarburetor === carbApplicable.length && hasMechanics && hasVehicles && vehiclesNeedingServiceCount === 0;

  return <div className="race-detail print-area">
    <div className="detail-back"><button type="button" onClick={onBack}>← {l.back}</button></div>
    <section className="dash-panel race-detail-hero">
      <div className="race-hero-title"><RaceLogoBadge logoUrl={race.logoUrl} name={race.name} fallback={countryFlag(race.countryCode)} size="large" onOpen={setLogoPreview} /><div><span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM RACE CONTROL{(race.series || race.seriesRound) && <span className="race-series-tag">{[race.series, race.seriesRound ? `Round ${race.seriesRound}` : ""].filter(Boolean).join(" · ")}</span>}</span><h2>{race.name}</h2><p>{countryFlag(race.countryCode)} {race.track}, {race.countryCode}</p></div></div>
      <div className="race-hero-brand"><img src="/machac-motors-logo.jpg" alt="Macháč Motors" /><div className="race-hero-actions no-print">{canPrintFromTab(detailTab) && <button className="secondary-compact" type="button" onClick={printRacePlan}>⌁ {l.print}</button>}{canManage && <button className="secondary-compact" type="button" onClick={() => onEdit(plan?.mechanics.map((item) => item.mechanicId) ?? [], plan?.vehicles.map((item) => item.vehicleId) ?? [])}>✎ {l.edit}</button>}{role === "superadmin" && <button className="danger-compact" type="button" onClick={onArchive}>{l.remove}</button>}</div></div>
    </section>
    <nav className="race-detail-section-tabs no-print" role="tablist" aria-label={locale === "cs" ? "Část detailu závodu — přetažením přeuspořádáš" : "Race detail section — drag to reorder"}>
      {visibleTabOrder.map((tab) => <button
        key={tab}
        id={`race-tab-${tab}`}
        role="tab"
        aria-selected={detailTab === tab}
        aria-controls={`race-panel-${tab}`}
        className={`${detailTab === tab ? "active" : ""} ${draggedTab === tab ? "dragging" : ""}`}
        type="button"
        draggable
        onDragStart={() => setDraggedTab(tab)}
        onDragEnd={() => setDraggedTab(null)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); if (draggedTab) reorderTab(draggedTab, tab); }}
        onClick={() => setDetailTab(tab)}
        title={locale === "cs" ? "Přetažením změníš pořadí" : "Drag to reorder"}
      >{TAB_LABELS[tab]}</button>)}
    </nav>
    <div id="race-panel-plan" role="tabpanel" aria-labelledby="race-tab-plan" className={`race-plan-section ${detailTab === "plan" ? "active" : "hidden"}`}>
    {!loading && plan && (
      <section className={`race-readiness no-print ${isRaceReady ? "ok" : "warn"}`}>
        <div className="race-readiness-status"><b>{isRaceReady ? "✓" : "⚠"}</b><strong>{isRaceReady ? (locale === "cs" ? "Závod je připraven" : "Race is ready") : (locale === "cs" ? "Závod ještě není kompletní" : "Race is not complete yet")}</strong></div>
        <div className="race-readiness-checks">
          <button type="button" className={hasMechanics ? "done" : "pending"} onClick={() => setDetailTab("crew")}>{hasMechanics ? "✓" : "○"} {l.mechanics}</button>
          <button type="button" className={hasVehicles ? "done" : "pending"} onClick={() => setDetailTab("crew")}>{hasVehicles ? "✓" : "○"} {l.cars}</button>
          {hasVehicles && <button type="button" className={vehiclesNeedingServiceCount === 0 ? "done" : "pending"} onClick={() => setDetailTab("crew")}>{vehiclesNeedingServiceCount === 0 ? "✓" : "⚠"} {locale === "cs" ? "Servis vozidel" : "Vehicle service"}</button>}
          {totalDrivers > 0 && <button type="button" className={driversConfirmed === totalDrivers ? "done" : "pending"} onClick={goToCategories}>{driversConfirmed === totalDrivers ? "✓" : "○"} {locale === "cs" ? "Piloti" : "Drivers"}: {driversConfirmed}/{totalDrivers}</button>}
          {totalDrivers > 0 && <button type="button" className={driversWithEngine === totalDrivers ? "done" : "pending"} onClick={goToCategories}>{driversWithEngine === totalDrivers ? "✓" : "○"} {locale === "cs" ? "Motory" : "Engines"}: {driversWithEngine}/{totalDrivers}</button>}
          {carbApplicable.length > 0 && <button type="button" className={driversWithCarburetor === carbApplicable.length ? "done" : "pending"} onClick={goToCategories}>{driversWithCarburetor === carbApplicable.length ? "✓" : "○"} {locale === "cs" ? "Karburátory" : "Carburetors"}: {driversWithCarburetor}/{carbApplicable.length}</button>}
        </div>
      </section>
    )}
    <section className="stats-panel race-facts">
      <div className="race-facts-grid">
        <div className="race-facts-cell"><small>{l.raceDates}</small><strong>{formatDateRange(race.startDate, race.endDate, locale)}</strong></div>
        <div className="race-facts-cell"><small>{l.mechanics}</small><strong>{plan?.mechanics.length ? plan.mechanics.map((item) => item.mechanicName).join(", ") : (locale === "cs" ? "Zatím nikdo" : "Nobody yet")}</strong></div>
        <div className="race-facts-cell"><small>{l.cars}</small><strong>{plan?.vehicles.length ? plan.vehicles.map((item) => item.vehicleName).join(", ") : (locale === "cs" ? "Zatím žádné" : "None yet")}</strong><span>{plan?.vehicles.filter((item) => item.licensePlate).map((item) => item.licensePlate).join(" · ") || undefined}</span></div>
        <div className="race-facts-cell"><small>{l.travel}</small><strong>{formatDateRange(race.departureDate, race.returnDate, locale)}</strong></div>
        <div className="race-facts-cell"><small>{locale === "cs" ? "Trať / adresa" : "Track / address"}</small><strong>{race.track}</strong><span>{race.address || "—"}</span></div>
        <div className="race-facts-cell workshop-trip"><small>{locale === "cs" ? "Cesta z dílny" : "Trip from workshop"}</small><strong>{race.circuitDistanceKm !== null || race.circuitDriveMinutes !== null ? <>{race.circuitDistanceKm !== null ? `${formatDecimal(race.circuitDistanceKm, locale)} km` : "—"}{race.circuitDriveMinutes !== null ? ` · ≈ ${formatDriveMinutes(race.circuitDriveMinutes, locale)}` : ""}</> : (locale === "cs" ? "Po přiřazení tratě" : "After assigning a circuit")}</strong><span>{locale === "cs" ? "Vlčovice 314 · orientačně, bez aktuální dopravy" : "Vlčovice 314 · estimate, without live traffic"}</span></div>
        <div className="race-facts-cell"><small>{l.status}</small><strong>{raceStatus(race.status, locale)}</strong><span>{race.organizer || "—"}</span></div>
      </div>
    </section>
    {race.circuitId ? <RaceCircuitPanel race={race} locale={locale} /> : <section className="dash-panel race-circuit-missing no-print">
      <div><span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM CIRCUIT DIRECTORY</span><h2>{locale === "cs" ? "Trať zatím není propojená" : "No circuit linked yet"}</h2><p>{locale === "cs" ? "Propoj závod s adresářem tratí a uvidíš tu počasí i vzdálenost z dílny." : "Link the race to the circuit directory to see weather and the trip from the workshop here."}</p></div>
      {canManage && <button className="secondary-compact" type="button" onClick={() => onEdit(plan?.mechanics.map((item) => item.mechanicId) ?? [], plan?.vehicles.map((item) => item.vehicleId) ?? [])}>{locale === "cs" ? "Vybrat trať" : "Select circuit"}</button>}
    </section>}
    {plan && <RaceEquipmentOverview race={race} plan={plan} carburetors={catalog.carburetors} locale={locale} />}
    {renderCategoryStack("race-plan-categories")}
    </div>
    <div id="race-panel-pilots" role="tabpanel" aria-labelledby="race-tab-pilots" className={`race-plan-section no-print ${detailTab === "pilots" ? "active" : "hidden"}`}>
    {totalDrivers > 0 && <div className="race-pilots-bulk-actions no-print">
      <button className="secondary-compact" type="button" onClick={printPilots}>⌁ {locale === "cs" ? "Vytisknout piloty" : "Print drivers"}</button>
      {canManage && driversConfirmed < totalDrivers && <button className="secondary-compact" type="button" disabled={confirmingAll} onClick={() => { void confirmAllPilots(); }}>{confirmingAll ? (locale === "cs" ? "Potvrzuji…" : "Confirming…") : `✓ ${locale === "cs" ? "Potvrdit všechny piloty" : "Confirm all drivers"}`}</button>}
    </div>}
    {plan && <RaceEquipmentOverview race={race} plan={plan} carburetors={catalog.carburetors} locale={locale} />}
    {renderCategoryStack("race-pilots-categories")}
    </div>
    <div id="race-panel-crew" role="tabpanel" aria-labelledby="race-tab-crew" className={`race-plan-section ${detailTab === "crew" ? "active" : "hidden"}`}>
    <section className="dash-panel race-logistics-panel">
      <header><div><span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM RACE LOGISTICS</span><h2>{locale === "cs" ? "Posádka a doprava" : "Crew and transport"}</h2><p>{locale === "cs" ? "Mechanici a týmová auta přiřazená k tomuto závodu." : "Mechanics and team vehicles assigned to this race."}</p></div><div className="race-logistics-summary"><span><strong>{plan?.mechanics.length ?? 0}</strong>{pluralForm(plan?.mechanics.length ?? 0, locale, MECHANIC_FORMS)}</span><span><strong>{plan?.vehicles.length ?? 0}</strong>{pluralForm(plan?.vehicles.length ?? 0, locale, VEHICLE_FORMS)}</span></div></header>
      <div className="race-logistics">
        <AssignmentStrip icon="M" title={l.mechanics} locale={locale} items={plan?.mechanics.map((item) => ({ id: item.id, label: item.mechanicName })) ?? []} options={unassignedMechanics.map((item) => ({ id: item.id, label: item.name }))} canManage={canManage} emptyText={l.noResources} onAdd={(id) => assign("mechanic", id)} onDelete={(id) => remove("mechanic", id)} />
        <AssignmentStrip icon="A" title={l.cars} locale={locale} items={plan?.vehicles.map((item) => { const vehicleRecord = catalog.vehicles.find((vehicle) => vehicle.id === item.vehicleId); const status = vehicleRecord ? vehicleServiceStatus(vehicleRecord) : "unknown"; const badge = status === "due" ? <span className="status-pill danger" key="svc">{locale === "cs" ? "Servis" : "Service"}</span> : status === "soon" ? <span className="status-pill warning-pill" key="svc">{locale === "cs" ? "Brzy servis" : "Service soon"}</span> : null; return { id: item.id, label: `${item.vehicleName}${item.licensePlate ? ` · ${item.licensePlate}` : ""}`, badge }; }) ?? []} options={unassignedVehicles.map((item) => ({ id: item.id, label: `${item.name}${item.licensePlate ? ` · ${item.licensePlate}` : ""}` }))} canManage={canManage} emptyText={l.noResources} onAdd={(id) => assign("vehicle", id)} onDelete={(id) => remove("vehicle", id)} />
      </div>
      {hasMechanics && hasVehicles && <div className="race-crew-pairing">
        <span className="field-help">{locale === "cs" ? "Kdo jede v kterém autě (nepovinné)" : "Who rides in which vehicle (optional)"}</span>
        {plan!.mechanics.map((mechanic) => <div className="race-crew-pairing-row" key={mechanic.id}>
          <span>{mechanic.mechanicName}</span>
          <select disabled={!canManage} value={mechanic.vehicleId ?? ""} onChange={(event) => void updateMechanicVehicle(mechanic.id, event.target.value)}>
            <option value="">{locale === "cs" ? "— bez přiřazení —" : "— unassigned —"}</option>
            {plan!.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.vehicleId}>{vehicle.vehicleName}</option>)}
          </select>
        </div>)}
      </div>}
    </section>
    </div>
    <div id="race-panel-checklist" role="tabpanel" aria-labelledby="race-tab-checklist" className={`race-plan-section no-print ${detailTab === "checklist" ? "active" : "hidden"}`}>
    <RaceChecklistPanel race={race} locale={locale} role={role} vehicles={plan?.vehicles.map((item) => ({ vehicleId: item.vehicleId, vehicleName: item.vehicleName })) ?? []} />
    </div>
    <div id="race-panel-travel" role="tabpanel" aria-labelledby="race-tab-travel" className={`race-plan-section ${detailTab === "travel" ? "active" : "hidden"}`}>
    <RaceLogisticsPanel raceId={race.id} locale={locale} role={role} />
    </div>
    {canViewFinance && <div id="race-panel-sales" role="tabpanel" aria-labelledby="race-tab-sales" className={`race-plan-section ${detailTab === "sales" ? "active" : "hidden"}`}>
    <RaceSalesPanel race={race} locale={locale} role={role} />
    </div>}
    <div id="race-panel-visitors" role="tabpanel" aria-labelledby="race-tab-visitors" className={`race-plan-section no-print ${detailTab === "visitors" ? "active" : "hidden"}`}>
    <RaceTeamVisitsPanel race={race} locale={locale} role={role} />
    </div>
    <div id="race-panel-deliveries" role="tabpanel" aria-labelledby={detailTab === "notes" ? "race-tab-notes" : "race-tab-deliveries"} className={`race-plan-section ${detailTab === "deliveries" || detailTab === "notes" ? "active" : "hidden"}`}>
    {race.notes && <section className={`dash-panel race-notes ${detailTab === "deliveries" ? "screen-hidden" : ""}`}><small>{l.notes}</small><p>{race.notes}</p></section>}
    <RaceDeliveriesPanel race={race} locale={locale} role={role} activeSection={detailTab === "notes" ? "notes" : "deliveries"} previousRace={previousRace} />
    </div>
    {canViewFinance && <div id="race-panel-finance" role="tabpanel" aria-labelledby="race-tab-finance" className={`race-plan-section no-print ${detailTab === "finance" ? "active" : "hidden"}`}>
    <RaceFinancePanel race={race} locale={locale} onOpenSales={canViewFinance ? () => setDetailTab("sales") : undefined} onOpenVisits={canViewFinance ? () => setDetailTab("visitors") : undefined} />
    </div>}
    {canViewFinance && <div id="race-panel-activity" role="tabpanel" aria-labelledby="race-tab-activity" className={`race-plan-section no-print ${detailTab === "activity" ? "active" : "hidden"}`}>
    <RaceActivityPanel race={race} locale={locale} active={detailTab === "activity"} />
    </div>}
    {logoPreview && <ClothingLightbox preview={logoPreview} onClose={() => setLogoPreview(null)} />}
    {entryForm && <EntryForm locale={locale} raceId={race.id} category={entryForm.category} entry={entryForm.entry} drivers={catalog.drivers} assignedDriverIds={plan?.entries.map((item) => item.driverId) ?? []} onClose={() => setEntryForm(null)} onSaved={async () => { setEntryForm(null); await loadPlan(); await onRaceChanged(); }} />}
    {extraForm && <ExtraForm locale={locale} raceId={race.id} category={extraForm} engines={engines} carburetors={catalog.carburetors} onClose={() => setExtraForm(null)} onSaved={async () => { setExtraForm(null); await loadPlan(); }} />}
  </div>;
}

function RaceCircuitPanel({ race, locale }: { race: RaceRecord; locale: Locale }) {
  const [preview, setPreview] = useState<ClothingPhotoPreview | null>(null);
  const mapsUrl = race.circuitMapsUrl || (race.circuitAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(race.circuitAddress)}` : "");
  const circuitLabel = race.circuitName || race.track;
  return <section className="dash-panel race-circuit-panel">
    <div className={`race-circuit-image${race.circuitImageUrl ? " has-image" : ""}`}>
      {race.circuitImageUrl ? <button type="button" className="race-circuit-image-open no-print" onClick={() => setPreview({ imageUrl: race.circuitImageUrl, name: circuitLabel })} aria-label={locale === "cs" ? `Zvětšit mapu tratě: ${circuitLabel}` : `Enlarge circuit map: ${circuitLabel}`}><img src={race.circuitImageUrl} alt={`${circuitLabel} · circuit`} /><span aria-hidden="true">＋</span></button> : <span>⌁</span>}
    </div>
    {preview && <ClothingLightbox preview={preview} onClose={() => setPreview(null)} />}
    <div className="race-circuit-copy">
      <span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM CIRCUIT DIRECTORY</span>
      <h2>{race.circuitName || race.track}</h2>
      <p className="race-circuit-country">{countryFlag(race.countryCode)} {race.countryCode}</p>
      <p className="race-circuit-address">{race.circuitAddress || race.address || "—"}</p>
      <div className="race-circuit-trip">
        {race.circuitDistanceKm !== null && <strong>{formatDecimal(race.circuitDistanceKm, locale)} km</strong>}
        {race.circuitDriveMinutes !== null && <span>≈ {formatDriveMinutes(race.circuitDriveMinutes, locale)}</span>}
        {(race.circuitDistanceKm !== null || race.circuitDriveMinutes !== null) && <small>{locale === "cs" ? "z dílny v Kopřivnici" : "from the Kopřivnice workshop"}</small>}
      </div>
      <div className="race-circuit-links no-print">
        {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer">⌖ Google Maps</a>}
        {race.circuitWebsiteUrl && <a href={race.circuitWebsiteUrl} target="_blank" rel="noreferrer">↗ {locale === "cs" ? "Web tratě" : "Circuit website"}</a>}
      </div>
    </div>
    <RaceWeather race={race} locale={locale} />
  </section>;
}

function RaceWeather({ race, locale }: { race: RaceRecord; locale: Locale }) {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/weather?circuitId=${encodeURIComponent(race.circuitId || "")}&startDate=${encodeURIComponent(race.startDate)}&endDate=${encodeURIComponent(race.endDate)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => (await response.json()) as WeatherSnapshot)
      .then((result) => {
        setWeather(result);
        const forecast = result.forecast ?? [];
        const today = new Date().toISOString().slice(0, 10);
        setExpandedDate(forecast.find((day) => day.date >= today)?.date ?? forecast[0]?.date ?? null);
      })
      .catch((error) => { if ((error as Error).name !== "AbortError") setWeather({ available: false, reason: "weather_unavailable" }); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [race.circuitId, race.startDate, race.endDate]);

  const current = weather?.current;
  const expandedDay = weather?.forecast?.find((day) => day.date === expandedDate);
  const now = new Date();
  const isExpandedDayToday = expandedDay?.date === now.toISOString().slice(0, 10);
  const visibleHourly = expandedDay?.hourly?.filter((hour) => !isExpandedDayToday || hour.hour >= now.getHours()) ?? [];
  return <div className="race-weather">
    <div className="race-weather-heading"><span className="eyebrow"><span className="streak"><i /><i /><i /></span>{locale === "cs" ? "POČASÍ NA TRATI" : "CIRCUIT WEATHER"}</span>{weather?.available && <small>{locale === "cs" ? "živá data" : "live data"}</small>}</div>
    {loading ? <div className="race-weather-empty"><span className="spinner" /> {locale === "cs" ? "Načítám…" : "Loading…"}</div> : !weather?.available ? <div className="race-weather-empty">{weather?.reason === "coordinates_missing" ? (locale === "cs" ? "Doplň souřadnice tratě pro počasí." : "Add circuit coordinates for weather.") : (locale === "cs" ? "Počasí teď není dostupné." : "Weather is currently unavailable.")}</div> : <>
      {current && <div className="race-weather-current">
        <div><strong>{weatherIcon(Number(current.weather_code ?? 0))} {roundWeather(current.temperature_2m)} °C</strong><small>{locale === "cs" ? "nyní" : "now"}</small></div>
        <div><strong>{roundWeather(current.relative_humidity_2m)} %</strong><small>{locale === "cs" ? "vlhkost" : "humidity"}</small></div>
        <div><strong>{roundWeather(current.wind_speed_10m)} km/h</strong><small>{locale === "cs" ? "vítr" : "wind"}</small></div>
        <div><strong>{roundWeather(current.rain)} mm</strong><small>{locale === "cs" ? "déšť" : "rain"}</small></div>
      </div>}
      <div className="race-weather-forecast">{(weather.forecast ?? []).length ? weather.forecast?.map((day) => <button type="button" key={day.date} className={expandedDate === day.date ? "active" : ""} aria-expanded={expandedDate === day.date} aria-controls="race-weather-hourly-panel" onClick={() => setExpandedDate((current) => current === day.date ? null : day.date)}>
        <strong>{formatShortDate(day.date, locale)}</strong><span>{weatherIcon(day.weatherCode)} {Math.round(day.temperatureMin)}–{Math.round(day.temperatureMax)} °C</span><small>☂ {Math.round(day.rainProbability)} % · {formatDecimal(day.rainTotal, locale)} mm</small><small>↗ {Math.round(day.windMax)} / {Math.round(day.gustMax)} km/h</small>
      </button>) : <p>{locale === "cs" ? "Předpověď pro termín závodu bude dostupná přibližně 16 dní předem." : "The race forecast becomes available about 16 days ahead."}</p>}</div>
      {expandedDay && visibleHourly.length > 0 && <div className="race-weather-hourly" id="race-weather-hourly-panel">
        <span className="race-weather-hourly-label">{formatShortDate(expandedDay.date, locale)} · {locale === "cs" ? "po hodinách" : "hourly"}</span>
        <div className="race-weather-hourly-row">{visibleHourly.map((hour) => <div key={hour.hour}>
          <small>{String(hour.hour).padStart(2, "0")}:00</small>
          <span>{weatherIcon(hour.weatherCode)}</span>
          <strong>{Math.round(hour.temperature)}°</strong>
          <small>☂ {Math.round(hour.rainProbability)} %</small>
          <small>↗ {Math.round(hour.wind)} km/h</small>
        </div>)}</div>
      </div>}
    </>}
  </div>;
}

function RaceEquipmentOverview({ race, plan, carburetors, locale }: { race: RaceRecord; plan: RacePlan; carburetors: CarburetorRecord[]; locale: Locale }) {
  return <section className="dash-panel race-equipment-overview">
    <header><div><span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM RACE LOADOUT</span><h2>{locale === "cs" ? "Přehled pilotů a vybavení" : "Drivers and equipment"}</h2></div><div className="race-total-drivers"><strong>{plan.entries.length}</strong><span>{pluralForm(plan.entries.length, locale, DRIVER_FORMS)} {locale === "cs" ? "celkem" : "total"}</span></div></header>
    <div className="race-category-overview-grid">{race.categories.map((category) => {
      const entries = plan.entries.filter((entry) => entry.category === category);
      const extras = plan.extras.filter((extra) => extra.category === category);
      const assignedEngineIds = uniqueStrings(entries.flatMap((entry) => [entry.engine1Id, entry.engine2Id, entry.engine3Id]));
      const extraEngineIds = uniqueStrings(extras.filter((extra) => extra.resourceType === "engine").map((extra) => extra.resourceId));
      const assignedCarbIds = uniqueStrings(entries.flatMap((entry) => [entry.carburetor1Id, entry.carburetor2Id, entry.carburetor3Id]));
      const extraCarbIds = uniqueStrings(extras.filter((extra) => extra.resourceType === "carburetor").map((extra) => extra.resourceId));
      const carbBreakdown = carburetorBreakdown([...assignedCarbIds, ...extraCarbIds], carburetors);
      return <article className={`race-category-overview category-${category.toLowerCase().replaceAll(" ", "-")}`} key={category}>
        <div className="race-category-overview-title"><strong>{category}</strong><span>{formatCount(entries.length, locale, DRIVER_FORMS)}</span></div>
        <dl><div><dt>{locale === "cs" ? "Motory" : "Engines"}</dt><dd>{assignedEngineIds.length}<small>+ {extraEngineIds.length} extra</small></dd></div><div><dt>{locale === "cs" ? "Karburátory" : "Carburetors"}</dt><dd>{assignedCarbIds.length}<small>+ {extraCarbIds.length} extra</small></dd></div></dl>
        <div className="carb-breakdown">{carbBreakdown.length ? carbBreakdown.map((item) => <span key={item.label}><strong>{item.count}×</strong> {item.label}</span>) : <span>—</span>}</div>
      </article>;
    })}</div>
  </section>;
}

function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function CategoryLoadoutStats({ locale, pilotCount, engineCount, extraEngineCount, carburetorCount, extraCarburetorCount }: { locale: Locale; pilotCount: number; engineCount: number; extraEngineCount: number; carburetorCount: number; extraCarburetorCount: number }) {
  return <div className="category-loadout-stats" aria-label={locale === "cs" ? "Souhrn kategorie" : "Category summary"}>
    <div><strong>{pilotCount}</strong><span>{capitalize(pluralForm(pilotCount, locale, DRIVER_FORMS))}</span></div>
    <div><strong>{engineCount}<small>+ {extraEngineCount} extra</small></strong><span>{capitalize(pluralForm(engineCount, locale, ENGINE_FORMS))}</span></div>
    <div><strong>{carburetorCount}<small>+ {extraCarburetorCount} extra</small></strong><span>{capitalize(pluralForm(carburetorCount, locale, CARBURETOR_FORMS))}</span></div>
  </div>;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function compactSlots(ids: string[]) {
  const filled = ids.filter(Boolean);
  return [...filled, ...Array(ids.length - filled.length).fill("")];
}

// Header labels and chips are sized in raw px (not `ch`, which resolves differently per
// font-size) from a real canvas text measurement, so the two always land on the exact same
// number regardless of how wide the actual engine/carburetor code turns out to be.
let equipmentMeasureCtx: CanvasRenderingContext2D | null | undefined;
function measureEquipmentText(text: string, font: string) {
  if (!text) return 0;
  if (equipmentMeasureCtx === undefined) equipmentMeasureCtx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!equipmentMeasureCtx) return text.length * 11;
  equipmentMeasureCtx.font = font;
  return equipmentMeasureCtx.measureText(text).width;
}

const EQUIPMENT_MIN_COLUMN_WIDTH = 72;
function equipmentColumnWidth(headerLabel: string, codes: string[]) {
  const headerWidth = measureEquipmentText(headerLabel, "700 15px Arial, sans-serif") + headerLabel.length * 0.8;
  const longestCode = codes.reduce((longest, code) => (code.length > longest.length ? code : longest), "");
  const chipWidth = measureEquipmentText(longestCode, "700 20px Arial, sans-serif") + 48;
  return Math.max(Math.ceil(headerWidth) + 8, Math.ceil(chipWidth), EQUIPMENT_MIN_COLUMN_WIDTH);
}

// Set as a custom property, not a literal width/flex — a screen-only CSS rule reads it.
// Printing uses its own mm-scaled columns, and an inline width computed from screen pixels
// would otherwise leak straight through (inline styles beat any print media-query override).
function equipmentColumnStyle(width: number | undefined) {
  return width ? ({ "--equip-col-width": `${width}px` } as React.CSSProperties) : undefined;
}

function carburetorBreakdown(ids: string[], carburetors: CarburetorRecord[]) {
  const counts = new Map<string, number>();
  uniqueStrings(ids).forEach((id) => {
    const carburetor = carburetors.find((item) => item.id === id);
    const label = carburetor ? [carburetor.brand, carburetor.model].filter(Boolean).join(" · ") || carburetor.code : "Neznámý typ";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return [...counts].map(([label, count]) => ({ label, count })).sort((left, right) => left.label.localeCompare(right.label));
}

function formatDecimal(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { maximumFractionDigits: 1 }).format(value);
}

function formatDriveMinutes(value: number, locale: Locale) {
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  if (!hours) return `${minutes} min`;
  return locale === "cs" ? `${hours} h ${minutes} min` : `${hours} h ${minutes} min`;
}

function formatShortDate(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { weekday: "short", day: "numeric", month: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function roundWeather(value: number | string | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

function weatherIcon(code: number) {
  if (code === 0) return "☀";
  if ([1, 2, 3].includes(code)) return "⛅";
  if ([45, 48].includes(code)) return "≋";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "🌧";
  if (code >= 71 && code <= 77) return "❄";
  if (code >= 95) return "⛈";
  return "☁";
}

function EquipmentValue({ code, configuration = "", upgradeCode = "", labelColor = "", columnWidth }: { code: string; configuration?: string; upgradeCode?: string; labelColor?: string; columnWidth?: number }) {
  const widthStyle = equipmentColumnStyle(columnWidth);
  return <span className={code ? "equipment-code" : "equipment-empty"} style={code && labelColor ? { borderLeft: `7px solid ${labelColor}`, ...widthStyle } : widthStyle}>{code ? equipmentDisplay(code, configuration, upgradeCode) : "—"}</span>;
}

function ExtraEquipmentRow({ extra, engine, locale, canManage, onRemove }: { extra: RaceExtra; engine?: EngineChoice; locale: Locale; canManage: boolean; onRemove: () => Promise<void> }) {
  const engineCode = extra.resourceType === "engine" ? extra.resourceCode : "";
  const carburetorCode = extra.resourceType === "carburetor" ? extra.resourceCode : "";
  const resourceLabel = extra.resourceType === "engine" ? (locale === "cs" ? "Extra motor" : "Extra engine") : (locale === "cs" ? "Extra karburátor" : "Extra carburetor");

  return <article className="extra-entry-card">
    <div className="extra-entry-person"><span className="race-entry-number">EX</span><div><strong>{resourceLabel}</strong>{extra.notes && <small>{extra.notes}</small>}</div></div>
    {extra.resourceType === "engine" ? <EquipmentValue code={engineCode} configuration={engine?.currentConfiguration} upgradeCode={engine?.upgradeCode} labelColor={engine?.labelColor} /> : <EquipmentValue code={carburetorCode} />}
    {canManage && <div className="race-entry-actions no-print"><button className="delete" type="button" onClick={() => { void onRemove(); }}>{locale === "cs" ? "Odebrat" : "Remove"}</button></div>}
  </article>;
}

function InlineDriverNote({ entry, canManage, locale, onSave }: { entry: RaceEntry; canManage: boolean; locale: Locale; onSave: (notes: string) => Promise<boolean> }) {
  const [note, setNote] = useState(entry.notes);
  const [saving, setSaving] = useState(false);
  useEffect(() => setNote(entry.notes), [entry.notes]);

  async function save() {
    const next = note.trim();
    if (next === entry.notes) return;
    setSaving(true);
    const saved = await onSave(next);
    if (!saved) setNote(entry.notes);
    setSaving(false);
  }

  return <div className="race-entry-note">{canManage && <input className="no-print" value={note} maxLength={140} aria-label={`${locale === "cs" ? "Poznámka" : "Note"} · ${entry.driverName}`} placeholder="" onChange={(event) => setNote(event.target.value)} onBlur={() => { void save(); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />}{saving && <small className="no-print">{locale === "cs" ? "Ukládám…" : "Saving…"}</small>}<span className="print-only">{note || "—"}</span>{!canManage && <span className="no-print">{note || "—"}</span>}</div>;
}

function InlineEquipmentPicker({ type, position, entry, value, code, configuration, upgradeCode, labelColor, selectedIds, choices, plan, locale, isAddSlot = false, columnWidth, onChange }: {
  type: "engine" | "carburetor";
  position: number;
  entry: RaceEntry;
  value: string;
  code: string;
  configuration: string;
  upgradeCode: string;
  labelColor: string;
  selectedIds: string[];
  choices: Array<{ id: string; code: string; family: string; currentConfiguration?: string; upgradeCode?: string; labelColor?: string }>;
  plan: RacePlan;
  locale: Locale;
  isAddSlot?: boolean;
  columnWidth?: number;
  onChange: (value: string) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState(value);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const label = `${type === "engine" ? (locale === "cs" ? "Motor" : "Engine") : (locale === "cs" ? "Karburátor" : "Carburetor")} ${position} · ${entry.driverName}`;
  const selectedChoice = choices.find((choice) => choice.id === selected);
  const selectedCode = selectedChoice?.code ?? (selected === value ? code : "");
  const selectedConfiguration = type === "engine" ? (selectedChoice?.currentConfiguration ?? (selected === value ? configuration : "")) : "";
  const selectedUpgradeCode = type === "engine" ? (selectedChoice?.upgradeCode ?? (selected === value ? upgradeCode : "")) : "";
  const selectedLabelColor = type === "engine" ? (selectedChoice?.labelColor ?? (selected === value ? labelColor : "")) : "";

  // The menu is a viewport-fixed overlay (positioned from the trigger's own rect) rather than
  // absolutely positioned inside the row — a plain absolute child gets visually buried under
  // later grid rows/categories no matter how high its z-index goes, because it never escapes
  // its ancestors' stacking contexts. Fixed positioning sidesteps that entirely.
  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const menuWidth = Math.min(470, window.innerWidth - 24);
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - menuWidth - 12);
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < 220 && rect.top > spaceBelow;
      setMenuStyle(openUpward
        ? { position: "fixed", top: "auto", bottom: window.innerHeight - rect.top + 4, left, width: menuWidth, minWidth: rect.width }
        : { position: "fixed", top: rect.bottom + 4, bottom: "auto", left, width: menuWidth, minWidth: rect.width });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);

  async function change(nextValue: string) {
    setOpen(false);
    setSelected(nextValue);
    setSaving(true);
    const saved = await onChange(nextValue);
    if (!saved) setSelected(value);
    setSaving(false);
  }

  const isEmptyAddSlot = isAddSlot && !selectedCode;
  const addLabel = `${type === "engine" ? (locale === "cs" ? "Přidat motor" : "Add engine") : (locale === "cs" ? "Přidat karburátor" : "Add carburetor")} · ${entry.driverName}`;
  const widthStyle = isEmptyAddSlot ? undefined : equipmentColumnStyle(columnWidth);
  return <div ref={containerRef} className={`equipment-picker${open ? " is-open" : ""}${isEmptyAddSlot ? " equipment-picker-add" : ""}`} style={widthStyle} onBlur={(event) => { if (!containerRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button ref={triggerRef} className="equipment-picker-trigger no-print" type="button" aria-label={isEmptyAddSlot ? addLabel : label} aria-haspopup="listbox" aria-expanded={open} disabled={saving} style={selectedCode && selectedLabelColor ? { borderColor: selectedLabelColor, borderLeft: `9px solid ${selectedLabelColor}`, backgroundColor: `${selectedLabelColor}38`, boxShadow: `inset 0 0 0 1px ${selectedLabelColor}55` } : undefined} onClick={() => (open ? setOpen(false) : openMenu())}>{isEmptyAddSlot ? <span aria-hidden="true">＋</span> : <><span>{selectedCode || (locale === "cs" ? "— Vybrat" : "— Select")}</span><b>⌄</b></>}</button>
    {open && <div className="equipment-picker-menu no-print" style={menuStyle} role="listbox" aria-label={label}>
      <button type="button" className={!selected ? "selected" : ""} role="option" aria-selected={!selected} onClick={() => { void change(""); }}><strong>—</strong><span>{locale === "cs" ? "Bez přiřazení" : "Unassigned"}</span></button>
      {choices.map((choice) => {
        const option = equipmentOption(choice, type, entry, selectedIds, position, plan, locale);
        const disabled = option.disabled && choice.id !== value;
        const equipment = equipmentDisplay(choice.code, type === "engine" ? choice.currentConfiguration ?? "" : "", type === "engine" ? choice.upgradeCode ?? "" : "");
        return <button key={choice.id} type="button" role="option" aria-selected={selected === choice.id} className={`${option.tone}${selected === choice.id ? " selected" : ""}`} disabled={disabled} style={type === "engine" && choice.labelColor ? { borderLeft: `7px solid ${choice.labelColor}` } : undefined} onClick={() => { void change(choice.id); }}><strong>{equipment}</strong><span>{option.description}</span></button>;
      })}
    </div>}
    {saving && <small className="no-print">{locale === "cs" ? "Ukládám…" : "Saving…"}</small>}
    {!isEmptyAddSlot && <span className={`print-only ${selectedCode ? "equipment-code" : "equipment-empty"}`} style={selectedCode && selectedLabelColor ? { borderLeft: `7px solid ${selectedLabelColor}` } : undefined}>{selectedCode ? equipmentDisplay(selectedCode, selectedConfiguration, selectedUpgradeCode) : "—"}</span>}
  </div>;
}

function equipmentOption(choice: { id: string; code: string; family: string; currentConfiguration?: string; upgradeCode?: string; labelColor?: string }, type: "engine" | "carburetor", entry: RaceEntry, selectedIds: string[], position: number, plan: RacePlan, locale: Locale) {
  const assignments = (plan.equipmentAssignments ?? []).filter((assignment) => assignment.resourceType === type && assignment.resourceId === choice.id);
  const own = assignments.find((assignment) => assignment.entryId === entry.id);
  const conflict = assignments.find((assignment) => assignment.entryId !== entry.id && (assignment.raceId === plan.race.id || dateIntervalsOverlap(assignment.startDate, assignment.endDate, plan.race.startDate, plan.race.endDate)));
  const latest = [...assignments].sort((left, right) => right.startDate.localeCompare(left.startDate))[0];
  const usedInAnotherSlot = selectedIds.some((selectedId, index) => index !== position - 1 && selectedId === choice.id);
  const assignment = own ?? conflict ?? latest;
  if (usedInAnotherSlot) return { disabled: true, tone: "busy", description: locale === "cs" ? "už vybrán u tohoto pilota" : "already selected for this driver" };
  if (!assignment) return { disabled: false, tone: "available", description: locale === "cs" ? "volný" : "available" };
  const person = assignment.isExtra ? (locale === "cs" ? "Extra vybavení" : "Extra equipment") : assignment.driverName;
  const place = `${person || "—"} · ${assignment.raceName}`;
  if (own) return { disabled: false, tone: "assigned", description: `${locale === "cs" ? "přiřazen" : "assigned"}: ${place}` };
  if (conflict) return { disabled: true, tone: "busy", description: `🔒 ${locale === "cs" ? "obsazen" : "unavailable"}: ${place} · ${formatDateRange(assignment.startDate, assignment.endDate, locale)}` };
  return { disabled: false, tone: "history", description: `${locale === "cs" ? "naposledy" : "last"}: ${place}` };
}

function equipmentDisplay(code: string | null | undefined, configuration: string | null | undefined, upgradeCode: string | null | undefined = "") {
  const normalizedCode = String(code ?? "").trim();
  const details = [configuration, upgradeCode].map((detail) => String(detail ?? "").trim()).filter((detail, index, all) => detail && detail !== normalizedCode && all.indexOf(detail) === index);
  return details.length ? `${normalizedCode} · ${details.join(" · ")}` : normalizedCode;
}

function dateIntervalsOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA <= endB && endA >= startB;
}

function AssignmentStrip({ icon, title, locale, items, options, canManage, emptyText, onAdd, onDelete }: { icon: string; title: string; locale: Locale; items: Array<{ id: string; label: string; badge?: React.ReactNode }>; options: Array<{ id: string; label: string }>; canManage: boolean; emptyText: string; onAdd: (id: string) => void; onDelete: (id: string) => void }) {
  const [selected, setSelected] = useState("");
  return <div className="assignment-strip"><div className="assignment-title"><span className="assignment-icon">{icon}</span><div><small>{items.length} {title.toLocaleLowerCase(locale === "cs" ? "cs" : "en")}</small><h3>{title}</h3></div></div><div className="assignment-chips">{items.map((item) => <span key={item.id}>{item.label}{item.badge}{canManage && <button className="no-print" type="button" aria-label={`${locale === "cs" ? "Odebrat" : "Remove"} ${item.label}`} onClick={() => onDelete(item.id)}>×</button>}</span>)}{items.length === 0 && <small>{emptyText}</small>}</div>{canManage && <div className="assignment-add no-print"><select aria-label={`${title} – ${locale === "cs" ? "přidat" : "add"}`} value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">{options.length ? `＋ ${locale === "cs" ? "Vybrat" : "Select"}` : "—"}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><button className="secondary-compact" type="button" disabled={!selected} onClick={() => { onAdd(selected); setSelected(""); }}>{locale === "cs" ? "Přidat" : "Add"}</button></div>}</div>;
}

function RaceForm({ locale, race, catalog, circuits, mechanicIds: initialMechanicIds, vehicleIds: initialVehicleIds, onClose, onSaved }: { locale: Locale; race: RaceRecord | null; catalog: CatalogData; circuits: CircuitRecord[]; mechanicIds: string[]; vehicleIds: string[]; onClose: () => void; onSaved: (id: string) => void }) {
  const l = text[locale];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [countryCode, setCountryCode] = useState(race?.countryCode ?? "");
  const [circuitId, setCircuitId] = useState(race?.circuitId ?? "");
  const [track, setTrack] = useState(race?.track ?? "");
  const [address, setAddress] = useState(race?.address ?? "");
  const [startDate, setStartDate] = useState(race?.startDate ?? "");
  const [endDate, setEndDate] = useState(race?.endDate ?? "");
  const [departureDate, setDepartureDate] = useState(race?.departureDate ?? "");
  const [returnDate, setReturnDate] = useState(race?.returnDate ?? "");
  const [departureTouched, setDepartureTouched] = useState(Boolean(race?.departureDate));
  const [returnTouched, setReturnTouched] = useState(Boolean(race?.returnDate));
  const [raceTemplateId, setRaceTemplateId] = useState(race?.raceTemplateId ?? catalog.raceTypes.find((template) => template.name === race?.name)?.id ?? "");
  const selectedRaceType = catalog.raceTypes.find((template) => template.id === raceTemplateId);
  const [selectedMechanicIds, setSelectedMechanicIds] = useState(initialMechanicIds);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState(initialVehicleIds);
  const availableCircuits = circuits.filter((circuit) => !countryCode || circuit.countryCode === countryCode);
  function selectCircuit(nextId: string) {
    setCircuitId(nextId);
    const selected = circuits.find((circuit) => circuit.id === nextId);
    if (selected) { setTrack(selected.name); setAddress(selected.address); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const categories = form.getAll("categories").map(String);
    const selectedMechanics = form.getAll("mechanicIds").map(String);
    const selectedVehicles = form.getAll("vehicleIds").map(String);
    try {
      const response = await fetch("/api/races", { method: race ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, id: race?.id, categories, mechanicIds: selectedMechanics, vehicleIds: selectedVehicles }) });
      const result = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error || "Save failed");
      onSaved(result.id);
    } catch (saveError) {
      setError(localizeError(saveError instanceof Error ? saveError.message : "Save failed", locale));
      setSaving(false);
    }
  }
  return <Modal title={race ? l.edit : l.newRace} onClose={onClose}><form onSubmit={submit}><div className="form-grid race-form-grid">
    <div className="race-form-info">
      <label><span>{locale === "cs" ? "Závod" : "Race"} *</span><select name="raceTemplateId" required autoFocus value={raceTemplateId} onChange={(event) => setRaceTemplateId(event.target.value)}><option value="">{locale === "cs" ? "Vyber závod z databáze…" : "Select a race preset…"}</option>{catalog.raceTypes.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select>{catalog.raceTypes.length === 0 && <small className="field-help">{locale === "cs" ? "Nejdříve přidej závod v levém menu Typy závodů." : "First add a preset in Race types."}</small>}</label>
      <label><span>{locale === "cs" ? "Série" : "Series"}</span><input name="series" list="race-series-options" defaultValue={race?.series ?? ""} maxLength={60} placeholder={locale === "cs" ? "např. Final Cup, Euro…" : "e.g. Final Cup, Euro…"} />{selectedRaceType && selectedRaceType.seriesOptions.length > 0 && <datalist id="race-series-options">{selectedRaceType.seriesOptions.map((option) => <option key={option} value={option} />)}</datalist>}<small className="field-help">{locale === "cs" ? "Volitelné — vyber nebo napiš vlastní." : "Optional — pick one or type your own."}</small></label>
      <label><span>Round</span><select name="seriesRound" defaultValue={race?.seriesRound ? String(race.seriesRound) : ""}><option value="">{locale === "cs" ? "— Neuvedeno" : "— Not set"}</option>{Array.from({ length: 10 }, (_, index) => index + 1).map((round) => <option key={round} value={round}>Round {round}</option>)}</select></label>
      <label><span>{locale === "cs" ? "Země" : "Country"} *</span><CountrySelect name="countryCode" required value={countryCode} onChange={(event) => { const next=event.target.value; setCountryCode(next); if (!circuits.some((circuit)=>circuit.id===circuitId&&circuit.countryCode===next)) { setCircuitId(""); setTrack(""); setAddress(""); } }} locale={locale} /></label>
      <label><span>{locale === "cs" ? "Trať z databáze" : "Circuit from directory"}</span><select name="circuitId" value={circuitId} onChange={(event)=>selectCircuit(event.target.value)} disabled={!countryCode}><option value="">{locale === "cs" ? "Ručně / zatím neurčeno" : "Manual / not decided"}</option>{availableCircuits.map((circuit)=><option key={circuit.id} value={circuit.id}>{countryFlag(circuit.countryCode)} {circuit.name}</option>)}</select>{countryCode&&availableCircuits.length===0&&<small className="field-help">{locale === "cs" ? "Pro tuto zemi ještě není trať v adresáři." : "No circuit saved for this country yet."}</small>}</label>
      <label><span>{locale === "cs" ? "Trať / město" : "Track / city"} *</span><input name="track" required value={track} readOnly={Boolean(circuitId)} onChange={(event)=>setTrack(event.target.value)} /></label>
      <input type="hidden" name="address" value={address} />
      <label><span>{locale === "cs" ? "Odjezd" : "Departure"} *</span><input type="date" name="departureDate" required value={departureDate} onChange={(event) => { setDepartureDate(event.target.value); setDepartureTouched(true); }} /></label>
      <label><span>{locale === "cs" ? "Začátek závodu" : "Race start"} *</span><input type="date" name="startDate" required value={startDate} onChange={(event) => { const next = event.target.value; setStartDate(next); if (!departureTouched) setDepartureDate(shiftDate(next, -1)); }} /></label>
      <label><span>{locale === "cs" ? "Konec závodu" : "Race end"} *</span><input type="date" name="endDate" required value={endDate} onChange={(event) => { const next = event.target.value; setEndDate(next); if (!returnTouched) setReturnDate(next); }} /></label>
      <label><span>{locale === "cs" ? "Návrat" : "Return"} *</span><input type="date" name="returnDate" required value={returnDate} onChange={(event) => { setReturnDate(event.target.value); setReturnTouched(true); }} /></label>
    </div>
    <div className="race-form-selections">
      <fieldset className="category-toggle-group"><legend>{locale === "cs" ? "Kategorie na závodě" : "Race categories"} *</legend><div>{categoryOrder.map((category) => <label key={category}><input type="checkbox" name="categories" value={category} defaultChecked={race?.categories.includes(category) ?? false} /><span>{category}</span></label>)}</div></fieldset>
      <div>
        <AssignmentStrip icon="M" title={locale === "cs" ? "Mechanici" : "Mechanics"} locale={locale} items={selectedMechanicIds.map((id) => ({ id, label: catalog.mechanics.find((mechanic) => mechanic.id === id)?.name ?? id }))} options={catalog.mechanics.filter((mechanic) => !selectedMechanicIds.includes(mechanic.id)).map((mechanic) => ({ id: mechanic.id, label: mechanic.name }))} canManage emptyText={locale === "cs" ? "Zatím nikdo nevybrán." : "No one selected yet."} onAdd={(id) => setSelectedMechanicIds((current) => [...current, id])} onDelete={(id) => setSelectedMechanicIds((current) => current.filter((item) => item !== id))} />
        {selectedMechanicIds.map((id) => <input key={id} type="hidden" name="mechanicIds" value={id} />)}
      </div>
      <div>
        <AssignmentStrip icon="A" title={locale === "cs" ? "Auta" : "Cars"} locale={locale} items={selectedVehicleIds.map((id) => ({ id, label: catalog.vehicles.find((vehicle) => vehicle.id === id)?.name ?? id }))} options={catalog.vehicles.filter((vehicle) => !selectedVehicleIds.includes(vehicle.id)).map((vehicle) => ({ id: vehicle.id, label: vehicle.licensePlate ? `${vehicle.name} · ${vehicle.licensePlate}` : vehicle.name }))} canManage emptyText={locale === "cs" ? "Zatím nevybráno." : "None selected yet."} onAdd={(id) => setSelectedVehicleIds((current) => [...current, id])} onDelete={(id) => setSelectedVehicleIds((current) => current.filter((item) => item !== id))} />
        {selectedVehicleIds.map((id) => <input key={id} type="hidden" name="vehicleIds" value={id} />)}
      </div>
      <label><span>{l.notes}</span><textarea name="notes" rows={3} defaultValue={race?.notes ?? ""} /></label>
    </div>
  </div>{error && <p className="form-error">{error}</p>}<ModalActions locale={locale} saving={saving} onClose={onClose} /></form></Modal>;
}

function EntryForm({ locale, raceId, category, entry, drivers, assignedDriverIds, onClose, onSaved }: { locale: Locale; raceId: string; category: string; entry: RaceEntry | null; drivers: DriverRecord[]; assignedDriverIds: string[]; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const driverOptions = drivers.filter((driver) => (driver.isActive || driver.id === entry?.driverId) && (driver.id === entry?.driverId || !assignedDriverIds.includes(driver.id)));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = {
      kind: "entry",
      raceId,
      id: entry?.id,
      category: String(form.get("category")),
      driverId: String(form.get("driverId")),
      engineIds: [entry?.engine1Id ?? "", entry?.engine2Id ?? "", entry?.engine3Id ?? ""],
      carburetorIds: [entry?.carburetor1Id ?? "", entry?.carburetor2Id ?? "", entry?.carburetor3Id ?? ""],
      isConfirmed: entry?.isConfirmed ?? false,
      notes: String(form.get("notes") ?? ""),
    };
    try {
      const response = await fetch("/api/race-planning", { method: entry ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Save failed");
      onSaved();
    } catch (saveError) {
      setError(localizeError(saveError instanceof Error ? saveError.message : "Save failed", locale));
      setSaving(false);
    }
  }
  return <Modal title={`${entry ? (locale === "cs" ? "Upravit pilota" : "Edit driver") : (locale === "cs" ? "Přidat pilota" : "Add driver")} · ${category}`} onClose={onClose}><form onSubmit={submit}><div className="form-grid"><input type="hidden" name="category" value={category} /><label><span>{locale === "cs" ? "Pilot" : "Driver"} *</span><select name="driverId" defaultValue={entry?.driverId ?? ""} required autoFocus><option value="">—</option>{driverOptions.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}{driver.teamName ? ` · ${driver.teamName}` : ""}{!driver.isActive ? (locale === "cs" ? " · neaktivní" : " · inactive") : ""}</option>)}</select></label><div className="form-readonly"><span>{locale === "cs" ? "Kategorie" : "Category"}</span><strong>{category}</strong></div>
    <label className="full-field"><span>{locale === "cs" ? "Poznámka k pilotovi" : "Driver note"}</span><textarea name="notes" rows={2} defaultValue={entry?.notes ?? ""} /></label></div>{error && <p className="form-error">{error}</p>}<ModalActions locale={locale} saving={saving} onClose={onClose} /></form></Modal>;
}

function ExtraForm({ locale, raceId, category, engines, carburetors, onClose, onSaved }: { locale: Locale; raceId: string; category: string; engines: EngineChoice[]; carburetors: CarburetorRecord[]; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<"engine" | "carburetor">("engine");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const resources = type === "engine" ? engines.filter((item) => engineMatches(item.family, category) && item.status !== "retired" && !isSold(item.soldAt)) : carburetors.filter((item) => carbMatches(item.family, category) && item.status !== "retired" && !isSold(item.soldAt));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/race-planning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "extra", raceId, category, resourceType: type, resourceId: form.get("resourceId"), notes: form.get("notes") }) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Save failed");
      onSaved();
    } catch (saveError) {
      setError(localizeError(saveError instanceof Error ? saveError.message : "Save failed", locale));
      setSaving(false);
    }
  }
  return <Modal title={`${locale === "cs" ? "Extra vybavení" : "Extra equipment"} · ${category}`} onClose={onClose}><form onSubmit={submit}><div className="form-grid"><label><span>{locale === "cs" ? "Typ" : "Type"}</span><select value={type} onChange={(event) => setType(event.target.value as "engine" | "carburetor")}><option value="engine">{locale === "cs" ? "Motor" : "Engine"}</option>{category !== "KZ" && <option value="carburetor">{locale === "cs" ? "Karburátor" : "Carburetor"}</option>}</select></label><label><span>{locale === "cs" ? "Vyber vybavení" : "Select equipment"} *</span><select name="resourceId" required key={type}><option value="">—</option>{resources.map((item) => <option key={item.id} value={item.id}>{type === "engine" ? equipmentDisplay(item.code, (item as EngineChoice).currentConfiguration, (item as EngineChoice).upgradeCode) : item.code}</option>)}</select></label><label className="full-field"><span>{locale === "cs" ? "Poznámka" : "Notes"}</span><textarea name="notes" rows={2} /></label></div>{error && <p className="form-error">{error}</p>}<ModalActions locale={locale} saving={saving} onClose={onClose} /></form></Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const titleId = useId();
  const dialogRef = useModalA11y(onClose);

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef as React.RefObject<HTMLElement>} className="modal race-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><div className="modal-header"><div><span className="eyebrow">MM RACE CONTROL</span><h2 id={titleId}>{title}</h2></div><button className="close-button" type="button" onClick={onClose} aria-label={title ? `Zavřít: ${title}` : "Zavřít"}>×</button></div>{children}</section></div>;
}

function ModalActions({ locale, saving, onClose }: { locale: Locale; saving: boolean; onClose: () => void }) {
  const l = text[locale];
  return <div className="modal-actions"><span className="modal-actions-spacer" /><button className="secondary-compact" type="button" onClick={onClose} disabled={saving}>{l.cancel}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? l.saving : l.save}</button></div>;
}

async function showApiError(response: Response, locale: Locale) {
  const result = await response.json().catch(() => ({})) as { error?: string };
  window.alert(localizeError(result.error || "Operation failed", locale));
}

function localizeError(error: string, locale: Locale) {
  if (locale === "en") return error;
  if (error.includes("already assigned to")) return error.replace("Driver", "Pilot").replace("Engine", "Motor").replace("Carburetor", "Karburátor").replace("Mechanic", "Mechanik").replace("Vehicle", "Auto").replace("is already assigned to", "už je přiřazen k závodu");
  const translations: Record<string, string> = {
    "Race, track and country are required": "Vyber závod a zemi a vyplň trať.",
    "Race preset not found": "Vybraný závod už není v databázi. Vyber jej znovu.",
    "All race and travel dates are required": "Vyplň všechny termíny závodu i cesty.",
    "Dates must follow departure, race and return order": "Termíny musí jít v pořadí: odjezd, začátek, konec závodu, návrat.",
    "Select at least one valid category": "Vyber alespoň jednu kategorii.",
    "A resource cannot be selected twice": "Stejný motor nebo karburátor nelze vybrat dvakrát.",
    "Driver and category are required": "Vyber pilota a kategorii.",
    "Driver is inactive": "Neaktivního pilota nelze nově přiřadit k závodu.",
  };
  return translations[error] ?? error;
}

function driverNumber(drivers: DriverRecord[], driverId: string) {
  return drivers.find((driver) => driver.id === driverId)?.raceNumber || "—";
}

function isSold(soldAt: number | null | undefined) {
  return typeof soldAt === "number" && soldAt <= Date.now();
}

function engineMatches(family: string, category: string) {
  if (["BABY", "MINI", "MINI U10", "MINI GR3"].includes(category)) return family === "MINI";
  return family === category;
}

function carbMatches(family: string, category: string) {
  if (["MINI", "MINI U10", "MINI GR3"].includes(category)) return family === "MINI";
  if (["OKN-J", "OKN"].includes(category)) return family === "OKN";
  return family === category;
}

function raceStatus(status: RaceRecord["status"], locale: Locale) {
  const labels = { planned: ["Plánováno", "Planned"], active: ["Probíhá", "Active"], completed: ["Dokončeno", "Completed"] } as const;
  return labels[status][locale === "cs" ? 0 : 1];
}

function shiftDate(value: string, days: number) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateRange(start: string, end: string, locale: Locale) {
  const formatter = new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const parse = (value: string) => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); };
  if (!start || !end) return "—";
  return start === end ? formatter.format(parse(start)) : `${formatter.format(parse(start))} – ${formatter.format(parse(end))}`;
}

function raceIsBasicallyReady(race: RaceRecord) {
  return race.driverCount > 0 && race.engineCount >= race.driverCount && race.mechanicCount > 0 && race.vehicleCount > 0;
}

function canPrintFromTab(tab: RaceDetailTab) {
  return tab === "plan" || tab === "sales" || tab === "deliveries" || tab === "notes";
}

function racePrintTitle(race: RaceRecord) {
  const datePart = race.startDate === race.endDate ? race.startDate : `${race.startDate}_${race.endDate}`;
  return `${race.name}_${datePart}`.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_");
}
