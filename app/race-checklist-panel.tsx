"use client";

import { useEffect, useState } from "react";
import { countryFlag } from "./countries";

type Locale = "cs" | "en";
type Role = "superadmin" | "boss" | "mechanic";
type RaceInfo = { id: string; name: string; track: string; countryCode: string; startDate: string; endDate: string; status: "planned" | "active" | "completed" };
type VehicleOption = { vehicleId: string; vehicleName: string };
type ChecklistTemplate = { id: string; name: string };

type RaceChecklistItem = { id: string; section: string; partNumber: string; name: string; quantity: number; isChecked: boolean };
type RaceChecklistRecord = { id: string; checklistId: string | null; vehicleId: string | null; vehicleName: string; name: string; notes: string; items: RaceChecklistItem[] };

export function RaceChecklistPanel({ race, locale, role, vehicles }: { race: RaceInfo; locale: Locale; role: Role; vehicles: VehicleOption[] }) {
  const canManage = role !== "mechanic" && (race.status !== "completed" || role === "superadmin");
  const [checklists, setChecklists] = useState<RaceChecklistRecord[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [attachedResponse, templatesResponse] = await Promise.all([
        fetch(`/api/race-checklists?raceId=${race.id}`, { cache: "no-store" }),
        fetch("/api/checklists", { cache: "no-store" }),
      ]);
      if (!attachedResponse.ok || !templatesResponse.ok) throw new Error();
      const attached = await attachedResponse.json() as { checklists: RaceChecklistRecord[] };
      const available = await templatesResponse.json() as { checklists: ChecklistTemplate[] };
      setChecklists(attached.checklists ?? []);
      setTemplates(available.checklists ?? []);
      setError(false);
    } catch { setError(true); } finally { setLoading(false); }
  }
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [race.id]);

  async function attach() {
    if (!templateId) return;
    setSaving(true);
    try {
      const response = await fetch("/api/race-checklists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raceId: race.id, checklistId: templateId, vehicleId: vehicleId || null }) });
      if (!response.ok) throw new Error();
      setAttaching(false); setTemplateId(""); setVehicleId("");
      await load();
    } catch {
      window.alert(locale === "cs" ? "Checklist se nepodařilo přiřadit." : "Could not attach the checklist.");
    } finally { setSaving(false); }
  }

  async function toggleItem(checklistId: string, item: RaceChecklistItem) {
    setChecklists((current) => current.map((checklist) => checklist.id !== checklistId ? checklist : { ...checklist, items: checklist.items.map((entry) => entry.id === item.id ? { ...entry, isChecked: !entry.isChecked } : entry) }));
    const response = await fetch("/api/race-checklists", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, isChecked: !item.isChecked }) });
    if (!response.ok) await load();
  }

  async function detach(checklist: RaceChecklistRecord) {
    if (!window.confirm(locale === "cs" ? "Odebrat tento checklist ze závodu?" : "Remove this checklist from the race?")) return;
    const response = await fetch("/api/race-checklists", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: checklist.id }) });
    if (!response.ok) return window.alert(locale === "cs" ? "Checklist se nepodařilo odebrat." : "Could not remove the checklist.");
    await load();
  }

  function printChecklist() {
    const previousTitle = document.title;
    document.body.dataset.printMode = "checklist";
    document.title = checklistPrintTitle(race);
    window.print();
    window.setTimeout(() => { delete document.body.dataset.printMode; document.title = previousTitle; }, 500);
  }

  return <section className="dash-panel race-checklist-panel">
    <header>
      <div><span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM CHECKLISTS</span><h2>{locale === "cs" ? "Checklist vybavení" : "Equipment checklist"}</h2><p>{locale === "cs" ? "Kontrolní seznamy dílů a vybavení pro tento závod." : "Parts and equipment checklists for this race."}</p><span className="print-only race-checklist-print-context">{race.name} · {formatDateRange(race.startDate, race.endDate, locale)} · {countryFlag(race.countryCode)} {race.track}</span></div>
      <img className="race-checklist-logo print-only" src="/machac-motors-logo.jpg" alt="Macháč Motors" />
      <div className="race-checklist-heading-actions no-print">
        {checklists.length > 0 && <button className="secondary-compact" type="button" onClick={printChecklist}>⌁ {locale === "cs" ? "Vytisknout checklist" : "Print checklist"}</button>}
        {canManage && <button className="secondary-compact" type="button" onClick={() => setAttaching((current) => !current)}>＋ {locale === "cs" ? "Přiřadit checklist" : "Attach checklist"}</button>}
      </div>
    </header>
    {attaching && (
      <div className="race-checklist-attach no-print">
        {templates.length === 0
          ? <p className="form-hint">{locale === "cs" ? "V Dokumentech zatím nemáš žádnou šablonu checklistu. Vytvoř ji tam a vrať se sem." : "You don't have any checklist template in Documents yet. Create one there and come back."}</p>
          : <>
            <label><span>{locale === "cs" ? "Šablona" : "Template"}</span>
              <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                <option value="">{locale === "cs" ? "Vyber checklist…" : "Select checklist…"}</option>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </label>
            <label><span>{locale === "cs" ? "Auto (nepovinné)" : "Vehicle (optional)"}</span>
              <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
                <option value="">{locale === "cs" ? "— bez přiřazení —" : "— unassigned —"}</option>
                {vehicles.map((vehicle) => <option key={vehicle.vehicleId} value={vehicle.vehicleId}>{vehicle.vehicleName}</option>)}
              </select>
            </label>
          </>}
        <div className="race-checklist-attach-actions">
          <button className="secondary-compact" type="button" onClick={() => setAttaching(false)} disabled={saving}>{locale === "cs" ? "Zrušit" : "Cancel"}</button>
          {templates.length > 0 && <button className="primary-button" type="button" disabled={!templateId || saving} onClick={() => { void attach(); }}>{saving ? (locale === "cs" ? "Přiřazuji…" : "Attaching…") : (locale === "cs" ? "Přiřadit" : "Attach")}</button>}
        </div>
      </div>
    )}
    {loading && <div className="empty-state"><span className="spinner" /><p>{locale === "cs" ? "Načítám…" : "Loading…"}</p></div>}
    {!loading && error && <div className="empty-state error-state"><b>!</b><p>{locale === "cs" ? "Checklisty se nepodařilo načíst." : "Could not load checklists."}</p></div>}
    {!loading && !error && checklists.length === 0 && (
      <div className="empty-state">
        <span className="empty-engine">☑</span>
        <h2>{locale === "cs" ? "Zatím žádný checklist" : "No checklist yet"}</h2>
        <p>{locale === "cs" ? "Přiřaď šablonu z Dokumentů a odškrtávej vybavení před odjezdem." : "Attach a template from Documents and tick off equipment before departure."}</p>
      </div>
    )}
    {!loading && !error && checklists.length > 0 && <div className="race-checklist-list">
      {checklists.map((checklist) => <RaceChecklistCard key={checklist.id} checklist={checklist} locale={locale} canManage={canManage} onToggle={(item) => { void toggleItem(checklist.id, item); }} onRemove={() => { void detach(checklist); }} />)}
    </div>}
  </section>;
}

