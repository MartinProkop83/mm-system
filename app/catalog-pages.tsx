"use client";

import { useEffect, useMemo, useState } from "react";
import { CountrySelect } from "./country-select";
import { countryFlag } from "./countries";
import { CarburetorDetail } from "./carburetor-detail";
import { MechanicDetail } from "./mechanic-detail";
import { CompetitionHistoryDetail } from "./competition-history-detail";
import { RaceLogoBadge } from "./race-logo-badge";
import { raceCalendarColorDefinition, raceCalendarColors } from "./race-calendar-colors";

export type CatalogKind = "raceType" | "team" | "driver" | "mechanic" | "vehicle" | "carburetor";
type Locale = "cs" | "en";
type Role = "superadmin" | "boss" | "mechanic";
type DriverFilter = "active" | "mini" | "okj" | "okn" | "ok" | "kz" | "inactive";

export type TeamRecord = { id: string; name: string; countryCode: string; notes: string; logoUrl: string; logoUpdatedAt?: number | null; createdAt: number; updatedAt: number };
export type RaceTypeRecord = { id: string; name: string; notes: string; seriesOptions: string[]; calendarColor: string; logoUrl: string; logoUpdatedAt?: number | null; createdAt: number; updatedAt: number };
export type DriverRecord = { id: string; name: string; teamId: string | null; teamName: string; defaultCategory: string; raceNumber: string; nationality: string; isActive: boolean; notes: string; createdAt: number; updatedAt: number };
export type MechanicRecord = { id: string; name: string; nextRace?: string; nextTrack?: string; nextCountryCode?: string; nextStartDate?: string; nextEndDate?: string; assignmentStatus?: "assigned" | "history" | "none"; raceCount?: number; createdAt: number; updatedAt: number };
export type VehicleRecord = { id: string; name: string; licensePlate: string; notes: string; createdAt: number; updatedAt: number };
export type CarburetorRecord = { id: string; code: string; carburetorTypeId?: string | null; category?: string; family: string; brand: string; model: string; status: string; notes: string; soldAt?: number | null; lastDriver?: string; lastRace?: string; assignmentStatus?: "assigned" | "history" | "none"; createdAt: number; updatedAt: number };
export type CarburetorTypeRecord = { id: string; brand: string; model: string; categories: string[]; notes: string; createdAt: number; updatedAt: number };

export type CatalogData = {
  raceTypes: RaceTypeRecord[];
  teams: TeamRecord[];
  drivers: DriverRecord[];
  mechanics: MechanicRecord[];
  vehicles: VehicleRecord[];
  carburetors: CarburetorRecord[];
  carburetorTypes?: CarburetorTypeRecord[];
};

type CatalogItem = RaceTypeRecord | TeamRecord | DriverRecord | MechanicRecord | VehicleRecord | CarburetorRecord;

const categoryOrder = ["BABY", "MINI", "MINI U10", "MINI GR3", "OKJ", "OKN-J", "OKN", "OK", "KZ"];
const carburetorFamilies = ["BABY", "MINI", "OKJ", "OKN", "OK", "KZ"];

const labels = {
  cs: {
    raceType: ["Typy závodů", "Typ závodu"], team: ["Týmy", "Tým"], driver: ["Piloti", "Pilot"], mechanic: ["Mechanici", "Mechanik"], vehicle: ["Auta", "Auto"], carburetor: ["Karburátory", "Karburátor"],
    central: "Základní seznam pro plánování závodů", new: "Nový", edit: "Upravit", delete: "Smazat", cancel: "Zrušit", save: "Uložit", saving: "Ukládám…", empty: "Zatím tu není žádný záznam.", actions: "Akce", name: "Jméno / název", notes: "Poznámky", history: "Historie se zobrazí po prvním přiřazení k závodu.",
  },
  en: {
    raceType: ["Race types", "Race type"], team: ["Teams", "Team"], driver: ["Drivers", "Driver"], mechanic: ["Mechanics", "Mechanic"], vehicle: ["Cars", "Car"], carburetor: ["Carburetors", "Carburetor"],
    central: "Master list for race planning", new: "New", edit: "Edit", delete: "Delete", cancel: "Cancel", save: "Save", saving: "Saving…", empty: "No records yet.", actions: "Actions", name: "Name", notes: "Notes", history: "History will appear after the first race assignment.",
  },
} as const;

