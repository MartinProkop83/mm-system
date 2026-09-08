"use client";

import { useEffect, useState } from "react";
import { formatCount, type PluralForms } from "./pluralize";
import { EmptyState, LoadingState } from "./empty-state";
import { useModalA11y } from "./use-modal-a11y";

const ITEM_FORMS: PluralForms = { cs: ["položka", "položky", "položek"], en: ["item", "items"] };

type Locale = "cs" | "en";
type Role = "superadmin" | "boss" | "mechanic";
type PaymentMethod = "cash" | "card" | "bank_transfer" | "invoice" | "other";

type RaceInfo = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  track: string;
  status: "planned" | "active" | "completed";
};

type RaceDelivery = {
  id: string;
  raceId: string;
  customerName: string;
  description: string;
  quantity: number;
  currency: "CZK" | "EUR";
  amountCents: number;
  paymentMethod: PaymentMethod;
  isDelivered: boolean;
  isPaid: boolean;
  notes: string;
};

type RaceFollowupNotes = {
  nextRace: string;
  consumed: string;
  missing: string;
  otherNotes: string;
};

const emptyFollowupNotes: RaceFollowupNotes = { nextRace: "", consumed: "", missing: "", otherNotes: "" };

type PreviousRaceInfo = { id: string; name: string; startDate: string; endDate: string };

