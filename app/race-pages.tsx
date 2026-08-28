"use client";

import { useCallback, useEffect, useState } from "react";
import type { CatalogData, CarburetorRecord, DriverRecord } from "./catalog-pages";
import { CountrySelect } from "./country-select";
import { countryFlag } from "./countries";
import { RaceDeliveriesPanel } from "./race-deliveries";
import { RaceFinancePanel } from "./race-finance";
import { RaceSalesPanel } from "./race-sales";
import { RaceLogisticsPanel } from "./logistics-pages";
import { RaceLogoBadge } from "./race-logo-badge";
import { NativeImage } from "./native-image";
import type { CircuitRecord } from "./circuits-page";

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

type AssignedMechanic = { id: string; mechanicId: string; mechanicName: string };
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
  raceStatus: RaceRecord["status"] | "preparing" | "sent" | "overdue" | "returned" | "cancelled";
  isExtra: number;
  isRental: number;
  rentalHolder: string;
  rentalNumber: string;
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

export function RacePage({ locale, role, openRaceId = null }: { locale: Locale; role: Role; openRaceId?: string | null }) {
  const l = text[locale];
  const [races, setRaces] = useState<RaceRecord[]>([]);
  const [catalog, setCatalog] = useState<CatalogData>(emptyCatalog);
  const [engines, setEngines] = useState<EngineChoice[]>([]);
  const [circuits, setCircuits] = useState<CircuitRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(openRaceId);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [raceForm, setRaceForm] = useState<RaceFormState | null>(null);
  const canManage = role !== "mechanic";
  const selectedRace = races.find((race) => race.id === selectedId) ?? null;

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => { if (openRaceId) void Promise.resolve().then(() => setSelectedId(openRaceId)); }, [openRaceId]);

  async function archiveRace(race: RaceRecord) {
    if (role !== "superadmin") return;
    const confirmed = window.confirm(locale === "cs" ? `Opravdu smazat závod ${race.name}? Historie přiřazení zůstane v databázi.` : `Delete ${race.name}? Assignment history remains in the database.`);
    if (!confirmed) return;
    const response = await fetch("/api/races", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: race.id }) });
    if (!response.ok) return showApiError(response, locale);
    setSelectedId(null);
    await load();
  }

  if (selectedRace) {
    return <>
      <RaceDetail race={selectedRace} catalog={catalog} engines={engines} locale={locale} role={role} onBack={() => setSelectedId(null)} onEdit={(mechanicIds, vehicleIds) => setRaceForm({ race: selectedRace, mechanicIds, vehicleIds })} onArchive={() => { void archiveRace(selectedRace); }} onRaceChanged={load} />
      {raceForm && <RaceForm locale={locale} race={raceForm.race} catalog={catalog} circuits={circuits} mechanicIds={raceForm.mechanicIds} vehicleIds={raceForm.vehicleIds} onClose={() => setRaceForm(null)} onSaved={async (id) => { setRaceForm(null); await load(); setSelectedId(id); }} />}
    </>;
  }

  return <div className="races-page">
    <section className="panel race-directory-header">
      <div><span className="eyebrow">MM RACE CONTROL</span><h2>{l.title}</h2><p>{l.subtitle}</p></div>
      {canManage && <button className="primary-button" type="button" onClick={() => setRaceForm({ race: null, mechanicIds: [], vehicleIds: [] })}>＋ {l.newRace}</button>}
    </section>
    <section className="panel data-panel race-directory-list">
      {loading && <div className="empty-state"><span className="spinner" /><p>{l.loading}</p></div>}
      {!loading && loadError && <div className="empty-state error-state"><b>!</b><p>{l.error}</p></div>}
      {!loading && !loadError && races.length === 0 && <div className="empty-state"><span className="empty-engine">⚑</span><h2>{l.empty}</h2>{canManage && <button className="primary-button" type="button" onClick={() => setRaceForm({ race: null, mechanicIds: [], vehicleIds: [] })}>＋ {l.newRace}</button>}</div>}
      {!loading && !loadError && races.length > 0 && <div className="race-cards">{races.map((race) => <button className="race-card" key={race.id} type="button" onClick={() => setSelectedId(race.id)}>
        <RaceLogoBadge logoUrl={race.logoUrl} name={race.name} fallback={countryFlag(race.countryCode)} size="large" />
        <span className="race-card-main"><small>MM RACE CONTROL</small><strong>{race.name}</strong><span>{formatDateRange(race.startDate, race.endDate, locale)} · {race.track}, {race.countryCode}</span><i>{race.categories.join(" · ")}</i></span>
        <span className="race-card-counts"><b>{race.driverCount}</b><small>{locale === "cs" ? "pilotů" : "drivers"}</small><em className={`race-status ${race.status}`}>{raceStatus(race.status, locale)}</em></span>
      </button>)}</div>}
    </section>
    {raceForm && <RaceForm locale={locale} race={raceForm.race} catalog={catalog} circuits={circuits} mechanicIds={raceForm.mechanicIds} vehicleIds={raceForm.vehicleIds} onClose={() => setRaceForm(null)} onSaved={async (id) => { setRaceForm(null); await load(); setSelectedId(id); }} />}
  </div>;
}

