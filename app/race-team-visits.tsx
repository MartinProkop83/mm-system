"use client";

import { useEffect, useMemo, useState } from "react";
import { RaceLogoBadge } from "./race-logo-badge";
import { formatCount, type PluralForms } from "./pluralize";

const RECORD_FORMS: PluralForms = { cs: ["záznam", "záznamy", "záznamů"], en: ["record", "records"] };

type Locale = "cs" | "en";
type Role = "superadmin" | "boss" | "mechanic";
type Currency = "CZK" | "EUR";
type ItemType = "part" | "service" | "stock" | "oil" | "other";
type OilBrand = "factory" | "castor_blend";
type OilPackaging = "1l" | "carton12l";

type RaceInfo = { id: string; name: string; startDate: string; endDate: string; track: string; status: "planned" | "active" | "completed" };

type TeamOption = { id: string; name: string; logoUrl?: string };
type DriverOption = { id: string; name: string; teamId: string | null };
type MechanicOption = { id: string; name: string };
type InventoryPart = { id: string; code: string; name: string; quantity: number; priceCzkCents: number; priceEurCents: number };
type ServiceItem = { id: string; name: string; priceCzkCents: number; priceEurCents: number };

type TeamVisit = {
  id: string;
  raceId: string;
  teamId: string | null;
  teamName: string;
  driverId: string | null;
  driverName: string;
  itemType: ItemType;
  resourceId: string | null;
  description: string;
  quantity: number;
  visitDate: string;
  mechanicId: string | null;
  mechanicName: string;
  currency: Currency;
  amountCents: number | null;
  isPaid: boolean;
  notes: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function RaceTeamVisitsPanel({ race, locale, role }: { race: RaceInfo; locale: Locale; role: Role }) {
  const [visits, setVisits] = useState<TeamVisit[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [mechanics, setMechanics] = useState<MechanicOption[]>([]);
  const [parts, setParts] = useState<InventoryPart[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TeamVisit | null | undefined>(undefined);
  const canManage = role !== "mechanic" && (race.status !== "completed" || role === "superadmin");

  async function load() {
    setLoading(true);
    try {
      const [visitsResponse, catalogResponse, partsResponse, servicesResponse] = await Promise.all([
        fetch(`/api/race-team-visits?raceId=${encodeURIComponent(race.id)}`, { cache: "no-store" }),
        fetch("/api/catalog", { cache: "no-store" }),
        fetch("/api/inventory", { cache: "no-store" }),
        fetch("/api/service-catalog", { cache: "no-store" }),
      ]);
      if (visitsResponse.ok) setVisits(((await visitsResponse.json()) as { visits?: TeamVisit[] }).visits ?? []);
      if (catalogResponse.ok) {
        const catalogData = await catalogResponse.json() as { teams?: Array<{ id: string; name: string; logoUrl?: string }>; drivers?: Array<{ id: string; name: string; teamId: string | null }>; mechanics?: Array<{ id: string; name: string }> };
        setTeams((catalogData.teams ?? []).map((team) => ({ id: team.id, name: team.name, logoUrl: team.logoUrl })));
        setDrivers((catalogData.drivers ?? []).map((driver) => ({ id: driver.id, name: driver.name, teamId: driver.teamId })));
        setMechanics((catalogData.mechanics ?? []).map((mechanic) => ({ id: mechanic.id, name: mechanic.name })));
      }
      if (partsResponse.ok) setParts(((await partsResponse.json()) as { parts?: InventoryPart[] }).parts ?? []);
      if (servicesResponse.ok) setServices(((await servicesResponse.json()) as { services?: ServiceItem[] }).services ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [race.id]);

  async function remove(visit: TeamVisit) {
    if (!window.confirm(locale === "cs" ? `Odebrat záznam pro ${visit.teamName}?` : `Remove the record for ${visit.teamName}?`)) return;
    const response = await fetch("/api/race-team-visits", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ raceId: race.id, id: visit.id }) });
    if (!response.ok) return showVisitError(response, locale);
    await load();
  }

  async function togglePaid(visit: TeamVisit) {
    const response = await fetch("/api/race-team-visits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...visit, id: visit.id, raceId: race.id, isPaid: !visit.isPaid }),
    });
    if (!response.ok) return showVisitError(response, locale);
    await load();
  }

  const groups = useMemo(() => {
    const map = new Map<string, { teamName: string; teamId: string | null; logoUrl?: string; items: TeamVisit[] }>();
    for (const visit of visits) {
      const key = visit.teamId ?? `name:${visit.teamName.toLowerCase()}`;
      const existing = map.get(key);
      if (existing) existing.items.push(visit);
      else map.set(key, { teamName: visit.teamName, teamId: visit.teamId, logoUrl: teams.find((team) => team.id === visit.teamId)?.logoUrl, items: [visit] });
    }
    return [...map.values()].sort((a, b) => a.teamName.localeCompare(b.teamName, "cs"));
  }, [visits, teams]);

  return <>
    <section className="dash-panel race-team-visits-panel">
      <header className="race-team-visits-heading">
        <div><span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM RACE CONTROL</span><h2>{locale === "cs" ? "Jiné týmy" : "Other teams"}</h2><p>{locale === "cs" ? "Když k nám na place přijde někdo z jiného týmu pro díl, servis nebo něco ze skladu." : "When someone from another team stops by our pit for a part, service, or stock item."}</p></div>
        <div className="race-team-visits-summary"><span>{formatCount(visits.length, locale, RECORD_FORMS)}</span>{canManage && <button className="primary-button no-print" type="button" onClick={() => setEditing(null)}>＋ {locale === "cs" ? "Přidat návštěvu" : "Add visit"}</button>}</div>
      </header>
      {loading ? <div className="empty-state"><span className="spinner" /><p>{locale === "cs" ? "Načítám…" : "Loading…"}</p></div> : groups.length === 0 ? <p className="category-empty">{locale === "cs" ? "Zatím žádné návštěvy jiných týmů." : "No visits from other teams yet."}</p> : <div className="race-team-visits-groups">
        {groups.map((group) => <article className="race-team-visit-group" key={group.teamId ?? group.teamName}>
          <header><RaceLogoBadge logoUrl={group.logoUrl} name={group.teamName} fallback="♙" size="small" /><strong>{group.teamName}</strong><span>{group.items.length}</span></header>
          <div className="race-team-visit-rows">{group.items.map((visit) => <div className="race-team-visit-row" key={visit.id}>
            <div className="race-team-visit-row-top">
              <span className={`race-team-visit-type type-${visit.itemType}`}>{itemTypeLabel(visit.itemType, locale)}</span>
              <strong className="race-team-visit-title">{visit.quantity > 1 ? `${visit.quantity}× ` : ""}{visit.description}</strong>
              <span className="race-team-visit-price">{visit.amountCents !== null ? formatMoney(visit.amountCents, visit.currency, locale) : "—"}</span>
              {visit.amountCents !== null && (canManage ? <button type="button" className={`delivery-payment-toggle no-print ${visit.isPaid ? "paid" : "unpaid"}`} onClick={() => { void togglePaid(visit); }}>{visit.isPaid ? "✓" : "○"} {visit.isPaid ? (locale === "cs" ? "Zaplaceno" : "Paid") : (locale === "cs" ? "Nezaplaceno" : "Unpaid")}</button> : <span className={`status-pill ${visit.isPaid ? "success" : "danger"}`}>{visit.isPaid ? "✓" : "○"} {visit.isPaid ? (locale === "cs" ? "Zaplaceno" : "Paid") : (locale === "cs" ? "Nezaplaceno" : "Unpaid")}</span>)}
              {canManage && <span className="race-team-visit-actions no-print"><button type="button" onClick={() => setEditing(visit)} aria-label={locale === "cs" ? "Upravit" : "Edit"} title={locale === "cs" ? "Upravit" : "Edit"}>✎</button><button className="delete" type="button" onClick={() => { void remove(visit); }} aria-label={locale === "cs" ? "Odebrat" : "Remove"} title={locale === "cs" ? "Odebrat" : "Remove"}>×</button></span>}
            </div>
            <div className="race-team-visit-meta">
              {visit.visitDate && <span><b>{locale === "cs" ? "Datum" : "Date"}:</b> {formatShortDate(visit.visitDate, locale)}</span>}
              {visit.driverName && <span><b>{locale === "cs" ? "Pilot" : "Driver"}:</b> {visit.driverName}</span>}
              {visit.mechanicName && <span><b>{locale === "cs" ? "Zapsal" : "Logged by"}:</b> {visit.mechanicName}</span>}
              {visit.notes && <span className="race-team-visit-note"><b>{locale === "cs" ? "Poznámka" : "Note"}:</b> {visit.notes}</span>}
            </div>
          </div>)}</div>
        </article>)}
      </div>}
    </section>
    {editing !== undefined && <VisitForm raceId={race.id} visit={editing} teams={teams} drivers={drivers} mechanics={mechanics} parts={parts} services={services} locale={locale} onClose={() => setEditing(undefined)} onSaved={async () => { setEditing(undefined); await load(); }} />}
  </>;
}

const NEW_TEAM_VALUE = "__new__";

function VisitForm({ raceId, visit, teams, drivers, mechanics, parts, services, locale, onClose, onSaved }: { raceId: string; visit: TeamVisit | null; teams: TeamOption[]; drivers: DriverOption[]; mechanics: MechanicOption[]; parts: InventoryPart[]; services: ServiceItem[]; locale: Locale; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [teamId, setTeamId] = useState(visit ? (visit.teamId ?? NEW_TEAM_VALUE) : (teams[0]?.id ?? NEW_TEAM_VALUE));
  const [teamName, setTeamName] = useState(visit?.teamName ?? "");
  const [driverId, setDriverId] = useState(visit?.driverId ?? "");
  const [driverName, setDriverName] = useState(visit?.driverName ?? "");
  const [itemType, setItemType] = useState<ItemType>(visit?.itemType ?? "part");
  const [resourceId, setResourceId] = useState(visit?.resourceId ?? "");
  const [oilBrand, setOilBrand] = useState<OilBrand | "">("");
  const [oilPackaging, setOilPackaging] = useState<OilPackaging>("1l");
  const [description, setDescription] = useState(visit?.description ?? "");
  const [quantity, setQuantity] = useState(visit?.quantity ?? 1);
  const [visitDate, setVisitDate] = useState(visit?.visitDate || today());
  const [mechanicId, setMechanicId] = useState(visit?.mechanicId ?? "");
  const [currency, setCurrency] = useState<Currency>(visit?.currency ?? "CZK");
  const [amount, setAmount] = useState(visit && visit.amountCents !== null ? (visit.amountCents / 100).toFixed(2) : "");
  const [isPaid, setIsPaid] = useState(visit?.isPaid ?? false);
  const [notes, setNotes] = useState(visit?.notes ?? "");

  const isNewTeam = teamId === NEW_TEAM_VALUE;
  const teamDrivers = drivers.filter((driver) => driver.teamId === teamId);

  function priceFor(cents: number) {
    return (cents / 100).toFixed(2);
  }

  function changeItemType(nextType: ItemType) {
    setItemType(nextType);
    setResourceId("");
    if (nextType === "part" || nextType === "other" || nextType === "oil") { setDescription(""); setAmount(""); }
    if (nextType !== "oil") { setOilBrand(""); setOilPackaging("1l"); }
  }

  function changeOilBrand(brand: OilBrand) {
    setOilBrand(brand);
    setDescription(oilDescription(brand, oilPackaging, locale));
  }

  function changeOilPackaging(packaging: OilPackaging) {
    setOilPackaging(packaging);
    if (oilBrand) setDescription(oilDescription(oilBrand, packaging, locale));
  }

  function unitPriceCents(id: string, forCurrency: Currency) {
    if (itemType === "service") {
      const service = services.find((item) => item.id === id);
      return service ? (forCurrency === "CZK" ? service.priceCzkCents : service.priceEurCents) : null;
    }
    if (itemType === "stock") {
      const part = parts.find((item) => item.id === id);
      return part ? (forCurrency === "CZK" ? part.priceCzkCents : part.priceEurCents) : null;
    }
    return null;
  }

  function changeResource(id: string) {
    setResourceId(id);
    if (itemType === "service") {
      const service = services.find((item) => item.id === id);
      if (service) setDescription(service.name);
    } else if (itemType === "stock") {
      const part = parts.find((item) => item.id === id);
      if (part) setDescription(part.name);
    }
    const unit = unitPriceCents(id, currency);
    if (unit !== null) setAmount(priceFor(unit * quantity));
  }

  function changeCurrency(nextCurrency: Currency) {
    setCurrency(nextCurrency);
    if (resourceId) {
      const unit = unitPriceCents(resourceId, nextCurrency);
      if (unit !== null) setAmount(priceFor(unit * quantity));
    }
  }

  function changeQuantity(nextQuantity: number) {
    setQuantity(nextQuantity);
    if (resourceId) {
      const unit = unitPriceCents(resourceId, currency);
      if (unit !== null) setAmount(priceFor(unit * nextQuantity));
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const finalTeamName = isNewTeam ? teamName.trim() : (teams.find((team) => team.id === teamId)?.name ?? "");
    if (!finalTeamName) {
      setError(locale === "cs" ? "Vyplň tým." : "Enter a team.");
      setSaving(false);
      return;
    }
    if (!description.trim()) {
      setError(locale === "cs" ? "Vyplň, o co šlo." : "Enter what it was.");
      setSaving(false);
      return;
    }
    let amountCents: number | null = null;
    if (amount.trim()) {
      const parsed = Number(amount.replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError(locale === "cs" ? "Zadej platnou cenu, nebo pole nech prázdné." : "Enter a valid price, or leave it blank.");
        setSaving(false);
        return;
      }
      amountCents = Math.round(parsed * 100);
    }
    const payload = {
      id: visit?.id,
      raceId,
      teamId: isNewTeam ? null : teamId || null,
      teamName: finalTeamName,
      driverId: isNewTeam ? null : (driverId || null),
      driverName: isNewTeam ? driverName.trim() : (drivers.find((driver) => driver.id === driverId)?.name ?? ""),
      itemType,
      resourceId: resourceId || null,
      description: description.trim(),
      quantity,
      visitDate,
      mechanicId: mechanicId || null,
      mechanicName: mechanics.find((mechanic) => mechanic.id === mechanicId)?.name ?? "",
      currency,
      amountCents,
      isPaid,
      notes: notes.trim(),
    };
    try {
      const response = await fetch("/api/race-team-visits", { method: visit ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Save failed");
      onSaved();
    } catch (saveError) {
      setError(visitErrorText(saveError instanceof Error ? saveError.message : "Save failed", locale));
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal race-modal" role="dialog" aria-modal="true">
      <div className="modal-header"><div><span className="eyebrow">MM RACE CONTROL</span><h2>{visit ? (locale === "cs" ? "Upravit návštěvu" : "Edit visit") : (locale === "cs" ? "Nová návštěva" : "New visit")}</h2></div><button className="close-button" type="button" onClick={onClose} aria-label={locale === "cs" ? "Zavřít" : "Close"}>×</button></div>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label><span>{locale === "cs" ? "Tým" : "Team"} *</span><select value={teamId} onChange={(event) => setTeamId(event.target.value)} required={!isNewTeam}>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            <option value={NEW_TEAM_VALUE}>{locale === "cs" ? "+ Jiný / nový tým" : "+ Other / new team"}</option>
          </select></label>
          {isNewTeam ? <label><span>{locale === "cs" ? "Název týmu" : "Team name"} *</span><input value={teamName} onChange={(event) => setTeamName(event.target.value)} required placeholder={locale === "cs" ? "např. tým, který nemáme v systému" : "e.g. a team we don't have on file"} /></label>
            : <label><span>{locale === "cs" ? "Pilot (nepovinné)" : "Driver (optional)"}</span><select value={driverId} onChange={(event) => setDriverId(event.target.value)}><option value="">{locale === "cs" ? "— bez konkrétního pilota —" : "— no specific driver —"}</option>{teamDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></label>}
          {isNewTeam && <label><span>{locale === "cs" ? "Pilot (nepovinné)" : "Driver (optional)"}</span><input value={driverName} onChange={(event) => setDriverName(event.target.value)} placeholder={locale === "cs" ? "jméno pilota" : "driver name"} /></label>}
          <label><span>{locale === "cs" ? "Typ" : "Type"}</span><select value={itemType} onChange={(event) => changeItemType(event.target.value as ItemType)}>
            <option value="part">{locale === "cs" ? "Díl" : "Part"}</option>
            <option value="service">{locale === "cs" ? "Servis" : "Service"}</option>
            <option value="stock">{locale === "cs" ? "Sklad" : "Stock"}</option>
            <option value="oil">{locale === "cs" ? "Olej" : "Oil"}</option>
            <option value="other">{locale === "cs" ? "Ostatní" : "Other"}</option>
          </select></label>
          <label><span>{locale === "cs" ? "Měna" : "Currency"}</span><select value={currency} onChange={(event) => changeCurrency(event.target.value as Currency)}><option value="CZK">CZK</option><option value="EUR">EUR</option></select></label>
          <label><span>{locale === "cs" ? "Datum" : "Date"}</span><input type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} /></label>
          <label><span>{locale === "cs" ? "Zapsal (mechanik)" : "Logged by (mechanic)"}</span><select value={mechanicId} onChange={(event) => setMechanicId(event.target.value)}><option value="">{locale === "cs" ? "— nevybráno —" : "— none —"}</option>{mechanics.map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.name}</option>)}</select></label>
          {itemType === "service" && <label className="full-field"><span>{locale === "cs" ? "Položka z ceníku servisu" : "Service price-list item"}</span><select value={resourceId} onChange={(event) => changeResource(event.target.value)}><option value="">{locale === "cs" ? "— vybrat —" : "— select —"}</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>}
          {itemType === "stock" && <label className="full-field"><span>{locale === "cs" ? "Položka ze skladu" : "Stock item"}</span><select value={resourceId} onChange={(event) => changeResource(event.target.value)}><option value="">{locale === "cs" ? "— vybrat —" : "— select —"}</option>{parts.map((part) => <option key={part.id} value={part.id} disabled={part.quantity <= 0 && part.id !== resourceId}>{part.name}{part.quantity <= 0 ? ` (${locale === "cs" ? "vyprodáno" : "out of stock"})` : ""}</option>)}</select></label>}
          {itemType === "oil" && <label><span>{locale === "cs" ? "Druh oleje" : "Oil brand"}</span><select value={oilBrand} onChange={(event) => changeOilBrand(event.target.value as OilBrand)}><option value="">{locale === "cs" ? "— vybrat —" : "— select —"}</option><option value="factory">Factory</option><option value="castor_blend">Castor Blend</option></select></label>}
          {itemType === "oil" && <label><span>{locale === "cs" ? "Balení" : "Packaging"}</span><select value={oilPackaging} onChange={(event) => changeOilPackaging(event.target.value as OilPackaging)}><option value="1l">1 l</option><option value="carton12l">{locale === "cs" ? "Karton (12 l)" : "Carton (12 l)"}</option></select></label>}
          <label className="full-field"><span>{locale === "cs" ? "Co to bylo" : "What it was"} *</span><input value={description} onChange={(event) => setDescription(event.target.value)} required placeholder={locale === "cs" ? "např. svíčka, seřízení karburátoru…" : "e.g. spark plug, carburetor adjustment…"} /></label>
          <label><span>{locale === "cs" ? "Množství" : "Quantity"}</span><input type="number" min="1" max="10000" value={quantity} onChange={(event) => changeQuantity(Math.max(1, Number(event.target.value) || 1))} /></label>
          <label><span>{locale === "cs" ? "Cena celkem (nepovinné)" : "Total price (optional)"}</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" /></label>
          <label className="settings-check"><input type="checkbox" checked={isPaid} onChange={(event) => setIsPaid(event.target.checked)} /><span>{locale === "cs" ? "Zaplaceno" : "Paid"}</span></label>
          <label className="full-field"><span>{locale === "cs" ? "Poznámka" : "Note"}</span><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><span className="modal-actions-spacer" /><button className="secondary-compact" type="button" onClick={onClose} disabled={saving}>{locale === "cs" ? "Zrušit" : "Cancel"}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? (locale === "cs" ? "Ukládám…" : "Saving…") : (locale === "cs" ? "Uložit" : "Save")}</button></div>
      </form>
    </section>
  </div>;
}

function itemTypeLabel(type: ItemType, locale: Locale) {
  const labels: Record<ItemType, [string, string]> = { part: ["Díl", "Part"], service: ["Servis", "Service"], stock: ["Sklad", "Stock"], oil: ["Olej", "Oil"], other: ["Ostatní", "Other"] };
  return labels[type][locale === "cs" ? 0 : 1];
}

function oilBrandLabel(brand: OilBrand) {
  return brand === "factory" ? "Factory" : "Castor Blend";
}

function oilPackagingLabel(packaging: OilPackaging, locale: Locale) {
  return packaging === "carton12l" ? (locale === "cs" ? "karton 12 l" : "12 l carton") : "1 l";
}

function oilDescription(brand: OilBrand, packaging: OilPackaging, locale: Locale) {
  return `${locale === "cs" ? "Olej" : "Oil"} ${oilBrandLabel(brand)} · ${oilPackagingLabel(packaging, locale)}`;
}

function formatShortDate(date: string, locale: Locale) {
  if (!date) return "";
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function formatMoney(cents: number, currency: Currency, locale: Locale) {
  return new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { style: "currency", currency, maximumFractionDigits: currency === "CZK" ? 0 : 2 }).format(cents / 100);
}

async function showVisitError(response: Response, locale: Locale) {
  const result = await response.json().catch(() => ({})) as { error?: string };
  window.alert(visitErrorText(result.error || "Operation failed", locale));
}

function visitErrorText(error: string, locale: Locale) {
  if (locale === "en") return error;
  const translations: Record<string, string> = { "Team is required": "Vyplň tým.", "Invalid item type": "Neplatný typ.", "Description is required": "Vyplň, o co šlo.", "Invalid amount": "Zadej platnou cenu.", "Completed races can only be corrected by superadmin": "Dokončený závod může upravit pouze superadmin." };
  return translations[error] ?? error;
}