export function RaceDeliveriesPanel({ race, locale, role, activeSection, previousRace = null }: { race: RaceInfo; locale: Locale; role: Role; activeSection: "deliveries" | "notes"; previousRace?: PreviousRaceInfo | null }) {
  const [deliveries, setDeliveries] = useState<RaceDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RaceDelivery | null | undefined>(undefined);
  const [followupNotes, setFollowupNotes] = useState<RaceFollowupNotes>(emptyFollowupNotes);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [previousNotes, setPreviousNotes] = useState<RaceFollowupNotes | null>(null);
  const canManage = role !== "mechanic" && (race.status !== "completed" || role === "superadmin");
  const canEditNotes = race.status !== "completed" || role === "superadmin";

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/race-deliveries?raceId=${encodeURIComponent(race.id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const result = (await response.json()) as { deliveries?: RaceDelivery[] };
      setDeliveries(result.deliveries ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function loadFollowupNotes() {
    const response = await fetch(`/api/race-followup-notes?raceId=${encodeURIComponent(race.id)}`, { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as { notes?: RaceFollowupNotes };
    setFollowupNotes(result.notes ?? emptyFollowupNotes);
  }

  async function loadPreviousNotes(previousRaceId: string) {
    const response = await fetch(`/api/race-followup-notes?raceId=${encodeURIComponent(previousRaceId)}`, { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as { notes?: RaceFollowupNotes };
    setPreviousNotes(result.notes ?? null);
  }

  useEffect(() => { void load(); void loadFollowupNotes(); }, [race.id]);
  useEffect(() => { if (previousRace) void loadPreviousNotes(previousRace.id); else setPreviousNotes(null); }, [previousRace?.id]);

  async function saveFollowupNotes() {
    setNotesSaving(true);
    setNotesSaved(false);
    const response = await fetch("/api/race-followup-notes", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ raceId: race.id, ...followupNotes }) });
    setNotesSaving(false);
    if (!response.ok) return showDeliveryError(response, locale);
    setNotesSaved(true);
    window.setTimeout(() => setNotesSaved(false), 2500);
  }

  async function remove(delivery: RaceDelivery) {
    if (!window.confirm(locale === "cs" ? `Odebrat položku pro ${delivery.customerName}?` : `Remove item for ${delivery.customerName}?`)) return;
    const response = await fetch("/api/race-deliveries", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ raceId: race.id, id: delivery.id }) });
    if (!response.ok) return showDeliveryError(response, locale);
    await load();
  }

  async function togglePaid(delivery: RaceDelivery) {
    setDeliveries((current) => current.map((item) => item.id === delivery.id ? { ...item, isPaid: !item.isPaid } : item));
    const response = await fetch("/api/race-deliveries", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...delivery, isPaid: !delivery.isPaid }) });
    if (!response.ok) {
      await showDeliveryError(response, locale);
      await load();
    }
  }

  async function toggleDelivered(delivery: RaceDelivery) {
    setDeliveries((current) => current.map((item) => item.id === delivery.id ? { ...item, isDelivered: !item.isDelivered } : item));
    const response = await fetch("/api/race-deliveries", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...delivery, isDelivered: !delivery.isDelivered }) });
    if (!response.ok) {
      await showDeliveryError(response, locale);
      await load();
    }
  }

  const unpaidCount = deliveries.filter((item) => !item.isPaid).length;
  const undeliveredCount = deliveries.filter((item) => !item.isDelivered).length;
  const totals = (["CZK", "EUR"] as const).map((currency) => ({ currency, cents: deliveries.filter((item) => item.currency === currency).reduce((sum, item) => sum + item.amountCents, 0) })).filter((item) => item.cents > 0);

  return <>
    {previousRace && previousNotes?.nextRace.trim() && <section className={`dash-panel race-previous-notes no-print ${activeSection === "deliveries" ? "screen-hidden" : ""}`}>
      <span className="eyebrow">{locale === "cs" ? "Z MINULÉHO ZÁVODU" : "FROM THE PREVIOUS RACE"}</span>
      <h3>{previousRace.name} · {formatRaceDates(previousRace.startDate, previousRace.endDate, locale)}</h3>
      <p>{previousNotes.nextRace}</p>
    </section>}
    <section className="dash-panel race-deliveries-print-page">
      <header className={`race-deliveries-heading ${activeSection === "notes" ? "screen-hidden" : ""}`}>
        <div className="delivery-print-brand"><img src="/machac-motors-logo.jpg" alt="Macháč Motors" /><div><span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM RACE CONTROL</span><h2>{locale === "cs" ? "Předávky a platby" : "Deliveries and payments"}</h2><p>{race.name} · {formatRaceDates(race.startDate, race.endDate, locale)} · {race.track}</p></div></div>
        <div className="race-deliveries-summary"><span>{formatCount(deliveries.length, locale, ITEM_FORMS)}</span>{totals.map((item) => <strong key={item.currency}>{formatMoney(item.cents, item.currency, locale)}</strong>)}{undeliveredCount > 0 && <em>{undeliveredCount} {locale === "cs" ? "nepředáno" : "not delivered"}</em>}{unpaidCount > 0 && <em>{unpaidCount} {locale === "cs" ? "nezaplaceno" : "unpaid"}</em>}</div>
        {canManage && <button className="primary-button no-print" type="button" onClick={() => setEditing(null)}>＋ {locale === "cs" ? "Přidat položku" : "Add item"}</button>}
      </header>
      <div className={`race-deliveries-table-wrap ${activeSection === "notes" ? "screen-hidden" : ""}`}>
        <table className="race-deliveries-table">
          <thead><tr><th>{locale === "cs" ? "Zákazník" : "Customer"}</th><th>{locale === "cs" ? "Co vezeme" : "Item"}</th><th>{locale === "cs" ? "Množství" : "Qty"}</th><th>{locale === "cs" ? "Cena" : "Amount"}</th><th>{locale === "cs" ? "Platba" : "Payment"}</th><th>{locale === "cs" ? "Předáno" : "Delivered"}</th><th>{locale === "cs" ? "Zaplaceno" : "Paid"}</th><th>{locale === "cs" ? "Poznámka" : "Note"}</th>{canManage && <th className="no-print">{locale === "cs" ? "Akce" : "Actions"}</th>}</tr></thead>
          <tbody>
            {deliveries.map((delivery) => <tr key={delivery.id}><td><strong>{delivery.customerName}</strong></td><td>{delivery.description}</td><td>{delivery.quantity}</td><td><strong>{formatMoney(delivery.amountCents, delivery.currency, locale)}</strong></td><td>{paymentMethodLabel(delivery.paymentMethod, locale)}</td><td>{canManage ? <button className={`delivery-payment-toggle no-print ${delivery.isDelivered ? "paid" : "unpaid"}`} type="button" onClick={() => { void toggleDelivered(delivery); }}>{delivery.isDelivered ? "✓" : "○"} {delivery.isDelivered ? (locale === "cs" ? "Ano" : "Yes") : (locale === "cs" ? "Ne" : "No")}</button> : null}<span className={`delivery-payment-print ${delivery.isDelivered ? "paid" : "unpaid"}`}>{delivery.isDelivered ? "✓" : "□"}</span></td><td>{canManage ? <button className={`delivery-payment-toggle no-print ${delivery.isPaid ? "paid" : "unpaid"}`} type="button" onClick={() => { void togglePaid(delivery); }}>{delivery.isPaid ? "✓" : "○"} {delivery.isPaid ? (locale === "cs" ? "Ano" : "Yes") : (locale === "cs" ? "Ne" : "No")}</button> : null}<span className={`delivery-payment-print ${delivery.isPaid ? "paid" : "unpaid"}`}>{delivery.isPaid ? "✓" : "□"}</span></td><td>{delivery.notes || "—"}</td>{canManage && <td className="delivery-row-actions no-print"><button type="button" onClick={() => setEditing(delivery)}>{locale === "cs" ? "Upravit" : "Edit"}</button><button className="delete" type="button" onClick={() => { void remove(delivery); }}>×</button></td>}</tr>)}
            {loading && <tr className="no-print"><td colSpan={9}><LoadingState size="compact" label={locale === "cs" ? "Načítám…" : "Loading…"} /></td></tr>}
            {!loading && deliveries.length === 0 && <tr className="no-print"><td colSpan={9}><EmptyState size="compact" title={locale === "cs" ? "Zatím nejsou přidané žádné předávky. Přidej je před odjezdem, nebo použij prázdné řádky na vytištěném listu." : "No deliveries yet. Add them before departure or use the blank rows on the printed sheet."} /></td></tr>}
            {Array.from({ length: Math.max(3, 7 - deliveries.length) }, (_, index) => <tr className="delivery-print-blank" key={`blank-${index}`}><td>&nbsp;</td><td /><td /><td /><td /><td>□</td><td>□</td><td /></tr>)}
          </tbody>
        </table>
      </div>
      <section className={`race-followup-notes ${activeSection === "deliveries" ? "screen-hidden" : ""}`}>
        <header><div><span className="eyebrow"><span className="streak"><i /><i /><i /></span>MM RACE CONTROL</span><strong>{locale === "cs" ? "Poznatky ze závodu" : "Race follow-up notes"}</strong><p>{locale === "cs" ? "Zapiš vše, na co přijdeme během závodu." : "Capture everything discovered during the race."}</p></div>{canEditNotes && <button className="secondary-compact no-print" type="button" onClick={() => { void saveFollowupNotes(); }} disabled={notesSaving}>{notesSaving ? (locale === "cs" ? "Ukládám…" : "Saving…") : notesSaved ? (locale === "cs" ? "✓ Uloženo" : "✓ Saved") : (locale === "cs" ? "Uložit poznámky" : "Save notes")}</button>}</header>
        <div className="race-followup-grid">
          <FollowupField locale={locale} label={locale === "cs" ? "Vzít na další závod" : "Take to next race"} value={followupNotes.nextRace} field="nextRace" canEdit={canEditNotes} checkable onChange={(field, value) => setFollowupNotes((current) => ({ ...current, [field]: value }))} />
          <FollowupField locale={locale} label={locale === "cs" ? "Došlo / spotřebováno" : "Ran out / consumed"} value={followupNotes.consumed} field="consumed" canEdit={canEditNotes} onChange={(field, value) => setFollowupNotes((current) => ({ ...current, [field]: value }))} />
          <FollowupField locale={locale} label={locale === "cs" ? "Chybí" : "Missing"} value={followupNotes.missing} field="missing" canEdit={canEditNotes} onChange={(field, value) => setFollowupNotes((current) => ({ ...current, [field]: value }))} />
          <FollowupField locale={locale} label={locale === "cs" ? "Ostatní poznámky" : "Other notes"} value={followupNotes.otherNotes} field="otherNotes" canEdit={canEditNotes} onChange={(field, value) => setFollowupNotes((current) => ({ ...current, [field]: value }))} />
        </div>
      </section>
      <div className={`delivery-notes-sheet ${activeSection === "deliveries" ? "screen-hidden" : ""}`}><strong>{locale === "cs" ? "Další volné poznámky" : "Additional free notes"}</strong><div>{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div></div>
    </section>
    {editing !== undefined && <DeliveryForm raceId={race.id} delivery={editing} locale={locale} onClose={() => setEditing(undefined)} onSaved={async () => { setEditing(undefined); await load(); }} />}
  </>;
}