export function CatalogPage({ kind, locale, role }: { kind: CatalogKind; locale: Locale; role: Role }) {
  const l = labels[locale];
  const [data, setData] = useState<CatalogData>({ raceTypes: [], teams: [], drivers: [], mechanics: [], vehicles: [], carburetors: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedCarburetorId, setSelectedCarburetorId] = useState<string | null>(null);
  const [selectedMechanicId, setSelectedMechanicId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [driverFilter, setDriverFilter] = useState<DriverFilter>("active");
  const allItems = useMemo(() => {
    const records = data[pluralKey(kind)] as CatalogItem[];
    return kind === "carburetor" ? records.filter((item) => !(item as CarburetorRecord).soldAt) : records;
  }, [data, kind]);
  const items = useMemo(() => kind === "driver" ? data.drivers.filter((driver) => driverMatchesFilter(driver, driverFilter)) : allItems, [allItems, data.drivers, driverFilter, kind]);
  const canManage = role !== "mechanic";

  async function load() {
    setLoading(true);
    try {
      const [response, typesResponse] = await Promise.all([fetch("/api/catalog", { cache: "no-store" }), fetch("/api/carburetor-types", { cache: "no-store" })]);
      const result = (await response.json()) as CatalogData;
      const typesResult = (await typesResponse.json()) as { carburetorTypes?: CarburetorTypeRecord[] };
      if (!response.ok || !typesResponse.ok) throw new Error("load failed");
      setData({ ...result, carburetorTypes: typesResult.carburetorTypes ?? [] });
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const selectedCarburetor = kind === "carburetor" ? data.carburetors.find((item) => item.id === selectedCarburetorId) ?? null : null;
  const selectedMechanic = kind === "mechanic" ? data.mechanics.find((item) => item.id === selectedMechanicId) ?? null : null;
  const selectedDriver = kind === "driver" ? data.drivers.find((item) => item.id === selectedDriverId) ?? null : null;
  const selectedTeam = kind === "team" ? data.teams.find((item) => item.id === selectedTeamId) ?? null : null;

  async function remove(item: CatalogItem) {
    if (role !== "superadmin") return;
    const itemName = "code" in item ? item.code : item.name;
    if (!window.confirm(locale === "cs" ? `Opravdu odstranit ${itemName}? Historické závody zůstanou zachované.` : `Remove ${itemName}? Historical races will remain preserved.`)) return;
    const response = await fetch("/api/catalog", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: kind, id: item.id }) });
    if (!response.ok) {
      window.alert(locale === "cs" ? "Záznam se nepodařilo odstranit." : "Could not remove the record.");
      return;
    }
    await load();
  }

  if (selectedCarburetor) return <><CarburetorDetail carburetorId={selectedCarburetor.id} locale={locale} role={role} onBack={() => setSelectedCarburetorId(null)} onEdit={(item) => { setEditing(item); setFormOpen(true); }} />{formOpen && <CatalogForm kind="carburetor" locale={locale} item={editing} teams={data.teams} carburetorTypes={data.carburetorTypes ?? []} onClose={() => { setFormOpen(false); setEditing(null); }} onSaved={async () => { setFormOpen(false); setEditing(null); await load(); }} />}</>;
  if (selectedMechanic) return <><MechanicDetail mechanicId={selectedMechanic.id} locale={locale} role={role} onBack={() => setSelectedMechanicId(null)} onEdit={(item) => { setEditing(item); setFormOpen(true); }} />{formOpen && <CatalogForm kind="mechanic" locale={locale} item={editing} teams={data.teams} carburetorTypes={data.carburetorTypes ?? []} onClose={() => { setFormOpen(false); setEditing(null); }} onSaved={async () => { setFormOpen(false); setEditing(null); await load(); }} />}</>;
  if (selectedDriver) return <><CompetitionHistoryDetail key={`${selectedDriver.id}-${selectedDriver.updatedAt}`} entityType="driver" entityId={selectedDriver.id} locale={locale} role={role} onBack={() => setSelectedDriverId(null)} onEdit={(item) => { setEditing(item); setFormOpen(true); }} />{formOpen && <CatalogForm kind="driver" locale={locale} item={editing} teams={data.teams} carburetorTypes={data.carburetorTypes ?? []} onClose={() => { setFormOpen(false); setEditing(null); }} onSaved={async () => { setFormOpen(false); setEditing(null); await load(); }} />}</>;
  if (selectedTeam) return <><CompetitionHistoryDetail key={`${selectedTeam.id}-${selectedTeam.updatedAt}`} entityType="team" entityId={selectedTeam.id} locale={locale} role={role} onBack={() => setSelectedTeamId(null)} onEdit={(item) => { setEditing(item); setFormOpen(true); }} />{formOpen && <CatalogForm kind="team" locale={locale} item={editing} teams={data.teams} carburetorTypes={data.carburetorTypes ?? []} onClose={() => { setFormOpen(false); setEditing(null); }} onSaved={async () => { setFormOpen(false); setEditing(null); await load(); }} />}</>;

  return (
    <div className="catalog-page">
      <section className="panel catalog-summary">
        <div><span className="eyebrow">MM DIRECTORY</span><h2>{l[kind][0]}</h2><p>{l.central}</p></div>
        <div className="catalog-summary-actions"><strong>{allItems.length}</strong>{canManage && <button className="primary-button" type="button" onClick={() => { setEditing(null); setFormOpen(true); }}>＋ {l.new} {l[kind][1].toLowerCase()}</button>}</div>
      </section>
      {kind === "driver" && <DriverCategoryTiles locale={locale} items={data.drivers} selected={driverFilter} onSelect={setDriverFilter} />}
      {kind === "carburetor" && <CarburetorTypesSection locale={locale} role={role} items={data.carburetorTypes ?? []} onChanged={load} />}
      <section className="panel data-panel catalog-table-panel">
        {loading && <div className="empty-state"><span className="spinner" /><p>{locale === "cs" ? "Načítám…" : "Loading…"}</p></div>}
        {!loading && error && <div className="empty-state error-state"><b>!</b><p>{locale === "cs" ? "Data se nepodařilo načíst." : "Could not load data."}</p></div>}
        {!loading && !error && items.length === 0 && <div className="empty-state"><span className="empty-engine">＋</span><h2>{l.empty}</h2><p>{l.history}</p></div>}
        {!loading && !error && items.length > 0 && <CatalogTable kind={kind} locale={locale} items={items} role={role} onOpen={(item) => { if (kind === "carburetor") setSelectedCarburetorId((item as CarburetorRecord).id); if (kind === "mechanic") setSelectedMechanicId((item as MechanicRecord).id); if (kind === "driver") setSelectedDriverId((item as DriverRecord).id); if (kind === "team") setSelectedTeamId((item as TeamRecord).id); }} onEdit={(item) => { setEditing(item); setFormOpen(true); }} onDelete={(item) => { void remove(item); }} />}
      </section>
      {formOpen && <CatalogForm kind={kind} locale={locale} item={editing} teams={data.teams} carburetorTypes={data.carburetorTypes ?? []} onClose={() => { setFormOpen(false); setEditing(null); }} onSaved={async () => { setFormOpen(false); setEditing(null); await load(); }} />}
    </div>
  );
}

function CatalogTable({ kind, locale, items, role, onOpen, onEdit, onDelete }: { kind: CatalogKind; locale: Locale; items: CatalogItem[]; role: Role; onOpen: (item: CatalogItem) => void; onEdit: (item: CatalogItem) => void; onDelete: (item: CatalogItem) => void }) {
  const l = labels[locale];
  return <div className="table-wrap"><table className="engine-table catalog-table"><thead><tr>{headers(kind, locale).map((header) => <th key={header}>{header}</th>)}{role !== "mechanic" && <th>{l.actions}</th>}</tr></thead><tbody>{items.map((item) => <tr key={item.id} className={`${["carburetor", "mechanic", "driver", "team"].includes(kind) ? "clickable-row" : ""}${kind === "driver" && !(item as DriverRecord).isActive ? " inactive-record" : ""}`} onClick={() => onOpen(item)}>{cells(kind, item, locale).map((cell, index) => <td key={index}>{cell}</td>)}{role !== "mechanic" && <td onClick={(event) => event.stopPropagation()}><div className="record-actions">{(kind === "driver" || kind === "team") && <button className="card-action" type="button" onClick={() => onOpen(item)}>{locale === "cs" ? "Karta" : "Card"}</button>}<button type="button" onClick={() => onEdit(item)}>{l.edit}</button>{role === "superadmin" && <button className="delete" type="button" onClick={() => onDelete(item)}>{l.delete}</button>}</div></td>}</tr>)}</tbody></table></div>;
}

function DriverCategoryTiles({ locale, items, selected, onSelect }: { locale: Locale; items: DriverRecord[]; selected: DriverFilter; onSelect: (filter: DriverFilter) => void }) {
  const definitions: Array<{ id: DriverFilter; title: string; subtitle: string; tone: string }> = [
    { id: "active", title: locale === "cs" ? "Aktivní piloti" : "Active drivers", subtitle: locale === "cs" ? "Všechny kategorie" : "All categories", tone: "all" },
    { id: "mini", title: "MINI", subtitle: "BABY · MINI U10 · MINI GR3", tone: "mini" },
    { id: "okj", title: "OKJ", subtitle: "OK JUNIOR", tone: "okj" },
    { id: "okn", title: "OKN", subtitle: locale === "cs" ? "včetně OKN-J" : "including OKN-J", tone: "okn" },
    { id: "ok", title: "OK", subtitle: "OK SENIOR", tone: "ok" },
    { id: "kz", title: "KZ", subtitle: "GEARBOX", tone: "kz" },
    { id: "inactive", title: locale === "cs" ? "Neaktivní" : "Inactive", subtitle: locale === "cs" ? "Historie zachována" : "History preserved", tone: "inactive" },
  ];
  return <section className="driver-filter-grid" aria-label={locale === "cs" ? "Filtr pilotů podle kategorií" : "Filter drivers by category"}>{definitions.map((definition) => <button className={`driver-filter-card tone-${definition.tone}${selected === definition.id ? " active" : ""}`} type="button" key={definition.id} aria-pressed={selected === definition.id} onClick={() => onSelect(definition.id)}><span><b>{definition.title}</b><small>{definition.subtitle}</small></span><strong>{items.filter((driver) => driverMatchesFilter(driver, definition.id)).length}</strong></button>)}</section>;
}

function driverMatchesFilter(driver: DriverRecord, filter: DriverFilter) {
  if (filter === "inactive") return !driver.isActive;
  if (!driver.isActive) return false;
  if (filter === "active") return true;
  return driverCategoryFamily(driver.defaultCategory) === filter.toUpperCase();
}

function driverCategoryFamily(category: string) {
  if (["BABY", "MINI", "MINI U10", "MINI GR3"].includes(category)) return "MINI";
  if (["OKN", "OKN-J"].includes(category)) return "OKN";
  return category;
}

function CatalogForm({ kind, locale, item, teams, carburetorTypes, onClose, onSaved }: { kind: CatalogKind; locale: Locale; item: CatalogItem | null; teams: TeamRecord[]; carburetorTypes: CarburetorTypeRecord[]; onClose: () => void; onSaved: () => void }) {
  const l = labels[locale];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editing = Boolean(item);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const logo = form.get("logo");
    const removeLogo = form.get("removeLogo") === "1";
    form.delete("logo");
    form.delete("removeLogo");
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/catalog", { method: editing ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, type: kind, id: item?.id }) });
      const result = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error || "Save failed");
      const logoEndpoint = kind === "raceType" ? "/api/race-template-logo" : kind === "team" ? "/api/team-logo" : null;
      const logoIdField = kind === "raceType" ? "templateId" : "teamId";
      if (logoEndpoint && logo instanceof File && logo.size > 0) {
        const upload = new FormData();
        upload.set(logoIdField, result.id);
        upload.set("logo", logo);
        const logoResponse = await fetch(logoEndpoint, { method: "POST", body: upload });
        const logoResult = await logoResponse.json() as { error?: string };
        if (!logoResponse.ok) throw new Error(logoResult.error || "Logo upload failed");
      } else if (logoEndpoint && removeLogo && result.id) {
        const logoResponse = await fetch(logoEndpoint, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ [logoIdField]: result.id }) });
        const logoResult = await logoResponse.json() as { error?: string };
        if (!logoResponse.ok) throw new Error(logoResult.error || "Logo delete failed");
      }
      onSaved();
    } catch (saveError) {
      setError(friendlyCatalogError(saveError instanceof Error ? saveError.message : "Save failed", locale));
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true"><div className="modal-header"><div><span className="eyebrow">MM DIRECTORY</span><h2>{editing ? `${l.edit} · ${l[kind][1]}` : `${l.new} · ${l[kind][1]}`}</h2></div><button className="close-button" type="button" onClick={onClose}>×</button></div><form onSubmit={submit}><div className="form-grid"><CatalogFields kind={kind} locale={locale} item={item} teams={teams} carburetorTypes={carburetorTypes} /></div>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><span className="modal-actions-spacer" /><button className="secondary-compact" type="button" onClick={onClose}>{l.cancel}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? l.saving : l.save}</button></div></form></section></div>;
}

