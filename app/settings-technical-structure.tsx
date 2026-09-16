"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";
import { useModalA11y } from "./use-modal-a11y";
import { reorderById } from "./service-card-shared";

type Locale = "cs" | "en";
type AppRole = "superadmin" | "boss" | "mechanic";

/** Rodiny motorů. Stejný seznam a stejné pořadí jako přepínač kategorií u servisní karty. */
const FAMILIES = ["MINI", "OKJ", "OKN", "OKN-J", "OK", "KZ"];

type Layout = { family: string; columnCount: number };
type Section = { id: string; family: string; labelCs: string; labelEn: string; sortOrder: number; archivedAt: number | null };
type Field = { id: string; sectionId: string; labelCs: string; labelEn: string; fieldType: "select" | "text"; showOnOverview: boolean; sortOrder: number; archivedAt: number | null; legacyKey: string | null };
type Option = { id: string; fieldId: string; valueCs: string; valueEn: string; sortOrder: number; archivedAt: number | null };

type DraftField = { legacyKey: string; labelCs: string; labelEn: string; showOnOverview: boolean; include: boolean };
type DraftSection = { labelCs: string; labelEn: string; fields: DraftField[] };

// Rozvržení 3 sekcí / 10 polí, které karta motoru používala, než struktura přešla do DB —
// nabízí se jako editovatelný začátek, aby se rodina nemusela psát od nuly.
const LEGACY_DRAFT_TEMPLATE: DraftSection[] = [
  {
    labelCs: "Motor a píst", labelEn: "Engine and piston",
    fields: [
      { legacyKey: "pistonSpec", labelCs: "Píst / rozměr / úhel", labelEn: "Piston / size / angle", showOnOverview: true, include: true },
    ],
  },
  {
    labelCs: "Válec", labelEn: "Cylinder",
    fields: [
      { legacyKey: "cylinderCode", labelCs: "Označení válce", labelEn: "Cylinder code", showOnOverview: true, include: true },
      { legacyKey: "cylinderUpgrade", labelCs: "Úprava válce", labelEn: "Cylinder upgrade", showOnOverview: true, include: true },
      { legacyKey: "liner", labelCs: "Liner", labelEn: "Liner", showOnOverview: false, include: true },
      { legacyKey: "degree", labelCs: "Degree", labelEn: "Degree", showOnOverview: false, include: true },
      { legacyKey: "timing", labelCs: "Timing", labelEn: "Timing", showOnOverview: false, include: true },
    ],
  },
  {
    labelCs: "Spodní část a sání", labelEn: "Bottom end and intake",
    fields: [
      { legacyKey: "carter", labelCs: "Carter", labelEn: "Carter", showOnOverview: true, include: true },
      { legacyKey: "reeds", labelCs: "Reeds", labelEn: "Reeds", showOnOverview: true, include: true },
      { legacyKey: "spacer", labelCs: "Spacer", labelEn: "Spacer", showOnOverview: false, include: true },
      { legacyKey: "squish", labelCs: "Squish", labelEn: "Squish", showOnOverview: true, include: true },
    ],
  },
];

function cloneDraftTemplate(): DraftSection[] {
  return LEGACY_DRAFT_TEMPLATE.map((section) => ({ ...section, fields: section.fields.map((field) => ({ ...field })) }));
}

