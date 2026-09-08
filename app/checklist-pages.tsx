"use client";

import { useEffect, useState } from "react";
import { formatCount, pluralForm, type PluralForms } from "./pluralize";
import { EmptyState, LoadingState } from "./empty-state";

const ITEM_FORMS: PluralForms = { cs: ["položka", "položky", "položek"], en: ["item", "items"] };
const MORE_FORMS: PluralForms = { cs: ["další", "další", "dalších"], en: ["more", "more"] };

type Locale = "cs" | "en";
type Role = "superadmin" | "boss" | "mechanic";

export type ChecklistItem = { id: string; section: string; partNumber: string; name: string; quantity: number };
export type ChecklistRecord = { id: string; name: string; notes: string; items: ChecklistItem[]; createdAt: number; updatedAt: number };
type ChecklistItemDraft = { section: string; partNumber: string; name: string; quantity: number };

export function ChecklistsPage({ locale, role }: { locale: Locale; role: Role }) {
  const canManage = role !== "mechanic";
  const [checklists, setChecklists] = useState<ChecklistRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<ChecklistRecord | "new" | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/checklists", { cache: "no-store" });
      const result = await response.json() as { checklists: ChecklistRecord[] };
      if (!response.ok) throw new Error();
      setChecklists(result.checklists ?? []);
      setError(false);
    } catch { setError(true); } finally { setLoading(false); }
  }
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);

  async function remove(checklist: ChecklistRecord) {
    if (role !== "superadmin" || !window.confirm(locale === "cs" ? "Opravdu checklist archivovat?" : "Archive this checklist?")) return;
    const response = await fetch("/api/checklists", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: checklist.id }) });
    if (!response.ok) return window.alert(locale === "cs" ? "Checklist se nepodařilo archivovat." : "Could not archive the checklist.");
    await load();
  }

  return <div className="commerce-page checklist-page">
    <section className="dash-panel commerce-summary">
      <div>
        <span className="eyebrow">MM CHECKLISTS</span>
        <h2>{locale === "cs" ? "Checklisty" : "Checklists"}</h2>
        <p>{locale === "cs" ? "Kontrolní seznamy dílů a vybavení, které si přiřadíš k autu nebo závodu." : "Parts and equipment checklists you can later attach to a car or a race."}</p>
      </div>
      <div>
        <strong>{checklists.length}</strong>
        {canManage && <button className="primary-button" type="button" onClick={() => setEditing("new")}>＋ {locale === "cs" ? "Nový checklist" : "New checklist"}</button>}
      </div>
    </section>
    <section className="dash-panel data-panel checklist-list-panel">
      {loading && <LoadingState label={locale === "cs" ? "Načítám…" : "Loading…"} />}
      {!loading && error && <EmptyState variant="error" icon="!" title={locale === "cs" ? "Checklisty se nepodařilo načíst." : "Could not load checklists."} />}
      {!loading && !error && checklists.length === 0 && (
        <EmptyState
          icon="☑"
          title={locale === "cs" ? "Zatím žádný checklist" : "No checklists yet"}
          description={locale === "cs" ? "Vytvoř první checklist s díly a vybavením, které chceš mít v autě." : "Create the first checklist of parts and equipment you want in the car."}
        />
      )}
      {!loading && !error && checklists.length > 0 && (
        <div className="checklist-list">
          {checklists.map((checklist) => <ChecklistCard key={checklist.id} checklist={checklist} locale={locale} canManage={canManage} role={role} onEdit={() => setEditing(checklist)} onDelete={() => { void remove(checklist); }} />)}
        </div>
      )}
    </section>
    {editing && <ChecklistForm key={editing === "new" ? "new" : editing.id} locale={locale} checklist={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />}
  </div>;
}

function ChecklistCard({ checklist, locale, canManage, role, onEdit, onDelete }: { checklist: ChecklistRecord; locale: Locale; canManage: boolean; role: Role; onEdit: () => void; onDelete: () => void }) {
  const preview = checklist.items.slice(0, 5);
  const remaining = checklist.items.length - preview.length;
  return <article className="checklist-card">
    <header>
      <h3>{checklist.name}</h3>
      <span>{formatCount(checklist.items.length, locale, ITEM_FORMS)}</span>
    </header>
    <p>{checklist.notes || (locale === "cs" ? "Bez poznámky" : "No notes")}</p>
    <ul className="checklist-card-items">
      {preview.map((item) => <li key={item.id}><b>{item.quantity}×</b> {item.name}{item.partNumber ? ` · ${item.partNumber}` : ""}</li>)}
    </ul>
    {remaining > 0 && <small className="checklist-card-more">{`+ ${remaining} ${pluralForm(remaining, locale, MORE_FORMS)}`}</small>}
    {canManage && <footer>
      <button className="secondary-compact" type="button" onClick={onEdit}>{locale === "cs" ? "Upravit" : "Edit"}</button>
      {role === "superadmin" && <button className="danger-compact" type="button" onClick={onDelete}>{locale === "cs" ? "Archivovat" : "Archive"}</button>}
    </footer>}
  </article>;
}