function CatalogFields({ kind, locale, item, teams, carburetorTypes }: { kind: CatalogKind; locale: Locale; item: CatalogItem | null; teams: TeamRecord[]; carburetorTypes: CarburetorTypeRecord[] }) {
  const l = labels[locale];
  if (kind === "raceType") {
    const raceType = item as RaceTypeRecord | null;
    return <RaceTypeFields raceType={raceType} locale={locale} notesLabel={l.notes} />;
  }
  if (kind === "team") {
    const team = item as TeamRecord | null;
    return <TeamFields team={team} locale={locale} notesLabel={l.notes} />;
  }
  if (kind === "driver") {
    const driver = item as DriverRecord | null;
    return <><label><span>{locale === "cs" ? "Jméno pilota" : "Driver name"} *</span><input name="name" defaultValue={driver?.name ?? ""} required autoFocus maxLength={120} /></label><label><span>{locale === "cs" ? "Tým" : "Team"}</span><select name="teamId" defaultValue={driver?.teamId ?? ""}><option value="">{locale === "cs" ? "Bez týmu" : "No team"}</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label><span>{locale === "cs" ? "Výchozí kategorie" : "Default category"}</span><select name="defaultCategory" defaultValue={driver?.defaultCategory ?? ""}><option value="">—</option>{categoryOrder.map((category) => <option key={category}>{category}</option>)}</select></label><label><span>{locale === "cs" ? "Startovní číslo" : "Race number"}</span><input name="raceNumber" defaultValue={driver?.raceNumber ?? ""} maxLength={10} /></label><label><span>{locale === "cs" ? "Národnost" : "Nationality"}</span><CountrySelect name="nationality" defaultValue={driver?.nationality} locale={locale} /></label><label><span>{locale === "cs" ? "Stav pilota" : "Driver status"}</span><select name="isActive" defaultValue={driver?.isActive === false ? "0" : "1"}><option value="1">{locale === "cs" ? "Aktivní" : "Active"}</option><option value="0">{locale === "cs" ? "Neaktivní – historie zůstane zachována" : "Inactive – history is preserved"}</option></select></label><Notes value={driver?.notes} label={l.notes} /></>;
  }
  if (kind === "mechanic") {
    const mechanic = item as MechanicRecord | null;
    return <label className="full-field"><span>{locale === "cs" ? "Jméno mechanika" : "Mechanic name"} *</span><input name="name" defaultValue={mechanic?.name ?? ""} required autoFocus maxLength={120} /></label>;
  }
  if (kind === "vehicle") {
    const vehicle = item as VehicleRecord | null;
    return <><label><span>{locale === "cs" ? "Název auta" : "Car name"} *</span><input name="name" defaultValue={vehicle?.name ?? ""} placeholder="MM Transporter" required autoFocus maxLength={120} /></label><label><span>SPZ</span><input name="licensePlate" defaultValue={vehicle?.licensePlate ?? ""} maxLength={20} /></label><Notes value={vehicle?.notes} label={l.notes} /></>;
  }
  return <CarburetorFields carb={item as CarburetorRecord | null} types={carburetorTypes} locale={locale} />;
}