function RaceDetail({ race, catalog, engines, locale, role, onBack, onEdit, onArchive, onRaceChanged }: { race: RaceRecord; catalog: CatalogData; engines: EngineChoice[]; locale: Locale; role: Role; onBack: () => void; onEdit: (mechanicIds: string[], vehicleIds: string[]) => void; onArchive: () => void; onRaceChanged: () => Promise<void> }) {
  const l = text[locale];
  const [plan, setPlan] = useState<RacePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [entryForm, setEntryForm] = useState<{ category: string; entry: RaceEntry | null } | null>(null);
  const [extraForm, setExtraForm] = useState<string | null>(null);
  const [expandedEngineSlots, setExpandedEngineSlots] = useState<Record<string, number>>({});
  const [expandedCarburetorSlots, setExpandedCarburetorSlots] = useState<Record<string, number>>({});
  const [detailTab, setDetailTab] = useState<"plan" | "finance">("plan");
  const canManage = role !== "mechanic" && (race.status !== "completed" || role === "superadmin");
  const canViewFinance = role === "superadmin" || role === "boss";

  const loadPlan = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/race-planning?raceId=${encodeURIComponent(race.id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      setPlan((await response.json()) as RacePlan);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [race.id]);

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

  useEffect(() => { void Promise.resolve().then(() => loadPlan()); }, [loadPlan]);

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

  async function updateEquipment(entry: RaceEntry, type: "engine" | "carburetor", position: number, resourceId: string) {
    const previousTop = document.getElementById(`race-entry-${entry.id}`)?.getBoundingClientRect().top ?? null;
    const engineIds = [entry.engine1Id ?? "", entry.engine2Id ?? "", entry.engine3Id ?? ""];
    const carburetorIds = [entry.carburetor1Id ?? "", entry.carburetor2Id ?? "", entry.carburetor3Id ?? ""];
    if (type === "engine") engineIds[position - 1] = resourceId;
    else carburetorIds[position - 1] = resourceId;
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

  async function removeEquipmentSlot(entry: RaceEntry, position: number, type: "engine" | "carburetor") {
    const previousTop = document.getElementById(`race-entry-${entry.id}`)?.getBoundingClientRect().top ?? null;
    const engineIds = [entry.engine1Id ?? "", entry.engine2Id ?? "", entry.engine3Id ?? ""];
    const carburetorIds = [entry.carburetor1Id ?? "", entry.carburetor2Id ?? "", entry.carburetor3Id ?? ""];
    if (type === "engine") {
      engineIds.splice(position - 1, 1);
      engineIds.push("");
    } else {
      carburetorIds.splice(position - 1, 1);
      carburetorIds.push("");
    }
    const remainingSlots = type === "engine"
      ? Math.max(1, engineIds[2] ? 3 : 0, engineIds[1] ? 2 : 0)
      : Math.max(1, carburetorIds[2] ? 3 : 0, carburetorIds[1] ? 2 : 0);
    // Collapse the empty slot immediately. The API save then confirms the
    // same compacted assignment without making the user wait for a reload.
    if (type === "engine") setExpandedEngineSlots((current) => ({ ...current, [entry.id]: remainingSlots }));
    else setExpandedCarburetorSlots((current) => ({ ...current, [entry.id]: remainingSlots }));
    const response = await fetch("/api/race-planning", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "entry",
        raceId: race.id,
        id: entry.id,
        category: entry.category,
        driverId: entry.driverId,
        engineIds,
        carburetorIds,
        isConfirmed: entry.isConfirmed,
        notes: entry.notes,
      }),
    });
    if (!response.ok) {
      await showApiError(response, locale);
      await loadPlan(true);
      if (type === "engine") setExpandedEngineSlots((current) => ({ ...current, [entry.id]: storedEngineSlots(entry) }));
      else setExpandedCarburetorSlots((current) => ({ ...current, [entry.id]: storedCarburetorSlots(entry) }));
      keepEntryInPlace(entry.id, previousTop);
      return;
    }
    await loadPlan(true);
    await onRaceChanged();
    keepEntryInPlace(entry.id, previousTop);
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

  return <div className="race-detail print-area">
    <div className="detail-back"><button type="button" onClick={onBack}>← {l.back}</button></div>
    <section className="panel race-detail-hero">
      <div className="race-hero-title"><RaceLogoBadge logoUrl={race.logoUrl} name={race.name} fallback={countryFlag(race.countryCode)} size="large" /><div><span className="eyebrow">MM RACE CONTROL</span><h2>{race.name}</h2><p>{countryFlag(race.countryCode)} {race.track}, {race.countryCode}</p></div></div>
      <div className="race-hero-brand"><NativeImage src="/machac-motors-logo.jpg" alt="Macháč Motors" loading="eager" /><div className="race-hero-actions no-print">{detailTab === "plan" && <button className="secondary-compact" type="button" onClick={printRacePlan}>⌁ {l.print}</button>}{canManage && <button className="secondary-compact" type="button" onClick={() => onEdit(plan?.mechanics.map((item) => item.mechanicId) ?? [], plan?.vehicles.map((item) => item.vehicleId) ?? [])}>✎ {l.edit}</button>}{role === "superadmin" && <button className="danger-compact" type="button" onClick={onArchive}>{l.remove}</button>}</div></div>
    </section>
    {canViewFinance && <nav className="race-detail-section-tabs no-print" aria-label={locale === "cs" ? "Část detailu závodu" : "Race detail section"}>
      <button className={detailTab === "plan" ? "active" : ""} type="button" onClick={() => setDetailTab("plan")}>{locale === "cs" ? "Plán závodu" : "Race plan"}</button>
      <button className={detailTab === "finance" ? "active" : ""} type="button" onClick={() => setDetailTab("finance")}>{locale === "cs" ? "Finance" : "Finance"}</button>
    </nav>}
    <div className={`race-plan-section ${detailTab === "plan" ? "active" : "hidden"}`}>
    <section className="race-facts">
      <div className="panel"><small>{l.raceDates}</small><strong>{formatDateRange(race.startDate, race.endDate, locale)}</strong></div>
      <div className="panel"><small>{l.travel}</small><strong>{formatDateRange(race.departureDate, race.returnDate, locale)}</strong></div>
      <div className="panel"><small>{locale === "cs" ? "Trať / adresa" : "Track / address"}</small><strong>{race.track}</strong><span>{race.address || "—"}</span></div>
      <div className="panel race-workshop-trip-fact"><small>{locale === "cs" ? "Cesta z dílny" : "Trip from workshop"}</small><strong>{race.circuitDistanceKm !== null || race.circuitDriveMinutes !== null ? <>{race.circuitDistanceKm !== null ? `${formatDecimal(race.circuitDistanceKm, locale)} km` : "—"}{race.circuitDriveMinutes !== null ? ` · ≈ ${formatDriveMinutes(race.circuitDriveMinutes, locale)}` : ""}</> : (locale === "cs" ? "Po přiřazení tratě" : "After assigning a circuit")}</strong><span>{locale === "cs" ? "Vlčovice 314 · orientačně, bez aktuální dopravy" : "Vlčovice 314 · estimate, without live traffic"}</span></div>
      <div className="panel"><small>{l.status}</small><strong>{raceStatus(race.status, locale)}</strong><span>{race.organizer || "—"}</span></div>
    </section>
    <section className="panel race-logistics-panel">
      <header><div><span className="eyebrow">MM RACE LOGISTICS</span><h2>{locale === "cs" ? "Posádka a doprava" : "Crew and transport"}</h2><p>{locale === "cs" ? "Mechanici a týmová auta přiřazená k tomuto závodu." : "Mechanics and team vehicles assigned to this race."}</p></div><div className="race-logistics-summary"><span><strong>{plan?.mechanics.length ?? 0}</strong>{locale === "cs" ? "mechaniků" : "mechanics"}</span><span><strong>{plan?.vehicles.length ?? 0}</strong>{locale === "cs" ? "aut" : "vehicles"}</span></div></header>
      <div className="race-logistics">
        <AssignmentStrip icon="M" title={l.mechanics} locale={locale} items={plan?.mechanics.map((item) => ({ id: item.id, label: item.mechanicName })) ?? []} options={unassignedMechanics.map((item) => ({ id: item.id, label: item.name }))} canManage={canManage} emptyText={l.noResources} onAdd={(id) => assign("mechanic", id)} onDelete={(id) => remove("mechanic", id)} />
        <AssignmentStrip icon="A" title={l.cars} locale={locale} items={plan?.vehicles.map((item) => ({ id: item.id, label: `${item.vehicleName}${item.licensePlate ? ` · ${item.licensePlate}` : ""}` })) ?? []} options={unassignedVehicles.map((item) => ({ id: item.id, label: `${item.name}${item.licensePlate ? ` · ${item.licensePlate}` : ""}` }))} canManage={canManage} emptyText={l.noResources} onAdd={(id) => assign("vehicle", id)} onDelete={(id) => remove("vehicle", id)} />
      </div>
    </section>
    {race.circuitId && <RaceCircuitPanel race={race} locale={locale} />}
    <RaceLogisticsPanel raceId={race.id} locale={locale} role={role} />
    {plan && <RaceEquipmentOverview race={race} plan={plan} carburetors={catalog.carburetors} locale={locale} />}
    {loading && <section className="panel empty-state"><span className="spinner" /><p>{locale === "cs" ? "Načítám plán…" : "Loading plan…"}</p></section>}
    {!loading && plan && <section className="race-category-stack">{race.categories.map((category) => {
      const entries = plan.entries.filter((entry) => entry.category === category);
      const extras = plan.extras
        .filter((extra) => extra.category === category)
        .sort((left, right) => left.resourceType === right.resourceType ? 0 : left.resourceType === "engine" ? -1 : 1);
      const assignedEngineIds = uniqueStrings(entries.flatMap((entry) => [entry.engine1Id, entry.engine2Id, entry.engine3Id]));
      const extraEngineIds = uniqueStrings(extras.filter((extra) => extra.resourceType === "engine").map((extra) => extra.resourceId));
      const assignedCarburetorIds = uniqueStrings(entries.flatMap((entry) => [entry.carburetor1Id, entry.carburetor2Id, entry.carburetor3Id]));
      const extraCarburetorIds = uniqueStrings(extras.filter((extra) => extra.resourceType === "carburetor").map((extra) => extra.resourceId));
      return <article className={`panel race-category category-${category.toLowerCase().replaceAll(" ", "-")}`} key={category}>
        <header><div className="category-heading"><span>{l.category}</span><h2>{category}</h2></div><CategoryLoadoutStats locale={locale} pilotCount={entries.length} engineCount={assignedEngineIds.length} extraEngineCount={extraEngineIds.length} carburetorCount={assignedCarburetorIds.length} extraCarburetorCount={extraCarburetorIds.length} /><div className="category-print-context print-only"><div><strong>{race.name}</strong><small>{formatDateRange(race.startDate, race.endDate, locale)} · {race.track}</small></div><NativeImage src="/machac-motors-logo.jpg" alt="Macháč Motors" loading="eager" /></div><div className="category-actions no-print">{canManage && <><button className="secondary-compact" type="button" onClick={() => setExtraForm(category)}>＋ {l.addExtra}</button><button className="primary-button" type="button" onClick={() => setEntryForm({ category, entry: null })}>＋ {l.addDriver}</button></>}</div></header>
        {entries.length === 0 ? <p className="category-empty">{l.noDrivers}</p> : <div className="race-entry-list">{entries.map((entry) => {
          const engineValues = [entry.engine1Id ?? "", entry.engine2Id ?? "", entry.engine3Id ?? ""];
          const carburetorValues = [entry.carburetor1Id ?? "", entry.carburetor2Id ?? "", entry.carburetor3Id ?? ""];
          const engineCodes = [entry.engine1Code, entry.engine2Code, entry.engine3Code];
          const engineConfigurations = [entry.engine1Configuration, entry.engine2Configuration, entry.engine3Configuration];
          const carburetorCodes = [entry.carburetor1Code, entry.carburetor2Code, entry.carburetor3Code];
          const engineChoices = engines.filter((engine) => engineMatches(engine.family, category) && engine.status !== "retired" && !engine.soldAt);
          const selectedEngines = engineValues.map((engineId) => engines.find((engine) => engine.id === engineId));
          const carburetorChoices = catalog.carburetors.filter((carburetor) => carbMatches(carburetor.family, category) && carburetor.status !== "retired" && !carburetor.soldAt);
          const isKz = category === "KZ";
          const visibleEngineSlots = Math.max(storedEngineSlots(entry), expandedEngineSlots[entry.id] ?? 1);
          const visibleCarburetorSlots = isKz ? 0 : Math.max(storedCarburetorSlots(entry), expandedCarburetorSlots[entry.id] ?? 1);
          const enginePositions = [1, 2, 3].filter((position) => position <= visibleEngineSlots);
          const carburetorPositions = [1, 2, 3].filter((position) => position <= visibleCarburetorSlots);
          return <article id={`race-entry-${entry.id}`} className={`race-entry-card ${isKz ? "kz-entry-card" : "flat-entry-card"} ${entry.isConfirmed ? "confirmed" : "unconfirmed"}`} key={entry.id}>
            <div className="race-entry-person"><span className="race-entry-number">#{driverNumber(catalog.drivers, entry.driverId)}</span><div><strong>{entry.driverName}</strong><small>{entry.teamName || "—"}</small></div>{canManage ? <button className={`confirmation-toggle no-print ${entry.isConfirmed ? "confirmed" : "unconfirmed"}`} type="button" onClick={() => { void toggleConfirmation(entry); }}>{entry.isConfirmed ? (locale === "cs" ? "✓ Potvrzen" : "✓ Confirmed") : (locale === "cs" ? "Nepotvrzen" : "Unconfirmed")}</button> : null}<span className={`print-only confirmation-label ${entry.isConfirmed ? "confirmed" : "unconfirmed"}`}>{entry.isConfirmed ? (locale === "cs" ? "Potvrzen" : "Confirmed") : (locale === "cs" ? "Nepotvrzen" : "Unconfirmed")}</span></div>
            <div className={`race-equipment-groups independent-equipment-groups ${isKz ? "kz-equipment-groups" : "flat-equipment-groups"}`}>
              <div className="equipment-type-sequence engine-sequence">
                {enginePositions.map((position) => <div className={isKz ? "kz-motor-field" : "flat-equipment-field"} key={`engine-${position}`}><div className="equipment-field-heading"><span>{locale === "cs" ? "Motor" : "Engine"} {position}</span>{canManage && position > 1 && <button className="remove-equipment-slot no-print" type="button" onClick={() => { void removeEquipmentSlot(entry, position, "engine"); }}>× {locale === "cs" ? "Odebrat" : "Remove"}</button>}</div>{canManage ? <InlineEquipmentPicker key={`engine-${position}-${engineValues[position - 1]}`} type="engine" position={position} entry={entry} value={engineValues[position - 1]} code={engineCodes[position - 1]} configuration={engineConfigurations[position - 1]} upgradeCode={selectedEngines[position - 1]?.upgradeCode ?? ""} labelColor={selectedEngines[position - 1]?.labelColor ?? ""} selectedIds={engineValues} choices={engineChoices} plan={plan} locale={locale} onChange={(value) => updateEquipment(entry, "engine", position, value)} /> : <EquipmentValue code={engineCodes[position - 1]} configuration={engineConfigurations[position - 1]} upgradeCode={selectedEngines[position - 1]?.upgradeCode ?? ""} labelColor={selectedEngines[position - 1]?.labelColor ?? ""} />}</div>)}
                {canManage && visibleEngineSlots < 3 && <button className="add-kz-motor add-engine-slot no-print" type="button" onClick={() => setExpandedEngineSlots((current) => ({ ...current, [entry.id]: visibleEngineSlots + 1 }))}>＋ {locale === "cs" ? `Motor ${visibleEngineSlots + 1}` : `Engine ${visibleEngineSlots + 1}`}</button>}
              </div>
              {!isKz && <div className="equipment-type-sequence carburetor-sequence">
                {carburetorPositions.map((position) => <div className="flat-equipment-field" key={`carburetor-${position}`}><div className="equipment-field-heading"><span>{locale === "cs" ? "Karburátor" : "Carburetor"} {position}</span>{canManage && position > 1 && <button className="remove-equipment-slot no-print" type="button" onClick={() => { void removeEquipmentSlot(entry, position, "carburetor"); }}>× {locale === "cs" ? "Odebrat" : "Remove"}</button>}</div>{canManage ? <InlineEquipmentPicker key={`carb-${position}-${carburetorValues[position - 1]}`} type="carburetor" position={position} entry={entry} value={carburetorValues[position - 1]} code={carburetorCodes[position - 1]} configuration="" upgradeCode="" labelColor="" selectedIds={carburetorValues} choices={carburetorChoices} plan={plan} locale={locale} onChange={(value) => updateEquipment(entry, "carburetor", position, value)} /> : <EquipmentValue code={carburetorCodes[position - 1]} />}</div>)}
                {canManage && visibleCarburetorSlots < 3 && <button className="add-flat-equipment add-carburetor-slot no-print" type="button" onClick={() => setExpandedCarburetorSlots((current) => ({ ...current, [entry.id]: visibleCarburetorSlots + 1 }))}>＋ {locale === "cs" ? `Karburátor ${visibleCarburetorSlots + 1}` : `Carburetor ${visibleCarburetorSlots + 1}`}</button>}
              </div>}
            </div>
            <div className="race-entry-note-column"><span>{locale === "cs" ? "Poznámka" : "Note"}</span><InlineDriverNote key={`${entry.id}:${entry.notes}`} entry={entry} canManage={canManage} locale={locale} onSave={(notes) => updateEntryNote(entry, notes)} /></div>
            {canManage && <div className="race-entry-actions no-print"><button type="button" onClick={() => setEntryForm({ category, entry })}>{l.editAssignment}</button><button className="delete" type="button" onClick={() => { void remove("entry", entry.id); }}>{l.delete}</button></div>}
          </article>;
        })}</div>}
        {extras.length > 0 && <div className="race-extra-entry-list">{extras.map((extra) => <ExtraEquipmentRow key={extra.id} extra={extra} engine={extra.resourceType === "engine" ? engines.find((item) => item.id === extra.resourceId) : undefined} isKz={category === "KZ"} locale={locale} canManage={canManage} onRemove={() => remove("extra", extra.id)} />)}</div>}
      </article>;
    })}</section>}
    {canViewFinance && <RaceSalesPanel race={race} locale={locale} role={role} />}
    {race.notes && <section className="panel race-notes"><small>{l.notes}</small><p>{race.notes}</p></section>}
    <RaceDeliveriesPanel race={race} locale={locale} role={role} />
    </div>
    {canViewFinance && detailTab === "finance" && <RaceFinancePanel race={race} locale={locale} />}
    {entryForm && <EntryForm locale={locale} raceId={race.id} category={entryForm.category} entry={entryForm.entry} drivers={catalog.drivers} onClose={() => setEntryForm(null)} onSaved={async () => { setEntryForm(null); await loadPlan(); await onRaceChanged(); }} />}
    {extraForm && plan && <ExtraForm locale={locale} raceId={race.id} category={extraForm} engines={engines} carburetors={catalog.carburetors} plan={plan} onClose={() => setExtraForm(null)} onSaved={async () => { setExtraForm(null); await loadPlan(); }} />}
  </div>;
}