const content = {
  cs: {
    title: "Technické údaje",
    intro: "Sekce a pole karty motoru — zvlášť pro každou rodinu. Změna se projeví na kartě motoru.",
    family: "Rodina motoru",
    loading: "Načítám strukturu…",
    loadError: "Strukturu se nepodařilo načíst.",
    retry: "Zkusit znovu",
    forbidden: "Tuto část může spravovat pouze superadmin.",
    dragHint: "Přetažením změníš pořadí",
    nameCs: "Název CZ",
    nameEn: "Název EN",
    active: "Aktivní",
    inactive: "Archivováno",
    actions: "Akce",
    edit: "Upravit",
    remove: "Archivovat",
    cancel: "Zrušit",
    save: "Uložit",
    saving: "Ukládám…",
    columns: "Počet sloupců mřížky",
    columnsHint: "Kolik sloupců má mřížka technických údajů na kartě motoru.",
    copyTo: "Zkopírovat strukturu do…",
    copyToHint: "Jednorázová kopie sekcí, polí i možností. Žádná trvalá vazba — pozdější změna téhle rodiny se do zkopírovaných nepromítne.",
    copyTitle: "Zkopírovat strukturu",
    copyFrom: (family: string) => `Zdroj: ${family}`,
    copyTargets: "Do kterých rodin",
    copyNoTargets: "Vyber aspoň jednu rodinu.",
    copySkipNote: "Rodiny, které už vlastní strukturu mají, se přeskočí — kopie nikdy nepřepíše, co je postavené ručně.",
    copyRun: "Zkopírovat",
    copying: "Kopíruji…",
    copyDone: (copied: string, skipped: string) =>
      `Zkopírováno do: ${copied || "—"}.${skipped ? ` Přeskočeno (už mají strukturu): ${skipped}.` : ""}`,
    sections: "Sekce",
    addSection: "Přidat sekci",
    editSection: "Upravit sekci",
    newSection: "Nová sekce",
    noSections: "Tato rodina zatím nemá žádnou sekci",
    fields: "Pole",
    addField: "Přidat pole",
    editField: "Upravit pole",
    newField: "Nové pole",
    noFields: "Tato sekce zatím nemá žádné pole",
    selectSection: "Vyber sekci vlevo.",
    fieldType: "Typ",
    fieldTypes: { select: "Výběr", text: "Text" },
    showOnOverview: "Zobrazit i na Přehledu",
    showOnOverviewShort: "Na Přehledu",
    options: "Možnosti výběru",
    optionsHint: "Hodnoty, ze kterých se u pole typu Výběr vybírá na kartě motoru.",
    addOption: "Přidat možnost",
    editOption: "Upravit možnost",
    newOption: "Nová možnost",
    noOptions: "Toto pole zatím nemá žádné možnosti",
    onlyForSelect: "Možnosti má jen pole typu Výběr.",
    valueCs: "Hodnota CZ",
    valueEn: "Hodnota EN",
    selectField: "Vyber pole nahoře.",
    draftTitle: "Návrh převodu dnešních technických údajů",
    draftIntro: "Tahle rodina ještě nemá vlastní strukturu. Níže je návrh podle původních deseti polí — uprav podle potřeby a potvrď, nebo začni s prázdnou strukturou.",
    draftSectionCs: "Název sekce (CZ)",
    draftSectionEn: "Název sekce (EN)",
    draftInclude: "Zahrnout pole",
    draftConfirm: "Převést a uložit",
    draftSkip: "Začít s prázdnou strukturou",
    draftEmpty: "Vyber aspoň jedno pole, které se má převést.",
    confirmSection: (name: string) => `Smazat sekci „${name}“? Smaže se natrvalo i se všemi poli uvnitř — hodnoty u motorů zapsané v těchto polích zmizí, jejich historie zůstane, ale bez odkazu na pole. Nejde vrátit zpět.`,
    confirmField: (name: string) => `Smazat pole „${name}“? Smaže se natrvalo — hodnoty u motorů zapsané v tomto poli zmizí, jejich historie zůstane, ale bez odkazu na pole. Nejde vrátit zpět.`,
    confirmOption: (name: string) => `Archivovat možnost „${name}“?`,
    genericError: "Změnu se nepodařilo uložit.",
  },
  en: {
    title: "Technical data",
    intro: "Engine card sections and fields — per family. Changes apply to the engine card.",
    family: "Engine family",
    loading: "Loading structure…",
    loadError: "The structure could not be loaded.",
    retry: "Try again",
    forbidden: "Only a superadmin can manage this section.",
    dragHint: "Drag to reorder",
    nameCs: "Name CZ",
    nameEn: "Name EN",
    active: "Active",
    inactive: "Archived",
    actions: "Actions",
    edit: "Edit",
    remove: "Archive",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    columns: "Grid column count",
    columnsHint: "How many columns the technical-data grid uses on the engine card.",
    copyTo: "Copy structure to…",
    copyToHint: "A one-off copy of sections, fields and options. No lasting link — later changes to this family are not reflected in the copies.",
    copyTitle: "Copy structure",
    copyFrom: (family: string) => `Source: ${family}`,
    copyTargets: "To which families",
    copyNoTargets: "Pick at least one family.",
    copySkipNote: "Families that already have their own structure are skipped — a copy never overwrites what was built by hand.",
    copyRun: "Copy",
    copying: "Copying…",
    copyDone: (copied: string, skipped: string) =>
      `Copied to: ${copied || "—"}.${skipped ? ` Skipped (already have a structure): ${skipped}.` : ""}`,
    sections: "Sections",
    addSection: "Add section",
    editSection: "Edit section",
    newSection: "New section",
    noSections: "This family has no sections yet",
    fields: "Fields",
    addField: "Add field",
    editField: "Edit field",
    newField: "New field",
    noFields: "This section has no fields yet",
    selectSection: "Pick a section on the left.",
    fieldType: "Type",
    fieldTypes: { select: "Dropdown", text: "Text" },
    showOnOverview: "Also show on Overview",
    showOnOverviewShort: "On Overview",
    options: "Dropdown options",
    optionsHint: "The values a Dropdown field offers on the engine card.",
    addOption: "Add option",
    editOption: "Edit option",
    newOption: "New option",
    noOptions: "This field has no options yet",
    onlyForSelect: "Only Dropdown fields have options.",
    valueCs: "Value CZ",
    valueEn: "Value EN",
    selectField: "Pick a field above.",
    draftTitle: "Draft migration of today's technical data",
    draftIntro: "This family has no structure yet. Below is a draft based on the original ten fields — adjust as needed and confirm, or start from an empty structure.",
    draftSectionCs: "Section name (CZ)",
    draftSectionEn: "Section name (EN)",
    draftInclude: "Include field",
    draftConfirm: "Migrate and save",
    draftSkip: "Start from an empty structure",
    draftEmpty: "Select at least one field to migrate.",
    confirmSection: (name: string) => `Delete section "${name}"? This permanently deletes it and every field inside it — engine values recorded in those fields will be gone; their change history stays, but without a link to the field. This cannot be undone.`,
    confirmField: (name: string) => `Delete field "${name}"? This permanently deletes it — engine values recorded in this field will be gone; their change history stays, but without a link to the field. This cannot be undone.`,
    confirmOption: (name: string) => `Archive option "${name}"?`,
    genericError: "The change could not be saved.",
  },
} as const;