const DONE_PREFIX = "✓ ";

function FollowupField({ locale, label, value, field, canEdit, checkable = false, onChange }: { locale: Locale; label: string; value: string; field: keyof RaceFollowupNotes; canEdit: boolean; checkable?: boolean; onChange: (field: keyof RaceFollowupNotes, value: string) => void }) {
  const lines = value.split("\n");
  const rows = lines.length > 0 ? lines : [""];
  const filledLines = lines.map((line) => line.trim()).filter(Boolean);
  const isDone = (row: string) => checkable && row.startsWith(DONE_PREFIX);
  const rowText = (row: string) => (checkable && row.startsWith(DONE_PREFIX) ? row.slice(DONE_PREFIX.length) : row);

  function setRows(next: string[]) {
    onChange(field, next.join("\n"));
  }
  function updateRow(index: number, next: string) {
    const prefix = isDone(rows[index]) ? DONE_PREFIX : "";
    setRows(rows.map((row, rowIndex) => (rowIndex === index ? prefix + next : row)));
  }
  function toggleRowDone(index: number) {
    setRows(rows.map((row, rowIndex) => rowIndex !== index ? row : (isDone(row) ? rowText(row) : DONE_PREFIX + row)));
  }
  function removeRow(index: number) {
    setRows(rows.filter((_, rowIndex) => rowIndex !== index));
  }

  return <div className="race-followup-field">
    <span>{label}</span>
    {canEdit ? <div className="race-followup-rows no-print">
      {rows.map((row, index) => <div className={`race-followup-row ${isDone(row) ? "done" : ""}`} key={index}>
        {checkable && <input type="checkbox" checked={isDone(row)} onChange={() => toggleRowDone(index)} aria-label={locale === "cs" ? "Hotovo" : "Done"} />}
        <input value={rowText(row)} onChange={(event) => updateRow(index, event.target.value)} />
        {rows.length > 1 && <button type="button" aria-label={locale === "cs" ? "Odebrat řádek" : "Remove row"} onClick={() => removeRow(index)}>×</button>}
      </div>)}
      <button type="button" className="race-followup-add" onClick={() => setRows([...rows, ""])}>＋ {locale === "cs" ? "Přidat řádek" : "Add row"}</button>
    </div> : <div className="race-followup-readonly no-print">{filledLines.length ? filledLines.map((line, index) => <p key={index} className={isDone(line) ? "done" : ""}>{rowText(line)}</p>) : <p>—</p>}</div>}
    <div className="followup-print-value">{filledLines.map(rowText).join(", ") || " "}</div>
  </div>;
}