function RaceChecklistCard({ checklist, locale, canManage, onToggle, onRemove }: { checklist: RaceChecklistRecord; locale: Locale; canManage: boolean; onToggle: (item: RaceChecklistItem) => void; onRemove: () => void }) {
  const checked = checklist.items.filter((item) => item.isChecked).length;
  const total = checklist.items.length;
  const done = total > 0 && checked === total;
  const grouped = groupBySection(checklist.items);
  return <article className={`race-checklist-card ${done ? "done" : ""}`}>
    <header>
      <div><h3>{checklist.name}</h3>{checklist.vehicleName && <span className="race-checklist-vehicle">🚐 {checklist.vehicleName}</span>}</div>
      <div className="race-checklist-progress">
        <span className={done ? "done" : "pending"}>{done ? "✓" : "○"} {checked}/{total}</span>
        {canManage && <button className="checklist-item-remove no-print" type="button" onClick={onRemove} aria-label={locale === "cs" ? "Odebrat checklist" : "Remove checklist"}>×</button>}
      </div>
    </header>
    {grouped.map(([section, items]) => <div className="race-checklist-section" key={section || "_"}>
      {section && <small>{section}</small>}
      <ul>
        {items.map((item) => <li key={item.id}>
          <label className={item.isChecked ? "checked" : ""}>
            <input type="checkbox" checked={item.isChecked} disabled={!canManage} onChange={() => onToggle(item)} />
            <span>{item.quantity}× {item.name}{item.partNumber ? ` · ${item.partNumber}` : ""}</span>
          </label>
        </li>)}
      </ul>
    </div>)}
  </article>;
}

function formatDateRange(start: string, end: string, locale: Locale) {
  const formatter = new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "numeric", year: "numeric" });
  const parse = (value: string) => new Date(`${value}T00:00:00`);
  if (!start || !end) return "—";
  return start === end ? formatter.format(parse(start)) : `${formatter.format(parse(start))} – ${formatter.format(parse(end))}`;
}

function checklistPrintTitle(race: RaceInfo) {
  const datePart = race.startDate === race.endDate ? race.startDate : `${race.startDate}_${race.endDate}`;
  return `${race.name}_checklist_${datePart}`.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_");
}

function groupBySection(items: RaceChecklistItem[]) {
  const map = new Map<string, RaceChecklistItem[]>();
  for (const item of items) {
    const key = item.section || "";
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return Array.from(map.entries());
}