type Copy = (typeof content)[Locale];

const API = "/api/engine-technical-structure";

async function api(method: string, body: Record<string, unknown>) {
  const response = await fetch(API, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as { error?: string; copied?: string[]; skipped?: string[] };
  if (!response.ok) throw new Error(data.error || "save_failed");
  return data;
}

/** OKN-J sdílí barevný tón s OKN, stejně jako všude jinde v aplikaci. */
function familyTone(family: string) {
  return (family === "OKN-J" ? "OKN" : family).toLowerCase();
}

function localized(locale: Locale, cs: string, en: string) {
  return locale === "cs" ? cs : en || cs;
}

/** Úchyt pro přetažení řádku — nativní HTML5 drag & drop, stejně jako u servisní karty. */
function DragRow({ id, dragged, setDragged, onDrop, title, children }: {
  id: string;
  dragged: string | null;
  setDragged: (value: string | null) => void;
  onDrop: (draggedId: string, targetId: string) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <tr
      className={dragged === id ? "sc-dragging" : ""}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); if (dragged) onDrop(dragged, id); setDragged(null); }}
    >
      <td className="sc-handle-cell">
        <span className="sc-drag-handle" draggable role="button" tabIndex={-1} aria-label={title} title={title}
          onDragStart={() => setDragged(id)} onDragEnd={() => setDragged(null)}>⠿</span>
      </td>
      {children}
    </tr>
  );
}

function ActiveCell({ t, archivedAt }: { t: Copy; archivedAt: number | null }) {
  return <td><span className={`status-pill ${archivedAt ? "neutral" : "success"}`}>{archivedAt ? t.inactive : t.active}</span></td>;
}

function RowActions({ t, onEdit, onRemove, disabled }: { t: Copy; onEdit: () => void; onRemove: () => void; disabled: boolean }) {
  return (
    <td className="action-column">
      <div className="record-actions">
        <button type="button" onClick={onEdit} aria-label={t.edit} title={t.edit}>✎</button>
        <button className="delete" type="button" disabled={disabled} onClick={onRemove} aria-label={t.remove} title={t.remove}>🗑</button>
      </div>
    </td>
  );
}

