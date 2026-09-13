"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";
import { useModalA11y } from "./use-modal-a11y";
import {
  formatCounterMinutes,
  isWithinEditWindow,
  tileStatus,
  type CounterUnit,
  type MaterialVariant,
  type ServiceCardItem,
  type ServiceRecord,
  type ServiceType,
} from "./service-card-shared";

type Locale = "cs" | "en";

type CardData = {
  engine: { id: string; code: string; family: string; totalMinutes: number };
  category: { id: string; code: string; counterUnit: CounterUnit | null; serviceCardMigrated: boolean };
  serviceTypes: ServiceType[];
  cardItems: ServiceCardItem[];
  materialCategories: Array<{ id: string; nameCs: string; nameEn: string }>;
  materialVariants: MaterialVariant[];
  defaultItems: Array<{ serviceTypeId: string; serviceCardItemId: string }>;
  /** Varianta C: které atributy materiálu odpovídají kterému poli technických údajů. */
  technicalLinks: Array<{ attributeId: string; technicalFieldId: string; materialCategoryId: string; fieldLabelCs: string; fieldLabelEn: string }>;
  technicalValues: Array<{ fieldId: string; value: string }>;
  mechanics: Array<{ id: string; name: string }>;
  records: ServiceRecord[];
};

const content = {
  cs: {
    heading: "Servisní karta",
    intro: "Co a kdy se na motoru dělalo, včetně použitého materiálu.",
    introCounter: "Co a kdy se na motoru dělalo, včetně použitého materiálu a stavu motohodin.",
    add: "Přidat servisní záznam",
    edit: "Upravit servisní záznam",
    loading: "Načítám servisní kartu…",
    loadError: "Servisní kartu se nepodařilo načíst.",
    retry: "Zkusit znovu",
    noItems: "Kategorie nemá žádné položky karty",
    noItemsHelp: "Položky se nastavují v Nastavení → Servisní karta.",
    noRecord: "Bez servisního záznamu",
    unmeasured: "bez měření",
    runOf: (run: string, interval: string) => `Najeto ${run} z ${interval}`,
    history: "Historie servisů",
    noHistory: "Zatím bez historie servisu",
    noHistoryHelp: "První zápis bude obsahovat datum, typ servisu a zaškrtnuté položky.",
    date: "Datum",
    type: "Typ",
    mechanic: "Mechanik",
    counter: "Motohodiny",
    items: "Položky",
    note: "Poznámka",
    actions: "Akce",
    cancelled: "Stornováno",
    cancelRecord: "Stornovat",
    cancelTitle: "Stornovat servisní záznam?",
    cancelIntro: "Záznam zůstane v historii přeškrtnutý i s důvodem. Nelze vzít zpět.",
    cancelReason: "Důvod storna",
    cancelReasonHint: "Povinné — v historii bude vidět, proč byl záznam zrušen.",
    cancelConfirm: "Stornovat záznam",
    cancelling: "Stornuji…",
    editWindowNote: "Opravit záznam jde do 24 hodin od zápisu. Potom už jen storno.",
    noType: "Bez typu",
    selectType: "Vyber typ servisu",
    serviceType: "Typ servisu",
    selectMechanic: "Vyber mechanika",
    serviceDate: "Datum servisu",
    serviceTime: "Čas servisu",
    serviceTimeHint: "Nepovinné. Rozliší dva servisy téhož dne.",
    counterReadonly: "Stav motohodin",
    counterHint: "Bere se automaticky z karty motoru a uloží se k záznamu.",
    counterFix: "Motohodiny nesedí? Opravit",
    itemsLegend: "Co se dělalo",
    itemsHint: "Typ servisu položky předvyplní, dál si je uprav podle skutečnosti.",
    material: "Materiál",
    selectVariant: "Vyber variantu",
    noVariants: "Katalog pro tuto kategorii je prázdný",
    notePlaceholder: "Například naměřené hodnoty nebo co bylo potřeba navíc…",
    syncTitle: "Technické údaje se liší",
    syncRow: (field: string, from: string, to: string) => `${field}: ${from || "—"} → ${to}`,
    syncCheckbox: "Aktualizovat technické údaje podle vybraného materiálu",
    syncHint: "Servis je místo, kde se rozměr mění — technické údaje se z něj aktualizují.",
    syncOffHint: "Když necháš odškrtnuté, technické údaje zůstanou beze změny a k záznamu se uloží, že rozchod je vědomý.",
    divergence: "Rozchod",
    cancel: "Zrušit",
    save: "Uložit servis",
    saveEdit: "Uložit opravu",
    saving: "Ukládám…",
    errorNoItems: "Zaškrtni aspoň jednu položku.",
    errorGeneric: "Záznam se nepodařilo uložit.",
    errorEditWindow: "Od zápisu uplynulo víc než 24 hodin — použij storno.",
    errorReason: "Důvod storna je povinný.",
    savedNew: "Servisní záznam byl uložen.",
    savedEdit: "Servisní záznam byl opraven.",
    savedCancel: "Servisní záznam byl stornován.",
  },
  en: {
    heading: "Service card",
    intro: "What was done on the engine and when, including the material used.",
    introCounter: "What was done on the engine and when, including material and the running-hours reading.",
    add: "Add service entry",
    edit: "Edit service entry",
    loading: "Loading service card…",
    loadError: "The service card could not be loaded.",
    retry: "Try again",
    noItems: "This category has no card items",
    noItemsHelp: "Items are configured in Settings → Service card.",
    noRecord: "No service record",
    unmeasured: "not measured",
    runOf: (run: string, interval: string) => `${run} of ${interval} run`,
    history: "Service history",
    noHistory: "No service history yet",
    noHistoryHelp: "The first entry will include the date, service type and the ticked items.",
    date: "Date",
    type: "Type",
    mechanic: "Mechanic",
    counter: "Running hours",
    items: "Items",
    note: "Note",
    actions: "Actions",
    cancelled: "Cancelled",
    cancelRecord: "Cancel",
    cancelTitle: "Cancel this service record?",
    cancelIntro: "The record stays in history, struck through, with the reason shown. This cannot be undone.",
    cancelReason: "Reason",
    cancelReasonHint: "Required — history will show why the record was cancelled.",
    cancelConfirm: "Cancel record",
    cancelling: "Cancelling…",
    editWindowNote: "A record can be corrected within 24 hours of being entered. After that, only cancellation.",
    noType: "No type",
    selectType: "Select a service type",
    serviceType: "Service type",
    selectMechanic: "Select a mechanic",
    serviceDate: "Service date",
    serviceTime: "Service time",
    serviceTimeHint: "Optional. Tells apart two services on the same day.",
    counterReadonly: "Running hours",
    counterHint: "Taken automatically from the engine card and stored with the record.",
    counterFix: "Hours look wrong? Fix them",
    itemsLegend: "What was done",
    itemsHint: "The service type pre-fills the items; adjust them to what actually happened.",
    material: "Material",
    selectVariant: "Select a variant",
    noVariants: "The catalogue for this category is empty",
    notePlaceholder: "For example measured values or anything extra that was needed…",
    syncTitle: "The technical data differs",
    syncRow: (field: string, from: string, to: string) => `${field}: ${from || "—"} → ${to}`,
    syncCheckbox: "Update the technical data to match the chosen material",
    syncHint: "Service is where the size changes — the technical data is updated from it.",
    syncOffHint: "Left unticked, the technical data stays as it is and the record notes that the divergence was deliberate.",
    divergence: "Divergence",
    cancel: "Cancel",
    save: "Save service",
    saveEdit: "Save correction",
    saving: "Saving…",
    errorNoItems: "Tick at least one item.",
    errorGeneric: "The record could not be saved.",
    errorEditWindow: "More than 24 hours have passed since the entry — use cancellation instead.",
    errorReason: "A reason is required.",
    savedNew: "Service entry saved.",
    savedEdit: "Service record corrected.",
    savedCancel: "Service record cancelled.",
  },
} as const;