function RaceCircuitPanel({ race, locale }: { race: RaceRecord; locale: Locale }) {
  const mapsUrl = race.circuitMapsUrl || (race.circuitAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(race.circuitAddress)}` : "");
  return <section className="panel race-circuit-panel">
    <div className="race-circuit-image">
      {race.circuitImageUrl ? <NativeImage src={race.circuitImageUrl} alt={`${race.circuitName || race.track} · circuit`} /> : <span>⌁</span>}
    </div>
    <div className="race-circuit-copy">
      <span className="eyebrow">MM CIRCUIT DIRECTORY</span>
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
    <RaceWeather key={`${race.circuitId}:${race.startDate}:${race.endDate}`} race={race} locale={locale} />
  </section>;
}

function RaceWeather({ race, locale }: { race: RaceRecord; locale: Locale }) {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/weather?circuitId=${encodeURIComponent(race.circuitId || "")}&startDate=${encodeURIComponent(race.startDate)}&endDate=${encodeURIComponent(race.endDate)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => (await response.json()) as WeatherSnapshot)
      .then((result) => setWeather(result))
      .catch((error) => { if ((error as Error).name !== "AbortError") setWeather({ available: false, reason: "weather_unavailable" }); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [race.circuitId, race.startDate, race.endDate]);

  const current = weather?.current;
  return <div className="race-weather">
    <div className="race-weather-heading"><span className="eyebrow">{locale === "cs" ? "POČASÍ NA TRATI" : "CIRCUIT WEATHER"}</span>{weather?.available && <small>{locale === "cs" ? "živá data" : "live data"}</small>}</div>
    {loading ? <div className="race-weather-empty"><span className="spinner" /> {locale === "cs" ? "Načítám…" : "Loading…"}</div> : !weather?.available ? <div className="race-weather-empty">{weather?.reason === "coordinates_missing" ? (locale === "cs" ? "Doplň souřadnice tratě pro počasí." : "Add circuit coordinates for weather.") : (locale === "cs" ? "Počasí teď není dostupné." : "Weather is currently unavailable.")}</div> : <>
      {current && <div className="race-weather-current">
        <div><strong>{weatherIcon(Number(current.weather_code ?? 0))} {roundWeather(current.temperature_2m)} °C</strong><small>{locale === "cs" ? "nyní" : "now"}</small></div>
        <div><strong>{roundWeather(current.relative_humidity_2m)} %</strong><small>{locale === "cs" ? "vlhkost" : "humidity"}</small></div>
        <div><strong>{roundWeather(current.wind_speed_10m)} km/h</strong><small>{locale === "cs" ? "vítr" : "wind"}</small></div>
        <div><strong>{roundWeather(current.rain)} mm</strong><small>{locale === "cs" ? "déšť" : "rain"}</small></div>
      </div>}
      <div className="race-weather-forecast">{(weather.forecast ?? []).length ? weather.forecast?.map((day) => <div key={day.date}>
        <strong>{formatShortDate(day.date, locale)}</strong><span>{weatherIcon(day.weatherCode)} {Math.round(day.temperatureMin)}–{Math.round(day.temperatureMax)} °C</span><small>☂ {Math.round(day.rainProbability)} % · {formatDecimal(day.rainTotal, locale)} mm</small><small>↗ {Math.round(day.windMax)} / {Math.round(day.gustMax)} km/h</small>
      </div>) : <p>{locale === "cs" ? "Předpověď pro termín závodu bude dostupná přibližně 16 dní předem." : "The race forecast becomes available about 16 days ahead."}</p>}</div>
    </>}
  </div>;
}

function RaceEquipmentOverview({ race, plan, carburetors, locale }: { race: RaceRecord; plan: RacePlan; carburetors: CarburetorRecord[]; locale: Locale }) {
  return <section className="panel race-equipment-overview">
    <header><div><span className="eyebrow">MM RACE LOADOUT</span><h2>{locale === "cs" ? "Přehled pilotů a vybavení" : "Drivers and equipment"}</h2></div><div className="race-total-drivers"><strong>{plan.entries.length}</strong><span>{locale === "cs" ? "pilotů celkem" : "drivers total"}</span></div></header>
    <div className="race-category-overview-grid">{race.categories.map((category) => {
      const entries = plan.entries.filter((entry) => entry.category === category);
      const extras = plan.extras.filter((extra) => extra.category === category);
      const assignedEngineIds = uniqueStrings(entries.flatMap((entry) => [entry.engine1Id, entry.engine2Id, entry.engine3Id]));
      const extraEngineIds = uniqueStrings(extras.filter((extra) => extra.resourceType === "engine").map((extra) => extra.resourceId));
      const assignedCarbIds = uniqueStrings(entries.flatMap((entry) => [entry.carburetor1Id, entry.carburetor2Id, entry.carburetor3Id]));
      const extraCarbIds = uniqueStrings(extras.filter((extra) => extra.resourceType === "carburetor").map((extra) => extra.resourceId));
      const carbBreakdown = carburetorBreakdown([...assignedCarbIds, ...extraCarbIds], carburetors);
      return <article className={`race-category-overview category-${category.toLowerCase().replaceAll(" ", "-")}`} key={category}>
        <div className="race-category-overview-title"><strong>{category}</strong><span>{entries.length} {locale === "cs" ? "pilotů" : "drivers"}</span></div>
        <dl><div><dt>{locale === "cs" ? "Motory" : "Engines"}</dt><dd>{assignedEngineIds.length}<small>+ {extraEngineIds.length} extra</small></dd></div><div><dt>{locale === "cs" ? "Karburátory" : "Carburetors"}</dt><dd>{assignedCarbIds.length}<small>+ {extraCarbIds.length} extra</small></dd></div></dl>
        <div className="carb-breakdown">{carbBreakdown.length ? carbBreakdown.map((item) => <span key={item.label}><strong>{item.count}×</strong> {item.label}</span>) : <span>—</span>}</div>
      </article>;
    })}</div>
  </section>;
}

function CategoryLoadoutStats({ locale, pilotCount, engineCount, extraEngineCount, carburetorCount, extraCarburetorCount }: { locale: Locale; pilotCount: number; engineCount: number; extraEngineCount: number; carburetorCount: number; extraCarburetorCount: number }) {
  return <div className="category-loadout-stats" aria-label={locale === "cs" ? "Souhrn kategorie" : "Category summary"}>
    <div><strong>{pilotCount}</strong><span>{locale === "cs" ? "Pilotů" : "Drivers"}</span></div>
    <div><strong>{engineCount}<small>+ {extraEngineCount} extra</small></strong><span>{locale === "cs" ? "Motorů" : "Engines"}</span></div>
    <div><strong>{carburetorCount}<small>+ {extraCarburetorCount} extra</small></strong><span>{locale === "cs" ? "Karburátorů" : "Carburetors"}</span></div>
  </div>;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
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

function storedEngineSlots(entry: RaceEntry) {
  if (entry.engine3Id) return 3;
  if (entry.engine2Id) return 2;
  return 1;
}

function storedCarburetorSlots(entry: RaceEntry) {
  if (entry.carburetor3Id) return 3;
  if (entry.carburetor2Id) return 2;
  return 1;
}

function EquipmentValue({ code, configuration = "", upgradeCode = "", labelColor = "" }: { code: string; configuration?: string; upgradeCode?: string; labelColor?: string }) {
  return <span className={code ? "equipment-code" : "equipment-empty"} style={code && labelColor ? { borderLeft: `7px solid ${labelColor}` } : undefined}>{code ? equipmentDisplay(code, configuration, upgradeCode) : "—"}</span>;
}

function ExtraEquipmentRow({ extra, engine, isKz, locale, canManage, onRemove }: { extra: RaceExtra; engine?: EngineChoice; isKz: boolean; locale: Locale; canManage: boolean; onRemove: () => Promise<void> }) {
  const engineCode = extra.resourceType === "engine" ? extra.resourceCode : "";
  const carburetorCode = extra.resourceType === "carburetor" ? extra.resourceCode : "";
  const resourceLabel = extra.resourceType === "engine" ? (locale === "cs" ? "Extra motor" : "Extra engine") : (locale === "cs" ? "Extra karburátor" : "Extra carburetor");
  const fieldLabel = extra.resourceType === "engine" ? (locale === "cs" ? "Motor" : "Engine") : (locale === "cs" ? "Karburátor" : "Carburetor");

  return <article className={`race-entry-card extra-entry-card ${isKz ? "kz-entry-card" : "flat-entry-card"}`}>
    <div className="race-entry-person extra-entry-person"><span className="race-entry-number">EX</span><div><strong>EXTRA</strong><small>{resourceLabel}</small></div></div>
    <div className={`race-equipment-groups independent-equipment-groups ${isKz ? "kz-equipment-groups" : "flat-equipment-groups"}`}><div className={`equipment-type-sequence ${extra.resourceType === "engine" ? "engine-sequence" : "carburetor-sequence"}`}><div className={isKz ? "kz-motor-field" : "flat-equipment-field"}><div className="equipment-field-heading"><span>{fieldLabel} 1</span></div>{extra.resourceType === "engine" ? <EquipmentValue code={engineCode} configuration={engine?.currentConfiguration} upgradeCode={engine?.upgradeCode} labelColor={engine?.labelColor} /> : <EquipmentValue code={carburetorCode} />}</div></div></div>
    <div className="race-entry-note-column"><span>{locale === "cs" ? "Poznámka" : "Note"}</span><div className="race-entry-note"><span>{extra.notes || "—"}</span></div></div>
    {canManage && <div className="race-entry-actions no-print"><button className="delete" type="button" onClick={() => { void onRemove(); }}>{locale === "cs" ? "Odebrat" : "Remove"}</button></div>}
  </article>;
}

function InlineDriverNote({ entry, canManage, locale, onSave }: { entry: RaceEntry; canManage: boolean; locale: Locale; onSave: (notes: string) => Promise<boolean> }) {
  const [note, setNote] = useState(entry.notes);
  const [saving, setSaving] = useState(false);
  async function save() {
    const next = note.trim();
    if (next === entry.notes) return;
    setSaving(true);
    const saved = await onSave(next);
    if (!saved) setNote(entry.notes);
    setSaving(false);
  }

  return <div className="race-entry-note">{canManage && <input className="no-print" value={note} maxLength={140} aria-label={`${locale === "cs" ? "Poznámka" : "Note"} · ${entry.driverName}`} placeholder={locale === "cs" ? "Poznámka – např. výfuk" : "Note – e.g. exhaust"} onChange={(event) => setNote(event.target.value)} onBlur={() => { void save(); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />}{saving && <small className="no-print">{locale === "cs" ? "Ukládám…" : "Saving…"}</small>}<span className="print-only">{note || "—"}</span>{!canManage && <span className="no-print">{note || "—"}</span>}</div>;
}

function InlineEquipmentPicker({ type, position, entry, value, code, configuration, upgradeCode, labelColor, selectedIds, choices, plan, locale, onChange }: {
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
  onChange: (value: string) => Promise<boolean>;
}) {
  const [selected, setSelected] = useState(value);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const label = `${type === "engine" ? (locale === "cs" ? "Motor" : "Engine") : (locale === "cs" ? "Karburátor" : "Carburetor")} ${position} · ${entry.driverName}`;
  const selectedChoice = choices.find((choice) => choice.id === selected);
  const selectedCode = selectedChoice?.code ?? (selected === value ? code : "");
  const selectedConfiguration = type === "engine" ? (selectedChoice?.currentConfiguration ?? (selected === value ? configuration : "")) : "";
  const selectedUpgradeCode = type === "engine" ? (selectedChoice?.upgradeCode ?? (selected === value ? upgradeCode : "")) : "";
  const selectedLabelColor = type === "engine" ? (selectedChoice?.labelColor ?? (selected === value ? labelColor : "")) : "";

  async function change(nextValue: string) {
    setOpen(false);
    setSelected(nextValue);
    setSaving(true);
    const saved = await onChange(nextValue);
    if (!saved) setSelected(value);
    setSaving(false);
  }

  return <div className={`equipment-picker${open ? " is-open" : ""}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button className="equipment-picker-trigger no-print" type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} disabled={saving} style={selectedCode && selectedLabelColor ? { borderColor: selectedLabelColor, borderLeft: `9px solid ${selectedLabelColor}`, backgroundColor: `${selectedLabelColor}38`, boxShadow: `inset 0 0 0 1px ${selectedLabelColor}55` } : undefined} onClick={() => setOpen((current) => !current)}><span>{selectedCode ? equipmentDisplay(selectedCode, selectedConfiguration, selectedUpgradeCode) : (locale === "cs" ? "— Vybrat" : "— Select")}</span><b>⌄</b></button>
    {open && <div className="equipment-picker-menu no-print" role="listbox" aria-label={label}>
      <button type="button" className={!selected ? "selected" : ""} role="option" aria-selected={!selected} onClick={() => { void change(""); }}><strong>—</strong><span>{locale === "cs" ? "Bez přiřazení" : "Unassigned"}</span></button>
      {choices.map((choice) => {
        const option = equipmentOption(choice, type, entry, selectedIds, position, plan, locale);
        const disabled = option.disabled && choice.id !== value;
        const equipment = equipmentDisplay(choice.code, type === "engine" ? choice.currentConfiguration ?? "" : "", type === "engine" ? choice.upgradeCode ?? "" : "");
        return <button key={choice.id} type="button" role="option" aria-selected={selected === choice.id} className={`${option.tone}${selected === choice.id ? " selected" : ""}`} disabled={disabled} style={type === "engine" && choice.labelColor ? { borderLeft: `7px solid ${choice.labelColor}` } : undefined} onClick={() => { void change(choice.id); }}><strong>{equipment}</strong><span>{option.description}</span></button>;
      })}
    </div>}
    {saving && <small className="no-print">{locale === "cs" ? "Ukládám…" : "Saving…"}</small>}
    <span className={`print-only ${selectedCode ? "equipment-code" : "equipment-empty"}`} style={selectedCode && selectedLabelColor ? { borderLeft: `7px solid ${selectedLabelColor}` } : undefined}>{selectedCode ? equipmentDisplay(selectedCode, selectedConfiguration, selectedUpgradeCode) : "—"}</span>
  </div>;
}