function RaceTypeFields({ raceType, locale, notesLabel }: { raceType: RaceTypeRecord | null; locale: Locale; notesLabel: string }) {
  const [removeLogo, setRemoveLogo] = useState(false);
  return <>
    <label className="full-field"><span>{locale === "cs" ? "Název přednastaveného závodu" : "Preset race name"} *</span><input name="name" defaultValue={raceType?.name ?? ""} required autoFocus maxLength={120} placeholder="RMC Germany" /></label>
    <label className="full-field"><span>{locale === "cs" ? "Série (volitelné)" : "Series (optional)"}</span><input name="seriesOptions" defaultValue={raceType?.seriesOptions?.join(", ") ?? ""} placeholder="Final Cup, Euro, Champions Cup" /><small className="field-help">{locale === "cs" ? "Série odděluj čárkou. U jednotlivého závodu si pak vybereš jednu z nich, nebo napíšeš vlastní — nic není povinné." : "Separate series with commas. When creating a race you'll pick one or type your own — none of this is required."}</small></label>
    <fieldset className="race-color-picker full-field"><legend>{locale === "cs" ? "Barva v kalendáři" : "Calendar color"}</legend><p>{locale === "cs" ? "Podle této barvy závod rychle poznáš v kalendáři a přehledu výjezdů." : "This color identifies the race in the calendar and travel overview."}</p><div>{raceCalendarColors.map((color) => <label key={color.id} style={{ "--swatch-accent": color.accent, "--swatch-bg": color.background, "--swatch-text": color.text } as React.CSSProperties}><input type="radio" name="calendarColor" value={color.id} defaultChecked={(raceType?.calendarColor ?? "blue") === color.id} /><span className="race-color-swatch" aria-hidden="true" /><b>{locale === "cs" ? color.labelCs : color.labelEn}</b></label>)}</div></fieldset>
    <label className="full-field race-logo-upload"><span>{locale === "cs" ? "Logo typu závodu" : "Race type logo"}</span>
      {raceType?.logoUrl && !removeLogo && <div className="race-logo-preview"><RaceLogoBadge logoUrl={raceType.logoUrl} name={raceType.name} size="large" /><div><strong>{locale === "cs" ? "Aktuální logo" : "Current logo"}</strong><button type="button" onClick={() => setRemoveLogo(true)}>{locale === "cs" ? "Odstranit" : "Remove"}</button></div></div>}
      {removeLogo && <input type="hidden" name="removeLogo" value="1" />}
      <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
      <small>{locale === "cs" ? "PNG, JPG nebo WebP, maximálně 5 MB. Nový obrázek nahradí původní logo." : "PNG, JPG or WebP, up to 5 MB. A new image replaces the current logo."}</small>
    </label>
    <Notes value={raceType?.notes} label={notesLabel} />
  </>;
}

