"use client";

import { useEffect, useState } from "react";
import { formatCount, type PluralForms } from "./pluralize";
import { EmptyState, LoadingState } from "./empty-state";

const RECORD_FORMS: PluralForms = { cs: ["záznam", "záznamy", "záznamů"], en: ["record", "records"] };
const DRIVER_FORMS: PluralForms = { cs: ["pilot", "piloti", "pilotů"], en: ["driver", "drivers"] };

type Locale = "cs" | "en";
type RaceInfo = { id: string };

type ActivityEntry = {
  id: string;
  actorEmail: string;
  action: string;
  entityType: string;
  createdAt: number;
  details: Record<string, unknown> | null;
};

export function RaceActivityPanel({ race, locale, active }: { race: RaceInfo; locale: Locale; active: boolean }) {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/race-activity?raceId=${encodeURIComponent(race.id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      setActivity(((await response.json()) as { activity?: ActivityEntry[] }).activity ?? []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (active) void load(); }, [active, race.id]);

  return <section className="dash-panel race-activity-panel">
    <header>
      <div><span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM RACE CONTROL</span><h2>{locale === "cs" ? "Historie změn" : "Change history"}</h2><p>{locale === "cs" ? "Kdo a kdy co na tomto závodě změnil." : "Who changed what on this race, and when."}</p></div>
      <span>{formatCount(activity.length, locale, RECORD_FORMS)}</span>
    </header>
    {loading ? <LoadingState label={locale === "cs" ? "Načítám…" : "Loading…"} />
      : error ? <EmptyState variant="error" icon="!" title={locale === "cs" ? "Historii se nepodařilo načíst." : "Could not load the history."} action={<button className="secondary-compact" type="button" onClick={() => { void load(); }}>{locale === "cs" ? "Zkusit znovu" : "Try again"}</button>} />
      : activity.length === 0 ? <EmptyState size="compact" title={locale === "cs" ? "Zatím žádná zaznamenaná aktivita." : "No recorded activity yet."} />
        : <ul className="race-activity-list">{activity.map((entry) => <li className="race-activity-row" key={entry.id}>
          <span className={`race-activity-dot tone-${activityTone(entry.action)}`} />
          <span className="race-activity-text"><strong>{describeActivity(entry, locale)}</strong><small>{entry.actorEmail} · {formatTimestamp(entry.createdAt, locale)}</small></span>
        </li>)}</ul>}
  </section>;
}

function activityTone(action: string) {
  if (action === "create" || action === "assign" || action === "confirm" || action === "confirm_all") return "positive";
  if (action === "delete" || action === "archive" || action === "remove_from_race" || action === "unconfirm") return "negative";
  return "neutral";
}

function detailString(details: Record<string, unknown> | null, key: string) {
  if (!details) return "";
  const value = details[key];
  return typeof value === "string" ? value : "";
}

function nested(details: Record<string, unknown> | null, path: string): Record<string, unknown> | null {
  if (!details) return null;
  const value = details[path];
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function describeActivity(entry: ActivityEntry, locale: Locale) {
  const cs = locale === "cs";
  const { entityType, action, details } = entry;
  const after = nested(details, "after");
  const driverName = detailString(details, "driverName") || detailString(after, "driverName");
  const mechanicName = detailString(details, "mechanicName");
  const vehicleName = detailString(details, "vehicleName");
  const teamName = detailString(details, "teamName") || detailString(after, "teamName");
  const description = detailString(details, "description") || detailString(after, "description");
  const customerName = detailString(details, "customerName") || detailString(after, "customerName");
  const category = detailString(details, "category") || detailString(after, "category");
  const code = detailString(details, "code");
  const count = typeof details?.count === "number" ? details.count : null;

  if (entityType === "race") {
    if (action === "create") return cs ? "Závod vytvořen" : "Race created";
    if (action === "archive") return cs ? "Závod archivován" : "Race archived";
    return cs ? "Údaje závodu upraveny" : "Race details updated";
  }
  if (entityType === "race_entry" || entityType === "entry") {
    if (action === "create") return cs ? `Přidán pilot${driverName ? ` — ${driverName}` : ""}${category ? ` (${category})` : ""}` : `Driver added${driverName ? ` — ${driverName}` : ""}`;
    if (action === "update") return cs ? `Upravena posádka pilota${driverName ? ` — ${driverName}` : ""}` : `Driver assignment updated${driverName ? ` — ${driverName}` : ""}`;
    if (action === "remove_from_race") return cs ? `Odebrán pilot${driverName ? ` — ${driverName}` : ""}` : `Driver removed${driverName ? ` — ${driverName}` : ""}`;
    if (action === "confirm") return cs ? `Pilot potvrzen${driverName ? ` — ${driverName}` : ""}` : `Driver confirmed${driverName ? ` — ${driverName}` : ""}`;
    if (action === "unconfirm") return cs ? `Zrušeno potvrzení pilota${driverName ? ` — ${driverName}` : ""}` : `Driver confirmation removed${driverName ? ` — ${driverName}` : ""}`;
    if (action === "confirm_all") return cs
      ? (count !== null ? `Potvrzeno ${formatCount(count, "cs", DRIVER_FORMS)} najednou` : "Potvrzeno pilotů najednou")
      : (count !== null ? `${formatCount(count, "en", DRIVER_FORMS)} confirmed at once` : "Drivers confirmed at once");
  }
  if (entityType === "race_mechanic" || entityType === "mechanic") {
    if (action === "remove_from_race") return cs ? `Odebrán mechanik${mechanicName ? ` — ${mechanicName}` : ""}` : `Mechanic removed${mechanicName ? ` — ${mechanicName}` : ""}`;
    return cs ? `Mechanik přiřazen${mechanicName ? ` — ${mechanicName}` : ""}${vehicleName ? `, auto: ${vehicleName}` : ""}` : `Mechanic assigned${mechanicName ? ` — ${mechanicName}` : ""}`;
  }
  if (entityType === "race_vehicle" || entityType === "vehicle") {
    if (action === "remove_from_race") return cs ? `Odebráno auto${vehicleName ? ` — ${vehicleName}` : ""}` : `Vehicle removed${vehicleName ? ` — ${vehicleName}` : ""}`;
    return cs ? `Auto přiřazeno${vehicleName ? ` — ${vehicleName}` : ""}` : `Vehicle assigned${vehicleName ? ` — ${vehicleName}` : ""}`;
  }
  if (entityType === "race_extra" || entityType === "extra") {
    if (action === "remove_from_race") return cs ? `Odebráno extra vybavení${code ? ` — ${code}` : ""}` : `Extra equipment removed${code ? ` — ${code}` : ""}`;
    return cs ? `Přidáno extra vybavení${code ? ` — ${code}` : ""}` : `Extra equipment added${code ? ` — ${code}` : ""}`;
  }
  if (entityType === "race_team_visit") {
    if (action === "create") return cs ? `Přidána návštěva jiného týmu${teamName ? ` — ${teamName}` : ""}${description ? `: ${description}` : ""}` : `Other-team visit added${teamName ? ` — ${teamName}` : ""}`;
    if (action === "update") return cs ? `Upravena návštěva jiného týmu${teamName ? ` — ${teamName}` : ""}` : `Other-team visit updated${teamName ? ` — ${teamName}` : ""}`;
    if (action === "delete") return cs ? `Smazána návštěva jiného týmu${teamName ? ` — ${teamName}` : ""}` : `Other-team visit deleted${teamName ? ` — ${teamName}` : ""}`;
  }
  if (entityType === "race_delivery") {
    if (action === "create") return cs ? `Přidána předávka${customerName ? ` — ${customerName}` : ""}` : `Delivery added${customerName ? ` — ${customerName}` : ""}`;
    if (action === "update") return cs ? `Upravena předávka${customerName ? ` — ${customerName}` : ""}` : `Delivery updated${customerName ? ` — ${customerName}` : ""}`;
    if (action === "delete") return cs ? `Smazána předávka${customerName ? ` — ${customerName}` : ""}` : `Delivery deleted${customerName ? ` — ${customerName}` : ""}`;
  }
  if (entityType === "race_finance") return cs ? `Upravena platba pilota${driverName ? ` — ${driverName}` : ""}` : `Driver payment updated${driverName ? ` — ${driverName}` : ""}`;
  if (entityType === "accommodation" || entityType === "flight" || entityType === "rental") {
    const kindLabel = entityType === "accommodation" ? (cs ? "ubytování" : "accommodation") : entityType === "flight" ? (cs ? "letenka" : "flight") : (cs ? "pronájem auta" : "rental");
    if (action === "create") return cs ? `Přidáno ${kindLabel}` : `${kindLabel} added`;
    if (action === "archive") return cs ? `Zrušeno ${kindLabel}` : `${kindLabel} cancelled`;
    return cs ? `Upraveno ${kindLabel}` : `${kindLabel} updated`;
  }
  return `${entityType} · ${action}`;
}

function formatTimestamp(value: number, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