type Copy = (typeof content)[Locale];

const API = "/api/service-records";

function localized(locale: Locale, cs: string, en: string) {
  return locale === "cs" ? cs : en || cs;
}

function formatDate(value: string, locale: Locale) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-");
  return locale === "cs" ? `${Number(day)}. ${Number(month)}. ${year}` : `${day}/${month}/${year}`;
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

/** Aktuální čas HH:MM v místním pásmu — předvyplněná hodnota, ať ji mechanik nemusí psát. */
function nowTimeInputValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/**
 * Servisní karta motoru pro kategorie, které už jedou po novém modelu.
 *
 * Dokud kategorie nemá `serviceCardMigrated`, vykreslí se `renderLegacy()` — dnešní karta beze
 * změny, včetně resetu počítadel píst/ojnice. Přepíná se to v Nastavení → Servisní karta.
 */
export function EngineServiceCard({ engine, locale, currentUserName, onOpenHours, renderLegacy }: {
  engine: { id: string; code: string; family: string };
  locale: Locale;
  currentUserName: string;
  onOpenHours: () => void;
  renderLegacy: () => React.ReactNode;
}) {
  const t = content[locale];
  const [data, setData] = useState<CardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRecord | null>(null);
  const [cancelling, setCancelling] = useState<ServiceRecord | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const response = await fetch(`${API}?engineId=${encodeURIComponent(engine.id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      setData((await response.json()) as CardData);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [engine.id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <section className="dash-panel tab-panel"><LoadingState size="inline" label={t.loading} /></section>;
  if (loadError || !data) {
    return (
      <section className="dash-panel tab-panel">
        <EmptyState variant="error" size="inline" icon="!" title={t.loadError}
          action={<button className="secondary-compact" type="button" onClick={() => void load()}>{t.retry}</button>} />
      </section>
    );
  }
  if (!data.category.serviceCardMigrated) return <>{renderLegacy()}</>;

  const tracksCounter = Boolean(data.category.counterUnit);
  const activeRecords = data.records.filter((record) => !record.cancelledAt);

  function applyRecords(records: ServiceRecord[], message: string) {
    setData((current) => current ? { ...current, records } : current);
    setNotice(message);
  }

  return (
    <section className="dash-panel tab-panel">
      <div className="tab-panel-header">
        <div>
          <span className="eyebrow">SERVICE CARD</span>
          <h2>{t.heading}</h2>
          <p>{tracksCounter ? t.introCounter : t.intro}</p>
        </div>
        <button className="primary-button" type="button" onClick={() => setFormOpen(true)}>＋ {t.add}</button>
      </div>

      {notice && <p className="form-hint" role="status">{notice}</p>}

      {data.cardItems.length === 0 ? (
        <EmptyState size="inline" title={t.noItems} description={t.noItemsHelp} />
      ) : (
        <div className={`service-checklist sc-tiles${tracksCounter ? " sc-tiles-counter" : ""}`}>
          {data.cardItems.map((item) => {
            const status = tileStatus(item, activeRecords, data.engine.totalMinutes, data.category.counterUnit);
            const detail = status.state === "unmeasured"
              ? t.unmeasured
              : status.runMinutes !== null && status.intervalMinutes !== null
                ? t.runOf(formatCounterMinutes(status.runMinutes), formatCounterMinutes(status.intervalMinutes))
                : "";
            const last = status.lastRecord;
            return (
              <div key={item.id} className={`${last ? "has-record" : ""} sc-tile-${status.state}`}>
                <span>{last ? "✓" : "○"}</span>
                <strong>{localized(locale, item.nameCs, item.nameEn)}</strong>
                <small>
                  {last
                    ? [`${formatDate(last.serviceDate, locale)}${last.serviceTime ? ` ${last.serviceTime}` : ""}`, last.mechanicNameSnapshot].filter(Boolean).join(" · ")
                    : t.noRecord}
                  {detail && <em className="sc-tile-run">{detail}</em>}
                </small>
              </div>
            );
          })}
        </div>
      )}

      {data.records.length === 0 ? (
        <EmptyState size="inline" title={t.noHistory} description={t.noHistoryHelp} />
      ) : (
        <ServiceHistory t={t} locale={locale} records={data.records} tracksCounter={tracksCounter}
          onEdit={setEditing} onCancel={setCancelling} />
      )}

      {(formOpen || editing) && (
        <ServiceRecordForm
          t={t} locale={locale} data={data} record={editing} currentUserName={currentUserName}
          onOpenHours={onOpenHours}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={(records) => {
            applyRecords(records, editing ? t.savedEdit : t.savedNew);
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}

      {cancelling && (
        <CancelRecordModal
          t={t} record={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={(records) => { applyRecords(records, t.savedCancel); setCancelling(null); }}
        />
      )}
    </section>
  );
}

function ServiceHistory({ t, locale, records, tracksCounter, onEdit, onCancel }: {
  t: Copy; locale: Locale; records: ServiceRecord[]; tracksCounter: boolean;
  onEdit: (record: ServiceRecord) => void;
  onCancel: (record: ServiceRecord) => void;
}) {
  return (
    <div className="records-table-wrap">
      <div className="records-title"><h3>{t.history}</h3><small>{t.editWindowNote}</small></div>
      <div className="table-wrap">
        <table className="records-table zebra">
          <thead><tr>
            <th>{t.date}</th><th>{t.type}</th><th>{t.mechanic}</th>
            {tracksCounter && <th>{t.counter}</th>}
            <th>{t.items}</th><th>{t.note}</th><th className="action-column">{t.actions}</th>
          </tr></thead>
          <tbody>
            {records.map((record) => {
              const cancelled = Boolean(record.cancelledAt);
              const canEdit = !cancelled && isWithinEditWindow(record);
              return (
                <tr key={record.id} className={cancelled ? "sc-record-cancelled" : ""}>
                  <td>
                    {/* Čas se ukáže jen když ho někdo zadal — u starých a přenesených záznamů
                        by prázdná hodnota vypadala, jako by se dělaly o půlnoci. */}
                    <strong>{formatDate(record.serviceDate, locale)}{record.serviceTime && ` ${record.serviceTime}`}</strong>
                    {cancelled && <small className="cell-note sc-cancel-reason">{t.cancelled}: {record.cancelledReason}</small>}
                  </td>
                  <td>{record.serviceTypeSnapshot || <span className="cell-note">{t.noType}</span>}</td>
                  <td>{record.mechanicNameSnapshot || <span className="cell-note">{record.createdBy}</span>}</td>
                  {/* Sloupec zůstane prázdný u záznamů z doby bez počítadla — řádek se nijak neznevýrazňuje. */}
                  {tracksCounter && <td className="num">{record.counterMinutes === null ? "" : formatCounterMinutes(record.counterMinutes)}</td>}
                  <td>
                    {record.items.length === 0 ? <span className="cell-note">—</span> : (
                      <ul className="sc-record-items">
                        {record.items.map((item) => (
                          <li key={item.id}>
                            {localized(locale, item.itemNameCsSnapshot, item.itemNameEnSnapshot)}
                            {item.materialSnapshot && <small>{item.materialSnapshot.name}</small>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>
                    {record.note || (record.divergenceNote ? "" : <span className="cell-note">—</span>)}
                    {record.divergenceNote && <small className="cell-note sc-divergence-note">⚠ {record.divergenceNote}</small>}
                  </td>
                  <td className="action-column">
                    {/* Oprávnění ke stornu (autor nebo superadmin) vyhodnocuje server — klient
                        nezná e-mail přihlášeného, tak tlačítko nabídne a případné 403 ohlásí. */}
                    {!cancelled && (
                      <div className="record-actions">
                        {canEdit && <button type="button" onClick={() => onEdit(record)}>{t.edit}</button>}
                        <button className="delete" type="button" onClick={() => onCancel(record)}>{t.cancelRecord}</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type SelectedItem = { itemId: string; variantId: string };

function ServiceRecordForm({ t, locale, data, record, currentUserName, onOpenHours, onClose, onSaved }: {
  t: Copy; locale: Locale; data: CardData; record: ServiceRecord | null; currentUserName: string;
  onOpenHours: () => void;
  onClose: () => void;
  onSaved: (records: ServiceRecord[]) => void;
}) {
  const dialogRef = useModalA11y(onClose);
  const editing = Boolean(record);
  const tracksCounter = Boolean(data.category.counterUnit);

  const [serviceTypeId, setServiceTypeId] = useState(record?.serviceTypeId ?? "");
  const [serviceDate, setServiceDate] = useState(record?.serviceDate ?? todayInputValue());
  // Nový záznam dostane aktuální čas; u opravy se drží to, co je uložené (i prázdné).
  const [serviceTime, setServiceTime] = useState(record ? record.serviceTime : nowTimeInputValue());
  const [note, setNote] = useState(record?.note ?? "");
  const [selected, setSelected] = useState<SelectedItem[]>(() =>
    (record?.items ?? []).map((item) => ({ itemId: item.serviceCardItemId ?? "", variantId: item.materialVariantId ?? "" })).filter((item) => item.itemId));
  const [mechanicId, setMechanicId] = useState(
    record?.mechanicId
    ?? data.mechanics.find((mechanic) => mechanic.name.trim().toLowerCase() === currentUserName.trim().toLowerCase())?.id
    ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Předvyplněné: servis je místo, kde se rozměr mění. Jde odškrtnout — pak se k záznamu uloží,
  // že rozchod je vědomý.
  const [syncTechnical, setSyncTechnical] = useState(true);

  const variantsByCategory = useMemo(() => {
    const map = new Map<string, MaterialVariant[]>();
    for (const variant of data.materialVariants) {
      map.set(variant.materialCategoryId, [...(map.get(variant.materialCategoryId) ?? []), variant]);
    }
    return map;
  }, [data.materialVariants]);

  // Rozdíly mezi vybraným materiálem a technickými údaji motoru — jen u propojených atributů.
  const divergences = useMemo(() => {
    const rows: Array<{ field: string; from: string; to: string }> = [];
    for (const link of data.technicalLinks) {
      const picked = selected.find((entry) => {
        const item = data.cardItems.find((cardItem) => cardItem.id === entry.itemId);
        return item?.materialCategoryId === link.materialCategoryId && entry.variantId;
      });
      if (!picked) continue;
      const variant = data.materialVariants.find((item) => item.id === picked.variantId);
      const wanted = variant?.attributeValues[link.attributeId];
      if (!wanted) continue;
      const current = data.technicalValues.find((item) => item.fieldId === link.technicalFieldId)?.value ?? "";
      if (current === wanted) continue;
      rows.push({ field: localized(locale, link.fieldLabelCs, link.fieldLabelEn), from: current, to: wanted });
    }
    return rows;
  }, [data, selected, locale]);

  /** Výběr typu servisu předvyplní jeho výchozí položky; mechanik je pak může libovolně upravit. */
  function pickServiceType(nextTypeId: string) {
    setServiceTypeId(nextTypeId);
    if (!nextTypeId) return;
    const defaults = data.defaultItems.filter((link) => link.serviceTypeId === nextTypeId).map((link) => link.serviceCardItemId);
    setSelected((current) => defaults.map((itemId) => ({
      itemId,
      // Už vybranou variantu u položky, která zůstává zaškrtnutá, zachováme.
      variantId: current.find((item) => item.itemId === itemId)?.variantId ?? "",
    })));
  }

  function toggleItem(itemId: string) {
    setSelected((current) => current.some((item) => item.itemId === itemId)
      ? current.filter((item) => item.itemId !== itemId)
      : [...current, { itemId, variantId: "" }]);
  }

  function setVariant(itemId: string, variantId: string) {
    setSelected((current) => current.map((item) => item.itemId === itemId ? { ...item, variantId } : item));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected.length === 0) { setError(t.errorNoItems); return; }
    setSaving(true);
    setError("");
    try {
      // counterMinutes se posílat nemusí — server si ho vezme z engines.total_minutes sám.
      const response = await fetch(API, {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recordId: record?.id,
          engineId: data.engine.id,
          serviceTypeId,
          serviceDate,
          serviceTime,
          mechanicId,
          note,
          // Seřazeno podle pořadí na kartě, ne podle toho, jak mechanik klikal — historie pak
          // čte položky ve stejném pořadí, v jakém jsou dlaždice.
          items: data.cardItems
            .map((cardItem) => selected.find((item) => item.itemId === cardItem.id))
            .filter((item): item is SelectedItem => Boolean(item))
            .map((item) => ({ itemId: item.itemId, variantId: item.variantId || null })),
        }),
      });
      const payload = (await response.json()) as { records?: ServiceRecord[]; error?: string };
      if (!response.ok || !payload.records) throw new Error(payload.error || "save_failed");
      onSaved(payload.records);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "save_failed";
      setError(message === "edit_window_closed" ? t.errorEditWindow : t.errorGeneric);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal service-modal" role="dialog" aria-modal="true" aria-labelledby="sc-record-title" tabIndex={-1}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">SERVICE CARD · {data.engine.code}</span>
            <h2 id="sc-record-title">{editing ? t.edit : t.add}</h2>
            <p>{t.itemsHint}</p>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </div>

        <form onSubmit={submit}>
          <div className="form-grid">
            <label><span>{t.serviceType}</span>
              <select value={serviceTypeId} onChange={(event) => pickServiceType(event.target.value)}>
                <option value="">{t.selectType}</option>
                {data.serviceTypes.map((type) => (
                  <option key={type.id} value={type.id}>{type.code} · {localized(locale, type.nameCs, type.nameEn)}</option>
                ))}
              </select>
            </label>
            <label><span>{t.serviceDate} *</span>
              <input type="date" required value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} />
            </label>
            <label><span>{t.serviceTime}</span>
              <input type="time" value={serviceTime} onChange={(event) => setServiceTime(event.target.value)} />
              <small>{t.serviceTimeHint}</small>
            </label>
            <label><span>{t.mechanic} *</span>
              <select required value={mechanicId} onChange={(event) => setMechanicId(event.target.value)}>
                <option value="" disabled>{t.selectMechanic}</option>
                {data.mechanics.map((mechanic) => <option key={mechanic.id} value={mechanic.id}>{mechanic.name}</option>)}
              </select>
            </label>
            {/* Stav motohodin je read-only — opravuje se na záložce Motohodiny, ne tady. */}
            {tracksCounter && (
              <label><span>{t.counterReadonly}</span>
                <input value={formatCounterMinutes(data.engine.totalMinutes)} readOnly disabled />
                <small>{t.counterHint} <button className="sc-inline-link" type="button" onClick={() => { onClose(); onOpenHours(); }}>{t.counterFix}</button></small>
              </label>
            )}
          </div>

          <fieldset className="parts-fieldset">
            <legend>{t.itemsLegend}</legend>
            {data.cardItems.length === 0 ? <p className="form-hint">{t.noItems}</p> : (
              <div className="sc-record-item-list">
                {data.cardItems.map((item) => {
                  const picked = selected.find((entry) => entry.itemId === item.id);
                  const variants = item.materialCategoryId ? variantsByCategory.get(item.materialCategoryId) ?? [] : [];
                  return (
                    <div key={item.id} className={`sc-record-item ${picked ? "selected" : ""}`}>
                      <label>
                        <input type="checkbox" checked={Boolean(picked)} onChange={() => toggleItem(item.id)} />
                        <span>✓</span>
                        <strong>{localized(locale, item.nameCs, item.nameEn)}</strong>
                      </label>
                      {/* Dropdown s variantami jen u zaškrtnuté položky, která má kategorii materiálu.
                          Mechanik nikdy nevyplňuje atributy ručně — vybírá hotovou variantu z katalogu. */}
                      {picked && item.materialCategoryId && (
                        <label className="sc-record-variant">
                          <span>{t.material}</span>
                          {variants.length === 0 ? <small className="cell-note">{t.noVariants}</small> : (
                            <select value={picked.variantId} onChange={(event) => setVariant(item.id, event.target.value)}>
                              <option value="">{t.selectVariant}</option>
                              {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}
                            </select>
                          )}
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </fieldset>

          {/* Varianta C: obě místa zůstávají oddělená, ale rozchod se nesmí stát potichu. */}
          {divergences.length > 0 && (
            <div className="sc-divergence">
              <strong>{t.syncTitle}</strong>
              <ul>{divergences.map((row) => <li key={row.field}>{t.syncRow(row.field, row.from, row.to)}</li>)}</ul>
              <label className="settings-check">
                <input type="checkbox" checked={syncTechnical} onChange={(event) => setSyncTechnical(event.target.checked)} />
                {t.syncCheckbox}
              </label>
              <small>{syncTechnical ? t.syncHint : t.syncOffHint}</small>
            </div>
          )}

          <label className="standalone-textarea"><span>{t.note}</span>
            <textarea rows={3} maxLength={2000} value={note} placeholder={t.notePlaceholder} onChange={(event) => setNote(event.target.value)} />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <span className="modal-actions-spacer" />
            <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
            <button className="primary-button" type="submit" disabled={saving}>{saving ? t.saving : editing ? t.saveEdit : t.save}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

/** Storno s povinným důvodem — záznam se nikdy nemaže. */
function CancelRecordModal({ t, record, onClose, onCancelled }: {
  t: Copy; record: ServiceRecord;
  onClose: () => void;
  onCancelled: (records: ServiceRecord[]) => void;
}) {
  const dialogRef = useModalA11y(onClose);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) { setError(t.errorReason); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(API, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordId: record.id, cancelledReason: reason }),
      });
      const payload = (await response.json()) as { records?: ServiceRecord[]; error?: string };
      if (!response.ok || !payload.records) throw new Error(payload.error || "cancel_failed");
      onCancelled(payload.records);
    } catch {
      setError(t.errorGeneric);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={dialogRef as React.RefObject<HTMLFormElement>} className="modal settings-user-modal" role="dialog" aria-modal="true" aria-labelledby="sc-cancel-title" tabIndex={-1} onSubmit={submit}>
        <header className="modal-header">
          <div><span className="eyebrow">SERVICE CARD</span><h2 id="sc-cancel-title">{t.cancelTitle}</h2><p>{t.cancelIntro}</p></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>
        <label className="standalone-textarea"><span>{t.cancelReason} *</span>
          <textarea rows={3} required maxLength={500} value={reason} autoFocus onChange={(event) => setReason(event.target.value)} />
          <small>{t.cancelReasonHint}</small>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? t.cancelling : t.cancelConfirm}</button>
        </footer>
      </form>
    </div>
  );
}