function ChecklistForm({ locale, checklist, onClose, onSaved }: { locale: Locale; checklist: ChecklistRecord | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(checklist?.name ?? "");
  const [notes, setNotes] = useState(checklist?.notes ?? "");
  const [items, setItems] = useState<ChecklistItemDraft[]>(checklist?.items.length ? checklist.items.map((item) => ({ section: item.section, partNumber: item.partNumber, name: item.name, quantity: item.quantity })) : [emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateItem(index: number, patch: Partial<ChecklistItemDraft>) { setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)); }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch("/api/checklists", { method: checklist ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: checklist?.id, name, notes, items }) });
      const result = await response.json() as { id?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Save failed");
      onSaved();
    } catch (saveError) { setError(localizeChecklistError(saveError instanceof Error ? saveError.message : "Save failed", locale)); setSaving(false); }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal checklist-modal" role="dialog" aria-modal="true">
      <div className="modal-header">
        <div><span className="eyebrow">MM CHECKLISTS</span><h2>{checklist ? (locale === "cs" ? "Upravit checklist" : "Edit checklist") : (locale === "cs" ? "Nový checklist" : "New checklist")}</h2></div>
        <button className="close-button" type="button" onClick={onClose}>×</button>
      </div>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="full-field"><span>{locale === "cs" ? "Název checklistu" : "Checklist name"} *</span><input value={name} onChange={(event) => setName(event.target.value)} required autoFocus placeholder={locale === "cs" ? "Např. Van – motorová výbava" : "E.g. Van – engine spares"} /></label>
          <label className="full-field"><span>{locale === "cs" ? "Poznámka" : "Notes"}</span><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        </div>
        <div className="checklist-items">
          <div className="checklist-items-heading">
            <div><span className="eyebrow">{locale === "cs" ? "POLOŽKY" : "ITEMS"}</span><h3>{locale === "cs" ? "Díly a vybavení" : "Parts and equipment"}</h3></div>
            <button className="secondary-compact" type="button" onClick={() => setItems((current) => [...current, emptyItem()])}>＋ {locale === "cs" ? "Přidat položku" : "Add item"}</button>
          </div>
          {items.map((item, index) => <ChecklistItemRow key={index} index={index} item={item} locale={locale} onChange={(patch) => updateItem(index, patch)} onRemove={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} />)}
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose} disabled={saving}>{locale === "cs" ? "Zrušit" : "Cancel"}</button>
          <button className="primary-button" type="submit" disabled={saving || !items.length}>{saving ? (locale === "cs" ? "Ukládám…" : "Saving…") : (locale === "cs" ? "Uložit checklist" : "Save checklist")}</button>
        </div>
      </form>
    </section>
  </div>;
}

function ChecklistItemRow({ index, item, locale, onChange, onRemove }: { index: number; item: ChecklistItemDraft; locale: Locale; onChange: (patch: Partial<ChecklistItemDraft>) => void; onRemove: () => void }) {
  return <div className="checklist-item-row">
    <span className="checklist-item-number">{index + 1}</span>
    <label><span>{locale === "cs" ? "Sekce" : "Section"}</span><input value={item.section} onChange={(event) => onChange({ section: event.target.value })} placeholder={locale === "cs" ? "např. Motor OK" : "e.g. Engine OK"} /></label>
    <label><span>{locale === "cs" ? "Číslo dílu" : "Part number"}</span><input value={item.partNumber} onChange={(event) => onChange({ partNumber: event.target.value })} /></label>
    <label className="checklist-item-name"><span>{locale === "cs" ? "Název dílu" : "Part name"} *</span><input value={item.name} onChange={(event) => onChange({ name: event.target.value })} required /></label>
    <label className="checklist-item-qty"><span>{locale === "cs" ? "Počet ks" : "Qty"}</span><input type="number" min="1" step="1" value={item.quantity} onChange={(event) => onChange({ quantity: Math.max(1, Number(event.target.value) || 1) })} /></label>
    <button className="checklist-item-remove" type="button" onClick={onRemove} aria-label={locale === "cs" ? "Odebrat položku" : "Remove item"}>×</button>
  </div>;
}

function emptyItem(): ChecklistItemDraft { return { section: "", partNumber: "", name: "", quantity: 1 }; }

function localizeChecklistError(error: string, locale: Locale) {
  if (locale === "en") return error;
  const map: Record<string, string> = {
    "Checklist name is required": "Vyplň název checklistu.",
    "Checklist already exists": "Checklist s tímto názvem už existuje.",
    "Add at least one item": "Přidej alespoň jednu položku.",
    "Invalid item quantity": "Počet kusů musí být kladné celé číslo.",
    "Checklist not found": "Checklist už nebyl nalezen.",
    "Forbidden": "Nemáš oprávnění k této akci.",
  };
  return map[error] ?? error;
}
