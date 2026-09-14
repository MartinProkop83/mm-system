"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";
import { useModalA11y } from "./use-modal-a11y";

type Locale = "cs" | "en";
type AppRole = "superadmin" | "boss" | "mechanic";

type PriceItem = {
  id: string; code: string; nameCs: string; nameEn: string;
  materialIncludedCs: string; materialIncludedEn: string;
  priceCzkCents: number; priceEurCents: number;
  groupName: string; sortOrder: number; isActive: boolean;
};

/** Hodnota filtru pro položky bez skupiny — prázdný řetězec už znamená „všechny“. */
const NO_GROUP = "__none__";

const content = {
  cs: {
    heading: "Ceník prací",
    intro: "Položky, ze kterých se skládá zakázka. Ceny jsou bez DPH a v korunách i eurech zvlášť — kurzem se nic nepřepočítává. Přetažením změníš pořadí v nabídce.",
    loading: "Načítám ceník…",
    loadError: "Ceník se nepodařilo načíst.",
    retry: "Zkusit znovu",
    add: "＋ Nová položka",
    dragHint: "Přetažením změníš pořadí",
    filterGroup: "Skupina",
    allGroups: "Všechny skupiny",
    noGroup: "Bez skupiny",
    code: "Kód",
    name: "Název",
    group: "Skupina",
    priceCzk: "Cena CZK",
    priceEur: "Cena EUR",
    active: "Aktivní",
    inactive: "Neaktivní",
    actions: "Akce",
    edit: "Upravit",
    remove: "Deaktivovat",
    confirmRemove: (name: string) => `Deaktivovat položku „${name}"? Na už zapsaných zakázkách zůstane, jen zmizí z nabídky při zápisu práce.`,
    newTitle: "Nová položka ceníku",
    editTitle: "Upravit položku ceníku",
    codeLabel: "Kód",
    codeHint: "Například 1.A nebo 5.B.",
    nameCsLabel: "Název česky",
    nameEnLabel: "Název anglicky",
    nameEnHint: "Prázdné = použije se český název.",
    groupLabel: "Skupina",
    groupHint: "Volný text. Nabídka ukazuje skupiny, které už používáš.",
    materialCsLabel: "Materiál v ceně (česky)",
    materialEnLabel: "Materiál v ceně (anglicky)",
    materialHint: "Co zákazník dostane v ceně práce — vytiskne se na zakázkovém listu.",
    priceCzkLabel: "Cena CZK bez DPH",
    priceEurLabel: "Cena EUR bez DPH",
    priceHint: "Zadávej v celých korunách a eurech.",
    save: "Uložit",
    saving: "Ukládám…",
    cancel: "Zrušit",
    codeRequired: "Vyplň kód.",
    nameRequired: "Vyplň český název.",
    duplicate: "Tenhle kód už v ceníku je.",
    saveError: "Uložení se nepodařilo.",
    empty: "Ceník je zatím prázdný",
    emptyHelp: "Přidej první položku, ať se dá na zakázce vybrat práce.",
    emptyFiltered: "V téhle skupině nic není",
    readOnly: "Ceník mění jen superadmin.",
    vatNote: "Všechny ceny jsou bez DPH.",
  },
  en: {
    heading: "Price list",
    intro: "The items an order is built from. Prices exclude VAT and are kept separately in CZK and EUR — nothing is converted by exchange rate. Drag a row to reorder the picker.",
    loading: "Loading price list…",
    loadError: "The price list could not be loaded.",
    retry: "Try again",
    add: "＋ New item",
    dragHint: "Drag to reorder",
    filterGroup: "Group",
    allGroups: "All groups",
    noGroup: "No group",
    code: "Code",
    name: "Name",
    group: "Group",
    priceCzk: "Price CZK",
    priceEur: "Price EUR",
    active: "Active",
    inactive: "Inactive",
    actions: "Actions",
    edit: "Edit",
    remove: "Deactivate",
    confirmRemove: (name: string) => `Deactivate item "${name}"? It stays on orders already written, it just disappears from the picker.`,
    newTitle: "New price list item",
    editTitle: "Edit price list item",
    codeLabel: "Code",
    codeHint: "For example 1.A or 5.B.",
    nameCsLabel: "Czech name",
    nameEnLabel: "English name",
    nameEnHint: "Empty = the Czech name is used.",
    groupLabel: "Group",
    groupHint: "Free text. The list shows groups you already use.",
    materialCsLabel: "Material included (Czech)",
    materialEnLabel: "Material included (English)",
    materialHint: "What the customer gets in the price — it prints on the order sheet.",
    priceCzkLabel: "Price CZK excl. VAT",
    priceEurLabel: "Price EUR excl. VAT",
    priceHint: "Enter whole crowns and euros.",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    codeRequired: "Fill in the code.",
    nameRequired: "Fill in the Czech name.",
    duplicate: "That code is already in the price list.",
    saveError: "Save failed.",
    empty: "The price list is empty",
    emptyHelp: "Add the first item so work can be picked on an order.",
    emptyFiltered: "Nothing in this group",
    readOnly: "Only a superadmin can change the price list.",
    vatNote: "All prices exclude VAT.",
  },
} as const;