function equipmentOption(choice: { id: string; code: string; family: string; currentConfiguration?: string; upgradeCode?: string; labelColor?: string }, type: "engine" | "carburetor", entry: RaceEntry, selectedIds: string[], position: number, plan: RacePlan, locale: Locale) {
  const assignments = (plan.equipmentAssignments ?? []).filter((assignment) => assignment.resourceType === type && assignment.resourceId === choice.id);
  const own = assignments.find((assignment) => assignment.entryId === entry.id);
  const conflict = assignments.find((assignment) => assignment.entryId !== entry.id && (assignment.isRental
    ? assignment.raceStatus !== "preparing" || dateIntervalsOverlap(assignment.startDate, assignment.endDate, plan.race.startDate, plan.race.endDate)
    : assignment.raceId === plan.race.id || dateIntervalsOverlap(assignment.startDate, assignment.endDate, plan.race.startDate, plan.race.endDate)));
  const latest = [...assignments].sort((left, right) => right.startDate.localeCompare(left.startDate))[0];
  const usedInAnotherSlot = selectedIds.some((selectedId, index) => index !== position - 1 && selectedId === choice.id);
  const assignment = own ?? conflict ?? latest;
  if (usedInAnotherSlot) return { disabled: true, tone: "busy", description: `${choice.family} · ${locale === "cs" ? "už vybrán u tohoto pilota" : "already selected for this driver"}` };
  if (conflict?.isRental) return { disabled: true, tone: "busy", description: `🔒 ${choice.family} · ${locale === "cs" ? "pronajato" : "rented"}: ${conflict.rentalHolder} · ${conflict.rentalNumber} · ${locale === "cs" ? "čeká na vrácení" : "awaiting return"}` };
  if (!assignment) return { disabled: false, tone: "available", description: `${choice.family} · ${locale === "cs" ? "volný" : "available"}` };
  const person = assignment.isExtra ? (locale === "cs" ? "Extra vybavení" : "Extra equipment") : assignment.driverName;
  const place = `${person || "—"} · ${assignment.raceName}`;
  if (own) return { disabled: false, tone: "assigned", description: `${choice.family} · ${locale === "cs" ? "přiřazen" : "assigned"}: ${place}` };
  if (conflict) return { disabled: true, tone: "busy", description: `🔒 ${choice.family} · ${locale === "cs" ? "obsazen" : "unavailable"}: ${place} · ${formatDateRange(assignment.startDate, assignment.endDate, locale)}` };
  return { disabled: false, tone: "history", description: `${choice.family} · ${locale === "cs" ? "naposledy" : "last"}: ${place}` };
}

