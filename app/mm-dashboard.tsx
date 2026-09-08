"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CatalogPage, vehicleServiceStatus, type VehicleRecord } from "./catalog-pages";
import { RacePage } from "./race-pages";
import { SalesPage } from "./sales-page";
import { countryFlag } from "./countries";
import { CalendarPage } from "./calendar-page";
import { LogisticsPage } from "./logistics-pages";
import { RaceLogoBadge } from "./race-logo-badge";
import { pluralForm, formatCount, type PluralForms } from "./pluralize";
import { NO_HOUR_TRACKING_ENGINE_FAMILIES, AUTO_READY_ON_SERVICE_ENGINE_FAMILIES } from "./engine-family-rules";
import { TaskPage, type WorkItem } from "./task-pages";
import { CircuitsPage } from "./circuits-page";
import { SettingsPage } from "./settings-page";
import { ClothingPage } from "./clothing-page";
import { CustomersPage, InventoryPage, ServiceCatalogPage } from "./commerce-pages";
import { ChecklistsPage } from "./checklist-pages";
import { EmptyState, LoadingState } from "./empty-state";
import { useModalA11y } from "./use-modal-a11y";
import { EngineServicePartCatalogPanel } from "./engine-service-part-catalog-panel";
import { EngineTechnicalStructurePanel } from "./engine-technical-structure-panel";

type Locale = "cs" | "en";
type View = "dashboard" | "tasks" | "calendar" | "races" | "raceTypes" | "circuits" | "teams" | "drivers" | "customers" | "engines" | "carburetors" | "mechanics" | "clothing" | "vehicles" | "accommodation" | "flights" | "rentals" | "service" | "sales" | "inventory" | "documents" | "settings";
// Views whose own page component already renders its own eyebrow/title/description hero —
// the shared topbar skips its generic title there instead of repeating it.
const VIEWS_WITH_OWN_HERO: View[] = ["tasks", "calendar", "races", "raceTypes", "circuits", "teams", "drivers", "customers", "engines", "carburetors", "mechanics", "clothing", "vehicles", "accommodation", "flights", "rentals", "service", "sales", "inventory", "documents", "settings"];
// Views backed by CatalogPage — its own detail sub-view (driver/team/mechanic/vehicle/carburetor card)
// replaces the list and already carries its own back button + hero, so the topbar hides entirely there.
const CATALOG_BACKED_VIEWS: View[] = ["raceTypes", "teams", "drivers", "carburetors", "mechanics", "vehicles"];
type EngineFilter = "ALL" | "MINI" | "OKJ" | "OKN" | "OK" | "KZ";
type EngineDetailTab = "overview" | "technical" | "service" | "hours" | "history" | "documents";

type AppSession = {
  id: string;
  fullName: string;
  email: string;
  role: "superadmin" | "boss" | "mechanic";
  locale: Locale;
  authMode: "development" | "chatgpt";
};

type DevUser = Pick<AppSession, "id" | "email" | "fullName" | "role">;

type ActivityRecord = {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  subject: string;
  createdAt: number;
};

type EngineRecord = {
  id: string;
  code: string;
  family: "MINI" | "OKJ" | "OKN" | "OKN-J" | "OK" | "KZ";
  ignition: "" | "PVL" | "SELETTRA";
  kzGeneration: "R2" | "R3" | null;
  currentConfiguration: "MINI" | "MINI 3" | "MINI 4" | "BABY" | "BABY 3" | "BABY 4" | null;
  upgradeCode: string;
  labelColor: string;
  purchaseDate: string | null;
  status: "ready" | "service_soon" | "service" | "rebuild" | "storage" | "retired";
  totalMinutes: number;
  pistonMinutes: number;
  rodMinutes: number;
  lastOppamaMinutes: number;
  currentPistonSize: string;
  baselineTotalMinutes: number;
  baselinePistonMinutes: number;
  baselineRodMinutes: number;
  baselineLastOppamaMinutes: number;
  baselinePistonSize: string;
  pistonSpec: string;
  cylinderCode: string;
  cylinderUpgrade: string;
  liner: string;
  degree: string;
  timing: string;
  carter: string;
  reeds: string;
  spacer: string;
  squish: string;
  notes: string;
  soldAt: number | null;
  assignedDriver?: string;
  assignedRace?: string;
  assignmentStatus?: "assigned" | "history" | "none";
  location?: EngineLocation;
  createdAt: number;
  updatedAt: number;
};

type EngineLocation =
  | { kind: "race"; raceName: string }
  | { kind: "loan"; recipientName: string; expectedReturnDate: string; overdue: boolean }
  | { kind: "workshop" };

// The configurable per-family technical-data structure (see engine-technical-structure-panel.tsx),
// loaded once alongside the engine list. `sections`/`fields`/`options` only ever contain non-archived
// rows (the API already filters archived ones out of this display payload), so a section/field/option
// missing here simply doesn't render — no archived-check needed on this side.
type TechnicalLayoutDef = { family: string; columnCount: number };
type TechnicalSectionDef = { id: string; family: string; labelCs: string; labelEn: string; sortOrder: number };
type TechnicalFieldDef = { id: string; sectionId: string; labelCs: string; labelEn: string; fieldType: "select" | "text"; showOnOverview: boolean; sortOrder: number; legacyKey: string | null };
type TechnicalOptionDef = { id: string; fieldId: string; valueCs: string; valueEn: string; sortOrder: number };
type TechnicalStructureData = {
  layout: TechnicalLayoutDef[];
  sections: TechnicalSectionDef[];
  fields: TechnicalFieldDef[];
  options: TechnicalOptionDef[];
};
const EMPTY_TECHNICAL_STRUCTURE: TechnicalStructureData = { layout: [], sections: [], fields: [], options: [] };

const engineLabelPalette = [
  "#FFFFFF", "#F2F4F7", "#D0D5DD", "#98A2B3", "#667085", "#475467", "#101828", "#000000",
  "#FEE4E2", "#FCA5A5", "#EF4444", "#D52F2D", "#B42318", "#7A271A",
  "#FFF4E5", "#FDB022", "#F79009", "#DC6803", "#B54708", "#7A2E0E",
  "#FEF3C7", "#FDE047", "#EAB308", "#A16207", "#854D0E",
  "#ECFDF3", "#86EFAC", "#22C55E", "#039855", "#067647", "#14532D",
  "#CCFBF1", "#2DD4BF", "#14B8A6", "#0F766E", "#134E4A",
  "#E0F2FE", "#38BDF8", "#0BA5EC", "#0284C7", "#175CD3", "#1E3A8A",
  "#EEF2FF", "#818CF8", "#6366F1", "#4F46E5", "#3730A3",
  "#F5F3FF", "#C084FC", "#A855F7", "#7E22CE", "#581C87",
  "#FDF2F8", "#F9A8D4", "#F472B6", "#DB2777", "#9D174D",
] as const;

type UsageRecord = {
  id: string;
  entryDate: string;
  oppamaMinutes: number;
  raceName: string;
  driverName: string;
  notes: string;
  createdBy: string;
  createdAt: number;
};

type ServiceRecord = {
  id: string;
  serviceDate: string;
  serviceType: string;
  replacedParts: string[];
  replacedPartsSnapshot: Array<{ partKey: string; labelCs: string; labelEn: string }>;
  pistonSize: string;
  notes: string;
  pistonMinutesBefore: number;
  rodMinutesBefore: number;
  mechanicId: string | null;
  mechanicName: string;
  createdBy: string;
  createdAt: number;
};

type ServicePart = { id: string; cs: string; en: string };

type EngineAuditEntry =
  | { id: string; action: "create"; isSystem: false; createdAt: number }
  | { id: string; action: "archive"; isSystem: false; createdAt: number }
  | { id: string; action: "update_technical"; isSystem: false; createdAt: number }
  | { id: string; action: "set_engine_baseline"; isSystem: false; createdAt: number }
  | { id: string; action: "status_change"; isSystem: false; createdAt: number; fromStatus: EngineRecord["status"]; toStatus: EngineRecord["status"] }
  | { id: string; action: "engine_auto_service"; isSystem: true; createdAt: number; raceName: string }
  | { id: string; action: "service"; isSystem: false; createdAt: number; mechanicName: string; partsCount: number };

type EngineAssignment = {
  id: string;
  driverId: string;
  driverName: string;
  teamName: string;
  category: string;
  raceId: string;
  raceName: string;
  logoUrl: string;
  track: string;
  countryCode: string;
  startDate: string;
  endDate: string;
  raceStatus: string;
  carburetorId: string | null;
  carburetorCode: string;
  position: number;
};

type EngineLoanRecord = {
  id: string;
  engineId: string;
  engineCode?: string;
  recipientType: "customer" | "team" | "driver";
  recipientId: string;
  recipientName: string;
  startDate: string;
  expectedReturnDate: string;
  actualReturnDate: string | null;
  notes: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
};

type LoanRecipientOption = { value: string; label: string; type: "customer" | "team" | "driver"; id: string };

type DashboardRace = {
  id: string;
  name: string;
  logoUrl: string;
  track: string;
  countryCode: string;
  startDate: string;
  endDate: string;
  status: "planned" | "active" | "completed";
  driverCount: number;
  engineCount: number;
  carburetorCount: number;
};

type DashboardCatalog = {
  drivers: Array<{ id: string; isActive: boolean }>;
  carburetors: Array<{ id: string; soldAt?: number | null; status: string }>;
  vehicles: Array<{ id: string; currentKm?: number | null; serviceIntervalKm?: number | null; lastServiceKm?: number | null }>;
};


const pistonSizeOptions = ["53.83", "53.85", "53.86", "53.87", "53.88", "53.89", "53.90", "53.91", "53.92", "53.93", "53.94", "53.95"];

const copy = {
  cs: {
    greeting: "Dobré ráno, Martine",
    subtitle: "Tady je dnešní přehled týmu.",
    quick: "Rychlá akce",
    dashboard: "Přehled",
    tasks: "Úkoly",
    calendar: "Kalendář",
    races: "Závody",
    raceTypes: "Typy závodů",
    circuits: "Tratě",
    teams: "Týmy",
    customers: "Zákazníci",
    drivers: "Piloti",
    engines: "Motory",
    carburetors: "Karburátory",
    mechanics: "Mechanici",
    clothing: "Oblečení",
    vehicles: "Auta",
    accommodation: "Ubytování",
    flights: "Letenky",
    rentals: "Pronájem aut",
    service: "Servis",
    sales: "Prodej",
    inventory: "Sklad",
    documents: "Dokumenty",
    settings: "Nastavení",
    nextRace: "Příští závod",
    openRace: "Otevřít závod",
    actionCenter: "Úkoly a upozornění",
    overview: "Přehled vybavení",
    ready: "Připraveno",
    due: "Brzy servis",
    rebuild: "Přestavba",
    storage: "Sklad",
    total: "Celkem motorů",
    engineStatus: "Stav motorů",
    upcomingRaces: "Nadcházející závody",
    recent: "Poslední aktivita",
    completed: "Servis dokončen",
    assigned: "Přiřazen k závodu Laitse",
    checked: "Karburátor zkontrolován",
    driversCount: "Pilotů",
    enginesCount: "Motorů",
    carbsCount: "Karburátorů",
    viewAll: "Zobrazit vše",
    code: "Kód",
    model: "Model",
    driver: "Pilot",
    hours: "Hodiny",
    status: "Stav",
    newEngine: "Nový motor",
    addEngine: "Přidat motor",
    saveEngine: "Uložit motor",
    saveChanges: "Uložit změny",
    editEngine: "Upravit motor",
    edit: "Upravit",
    actions: "Akce",
    allEngines: "Všechny motory",
    includingOknJ: "včetně OKN-J",
    permanentFields: "Typ motoru, zapalování a generace KZ jsou trvalé údaje.",
    superadminFields: "Jako superadmin můžeš změnit i trvalé údaje motoru.",
    deleteEngine: "Smazat motor",
    deleting: "Mažu…",
    deleted: "Motor byl odstraněn.",
    backToEngines: "Zpět na motory",
    overviewTab: "Přehled",
    technicalTab: "Technické údaje",
    serviceCard: "Servisní karta",
    usageTab: "Motohodiny",
    historyTab: "Historie",
    documentsTab: "Dokumenty",
    engineInfo: "Informace o motoru",
    currentUsage: "Aktuální provoz",
    quickActions: "Rychlé akce",
    editTechnical: "Upravit technické údaje",
    saveTechnical: "Uložit technické údaje",
    technicalSaved: "Technické údaje byly uloženy.",
    addServiceEntry: "Přidat servisní záznam",
    logHours: "Zapsat motohodiny",
    notEntered: "Nevyplněno",
    notAssigned: "Nepřiřazeno",
    cancel: "Zrušit",
    brand: "Značka",
    category: "Kategorie",
    serialNumber: "Sériové číslo",
    interval: "Servisní interval (hodiny)",
    engineFamily: "Typ motoru",
    ignition: "Zapalování",
    kzGeneration: "Generace KZ",
    configuration: "Konfigurace",
    upgrade: "Úprava motoru",
    purchaseDate: "Datum nákupu",
    hoursTracking: "Evidence provozu",
    byHours: "Motohodiny",
    byRaces: "Závody a kalendář",
    notes: "Poznámky",
    emptyEngines: "Zatím nejsou uložené žádné motory.",
    emptyEnginesHelp: "Přidej první skutečný motor a systém ho bezpečně uloží.",
    loading: "Načítám data…",
    databaseError: "Databázi se nepodařilo načíst.",
    saved: "Motor byl uložen.",
    saving: "Ukládám…",
    firstVersion: "Tato část bude doplněna v další etapě.",
    raceMode: "Race Mode",
    superadmin: "SUPERADMIN",
  },
  en: {
    greeting: "Good morning, Martin",
    subtitle: "Here’s what’s happening with your team today.",
    quick: "Quick action",
    dashboard: "Dashboard",
    tasks: "Tasks",
    calendar: "Calendar",
    races: "Races",
    raceTypes: "Race types",
    circuits: "Circuits",
    teams: "Teams",
    customers: "Customers",
    drivers: "Drivers",
    engines: "Engines",
    carburetors: "Carburetors",
    mechanics: "Mechanics",
    clothing: "Clothing",
    vehicles: "Cars",
    accommodation: "Accommodation",
    flights: "Flights",
    rentals: "Car rental",
    service: "Service",
    sales: "Sales",
    inventory: "Inventory",
    documents: "Documents",
    settings: "Settings",
    nextRace: "Next race",
    openRace: "Open race",
    actionCenter: "Tasks & alerts",
    overview: "Equipment overview",
    ready: "Ready",
    due: "Service soon",
    rebuild: "Rebuild",
    storage: "Storage",
    total: "Total engines",
    engineStatus: "Engine status",
    upcomingRaces: "Upcoming races",
    recent: "Recent activity",
    completed: "Service completed",
    assigned: "Assigned to race Laitse",
    checked: "Carburetor checked",
    driversCount: "Drivers",
    enginesCount: "Engines",
    carbsCount: "Carburetors",
    viewAll: "View all",
    code: "Code",
    model: "Model",
    driver: "Driver",
    hours: "Hours",
    status: "Status",
    newEngine: "New engine",
    addEngine: "Add engine",
    saveEngine: "Save engine",
    saveChanges: "Save changes",
    editEngine: "Edit engine",
    edit: "Edit",
    actions: "Actions",
    allEngines: "All engines",
    includingOknJ: "including OKN-J",
    permanentFields: "Engine type, ignition and KZ generation are permanent fields.",
    superadminFields: "As superadmin, you can also change permanent engine fields.",
    deleteEngine: "Delete engine",
    deleting: "Deleting…",
    deleted: "Engine removed.",
    backToEngines: "Back to engines",
    overviewTab: "Overview",
    technicalTab: "Technical data",
    serviceCard: "Service card",
    usageTab: "Running hours",
    historyTab: "History",
    documentsTab: "Documents",
    engineInfo: "Engine information",
    currentUsage: "Current usage",
    quickActions: "Quick actions",
    editTechnical: "Edit technical data",
    saveTechnical: "Save technical data",
    technicalSaved: "Technical data saved.",
    addServiceEntry: "Add service entry",
    logHours: "Log running hours",
    notEntered: "Not entered",
    notAssigned: "Not assigned",
    cancel: "Cancel",
    brand: "Brand",
    category: "Category",
    serialNumber: "Serial number",
    interval: "Service interval (hours)",
    engineFamily: "Engine type",
    ignition: "Ignition",
    kzGeneration: "KZ generation",
    configuration: "Configuration",
    upgrade: "Engine upgrade",
    purchaseDate: "Purchase date",
    hoursTracking: "Usage tracking",
    byHours: "Running hours",
    byRaces: "Races and calendar",
    notes: "Notes",
    emptyEngines: "No engines have been saved yet.",
    emptyEnginesHelp: "Add the first real engine and the system will store it safely.",
    loading: "Loading data…",
    databaseError: "The database could not be loaded.",
    saved: "Engine saved.",
    saving: "Saving…",
    firstVersion: "This section will be added in the next stage.",
    raceMode: "Race Mode",
    superadmin: "SUPERADMIN",
  },
} as const;

const nav: Array<{ id: View; mark: string }> = [
  { id: "dashboard", mark: "▦" },
  { id: "tasks", mark: "✓" },
  { id: "calendar", mark: "▤" },
  { id: "races", mark: "⚑" },
  { id: "raceTypes", mark: "◈" },
  { id: "circuits", mark: "⌁" },
  { id: "drivers", mark: "◎" },
  { id: "teams", mark: "♙" },
  { id: "customers", mark: "♧" },
  { id: "engines", mark: "◫" },
  { id: "carburetors", mark: "◉" },
  { id: "mechanics", mark: "⌘" },
  { id: "clothing", mark: "▧" },
  { id: "vehicles", mark: "▰" },
  { id: "accommodation", mark: "⌂" },
  { id: "flights", mark: "✈" },
  { id: "rentals", mark: "▱" },
  { id: "service", mark: "◇" },
  { id: "sales", mark: "¤" },
  { id: "inventory", mark: "□" },
  { id: "documents", mark: "≡" },
  { id: "settings", mark: "⚙" },
];

const navGroups: Array<{ labelCs: string; labelEn: string; items: View[] }> = [
  { labelCs: "Provoz", labelEn: "Operations", items: ["dashboard", "tasks", "calendar"] },
  { labelCs: "Závody", labelEn: "Races", items: ["races", "raceTypes", "circuits"] },
  { labelCs: "Tým", labelEn: "Team", items: ["drivers", "teams", "customers", "mechanics", "clothing"] },
  { labelCs: "Vybavení", labelEn: "Equipment", items: ["engines", "carburetors", "vehicles", "service", "inventory"] },
  { labelCs: "Logistika", labelEn: "Logistics", items: ["accommodation", "flights", "rentals"] },
  { labelCs: "Obchod", labelEn: "Business", items: ["sales", "documents"] },
  { labelCs: "Nastavení", labelEn: "Settings", items: ["settings"] },
];