function TeamFields({ team, locale, notesLabel }: { team: TeamRecord | null; locale: Locale; notesLabel: string }) {
  const [removeLogo, setRemoveLogo] = useState(false);
  return <>
    <label><span>{locale === "cs" ? "Název týmu" : "Team name"} *</span><input name="name" defaultValue={team?.name ?? ""} required autoFocus maxLength={120} /></label>
    <label><span>{locale === "cs" ? "Země" : "Country"}</span><CountrySelect name="countryCode" defaultValue={team?.countryCode} locale={locale} /></label>
    <label className="full-field race-logo-upload"><span>{locale === "cs" ? "Logo týmu" : "Team logo"}</span>
      {team?.logoUrl && !removeLogo && <div className="race-logo-preview"><RaceLogoBadge logoUrl={team.logoUrl} name={team.name} size="large" /><div><strong>{locale === "cs" ? "Aktuální logo" : "Current logo"}</strong><button type="button" onClick={() => setRemoveLogo(true)}>{locale === "cs" ? "Odstranit" : "Remove"}</button></div></div>}
      {removeLogo && <input type="hidden" name="removeLogo" value="1" />}
      <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
      <small>{locale === "cs" ? "PNG, JPG nebo WebP, maximálně 5 MB. Nový obrázek nahradí původní logo." : "PNG, JPG or WebP, up to 5 MB. A new image replaces the current logo."}</small>
    </label>
    <Notes value={team?.notes} label={notesLabel} />
  </>;
}

