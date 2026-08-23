"use client";

import { useEffect, useMemo, useState } from "react";
import { ClothingLightbox, ClothingPhoto, type ClothingPhotoPreview } from "./clothing-photo";

type Locale = "cs" | "en";
type Role = "superadmin" | "boss" | "mechanic";
type Tab = "assignments" | "catalog";

type ClothingItem = {
  id: string;
  name: string;
  sizes: string[];
  defaultQuantity: number;
  notes: string;
  imageUrl: string;
  createdAt: number;
  updatedAt: number;
};

type Mechanic = { id: string; name: string };
type ClothingAssignment = {
  id: string;
  mechanicId: string;
  clothingItemId: string;
  size: string;
  quantity: number;
  assignedAt: number;
  notes: string;
  updatedAt: number;
};

type ClothingData = {
  items: ClothingItem[];
  mechanics: Mechanic[];
  assignments: ClothingAssignment[];
};

const emptyData: ClothingData = { items: [], mechanics: [], assignments: [] };

export function ClothingPage({ locale, role }: { locale: Locale; role: Role }) {
  const [data, setData] = useState<ClothingData>(emptyData);
  const [tab, setTab] = useState<Tab>("assignments");
  const [selectedMechanicId, setSelectedMechanicId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [itemForm, setItemForm] = useState<ClothingItem | "new" | null>(null);
  const [photoPreview, setPhotoPreview] = useState<ClothingPhotoPreview | null>(null);
  const [seeding, setSeeding] = useState(false);
  const canManage = role !== "mechanic";

  async function load() {
    try {
      const response = await fetch("/api/clothing", { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const next = await response.json() as ClothingData;
      setData(next);
      setSelectedMechanicId((current) => current && next.mechanics.some((item) => item.id === current) ? current : next.mechanics[0]?.id ?? "");
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const selectedMechanic = data.mechanics.find((item) => item.id === selectedMechanicId) ?? null;
  const selectedAssignments = useMemo(
    () => data.assignments.filter((item) => item.mechanicId === selectedMechanicId),
    [data.assignments, selectedMechanicId],
  );
  const assignedMechanics = new Set(data.assignments.map((item) => item.mechanicId)).size;

  async function seedDefaults() {
    setSeeding(true);
    try {
      const response = await fetch("/api/clothing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "defaults" }),
      });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error || "save failed");
      await load();
    } catch (seedError) {
      window.alert(friendlyError(seedError, locale));
    } finally {
      setSeeding(false);
    }
  }

  if (loading) return <section className="panel clothing-message"><span className="spinner" /><p>{locale === "cs" ? "Načítám oblečení…" : "Loading clothing…"}</p></section>;
  if (error) return <section className="panel clothing-message clothing-error"><b>!</b><p>{locale === "cs" ? "Oblečení se nepodařilo načíst." : "Clothing could not be loaded."}</p><button className="secondary-compact" type="button" onClick={() => { setLoading(true); void load(); }}>{locale === "cs" ? "Zkusit znovu" : "Try again"}</button></section>;

  return <div className="clothing-page">
    <section className="panel clothing-hero">
      <div className="clothing-hero-icon" aria-hidden="true"><span /><span /><span /></div>
      <div>
        <span className="eyebrow">MM TEAM EQUIPMENT</span>
        <h2>{locale === "cs" ? "Oblečení mechaniků" : "Mechanic clothing"}</h2>
        <p>{locale === "cs" ? "Velikosti, počty kusů a vybavení každého člena týmu na jednom místě." : "Sizes, quantities and team equipment in one place."}</p>
      </div>
      <dl>
        <div><dt>{locale === "cs" ? "Typů oblečení" : "Item types"}</dt><dd>{data.items.length}</dd></div>
        <div><dt>{locale === "cs" ? "Vybavených mechaniků" : "Equipped mechanics"}</dt><dd>{assignedMechanics}<small> / {data.mechanics.length}</small></dd></div>
      </dl>
    </section>

    <nav className="clothing-tabs" aria-label={locale === "cs" ? "Sekce oblečení" : "Clothing sections"}>
      <button className={tab === "assignments" ? "active" : ""} type="button" onClick={() => setTab("assignments")}><span>01</span>{locale === "cs" ? "Přiřazení mechanikům" : "Mechanic assignments"}</button>
      <button className={tab === "catalog" ? "active" : ""} type="button" onClick={() => setTab("catalog")}><span>02</span>{locale === "cs" ? "Nastavení oblečení" : "Clothing settings"}</button>
    </nav>

    {tab === "assignments" && <section className="panel clothing-assignment-panel">
      <header className="clothing-section-header">
        <div><span className="eyebrow">WELCOME PACK</span><h3>{locale === "cs" ? "Přiřazení a velikosti" : "Assignments and sizes"}</h3><p>{locale === "cs" ? "Vyber mechanika a ulož mu jednotlivé kusy oblečení." : "Select a mechanic and save each clothing item."}</p></div>
        {data.mechanics.length > 0 && <label className="clothing-mechanic-picker"><span>{locale === "cs" ? "Mechanik" : "Mechanic"}</span><select value={selectedMechanicId} onChange={(event) => setSelectedMechanicId(event.target.value)}>{data.mechanics.map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.name}</option>)}</select></label>}
      </header>

      {!data.mechanics.length ? <EmptyBlock title={locale === "cs" ? "Nejdřív přidej mechanika" : "Add a mechanic first"} text={locale === "cs" ? "Mechaniky založíš v položce Mechanici v levém menu." : "Create mechanics from the Mechanics item in the left menu."} />
        : !data.items.length ? <EmptyBlock title={locale === "cs" ? "Katalog oblečení je prázdný" : "The clothing catalog is empty"} text={locale === "cs" ? "V nastavení vytvoř vlastní položky, nebo načti doporučenou startovní sadu." : "Create custom items in settings or load the recommended starter set."} action={canManage ? <button className="primary-button" type="button" disabled={seeding} onClick={() => void seedDefaults()}>{seeding ? (locale === "cs" ? "Připravuji…" : "Preparing…") : (locale === "cs" ? "＋ Přidat doporučenou sadu" : "＋ Add recommended set")}</button> : undefined} />
        : <>
          <div className="clothing-selected-person">
            <span>{initials(selectedMechanic?.name ?? "MM")}</span>
            <div><small>{locale === "cs" ? "VYBRANÝ MECHANIK" : "SELECTED MECHANIC"}</small><strong>{selectedMechanic?.name}</strong></div>
            <b>{selectedAssignments.length} / {data.items.length} {locale === "cs" ? "položek" : "items"}</b>
          </div>
          <div className="clothing-assignment-grid">
            {data.items.map((item, index) => <AssignmentCard key={`${item.id}:${selectedMechanicId}`} item={item} index={index} assignment={selectedAssignments.find((assignment) => assignment.clothingItemId === item.id)} mechanicId={selectedMechanicId} canManage={canManage} locale={locale} onChanged={load} onPreview={setPhotoPreview} />)}
          </div>
          <TeamClothingOverview data={data} locale={locale} selectedMechanicId={selectedMechanicId} onSelect={setSelectedMechanicId} onPreview={setPhotoPreview} />
        </>}
    </section>}

    {tab === "catalog" && <section className="panel clothing-catalog-panel">
      <header className="clothing-section-header">
        <div><span className="eyebrow">CATALOG SETTINGS</span><h3>{locale === "cs" ? "Jaké oblečení používáme" : "Clothing catalog"}</h3><p>{locale === "cs" ? "Nastav názvy položek, dostupné velikosti a výchozí počet kusů." : "Set item names, available sizes and default quantities."}</p></div>
        {canManage && <div className="clothing-header-actions">{!data.items.length && <button className="secondary-compact" type="button" disabled={seeding} onClick={() => void seedDefaults()}>{locale === "cs" ? "Doporučená sada" : "Recommended set"}</button>}<button className="primary-button" type="button" onClick={() => setItemForm("new")}>＋ {locale === "cs" ? "Nový typ" : "New item"}</button></div>}
      </header>
      {data.items.length ? <div className="clothing-catalog-list">{data.items.map((item, index) => <article key={item.id}>
        <ClothingVisual item={item} index={index} onPreview={setPhotoPreview} />
        <div className="clothing-catalog-name"><strong>{item.name}</strong><small>{item.notes || (locale === "cs" ? "Bez poznámky" : "No note")}</small></div>
        <div className="clothing-size-list">{item.sizes.map((size) => <span key={size}>{size}</span>)}</div>
        <div className="clothing-default-quantity"><small>{locale === "cs" ? "Výchozí počet" : "Default qty"}</small><strong>{item.defaultQuantity}×</strong></div>
        {canManage && <button className="secondary-compact" type="button" onClick={() => setItemForm(item)}>✎ {locale === "cs" ? "Upravit" : "Edit"}</button>}
      </article>)}</div> : <EmptyBlock title={locale === "cs" ? "Zatím tu nic není" : "Nothing here yet"} text={locale === "cs" ? "Přidej první typ oblečení včetně všech dostupných velikostí." : "Add the first clothing type with all available sizes."} />}
    </section>}

    {itemForm && <ItemModal locale={locale} role={role} item={itemForm === "new" ? null : itemForm} onClose={() => setItemForm(null)} onSaved={async () => { setItemForm(null); await load(); }} />}
    {photoPreview && <ClothingLightbox preview={photoPreview} onClose={() => setPhotoPreview(null)} />}
  </div>;
}

function AssignmentCard({ item, assignment, mechanicId, index, canManage, locale, onChanged, onPreview }: { item: ClothingItem; assignment?: ClothingAssignment; mechanicId: string; index: number; canManage: boolean; locale: Locale; onChanged: () => Promise<void>; onPreview: (preview: ClothingPhotoPreview) => void }) {
  const [size, setSize] = useState(assignment?.size ?? item.sizes[0] ?? "");
  const [quantity, setQuantity] = useState(assignment?.quantity ?? item.defaultQuantity);
  const [notes, setNotes] = useState(assignment?.notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSize(assignment?.size ?? item.sizes[0] ?? "");
    setQuantity(assignment?.quantity ?? item.defaultQuantity);
    setNotes(assignment?.notes ?? "");
  }, [assignment?.id, assignment?.size, assignment?.quantity, assignment?.notes, item.defaultQuantity, item.sizes]);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/clothing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "assignment", mechanicId, clothingItemId: item.id, size, quantity, notes }) });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error || "save failed");
      await onChanged();
    } catch (saveError) { window.alert(friendlyError(saveError, locale)); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!assignment || !window.confirm(locale === "cs" ? `Odebrat položku ${item.name} tomuto mechanikovi?` : `Remove ${item.name} from this mechanic?`)) return;
    setSaving(true);
    try {
      const response = await fetch("/api/clothing", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "assignment", id: assignment.id }) });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error || "delete failed");
      await onChanged();
    } catch (removeError) { window.alert(friendlyError(removeError, locale)); }
    finally { setSaving(false); }
  }

  return <article className={`clothing-assignment-card ${assignment ? "assigned" : ""}`}>
    <ClothingPhoto imageUrl={item.imageUrl} name={item.name} fallback={item.name.slice(0, 2).toUpperCase()} className={`clothing-assignment-photo tone-${index % 4}`} onOpen={onPreview} />
    <header><div><strong>{item.name}</strong><small>{item.notes || (locale === "cs" ? "Týmové oblečení" : "Team clothing")}</small>{assignment && <small className="clothing-assigned-date">{locale === "cs" ? "Předáno" : "Issued"} {formatAssignmentDate(assignment.assignedAt, locale)}</small>}</div>{assignment && <b>✓ {locale === "cs" ? "Přiřazeno" : "Assigned"}</b>}</header>
    <div className="clothing-assignment-fields">
      <label><span>{locale === "cs" ? "Velikost" : "Size"}</span><select value={size} disabled={!canManage || saving} onChange={(event) => setSize(event.target.value)}>{item.sizes.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>
      <label><span>{locale === "cs" ? "Počet" : "Quantity"}</span><input type="number" min="1" max="20" value={quantity} disabled={!canManage || saving} onChange={(event) => setQuantity(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} /></label>
      <label className="clothing-note-field"><span>{locale === "cs" ? "Poznámka" : "Note"}</span><input value={notes} maxLength={500} disabled={!canManage || saving} onChange={(event) => setNotes(event.target.value)} placeholder={locale === "cs" ? "např. náhradní kus" : "e.g. spare item"} /></label>
    </div>
    {canManage && <footer>{assignment && <button type="button" className="clothing-remove" disabled={saving} onClick={() => void remove()}>{locale === "cs" ? "Odebrat" : "Remove"}</button>}<button type="button" className="clothing-save" disabled={saving || !size} onClick={() => void save()}>{saving ? (locale === "cs" ? "Ukládám…" : "Saving…") : assignment ? (locale === "cs" ? "Uložit změny" : "Save changes") : (locale === "cs" ? "Přiřadit" : "Assign")}</button></footer>}
  </article>;
}

function ItemModal({ locale, role, item, onClose, onSaved }: { locale: Locale; role: Role; item: ClothingItem | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(item?.name ?? "");
  const [sizes, setSizes] = useState(item?.sizes.join(", ") ?? "");
  const [defaultQuantity, setDefaultQuantity] = useState(item?.defaultQuantity ?? 1);
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState(item?.imageUrl ?? "");
  const [removeCurrentImage, setRemoveCurrentImage] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/clothing", { method: item ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "item", id: item?.id, name, sizes: sizes.split(",").map((value) => value.trim()).filter(Boolean), defaultQuantity, notes }) });
      const result = await response.json() as { id?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error || "save failed");
      if (image) {
        const upload = new FormData();
        upload.set("itemId", result.id);
        upload.set("image", image);
        const imageResponse = await fetch("/api/clothing-image", { method: "POST", body: upload });
        if (!imageResponse.ok) throw new Error((await imageResponse.json() as { error?: string }).error || "image upload failed");
      } else if (removeCurrentImage && item?.imageUrl) {
        const imageResponse = await fetch("/api/clothing-image", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.id }) });
        if (!imageResponse.ok) throw new Error((await imageResponse.json() as { error?: string }).error || "image delete failed");
      }
      await onSaved();
    } catch (saveError) { window.alert(friendlyError(saveError, locale)); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!item || !window.confirm(locale === "cs" ? `Opravdu odstranit ${item.name} z katalogu?` : `Remove ${item.name} from the catalog?`)) return;
    setSaving(true);
    try {
      const response = await fetch("/api/clothing", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "item", id: item.id }) });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error || "delete failed");
      await onSaved();
    } catch (removeError) { window.alert(friendlyError(removeError, locale)); }
    finally { setSaving(false); }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="modal clothing-item-modal" onSubmit={submit}>
    <header className="modal-header"><div><span className="eyebrow">CLOTHING CATALOG</span><h2>{item ? (locale === "cs" ? "Upravit oblečení" : "Edit clothing") : (locale === "cs" ? "Nový typ oblečení" : "New clothing item")}</h2><p>{locale === "cs" ? "Velikosti odděluj čárkou. Jejich pořadí se zachová v nabídce." : "Separate sizes with commas. Their order is preserved."}</p></div><button className="modal-close" type="button" onClick={onClose}>×</button></header>
    <div className="form-grid">
      <label><span>{locale === "cs" ? "Název položky" : "Item name"}</span><input autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder={locale === "cs" ? "Např. Týmová bunda" : "E.g. Team jacket"} /></label>
      <label><span>{locale === "cs" ? "Výchozí počet kusů" : "Default quantity"}</span><input required type="number" min="1" max="20" value={defaultQuantity} onChange={(event) => setDefaultQuantity(Number(event.target.value) || 1)} /></label>
      <label className="full-field"><span>{locale === "cs" ? "Dostupné velikosti" : "Available sizes"}</span><input required value={sizes} onChange={(event) => setSizes(event.target.value)} placeholder="XS, S, M, L, XL, XXL" /><small className="field-help">{locale === "cs" ? "Příklad číselných velikostí: 38, 39, 40, 41, 42" : "Numeric size example: 38, 39, 40, 41, 42"}</small></label>
      <div className="full-field clothing-image-field"><span>{locale === "cs" ? "Fotografie oblečení" : "Clothing photo"}</span><div className="clothing-image-editor">{imagePreview ? <img src={imagePreview} alt={name || (locale === "cs" ? "Náhled oblečení" : "Clothing preview")} /> : <span className="clothing-image-placeholder">FOTO</span>}<div><label className="clothing-file-button"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const next = event.target.files?.[0] ?? null; setImage(next); setRemoveCurrentImage(false); if (next) setImagePreview(URL.createObjectURL(next)); }} /><b>{imagePreview ? (locale === "cs" ? "Vybrat jinou fotku" : "Choose another photo") : (locale === "cs" ? "Vybrat fotku" : "Choose photo")}</b></label>{imagePreview && <button type="button" onClick={() => { setImage(null); setImagePreview(""); setRemoveCurrentImage(Boolean(item?.imageUrl)); }}>{locale === "cs" ? "Odstranit fotografii" : "Remove photo"}</button>}<small>{locale === "cs" ? "PNG, JPG nebo WebP, maximálně 10 MB. Fotka se použije jako ikona i velký náhled." : "PNG, JPG or WebP, max 10 MB. Used as both icon and large preview."}</small></div></div></div>
      <label className="full-field"><span>{locale === "cs" ? "Poznámka" : "Note"}</span><textarea rows={3} maxLength={600} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={locale === "cs" ? "Volitelné upřesnění…" : "Optional details…"} /></label>
    </div>
    <footer className="modal-actions">{item && role === "superadmin" && <button className="danger-button" type="button" disabled={saving} onClick={() => void remove()}>{locale === "cs" ? "Odstranit typ" : "Remove item"}</button>}<span className="modal-actions-spacer" /><button className="secondary-compact" type="button" disabled={saving} onClick={onClose}>{locale === "cs" ? "Zrušit" : "Cancel"}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? (locale === "cs" ? "Ukládám…" : "Saving…") : (locale === "cs" ? "Uložit" : "Save")}</button></footer>
  </form></div>;
}