export default function Home() {
  const [locale, setLocale] = useState<Locale>("cs");
  const [view, setView] = useState<View>("dashboard");
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [engineRows, setEngineRows] = useState<EngineRecord[]>([]);
  const [technicalStructure, setTechnicalStructure] = useState<TechnicalStructureData>(EMPTY_TECHNICAL_STRUCTURE);
  const [technicalValues, setTechnicalValues] = useState<Record<string, Record<string, string>>>({});
  const [vehicleRows, setVehicleRows] = useState<VehicleRecord[]>([]);
  const [enginesLoading, setEnginesLoading] = useState(true);
  const [enginesError, setEnginesError] = useState(false);
  const [engineFormOpen, setEngineFormOpen] = useState(false);
  const [quickServiceOpen, setQuickServiceOpen] = useState(false);
  const [selectedEngine, setSelectedEngine] = useState<EngineRecord | null>(null);
  const [detailEngineId, setDetailEngineId] = useState<string | null>(null);
  const [notifiedVehicleId, setNotifiedVehicleId] = useState<string | null>(null);
  const [requestedRaceId, setRequestedRaceId] = useState<string | null>(null);
  const [raceDetailOpen, setRaceDetailOpen] = useState(false);
  const [catalogDetailOpen, setCatalogDetailOpen] = useState(false);
  useEffect(() => { setCatalogDetailOpen(false); }, [view]);
  const [currentHour, setCurrentHour] = useState<number | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [devUsers, setDevUsers] = useState<DevUser[]>([]);
  const [switchingDevUser, setSwitchingDevUser] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const t = copy[locale];
  const visibleNavGroups = useMemo(
    () => navGroups
      .map((group) => ({ ...group, items: group.items.filter((id) => id !== "settings" || session?.role === "superadmin") }))
      .filter((group) => group.items.length > 0),
    [session?.role],
  );
  const searchSectionResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return nav.filter((item) => item.id !== "settings" || session?.role === "superadmin").filter((item) => t[item.id].toLowerCase().includes(query)).slice(0, 8);
  }, [searchQuery, session?.role, t]);
  const searchEngineResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return engineRows.filter((engine) => engine.code.toLowerCase().includes(query)).slice(0, 5);
  }, [searchQuery, engineRows]);
  const searchVehicleResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return vehicleRows.filter((vehicle) => vehicle.name.toLowerCase().includes(query) || vehicle.licensePlate.toLowerCase().includes(query)).slice(0, 5);
  }, [searchQuery, vehicleRows]);
  const searchHasResults = searchSectionResults.length > 0 || searchEngineResults.length > 0 || searchVehicleResults.length > 0;
  const enginesNeedingService = useMemo(
    () => engineRows.filter((engine) => !isSold(engine.soldAt) && engine.status !== "retired" && (engine.status === "service_soon" || engine.status === "service")),
    [engineRows],
  );
  const vehiclesNeedingService = useMemo(
    () => vehicleRows.filter((vehicle) => vehicleServiceStatus(vehicle) === "due" || vehicleServiceStatus(vehicle) === "soon"),
    [vehicleRows],
  );

  useEffect(() => {
    const saved = window.localStorage.getItem("mm-locale");
    if (saved === "cs" || saved === "en") setLocale(saved);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("mm-theme");
    if (saved === "dark") setThemeMode("dark");
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-mode", themeMode);
    document.documentElement.style.colorScheme = themeMode;
    window.localStorage.setItem("mm-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (!profileMenuOpen || session?.authMode !== "development") return;
    let active = true;
    fetch("/api/dev-session", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("load failed")))
      .then((data: { users: DevUser[] }) => { if (active) setDevUsers(data.users); })
      .catch(() => { if (active) setDevUsers([]); });
    return () => { active = false; };
  }, [profileMenuOpen, session?.authMode]);

  useEffect(() => {
    window.localStorage.setItem("mm-locale", locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    setCurrentHour(new Date().getHours());
    const timer = window.setInterval(() => setCurrentHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadAppData() {
      try {
        const [sessionResponse, enginesResponse, catalogResponse] = await Promise.all([
          fetch("/api/session", { cache: "no-store" }),
          fetch("/api/engines", { cache: "no-store" }),
          fetch("/api/catalog", { cache: "no-store" }),
        ]);
        if (!sessionResponse.ok || !enginesResponse.ok || !catalogResponse.ok) throw new Error("load failed");
        const sessionData = (await sessionResponse.json()) as { user: AppSession };
        const enginesData = (await enginesResponse.json()) as { engines: EngineRecord[]; technicalStructure?: TechnicalStructureData; technicalValues?: Record<string, Record<string, string>> };
        const catalogData = (await catalogResponse.json()) as { vehicles: VehicleRecord[] };
        if (!active) return;
        setSession(sessionData.user);
        setEngineRows(enginesData.engines);
        setTechnicalStructure(enginesData.technicalStructure ?? EMPTY_TECHNICAL_STRUCTURE);
        setTechnicalValues(enginesData.technicalValues ?? {});
        setVehicleRows(catalogData.vehicles);
        setEnginesError(false);
      } catch {
        if (active) setEnginesError(true);
      } finally {
        if (active) setEnginesLoading(false);
      }
    }

    void loadAppData();
    return () => { active = false; };
  }, []);

  const title = useMemo(() => t[view], [t, view]);
  const detailEngine = useMemo(() => engineRows.find((engine) => engine.id === detailEngineId) ?? null, [engineRows, detailEngineId]);

  function showNotice(message: string) {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => { noticeTimer.current = null; setNotice(null); }, 2400);
  }

  function signOut() {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      setProfileMenuOpen(false);
      showNotice(locale === "cs" ? "Odhlášení bude aktivní po publikování webu." : "Sign-out will be active after the site is published.");
      return;
    }
    window.location.assign("/signout-with-chatgpt?return_to=%2F");
  }

  async function switchDevUser(userId: string) {
    if (!userId || userId === session?.id) return;
    setSwitchingDevUser(true);
    try {
      const response = await fetch("/api/dev-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) throw new Error("switch failed");
      window.location.reload();
    } catch {
      setSwitchingDevUser(false);
      showNotice(locale === "cs" ? "Uživatele se nepodařilo přepnout." : "The user could not be switched.");
    }
  }

  function syncEngine(engine: EngineRecord) {
    setEngineRows((current) => {
      const exists = current.some((item) => item.id === engine.id);
      const next = exists ? current.map((item) => item.id === engine.id ? { ...item, ...engine } : item) : [...current, engine];
      return next.sort((a, b) => a.code.localeCompare(b.code));
    });
  }

  function mergeTechnicalValues(engineId: string, values: Record<string, string>) {
    if (!Object.keys(values).length) return;
    setTechnicalValues((current) => ({ ...current, [engineId]: { ...current[engineId], ...values } }));
  }

  function handleEngineSaved(engine: EngineRecord) {
    syncEngine(engine);
    setEngineFormOpen(false);
    setSelectedEngine(null);
    showNotice(t.saved);
  }

  function openNewEngine() {
    setSelectedEngine(null);
    setEngineFormOpen(true);
  }

  function openEngineEdit(engine: EngineRecord) {
    setSelectedEngine(engine);
    setEngineFormOpen(true);
  }

  function handleEngineDeleted(engineId: string) {
    setEngineRows((current) => current.filter((engine) => engine.id !== engineId));
    setEngineFormOpen(false);
    setSelectedEngine(null);
    if (detailEngineId === engineId) setDetailEngineId(null);
    showNotice(t.deleted);
  }

  return (
    <main className="app-shell">
      <a className="skip-link" href="#main-content">{locale === "cs" ? "Přeskočit na obsah" : "Skip to content"}</a>
      <div className="sidebar-backdrop" hidden={!sidebarOpen} onClick={() => setSidebarOpen(false)} />

      <aside className={sidebarOpen ? "sidebar open" : "sidebar"}>
        <div className="brand" aria-label="Macháč Motors">
          <img className="brand-logo" src="/machac-motors-logo.jpg" alt="Macháč Motors" />
          <button className="sidebar-close" type="button" aria-label={locale === "cs" ? "Zavřít menu" : "Close menu"} onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

        <nav className="nav" aria-label={locale === "cs" ? "Hlavní navigace" : "Main navigation"}>
          {visibleNavGroups.map((group) => (
            <div className="nav-group" key={group.labelCs}>
              <div className="nav-group-label">{locale === "cs" ? group.labelCs : group.labelEn}</div>
              {group.items.map((id) => {
                const item = nav.find((entry) => entry.id === id)!;
                return (
                  <button
                    key={item.id}
                    className={view === item.id ? "nav-item active" : "nav-item"}
                    onClick={() => { setView(item.id); setSidebarOpen(false); if (item.id !== "engines") setDetailEngineId(null); if (item.id === "races") setRequestedRaceId(null); }}
                    type="button"
                  >
                    <span className="nav-mark" aria-hidden="true">{item.mark}</span>
                    <span>{t[item.id]}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <button className="race-mode" type="button" onClick={() => showNotice("Race Mode bude následovat po modulech Motory a Závody.")}>
          <span className="live-dot" />
          {t.raceMode}
        </button>

        <div className="theme-row">
          <div className="theme-toggle">
            <button className={themeMode === "dark" ? "theme-btn active" : "theme-btn"} type="button" onClick={() => setThemeMode("dark")}>☽ {locale === "cs" ? "Tmavý" : "Dark"}</button>
            <button className={themeMode === "light" ? "theme-btn active" : "theme-btn"} type="button" onClick={() => setThemeMode("light")}>☀ {locale === "cs" ? "Světlý" : "Light"}</button>
          </div>
        </div>

        <div className="profile-wrap">
          <button className="profile" type="button" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)}>
            <span className="avatar">{profileInitials(session?.fullName ?? "Martin Prokop")}</span>
            <span><strong>{session?.fullName ?? "Martin Prokop"}</strong><small>{session?.role.toUpperCase() ?? t.superadmin}</small></span>
            <span className="profile-more" aria-hidden="true">{profileMenuOpen ? "⌃" : "⌄"}</span>
          </button>
          {profileMenuOpen && (
            <div className="profile-menu">
              <div className="profile-menu-identity"><small>{locale === "cs" ? "Přihlášený účet" : "Signed-in account"}</small><strong>{session?.email ?? "martin@local.mm"}</strong></div>
              <div className="profile-auth-method"><span aria-hidden="true">✓</span><small>{session?.authMode === "development" ? (locale === "cs" ? "Lokální testovací režim" : "Local test mode") : (locale === "cs" ? "Přihlášení přes ChatGPT" : "Signed in with ChatGPT")}</small></div>
              {session?.authMode === "development" && (
                <label className="profile-dev-switch">
                  <span>{locale === "cs" ? "Testovat jako" : "Test as"}<small>LOCALHOST</small></span>
                  <select value={session.id} disabled={switchingDevUser || devUsers.length === 0} onChange={(event) => void switchDevUser(event.target.value)}>
                    {devUsers.length === 0 && <option value={session.id}>{session.fullName}</option>}
                    {devUsers.map((user) => <option value={user.id} key={user.id}>{user.fullName} · {user.role}</option>)}
                  </select>
                </label>
              )}
              {session?.role === "superadmin" && <button type="button" onClick={() => { setView("settings"); setProfileMenuOpen(false); }}>{locale === "cs" ? "Nastavení přístupů" : "Access settings"}</button>}
              <button className="profile-signout" type="button" onClick={signOut}>{locale === "cs" ? "Odhlásit se" : "Sign out"}</button>
            </div>
          )}
        </div>
      </aside>

      <section id="main-content" tabIndex={-1} className={view === "dashboard" || view === "calendar" || view === "races" ? "workspace wrc-scope" : "workspace"}>
        <div className="util-bar">
          <button className="hamburger-btn" type="button" aria-label={locale === "cs" ? "Otevřít menu" : "Open menu"} onClick={() => setSidebarOpen(true)}>☰</button>
          <label className="util-search">
            <span aria-hidden="true">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onBlur={() => window.setTimeout(() => setSearchQuery(""), 150)}
              placeholder={locale === "cs" ? "Hledat sekci…" : "Search a section…"}
              aria-label={locale === "cs" ? "Hledat sekci nebo záznam" : "Search a section or record"}
            />
            {searchQuery.trim() && (
              <div className="util-search-results">
                {!searchHasResults && <EmptyState size="compact" variant="filtered" title={locale === "cs" ? "Nic nenalezeno" : "Nothing found"} />}
                {(searchEngineResults.length > 0 || searchVehicleResults.length > 0) && (
                  <div className="util-search-group">
                    <small>{locale === "cs" ? "Nalezené záznamy" : "Matching records"}</small>
                    {searchEngineResults.map((engine) => (
                      <button key={engine.id} type="button" onMouseDown={() => { setView("engines"); setDetailEngineId(engine.id); setSearchQuery(""); }}>
                        <span aria-hidden="true">◫</span>{engine.code}
                      </button>
                    ))}
                    {searchVehicleResults.map((vehicle) => (
                      <button key={vehicle.id} type="button" onMouseDown={() => { setView("vehicles"); setNotifiedVehicleId(vehicle.id); setSearchQuery(""); }}>
                        <span aria-hidden="true">▰</span>{vehicle.name}{vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}
                      </button>
                    ))}
                  </div>
                )}
                {searchSectionResults.length > 0 && (
                  <div className="util-search-group">
                    <small>{locale === "cs" ? "Sekce" : "Sections"}</small>
                    {searchSectionResults.map((item) => (
                      <button key={item.id} type="button" onMouseDown={() => { setView(item.id); setSearchQuery(""); if (item.id !== "engines") setDetailEngineId(null); }}>
                        <span aria-hidden="true">{item.mark}</span>{t[item.id]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </label>
          <div className="util-right">
            <div className="util-lang" aria-label={locale === "cs" ? "Jazyk" : "Language"}>
              <button className={locale === "cs" ? "selected" : ""} onClick={() => setLocale("cs")} type="button">CZ</button>
              <button className={locale === "en" ? "selected" : ""} onClick={() => setLocale("en")} type="button">EN</button>
            </div>
            <div className="util-bell-wrap">
              <button className="util-bell" type="button" onClick={() => setNotifOpen((open) => !open)} aria-expanded={notifOpen}>
                🔔{(enginesNeedingService.length + vehiclesNeedingService.length) > 0 && <span className="notif-count">{enginesNeedingService.length + vehiclesNeedingService.length}</span>}
              </button>
              {notifOpen && (
                <div className="notif-panel">
                  <header><strong>{locale === "cs" ? "Upozornění" : "Notifications"}</strong></header>
                  {enginesNeedingService.length === 0 && vehiclesNeedingService.length === 0 && <EmptyState size="compact" title={locale === "cs" ? "Žádná upozornění" : "Nothing to flag"} />}
                  {enginesNeedingService.slice(0, 6).map((engine) => (
                    <button key={engine.id} type="button" className="notif-row" onClick={() => { setView("engines"); setDetailEngineId(engine.id); setNotifOpen(false); }}>
                      <i />
                      <div>
                        <strong>{locale === "cs" ? `Motor ${engine.code} potřebuje servis` : `Engine ${engine.code} needs service`}</strong>
                        <small>{engine.family}</small>
                      </div>
                    </button>
                  ))}
                  {vehiclesNeedingService.slice(0, 6).map((vehicle) => (
                    <button key={vehicle.id} type="button" className="notif-row" onClick={() => { setView("vehicles"); setNotifiedVehicleId(vehicle.id); setNotifOpen(false); }}>
                      <i />
                      <div>
                        <strong>{locale === "cs" ? `Auto ${vehicle.name} potřebuje servis` : `Vehicle ${vehicle.name} needs service`}</strong>
                        <small>{vehicle.licensePlate || (locale === "cs" ? "Bez SPZ" : "No plate")}</small>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {!(view === "races" && raceDetailOpen) && !(CATALOG_BACKED_VIEWS.includes(view) && catalogDetailOpen) && !(view === "engines" && detailEngine) && <header className="topbar">
          {view === "dashboard" ? (
            <div>
              <div className="eyebrow"><span className="streak"><i /><i /><i /></span>{locale === "cs" ? `Sezóna ${new Date().getFullYear()}` : `Season ${new Date().getFullYear()}`}</div>
              <h1>{timeGreeting(locale, session?.fullName ?? "Martin Prokop", currentHour ?? 8)}</h1>
              <p>{t.subtitle}</p>
            </div>
          ) : VIEWS_WITH_OWN_HERO.includes(view) ? <div /> : (
            <div>
              <h1>{title}</h1>
              <p>{locale === "cs" ? "Centrální správa Macháč Motors" : "Macháč Motors central management"}</p>
            </div>
          )}
          <div className="topbar-actions">
            <button className="topbar-cta" type="button" onClick={() => setQuickServiceOpen(true)}>＋ {t.quick}</button>
          </div>
        </header>}
        {quickServiceOpen && <QuickServiceForm locale={locale} onClose={() => setQuickServiceOpen(false)} onSaved={() => { setQuickServiceOpen(false); showNotice(locale === "cs" ? "Servis byl zapsán." : "Service logged."); }} />}

        {view === "dashboard" && <Dashboard
          locale={locale}
          engines={engineRows}
          showNotice={showNotice}
          onOpenView={(nextView) => { setView(nextView); if (nextView !== "engines") setDetailEngineId(null); if (nextView === "races") setRequestedRaceId(null); }}
          onOpenRace={(raceId) => { setRequestedRaceId(raceId); setView("races"); setDetailEngineId(null); }}
        />}
        {view === "tasks" && <TaskPage locale={locale} role={session?.role ?? "mechanic"} currentUser={session?.fullName ?? "Martin Prokop"} />}
        {view === "engines" && !detailEngine && (
          <Engines
            locale={locale}
            engines={engineRows}
            loading={enginesLoading}
            error={enginesError}
            canManage={session ? session.role !== "mechanic" : false}
            role={session?.role ?? "mechanic"}
            onAdd={openNewEngine}
            onEdit={openEngineEdit}
            onOpen={(engine) => setDetailEngineId(engine.id)}
          />
        )}
        {view === "engines" && detailEngine && (
          <EngineDetail
            locale={locale}
            engine={detailEngine}
            technicalStructure={technicalStructure}
            technicalValues={technicalValues[detailEngine.id] ?? {}}
            onTechnicalValuesSaved={mergeTechnicalValues}
            canManage={session ? session.role !== "mechanic" : false}
            role={session?.role ?? "mechanic"}
            currentUserName={session?.fullName ?? ""}
            onBack={() => setDetailEngineId(null)}
            onEdit={() => openEngineEdit(detailEngine)}
            onSaved={syncEngine}
            showNotice={showNotice}
          />
        )}
        {view === "races" && <RacePage locale={locale} role={session?.role ?? "mechanic"} openRaceId={requestedRaceId} onDetailOpenChange={setRaceDetailOpen} />}
        {view === "calendar" && <CalendarPage locale={locale} onOpenRace={(raceId) => { setRequestedRaceId(raceId); setView("races"); setDetailEngineId(null); }} />}
        {view === "raceTypes" && <CatalogPage kind="raceType" locale={locale} role={session?.role ?? "mechanic"} onDetailOpenChange={setCatalogDetailOpen} />}
        {view === "circuits" && <CircuitsPage locale={locale} role={session?.role ?? "mechanic"} />}
        {view === "teams" && <CatalogPage kind="team" locale={locale} role={session?.role ?? "mechanic"} onDetailOpenChange={setCatalogDetailOpen} />}
        {view === "customers" && <CustomersPage locale={locale} role={session?.role ?? "mechanic"} />}
        {view === "drivers" && <CatalogPage kind="driver" locale={locale} role={session?.role ?? "mechanic"} onDetailOpenChange={setCatalogDetailOpen} />}
        {view === "carburetors" && <CatalogPage kind="carburetor" locale={locale} role={session?.role ?? "mechanic"} onDetailOpenChange={setCatalogDetailOpen} />}
        {view === "mechanics" && <CatalogPage kind="mechanic" locale={locale} role={session?.role ?? "mechanic"} onDetailOpenChange={setCatalogDetailOpen} />}
        {view === "clothing" && <ClothingPage locale={locale} role={session?.role ?? "mechanic"} />}
        {view === "vehicles" && <CatalogPage kind="vehicle" locale={locale} role={session?.role ?? "mechanic"} initialVehicleId={notifiedVehicleId} onInitialVehicleIdConsumed={() => setNotifiedVehicleId(null)} onDetailOpenChange={setCatalogDetailOpen} />}
        {view === "accommodation" && <LogisticsPage kind="accommodation" locale={locale} role={session?.role ?? "mechanic"} />}
        {view === "flights" && <LogisticsPage kind="flight" locale={locale} role={session?.role ?? "mechanic"} />}
        {view === "rentals" && <LogisticsPage kind="rental" locale={locale} role={session?.role ?? "mechanic"} />}
        {view === "service" && <ServiceCatalogPage locale={locale} role={session?.role ?? "mechanic"} />}
        {view === "sales" && <SalesPage locale={locale} role={session?.role ?? "mechanic"} />}
        {view === "inventory" && <InventoryPage locale={locale} role={session?.role ?? "mechanic"} />}
        {view === "documents" && <ChecklistsPage locale={locale} role={session?.role ?? "mechanic"} />}
        {view === "settings" && session && (
          <SettingsPage
            locale={locale}
            role={session.role}
            sessionUserId={session.id}
            onCurrentUserUpdated={(user) => setSession((current) => current ? { ...current, ...user } : current)}
          />
        )}
        {view !== "dashboard" && !VIEWS_WITH_OWN_HERO.includes(view) && (
          <section className="placeholder-panel">
            <span className="placeholder-mark">{nav.find((item) => item.id === view)?.mark}</span>
            <h2>{title}</h2>
            <p>{t.firstVersion}</p>
          </section>
        )}
      </section>

      <nav className="mobile-nav" aria-label={locale === "cs" ? "Mobilní navigace" : "Mobile navigation"}>
        {nav.slice(0, 4).map((item) => (
          <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); if (item.id !== "engines") setDetailEngineId(null); }} type="button">
            <span aria-hidden="true">{item.mark}</span>
            <small>{t[item.id]}</small>
          </button>
        ))}
        <button type="button" onClick={() => setSidebarOpen(true)}>
          <span aria-hidden="true">☰</span>
          <small>{locale === "cs" ? "Více" : "More"}</small>
        </button>
      </nav>

      {notice && <div className="toast" role="status">{notice}</div>}
      {engineFormOpen && (
        <EngineForm
          key={selectedEngine?.id ?? "new-engine"}
          locale={locale}
          engine={selectedEngine}
          role={session?.role ?? "mechanic"}
          onClose={() => { setEngineFormOpen(false); setSelectedEngine(null); }}
          onSaved={handleEngineSaved}
          onDeleted={handleEngineDeleted}
        />
      )}
    </main>
  );
}

function QuickServiceForm({ locale, onClose, onSaved }: { locale: Locale; onClose: () => void; onSaved: () => void }) {
  const dialogRef = useModalA11y(onClose);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [mechanics, setMechanics] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [vehicleId, setVehicleId] = useState("");
  const [serviceDate, setServiceDate] = useState(todayInputValue);
  const [km, setKm] = useState("");
  const [note, setNote] = useState("");
  const [mechanicId, setMechanicId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/catalog", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { vehicles?: VehicleRecord[]; mechanics?: Array<{ id: string; name: string }> }) => {
        if (!active) return;
        const list = result.vehicles ?? [];
        setVehicles(list);
        setVehicleId(list[0]?.id ?? "");
        setMechanics(result.mechanics ?? []);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vehicleId) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/vehicle-service-entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vehicleId, serviceDate, km, workDone: note, mechanicId }),
      });
      const result = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error || "Save failed");
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal" role="dialog" aria-modal="true" aria-labelledby="quick-service-form-title" tabIndex={-1}>
      <div className="modal-header"><div><span className="eyebrow">MM DIRECTORY</span><h2 id="quick-service-form-title">{locale === "cs" ? "Zápis servisu auta" : "Log vehicle service"}</h2></div><button className="close-button" type="button" onClick={onClose} aria-label={locale === "cs" ? "Zavřít" : "Close"}>×</button></div>
      {loading ? <LoadingState /> : !vehicles.length ? <p className="form-error">{locale === "cs" ? "Nejdřív přidej auto v katalogu." : "Add a vehicle to the catalog first."}</p> : <form onSubmit={submit}>
        <div className="form-grid">
          <label className="full-field"><span>{locale === "cs" ? "Auto" : "Vehicle"} *</span><select value={vehicleId} required onChange={(event) => setVehicleId(event.target.value)}>{vehicles.map((item) => <option key={item.id} value={item.id}>{item.name}{item.licensePlate ? ` · ${item.licensePlate}` : ""}</option>)}</select></label>
          <label><span>{locale === "cs" ? "Datum servisu" : "Service date"} *</span><input type="date" value={serviceDate} required onChange={(event) => setServiceDate(event.target.value)} /></label>
          <label><span>{locale === "cs" ? "Nájezd při servisu (km)" : "Mileage at service (km)"}</span><input type="number" min={0} step={1} value={km} onChange={(event) => setKm(event.target.value)} /></label>
          <label className="full-field"><span>{locale === "cs" ? "Mechanik" : "Mechanic"}</span><select value={mechanicId} onChange={(event) => setMechanicId(event.target.value)}><option value="">{locale === "cs" ? "Nevybráno" : "Not selected"}</option>{mechanics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="full-field"><span>{locale === "cs" ? "Co bylo provedeno" : "What was done"}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder={locale === "cs" ? "Výměna oleje, brzdové destičky…" : "Oil change, brake pads…"} /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><span className="modal-actions-spacer" /><button className="secondary-compact" type="button" onClick={onClose}>{locale === "cs" ? "Zrušit" : "Cancel"}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? (locale === "cs" ? "Ukládám…" : "Saving…") : (locale === "cs" ? "Uložit servis" : "Save service")}</button></div>
      </form>}
    </section>
  </div>;
}

function isSold(soldAt: number | null | undefined) {
  return typeof soldAt === "number" && soldAt <= Date.now();
}

function profileInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "U"}${parts.length > 1 ? parts.at(-1)?.[0] ?? "" : ""}`.toUpperCase();
}

function Dashboard({ locale, engines, showNotice, onOpenView, onOpenRace }: { locale: Locale; engines: EngineRecord[]; showNotice: (message: string) => void; onOpenView: (view: View) => void; onOpenRace: (raceId: string) => void }) {
  const t = copy[locale];
  const [dashboardRaces, setDashboardRaces] = useState<DashboardRace[]>([]);
  const [catalog, setCatalog] = useState<DashboardCatalog>({ drivers: [], carburetors: [], vehicles: [] });
  const [dashboardTasks, setDashboardTasks] = useState<WorkItem[]>([]);
  const [dashboardActivity, setDashboardActivity] = useState<ActivityRecord[]>([]);
  const [inventoryCount, setInventoryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<EngineFilter>("MINI");

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      try {
        const [racesResponse, catalogResponse, tasksResponse, activityResponse, inventoryResponse] = await Promise.all([
          fetch("/api/races", { cache: "no-store" }),
          fetch("/api/catalog", { cache: "no-store" }),
          fetch("/api/tasks", { cache: "no-store" }),
          fetch("/api/activity", { cache: "no-store" }),
          fetch("/api/inventory", { cache: "no-store" }),
        ]);
        if (!racesResponse.ok || !catalogResponse.ok || !tasksResponse.ok || !activityResponse.ok || !inventoryResponse.ok) throw new Error("Dashboard load failed");
        const raceData = (await racesResponse.json()) as { races: DashboardRace[] };
        const catalogData = (await catalogResponse.json()) as DashboardCatalog;
        const taskData = (await tasksResponse.json()) as { tasks: WorkItem[] };
        const activityData = (await activityResponse.json()) as { activity: ActivityRecord[] };
        const inventoryData = (await inventoryResponse.json()) as { parts: unknown[] };
        if (!active) return;
        setDashboardRaces(raceData.races);
        setCatalog(catalogData);
        setDashboardTasks(taskData.tasks);
        setDashboardActivity(activityData.activity);
        setInventoryCount(inventoryData.parts.length);
      } catch {
        if (active) showNotice(locale === "cs" ? "Dashboard se nepodařilo aktualizovat." : "Dashboard could not be refreshed.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadDashboard();
    return () => { active = false; };
  }, [locale]);

  const today = localIsoDate(new Date());
  const upcoming = dashboardRaces
    .filter((race) => race.status !== "completed" && race.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const nextRace = upcoming[0] ?? null;
  // Races overlapping the nearest one's date window — a team fielding drivers across
  // categories often has several races the same weekend; show all of them, not just one.
  const raceGroup = nextRace ? upcoming.filter((race) => race.startDate <= nextRace.endDate && race.endDate >= nextRace.startDate) : [];
  const seasonOrder = [...dashboardRaces].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const raceRoundNumber = new Map(seasonOrder.map((race, index) => [race.id, index + 1]));
  const ownedEngines = engines.filter((engine) => !isSold(engine.soldAt) && engine.status !== "retired");
  const ownedCarburetors = catalog.carburetors.filter((carburetor) => !isSold(carburetor.soldAt) && carburetor.status !== "retired");
  const vehiclesNeedingService = catalog.vehicles.filter((vehicle) => vehicleServiceStatus(vehicle) === "due" || vehicleServiceStatus(vehicle) === "soon");
  const engineStats = {
    ready: ownedEngines.filter((engine) => engine.status === "ready").length,
    due: ownedEngines.filter((engine) => engine.status === "service_soon" || engine.status === "service").length,
    rebuild: ownedEngines.filter((engine) => engine.status === "rebuild").length,
    storage: ownedEngines.filter((engine) => engine.status === "storage").length,
  };
  const serviceCount = engineStats.due + engineStats.rebuild;
  const now = localIsoMinute(new Date());
  const activeTasks = dashboardTasks.filter((task) => task.status !== "done");
  const overdueTasks = activeTasks.filter((task) => Boolean(task.dueAt && task.dueAt < now));
  const nextTask = [...activeTasks].sort((a, b) => {
    if (!a.dueAt && !b.dueAt) return b.updatedAt - a.updatedAt;
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return a.dueAt.localeCompare(b.dueAt);
  })[0];
  const fleetCategories: Array<{ id: EngineFilter; label: string }> = [
    { id: "ALL", label: locale === "cs" ? "Všechny" : "All" },
    { id: "MINI", label: "MINI" }, { id: "OKJ", label: "OKJ" }, { id: "OKN", label: "OKN" }, { id: "OK", label: "OK" }, { id: "KZ", label: "KZ" },
  ];
  const fleetRows = fleetCategories.map((category) => {
    const rows = category.id === "ALL" ? ownedEngines : ownedEngines.filter((engine) => (engine.family === "OKN-J" ? "OKN" : engine.family) === category.id);
    const stats = {
      ready: rows.filter((engine) => engine.status === "ready").length,
      due: rows.filter((engine) => engine.status === "service_soon" || engine.status === "service").length,
      rebuild: rows.filter((engine) => engine.status === "rebuild").length,
      storage: rows.filter((engine) => engine.status === "storage").length,
    };
    return { category, total: rows.length, stats };
  });
  const fleetGrandTotal = ownedEngines.length;
  const seasonRows = [...dashboardRaces].sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 8);

  const categoryEngines = ownedEngines.filter((engine) => (selectedCategory === "ALL" ? true : (engine.family === "OKN-J" ? "OKN" : engine.family) === selectedCategory));
  const categoryLabel = fleetCategories.find((category) => category.id === selectedCategory)?.label ?? selectedCategory;

  return (
    <div className="dashboard-grid">
      <div className="section-head">
        <h2>
          <span className="streak"><i /><i /><i /></span>
          {raceGroup.length > 1 ? (locale === "cs" ? `Tento víkend — ${formatCount(raceGroup.length, "cs", RACE_FORMS)} souběžně` : `This weekend — ${raceGroup.length} races at once`) : t.nextRace}
        </h2>
        <a onClick={() => onOpenView("races")}>{locale === "cs" ? "Celý kalendář" : "Full calendar"}</a>
      </div>
      <div>
        {loading ? <LoadingState size="inline" label={t.loading} /> : raceGroup.length === 0 ? (
          <EmptyState
            size="inline"
            title={locale === "cs" ? "Žádný nadcházející závod" : "No upcoming race"}
            action={<button className="topbar-cta" type="button" onClick={() => onOpenView("races")}>{locale === "cs" ? "Přejít na závody" : "Open races"} →</button>}
          />
        ) : (
          <div className="race-grid">
            {raceGroup.map((race) => {
              const raceIssues = engines.filter((engine) => !isSold(engine.soldAt) && engine.status !== "retired" && engine.assignedRace === race.name && (engine.status === "service_soon" || engine.status === "service"));
              return (
                <div className="race-mini" key={race.id}>
                  <span className="race-watermark" style={{ color: raceWatermarkColor(race.id) }} aria-hidden="true">{raceWatermarkCode(race.name)}</span>
                  <div className="race-mini-head">
                    <RaceLogoBadge logoUrl={race.logoUrl} name={race.name} fallback={countryFlag(race.countryCode)} size="small" />
                    <span className="race-flag">{countryFlag(race.countryCode)}</span>
                    <span className="race-mini-round">{raceCountdown(race, today, locale)}</span>
                  </div>
                  <h3>{race.name}</h3>
                  <p className="race-mini-meta">{dashboardDateRange(race.startDate, race.endDate, locale)} · {race.track}</p>
                  {raceIssues[0] && (
                    <div className="race-mini-readiness">
                      ⚠ {locale === "cs" ? `Motor ${raceIssues[0].code} potřebuje servis` : `Engine ${raceIssues[0].code} needs service`}
                      <a onClick={() => onOpenView("engines")}>{locale === "cs" ? "Vyřešit" : "Resolve"}</a>
                    </div>
                  )}
                  <div className="race-mini-stats">
                    <div><span className="n">{race.driverCount}</span><span className="l">{t.driversCount}</span></div>
                    <div><span className="n">{race.engineCount}</span><span className="l">{t.enginesCount}</span></div>
                    <div><span className="n">{race.carburetorCount}</span><span className="l">{t.carbsCount}</span></div>
                  </div>
                  <button className="topbar-cta" type="button" onClick={() => onOpenRace(race.id)}>{t.openRace} →</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="info-grid">
        <section className="dash-panel">
          <h3>{t.actionCenter}</h3>
          <button type="button" className="alert-row" onClick={() => onOpenView("engines")}><span className="alert-dot critical" /><span>{engineServiceLabel(serviceCount, locale)}</span><b>›</b></button>
          <button type="button" className="alert-row" onClick={() => onOpenView("carburetors")}><span className="alert-dot warning" /><span>{carburetorServiceLabel(ownedCarburetors.filter((item) => item.status === "service").length, locale)}</span><b>›</b></button>
          {vehiclesNeedingService.length > 0 && <button type="button" className="alert-row" onClick={() => onOpenView("vehicles")}><span className={`alert-dot ${vehiclesNeedingService.some((vehicle) => vehicleServiceStatus(vehicle) === "due") ? "critical" : "warning"}`} /><span>{vehiclesNeedingServiceLabel(vehiclesNeedingService.length, locale)}</span><b>›</b></button>}
          <button type="button" className="alert-row" onClick={() => onOpenView("tasks")}><span className={`alert-dot ${overdueTasks.length ? "critical" : "info"}`} /><span>{overdueTasks.length ? overdueTasksLabel(overdueTasks.length, locale) : openTasksLabel(activeTasks.length, locale)}</span><b>›</b></button>
          {nextTask && <button type="button" className="alert-row" onClick={() => onOpenView("tasks")}><span className="alert-dot info" /><span>{nextTask.title}</span><b>›</b></button>}
        </section>

        <section className="dash-panel">
          <h3>{t.recent}</h3>
          {dashboardActivity.slice(0, 3).map((item) => (
            <div className="act-row" key={item.id}>
              <span className="act-avatar">{item.actorName.slice(0, 2).toUpperCase()}</span>
              <div><b>{item.actorName}</b> {activityDescription(item, locale)}<small>{relativeActivityTime(item.createdAt, locale)}</small></div>
            </div>
          ))}
          {!loading && dashboardActivity.length === 0 && <EmptyState size="compact" title={locale === "cs" ? "Zatím nebyla zaznamenána žádná aktivita." : "No activity has been recorded yet."} />}
        </section>
      </div>

      <div>
        <div className="section-head"><h2><span className="streak"><i /><i /><i /></span>{t.upcomingRaces}</h2><a onClick={() => onOpenView("races")}>{locale === "cs" ? "Celý kalendář" : "Full calendar"}</a></div>
        {upcoming.length > 0 ? (
          <div className="season">
            {upcoming.slice(0, 8).map((race) => (
              <button className={race.id === nextRace?.id ? "round-card next" : "round-card"} type="button" key={race.id} onClick={() => onOpenRace(race.id)}>
                <span className="race-watermark" style={{ color: raceWatermarkColor(race.id) }} aria-hidden="true">{raceWatermarkCode(race.name)}</span>
                <div className="round-card-head">
                  <RaceLogoBadge logoUrl={race.logoUrl} name={race.name} fallback={countryFlag(race.countryCode)} size="small" />
                  <span className="round-tag">{locale === "cs" ? "Kolo" : "Round"} {raceRoundNumber.get(race.id) ?? "—"}</span>
                  <span className="round-flag-inline">{countryFlag(race.countryCode)}</span>
                </div>
                <div className="round-name">{race.name}</div>
                <div className="round-date">{dashboardDateRange(race.startDate, race.endDate, locale)} · {race.track}</div>
                <div className="round-in">{raceCountdown(race, today, locale)}</div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState size="compact" title={locale === "cs" ? "Žádný nadcházející závod." : "No upcoming races."} />
        )}
      </div>

      <div className="stats-panel">
        <div className="stats-grid">
          <button className="stat-cell c-blue" type="button" onClick={() => onOpenView("drivers")}><span className="n">{catalog.drivers.filter((driver) => driver.isActive).length}</span><span className="l">{t.driversCount}</span></button>
          <button className="stat-cell c-green" type="button" onClick={() => onOpenView("engines")}><span className="n">{ownedEngines.length}</span><span className="l">{t.enginesCount}</span></button>
          <button className="stat-cell c-red" type="button" onClick={() => onOpenView("races")}><span className="n">{dashboardRaces.length}</span><span className="l">{t.races}</span></button>
          <button className="stat-cell c-amber" type="button" onClick={() => onOpenView("service")}><span className="n">{serviceCount}</span><span className="l">{t.service}</span></button>
          <button className="stat-cell" type="button" onClick={() => onOpenView("inventory")}><span className="n">{inventoryCount}</span><span className="l">{locale === "cs" ? "Položek skladu" : "Inventory items"}</span></button>
        </div>
      </div>

      <div>
        <div className="section-head"><h2><span className="streak"><i /><i /><i /></span>{locale === "cs" ? "Sezóna — přehled závodů" : "Season — race overview"}</h2><a onClick={() => onOpenView("races")}>{locale === "cs" ? "Celá sezóna" : "Full season"}</a></div>
        {seasonRows.length > 0 ? (
          <div className="results-panel">
            <table className="results">
              <thead><tr><th>{locale === "cs" ? "Kolo" : "Round"}</th><th>{locale === "cs" ? "Závod" : "Race"}</th><th>{locale === "cs" ? "Datum" : "Date"}</th><th>{t.status}</th><th className="num-col">{t.driversCount}</th><th className="num-col">{t.enginesCount}</th><th className="num-col">{t.carbsCount}</th><th /></tr></thead>
              <tbody>
                {seasonRows.map((race) => (
                  <tr key={race.id}>
                    <td className="r-round num">{raceRoundNumber.get(race.id) ?? "—"}</td>
                    <td className="r-name"><RaceLogoBadge logoUrl={race.logoUrl} name={race.name} fallback={countryFlag(race.countryCode)} size="small" /><span>{countryFlag(race.countryCode)} {race.name}<small>{race.track}</small></span></td>
                    <td>{dashboardDateRange(race.startDate, race.endDate, locale)}</td>
                    <td><span className={`r-status ${race.status === "completed" ? "done" : race.id === nextRace?.id ? "next" : "upcoming"}`}>{race.status === "completed" ? (locale === "cs" ? "Dokončeno" : "Done") : raceCountdown(race, today, locale)}</span></td>
                    <td className="num-col">{race.driverCount}</td>
                    <td className="num-col">{race.engineCount}</td>
                    <td className="num-col">{race.carburetorCount}</td>
                    <td><button type="button" className="r-link" onClick={() => onOpenRace(race.id)}>{locale === "cs" ? "Otevřít" : "Open"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState size="compact" title={locale === "cs" ? "V sezóně zatím není žádný závod." : "No races in the season yet."} />
        )}
      </div>

      <div>
        <div className="section-head"><h2><span className="streak"><i /><i /><i /></span>{locale === "cs" ? "Stav motorů podle kategorie" : "Engine status by category"}</h2><a onClick={() => onOpenView("engines")}>{t.viewAll}</a></div>
        <div className="fleet-board">
          <div className="fleet-legend-strip">
            <span><i style={{ background: "var(--wrc-green)" }} />{t.ready}</span>
            <span><i style={{ background: "var(--wrc-amber)" }} />{t.due}</span>
            <span><i style={{ background: "var(--wrc-red)" }} />{t.rebuild}</span>
            <span><i style={{ background: "var(--wrc-ink-faint)" }} />{t.storage}</span>
          </div>
          {fleetRows.map(({ category, total, stats }) => {
            const barWidth = fleetGrandTotal > 0 ? Math.max((total / fleetGrandTotal) * 100, FLEET_MIN_BAR_PERCENT) : 0;
            return (
            <button className={category.id === selectedCategory ? "fleet-row selected" : "fleet-row"} type="button" key={category.id} onClick={() => setSelectedCategory(category.id)}>
              <div className="fleet-cat"><strong>{category.label}</strong><small>{formatCount(total, locale, ENGINE_FORMS)}</small></div>
              <div className="fleet-bar" style={{ width: `${barWidth}%` }}>
                {total > 0 ? <>
                  <div style={{ width: `${(stats.ready / total) * 100}%`, background: "var(--wrc-green)" }} />
                  <div style={{ width: `${(stats.due / total) * 100}%`, background: "var(--wrc-amber)" }} />
                  <div style={{ width: `${(stats.rebuild / total) * 100}%`, background: "var(--wrc-red)" }} />
                  <div style={{ width: `${(stats.storage / total) * 100}%`, background: "var(--wrc-ink-faint)" }} />
                </> : <div className="fleet-bar-empty" />}
              </div>
              <div className="fleet-counts">
                <b style={{ color: "var(--wrc-green)" }}>{stats.ready}</b>
                <b style={{ color: "var(--wrc-amber)" }}>{stats.due}</b>
                <b style={{ color: "var(--wrc-red)" }}>{stats.rebuild}</b>
                <b style={{ color: "var(--wrc-ink-faint)" }}>{stats.storage}</b>
              </div>
            </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="section-head"><h2><span className="streak"><i /><i /><i /></span>{locale === "cs" ? `Motory — ${categoryLabel}` : `Engines — ${categoryLabel}`}</h2>{categoryEngines.length > 0 && <a onClick={() => onOpenView("engines")}>{locale === "cs" ? `Zobrazit všech ${categoryEngines.length}` : `View all ${categoryEngines.length}`}</a>}</div>
        {categoryEngines.length > 0 ? (
          <div className="results-panel">
            <table className="results">
              <thead><tr><th>{locale === "cs" ? "Kód" : "Code"}</th><th>{locale === "cs" ? "Typ" : "Type"}</th><th>{locale === "cs" ? "Zapalování" : "Ignition"}</th><th>{locale === "cs" ? "Motohodiny" : "Hours"}</th><th>{locale === "cs" ? "Přiřazení" : "Assignment"}</th><th>{t.status}</th></tr></thead>
              <tbody>
                {categoryEngines.slice(0, 3).map((engine) => (
                  <tr key={engine.id}>
                    <td><span className="eng-code"><i className="swatch" style={{ background: ENGINE_PILL_COLORS[enginePillTone(engine.status)] }} />{engine.code}</span></td>
                    <td>{engine.family}</td>
                    <td>{engine.ignition || "—"}</td>
                    <td className="hours num">{formatHours(engine.totalMinutes)}</td>
                    <td>{engineAssignmentLabel(engine, dashboardRaces)}</td>
                    <td><span className={`pill ${enginePillTone(engine.status)}`}>{engineStatusLabel(engine.status, locale)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState size="compact" title={locale === "cs" ? "V této kategorii zatím není žádný motor." : "There are no engines in this category yet."} />
        )}
      </div>
    </div>
  );
}

function Engines({
  locale,
  engines,
  loading,
  error,
  canManage,
  role,
  onAdd,
  onEdit,
  onOpen,
}: {
  locale: Locale;
  engines: EngineRecord[];
  loading: boolean;
  error: boolean;
  canManage: boolean;
  role: AppSession["role"];
  onAdd: () => void;
  onEdit: (engine: EngineRecord) => void;
  onOpen: (engine: EngineRecord) => void;
}) {
  const t = copy[locale];
  const [filter, setFilter] = useState<EngineFilter>("ALL");
  const [page, setPage] = useState(1);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [technicalStructureOpen, setTechnicalStructureOpen] = useState(false);
  const [loansOverviewOpen, setLoansOverviewOpen] = useState(false);
  const pageSize = 15;
  const activeEngines = useMemo(() => engines.filter((engine) => !isSold(engine.soldAt)), [engines]);
  const counts = useMemo(() => ({
    ALL: activeEngines.length,
    MINI: activeEngines.filter((engine) => engine.family === "MINI").length,
    OKJ: activeEngines.filter((engine) => engine.family === "OKJ").length,
    OKN: activeEngines.filter((engine) => engine.family === "OKN" || engine.family === "OKN-J").length,
    OK: activeEngines.filter((engine) => engine.family === "OK").length,
    KZ: activeEngines.filter((engine) => engine.family === "KZ").length,
  }), [activeEngines]);
  const visibleEngines = useMemo(() => activeEngines.filter((engine) => {
    if (filter === "ALL") return true;
    if (filter === "OKN") return engine.family === "OKN" || engine.family === "OKN-J";
    return engine.family === filter;
  }), [activeEngines, filter]);
  useEffect(() => { setPage(1); }, [filter]);
  const totalPages = Math.max(1, Math.ceil(visibleEngines.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageEngines = visibleEngines.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const categories: Array<{ id: EngineFilter; label: string; note?: string; tone: string }> = [
    { id: "ALL", label: t.allEngines, tone: "total" },
    { id: "MINI", label: "MINI", tone: "mini" },
    { id: "OKJ", label: "OKJ", tone: "okj" },
    { id: "OKN", label: "OKN", note: t.includingOknJ, tone: "okn" },
    { id: "OK", label: "OK", tone: "ok" },
    { id: "KZ", label: "KZ", tone: "kz" },
  ];
  return (
    <div className="engines-page">
      {!loading && !error && (
        <div className="carb-unit-filters" aria-label={locale === "cs" ? "Počty motorů podle kategorií" : "Engine counts by category"}>
          <div className="carb-unit-category-tiles">{categories.map((category) => (
            <button key={category.id} type="button" className={`carb-unit-tile tone-${category.tone}${filter === category.id ? " active" : ""}`} onClick={() => setFilter(category.id)} aria-pressed={filter === category.id}>
              {category.label}<small>{counts[category.id]}</small>
            </button>
          ))}</div>
        </div>
      )}
      <section className="dash-panel data-panel latest-carb-panel">
        <header><div><span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM ENGINE CARD</span><h2>{filter === "ALL" ? t.engineStatus : `${t.engineStatus} · ${categories.find((item) => item.id === filter)?.label}`}</h2></div><div className="tab-actions">{canManage && <button className="secondary-compact" type="button" onClick={() => setLoansOverviewOpen(true)}>{locale === "cs" ? "Zápůjčky" : "Loans"}</button>}{role === "superadmin" && <button className="secondary-compact" type="button" onClick={() => setCatalogOpen(true)}>{locale === "cs" ? "Sada dílů" : "Parts catalog"}</button>}{role === "superadmin" && <button className="secondary-compact" type="button" onClick={() => setTechnicalStructureOpen(true)}>{locale === "cs" ? "Struktura technických údajů" : "Technical structure"}</button>}{canManage && <button className="primary-button" type="button" onClick={onAdd}>＋ {t.newEngine}</button>}</div></header>
        {catalogOpen && <EngineServicePartCatalogPanel locale={locale} onClose={() => setCatalogOpen(false)} />}
        {technicalStructureOpen && <EngineTechnicalStructurePanel locale={locale} onClose={() => setTechnicalStructureOpen(false)} />}
        {loansOverviewOpen && <EngineLoansOverviewPanel locale={locale} onClose={() => setLoansOverviewOpen(false)} onOpenEngine={(engineId) => { setLoansOverviewOpen(false); const target = engines.find((item) => item.id === engineId); if (target) onOpen(target); }} />}
        {loading && <LoadingState label={t.loading} />}
        {!loading && error && <EmptyState variant="error" icon="!" title={t.databaseError} />}
        {!loading && !error && activeEngines.length === 0 && (
          <EmptyState
            icon="◫"
            title={t.emptyEngines}
            description={t.emptyEnginesHelp}
            action={canManage && <button className="primary-button" type="button" onClick={onAdd}>＋ {t.addEngine}</button>}
          />
        )}
        {!loading && !error && activeEngines.length > 0 && visibleEngines.length === 0 && (
          <EmptyState size="compact" variant="filtered" title={locale === "cs" ? "V této kategorii zatím není žádný motor." : "There are no engines in this category yet."} />
        )}
        {!loading && !error && pageEngines.length > 0 && (
          <div className="table-wrap">
            <table className="results zebra">
              <thead><tr><th>{t.code}</th><th>{t.engineFamily}</th><th>{t.ignition}</th><th>{t.hoursTracking}</th><th>{locale === "cs" ? "Přiřazení / poslední pilot" : "Assignment / last driver"}</th><th>{t.status}</th>{canManage && <th className="no-print action-column">{t.actions}</th>}</tr></thead>
              <tbody>{pageEngines.map((engine) => {
                const usesHours = !NO_HOUR_TRACKING_ENGINE_FAMILIES.includes(engine.family);
                const ready = engine.status === "ready" && !isSold(engine.soldAt);
                const variant = engine.family === "KZ" ? engine.kzGeneration : engine.family === "MINI" ? engine.currentConfiguration : null;
                const familyTone = engine.family === "OKN-J" ? "OKN" : engine.family;
                return (
                  <tr key={engine.id} className={`clickable-row family-${familyTone.toLowerCase()}`} style={engine.labelColor ? { "--engine-label-color": engine.labelColor } as React.CSSProperties : undefined} onClick={() => onOpen(engine)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(engine); }}>
                    <td><span className="engine-code-title">{engine.labelColor && <i className="engine-label-swatch" style={{ backgroundColor: engine.labelColor }} />}<strong>{engine.code}</strong></span><small className="cell-note">{engine.upgradeCode ? `${t.upgrade}: ${engine.upgradeCode}` : "—"}</small></td>
                    <td><span className={`carb-category-badge tone-${familyTone.toLowerCase()}`}>{engine.family}</span>{variant && <small className="cell-note">{variant}</small>}</td>
                    <td>{ignitionLabel(engine.ignition, locale)}</td>
                    <td>{usesHours ? formatHours(engine.totalMinutes) : t.byRaces}</td>
                    <td>{engine.location?.kind === "loan"
                      ? <span className={`carb-assignment-cell loan${engine.location.overdue ? " overdue" : ""}`}><strong>{engine.location.recipientName}</strong><small>{locale === "cs" ? "do " : "until "}{formatDisplayDate(engine.location.expectedReturnDate, locale)}</small><em>{engine.location.overdue ? (locale === "cs" ? "Prošlá zápůjčka" : "Loan overdue") : (locale === "cs" ? "Zápůjčka" : "On loan")}</em></span>
                      : engine.assignedDriver
                      ? <span className="carb-assignment-cell"><strong>{engine.assignedDriver}</strong><small>{engine.assignedRace || "—"}</small>{engine.assignmentStatus === "assigned" && <em>{locale === "cs" ? "Přiřazeno" : "Assigned"}</em>}</span>
                      : "—"}</td>
                    <td><span className={isSold(engine.soldAt) ? "status-pill neutral" : ready ? "status-pill success" : "status-pill warning-pill"}>{isSold(engine.soldAt) ? (locale === "cs" ? "Prodáno" : "Sold") : ready ? t.ready : t.due}</span></td>
                    {canManage && <td className="no-print action-column" onClick={(event) => event.stopPropagation()}><button className="table-action" type="button" onClick={() => onEdit(engine)}>{t.edit}{role === "superadmin" ? " ···" : ""}</button></td>}
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && <div className="carb-unit-pagination">
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>‹ {locale === "cs" ? "Předchozí" : "Previous"}</button>
          <span>{locale === "cs" ? `Strana ${currentPage} z ${totalPages}` : `Page ${currentPage} of ${totalPages}`}</span>
          <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>{locale === "cs" ? "Další" : "Next"} ›</button>
        </div>}
      </section>
    </div>
  );
}

function EngineLoansOverviewPanel({ locale, onClose, onOpenEngine }: { locale: Locale; onClose: () => void; onOpenEngine: (engineId: string) => void }) {
  const dialogRef = useModalA11y(onClose);
  const [loans, setLoans] = useState<EngineLoanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [extendingLoan, setExtendingLoan] = useState<EngineLoanRecord | null>(null);
  const [returningLoan, setReturningLoan] = useState<EngineLoanRecord | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/engine-loans", { cache: "no-store" });
      const data = (await response.json()) as { loans?: EngineLoanRecord[] };
      if (!response.ok || !data.loans) throw new Error("load failed");
      setLoans(data.loans);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const today = todayInputValue();

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal service-modal" role="dialog" aria-modal="true" aria-labelledby="loans-overview-title" tabIndex={-1}>
        <div className="modal-header">
          <div><span className="eyebrow">SERVICE CARD</span><h2 id="loans-overview-title">{locale === "cs" ? "Aktivní zápůjčky" : "Active loans"}</h2><p>{locale === "cs" ? "Motory, které jsou právě zapůjčené. Prošlé zápůjčky jsou nahoře a zvýrazněné." : "Engines currently on loan. Overdue loans sort to the top and are highlighted."}</p></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={locale === "cs" ? "Zavřít" : "Close"}>×</button>
        </div>

        {loading && <LoadingState size="inline" label={locale === "cs" ? "Načítám…" : "Loading…"} />}
        {!loading && error && <EmptyState variant="error" size="inline" icon="!" title={locale === "cs" ? "Zápůjčky se nepodařilo načíst." : "Could not load loans."} />}
        {!loading && !error && loans.length === 0 && (
          <EmptyState size="inline" title={locale === "cs" ? "Žádná aktivní zápůjčka" : "No active loans"} description={locale === "cs" ? "Všechny motory jsou buď v dílně, nebo na závodě." : "Every engine is either in the workshop or at a race."} />
        )}
        {!loading && !error && loans.length > 0 && (
          <div className="table-wrap">
            <table className="records-table zebra">
              <thead><tr><th>{locale === "cs" ? "Motor" : "Engine"}</th><th>{locale === "cs" ? "Příjemce" : "Recipient"}</th><th>{locale === "cs" ? "Od" : "From"}</th><th>{locale === "cs" ? "Očekávaný návrat" : "Expected return"}</th><th>{locale === "cs" ? "Akce" : "Actions"}</th></tr></thead>
              <tbody>{loans.map((loan) => {
                const overdue = loan.expectedReturnDate < today;
                return (
                  <tr key={loan.id}>
                    <td><button type="button" className="table-action" onClick={() => onOpenEngine(loan.engineId)}>{loan.engineCode ?? loan.engineId}</button></td>
                    <td>{loan.recipientName}</td>
                    <td>{formatDisplayDate(loan.startDate, locale)}</td>
                    <td><span className={overdue ? "status-pill danger" : ""}>{formatDisplayDate(loan.expectedReturnDate, locale)}{overdue && (locale === "cs" ? " · prošlá" : " · overdue")}</span></td>
                    <td><div className="record-actions"><button type="button" onClick={() => setExtendingLoan(loan)}>{locale === "cs" ? "Prodloužit" : "Extend"}</button><button type="button" onClick={() => setReturningLoan(loan)}>{locale === "cs" ? "Vrátit" : "Return"}</button></div></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </section>
      {extendingLoan && <EngineLoanExtendForm locale={locale} loan={extendingLoan} onClose={() => setExtendingLoan(null)} onSaved={() => { setExtendingLoan(null); void load(); }} />}
      {returningLoan && <EngineLoanReturnForm locale={locale} loan={returningLoan} onClose={() => setReturningLoan(null)} onSaved={() => { setReturningLoan(null); void load(); }} />}
    </div>
  );
}

function EngineDetail({ locale, engine, technicalStructure, technicalValues, onTechnicalValuesSaved, canManage, role, currentUserName, onBack, onEdit, onSaved, showNotice }: {
  locale: Locale;
  engine: EngineRecord;
  technicalStructure: TechnicalStructureData;
  technicalValues: Record<string, string>;
  onTechnicalValuesSaved: (engineId: string, values: Record<string, string>) => void;
  canManage: boolean;
  role: AppSession["role"];
  currentUserName: string;
  onBack: () => void;
  onEdit: () => void;
  onSaved: (engine: EngineRecord) => void;
  showNotice: (message: string) => void;
}) {
  const t = copy[locale];
  const [tab, setTab] = useState<EngineDetailTab>("overview");
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [baselineOpen, setBaselineOpen] = useState(false);
  const [editingUsage, setEditingUsage] = useState<UsageRecord | null>(null);
  const [editingService, setEditingService] = useState<ServiceRecord | null>(null);
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);
  const [serviceRecords, setServiceRecords] = useState<ServiceRecord[]>([]);
  const [assignments, setAssignments] = useState<EngineAssignment[]>([]);
  const [auditEntries, setAuditEntries] = useState<EngineAuditEntry[]>([]);
  const [serviceParts, setServiceParts] = useState<ServicePart[]>([]);
  const [mechanics, setMechanics] = useState<Array<{ id: string; name: string }>>([]);
  const [loans, setLoans] = useState<EngineLoanRecord[]>([]);
  const [recipientOptions, setRecipientOptions] = useState<LoanRecipientOption[]>([]);
  const [loanFormOpen, setLoanFormOpen] = useState(false);
  const [extendingLoan, setExtendingLoan] = useState<EngineLoanRecord | null>(null);
  const [returningLoan, setReturningLoan] = useState<EngineLoanRecord | null>(null);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState(false);
  const usesHours = !NO_HOUR_TRACKING_ENGINE_FAMILIES.includes(engine.family);
  const isSuperadmin = role === "superadmin";
  const familyTone = (engine.family === "OKN-J" ? "OKN" : engine.family).toLowerCase();
  const tabs: Array<{ id: EngineDetailTab; label: string }> = [
    { id: "overview", label: t.overviewTab },
    { id: "technical", label: t.technicalTab },
    { id: "service", label: t.serviceCard },
    ...(usesHours ? [{ id: "hours" as const, label: t.usageTab }] : []),
    { id: "history", label: t.historyTab },
    { id: "documents", label: t.documentsTab },
  ];

  useEffect(() => {
    if (!usesHours && tab === "hours") setTab("overview");
  }, [usesHours, tab]);
  const variant = engine.family === "KZ" ? engine.kzGeneration : engine.family === "MINI" ? engine.currentConfiguration : null;
  const noValue = t.notEntered;

  // A family renders dynamically the moment it has at least one non-archived section — a family that
  // never confirmed the migration draft (or explicitly started empty) has none, so it keeps the fixed
  // legacy layout below untouched, per the Krok 3 request ("musí fungovat jako dnes").
  const technicalSections = technicalStructure.sections.filter((section) => section.family === engine.family).sort((a, b) => a.sortOrder - b.sortOrder);
  const hasTechnicalStructure = technicalSections.length > 0;
  const technicalColumnCount = technicalStructure.layout.find((item) => item.family === engine.family)?.columnCount ?? 3;
  function fieldsForTechnicalSection(sectionId: string) {
    return technicalStructure.fields.filter((field) => field.sectionId === sectionId).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  function technicalFieldLabel(field: TechnicalFieldDef) {
    return locale === "cs" ? field.labelCs : field.labelEn;
  }
  function technicalFieldDisplayValue(field: TechnicalFieldDef) {
    const raw = technicalValues[field.id] ?? "";
    if (!raw) return "";
    if (field.fieldType !== "select") return raw;
    // Select values are stored as the chosen option's id (not its label) so a later locale switch, or a
    // rename of the option, redisplays correctly. If the option was since archived, the id no longer
    // resolves — the field is then treated as empty rather than showing a stale/blank id.
    const option = technicalStructure.options.find((item) => item.id === raw && item.fieldId === field.id);
    return option ? (locale === "cs" ? option.valueCs : option.valueEn) : "";
  }

  useEffect(() => {
    let active = true;
    async function loadRecords() {
      setRecordsLoading(true);
      try {
        const response = await fetch(`/api/engine-records?engineId=${encodeURIComponent(engine.id)}`, { cache: "no-store" });
        const data = (await response.json()) as { usage?: UsageRecord[]; service?: ServiceRecord[]; assignments?: EngineAssignment[]; audit?: EngineAuditEntry[]; serviceParts?: ServicePart[] };
        if (!response.ok || !data.usage || !data.service || !data.assignments || !data.audit || !data.serviceParts) throw new Error("load failed");
        if (!active) return;
        setUsageRecords(data.usage);
        setServiceRecords(data.service);
        setAssignments(data.assignments);
        setAuditEntries(data.audit);
        setServiceParts(data.serviceParts);
        setRecordsError(false);
      } catch {
        if (active) setRecordsError(true);
      } finally {
        if (active) setRecordsLoading(false);
      }
    }
    void loadRecords();
    return () => { active = false; };
  }, [engine.id]);

  useEffect(() => {
    let active = true;
    fetch("/api/catalog", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { mechanics?: Array<{ id: string; name: string }> }) => {
        if (active && data.mechanics) setMechanics(data.mechanics.map((mechanic) => ({ id: mechanic.id, name: mechanic.name })));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/customers", { cache: "no-store" }).then((response) => response.json()) as Promise<{ customers?: Array<{ id: string; name: string }> }>,
      fetch("/api/catalog", { cache: "no-store" }).then((response) => response.json()) as Promise<{ teams?: Array<{ id: string; name: string }>; drivers?: Array<{ id: string; name: string }> }>,
    ]).then(([customersData, catalogData]) => {
      if (!active) return;
      const options: LoanRecipientOption[] = [
        ...(customersData.customers ?? []).map((item) => ({ value: `customer:${item.id}`, label: item.name, type: "customer" as const, id: item.id })),
        ...(catalogData.teams ?? []).map((item) => ({ value: `team:${item.id}`, label: item.name, type: "team" as const, id: item.id })),
        ...(catalogData.drivers ?? []).map((item) => ({ value: `driver:${item.id}`, label: item.name, type: "driver" as const, id: item.id })),
      ];
      setRecipientOptions(options);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function reloadLoans() {
    try {
      const response = await fetch(`/api/engine-loans?engineId=${encodeURIComponent(engine.id)}`, { cache: "no-store" });
      const data = (await response.json()) as { loans?: EngineLoanRecord[] };
      if (response.ok && data.loans) setLoans(data.loans);
    } catch {
      // keep the previously loaded loans on a transient fetch failure
    }
  }

  useEffect(() => { void reloadLoans(); }, [engine.id]);

  const activeLoan = loans.find((loan) => !loan.actualReturnDate) ?? null;

  function applyCounters(counters: Partial<EngineRecord>) {
    onSaved({ ...engine, ...counters, updatedAt: Date.now() });
  }

  function recordProblem() {
    if (recordsLoading) return <LoadingState size="inline" label={t.loading} />;
    if (recordsError) return <EmptyState variant="error" size="inline" icon="!" title={t.databaseError} />;
    return null;
  }

  async function reloadRecords() {
    setRecordsLoading(true);
    try {
      const response = await fetch(`/api/engine-records?engineId=${encodeURIComponent(engine.id)}`, { cache: "no-store" });
      const data = (await response.json()) as { usage?: UsageRecord[]; service?: ServiceRecord[]; assignments?: EngineAssignment[]; audit?: EngineAuditEntry[]; serviceParts?: ServicePart[] };
      if (!response.ok || !data.usage || !data.service || !data.assignments || !data.audit || !data.serviceParts) throw new Error("load failed");
      setUsageRecords(data.usage);
      setServiceRecords(data.service);
      setAssignments(data.assignments);
      setAuditEntries(data.audit);
      setServiceParts(data.serviceParts);
      setRecordsError(false);
    } catch {
      setRecordsError(true);
    } finally {
      setRecordsLoading(false);
    }
  }

  async function deleteRecord(kind: "usage" | "service", recordId: string) {
    const question = locale === "cs"
      ? "Opravdu chceš tento záznam smazat? Počítadla motoru se automaticky přepočítají."
      : "Delete this record? The engine counters will be recalculated automatically.";
    if (!window.confirm(question)) return;
    try {
      const response = await fetch("/api/engine-records", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, engineId: engine.id, recordId }),
      });
      const data = (await response.json()) as { counters?: Partial<EngineRecord>; error?: string };
      if (!response.ok || !data.counters) throw new Error(data.error || "Delete failed");
      applyCounters(data.counters);
      await reloadRecords();
      showNotice(locale === "cs" ? "Záznam byl smazán a počítadla přepočítána." : "Record deleted and counters recalculated.");
    } catch (deleteError) {
      window.alert(friendlyRecordError(deleteError instanceof Error ? deleteError.message : "Delete failed", locale));
    }
  }

  const currentAssignment = useMemo(() => {
    const today = todayInputValue();
    return assignments
      .filter((assignment) => assignment.raceStatus !== "completed" && assignment.endDate >= today)
      .sort((left, right) => left.startDate.localeCompare(right.startDate))[0] ?? null;
  }, [assignments]);
  const locationKind = engine.location?.kind ?? "workshop";

  return (
    <div className={`engine-detail family-${familyTone}`} style={engine.labelColor ? { "--engine-accent": engine.labelColor } as React.CSSProperties : undefined}>
      <button className="back-button" type="button" onClick={onBack}>← {t.backToEngines}</button>
      <section className="dash-panel engine-detail-hero">
        <div className="race-hero-title">
          <span className="engine-detail-mark">{engine.family}</span>
          <div>
            <span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM ENGINE CARD</span>
            <div className="engine-title-line">{engine.labelColor && <i className="engine-label-swatch large" style={{ backgroundColor: engine.labelColor }} />}<h2>{engine.code}</h2><span className={`status-pill ${engine.status === "ready" ? "success" : "warning-pill"}`}>{engineStatusLabel(engine.status, locale)}</span></div>
            <p>TM Racing · {engine.family}{variant ? ` · ${variant}` : ""} · {ignitionLabel(engine.ignition, locale)}</p>
          </div>
        </div>
        {canManage && <button className="secondary-compact" type="button" onClick={onEdit}>✎ {t.editEngine}</button>}
      </section>

      <nav className="engine-tabs" aria-label={locale === "cs" ? "Karta motoru" : "Engine card"}>
        {tabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} type="button" onClick={() => setTab(item.id)}>{item.label}</button>)}
      </nav>

      {tab === "overview" && (
        <div className="engine-detail-grid">
          <section className="dash-panel detail-card detail-info-card">
            <div className="panel-heading"><span>{t.engineInfo}</span></div>
            <div className="detail-field-grid">
              <DetailField label={t.code} value={engine.code} />
              <DetailField label={t.engineFamily} value={`${engine.family}${variant ? ` · ${variant}` : ""}`} />
              <DetailField label={t.ignition} value={ignitionLabel(engine.ignition, locale)} />
              <DetailField label={t.upgrade} value={engine.upgradeCode || noValue} />
              <DetailField label={t.purchaseDate} value={formatDisplayDate(engine.purchaseDate, locale) || noValue} />
              <DetailField label={locale === "cs" ? "Aktuální jezdec" : "Current driver"} value={currentAssignment?.driverName || t.notAssigned} />
            </div>
          </section>

          <section className="dash-panel detail-card usage-card">
            <div className="panel-heading"><span>{t.currentUsage}</span></div>
            <div className="usage-number"><strong>{usesHours ? formatHours(engine.rodMinutes) : "—"}</strong><span>{usesHours ? (locale === "cs" ? "Ojnice / klika" : "Rod / crank") : t.byRaces}</span></div>
            <div className="usage-meter"><i style={{ width: `${Math.min(100, Math.round((engine.rodMinutes / 720) * 100))}%` }} /></div>
            <p>{usesHours ? `${locale === "cs" ? "Píst" : "Piston"}: ${formatHours(engine.pistonMinutes)} · ${locale === "cs" ? "Poslední Oppama" : "Last Oppama"}: ${formatHours(engine.lastOppamaMinutes)}` : (locale === "cs" ? "U tohoto typu sledujeme závody a kalendářní servis." : "This type is tracked by races and calendar service.")}</p>
          </section>

          <section className="dash-panel detail-card quick-card">
            <div className="panel-heading"><span>{t.quickActions}</span></div>
            {canManage && <button type="button" onClick={() => setTechnicalOpen(true)}><span>⌁</span><span>{t.editTechnical}</span><b>›</b></button>}
            <button type="button" onClick={() => setServiceOpen(true)}><span>◇</span><span>{t.addServiceEntry}</span><b>›</b></button>
            {usesHours && <button type="button" onClick={() => setUsageOpen(true)}><span>◷</span><span>{t.logHours}</span><b>›</b></button>}
          </section>

          <section className={`dash-panel detail-card engine-current-assignment ${locationKind}`}>
            <div className="panel-heading">
              <span>{locale === "cs" ? "Poloha motoru" : "Engine location"}</span>
              {locationKind === "race" && <b className="status-pill success">{locale === "cs" ? "Na závodě" : "At the race"}</b>}
              {locationKind === "loan" && <b className={`status-pill ${engine.location?.kind === "loan" && engine.location.overdue ? "danger" : "info-pill"}`}>{engine.location?.kind === "loan" && engine.location.overdue ? (locale === "cs" ? "Prošlá zápůjčka" : "Loan overdue") : (locale === "cs" ? "Zápůjčka" : "On loan")}</b>}
              {locationKind === "workshop" && <b className="status-pill neutral">{locale === "cs" ? "V dílně" : "In the workshop"}</b>}
              {canManage && locationKind === "workshop" && <button className="secondary-compact" type="button" onClick={() => setLoanFormOpen(true)}>{locale === "cs" ? "Zapůjčit motor" : "Lend engine"}</button>}
              {canManage && locationKind === "loan" && activeLoan && (
                <div className="tab-actions">
                  <button className="secondary-compact" type="button" onClick={() => setExtendingLoan(activeLoan)}>{locale === "cs" ? "Prodloužit" : "Extend"}</button>
                  <button className="secondary-compact" type="button" onClick={() => setReturningLoan(activeLoan)}>{locale === "cs" ? "Označit vrácení" : "Mark returned"}</button>
                </div>
              )}
            </div>
            {locationKind === "race" && currentAssignment && (
              <div className="engine-assignment-summary">
                <div className="assignment-driver"><strong>{currentAssignment.driverName}</strong><small>{[currentAssignment.teamName, currentAssignment.category].filter(Boolean).join(" · ")}</small></div>
                <div className="engine-assignment-race"><RaceLogoBadge logoUrl={currentAssignment.logoUrl} name={currentAssignment.raceName} fallback={countryFlag(currentAssignment.countryCode)} size="default" /><span><strong>{currentAssignment.raceName}</strong><small>{countryFlag(currentAssignment.countryCode)} {currentAssignment.track} · {dashboardDateRange(currentAssignment.startDate, currentAssignment.endDate, locale)}</small></span></div>
                <div className="engine-assignment-equipment"><span><small>{locale === "cs" ? "Pozice" : "Position"}</small><strong>{locale === "cs" ? "Motor" : "Engine"} {currentAssignment.position}</strong></span><span><small>{locale === "cs" ? "Spárovaný karburátor" : "Paired carburetor"}</small><strong>{currentAssignment.carburetorCode || "—"}</strong></span></div>
              </div>
            )}
            {locationKind === "loan" && engine.location?.kind === "loan" && (
              <div className="engine-assignment-summary">
                <div className="assignment-driver"><strong>{engine.location.recipientName}</strong><small>{locale === "cs" ? "Zápůjčka motoru" : "Engine on loan"}</small></div>
                <div className="engine-assignment-equipment">
                  <span><small>{locale === "cs" ? "Návrat do" : "Return by"}</small><strong>{formatDisplayDate(engine.location.expectedReturnDate, locale)}</strong></span>
                </div>
                {engine.location.overdue && <p className="form-hint">{locale === "cs" ? "Očekávané datum vrácení uplynulo, motor se ještě nevrátil." : "The expected return date has passed and the engine hasn't been returned yet."}</p>}
              </div>
            )}
            {locationKind === "workshop" && (
              <EmptyState size="inline" title={locale === "cs" ? "Motor je v dílně" : "Engine is in the workshop"} description={locale === "cs" ? "Po přiřazení v plánu závodu nebo zapůjčení se zde automaticky ukáže, kde motor je." : "Once assigned in a race plan or lent out, the engine's location will appear here automatically."} />
            )}
          </section>

          <section className="dash-panel detail-card notes-card">
            <div className="panel-heading"><span>{t.notes}</span></div>
            <p>{engine.notes || (locale === "cs" ? "K motoru zatím není uložená poznámka." : "No note has been saved for this engine yet.")}</p>
          </section>

          <section className="dash-panel detail-card technical-preview">
            <div className="panel-heading"><span>{t.technicalTab}</span>{canManage && <button type="button" onClick={() => setTechnicalOpen(true)}>{t.edit}</button>}</div>
            {hasTechnicalStructure ? (() => {
              const overviewFields = technicalStructure.fields
                .filter((field) => field.showOnOverview && technicalSections.some((section) => section.id === field.sectionId))
                .map((field) => ({ field, value: technicalFieldDisplayValue(field) }))
                .filter((entry) => entry.value);
              return overviewFields.length > 0 ? (
                <div className="detail-field-grid compact">
                  {overviewFields.map(({ field, value }) => <DetailField key={field.id} label={technicalFieldLabel(field)} value={value} />)}
                </div>
              ) : (
                <p className="form-hint">{locale === "cs" ? "Zatím žádné vyplněné technické údaje." : "No technical data filled in yet."}</p>
              );
            })() : (
              <div className="detail-field-grid compact">
                <DetailField label={locale === "cs" ? "Píst" : "Piston"} value={engine.pistonSpec || noValue} />
                <DetailField label={locale === "cs" ? "Válec" : "Cylinder"} value={engine.cylinderCode || noValue} />
                <DetailField label={locale === "cs" ? "Úprava válce" : "Cylinder upgrade"} value={engine.cylinderUpgrade || noValue} />
                <DetailField label="Carter" value={engine.carter || noValue} />
                <DetailField label="Squish" value={engine.squish || noValue} />
                <DetailField label="Reeds" value={engine.reeds || noValue} />
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "technical" && (
        <section className="dash-panel tab-panel">
          <div className="tab-panel-header"><div><span className="eyebrow">ENGINE CARD</span><h2>{t.technicalTab}</h2><p>{locale === "cs" ? "Digitální přepis údajů z fyzické karty motoru." : "Digital copy of the physical engine card."}</p></div>{canManage && <button className="primary-button" type="button" onClick={() => setTechnicalOpen(true)}>✎ {t.editTechnical}</button>}</div>
          {hasTechnicalStructure ? (() => {
            const renderedSections = technicalSections
              .map((section) => ({
                section,
                entries: fieldsForTechnicalSection(section.id).map((field) => ({ field, value: technicalFieldDisplayValue(field) })).filter((entry) => entry.value),
              }))
              .filter((group) => group.entries.length > 0);
            return renderedSections.length > 0 ? (
              <div className="technical-section-grid" style={{ gridTemplateColumns: `repeat(${technicalColumnCount}, minmax(0, 1fr))` }}>
                {renderedSections.map(({ section, entries }) => (
                  <div className="technical-group" key={section.id}>
                    <h3>{locale === "cs" ? section.labelCs : section.labelEn}</h3>
                    {entries.map(({ field, value }) => <DetailField key={field.id} label={technicalFieldLabel(field)} value={value} />)}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState size="inline" title={locale === "cs" ? "Zatím žádné technické údaje" : "No technical data yet"} description={locale === "cs" ? "Vyplň kartu tlačítkem výše." : "Fill in the card using the button above."} />
            );
          })() : (
            <div className="technical-section-grid">
              <div className="technical-group"><h3>{locale === "cs" ? "Motor a píst" : "Engine and piston"}</h3><DetailField label={t.upgrade} value={engine.upgradeCode || noValue} /><DetailField label={locale === "cs" ? "Píst / rozměr / úhel" : "Piston / size / angle"} value={engine.pistonSpec || noValue} /><DetailField label={t.ignition} value={ignitionLabel(engine.ignition, locale)} /></div>
              <div className="technical-group"><h3>{locale === "cs" ? "Válec" : "Cylinder"}</h3><DetailField label={locale === "cs" ? "Označení válce" : "Cylinder code"} value={engine.cylinderCode || noValue} /><DetailField label={locale === "cs" ? "Úprava válce" : "Cylinder upgrade"} value={engine.cylinderUpgrade || noValue} /><DetailField label="Liner" value={engine.liner || noValue} /><DetailField label="Degree" value={engine.degree || noValue} /><DetailField label="Timing" value={engine.timing || noValue} /></div>
              <div className="technical-group"><h3>{locale === "cs" ? "Spodní část a sání" : "Bottom end and intake"}</h3><DetailField label="Carter" value={engine.carter || noValue} /><DetailField label="Reeds" value={engine.reeds || noValue} /><DetailField label="Spacer" value={engine.spacer || noValue} /><DetailField label="Squish" value={engine.squish || noValue} /></div>
            </div>
          )}
        </section>
      )}

      {tab === "service" && (
        <section className="dash-panel tab-panel">
          <div className="tab-panel-header"><div><span className="eyebrow">SERVICE CARD</span><h2>{t.serviceCard}</h2><p>{locale === "cs" ? "Servisní záznamy, vyměněné díly a automatické resetování počítadel." : "Service entries, replaced parts and automatic counter resets."}</p></div><button className="primary-button" type="button" onClick={() => setServiceOpen(true)}>＋ {t.addServiceEntry}</button></div>
          <div className="service-checklist">
            {serviceParts.map((part) => {
              const latest = serviceRecords.find((record) => record.replacedParts.includes(part.id));
              const detail = latest
                ? [formatDisplayDate(latest.serviceDate, locale), part.id === "piston" && latest.pistonSize ? latest.pistonSize : "", latest.mechanicName].filter(Boolean).join(" · ")
                : (locale === "cs" ? "Bez servisního záznamu" : "No service record");
              return <div key={part.id} className={latest ? "has-record" : ""}><span>{latest ? "✓" : "○"}</span><strong>{locale === "cs" ? part.cs : part.en}</strong><small>{detail}</small></div>;
            })}
          </div>
          {recordProblem()}
          {!recordsLoading && !recordsError && serviceRecords.length === 0 && <EmptyState size="inline" title={locale === "cs" ? "Zatím bez historie servisu" : "No service history yet"} description={locale === "cs" ? "První zápis bude obsahovat datum, typ servisu a zaškrtnuté vyměněné díly." : "The first entry will include the date, service type and replaced parts."} />}
          {!recordsLoading && !recordsError && serviceRecords.length > 0 && <ServiceHistoryTable records={serviceRecords} locale={locale} canCorrect={isSuperadmin} onEdit={(record) => setEditingService(record)} onDelete={(recordId) => { void deleteRecord("service", recordId); }} />}
        </section>
      )}

      {tab === "hours" && usesHours && (
        <section className="dash-panel tab-panel">
          <div className="tab-panel-header"><div><span className="eyebrow">OPPAMA</span><h2>{t.usageTab}</h2><p>{locale === "cs" ? "Zápis po skončení závodu ve formátu HH:MM." : "Logged after each race in HH:MM format."}</p></div><div className="tab-actions">{isSuperadmin && <button className="secondary-compact" type="button" onClick={() => setBaselineOpen(true)}>⌁ {locale === "cs" ? "Vstupní stav" : "Starting state"}</button>}<button className="primary-button" type="button" onClick={() => setUsageOpen(true)}>＋ {t.logHours}</button></div></div>
          <div className="hours-summary"><div><span>{locale === "cs" ? "Poslední Oppama" : "Last Oppama"}</span><strong>{formatHours(engine.lastOppamaMinutes)}</strong></div><div><span>{locale === "cs" ? "Píst od výměny" : "Piston since replacement"}</span><strong>{formatHours(engine.pistonMinutes)}</strong><small>{engine.currentPistonSize ? `${locale === "cs" ? "Rozměr" : "Size"}: ${engine.currentPistonSize}` : ""}</small></div><div><span>{locale === "cs" ? "Ojnice / klika" : "Rod / crank"}</span><strong>{formatHours(engine.rodMinutes)}</strong></div></div>
          {recordProblem()}
          {!recordsLoading && !recordsError && usageRecords.length === 0 && <EmptyState size="inline" title={locale === "cs" ? "Zatím bez záznamů provozu" : "No usage entries yet"} description={locale === "cs" ? "Po závodu zapiš stav Oppama; systém ho přičte k pístu i ojnici." : "After a race, log Oppama and the system will add it to both counters."} />}
          {!recordsLoading && !recordsError && usageRecords.length > 0 && <UsageHistoryTable records={usageRecords} locale={locale} canCorrect={isSuperadmin} onEdit={(record) => setEditingUsage(record)} onDelete={(recordId) => { void deleteRecord("usage", recordId); }} />}
        </section>
      )}

      {tab === "history" && (
        <section className="dash-panel tab-panel">
          <div className="tab-panel-header"><div><span className="eyebrow">RACE HISTORY</span><h2>{t.historyTab}</h2><p>{locale === "cs" ? "Závody, piloti a spárované karburátory zůstávají trvale v kartě motoru." : "Races, drivers and paired carburetors remain permanently in the engine card."}</p></div></div>
          {assignments.length > 0 ? <div className="table-wrap"><table className="engine-table race-logo-history-table zebra"><thead><tr><th>{locale === "cs" ? "Závod" : "Race"}</th><th>{locale === "cs" ? "Pilot" : "Driver"}</th><th>{locale === "cs" ? "Kategorie" : "Category"}</th><th>{locale === "cs" ? "Karburátor" : "Carburetor"}</th><th>{locale === "cs" ? "Pozice" : "Position"}</th></tr></thead><tbody>{assignments.map((assignment) => <tr key={`${assignment.id}-${assignment.position}`}><td><div className="race-history-identity"><RaceLogoBadge logoUrl={assignment.logoUrl} name={assignment.raceName} fallback={countryFlag(assignment.countryCode)} size="small" /><span><strong>{assignment.raceName}</strong><small>{assignment.track} · {dashboardDateRange(assignment.startDate, assignment.endDate, locale)}</small></span></div></td><td><strong>{assignment.driverName}</strong><small>{assignment.teamName || "—"}</small></td><td>{assignment.category}</td><td><span className="equipment-code">{assignment.carburetorCode || "—"}</span></td><td>{assignment.position}</td></tr>)}</tbody></table></div> : <EmptyState size="inline" title={locale === "cs" ? "Zatím bez závodu" : "No races yet"} description={locale === "cs" ? "Historie se vytvoří automaticky po přiřazení motoru v plánu závodu." : "History will be created automatically after assigning the engine in a race plan."} />}
          <div className="tab-panel-header audit-subsection"><div><span className="eyebrow">LOANS</span><h3>{locale === "cs" ? "Zápůjčky" : "Loans"}</h3></div></div>
          {loans.length > 0 ? (
            <div className="history-list">{loans.map((loan) => {
              const overdue = !loan.actualReturnDate && loan.expectedReturnDate < todayInputValue();
              return <div key={loan.id}><i />
                <span>
                  <strong>{loan.recipientName}{!loan.actualReturnDate && <span className={`status-pill ${overdue ? "danger" : "info-pill"} audit-system-badge`}>{overdue ? (locale === "cs" ? "Prošlá" : "Overdue") : (locale === "cs" ? "Aktivní" : "Active")}</span>}</strong>
                  <small>{formatDisplayDate(loan.startDate, locale)} – {formatDisplayDate(loan.actualReturnDate ?? loan.expectedReturnDate, locale)}{loan.actualReturnDate ? "" : locale === "cs" ? " (očekáváno)" : " (expected)"}</small>
                </span>
              </div>;
            })}</div>
          ) : (
            <EmptyState size="inline" title={locale === "cs" ? "Zatím žádná zápůjčka" : "No loans yet"} description={locale === "cs" ? "Zápůjčky se zde objeví po zapůjčení motoru." : "Loans will appear here once the engine is lent out."} />
          )}
          <div className="tab-panel-header audit-subsection"><div><span className="eyebrow">AUDIT</span><h3>{locale === "cs" ? "Změny karty" : "Card changes"}</h3></div></div>
          <div className="history-list">{auditEntries.map((entry) => <div key={entry.id}><i />
            <span>
              <strong>{auditEntryText(entry, locale)}{entry.isSystem && <span className="status-pill info-pill audit-system-badge">{locale === "cs" ? "Automaticky" : "Automatic"}</span>}</strong>
              <small>{formatTimestamp(entry.createdAt, locale)}</small>
            </span>
          </div>)}</div>
        </section>
      )}

      {tab === "documents" && (
        <section className="dash-panel tab-panel">
          <div className="tab-panel-header"><div><span className="eyebrow">FILES</span><h2>{t.documentsTab}</h2><p>{locale === "cs" ? "Karta motoru, fotografie, protokoly a další dokumenty." : "Engine card, photos, reports and other documents."}</p></div></div>
          <div className="empty-inline"><strong>{locale === "cs" ? "Zatím žádné dokumenty" : "No documents yet"}</strong><p>{locale === "cs" ? "Nahrávání fotografií a PDF zapojíme později přes bezpečné úložiště." : "Photo and PDF uploads will be connected to secure storage later."}</p></div>
        </section>
      )}

      {technicalOpen && (
        <TechnicalForm
          locale={locale}
          engine={engine}
          technicalStructure={technicalStructure}
          technicalValues={technicalValues}
          onClose={() => setTechnicalOpen(false)}
          onSaved={(updated, savedValues) => {
            onSaved(updated);
            if (savedValues) onTechnicalValuesSaved(engine.id, savedValues);
            setTechnicalOpen(false);
            showNotice(t.technicalSaved);
          }}
        />
      )}
      {baselineOpen && <BaselineForm locale={locale} engine={engine} onClose={() => setBaselineOpen(false)} onSaved={(counters) => { applyCounters(counters); setBaselineOpen(false); void reloadRecords(); showNotice(locale === "cs" ? "Vstupní stav byl uložen a počítadla přepočítána." : "Starting state saved and counters recalculated."); }} />}
      {usageOpen && <UsageForm locale={locale} engine={engine} onClose={() => setUsageOpen(false)} onSaved={(_record, counters) => { applyCounters(counters); setUsageOpen(false); void reloadRecords(); showNotice(locale === "cs" ? "Motohodiny byly zapsány." : "Running hours logged."); }} />}
      {editingUsage && <UsageForm locale={locale} engine={engine} record={editingUsage} onClose={() => setEditingUsage(null)} onSaved={(_record, counters) => { applyCounters(counters); setEditingUsage(null); void reloadRecords(); showNotice(locale === "cs" ? "Záznam motohodin byl opraven." : "Running-hours record corrected."); }} />}
      {serviceOpen && <ServiceEntryForm locale={locale} engine={engine} serviceParts={serviceParts} mechanics={mechanics} currentUserName={role === "mechanic" ? currentUserName : ""} onClose={() => setServiceOpen(false)} onSaved={(_record, counters) => { applyCounters(counters); setServiceOpen(false); void reloadRecords(); showNotice(locale === "cs" ? "Servisní záznam byl uložen." : "Service entry saved."); }} />}
      {editingService && <ServiceEntryForm locale={locale} engine={engine} record={editingService} serviceParts={serviceParts} mechanics={mechanics} currentUserName="" onClose={() => setEditingService(null)} onSaved={(_record, counters) => { applyCounters(counters); setEditingService(null); void reloadRecords(); showNotice(locale === "cs" ? "Servisní záznam byl opraven." : "Service record corrected."); }} />}
      {loanFormOpen && <EngineLoanCreateForm locale={locale} engine={engine} recipientOptions={recipientOptions} onClose={() => setLoanFormOpen(false)} onSaved={(location) => { onSaved({ ...engine, location }); setLoanFormOpen(false); void reloadLoans(); showNotice(locale === "cs" ? "Zápůjčka byla vytvořena." : "Loan created."); }} />}
      {extendingLoan && <EngineLoanExtendForm locale={locale} loan={extendingLoan} onClose={() => setExtendingLoan(null)} onSaved={(location) => { onSaved({ ...engine, location }); setExtendingLoan(null); void reloadLoans(); showNotice(locale === "cs" ? "Zápůjčka byla prodloužena." : "Loan extended."); }} />}
      {returningLoan && <EngineLoanReturnForm locale={locale} loan={returningLoan} onClose={() => setReturningLoan(null)} onSaved={() => { onSaved({ ...engine, location: { kind: "workshop" } }); setReturningLoan(null); void reloadLoans(); showNotice(locale === "cs" ? "Zápůjčka byla označena jako vrácená." : "Loan marked as returned."); }} />}
    </div>
  );
}

function BaselineForm({ locale, engine, onClose, onSaved }: { locale: Locale; engine: EngineRecord; onClose: () => void; onSaved: (counters: Partial<EngineRecord>) => void }) {
  const dialogRef = useModalA11y(onClose);
  const t = copy[locale];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supportsListedPistons = ["OKN", "OKN-J", "OK"].includes(engine.family);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/engine-records", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "baseline",
          engineId: engine.id,
          totalTime: formData.get("totalTime"),
          pistonTime: formData.get("pistonTime"),
          rodTime: formData.get("rodTime"),
          lastOppama: formData.get("lastOppama"),
          pistonSize: formData.get("pistonSize"),
        }),
      });
      const data = (await response.json()) as { counters?: Partial<EngineRecord>; error?: string };
      if (!response.ok || !data.counters) throw new Error(data.error || "Save failed");
      onSaved(data.counters);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal record-modal" role="dialog" aria-modal="true" aria-labelledby="baseline-form-title" tabIndex={-1}>
        <div className="modal-header"><div><span className="eyebrow">ENGINE BASELINE · {engine.code}</span><h2 id="baseline-form-title">{locale === "cs" ? "Vstupní stav motoru" : "Engine starting state"}</h2><p>{locale === "cs" ? "Stav před prvním digitálním záznamem. Pozdější záznamy se k němu automaticky přepočítají." : "State before the first digital entry. Later records will be recalculated on top of it."}</p></div><button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button></div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label><span>{locale === "cs" ? "Celkem na motoru" : "Engine total"} *</span><input name="totalTime" defaultValue={formatHours(engine.baselineTotalMinutes)} inputMode="numeric" pattern="[0-9]{1,4}:[0-5][0-9]" placeholder="16:29" required autoFocus /></label>
            <label><span>{locale === "cs" ? "Píst od výměny" : "Piston since replacement"} *</span><input name="pistonTime" defaultValue={formatHours(engine.baselinePistonMinutes)} inputMode="numeric" pattern="[0-9]{1,4}:[0-5][0-9]" placeholder="02:11" required /></label>
            <label><span>{locale === "cs" ? "Ojnice / klika od výměny" : "Rod / crank since replacement"} *</span><input name="rodTime" defaultValue={formatHours(engine.baselineRodMinutes)} inputMode="numeric" pattern="[0-9]{1,4}:[0-5][0-9]" placeholder="06:48" required /></label>
            <label><span>{locale === "cs" ? "Poslední Oppama" : "Last Oppama"} *</span><input name="lastOppama" defaultValue={formatHours(engine.baselineLastOppamaMinutes)} inputMode="numeric" pattern="[0-9]{1,4}:[0-5][0-9]" placeholder="01:24" required /></label>
            {supportsListedPistons && <label><span>{locale === "cs" ? "Aktuální rozměr pístu" : "Current piston size"}</span><select name="pistonSize" defaultValue={engine.baselinePistonSize}><option value="">{locale === "cs" ? "Nevyplněno" : "Not entered"}</option>{pistonSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>}
          </div>
          <p className="baseline-warning">{locale === "cs" ? "Tuto část používá superadmin při zavedení existujícího motoru nebo při opravě počátečních údajů." : "Superadmin uses this when importing an existing engine or correcting its starting values."}</p>
          {error && <p className="form-error">{friendlyRecordError(error, locale)}</p>}
          <div className="modal-actions"><span className="modal-actions-spacer" /><button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? t.saving : locale === "cs" ? "Uložit vstupní stav" : "Save starting state"}</button></div>
        </form>
      </section>
    </div>
  );
}

function UsageForm({ locale, engine, record = null, onClose, onSaved }: { locale: Locale; engine: EngineRecord; record?: UsageRecord | null; onClose: () => void; onSaved: (record: UsageRecord, counters: Partial<EngineRecord>) => void }) {
  const dialogRef = useModalA11y(onClose);
  const t = copy[locale];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = Boolean(record);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const payload = {
      kind: "usage",
      recordId: record?.id,
      engineId: engine.id,
      date: formData.get("date"),
      oppama: formData.get("oppama"),
      raceName: formData.get("raceName"),
      driverName: formData.get("driverName"),
      notes: formData.get("notes"),
    };
    try {
      const response = await fetch("/api/engine-records", { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await response.json()) as { usage?: UsageRecord; counters?: Partial<EngineRecord>; error?: string };
      if (!response.ok || !data.usage || !data.counters) throw new Error(data.error || "Save failed");
      onSaved(data.usage, data.counters);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal record-modal" role="dialog" aria-modal="true" aria-labelledby="usage-form-title" tabIndex={-1}>
        <div className="modal-header"><div><span className="eyebrow">OPPAMA · {engine.code}</span><h2 id="usage-form-title">{editing ? (locale === "cs" ? "Opravit motohodiny" : "Correct running hours") : t.logHours}</h2><p>{locale === "cs" ? "Opiš stav z motohodin přesně, například 01:24." : "Copy the running meter exactly, for example 01:24."}</p></div><button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button></div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label><span>{locale === "cs" ? "Datum" : "Date"} *</span><input name="date" type="date" defaultValue={record?.entryDate ?? todayInputValue()} required /></label>
            <label><span>Oppama HH:MM *</span><input name="oppama" defaultValue={record ? formatHours(record.oppamaMinutes) : ""} inputMode="numeric" placeholder="01:24" pattern="[0-9]{1,3}:[0-5][0-9]" required autoFocus /></label>
            <label><span>{locale === "cs" ? "Závod / akce" : "Race / event"}</span><input name="raceName" defaultValue={record?.raceName ?? ""} placeholder="Laitse 2026" maxLength={120} /></label>
            <label><span>{locale === "cs" ? "Pilot" : "Driver"}</span><input name="driverName" defaultValue={record?.driverName ?? ""} placeholder={t.notAssigned} maxLength={120} /></label>
            <label className="full-field"><span>{t.notes}</span><textarea name="notes" rows={3} defaultValue={record?.notes ?? ""} placeholder={locale === "cs" ? "Například: stav po finále…" : "For example: reading after the final…"} /></label>
          </div>
          <div className="counter-preview"><div><span>{locale === "cs" ? "Píst nyní" : "Piston now"}</span><strong>{formatHours(engine.pistonMinutes)}</strong></div><b>＋ Oppama</b><div><span>{locale === "cs" ? "Ojnice nyní" : "Rod now"}</span><strong>{formatHours(engine.rodMinutes)}</strong></div></div>
          {error && <p className="form-error">{friendlyRecordError(error, locale)}</p>}
          <div className="modal-actions"><span className="modal-actions-spacer" /><button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? t.saving : editing ? (locale === "cs" ? "Uložit opravu" : "Save correction") : t.logHours}</button></div>
        </form>
      </section>
    </div>
  );
}

function ServiceEntryForm({ locale, engine, record = null, serviceParts, mechanics, currentUserName, onClose, onSaved }: {
  locale: Locale;
  engine: EngineRecord;
  record?: ServiceRecord | null;
  serviceParts: ServicePart[];
  mechanics: Array<{ id: string; name: string }>;
  currentUserName: string;
  onClose: () => void;
  onSaved: (record: ServiceRecord, counters: Partial<EngineRecord>) => void;
}) {
  const dialogRef = useModalA11y(onClose);
  const t = copy[locale];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedParts, setSelectedParts] = useState<string[]>(record?.replacedParts ?? []);
  const defaultMechanicId = record?.mechanicId
    ?? mechanics.find((mechanic) => mechanic.name.trim().toLowerCase() === currentUserName.trim().toLowerCase())?.id
    ?? "";
  const [mechanicId, setMechanicId] = useState(defaultMechanicId);
  const editing = Boolean(record);
  const tracksHours = !NO_HOUR_TRACKING_ENGINE_FAMILIES.includes(engine.family);
  const autoReady = AUTO_READY_ON_SERVICE_ENGINE_FAMILIES.includes(engine.family);
  const supportsListedPistons = ["OKJ", "OKN", "OKN-J", "OK"].includes(engine.family);
  const resetsPiston = selectedParts.includes("piston") || selectedParts.includes("connecting_rod");

  function togglePart(partId: string) {
    setSelectedParts((current) => current.includes(partId) ? current.filter((part) => part !== partId) : [...current, partId]);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const payload = {
      kind: "service",
      recordId: record?.id,
      engineId: engine.id,
      date: formData.get("date"),
      serviceType: formData.get("serviceType"),
      replacedParts: selectedParts,
      mechanicId,
      pistonSize: formData.get("pistonSize"),
      notes: formData.get("notes"),
    };
    try {
      const response = await fetch("/api/engine-records", { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await response.json()) as { service?: ServiceRecord; counters?: Partial<EngineRecord>; error?: string };
      if (!response.ok || !data.service || !data.counters) throw new Error(data.error || "Save failed");
      onSaved(data.service, data.counters);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal service-modal" role="dialog" aria-modal="true" aria-labelledby="service-form-title" tabIndex={-1}>
        <div className="modal-header"><div><span className="eyebrow">SERVICE CARD · {engine.code}</span><h2 id="service-form-title">{editing ? (locale === "cs" ? "Opravit servisní záznam" : "Correct service record") : t.addServiceEntry}</h2><p>{locale === "cs" ? "Zaškrtni skutečně vyměněné díly. Počítadla se resetují automaticky." : "Select the parts actually replaced. Counters reset automatically."}</p></div><button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button></div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label><span>{locale === "cs" ? "Datum servisu" : "Service date"} *</span><input name="date" type="date" defaultValue={record?.serviceDate ?? todayInputValue()} required /></label>
            <label><span>{locale === "cs" ? "Typ servisu" : "Service type"} *</span><select name="serviceType" defaultValue={record?.serviceType ?? "piston_service"}><option value="inspection">{locale === "cs" ? "Kontrola" : "Inspection"}</option><option value="piston_service">{locale === "cs" ? "Servis pístu" : "Piston service"}</option><option value="top_end">Top end</option><option value="full_service">{locale === "cs" ? "Kompletní servis" : "Full service"}</option></select></label>
            <label><span>{locale === "cs" ? "Mechanik" : "Mechanic"} *</span><select name="mechanicId" value={mechanicId} onChange={(event) => setMechanicId(event.target.value)} required><option value="" disabled>{locale === "cs" ? "Vyber mechanika" : "Select mechanic"}</option>{mechanics.map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.name}</option>)}</select></label>
          </div>

          <fieldset className="parts-fieldset"><legend>{locale === "cs" ? "Vyměněné díly" : "Replaced parts"}</legend><div className="parts-grid">{serviceParts.map((part) => <label key={part.id} className={selectedParts.includes(part.id) ? "selected" : ""}><input type="checkbox" checked={selectedParts.includes(part.id)} onChange={() => togglePart(part.id)} /><span>✓</span><strong>{locale === "cs" ? part.cs : part.en}</strong></label>)}</div></fieldset>

          {resetsPiston && supportsListedPistons && <label className="piston-size-field"><span>{locale === "cs" ? "Nový rozměr pístu" : "New piston size"} *</span><select name="pistonSize" defaultValue={record?.pistonSize && pistonSizeOptions.includes(record.pistonSize) ? record.pistonSize : engine.currentPistonSize && pistonSizeOptions.includes(engine.currentPistonSize) ? engine.currentPistonSize : ""} required><option value="" disabled>{locale === "cs" ? "Vyber rozměr" : "Select size"}</option>{pistonSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}</select><small>{locale === "cs" ? `Výběr platný pro ${engine.family}.` : `Options for ${engine.family}.`}</small></label>}
          {tracksHours && resetsPiston && !supportsListedPistons && <p className="form-hint">{locale === "cs" ? `Pro ${engine.family} zatím velikost pístu nevybíráme; doplníme správný seznam samostatně.` : `Piston sizes for ${engine.family} will be added separately.`}</p>}

          <label className="standalone-textarea"><span>{locale === "cs" ? "Poznámka / specifikace dílů" : "Notes / parts specification"}</span><textarea name="notes" rows={3} defaultValue={record?.notes ?? ""} placeholder={locale === "cs" ? "Například značka, typ dílu, naměřené hodnoty…" : "For example brand, part type, measured values…"} /></label>

          {tracksHours && <div className="reset-preview"><div><span>{locale === "cs" ? "Počítadlo pístu" : "Piston counter"}</span><strong>{formatHours(engine.pistonMinutes)} → {resetsPiston ? "00:00" : formatHours(engine.pistonMinutes)}</strong></div><div><span>{locale === "cs" ? "Počítadlo ojnice" : "Rod counter"}</span><strong>{formatHours(engine.rodMinutes)} → {selectedParts.includes("connecting_rod") ? "00:00" : formatHours(engine.rodMinutes)}</strong></div></div>}
          {tracksHours && selectedParts.includes("connecting_rod") && <p className="form-hint">{locale === "cs" ? "Výměna kompletní ojnice vynuluje také počítadlo pístu." : "Replacing the complete connecting rod also resets the piston counter."}</p>}
          {autoReady && <p className="form-hint">{locale === "cs" ? "Po uložení se stav motoru automaticky přepne na Připraveno." : "Saving will automatically switch the engine status to Ready."}</p>}
          {error && <p className="form-error">{friendlyRecordError(error, locale)}</p>}
          <div className="modal-actions"><span className="modal-actions-spacer" /><button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? t.saving : editing ? (locale === "cs" ? "Uložit opravu" : "Save correction") : locale === "cs" ? "Uložit servis" : "Save service"}</button></div>
        </form>
      </section>
    </div>
  );
}

function LoanRecipientSelect({ recipientOptions, locale, defaultValue }: { recipientOptions: LoanRecipientOption[]; locale: Locale; defaultValue?: string }) {
  const customers = recipientOptions.filter((option) => option.type === "customer");
  const teams = recipientOptions.filter((option) => option.type === "team");
  const drivers = recipientOptions.filter((option) => option.type === "driver");
  return (
    <select name="recipient" defaultValue={defaultValue ?? ""} required>
      <option value="" disabled>{locale === "cs" ? "Vyber příjemce" : "Select recipient"}</option>
      {customers.length > 0 && <optgroup label={locale === "cs" ? "Zákazníci" : "Customers"}>{customers.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>}
      {teams.length > 0 && <optgroup label={locale === "cs" ? "Týmy" : "Teams"}>{teams.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>}
      {drivers.length > 0 && <optgroup label={locale === "cs" ? "Piloti" : "Drivers"}>{drivers.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>}
    </select>
  );
}

function EngineLoanCreateForm({ locale, engine, recipientOptions, onClose, onSaved }: {
  locale: Locale;
  engine: EngineRecord;
  recipientOptions: LoanRecipientOption[];
  onClose: () => void;
  onSaved: (location: EngineLocation) => void;
}) {
  const dialogRef = useModalA11y(onClose);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const recipientValue = String(formData.get("recipient") ?? "");
    const [recipientType, recipientId] = recipientValue.split(":");
    const recipientLabel = recipientOptions.find((option) => option.value === recipientValue)?.label ?? "";
    const startDate = String(formData.get("startDate") ?? "");
    const expectedReturnDate = String(formData.get("expectedReturnDate") ?? "");
    const notes = String(formData.get("notes") ?? "");
    try {
      const response = await fetch("/api/engine-loans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ engineId: engine.id, recipientType, recipientId, startDate, expectedReturnDate, notes }),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error || "Save failed");
      onSaved({ kind: "loan", recipientName: recipientLabel, expectedReturnDate, overdue: expectedReturnDate < todayInputValue() });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal service-modal" role="dialog" aria-modal="true" aria-labelledby="loan-form-title" tabIndex={-1}>
        <div className="modal-header"><div><span className="eyebrow">SERVICE CARD · {engine.code}</span><h2 id="loan-form-title">{locale === "cs" ? "Zapůjčit motor" : "Lend engine"}</h2><p>{locale === "cs" ? "Motor nepůjde přiřadit na závod, dokud se zápůjčka neoznačí jako vrácená." : "The engine can't be assigned to a race until the loan is marked as returned."}</p></div><button className="close-button" type="button" onClick={onClose} aria-label={locale === "cs" ? "Zavřít" : "Close"}>×</button></div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label><span>{locale === "cs" ? "Příjemce" : "Recipient"} *</span><LoanRecipientSelect recipientOptions={recipientOptions} locale={locale} /></label>
            <label><span>{locale === "cs" ? "Od" : "From"} *</span><input name="startDate" type="date" defaultValue={todayInputValue()} required /></label>
            <label><span>{locale === "cs" ? "Očekávaný návrat do" : "Expected return by"} *</span><input name="expectedReturnDate" type="date" defaultValue={todayInputValue()} required /></label>
          </div>
          <label className="standalone-textarea"><span>{locale === "cs" ? "Poznámka" : "Notes"}</span><textarea name="notes" rows={3} placeholder={locale === "cs" ? "Například důvod zápůjčky…" : "For example the reason for the loan…"} /></label>
          {error && <p className="form-error">{localizeLoanError(error, locale)}</p>}
          <div className="modal-actions"><span className="modal-actions-spacer" /><button className="secondary-compact" type="button" onClick={onClose}>{locale === "cs" ? "Zrušit" : "Cancel"}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? (locale === "cs" ? "Ukládám…" : "Saving…") : (locale === "cs" ? "Zapůjčit" : "Lend")}</button></div>
        </form>
      </section>
    </div>
  );
}

function EngineLoanExtendForm({ locale, loan, onClose, onSaved }: {
  locale: Locale;
  loan: EngineLoanRecord;
  onClose: () => void;
  onSaved: (location: EngineLocation) => void;
}) {
  const dialogRef = useModalA11y(onClose);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const expectedReturnDate = String(formData.get("expectedReturnDate") ?? "");
    try {
      const response = await fetch("/api/engine-loans", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: loan.id, expectedReturnDate }),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error || "Save failed");
      onSaved({ kind: "loan", recipientName: loan.recipientName, expectedReturnDate, overdue: expectedReturnDate < todayInputValue() });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal" role="dialog" aria-modal="true" aria-labelledby="loan-extend-title" tabIndex={-1}>
        <div className="modal-header"><div><span className="eyebrow">SERVICE CARD</span><h2 id="loan-extend-title">{locale === "cs" ? "Prodloužit zápůjčku" : "Extend loan"}</h2><p>{locale === "cs" ? `Příjemce: ${loan.recipientName}` : `Recipient: ${loan.recipientName}`}</p></div><button className="close-button" type="button" onClick={onClose} aria-label={locale === "cs" ? "Zavřít" : "Close"}>×</button></div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label><span>{locale === "cs" ? "Nový očekávaný návrat do" : "New expected return by"} *</span><input name="expectedReturnDate" type="date" defaultValue={loan.expectedReturnDate} required /></label>
          </div>
          {error && <p className="form-error">{localizeLoanError(error, locale)}</p>}
          <div className="modal-actions"><span className="modal-actions-spacer" /><button className="secondary-compact" type="button" onClick={onClose}>{locale === "cs" ? "Zrušit" : "Cancel"}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? (locale === "cs" ? "Ukládám…" : "Saving…") : (locale === "cs" ? "Prodloužit" : "Extend")}</button></div>
        </form>
      </section>
    </div>
  );
}

function EngineLoanReturnForm({ locale, loan, onClose, onSaved }: {
  locale: Locale;
  loan: EngineLoanRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialogRef = useModalA11y(onClose);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const actualReturnDate = String(formData.get("actualReturnDate") ?? "");
    try {
      const response = await fetch("/api/engine-loans", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: loan.id, actualReturnDate }),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error || "Save failed");
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal" role="dialog" aria-modal="true" aria-labelledby="loan-return-title" tabIndex={-1}>
        <div className="modal-header"><div><span className="eyebrow">SERVICE CARD</span><h2 id="loan-return-title">{locale === "cs" ? "Označit vrácení" : "Mark returned"}</h2><p>{locale === "cs" ? `Příjemce: ${loan.recipientName}` : `Recipient: ${loan.recipientName}`}</p></div><button className="close-button" type="button" onClick={onClose} aria-label={locale === "cs" ? "Zavřít" : "Close"}>×</button></div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label><span>{locale === "cs" ? "Datum vrácení" : "Return date"} *</span><input name="actualReturnDate" type="date" defaultValue={todayInputValue()} required /></label>
          </div>
          {error && <p className="form-error">{localizeLoanError(error, locale)}</p>}
          <div className="modal-actions"><span className="modal-actions-spacer" /><button className="secondary-compact" type="button" onClick={onClose}>{locale === "cs" ? "Zrušit" : "Cancel"}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? (locale === "cs" ? "Ukládám…" : "Saving…") : (locale === "cs" ? "Motor se vrátil" : "Engine returned")}</button></div>
        </form>
      </section>
    </div>
  );
}

function ServiceHistoryTable({ records, locale, canCorrect, onEdit, onDelete }: { records: ServiceRecord[]; locale: Locale; canCorrect: boolean; onEdit: (record: ServiceRecord) => void; onDelete: (recordId: string) => void }) {
  return (
    <div className="records-table-wrap">
      <div className="records-title"><h3>{locale === "cs" ? "Historie servisu" : "Service history"}</h3>{canCorrect && <small>{locale === "cs" ? "Opravy jsou dostupné pouze superadminovi." : "Corrections are limited to superadmin."}</small>}</div>
      <div className="table-wrap"><table className="records-table zebra"><thead><tr><th>{locale === "cs" ? "Datum" : "Date"}</th><th>{locale === "cs" ? "Typ" : "Type"}</th><th>{locale === "cs" ? "Vyměněno" : "Replaced"}</th><th>{locale === "cs" ? "Stav před servisem" : "Before service"}</th><th>{locale === "cs" ? "Mechanik" : "Mechanic"}</th>{canCorrect && <th>{locale === "cs" ? "Oprava" : "Correction"}</th>}</tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><strong>{formatDisplayDate(record.serviceDate, locale)}</strong></td><td>{serviceTypeLabel(record.serviceType, locale)}</td><td>{record.replacedParts.length ? record.replacedParts.map((part) => servicePartLabel(record, part, locale)).join(", ") : (locale === "cs" ? "Pouze kontrola" : "Inspection only")}{record.pistonSize ? <small className="cell-note">{locale === "cs" ? "Píst" : "Piston"}: {record.pistonSize}</small> : null}</td><td><small>{locale === "cs" ? "Píst" : "Piston"}: {formatHours(record.pistonMinutesBefore)}</small><small className="cell-note">{locale === "cs" ? "Ojnice" : "Rod"}: {formatHours(record.rodMinutesBefore)}</small></td><td>{record.mechanicName || <span className="cell-note">{record.createdBy}</span>}</td>{canCorrect && <td><div className="record-actions"><button type="button" onClick={() => onEdit(record)}>{locale === "cs" ? "Upravit" : "Edit"}</button><button className="delete" type="button" onClick={() => onDelete(record.id)}>{locale === "cs" ? "Smazat" : "Delete"}</button></div></td>}</tr>)}</tbody></table></div>
    </div>
  );
}

function UsageHistoryTable({ records, locale, canCorrect, onEdit, onDelete }: { records: UsageRecord[]; locale: Locale; canCorrect: boolean; onEdit: (record: UsageRecord) => void; onDelete: (recordId: string) => void }) {
  return (
    <div className="records-table-wrap">
      <div className="records-title"><h3>{locale === "cs" ? "Historie Oppama" : "Oppama history"}</h3>{canCorrect && <small>{locale === "cs" ? "Opravy jsou dostupné pouze superadminovi." : "Corrections are limited to superadmin."}</small>}</div>
      <div className="table-wrap"><table className="records-table zebra"><thead><tr><th>{locale === "cs" ? "Datum" : "Date"}</th><th>Oppama</th><th>{locale === "cs" ? "Závod / akce" : "Race / event"}</th><th>{locale === "cs" ? "Pilot" : "Driver"}</th><th>{locale === "cs" ? "Poznámka" : "Notes"}</th>{canCorrect && <th>{locale === "cs" ? "Oprava" : "Correction"}</th>}</tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><strong>{formatDisplayDate(record.entryDate, locale)}</strong></td><td><strong>{formatHours(record.oppamaMinutes)}</strong></td><td>{record.raceName || "—"}</td><td>{record.driverName || "—"}</td><td>{record.notes || "—"}</td>{canCorrect && <td><div className="record-actions"><button type="button" onClick={() => onEdit(record)}>{locale === "cs" ? "Upravit" : "Edit"}</button><button className="delete" type="button" onClick={() => onDelete(record.id)}>{locale === "cs" ? "Smazat" : "Delete"}</button></div></td>}</tr>)}</tbody></table></div>
    </div>
  );
}

function TechnicalForm({ locale, engine, technicalStructure, technicalValues, onClose, onSaved }: {
  locale: Locale;
  engine: EngineRecord;
  technicalStructure: TechnicalStructureData;
  technicalValues: Record<string, string>;
  onClose: () => void;
  onSaved: (engine: EngineRecord, technicalValues?: Record<string, string>) => void;
}) {
  const dialogRef = useModalA11y(onClose);
  const t = copy[locale];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const technicalSections = technicalStructure.sections.filter((section) => section.family === engine.family).sort((a, b) => a.sortOrder - b.sortOrder);
  const hasTechnicalStructure = technicalSections.length > 0;
  function fieldsForSection(sectionId: string) {
    return technicalStructure.fields.filter((field) => field.sectionId === sectionId).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  function optionsForField(fieldId: string) {
    return technicalStructure.options.filter((option) => option.fieldId === fieldId).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const legacyFields = [
    { name: "pistonSpec", label: locale === "cs" ? "Píst / rozměr / úhel" : "Piston / size / angle", value: engine.pistonSpec, placeholder: "83 4°" },
    { name: "cylinderCode", label: locale === "cs" ? "Označení válce" : "Cylinder code", value: engine.cylinderCode, placeholder: "N5" },
    { name: "cylinderUpgrade", label: locale === "cs" ? "Úprava válce" : "Cylinder upgrade", value: engine.cylinderUpgrade, placeholder: "N5 TUNED" },
    { name: "liner", label: "Liner", value: engine.liner, placeholder: "" },
    { name: "degree", label: "Degree", value: engine.degree, placeholder: "175.8" },
    { name: "timing", label: "Timing", value: engine.timing, placeholder: "3.5" },
    { name: "carter", label: "Carter", value: engine.carter, placeholder: "20B" },
    { name: "reeds", label: "Reeds", value: engine.reeds, placeholder: "TUNED" },
    { name: "spacer", label: "Spacer", value: engine.spacer, placeholder: "" },
    { name: "squish", label: "Squish", value: engine.squish, placeholder: "89" },
  ];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const body: Record<string, unknown> = { id: engine.id };
    if (hasTechnicalStructure) {
      body.technicalValues = Object.fromEntries(technicalSections.flatMap((section) => fieldsForSection(section.id)).map((field) => [field.id, formData.get(field.id) ?? ""]));
    } else {
      for (const field of legacyFields) body[field.name] = formData.get(field.name);
    }
    try {
      const response = await fetch("/api/engines", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await response.json()) as { technical?: Partial<EngineRecord>; technicalValues?: Record<string, string>; updatedAt?: number; error?: string };
      if (!response.ok || !data.technical) throw new Error(data.error || "Save failed");
      onSaved({ ...engine, ...data.technical, updatedAt: data.updatedAt ?? Date.now() }, data.technicalValues);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal" role="dialog" aria-modal="true" aria-labelledby="technical-form-title" tabIndex={-1}>
        <div className="modal-header"><div><span className="eyebrow">ENGINE CARD · {engine.code}</span><h2 id="technical-form-title">{t.editTechnical}</h2></div><button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button></div>
        <form onSubmit={submit}>
          {hasTechnicalStructure ? (
            technicalSections.map((section) => (
              <fieldset key={section.id} style={{ border: "none", padding: 0, margin: "0 0 var(--wrc-space-16) 0" }}>
                <legend style={{ marginBottom: "var(--wrc-space-8)" }}><strong>{locale === "cs" ? section.labelCs : section.labelEn}</strong></legend>
                <div className="form-grid">
                  {fieldsForSection(section.id).map((field) => (
                    <label key={field.id}>
                      <span>{locale === "cs" ? field.labelCs : field.labelEn}</span>
                      {field.fieldType === "select" ? (
                        <select name={field.id} defaultValue={technicalValues[field.id] ?? ""}>
                          <option value="">{locale === "cs" ? "— Nevybráno —" : "— Not selected —"}</option>
                          {optionsForField(field.id).map((option) => <option key={option.id} value={option.id}>{locale === "cs" ? option.valueCs : option.valueEn}</option>)}
                        </select>
                      ) : (
                        <input name={field.id} defaultValue={technicalValues[field.id] ?? ""} maxLength={100} />
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))
          ) : (
            <div className="form-grid">{legacyFields.map((field) => <label key={field.name}><span>{field.label}</span><input name={field.name} defaultValue={field.value} placeholder={field.placeholder} maxLength={100} /></label>)}</div>
          )}
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions"><span className="modal-actions-spacer" /><button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? t.saving : t.saveTechnical}</button></div>
        </form>
      </section>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div className="detail-field"><span>{label}</span><strong>{value}</strong></div>;
}

function friendlyEngineError(error: string, locale: Locale) {
  if (error === "Engine code already exists in this category") {
    return locale === "cs"
      ? "Motor s tímto číslem už v této kategorii existuje."
      : "An engine with this code already exists in this category.";
  }
  return error;
}

function EngineForm({ locale, engine, role, onClose, onSaved, onDeleted }: { locale: Locale; engine: EngineRecord | null; role: AppSession["role"]; onClose: () => void; onSaved: (engine: EngineRecord) => void; onDeleted: (engineId: string) => void }) {
  const dialogRef = useModalA11y(onClose);
  const t = copy[locale];
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [family, setFamily] = useState<EngineRecord["family"]>(engine?.family ?? "OKN");
  const [labelColor, setLabelColor] = useState(engine?.labelColor ?? "");
  const editing = Boolean(engine);
  const canEditPermanent = editing && role === "superadmin";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const payload = {
      id: engine?.id,
      code: formData.get("code"),
      family: canEditPermanent || !editing ? formData.get("family") : engine?.family,
      ignition: canEditPermanent || !editing ? formData.get("ignition") : engine?.ignition,
      kzGeneration: canEditPermanent || !editing ? formData.get("kzGeneration") : engine?.kzGeneration,
      currentConfiguration: formData.get("currentConfiguration"),
      upgradeCode: formData.get("upgradeCode"),
      labelColor,
      purchaseDate: formData.get("purchaseDate"),
      notes: formData.get("notes"),
      status: editing ? formData.get("status") : "ready",
    };

    try {
      const response = await fetch("/api/engines", {
        method: editing ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { engine?: EngineRecord; error?: string };
      if (!response.ok || !data.engine) throw new Error(data.error || "Save failed");
      onSaved(data.engine);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed");
      setSaving(false);
    }
  }

  async function removeEngine() {
    if (!engine || role !== "superadmin") return;
    const question = locale === "cs"
      ? `Opravdu chceš smazat motor ${engine.code}? Motor zmizí ze seznamu, ale jeho historie zůstane zachována.`
      : `Delete engine ${engine.code}? It will disappear from the list, but its history will be preserved.`;
    if (!window.confirm(question)) return;

    setDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/engines", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: engine.id }),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error || "Delete failed");
      onDeleted(data.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed");
      setDeleting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal" role="dialog" aria-modal="true" aria-labelledby="engine-form-title" tabIndex={-1}>
        <div className="modal-header">
          <div><span className="eyebrow">MM SYSTEM</span><h2 id="engine-form-title">{editing ? t.editEngine : t.newEngine}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label><span>{t.code} *</span><input name="code" placeholder="I74A (S)" defaultValue={engine?.code ?? ""} required maxLength={24} autoFocus /><small className="field-help">{locale === "cs" ? "Lze použít mezery, závorky, tečku, lomítko, +, _ a pomlčku." : "Spaces, brackets, dot, slash, +, _ and dash are allowed."}</small></label>
            <label><span>{t.engineFamily} *</span><select name="family" value={family} disabled={editing && !canEditPermanent} onChange={(event) => setFamily(event.target.value as EngineRecord["family"])}><option>MINI</option><option>OKJ</option><option>OKN</option><option>OKN-J</option><option>OK</option><option>KZ</option></select></label>
            <label><span>{t.ignition}</span><select name="ignition" defaultValue={engine?.ignition ?? ""} disabled={editing && !canEditPermanent}><option value="">{locale === "cs" ? "Nevyplněno" : "Not specified"}</option><option value="PVL">PVL</option><option value="SELETTRA">Selettra</option></select></label>
            {family === "KZ" && <label><span>{t.kzGeneration} *</span><select name="kzGeneration" defaultValue={engine?.kzGeneration ?? "R3"} disabled={editing && !canEditPermanent}><option>R2</option><option>R3</option></select></label>}
            {family === "MINI" && <label><span>{t.configuration} *</span><select name="currentConfiguration" defaultValue={engine?.currentConfiguration ?? "MINI"}><option>MINI</option><option>MINI 3</option><option>MINI 4</option><option>BABY</option><option>BABY 3</option><option>BABY 4</option></select></label>}
            <label><span>{t.upgrade}</span><input name="upgradeCode" placeholder="A12/LA4" defaultValue={engine?.upgradeCode ?? ""} maxLength={40} /><small className="field-help">{locale === "cs" ? "Např. A12/LA4, A5 + * nebo A11 + 2*vol." : "For example A12/LA4, A5 + * or A11 + 2*vol."}</small></label>
            <label><span>{t.purchaseDate}</span><input name="purchaseDate" type="date" defaultValue={engine?.purchaseDate ?? ""} /></label>
            {editing && <label><span>{t.status}</span><select name="status" defaultValue={engine?.status ?? "ready"}><option value="ready">{t.ready}</option><option value="service_soon">{t.due}</option><option value="service">{t.service}</option><option value="rebuild">{t.rebuild}</option><option value="storage">{t.storage}</option><option value="retired">{locale === "cs" ? "Vyřazen" : "Retired"}</option></select></label>}
            <div className="form-readonly"><span>{t.hoursTracking}</span><strong>{NO_HOUR_TRACKING_ENGINE_FAMILIES.includes(family) ? t.byRaces : t.byHours}</strong></div>
            <div className="engine-color-field full-field">
              <div className="engine-color-field-heading"><span>{locale === "cs" ? "Barevné označení motoru" : "Engine colour label"}</span><div className="engine-color-preview">{labelColor && <i style={{ backgroundColor: labelColor }} />}<strong>{engine?.code || (locale === "cs" ? "Náhled motoru" : "Engine preview")}</strong>{engine?.upgradeCode && <small>· {engine.upgradeCode}</small>}</div></div>
              <div className="engine-color-picker" aria-label={locale === "cs" ? "Paleta barev motoru" : "Engine colour palette"}>
                <button className={`engine-no-color ${!labelColor ? "selected" : ""}`} type="button" onClick={() => setLabelColor("")}>{locale === "cs" ? "Bez barvy" : "No colour"}</button>
                {engineLabelPalette.map((color) => <button key={color} className={`engine-color-swatch ${labelColor === color ? "selected" : ""}`} style={{ backgroundColor: color }} type="button" title={color} aria-label={`${locale === "cs" ? "Barva" : "Colour"} ${color}`} onClick={() => setLabelColor(color)} />)}
                <label className="engine-custom-color"><span>{locale === "cs" ? "Vlastní" : "Custom"}</span><input type="color" value={labelColor || "#D52F2D"} onChange={(event) => setLabelColor(event.target.value.toUpperCase())} /></label>
              </div>
            </div>
            {editing && <p className="form-hint full-field">{canEditPermanent ? t.superadminFields : t.permanentFields}</p>}
            <label className="full-field"><span>{t.notes}</span><textarea name="notes" rows={3} defaultValue={engine?.notes ?? ""} placeholder={locale === "cs" ? "Základní informace o motoru…" : "Basic engine information…"} /></label>
          </div>
          {error && <p className="form-error">{friendlyEngineError(error, locale)}</p>}
          <div className="modal-actions">
            {editing && role === "superadmin" && <button className="danger-button" type="button" onClick={removeEngine} disabled={saving || deleting}>{deleting ? t.deleting : t.deleteEngine}</button>}
            <span className="modal-actions-spacer" />
            <button className="secondary-compact" type="button" onClick={onClose} disabled={saving || deleting}>{t.cancel}</button>
            <button className="primary-button" type="submit" disabled={saving || deleting}>{saving ? t.saving : editing ? t.saveChanges : t.saveEngine}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function activityDescription(item: ActivityRecord, locale: Locale) {
  const actionsCs: Record<string, string> = {
    create: "Vytvoření", update: "Úprava", archive: "Odstranění", delete: "Odstranění",
    service: "Zápis servisu", assign: "Přiřazení", confirm: "Potvrzení", unconfirm: "Zrušení potvrzení",
    remove_from_race: "Odebrání ze závodu", void: "Stornování", delete_logo: "Odstranění loga", delete_image: "Odstranění obrázku",
    upload_logo: "Nahrání loga", upload_image: "Nahrání obrázku", set_engine_baseline: "Nastavení výchozího stavu",
    log_usage: "Zápis motohodin", correct_usage: "Oprava motohodin", correct_service: "Oprava servisu",
    update_technical: "Úprava technických údajů", delete_service: "Odstranění servisu",
  };
  const entitiesCs: Record<string, string> = {
    task: "úkolu", race: "závodu", race_entry: "pilota v závodě", race_mechanic: "mechanika",
    race_vehicle: "auta", race_extra: "extra vybavení", race_delivery: "předávky", sale: "prodeje",
    engine: "motoru", engine_record: "karty motoru", carburetor: "karburátoru", carburetorType: "typu karburátoru",
    driver: "pilota", team: "týmu", mechanic: "mechanika", vehicle: "auta", raceType: "typu závodu",
    race_followup_notes: "poznámek k závodu", accommodation: "ubytování", flight: "letenky", rental: "pronájmu auta",
    app_user: "uživatele", circuit: "tratě", race_finance: "financí závodu", engine_usage: "motohodin motoru", clothing_item: "oblečení", clothing_assignment: "oblečení mechanika",
    engine_service: "servisu motoru",
  };
  const actionsEn: Record<string, string> = {
    create: "Created", update: "Updated", archive: "Archived", delete: "Deleted", service: "Service logged",
    assign: "Assigned", confirm: "Confirmed", unconfirm: "Unconfirmed", remove_from_race: "Removed from race", void: "Voided",
    upload_logo: "Uploaded logo for", upload_image: "Uploaded image for", delete_logo: "Removed logo from", delete_image: "Removed image from",
    set_engine_baseline: "Set baseline for", log_usage: "Logged usage for", correct_usage: "Corrected usage for",
    correct_service: "Corrected service for", update_technical: "Updated technical data for", delete_service: "Removed service from",
  };
  const entitiesEn: Record<string, string> = {
    task: "task", race: "race", race_entry: "race driver", race_mechanic: "mechanic", race_vehicle: "vehicle",
    race_extra: "extra equipment", race_delivery: "delivery", sale: "sale", engine: "engine", engine_record: "engine card",
    carburetor: "carburetor", carburetorType: "carburetor type", driver: "driver", team: "team", mechanic: "mechanic",
    vehicle: "vehicle", raceType: "race type", race_followup_notes: "race notes", accommodation: "accommodation",
    flight: "flight", rental: "car rental", app_user: "user", circuit: "circuit", race_finance: "race finance", clothing_item: "clothing item", clothing_assignment: "mechanic clothing",
    engine_usage: "engine usage", engine_service: "engine service",
  };
  if (locale === "en") return `${actionsEn[item.action] ?? "Changed"} ${entitiesEn[item.entityType] ?? "record"}${item.subject ? ` · ${item.subject}` : ""}`;
  return `${actionsCs[item.action] ?? "Změna"} ${entitiesCs[item.entityType] ?? "záznamu"}${item.subject ? ` · ${item.subject}` : ""}`;
}

function relativeActivityTime(createdAt: number, locale: Locale) {
  const diffMinutes = Math.max(0, Math.round((Date.now() - createdAt) / 60_000));
  if (diffMinutes < 1) return locale === "cs" ? "právě teď" : "now";
  if (diffMinutes < 60) return locale === "cs" ? `před ${diffMinutes} min` : `${diffMinutes} min ago`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return locale === "cs" ? `před ${hours} h` : `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return locale === "cs" ? `před ${days} d` : `${days} d ago`;
}

function timeGreeting(locale: Locale, fullName: string, hour: number) {
  const firstName = fullName.trim().split(/\s+/)[0] || (locale === "cs" ? "uživateli" : "there");
  if (locale === "en") {
    const greeting = hour < 5 ? "Good night" : hour < 9 ? "Good morning" : hour < 12 ? "Good late morning" : hour < 13 ? "Good noon" : hour < 17 ? "Good afternoon" : hour < 20 ? "Good early evening" : hour < 23 ? "Good evening" : "Good night";
    return `${greeting}, ${firstName}`;
  }

  const greeting = hour < 5 ? "Klidnou noc" : hour < 9 ? "Dobré ráno" : hour < 12 ? "Dobré dopoledne" : hour < 13 ? "Příjemné poledne" : hour < 17 ? "Dobré odpoledne" : hour < 20 ? "Příjemný podvečer" : hour < 23 ? "Dobrý večer" : "Klidnou noc";
  return `${greeting}, ${czechVocative(firstName)}`;
}

function czechVocative(firstName: string) {
  const normalized = firstName.toLocaleLowerCase("cs-CZ");
  const known: Record<string, string> = {
    martin: "Martine", petr: "Petře", pavel: "Pavle", marek: "Marku", michal: "Michale", jakub: "Jakube", jan: "Jane", jiří: "Jiří", lukáš: "Lukáši", tomáš: "Tomáši", matyáš: "Matyáši", ondřej: "Ondřeji", vojtěch: "Vojtěchu", jindřich: "Jindřichu", radek: "Radku", štěpán: "Štěpáne", jaroslav: "Jaroslave", kryštof: "Kryštofe", josef: "Josefe", david: "Davide", filip: "Filipe", karel: "Karle", alex: "Alexi", lucas: "Lucasi", maxim: "Maxime", oscar: "Oscare", tobias: "Tobiasi",
    martina: "Martino", anna: "Anno", barbora: "Barboro", karolína: "Karolíno", lucie: "Lucie", annemari: "Annemari",
  };
  if (known[normalized]) return known[normalized];
  if (/[ieíy]$/u.test(normalized)) return firstName;
  if (normalized.endsWith("a")) return `${firstName.slice(0, -1)}o`;
  if (normalized.endsWith("ek")) return `${firstName.slice(0, -2)}ku`;
  if (normalized.endsWith("el")) return `${firstName.slice(0, -2)}le`;
  if (/[šžčřc]$/u.test(normalized)) return `${firstName}i`;
  if (/[kg]$/u.test(normalized)) return `${firstName}u`;
  return `${firstName}e`;
}

const FLEET_MIN_BAR_PERCENT = 8;

const RACE_FORMS: PluralForms = { cs: ["závod", "závody", "závodů"], en: ["race", "races"] };
const DAY_FORMS: PluralForms = { cs: ["den", "dny", "dní"], en: ["day", "days"] };
const ENGINE_FORMS: PluralForms = { cs: ["motor", "motory", "motorů"], en: ["engine", "engines"] };
const CARBURETOR_FORMS: PluralForms = { cs: ["karburátor", "karburátory", "karburátorů"], en: ["carburetor", "carburetors"] };
const VEHICLE_FORMS: PluralForms = { cs: ["auto", "auta", "aut"], en: ["vehicle", "vehicles"] };
const NEEDS_SERVICE_VERB: PluralForms = { cs: ["potřebuje", "potřebují", "potřebuje"], en: ["needs", "need"] };
const TASK_FORMS: PluralForms = { cs: ["úkol", "úkoly", "úkolů"], en: ["task", "tasks"] };
const OPEN_ADJ_FORMS: PluralForms = { cs: ["otevřený", "otevřené", "otevřených"], en: ["open", "open"] };

function engineServiceLabel(count: number, locale: Locale) {
  return `${formatCount(count, locale, ENGINE_FORMS)} ${pluralForm(count, locale, NEEDS_SERVICE_VERB)} ${locale === "cs" ? "servis" : "service"}`;
}

function carburetorServiceLabel(count: number, locale: Locale) {
  return `${formatCount(count, locale, CARBURETOR_FORMS)} ${pluralForm(count, locale, NEEDS_SERVICE_VERB)} ${locale === "cs" ? "servis" : "service"}`;
}

function vehiclesNeedingServiceLabel(count: number, locale: Locale) {
  return `${formatCount(count, locale, VEHICLE_FORMS)} ${pluralForm(count, locale, NEEDS_SERVICE_VERB)} ${locale === "cs" ? "servis" : "service"}`;
}

function overdueTasksLabel(count: number, locale: Locale) {
  if (locale === "cs") return `${formatCount(count, "cs", TASK_FORMS)} po termínu`;
  return `${count} overdue ${pluralForm(count, "en", TASK_FORMS)}`;
}

function openTasksLabel(count: number, locale: Locale) {
  if (locale === "cs") return `${count} ${pluralForm(count, "cs", OPEN_ADJ_FORMS)} ${pluralForm(count, "cs", TASK_FORMS)}`;
  return `${count} open ${pluralForm(count, "en", TASK_FORMS)}`;
}

function localIsoMinute(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dashboardDateRange(start: string, end: string, locale: Locale) {
  const formatter = new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  return start === end ? formatter.format(parseIsoDate(start)) : `${formatter.format(parseIsoDate(start))} – ${formatter.format(parseIsoDate(end))}`;
}

function raceCountdown(race: DashboardRace, today: string, locale: Locale) {
  if (race.status === "active" || (race.startDate <= today && race.endDate >= today)) return locale === "cs" ? "probíhá" : "active";
  const days = Math.max(0, Math.ceil((parseIsoDate(race.startDate).getTime() - parseIsoDate(today).getTime()) / 86_400_000));
  if (days === 0) return locale === "cs" ? "dnes" : "today";
  return locale === "cs" ? `za ${formatCount(days, "cs", DAY_FORMS)}` : formatCount(days, "en", DAY_FORMS);
}

const RACE_WATERMARK_STOPWORDS = new Set(["a", "v", "na", "of", "the", "de", "di", "and", "za", "pro"]);
function raceWatermarkCode(name: string) {
  const words = name.split(/[\s—-]+/).map((word) => word.replace(/[^\p{L}\p{N}]/gu, "")).filter((word) => word.length > 1 && !RACE_WATERMARK_STOPWORDS.has(word.toLowerCase()));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((word) => word[0]).join("").toUpperCase();
}

const RACE_WATERMARK_COLORS = ["var(--wrc-red)", "var(--wrc-blue)", "var(--wrc-amber)", "var(--wrc-purple)", "var(--wrc-green)", "var(--wrc-gold)"];
function raceWatermarkColor(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return RACE_WATERMARK_COLORS[hash % RACE_WATERMARK_COLORS.length];
}

function enginePillTone(status: EngineRecord["status"]) {
  if (status === "ready") return "ready";
  if (status === "service_soon" || status === "service") return "due";
  if (status === "rebuild") return "rebuild";
  return "storage";
}

const ENGINE_PILL_COLORS: Record<string, string> = { ready: "var(--wrc-green)", due: "var(--wrc-amber)", rebuild: "var(--wrc-red)", storage: "var(--wrc-ink-faint)" };

function engineAssignmentLabel(engine: EngineRecord, races: DashboardRace[]) {
  if (!engine.assignedDriver) return "—";
  const race = engine.assignedRace ? races.find((item) => item.name === engine.assignedRace) : undefined;
  return race ? `${engine.assignedDriver} · ${race.track}` : engine.assignedDriver;
}

function formatHours(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function ignitionLabel(ignition: EngineRecord["ignition"], locale: Locale) {
  if (!ignition) return locale === "cs" ? "Nevyplněno" : "Not specified";
  return ignition === "SELETTRA" ? "Selettra" : "PVL";
}

function engineStatusLabel(status: EngineRecord["status"], locale: Locale) {
  const labels: Record<EngineRecord["status"], [string, string]> = {
    ready: ["Připraveno", "Ready"],
    service_soon: ["Brzy servis", "Service soon"],
    service: ["Servis", "Service"],
    rebuild: ["Přestavba", "Rebuild"],
    storage: ["Sklad", "Storage"],
    retired: ["Vyřazen", "Retired"],
  };
  return labels[status][locale === "cs" ? 0 : 1];
}

function auditEntryText(entry: EngineAuditEntry, locale: Locale) {
  if (entry.action === "create") return locale === "cs" ? "Motor založen v systému" : "Engine created in the system";
  if (entry.action === "archive") return locale === "cs" ? "Motor odstraněn" : "Engine removed";
  if (entry.action === "update_technical") return locale === "cs" ? "Upravena technická karta" : "Technical data updated";
  if (entry.action === "set_engine_baseline") return locale === "cs" ? "Nastaven výchozí stav motohodin" : "Engine hours baseline set";
  if (entry.action === "status_change") {
    const from = engineStatusLabel(entry.fromStatus, locale);
    const to = engineStatusLabel(entry.toStatus, locale);
    return locale === "cs" ? `Stav změněn z „${from}“ na „${to}“` : `Status changed from "${from}" to "${to}"`;
  }
  if (entry.action === "engine_auto_service") {
    const raceName = entry.raceName || (locale === "cs" ? "neznámý závod" : "unknown race");
    return locale === "cs" ? `Stav změněn na Servis — automaticky po závodě ${raceName}` : `Status changed to Service — automatically after the ${raceName} race`;
  }
  const mechanicName = entry.mechanicName || (locale === "cs" ? "neznámý mechanik" : "unknown mechanic");
  const partsText = entry.partsCount > 0 ? ` (${formatCount(entry.partsCount, locale, { cs: ["díl", "díly", "dílů"], en: ["part", "parts"] })})` : "";
  return locale === "cs" ? `Proveden servis${partsText} — ${mechanicName}` : `Service performed${partsText} — ${mechanicName}`;
}

function formatDisplayDate(value: string | null, locale: Locale) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB").format(new Date(year, month - 1, day));
}

function formatTimestamp(value: number, locale: Locale) {
  if (!value) return locale === "cs" ? "Datum není dostupné" : "Date unavailable";
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function servicePartEnglish(part: string) {
  const labels: Record<string, string> = {
    "Píst": "Piston",
    "Gufera": "Oil seals",
    "Ložiska kliky": "Crank bearings",
    "Kompletní ojnice": "Complete connecting rod",
    "Horní klec ojnice": "Upper rod cage",
    "Těsnění válce": "Cylinder gasket",
    "Těsnění hlavy": "Head gasket",
  };
  return labels[part] ?? part;
}

function todayInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function servicePartLabel(record: ServiceRecord, partId: string, locale: Locale) {
  const snapshot = record.replacedPartsSnapshot.find((item) => item.partKey === partId);
  if (!snapshot) return partId;
  return locale === "cs" ? snapshot.labelCs : snapshot.labelEn;
}

function serviceTypeLabel(serviceType: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    inspection: ["Kontrola", "Inspection"],
    piston_service: ["Servis pístu", "Piston service"],
    top_end: ["Top end", "Top end"],
    full_service: ["Kompletní servis", "Full service"],
  };
  const value = labels[serviceType] ?? [serviceType, serviceType];
  return value[locale === "cs" ? 0 : 1];
}

function friendlyRecordError(error: string, locale: Locale) {
  if (locale === "en") return error;
  const errors: Record<string, string> = {
    "Oppama must use HH:MM and be greater than 00:00": "Oppama zapiš ve formátu HH:MM, například 01:24.",
    "Select a valid piston size": "Vyber správný rozměr nového pístu.",
    "This engine family does not use Oppama tracking": "Tento typ motoru motohodiny Oppama neeviduje.",
    "Engine and valid date are required": "Vyber správné datum.",
    "Record and valid date are required": "Vyber správné datum záznamu.",
    "Invalid service type": "Vyber správný typ servisu.",
    "All starting counters must use HH:MM": "Všechny vstupní časy zapiš ve formátu HH:MM, například 06:48.",
    "Total time cannot be lower than component counters": "Celkový čas motoru nemůže být nižší než čas pístu nebo ojnice.",
    "Record not found": "Záznam už nebyl nalezen. Obnov stránku a zkus to znovu.",
    "Delete failed": "Záznam se nepodařilo smazat.",
  };
  return errors[error] ?? error;
}

function localizeLoanError(error: string, locale: Locale) {
  if (locale === "en") return error;
  const alreadyAssigned = error.match(/^Engine is already assigned to (.+)$/);
  if (alreadyAssigned) return `Motor je přiřazený na závod „${alreadyAssigned[1]}“ — nejde půjčit, dokud se ze závodu nesundá.`;
  const onLoan = error.match(/^Engine is currently on loan to (.+) until (.+)$/);
  if (onLoan) return `Motor je zapůjčený — ${onLoan[1]} do ${onLoan[2]}.`;
  const errors: Record<string, string> = {
    "Engine and valid start/return dates are required": "Vyber motor a platné datum od–do.",
    "Recipient not found": "Vybraný příjemce nebyl nalezen.",
    "Engine not found": "Motor už nebyl nalezen. Obnov stránku a zkus to znovu.",
    "Loan not found": "Zápůjčka už nebyla nalezena. Obnov stránku a zkus to znovu.",
    "Valid new return date is required": "Vyber platné nové datum vrácení.",
    "Valid return date is required": "Vyber platné datum vrácení.",
    "Forbidden": "Na tuhle akci nemáš oprávnění.",
  };
  return errors[error] ?? error;
}