function CarburetorFields({ carb, types, locale }: { carb: CarburetorRecord | null; types: CarburetorTypeRecord[]; locale: Locale }) {
  const initialType = carb?.carburetorTypeId || types.find((item) => item.brand === carb?.brand && item.model === carb?.model)?.id || types[0]?.id || "";
  const [typeId, setTypeId] = useState(initialType);
  const selectedType = types.find((item) => item.id === typeId);
  const inferredCategory = carb?.category || selectedType?.categories.find((category) => normalizeCarbFamily(category) === carb?.family) || selectedType?.categories[0] || "";
  const [category, setCategory] = useState(inferredCategory);

  return <>
    <label><span>{locale === "cs" ? "Kód karburátoru" : "Carburetor code"} *</span><input name="code" defaultValue={carb?.code ?? ""} placeholder="TIL-084" required autoFocus maxLength={20} /></label>
    <label><span>{locale === "cs" ? "Předdefinovaný typ" : "Preset type"} *</span><select name="carburetorTypeId" value={typeId} required onChange={(event) => { const nextId = event.target.value; const nextType = types.find((item) => item.id === nextId); setTypeId(nextId); setCategory(nextType?.categories[0] ?? ""); }}><option value="">{types.length ? (locale === "cs" ? "Vyber typ…" : "Select type…") : (locale === "cs" ? "Nejdříve přidej typ v katalogu" : "Add a type to the catalog first")}</option>{types.map((item) => <option key={item.id} value={item.id}>{item.brand} · {item.model}</option>)}</select></label>
    <label><span>{locale === "cs" ? "Kategorie" : "Category"} *</span><select name="category" value={category} required disabled={!selectedType} onChange={(event) => setCategory(event.target.value)}><option value="">—</option>{selectedType?.categories.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label><span>{locale === "cs" ? "Stav" : "Status"}</span><select name="status" defaultValue={carb?.status ?? "ready"}><option value="ready">{locale === "cs" ? "Připraveno" : "Ready"}</option><option value="service">{locale === "cs" ? "Servis" : "Service"}</option><option value="storage">{locale === "cs" ? "Sklad" : "Storage"}</option><option value="retired">{locale === "cs" ? "Vyřazen" : "Retired"}</option></select></label>
    <div className="form-readonly"><span>{locale === "cs" ? "Značka" : "Brand"}</span><strong>{selectedType?.brand || "—"}</strong></div><div className="form-readonly"><span>Model</span><strong>{selectedType?.model || "—"}</strong></div>
    <Notes value={carb?.notes} label={locale === "cs" ? "Poznámky" : "Notes"} />
  </>;
}

function CarburetorTypesSection({ locale, role, items, onChanged }: { locale: Locale; role: Role; items: CarburetorTypeRecord[]; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<CarburetorTypeRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const canManage = role !== "mechanic";

  async function remove(item: CarburetorTypeRecord) {
    if (role !== "superadmin" || !window.confirm(locale === "cs" ? `Opravdu odstranit typ ${item.brand} ${item.model}?` : `Remove ${item.brand} ${item.model}?`)) return;
    const response = await fetch("/api/carburetor-types", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) return window.alert(typeError(result.error ?? "Delete failed", locale));
    await onChanged();
  }

  return <section className="panel carb-type-library"><header><div><span className="eyebrow">MASTER DATA</span><h3>{locale === "cs" ? "Katalog typů karburátorů" : "Carburetor type catalog"}</h3><p>{locale === "cs" ? "Předdefinované značky, modely a kompatibilní závodní kategorie." : "Preset brands, models and compatible race categories."}</p></div>{canManage && <button className="secondary-compact" type="button" onClick={() => { setEditing(null); setFormOpen(true); }}>＋ {locale === "cs" ? "Přidat typ" : "Add type"}</button>}</header>{items.length === 0 ? <div className="carb-type-empty"><strong>{locale === "cs" ? "Zatím není vytvořený žádný typ" : "No types yet"}</strong><span>{locale === "cs" ? "Začni značkou, modelem a vyber jednu nebo více kategorií." : "Start with a brand, model and one or more categories."}</span></div> : <div className="carb-type-grid">{items.map((item) => <article className={`carb-type-card tone-${normalizeCarbFamily(item.categories[0] ?? "").toLowerCase()}`} key={item.id}><div><span>{item.brand}</span><h4>{item.model}</h4></div><div className="carb-category-chips">{item.categories.map((category) => <b key={category}>{category}</b>)}</div>{item.notes && <p>{item.notes}</p>}{canManage && <footer><button type="button" onClick={() => { setEditing(item); setFormOpen(true); }}>{locale === "cs" ? "Upravit" : "Edit"}</button>{role === "superadmin" && <button className="delete" type="button" onClick={() => { void remove(item); }}>{locale === "cs" ? "Smazat" : "Delete"}</button>}</footer>}</article>)}</div>}{formOpen && <CarburetorTypeForm locale={locale} item={editing} onClose={() => { setFormOpen(false); setEditing(null); }} onSaved={async () => { setFormOpen(false); setEditing(null); await onChanged(); }} />}</section>;
}

function CarburetorTypeForm({ locale, item, onClose, onSaved }: { locale: Locale; item: CarburetorTypeRecord | null; onClose: () => void; onSaved: () => void }) {
  const [selected, setSelected] = useState<string[]>(item?.categories ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch("/api/carburetor-types", { method: item ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, id: item?.id, categories: selected }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Save failed");
      onSaved();
    } catch (saveError) { setError(typeError(saveError instanceof Error ? saveError.message : "Save failed", locale)); setSaving(false); }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true"><div className="modal-header"><div><span className="eyebrow">MASTER DATA</span><h2>{item ? (locale === "cs" ? "Upravit typ karburátoru" : "Edit carburetor type") : (locale === "cs" ? "Nový typ karburátoru" : "New carburetor type")}</h2></div><button className="close-button" type="button" onClick={onClose}>×</button></div><form onSubmit={submit}><div className="form-grid"><label><span>{locale === "cs" ? "Značka" : "Brand"} *</span><input name="brand" required autoFocus maxLength={80} defaultValue={item?.brand ?? ""} placeholder="Tillotson" /></label><label><span>{locale === "cs" ? "Typ / model" : "Type / model"} *</span><input name="model" required maxLength={80} defaultValue={item?.model ?? ""} placeholder="HW-49A" /></label><fieldset className="category-checklist full-field"><legend>{locale === "cs" ? "Pro kategorie" : "For categories"} *</legend>{categoryOrder.map((category) => <label key={category}><input type="checkbox" checked={selected.includes(category)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, category] : current.filter((value) => value !== category))} /><span>{category}</span></label>)}</fieldset><Notes value={item?.notes} label={locale === "cs" ? "Poznámky" : "Notes"} /></div>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><span className="modal-actions-spacer" /><button className="secondary-compact" type="button" onClick={onClose}>{locale === "cs" ? "Zrušit" : "Cancel"}</button><button className="primary-button" type="submit" disabled={saving || !selected.length}>{saving ? (locale === "cs" ? "Ukládám…" : "Saving…") : (locale === "cs" ? "Uložit typ" : "Save type")}</button></div></form></section></div>;
}

function normalizeCarbFamily(category: string) {
  if (["MINI", "MINI U10", "MINI GR3"].includes(category)) return "MINI";
  if (["OKN-J", "OKN"].includes(category)) return "OKN";
  return category;
}

function typeError(error: string, locale: Locale) {
  if (locale === "en") return error;
  const errors: Record<string, string> = { "Brand and model are required": "Vyplň značku a typ/model.", "At least one category is required": "Vyber alespoň jednu kategorii.", "Carburetor type already exists": "Tato kombinace značky a modelu už existuje.", "Carburetor type not found": "Typ už nebyl nalezen.", "Type is used": "Typ používá uložený karburátor, proto ho nelze smazat." };
  if (error.startsWith("Type is used by ")) return `Typ používá karburátor ${error.replace("Type is used by ", "")}, proto ho nelze smazat.`;
  return errors[error] ?? error;
}

function Notes({ value = "", label }: { value?: string; label: string }) {
  return <label className="full-field"><span>{label}</span><textarea name="notes" defaultValue={value} rows={3} /></label>;
}

function pluralKey(kind: CatalogKind): keyof CatalogData {
  return ({ raceType: "raceTypes", team: "teams", driver: "drivers", mechanic: "mechanics", vehicle: "vehicles", carburetor: "carburetors" } as const)[kind];
}

function headers(kind: CatalogKind, locale: Locale) {
  if (kind === "raceType") return ["Logo", locale === "cs" ? "Závod" : "Race", locale === "cs" ? "Kalendář" : "Calendar", locale === "cs" ? "Poznámka" : "Notes"];
  if (kind === "team") return ["Logo", locale === "cs" ? "Tým" : "Team", locale === "cs" ? "Země" : "Country", locale === "cs" ? "Poznámka" : "Notes"];
  if (kind === "driver") return [locale === "cs" ? "Pilot" : "Driver", locale === "cs" ? "Tým" : "Team", locale === "cs" ? "Kategorie" : "Category", "#", locale === "cs" ? "Národnost" : "Nationality", locale === "cs" ? "Stav" : "Status"];
  if (kind === "mechanic") return [locale === "cs" ? "Mechanik" : "Mechanic", locale === "cs" ? "Nejbližší závod / evidence" : "Next race / history"];
  if (kind === "vehicle") return [locale === "cs" ? "Auto" : "Car", "SPZ", locale === "cs" ? "Poznámka" : "Notes"];
  return [locale === "cs" ? "Kód" : "Code", locale === "cs" ? "Kategorie" : "Category", locale === "cs" ? "Značka / model" : "Brand / model", locale === "cs" ? "Stav" : "Status", locale === "cs" ? "Přiřazení / poslední pilot" : "Assignment / last driver"];
}

function cells(kind: CatalogKind, item: CatalogItem, locale: Locale): React.ReactNode[] {
  if (kind === "raceType") { const value = item as RaceTypeRecord; const color = raceCalendarColorDefinition(value.calendarColor); return [<RaceLogoBadge key="logo" logoUrl={value.logoUrl} name={value.name} size="small" />, <strong key="name">{value.name}</strong>, <span className="race-color-table" key="color" style={{ "--swatch-accent": color.accent, "--swatch-bg": color.background } as React.CSSProperties}><i /><b>{locale === "cs" ? color.labelCs : color.labelEn}</b></span>, value.notes || "—"]; }
  if (kind === "team") { const value = item as TeamRecord; return [<RaceLogoBadge key="logo" logoUrl={value.logoUrl} name={value.name} size="small" />, <strong key="name">{value.name}</strong>, value.countryCode ? `${countryFlag(value.countryCode)} ${value.countryCode}` : "—", value.notes || "—"]; }
  if (kind === "driver") { const value = item as DriverRecord; return [<strong key="name">{value.name}</strong>, value.teamName || "—", value.defaultCategory || "—", value.raceNumber || "—", value.nationality ? `${countryFlag(value.nationality)} ${value.nationality}` : "—", <span className={`status-pill ${value.isActive ? "success" : "neutral"}`} key="status">{value.isActive ? (locale === "cs" ? "Aktivní" : "Active") : (locale === "cs" ? "Neaktivní" : "Inactive")}</span>]; }
  if (kind === "mechanic") { const value = item as MechanicRecord; return [<strong key="name">{value.name}</strong>, value.nextRace ? <span className="mechanic-race-cell" key="race"><strong>{value.nextCountryCode ? countryFlag(value.nextCountryCode) : ""} {value.nextRace}</strong><small>{[value.nextTrack, mechanicDateRange(value.nextStartDate, value.nextEndDate, locale)].filter(Boolean).join(" · ")}</small>{value.assignmentStatus === "assigned" ? <em>{locale === "cs" ? "Přiřazen" : "Assigned"}</em> : <em className="history">{locale === "cs" ? `Naposledy · ${value.raceCount ?? 0}×` : `Last · ${value.raceCount ?? 0}×`}</em>}</span> : <span className="mechanic-empty-cell" key="empty">{locale === "cs" ? "Bez plánovaného závodu" : "No upcoming race"}</span>]; }
  if (kind === "vehicle") { const value = item as VehicleRecord; return [<strong key="name">{value.name}</strong>, value.licensePlate || "—", value.notes || "—"]; }
  const value = item as CarburetorRecord;
  return [<strong key="code">{value.code}</strong>, value.category || value.family, [value.brand, value.model].filter(Boolean).join(" · ") || "—", value.soldAt ? <span className="status-pill neutral" key="status">{locale === "cs" ? "Prodáno" : "Sold"}</span> : <span className={`status-pill ${value.status === "ready" ? "success" : "warning-pill"}`} key="status">{value.status === "ready" ? (locale === "cs" ? "Připraveno" : "Ready") : value.status}</span>, value.lastDriver ? <span className="carb-assignment-cell" key="driver"><strong>{value.lastDriver}</strong><small>{value.lastRace || "—"}</small>{value.assignmentStatus === "assigned" && <em>{locale === "cs" ? "Přiřazeno" : "Assigned"}</em>}</span> : "—"];
}

function mechanicDateRange(start: string | undefined, end: string | undefined, locale: Locale) {
  if (!start || !end) return "";
  const formatter = new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const parse = (value: string) => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); };
  return start === end ? formatter.format(parse(start)) : `${formatter.format(parse(start))} – ${formatter.format(parse(end))}`;
}

function friendlyCatalogError(error: string, locale: Locale) {
  if (locale === "en") return error;
  const map: Record<string, string> = {
    "Name is required": "Vyplň jméno nebo název.",
    "Name already exists": "Tento závod už v databázi existuje.",
    "Code already exists": "Tento kód už v systému existuje.",
    "Invalid carburetor code": "Kód karburátoru může obsahovat písmena, čísla a pomlčku.",
    "Team not found": "Vybraný tým už nebyl nalezen.",
    "Carburetor type not found": "Vyber předdefinovaný typ karburátoru.",
    "Category is not compatible with carburetor type": "Vybraná kategorie nepatří k tomuto typu karburátoru.",
    "Select a logo file": "Vyber soubor s logem.",
    "Logo must be PNG, JPG or WebP": "Logo musí být ve formátu PNG, JPG nebo WebP.",
    "Logo is larger than 5 MB": "Logo je větší než povolených 5 MB.",
    "Logo upload failed": "Logo se nepodařilo nahrát.",
    "Logo delete failed": "Logo se nepodařilo odstranit.",
  };
  return map[error] ?? error;
}