function DeliveryForm({ raceId, delivery, locale, onClose, onSaved }: { raceId: string; delivery: RaceDelivery | null; locale: Locale; onClose: () => void; onSaved: () => void }) {
  const dialogRef = useModalA11y(onClose);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const amount = Number(String(form.get("amount") ?? "0").replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      setError(locale === "cs" ? "Zadej platnou cenu." : "Enter a valid amount.");
      setSaving(false);
      return;
    }
    const payload = {
      id: delivery?.id,
      raceId,
      customerName: form.get("customerName"),
      description: form.get("description"),
      quantity: Number(form.get("quantity")),
      currency: form.get("currency"),
      amountCents: Math.round(amount * 100),
      paymentMethod: form.get("paymentMethod"),
      isDelivered: form.get("isDelivered") === "on",
      isPaid: form.get("isPaid") === "on",
      notes: form.get("notes"),
    };
    try {
      const response = await fetch("/api/race-deliveries", { method: delivery ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Save failed");
      onSaved();
    } catch (saveError) {
      setError(deliveryErrorText(saveError instanceof Error ? saveError.message : "Save failed", locale));
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal race-modal" role="dialog" aria-modal="true" tabIndex={-1}>
      <div className="modal-header"><div><span className="eyebrow">MM RACE CONTROL</span><h2>{delivery ? (locale === "cs" ? "Upravit předávku" : "Edit delivery") : (locale === "cs" ? "Nová předávka" : "New delivery")}</h2></div><button className="close-button" type="button" onClick={onClose}>×</button></div>
      <form onSubmit={submit}>
        <div className="form-grid delivery-form-grid">
          <label><span>{locale === "cs" ? "Zákazník / komu" : "Customer"} *</span><input name="customerName" defaultValue={delivery?.customerName ?? ""} required autoFocus /></label>
          <label><span>{locale === "cs" ? "Co vezeme" : "Item"} *</span><input name="description" defaultValue={delivery?.description ?? ""} required placeholder={locale === "cs" ? "např. píst, těsnění, karburátor" : "e.g. piston, gasket, carburetor"} /></label>
          <label><span>{locale === "cs" ? "Množství" : "Quantity"} *</span><input name="quantity" type="number" min="1" max="10000" defaultValue={delivery?.quantity ?? 1} required /></label>
          <label><span>{locale === "cs" ? "Cena celkem" : "Total amount"} *</span><input name="amount" inputMode="decimal" defaultValue={delivery ? (delivery.amountCents / 100).toFixed(2) : ""} placeholder="0,00" required /></label>
          <label><span>{locale === "cs" ? "Měna" : "Currency"}</span><select name="currency" defaultValue={delivery?.currency ?? "CZK"}><option value="CZK">CZK</option><option value="EUR">EUR</option></select></label>
          <label><span>{locale === "cs" ? "Forma platby" : "Payment method"}</span><select name="paymentMethod" defaultValue={delivery?.paymentMethod ?? "cash"}><option value="cash">{locale === "cs" ? "Hotově" : "Cash"}</option><option value="card">{locale === "cs" ? "Kartou" : "Card"}</option><option value="bank_transfer">{locale === "cs" ? "Převodem" : "Bank transfer"}</option><option value="invoice">{locale === "cs" ? "Faktura" : "Invoice"}</option><option value="other">{locale === "cs" ? "Jinak" : "Other"}</option></select></label>
          <label className="delivery-paid-check"><input name="isDelivered" type="checkbox" defaultChecked={delivery?.isDelivered ?? false} /><span>{locale === "cs" ? "Bylo předáno" : "Delivered"}</span></label>
          <label className="delivery-paid-check"><input name="isPaid" type="checkbox" defaultChecked={delivery?.isPaid ?? false} /><span>{locale === "cs" ? "Je zaplaceno" : "Paid"}</span></label>
          <label className="full-field"><span>{locale === "cs" ? "Poznámka" : "Note"}</span><textarea name="notes" rows={3} defaultValue={delivery?.notes ?? ""} /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><span className="modal-actions-spacer" /><button className="secondary-compact" type="button" onClick={onClose} disabled={saving}>{locale === "cs" ? "Zrušit" : "Cancel"}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? (locale === "cs" ? "Ukládám…" : "Saving…") : (locale === "cs" ? "Uložit" : "Save")}</button></div>
      </form>
    </section>
  </div>;
}

function formatMoney(cents: number, currency: "CZK" | "EUR", locale: Locale) {
  return new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { style: "currency", currency, maximumFractionDigits: currency === "CZK" ? 0 : 2 }).format(cents / 100);
}

function paymentMethodLabel(method: PaymentMethod, locale: Locale) {
  const labels: Record<PaymentMethod, [string, string]> = { cash: ["Hotově", "Cash"], card: ["Kartou", "Card"], bank_transfer: ["Převodem", "Bank transfer"], invoice: ["Faktura", "Invoice"], other: ["Jinak", "Other"] };
  return labels[method][locale === "cs" ? 0 : 1];
}

function formatRaceDates(start: string, end: string, locale: Locale) {
  const formatter = new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const parse = (value: string) => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); };
  return start === end ? formatter.format(parse(start)) : `${formatter.format(parse(start))} – ${formatter.format(parse(end))}`;
}

async function showDeliveryError(response: Response, locale: Locale) {
  const result = await response.json().catch(() => ({})) as { error?: string };
  window.alert(deliveryErrorText(result.error || "Operation failed", locale));
}

function deliveryErrorText(error: string, locale: Locale) {
  if (locale === "en") return error;
  const translations: Record<string, string> = { "Customer and item are required": "Vyplň zákazníka a co mu vezeme.", "Quantity must be a whole positive number": "Množství musí být celé kladné číslo.", "Invalid amount": "Zadej platnou cenu.", "Completed races can only be corrected by superadmin": "Dokončený závod může upravit pouze superadmin." };
  return translations[error] ?? error;
}