function equipmentDisplay(code: string | null | undefined, configuration: string | null | undefined, upgradeCode: string | null | undefined = "") {
  const normalizedCode = String(code ?? "").trim();
  const details = [configuration, upgradeCode].map((detail) => String(detail ?? "").trim()).filter((detail, index, all) => detail && detail !== normalizedCode && all.indexOf(detail) === index);
  return details.length ? `${normalizedCode} · ${details.join(" · ")}` : normalizedCode;
}

function dateIntervalsOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA <= endB && endA >= startB;
}

function AssignmentStrip({ icon, title, locale, items, options, canManage, emptyText, onAdd, onDelete }: { icon: string; title: string; locale: Locale; items: Array<{ id: string; label: string }>; options: Array<{ id: string; label: string }>; canManage: boolean; emptyText: string; onAdd: (id: string) => void; onDelete: (id: string) => void }) {
  const [selected, setSelected] = useState("");
  return <div className="assignment-strip"><div className="assignment-title"><span className="assignment-icon">{icon}</span><div><small>{items.length} {title.toLocaleLowerCase(locale === "cs" ? "cs" : "en")}</small><h3>{title}</h3></div></div><div className="assignment-chips">{items.map((item) => <span key={item.id}>{item.label}{canManage && <button className="no-print" type="button" aria-label={`${locale === "cs" ? "Odebrat" : "Remove"} ${item.label}`} onClick={() => onDelete(item.id)}>×</button>}</span>)}{items.length === 0 && <small>{emptyText}</small>}</div>{canManage && <div className="assignment-add no-print"><select aria-label={`${title} – ${locale === "cs" ? "přidat" : "add"}`} value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">{options.length ? `＋ ${locale === "cs" ? "Vybrat" : "Select"}` : "—"}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><button className="secondary-compact" type="button" disabled={!selected} onClick={() => { onAdd(selected); setSelected(""); }}>{locale === "cs" ? "Přidat" : "Add"}</button></div>}</div>;
}

function RaceForm({ locale, race, catalog, circuits, mechanicIds, vehicleIds, onClose, onSaved }: { locale: Locale; race: RaceRecord | null; catalog: CatalogData; circuits: CircuitRecord[]; mechanicIds: string[]; vehicleIds: string[]; onClose: () => void; onSaved: (id: string) => void }) {
  const l = text[locale];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [countryCode, setCountryCode] = useState(race?.countryCode ?? "");
  const [circuitId, setCircuitId] = useState(race?.circuitId ?? "");
  const [track, setTrack] = useState(race?.track ?? "");
  const [address, setAddress] = useState(race?.address ?? "");
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
  const selectedTemplate = race?.raceTemplateId ?? catalog.raceTypes.find((template) => template.name === race?.name)?.id ?? "";
  return <Modal title={race ? l.edit : l.newRace} onClose={onClose}><form onSubmit={submit}><div className="form-grid race-form-grid">
    <label><span>{locale === "cs" ? "Závod" : "Race"} *</span><select name="raceTemplateId" required autoFocus defaultValue={selectedTemplate}><option value="">{locale === "cs" ? "Vyber závod z databáze…" : "Select a race preset…"}</option>{catalog.raceTypes.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select>{catalog.raceTypes.length === 0 && <small className="field-help">{locale === "cs" ? "Nejdříve přidej závod v levém menu Typy závodů." : "First add a preset in Race types."}</small>}</label>
    <label><span>{locale === "cs" ? "Země" : "Country"} *</span><CountrySelect name="countryCode" required value={countryCode} onChange={(event) => { const next=event.target.value; setCountryCode(next); if (!circuits.some((circuit)=>circuit.id===circuitId&&circuit.countryCode===next)) { setCircuitId(""); setTrack(""); setAddress(""); } }} locale={locale} /></label>
    <label><span>{locale === "cs" ? "Trať z databáze" : "Circuit from directory"}</span><select name="circuitId" value={circuitId} onChange={(event)=>selectCircuit(event.target.value)} disabled={!countryCode}><option value="">{locale === "cs" ? "Ručně / zatím neurčeno" : "Manual / not decided"}</option>{availableCircuits.map((circuit)=><option key={circuit.id} value={circuit.id}>{countryFlag(circuit.countryCode)} {circuit.name}</option>)}</select>{countryCode&&availableCircuits.length===0&&<small className="field-help">{locale === "cs" ? "Pro tuto zemi ještě není trať v adresáři." : "No circuit saved for this country yet."}</small>}</label>
    <label><span>{locale === "cs" ? "Trať / město" : "Track / city"} *</span><input name="track" required value={track} readOnly={Boolean(circuitId)} onChange={(event)=>setTrack(event.target.value)} /></label>
    <label><span>{locale === "cs" ? "Adresa" : "Address"}</span><input name="address" value={address} readOnly={Boolean(circuitId)} onChange={(event)=>setAddress(event.target.value)} /></label>
    <label><span>{locale === "cs" ? "Odjezd" : "Departure"} *</span><input type="date" name="departureDate" required defaultValue={race?.departureDate ?? ""} /></label>
    <label><span>{locale === "cs" ? "Začátek závodu" : "Race start"} *</span><input type="date" name="startDate" required defaultValue={race?.startDate ?? ""} /></label>
    <label><span>{locale === "cs" ? "Konec závodu" : "Race end"} *</span><input type="date" name="endDate" required defaultValue={race?.endDate ?? ""} /></label>
    <label><span>{locale === "cs" ? "Návrat" : "Return"} *</span><input type="date" name="returnDate" required defaultValue={race?.returnDate ?? ""} /></label>
    <label><span>{locale === "cs" ? "Pořadatel" : "Organizer"}</span><input name="organizer" defaultValue={race?.organizer ?? ""} /></label>
    <label><span>{l.status}</span><select name="status" defaultValue={race?.status ?? "planned"}><option value="planned">{locale === "cs" ? "Plánováno" : "Planned"}</option><option value="active">{locale === "cs" ? "Probíhá" : "Active"}</option><option value="completed">{locale === "cs" ? "Dokončeno" : "Completed"}</option></select></label>
    <fieldset className="category-picker full-field"><legend>{locale === "cs" ? "Kategorie na závodě" : "Race categories"} *</legend>{categoryOrder.map((category) => <label key={category}><input type="checkbox" name="categories" value={category} defaultChecked={race?.categories.includes(category) ?? false} /><span>{category}</span></label>)}</fieldset>
    <fieldset className="category-picker full-field"><legend>{locale === "cs" ? "Mechanici" : "Mechanics"}</legend>{catalog.mechanics.length === 0 ? <small>{locale === "cs" ? "Nejdříve přidej mechaniky v levém menu." : "First add mechanics in the left menu."}</small> : catalog.mechanics.map((mechanic) => <label key={mechanic.id}><input type="checkbox" name="mechanicIds" value={mechanic.id} defaultChecked={mechanicIds.includes(mechanic.id)} /><span>{mechanic.name}</span></label>)}</fieldset>
    <fieldset className="category-picker full-field"><legend>{locale === "cs" ? "Auta" : "Cars"}</legend>{catalog.vehicles.length === 0 ? <small>{locale === "cs" ? "Nejdříve přidej auta v levém menu." : "First add cars in the left menu."}</small> : catalog.vehicles.map((vehicle) => <label key={vehicle.id}><input type="checkbox" name="vehicleIds" value={vehicle.id} defaultChecked={vehicleIds.includes(vehicle.id)} /><span>{vehicle.name}{vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}</span></label>)}</fieldset>
    <label className="full-field"><span>{l.notes}</span><textarea name="notes" rows={3} defaultValue={race?.notes ?? ""} /></label>
  </div>{error && <p className="form-error">{error}</p>}<ModalActions locale={locale} saving={saving} onClose={onClose} /></form></Modal>;
}

function EntryForm({ locale, raceId, category, entry, drivers, onClose, onSaved }: { locale: Locale; raceId: string; category: string; entry: RaceEntry | null; drivers: DriverRecord[]; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const driverOptions = drivers.filter((driver) => driver.isActive || driver.id === entry?.driverId);
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

function ExtraForm({ locale, raceId, category, engines, carburetors, plan, onClose, onSaved }: { locale: Locale; raceId: string; category: string; engines: EngineChoice[]; carburetors: CarburetorRecord[]; plan: RacePlan; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<"engine" | "carburetor">("engine");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const resources = type === "engine" ? engines.filter((item) => engineMatches(item.family, category) && item.status !== "retired" && !item.soldAt) : carburetors.filter((item) => carbMatches(item.family, category) && item.status !== "retired" && !item.soldAt);
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
  return <Modal title={`${locale === "cs" ? "Extra vybavení" : "Extra equipment"} · ${category}`} onClose={onClose}><form onSubmit={submit}><div className="form-grid"><label><span>{locale === "cs" ? "Typ" : "Type"}</span><select value={type} onChange={(event) => setType(event.target.value as "engine" | "carburetor")}><option value="engine">{locale === "cs" ? "Motor" : "Engine"}</option>{category !== "KZ" && <option value="carburetor">{locale === "cs" ? "Karburátor" : "Carburetor"}</option>}</select></label><label><span>{locale === "cs" ? "Vyber vybavení" : "Select equipment"} *</span><select name="resourceId" required key={type}><option value="">—</option>{resources.map((item) => { const rental = plan.equipmentAssignments.find((assignment) => assignment.isRental && assignment.resourceType === type && assignment.resourceId === item.id && (assignment.raceStatus !== "preparing" || dateIntervalsOverlap(assignment.startDate, assignment.endDate, plan.race.startDate, plan.race.endDate))); return <option key={item.id} value={item.id} disabled={Boolean(rental)}>{type === "engine" ? equipmentDisplay(item.code, (item as EngineChoice).currentConfiguration, (item as EngineChoice).upgradeCode) : item.code}{rental ? ` · 🔒 ${locale === "cs" ? "pronajato" : "rented"} ${rental.rentalHolder}` : ""}</option>; })}</select></label><label className="full-field"><span>{locale === "cs" ? "Poznámka" : "Notes"}</span><textarea name="notes" rows={2} /></label></div>{error && <p className="form-error">{error}</p>}<ModalActions locale={locale} saving={saving} onClose={onClose} /></form></Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal race-modal" role="dialog" aria-modal="true"><div className="modal-header"><div><span className="eyebrow">MM RACE CONTROL</span><h2>{title}</h2></div><button className="close-button" type="button" onClick={onClose}>×</button></div>{children}</section></div>;
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
  if (error.includes("is rented in")) return error.replace("Engine", "Motor").replace("Carburetor", "Karburátor").replace("is rented in", "je pronajatý v").replace("to", "komu").replace("and has not been returned", "a dosud nebyl vrácen");
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

function formatDateRange(start: string, end: string, locale: Locale) {
  const formatter = new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const parse = (value: string) => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); };
  if (!start || !end) return "—";
  return start === end ? formatter.format(parse(start)) : `${formatter.format(parse(start))} – ${formatter.format(parse(end))}`;
}

function racePrintTitle(race: RaceRecord) {
  const datePart = race.startDate === race.endDate ? race.startDate : `${race.startDate}_${race.endDate}`;
  return `${race.name}_${datePart}`.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_");
}