function ClothingVisual({ item, index, onPreview }: { item: ClothingItem; index: number; onPreview: (preview: ClothingPhotoPreview) => void }) {
  return <ClothingPhoto imageUrl={item.imageUrl} name={item.name} fallback={item.name.slice(0, 2).toUpperCase()} className={`clothing-item-mark tone-${index % 4}`} onOpen={onPreview} />;
}

function TeamClothingOverview({ data, locale, selectedMechanicId, onSelect, onPreview }: { data: ClothingData; locale: Locale; selectedMechanicId: string; onSelect: (id: string) => void; onPreview: (preview: ClothingPhotoPreview) => void }) {
  function selectMechanic(id: string) {
    onSelect(id);
    document.querySelector(".clothing-assignment-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return <section className="clothing-team-overview">
    <header><div><span className="eyebrow">TEAM OVERVIEW</span><h3>{locale === "cs" ? "Co má každý mechanik" : "What each mechanic has"}</h3><p>{locale === "cs" ? "Rychlý přehled položek, velikostí a počtu kusů celého týmu." : "A quick overview of items, sizes and quantities across the team."}</p></div><strong>{data.mechanics.length}</strong></header>
    <div className="clothing-team-grid">{data.mechanics.map((mechanic) => {
      const assignments = data.assignments.filter((assignment) => assignment.mechanicId === mechanic.id);
      return <article key={mechanic.id} className={mechanic.id === selectedMechanicId ? "selected" : ""}>
        <button className="clothing-team-person" type="button" onClick={() => selectMechanic(mechanic.id)}><span>{initials(mechanic.name)}</span><div><strong>{mechanic.name}</strong><small>{assignments.length ? `${assignments.length} ${locale === "cs" ? "položek" : "items"}` : (locale === "cs" ? "Bez oblečení" : "No clothing")}</small></div><b>›</b></button>
        {assignments.length ? <div className="clothing-team-items">{assignments.map((assignment) => {
          const item = data.items.find((candidate) => candidate.id === assignment.clothingItemId);
          if (!item) return null;
          return <div key={assignment.id}><ClothingPhoto imageUrl={item.imageUrl} name={item.name} fallback={item.name.slice(0, 2).toUpperCase()} className="clothing-team-photo" onOpen={onPreview} /><span><small>{item.name}</small><strong>{assignment.size} · {assignment.quantity}×</strong><em>{formatAssignmentDate(assignment.assignedAt, locale)}</em></span></div>;
        })}</div> : <p className="clothing-team-empty">{locale === "cs" ? "Zatím není nic přiřazeno." : "Nothing assigned yet."}</p>}
      </article>;
    })}</div>
  </section>;
}

function EmptyBlock({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <div className="clothing-empty"><span aria-hidden="true">＋</span><strong>{title}</strong><p>{text}</p>{action}</div>;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "M"}${parts.at(-1)?.[0] ?? "M"}`.toUpperCase();
}

function formatAssignmentDate(value: number, locale: Locale) {
  const date = new Date(Number(value));
  if (!Number.isFinite(date.getTime()) || Number(value) <= 0) return "—";
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "numeric", year: "numeric" }).format(date);
}

function friendlyError(error: unknown, locale: Locale) {
  const message = error instanceof Error ? error.message : "";
  if (locale === "en") return message || "The change could not be saved.";
  if (message.includes("already exists")) return "Položka s tímto názvem už existuje.";
  if (message.includes("is assigned to a mechanic")) return "Položka je přiřazená mechanikovi. Nejdřív ji z jeho karty odeber.";
  if (message.startsWith("Size ")) return "Tato velikost je už přiřazená mechanikovi. Nejdřív změň jeho velikost.";
  return message || "Změnu se nepodařilo uložit.";
}