export function TechnicalStructureSettings({ locale, role }: { locale: Locale; role: AppRole }) {
  const t = content[locale];
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [activeFamily, setActiveFamily] = useState(FAMILIES[0]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedFieldId, setSelectedFieldId] = useState("");
  const [loading, setLoading] = useState(role === "superadmin");
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [draft, setDraft] = useState<DraftSection[] | null>(null);
  const [draftFamily, setDraftFamily] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | "new" | null>(null);
  const [editingField, setEditingField] = useState<Field | "new" | null>(null);
  const [editingOption, setEditingOption] = useState<Option | "new" | null>(null);
  const [sectionDragged, setSectionDragged] = useState<string | null>(null);
  const [fieldDragged, setFieldDragged] = useState<string | null>(null);
  const [optionDragged, setOptionDragged] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (role !== "superadmin") return;
    setLoadError(false);
    try {
      const response = await fetch(API, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as { layout: Layout[]; sections: Section[]; fields: Field[]; options: Option[] };
      setLayouts(data.layout);
      setSections(data.sections);
      setFields(data.fields);
      setOptions(data.options);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => { void load(); }, [load]);

  const familySections = sections.filter((section) => section.family === activeFamily);
  const columnCount = layouts.find((item) => item.family === activeFamily)?.columnCount ?? 3;
  // Rodina platí za nastavenou, jakmile má jakoukoli sekci (i archivovanou) nebo řádek rozvržení —
  // návrh převodu se pak už nenabízí, aby nepřepsal strukturu postavenou ručně.
  const hasStructure = !loading && (familySections.length > 0 || layouts.some((item) => item.family === activeFamily));
  const showDraft = !loading && !hasStructure && draftFamily === activeFamily && draft !== null;

  useEffect(() => {
    if (loading) return;
    if (!hasStructure && draftFamily !== activeFamily) {
      setDraft(cloneDraftTemplate());
      setDraftFamily(activeFamily);
    }
    if (hasStructure && draftFamily === activeFamily) {
      setDraft(null);
      setDraftFamily(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFamily, loading, hasStructure]);

  const selectedSection = familySections.find((section) => section.id === selectedSectionId)
    ?? familySections.find((section) => !section.archivedAt)
    ?? familySections[0]
    ?? null;
  const sectionFields = selectedSection ? fields.filter((field) => field.sectionId === selectedSection.id) : [];
  const selectedField = sectionFields.find((field) => field.id === selectedFieldId)
    ?? sectionFields.find((field) => !field.archivedAt && field.fieldType === "select")
    ?? null;
  const fieldOptions = selectedField ? options.filter((option) => option.fieldId === selectedField.id) : [];

  async function run(action: () => Promise<unknown>, successNotice = "") {
    setSaving(true);
    setError("");
    try {
      await action();
      await load();
      // Prázdný text hlášku nemaže — akce si ji mohla nastavit sama (třeba výsledek kopie).
      if (successNotice) setNotice(successNotice);
    } catch {
      setError(t.genericError);
    } finally {
      setSaving(false);
    }
  }

  if (role !== "superadmin") {
    return (
      <section className="dash-panel settings-forbidden">
        <span aria-hidden="true">🔒</span>
        <h2>{t.title}</h2>
        <p>{t.forbidden}</p>
      </section>
    );
  }

  if (loading) return <section className="dash-panel"><LoadingState size="inline" label={t.loading} /></section>;
  if (loadError) {
    return (
      <section className="dash-panel">
        <EmptyState variant="error" size="inline" icon="!" title={t.loadError}
          action={<button className="secondary-compact" type="button" onClick={() => void load()}>{t.retry}</button>} />
      </section>
    );
  }

  return (
    <div className="service-card-settings">
      <article className="dash-panel settings-hero">
        <div>
          <span className="settings-kicker">MM SYSTEM · TECHNICAL DATA</span>
          <h2>{t.title}</h2>
          <p>{t.intro}</p>
        </div>
      </article>

      <div className="carb-unit-filters" aria-label={t.family}>
        <div className="carb-unit-category-tiles">
          {FAMILIES.map((family) => (
            <button key={family} type="button"
              className={`carb-unit-tile tone-${familyTone(family)}${family === activeFamily ? " active" : ""}`}
              aria-pressed={family === activeFamily}
              onClick={() => { setActiveFamily(family); setSelectedSectionId(""); setSelectedFieldId(""); setNotice(""); setError(""); }}
            >{family}</button>
          ))}
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && !error && <p className="form-hint" role="status">{notice}</p>}

      {showDraft && draft ? (
        <DraftPanel t={t} draft={draft} setDraft={setDraft} saving={saving}
          onConfirm={async () => {
            const payloadSections = draft
              .map((section) => ({ ...section, fields: section.fields.filter((field) => field.include) }))
              .filter((section) => section.fields.length > 0);
            if (payloadSections.length === 0) { setError(t.draftEmpty); return; }
            await run(() => api("POST", { kind: "confirmMigration", family: activeFamily, sections: payloadSections }));
            setDraft(null);
            setDraftFamily(null);
          }}
          onSkip={async () => {
            await run(() => api("PUT", { kind: "layout", family: activeFamily, columnCount: 3 }));
            setDraft(null);
            setDraftFamily(null);
          }}
        />
      ) : (
        <>
          <article className="dash-panel sc-structure-toolbar">
            <label>
              <span>{t.columns}</span>
              <input type="number" min={1} max={6} defaultValue={columnCount} key={`${activeFamily}-${columnCount}`}
                onBlur={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isInteger(value) && value >= 1 && value <= 6 && value !== columnCount) {
                    void run(() => api("PUT", { kind: "layout", family: activeFamily, columnCount: value }));
                  }
                }} />
              <small>{t.columnsHint}</small>
            </label>
            <div className="tab-actions">
              <button className="secondary-compact" type="button" disabled={familySections.length === 0} onClick={() => setCopyOpen(true)}>
                {t.copyTo}
              </button>
            </div>
          </article>

          <div className="sc-material-grid">
            <section className="dash-panel sc-material-categories">
              <header className="settings-section-heading"><div><h3>{t.sections}</h3></div></header>
              {familySections.length === 0 ? (
                <EmptyState size="inline" title={t.noSections} />
              ) : (
                <ul className="sc-category-list">
                  {familySections.map((section) => (
                    <li key={section.id}
                      className={`${section.id === selectedSection?.id ? "active" : ""} ${sectionDragged === section.id ? "sc-dragging" : ""} ${section.archivedAt ? "sc-archived" : ""}`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (sectionDragged) {
                          const next = reorderById(familySections, sectionDragged, section.id);
                          void run(() => api("PUT", { kind: "reorder", resource: "section", ids: next.map((item) => item.id) }));
                        }
                        setSectionDragged(null);
                      }}>
                      <span className="sc-drag-handle" draggable title={t.dragHint} aria-label={t.dragHint}
                        onDragStart={() => setSectionDragged(section.id)} onDragEnd={() => setSectionDragged(null)}>⠿</span>
                      <button type="button" onClick={() => { setSelectedSectionId(section.id); setSelectedFieldId(""); }}>
                        {localized(locale, section.labelCs, section.labelEn)}
                        {section.archivedAt && <em>{t.inactive}</em>}
                      </button>
                      <span className="record-actions">
                        <button type="button" onClick={() => setEditingSection(section)} aria-label={t.edit} title={t.edit}>✎</button>
                        <button className="delete" type="button" disabled={saving} aria-label={t.remove} title={t.remove}
                          onClick={() => { if (window.confirm(t.confirmSection(localized(locale, section.labelCs, section.labelEn)))) void run(() => api("DELETE", { kind: "section", id: section.id })); }}>🗑</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="sc-table-footer">
                <button className="primary-button" type="button" onClick={() => setEditingSection("new")}>＋ {t.addSection}</button>
              </div>
            </section>

            <div className="sc-material-detail">
              {!selectedSection ? (
                <section className="dash-panel"><EmptyState size="inline" title={t.selectSection} /></section>
              ) : (
                <>
                  <section className="dash-panel">
                    <header className="settings-section-heading">
                      <div><h3>{t.fields} · {localized(locale, selectedSection.labelCs, selectedSection.labelEn)}</h3></div>
                    </header>
                    {sectionFields.length === 0 ? (
                      <EmptyState size="inline" title={t.noFields} />
                    ) : (
                      <div className="table-wrap">
                        <table className="settings-table sc-table">
                          <thead><tr>
                            <th className="sc-handle-cell" aria-label={t.dragHint} /><th>{t.nameCs}</th><th>{t.nameEn}</th>
                            <th>{t.fieldType}</th><th>{t.showOnOverviewShort}</th><th>{t.active}</th><th className="action-column">{t.actions}</th>
                          </tr></thead>
                          <tbody>
                            {sectionFields.map((field) => (
                              <DragRow key={field.id} id={field.id} dragged={fieldDragged} setDragged={setFieldDragged} title={t.dragHint}
                                onDrop={(draggedId, targetId) => {
                                  const next = reorderById(sectionFields, draggedId, targetId);
                                  void run(() => api("PUT", { kind: "reorder", resource: "field", ids: next.map((item) => item.id) }));
                                }}>
                                <td>
                                  <button className="sc-linklike" type="button" onClick={() => setSelectedFieldId(field.id)}>
                                    <strong>{field.labelCs}</strong>
                                  </button>
                                </td>
                                <td>{field.labelEn}</td>
                                <td>{t.fieldTypes[field.fieldType]}</td>
                                <td>{field.showOnOverview ? "✓" : <span className="cell-note">—</span>}</td>
                                <ActiveCell t={t} archivedAt={field.archivedAt} />
                                <RowActions t={t} disabled={saving} onEdit={() => setEditingField(field)}
                                  onRemove={() => { if (window.confirm(t.confirmField(localized(locale, field.labelCs, field.labelEn)))) void run(() => api("DELETE", { kind: "field", id: field.id })); }} />
                              </DragRow>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="sc-table-footer">
                      <button className="primary-button" type="button" onClick={() => setEditingField("new")}>＋ {t.addField}</button>
                    </div>
                  </section>

                  <section className="dash-panel">
                    <header className="settings-section-heading">
                      <div><h3>{t.options}{selectedField ? ` · ${localized(locale, selectedField.labelCs, selectedField.labelEn)}` : ""}</h3><p>{t.optionsHint}</p></div>
                    </header>
                    {!selectedField ? (
                      <EmptyState size="inline" title={t.selectField} />
                    ) : selectedField.fieldType !== "select" ? (
                      <EmptyState size="inline" title={t.onlyForSelect} />
                    ) : fieldOptions.length === 0 ? (
                      <EmptyState size="inline" title={t.noOptions} />
                    ) : (
                      <div className="table-wrap">
                        <table className="settings-table sc-table">
                          <thead><tr>
                            <th className="sc-handle-cell" aria-label={t.dragHint} /><th>{t.valueCs}</th><th>{t.valueEn}</th>
                            <th>{t.active}</th><th className="action-column">{t.actions}</th>
                          </tr></thead>
                          <tbody>
                            {fieldOptions.map((option) => (
                              <DragRow key={option.id} id={option.id} dragged={optionDragged} setDragged={setOptionDragged} title={t.dragHint}
                                onDrop={(draggedId, targetId) => {
                                  const next = reorderById(fieldOptions, draggedId, targetId);
                                  void run(() => api("PUT", { kind: "reorder", resource: "option", ids: next.map((item) => item.id) }));
                                }}>
                                <td><strong>{option.valueCs}</strong></td>
                                <td>{option.valueEn}</td>
                                <ActiveCell t={t} archivedAt={option.archivedAt} />
                                <RowActions t={t} disabled={saving} onEdit={() => setEditingOption(option)}
                                  onRemove={() => { if (window.confirm(t.confirmOption(option.valueCs))) void run(() => api("DELETE", { kind: "option", id: option.id })); }} />
                              </DragRow>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {selectedField?.fieldType === "select" && (
                      <div className="sc-table-footer">
                        <button className="primary-button" type="button" onClick={() => setEditingOption("new")}>＋ {t.addOption}</button>
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {editingSection && (
        <LabelModal t={t} saving={saving}
          title={editingSection === "new" ? t.newSection : t.editSection}
          labelCs={editingSection === "new" ? "" : editingSection.labelCs}
          labelEn={editingSection === "new" ? "" : editingSection.labelEn}
          labelCsCaption={t.nameCs} labelEnCaption={t.nameEn}
          onClose={() => setEditingSection(null)}
          onSubmit={async (values) => {
            await run(() => api(editingSection === "new" ? "POST" : "PUT", {
              kind: "section", id: editingSection === "new" ? undefined : editingSection.id,
              family: activeFamily, labelCs: values.labelCs, labelEn: values.labelEn,
            }));
            setEditingSection(null);
          }} />
      )}

      {editingField && selectedSection && (
        <FieldModal t={t} saving={saving} field={editingField === "new" ? null : editingField}
          onClose={() => setEditingField(null)}
          onSubmit={async (values) => {
            await run(() => api(editingField === "new" ? "POST" : "PUT", {
              kind: "field", id: editingField === "new" ? undefined : editingField.id,
              sectionId: selectedSection.id, labelCs: values.labelCs, labelEn: values.labelEn,
              fieldType: values.fieldType, showOnOverview: values.showOnOverview,
            }));
            setEditingField(null);
          }} />
      )}

      {editingOption && selectedField && (
        <LabelModal t={t} saving={saving}
          title={editingOption === "new" ? t.newOption : t.editOption}
          labelCs={editingOption === "new" ? "" : editingOption.valueCs}
          labelEn={editingOption === "new" ? "" : editingOption.valueEn}
          labelCsCaption={t.valueCs} labelEnCaption={t.valueEn}
          onClose={() => setEditingOption(null)}
          onSubmit={async (values) => {
            await run(() => api(editingOption === "new" ? "POST" : "PUT", {
              kind: "option", id: editingOption === "new" ? undefined : editingOption.id,
              fieldId: selectedField.id, valueCs: values.labelCs, valueEn: values.labelEn,
            }));
            setEditingOption(null);
          }} />
      )}

      {copyOpen && (
        <CopyStructureModal t={t} saving={saving} fromFamily={activeFamily}
          onClose={() => setCopyOpen(false)}
          onSubmit={async (targets) => {
            await run(async () => {
              const result = await api("POST", { kind: "copyStructure", family: activeFamily, toFamilies: targets });
              setNotice(t.copyDone((result.copied ?? []).join(", "), (result.skipped ?? []).join(", ")));
            });
            setCopyOpen(false);
          }} />
      )}
    </div>
  );
}

function LabelModal({ t, saving, title, labelCs: initialCs, labelEn: initialEn, labelCsCaption, labelEnCaption, onClose, onSubmit }: {
  t: Copy; saving: boolean; title: string; labelCs: string; labelEn: string;
  labelCsCaption: string; labelEnCaption: string;
  onClose: () => void;
  onSubmit: (values: { labelCs: string; labelEn: string }) => Promise<void>;
}) {
  const dialogRef = useModalA11y(onClose);
  const [labelCs, setLabelCs] = useState(initialCs);
  const [labelEn, setLabelEn] = useState(initialEn);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={dialogRef as React.RefObject<HTMLFormElement>} className="modal settings-user-modal" role="dialog" aria-modal="true" aria-labelledby="ts-label-title" tabIndex={-1}
        onSubmit={(event) => { event.preventDefault(); void onSubmit({ labelCs, labelEn: labelEn || labelCs }); }}>
        <header className="modal-header">
          <div><span className="eyebrow">TECHNICAL DATA</span><h2 id="ts-label-title">{title}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>
        <div className="form-grid">
          <label><span>{labelCsCaption} *</span><input required maxLength={160} value={labelCs} autoFocus onChange={(event) => setLabelCs(event.target.value)} /></label>
          <label><span>{labelEnCaption}</span><input maxLength={160} value={labelEn} onChange={(event) => setLabelEn(event.target.value)} /></label>
        </div>
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? t.saving : t.save}</button>
        </footer>
      </form>
    </div>
  );
}

function FieldModal({ t, saving, field, onClose, onSubmit }: {
  t: Copy; saving: boolean; field: Field | null;
  onClose: () => void;
  onSubmit: (values: { labelCs: string; labelEn: string; fieldType: "select" | "text"; showOnOverview: boolean }) => Promise<void>;
}) {
  const dialogRef = useModalA11y(onClose);
  const [labelCs, setLabelCs] = useState(field?.labelCs ?? "");
  const [labelEn, setLabelEn] = useState(field?.labelEn ?? "");
  const [fieldType, setFieldType] = useState<"select" | "text">(field?.fieldType ?? "text");
  const [showOnOverview, setShowOnOverview] = useState(field?.showOnOverview ?? false);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={dialogRef as React.RefObject<HTMLFormElement>} className="modal settings-user-modal" role="dialog" aria-modal="true" aria-labelledby="ts-field-title" tabIndex={-1}
        onSubmit={(event) => { event.preventDefault(); void onSubmit({ labelCs, labelEn: labelEn || labelCs, fieldType, showOnOverview }); }}>
        <header className="modal-header">
          <div><span className="eyebrow">TECHNICAL DATA</span><h2 id="ts-field-title">{field ? t.editField : t.newField}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>
        <div className="form-grid">
          <label><span>{t.nameCs} *</span><input required maxLength={160} value={labelCs} autoFocus onChange={(event) => setLabelCs(event.target.value)} /></label>
          <label><span>{t.nameEn}</span><input maxLength={160} value={labelEn} onChange={(event) => setLabelEn(event.target.value)} /></label>
          <label><span>{t.fieldType} *</span>
            <select value={fieldType} onChange={(event) => setFieldType(event.target.value as "select" | "text")}>
              <option value="text">{t.fieldTypes.text}</option>
              <option value="select">{t.fieldTypes.select}</option>
            </select>
          </label>
          <label className="settings-active-field">
            <span>{t.showOnOverviewShort}</span>
            <span className="settings-check"><input type="checkbox" checked={showOnOverview} onChange={(event) => setShowOnOverview(event.target.checked)} />{t.showOnOverview}</span>
          </label>
        </div>
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? t.saving : t.save}</button>
        </footer>
      </form>
    </div>
  );
}

/** Jednorázová kopie do dalších rodin — stejný vzor jako „Převzít z…" u typů servisu. */
function CopyStructureModal({ t, saving, fromFamily, onClose, onSubmit }: {
  t: Copy; saving: boolean; fromFamily: string;
  onClose: () => void;
  onSubmit: (targets: string[]) => Promise<void>;
}) {
  const dialogRef = useModalA11y(onClose);
  const [targets, setTargets] = useState<string[]>([]);
  const [formError, setFormError] = useState("");

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={dialogRef as React.RefObject<HTMLFormElement>} className="modal service-modal" role="dialog" aria-modal="true" aria-labelledby="ts-copy-title" tabIndex={-1}
        onSubmit={(event) => {
          event.preventDefault();
          if (targets.length === 0) { setFormError(t.copyNoTargets); return; }
          void onSubmit(targets);
        }}>
        <header className="modal-header">
          <div><span className="eyebrow">TECHNICAL DATA · {fromFamily}</span><h2 id="ts-copy-title">{t.copyTitle}</h2><p>{t.copyToHint}</p></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>
        <fieldset className="parts-fieldset">
          <legend>{t.copyTargets}</legend>
          <div className="parts-grid">
            {FAMILIES.filter((family) => family !== fromFamily).map((family) => (
              <label key={family} className={targets.includes(family) ? "selected" : ""}>
                <input type="checkbox" checked={targets.includes(family)}
                  onChange={() => setTargets((current) => current.includes(family) ? current.filter((item) => item !== family) : [...current, family])} />
                <span>✓</span>
                <strong>{family}</strong>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="form-hint">{t.copySkipNote}</p>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <footer className="modal-actions">
          <span className="modal-actions-spacer" />
          <button className="secondary-compact" type="button" onClick={onClose}>{t.cancel}</button>
          <button className="primary-button" type="submit" disabled={saving}>{saving ? t.copying : t.copyRun}</button>
        </footer>
      </form>
    </div>
  );
}

/** Nabídka převodu původních deseti polí pro rodinu, která ještě strukturu nemá. */
function DraftPanel({ t, draft, setDraft, saving, onConfirm, onSkip }: {
  t: Copy;
  draft: DraftSection[];
  setDraft: React.Dispatch<React.SetStateAction<DraftSection[] | null>>;
  saving: boolean;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  function updateSection(sectionIndex: number, patch: Partial<DraftSection>) {
    setDraft((current) => current && current.map((section, index) => (index === sectionIndex ? { ...section, ...patch } : section)));
  }
  function updateField(sectionIndex: number, fieldIndex: number, patch: Partial<DraftField>) {
    setDraft((current) => current && current.map((section, sIndex) => (sIndex !== sectionIndex ? section : {
      ...section,
      fields: section.fields.map((field, fIndex) => (fIndex === fieldIndex ? { ...field, ...patch } : field)),
    })));
  }

  return (
    <article className="dash-panel sc-history-panel">
      <div className="sc-history-head">
        <span className="sc-legacy-mark" aria-hidden="true">⇄</span>
        <div><h3>{t.draftTitle}</h3><p>{t.draftIntro}</p></div>
        <div className="tab-actions">
          <button className="secondary-compact" type="button" disabled={saving} onClick={onSkip}>{t.draftSkip}</button>
          <button className="primary-button" type="button" disabled={saving} onClick={onConfirm}>{saving ? t.saving : t.draftConfirm}</button>
        </div>
      </div>

      {draft.map((section, sectionIndex) => (
        <div key={section.labelEn} className="sc-history-summary">
          <div className="form-grid">
            <label><span>{t.draftSectionCs}</span><input value={section.labelCs} onChange={(event) => updateSection(sectionIndex, { labelCs: event.target.value })} /></label>
            <label><span>{t.draftSectionEn}</span><input value={section.labelEn} onChange={(event) => updateSection(sectionIndex, { labelEn: event.target.value })} /></label>
          </div>
          <div className="table-wrap">
            <table className="settings-table sc-table">
              <thead><tr><th>{t.draftInclude}</th><th>{t.nameCs}</th><th>{t.nameEn}</th><th>{t.showOnOverviewShort}</th></tr></thead>
              <tbody>
                {section.fields.map((field, fieldIndex) => (
                  <tr key={field.legacyKey} className={field.include ? "" : "sc-archived"}>
                    <td><input type="checkbox" checked={field.include} onChange={(event) => updateField(sectionIndex, fieldIndex, { include: event.target.checked })} /></td>
                    <td><input value={field.labelCs} disabled={!field.include} onChange={(event) => updateField(sectionIndex, fieldIndex, { labelCs: event.target.value })} /></td>
                    <td><input value={field.labelEn} disabled={!field.include} onChange={(event) => updateField(sectionIndex, fieldIndex, { labelEn: event.target.value })} /></td>
                    <td><input type="checkbox" checked={field.showOnOverview} disabled={!field.include} onChange={(event) => updateField(sectionIndex, fieldIndex, { showOnOverview: event.target.checked })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </article>
  );
}