type Copy = (typeof content)[Locale];

function localized(locale: Locale, cs: string, en: string) {
  return locale === "cs" ? cs : en || cs;
}

/** V databázi haléře a centy, v UI celé koruny a eura. */
function fromCents(cents: number) {
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}
function toCents(value: string) {
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : 0;
}
function formatPrice(cents: number, locale: Locale, currency: "CZK" | "EUR") {
  return new Intl.NumberFormat(locale === "cs" ? "cs-CZ" : "en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

async function api(method: string, body: unknown) {
  const response = await fetch("/api/service-price-items", {
    method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error || "request failed");
}

export function ServicePriceListSettings({ locale, role }: { locale: Locale; role: AppRole }) {
  const t = content[locale];
  const [items, setItems] = useState<PriceItem[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PriceItem | "new" | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const canManage = role === "superadmin";

  async function load() {
    setLoadError(false);
    try {
      const response = await fetch("/api/service-price-items", { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as { items: PriceItem[]; groups: string[] };
      setItems(data.items);
      setGroups(data.groups);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function run(action: () => Promise<void>) {
    setSaving(true);
    setError("");
    try {
      await action();
      await load();
      setEditing(null);
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "";
      setError(message === "Code already exists" ? t.duplicate : t.saveError);
    } finally {
      setSaving(false);
    }
  }

  // Přetahuje se vždy v plném seznamu, ne ve filtrované podmnožině — jinak by se pořadí
  // přepočítalo jen z viditelných řádků a zbytek ceníku by se zamíchal.
  function reorder(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const current = [...items];
    const from = current.findIndex((item) => item.id === draggedId);
    const to = current.findIndex((item) => item.id === targetId);
    if (from === -1 || to === -1) return;
    const [moved] = current.splice(from, 1);
    current.splice(to, 0, moved);
    setItems(current);
    void run(() => api("PUT", { order: current.map((item) => item.id) }));
  }

  const visible = useMemo(() => {
    if (!groupFilter) return items;
    if (groupFilter === NO_GROUP) return items.filter((item) => !item.groupName);
    return items.filter((item) => item.groupName === groupFilter);
  }, [items, groupFilter]);

  if (loading) return <section className="dash-panel"><LoadingState size="inline" label={t.loading} /></section>;
  if (loadError) {
    return (
      <section className="dash-panel">
        <EmptyState variant="error" icon="!" title={t.loadError}
          action={<button className="secondary-compact" type="button" onClick={() => void load()}>{t.retry}</button>} />
      </section>
    );
  }

  return (
    <section className="dash-panel">
      <header className="settings-section-heading">
        <div><h3>{t.heading}</h3><p>{t.intro}</p></div>
        {canManage && <button className="primary-button" type="button" onClick={() => setEditing("new")}>{t.add}</button>}
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}

      {items.length === 0 ? (
        <EmptyState size="inline" title={t.empty} description={t.emptyHelp} />
      ) : (<>
        {groups.length > 0 && (
          <label className="price-list-filter"><span>{t.filterGroup}</span>
            <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
              <option value="">{t.allGroups}</option>
              {groups.map((group) => <option key={group} value={group}>{group}</option>)}
              <option value={NO_GROUP}>{t.noGroup}</option>
            </select>
          </label>
        )}

        {visible.length === 0 ? (
          <EmptyState size="inline" variant="filtered" title={t.emptyFiltered} />
        ) : (
          <div className="table-wrap">
            <table className="settings-table sc-table">
              <thead><tr>
                <th className="sc-handle-cell" aria-label={t.dragHint} />
                <th>{t.code}</th><th>{t.name}</th><th>{t.group}</th>
                <th className="price-cell">{t.priceCzk}</th><th className="price-cell">{t.priceEur}</th>
                <th>{t.active}</th>
                {canManage && <th className="action-column">{t.actions}</th>}
              </tr></thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id} className={dragged === item.id ? "sc-dragging" : ""}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => { event.preventDefault(); if (dragged) reorder(dragged, item.id); setDragged(null); }}>
                    <td className="sc-handle-cell">
                      {canManage && (
                        <span className="sc-drag-handle" draggable role="button" tabIndex={-1} aria-label={t.dragHint} title={t.dragHint}
                          onDragStart={() => setDragged(item.id)} onDragEnd={() => setDragged(null)}>⠿</span>
                      )}
                    </td>
                    <td><code className="settings-code">{item.code}</code></td>
                    <td>
                      <span className="stacked-cell">
                        <strong>{localized(locale, item.nameCs, item.nameEn)}</strong>
                        {localized(locale, item.materialIncludedCs, item.materialIncludedEn) && (
                          <small>{localized(locale, item.materialIncludedCs, item.materialIncludedEn)}</small>
                        )}
                      </span>
                    </td>
                    <td>{item.groupName || "—"}</td>
                    <td className="price-cell">{formatPrice(item.priceCzkCents, locale, "CZK")}</td>
                    <td className="price-cell">{formatPrice(item.priceEurCents, locale, "EUR")}</td>
                    <td><span className={`status-pill ${item.isActive ? "success" : "neutral"}`}>{item.isActive ? t.active : t.inactive}</span></td>
                    {canManage && (
                      <td className="action-column">
                        <div className="record-actions">
                          <button type="button" onClick={() => setEditing(item)} aria-label={t.edit} title={t.edit}>✎</button>
                          {item.isActive && (
                            <button className="delete" type="button" disabled={saving} aria-label={t.remove} title={t.remove}
                              onClick={() => { if (window.confirm(t.confirmRemove(localized(locale, item.nameCs, item.nameEn)))) void run(() => api("DELETE", { id: item.id })); }}>🗑</button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="form-hint">{t.vatNote}</p>
      </>)}

      {!canManage && <p className="form-hint">{t.readOnly}</p>}

      {editing && (
        <PriceItemModal t={t} item={editing === "new" ? null : editing} groups={groups} saving={saving}
          onClose={() => setEditing(null)}
          onSave={(payload) => void run(() => editing === "new" ? api("POST", payload) : api("PUT", { id: editing.id, ...payload }))} />
      )}
    </section>
  );
}

function PriceItemModal({ t, item, groups, saving, onClose, onSave }: {
  t: Copy; item: PriceItem | null; groups: string[]; saving: boolean;
  onClose: () => void;
  onSave: (payload: {
    code: string; nameCs: string; nameEn: string; groupName: string;
    materialIncludedCs: string; materialIncludedEn: string;
    priceCzkCents: number; priceEurCents: number;
  }) => void;
}) {
  const dialogRef = useModalA11y(onClose);
  const [code, setCode] = useState(item?.code ?? "");
  const [nameCs, setNameCs] = useState(item?.nameCs ?? "");
  const [nameEn, setNameEn] = useState(item?.nameEn ?? "");
  const [groupName, setGroupName] = useState(item?.groupName ?? "");
  const [materialCs, setMaterialCs] = useState(item?.materialIncludedCs ?? "");
  const [materialEn, setMaterialEn] = useState(item?.materialIncludedEn ?? "");
  const [priceCzk, setPriceCzk] = useState(item ? fromCents(item.priceCzkCents) : "");
  const [priceEur, setPriceEur] = useState(item ? fromCents(item.priceEurCents) : "");
  const [formError, setFormError] = useState("");

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={dialogRef as React.RefObject<HTMLFormElement>} className="modal settings-user-modal" role="dialog" aria-modal="true" aria-labelledby="price-item-title" tabIndex={-1}
        onSubmit={(event) => {
          event.preventDefault();
          if (!code.trim()) { setFormError(t.codeRequired); return; }
          if (!nameCs.trim()) { setFormError(t.nameRequired); return; }
          onSave({
            code: code.trim(), nameCs: nameCs.trim(), nameEn: nameEn.trim(), groupName: groupName.trim(),
            materialIncludedCs: materialCs.trim(), materialIncludedEn: materialEn.trim(),
            priceCzkCents: toCents(priceCzk), priceEurCents: toCents(priceEur),
          });
        }}>
        <header className="modal-header">
          <div><h2 id="price-item-title">{item ? t.editTitle : t.newTitle}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>
        <div className="form-grid">
          <label><span>{t.codeLabel} *</span>
            <input value={code} onChange={(event) => setCode(event.target.value)} autoFocus maxLength={40} />
            <small>{t.codeHint}</small>
          </label>
          <label><span>{t.groupLabel}</span>
            <input value={groupName} list="price-list-groups" onChange={(event) => setGroupName(event.target.value)} maxLength={80} />
            <datalist id="price-list-groups">{groups.map((group) => <option key={group} value={group} />)}</datalist>
            <small>{t.groupHint}</small>
          </label>
          <label><span>{t.nameCsLabel} *</span>
            <input value={nameCs} onChange={(event) => setNameCs(event.target.value)} maxLength={160} />
          </label>
          <label><span>{t.nameEnLabel}</span>
            <input value={nameEn} onChange={(event) => setNameEn(event.target.value)} maxLength={160} />
            <small>{t.nameEnHint}</small>
          </label>
          <label><span>{t.priceCzkLabel}</span>
            <input value={priceCzk} inputMode="decimal" onChange={(event) => setPriceCzk(event.target.value)} maxLength={12} />
            <small>{t.priceHint}</small>
          </label>
          <label><span>{t.priceEurLabel}</span>
            <input value={priceEur} inputMode="decimal" onChange={(event) => setPriceEur(event.target.value)} maxLength={12} />
          </label>
          <label className="full-field"><span>{t.materialCsLabel}</span>
            <input value={materialCs} onChange={(event) => setMaterialCs(event.target.value)} maxLength={400} />
            <small>{t.materialHint}</small>
          </label>
          <label className="full-field"><span>{t.materialEnLabel}</span>
            <input value={materialEn} onChange={(event) => setMaterialEn(event.target.value)} maxLength={400} />
          </label>
        </div>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? t.saving : t.save}</button>
        </footer>
      </form>
    </div>
  );
}
