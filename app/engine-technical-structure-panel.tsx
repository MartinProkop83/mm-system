"use client";

import { useEffect, useState } from "react";
import { useModalA11y } from "./use-modal-a11y";

type Locale = "cs" | "en";

const FAMILIES = ["MINI", "OKJ", "OKN", "OKN-J", "OK", "KZ"];

type Layout = { family: string; columnCount: number };
type Section = { id: string; family: string; labelCs: string; labelEn: string; sortOrder: number; archivedAt: number | null };
type Field = { id: string; sectionId: string; labelCs: string; labelEn: string; fieldType: "select" | "text"; showOnOverview: boolean; sortOrder: number; archivedAt: number | null; legacyKey: string | null };
type Option = { id: string; fieldId: string; valueCs: string; valueEn: string; sortOrder: number; archivedAt: number | null };

type DraftField = { legacyKey: string; labelCs: string; labelEn: string; showOnOverview: boolean; include: boolean };
type DraftSection = { labelCs: string; labelEn: string; fields: DraftField[] };

// The 3-section / 10-field layout the "Upravit technické údaje" form and engine card use today —
// offered as an editable starting point the first time a family's settings are opened, so nothing has
// to be typed from scratch. See ZJISTI A NAVRHNI bod 4 / ROZSAH bod 2 in the Krok 2 request.
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

async function api(method: string, body: Record<string, unknown>) {
  const response = await fetch("/api/engine-technical-structure", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(data.error || "Save failed");
  return data;
}

export function EngineTechnicalStructurePanel({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const dialogRef = useModalA11y(onClose);
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [activeFamily, setActiveFamily] = useState<string>(FAMILIES[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [renamingSectionId, setRenamingSectionId] = useState<string | null>(null);
  const [renamingFieldId, setRenamingFieldId] = useState<string | null>(null);
  const [renamingOptionId, setRenamingOptionId] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [addingFieldSectionId, setAddingFieldSectionId] = useState<string | null>(null);
  const [addingOptionFieldId, setAddingOptionFieldId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftSection[] | null>(null);
  const [draftFamily, setDraftFamily] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/engine-technical-structure", { cache: "no-store" });
      const data = (await response.json()) as { layout?: Layout[]; sections?: Section[]; fields?: Field[]; options?: Option[]; error?: string };
      if (!response.ok || !data.layout || !data.sections || !data.fields || !data.options) throw new Error(data.error || "Load failed");
      setLayouts(data.layout);
      setSections(data.sections);
      setFields(data.fields);
      setOptions(data.options);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function run(action: () => Promise<unknown>) {
    setSaving(true);
    try {
      await action();
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const columnCount = layouts.find((item) => item.family === activeFamily)?.columnCount ?? 3;
  const familySections = sections.filter((section) => section.family === activeFamily && !section.archivedAt).sort((a, b) => a.sortOrder - b.sortOrder);
  // A family counts as "already configured" the moment it has any section (even archived) or a layout
  // row (set by "skip"/column-count) — either way the migration draft must not be offered again, so it
  // never fights with structure the admin already built by hand (e.g. MINI's own "Testovací karta").
  const hasStructure = !loading && (sections.some((section) => section.family === activeFamily) || layouts.some((item) => item.family === activeFamily));
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

  function updateDraftSection(sectionIndex: number, patch: Partial<DraftSection>) {
    setDraft((current) => current && current.map((section, index) => (index === sectionIndex ? { ...section, ...patch } : section)));
  }
  function updateDraftField(sectionIndex: number, fieldIndex: number, patch: Partial<DraftField>) {
    setDraft((current) => current && current.map((section, sIndex) => (sIndex !== sectionIndex ? section : {
      ...section,
      fields: section.fields.map((field, fIndex) => (fIndex === fieldIndex ? { ...field, ...patch } : field)),
    })));
  }

  async function confirmDraft() {
    if (!draft) return;
    const payloadSections = draft
      .map((section) => ({ ...section, fields: section.fields.filter((field) => field.include) }))
      .filter((section) => section.fields.length > 0);
    if (!payloadSections.length) {
      setError(locale === "cs" ? "Vyber aspoň jedno pole, které se má převést." : "Select at least one field to migrate.");
      return;
    }
    await run(() => api("POST", { kind: "confirmMigration", family: activeFamily, sections: payloadSections }));
    setDraft(null);
    setDraftFamily(null);
  }

  async function skipDraft() {
    await run(() => api("PUT", { kind: "layout", family: activeFamily, columnCount: 3 }));
    setDraft(null);
    setDraftFamily(null);
  }

  function fieldsFor(sectionId: string) {
    return fields.filter((field) => field.sectionId === sectionId && !field.archivedAt).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  function optionsFor(fieldId: string) {
    return options.filter((option) => option.fieldId === fieldId && !option.archivedAt).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async function moveSection(section: Section, direction: "up" | "down") {
    const index = familySections.findIndex((item) => item.id === section.id);
    const neighbor = familySections[direction === "up" ? index - 1 : index + 1];
    if (!neighbor) return;
    await run(() => Promise.all([
      api("PUT", { kind: "section", id: section.id, sortOrder: neighbor.sortOrder }),
      api("PUT", { kind: "section", id: neighbor.id, sortOrder: section.sortOrder }),
    ]));
  }

  async function moveField(field: Field, direction: "up" | "down") {
    const siblings = fieldsFor(field.sectionId);
    const index = siblings.findIndex((item) => item.id === field.id);
    const neighbor = siblings[direction === "up" ? index - 1 : index + 1];
    if (!neighbor) return;
    await run(() => Promise.all([
      api("PUT", { kind: "field", id: field.id, sortOrder: neighbor.sortOrder }),
      api("PUT", { kind: "field", id: neighbor.id, sortOrder: field.sortOrder }),
    ]));
  }

  async function moveOption(option: Option, direction: "up" | "down") {
    const siblings = optionsFor(option.fieldId);
    const index = siblings.findIndex((item) => item.id === option.id);
    const neighbor = siblings[direction === "up" ? index - 1 : index + 1];
    if (!neighbor) return;
    await run(() => Promise.all([
      api("PUT", { kind: "option", id: option.id, sortOrder: neighbor.sortOrder }),
      api("PUT", { kind: "option", id: neighbor.id, sortOrder: option.sortOrder }),
    ]));
  }

  function archiveSection(section: Section) {
    const question = locale === "cs"
      ? `Archivovat sekci „${section.labelCs}“? Pole v ní zůstanou uložená a vrátí se, když sekci obnovíš.`
      : `Archive section "${section.labelEn}"? Its fields stay saved and come back if you restore the section.`;
    if (!window.confirm(question)) return;
    void run(() => api("DELETE", { kind: "section", id: section.id }));
  }

  function archiveField(field: Field) {
    const question = locale === "cs"
      ? `Archivovat pole „${field.labelCs}“? Hodnoty u motorů zůstanou uložené a vrátí se, když pole obnovíš.`
      : `Archive field "${field.labelEn}"? Engine values stay saved and come back if you restore the field.`;
    if (!window.confirm(question)) return;
    void run(() => api("DELETE", { kind: "field", id: field.id }));
  }

  function archiveOption(option: Option) {
    if (!window.confirm(locale === "cs" ? `Archivovat možnost „${option.valueCs}“?` : `Archive option "${option.valueEn}"?`)) return;
    void run(() => api("DELETE", { kind: "option", id: option.id }));
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef as React.RefObject<HTMLElement>} className="modal service-modal" role="dialog" aria-modal="true" aria-labelledby="technical-structure-title" tabIndex={-1}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">SERVICE CARD</span>
            <h2 id="technical-structure-title">{locale === "cs" ? "Struktura technických údajů" : "Technical data structure"}</h2>
            <p>{locale === "cs" ? "Sekce a pole karty motoru podle rodiny. Změna se projeví v kartě motoru." : "Engine card sections and fields, per family. Changes apply to the engine card."}</p>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label={locale === "cs" ? "Zavřít" : "Close"}>×</button>
        </div>

        {loading && <p className="form-hint">{locale === "cs" ? "Načítám…" : "Loading…"}</p>}
        {error && <p className="form-error">{error}</p>}

        {!loading && (
          <>
            <div className="parts-fieldset" style={{ marginBottom: "var(--wrc-space-16)" }}>
              <div className="parts-grid">
                {FAMILIES.map((family) => (
                  <label key={family} className={family === activeFamily ? "selected" : ""}>
                    <input type="radio" name="family" checked={family === activeFamily} onChange={() => setActiveFamily(family)} />
                    <span>✓</span>
                    <strong>{family}</strong>
                  </label>
                ))}
              </div>
            </div>

            <label style={{ display: "inline-flex", flexDirection: "column", gap: "var(--wrc-space-8)", marginBottom: "var(--wrc-space-16)", maxWidth: "220px" }}>
              <span>{locale === "cs" ? "Počet sloupců mřížky" : "Grid column count"}</span>
              <input
                type="number"
                min={1}
                max={6}
                defaultValue={columnCount}
                key={`${activeFamily}-${columnCount}`}
                onBlur={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isInteger(value) && value >= 1 && value <= 6 && value !== columnCount) {
                    void run(() => api("PUT", { kind: "layout", family: activeFamily, columnCount: value }));
                  }
                }}
              />
            </label>

            {showDraft && draft && (
              <div className="panel" style={{ marginBottom: "var(--wrc-space-16)", padding: "var(--wrc-space-16)" }}>
                <div className="tab-panel-header">
                  <div>
                    <h3>{locale === "cs" ? "Návrh převodu dnešních technických údajů" : "Draft migration of today's technical data"}</h3>
                    <small>{locale === "cs"
                      ? "Tahle rodina ještě nemá vlastní strukturu. Níže je návrh podle dnešních 10 polí — uprav podle potřeby a potvrď, nebo začni s prázdnou strukturou."
                      : "This family has no structure yet. Below is a draft based on today's 10 fields — edit as needed and confirm, or start with an empty structure."}</small>
                  </div>
                </div>
                {draft.map((section, sectionIndex) => (
                  <div key={section.labelEn} style={{ marginTop: "var(--wrc-space-16)" }}>
                    <div className="form-grid" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
                      <label><span>{locale === "cs" ? "Název sekce (CZ)" : "Section name (CZ)"}</span><input value={section.labelCs} onChange={(event) => updateDraftSection(sectionIndex, { labelCs: event.target.value })} /></label>
                      <label><span>{locale === "cs" ? "Název sekce (EN)" : "Section name (EN)"}</span><input value={section.labelEn} onChange={(event) => updateDraftSection(sectionIndex, { labelEn: event.target.value })} /></label>
                    </div>
                    <div className="history-list" style={{ marginTop: "var(--wrc-space-8)" }}>
                      {section.fields.map((field, fieldIndex) => (
                        <div key={field.legacyKey}>
                          <i />
                          <span style={{ display: "block" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "var(--wrc-space-6)", marginBottom: "var(--wrc-space-4)" }}>
                              <input type="checkbox" checked={field.include} onChange={(event) => updateDraftField(sectionIndex, fieldIndex, { include: event.target.checked })} />
                              <small>{locale === "cs" ? "Zahrnout pole" : "Include field"}</small>
                            </label>
                            <div className="form-grid" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", opacity: field.include ? 1 : 0.5 }}>
                              <label><span>CZ</span><input value={field.labelCs} disabled={!field.include} onChange={(event) => updateDraftField(sectionIndex, fieldIndex, { labelCs: event.target.value })} /></label>
                              <label><span>EN</span><input value={field.labelEn} disabled={!field.include} onChange={(event) => updateDraftField(sectionIndex, fieldIndex, { labelEn: event.target.value })} /></label>
                            </div>
                            <label style={{ display: "flex", alignItems: "center", gap: "var(--wrc-space-6)", marginTop: "var(--wrc-space-4)", opacity: field.include ? 1 : 0.5 }}>
                              <input type="checkbox" checked={field.showOnOverview} disabled={!field.include} onChange={(event) => updateDraftField(sectionIndex, fieldIndex, { showOnOverview: event.target.checked })} />
                              <small>{locale === "cs" ? "Zobrazit i na Přehledu" : "Also show on Overview"}</small>
                            </label>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {error && <p className="form-error">{error}</p>}
                <div className="modal-actions" style={{ marginTop: "var(--wrc-space-16)" }}>
                  <span className="modal-actions-spacer" />
                  <button type="button" onClick={() => void skipDraft()} disabled={saving}>{locale === "cs" ? "Začít s prázdnou strukturou" : "Start with an empty structure"}</button>
                  <button className="primary-button" type="button" onClick={() => void confirmDraft()} disabled={saving}>{locale === "cs" ? "Potvrdit a převést" : "Confirm and migrate"}</button>
                </div>
              </div>
            )}

            {!showDraft && (
              <>
            {familySections.map((section, sectionIndex) => (
              <div className="panel" key={section.id} style={{ marginBottom: "var(--wrc-space-16)", padding: "var(--wrc-space-16)" }}>
                <div className="tab-panel-header">
                  <div className="record-actions">
                    <button type="button" disabled={saving || sectionIndex === 0} onClick={() => moveSection(section, "up")} aria-label={locale === "cs" ? "Sekci nahoru" : "Move section up"}>↑</button>
                    <button type="button" disabled={saving || sectionIndex === familySections.length - 1} onClick={() => moveSection(section, "down")} aria-label={locale === "cs" ? "Sekci dolů" : "Move section down"}>↓</button>
                  </div>
                  {renamingSectionId === section.id ? (
                    <form
                      className="form-grid"
                      style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", flex: 1 }}
                      onSubmit={(event) => {
                        event.preventDefault();
                        const formData = new FormData(event.currentTarget);
                        void run(() => api("PUT", { kind: "section", id: section.id, labelCs: formData.get("labelCs"), labelEn: formData.get("labelEn") })).then(() => setRenamingSectionId(null));
                      }}
                    >
                      <label><span>CZ *</span><input name="labelCs" defaultValue={section.labelCs} required /></label>
                      <label><span>EN *</span><input name="labelEn" defaultValue={section.labelEn} required /></label>
                      <div className="record-actions"><button type="submit" disabled={saving}>{locale === "cs" ? "Uložit" : "Save"}</button><button type="button" onClick={() => setRenamingSectionId(null)}>{locale === "cs" ? "Zrušit" : "Cancel"}</button></div>
                    </form>
                  ) : (
                    <div><h3>{section.labelCs}</h3><small>{section.labelEn}</small></div>
                  )}
                  {renamingSectionId !== section.id && (
                    <div className="record-actions">
                      <button type="button" onClick={() => setRenamingSectionId(section.id)}>{locale === "cs" ? "Přejmenovat" : "Rename"}</button>
                      <button className="delete" type="button" disabled={saving} onClick={() => archiveSection(section)}>{locale === "cs" ? "Archivovat" : "Archive"}</button>
                    </div>
                  )}
                </div>

                <div className="history-list">
                  {fieldsFor(section.id).map((field, fieldIndex, fieldSiblings) => (
                    <div key={field.id}>
                      <i />
                      <span style={{ display: "block" }}>
                        <div className="record-actions" style={{ marginBottom: "var(--wrc-space-4)" }}>
                          <button type="button" disabled={saving || fieldIndex === 0} onClick={() => moveField(field, "up")} aria-label={locale === "cs" ? "Pole nahoru" : "Move field up"}>↑</button>
                          <button type="button" disabled={saving || fieldIndex === fieldSiblings.length - 1} onClick={() => moveField(field, "down")} aria-label={locale === "cs" ? "Pole dolů" : "Move field down"}>↓</button>
                          <span className={`status-pill ${field.fieldType === "select" ? "info-pill" : "neutral"}`}>{field.fieldType === "select" ? (locale === "cs" ? "Výběr" : "Select") : (locale === "cs" ? "Text" : "Text")}</span>
                        </div>

                        {renamingFieldId === field.id ? (
                          <form
                            className="form-grid"
                            style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}
                            onSubmit={(event) => {
                              event.preventDefault();
                              const formData = new FormData(event.currentTarget);
                              void run(() => api("PUT", { kind: "field", id: field.id, labelCs: formData.get("labelCs"), labelEn: formData.get("labelEn") })).then(() => setRenamingFieldId(null));
                            }}
                          >
                            <label><span>CZ *</span><input name="labelCs" defaultValue={field.labelCs} required /></label>
                            <label><span>EN *</span><input name="labelEn" defaultValue={field.labelEn} required /></label>
                            <div className="record-actions"><button type="submit" disabled={saving}>{locale === "cs" ? "Uložit" : "Save"}</button><button type="button" onClick={() => setRenamingFieldId(null)}>{locale === "cs" ? "Zrušit" : "Cancel"}</button></div>
                          </form>
                        ) : (
                          <strong>{field.labelCs}<small style={{ marginLeft: "var(--wrc-space-8)" }}>{field.labelEn}</small></strong>
                        )}

                        <label style={{ display: "flex", alignItems: "center", gap: "var(--wrc-space-6)", marginTop: "var(--wrc-space-4)" }}>
                          <input type="checkbox" checked={field.showOnOverview} onChange={(event) => void run(() => api("PUT", { kind: "field", id: field.id, showOnOverview: event.target.checked }))} />
                          <small>{locale === "cs" ? "Zobrazit i na Přehledu" : "Also show on Overview"}</small>
                        </label>

                        {renamingFieldId !== field.id && (
                          <div className="record-actions" style={{ marginTop: "var(--wrc-space-4)" }}>
                            <button type="button" onClick={() => setRenamingFieldId(field.id)}>{locale === "cs" ? "Přejmenovat" : "Rename"}</button>
                            <button className="delete" type="button" disabled={saving} onClick={() => archiveField(field)}>{locale === "cs" ? "Archivovat" : "Archive"}</button>
                          </div>
                        )}

                        {field.fieldType === "select" && (
                          <div style={{ marginTop: "var(--wrc-space-8)", paddingLeft: "var(--wrc-space-16)", borderLeft: "2px solid var(--wrc-line)" }}>
                            {optionsFor(field.id).map((option, optionIndex, optionSiblings) => (
                              <div key={option.id} className="record-actions" style={{ marginBottom: "var(--wrc-space-4)" }}>
                                <button type="button" disabled={saving || optionIndex === 0} onClick={() => moveOption(option, "up")} aria-label={locale === "cs" ? "Možnost nahoru" : "Move option up"}>↑</button>
                                <button type="button" disabled={saving || optionIndex === optionSiblings.length - 1} onClick={() => moveOption(option, "down")} aria-label={locale === "cs" ? "Možnost dolů" : "Move option down"}>↓</button>
                                {renamingOptionId === option.id ? (
                                  <form
                                    className="form-grid"
                                    style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}
                                    onSubmit={(event) => {
                                      event.preventDefault();
                                      const formData = new FormData(event.currentTarget);
                                      void run(() => api("PUT", { kind: "option", id: option.id, valueCs: formData.get("valueCs"), valueEn: formData.get("valueEn") })).then(() => setRenamingOptionId(null));
                                    }}
                                  >
                                    <label><span>CZ *</span><input name="valueCs" defaultValue={option.valueCs} required /></label>
                                    <label><span>EN *</span><input name="valueEn" defaultValue={option.valueEn} required /></label>
                                    <div className="record-actions"><button type="submit" disabled={saving}>{locale === "cs" ? "Uložit" : "Save"}</button><button type="button" onClick={() => setRenamingOptionId(null)}>{locale === "cs" ? "Zrušit" : "Cancel"}</button></div>
                                  </form>
                                ) : (
                                  <span>{option.valueCs} <small>({option.valueEn})</small></span>
                                )}
                                {renamingOptionId !== option.id && (
                                  <>
                                    <button type="button" onClick={() => setRenamingOptionId(option.id)}>{locale === "cs" ? "Přejmenovat" : "Rename"}</button>
                                    <button className="delete" type="button" disabled={saving} onClick={() => archiveOption(option)}>{locale === "cs" ? "Archivovat" : "Archive"}</button>
                                  </>
                                )}
                              </div>
                            ))}
                            {addingOptionFieldId === field.id ? (
                              <form
                                className="form-grid"
                                style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const formData = new FormData(event.currentTarget);
                                  void run(() => api("POST", { kind: "option", fieldId: field.id, valueCs: formData.get("valueCs"), valueEn: formData.get("valueEn") })).then(() => setAddingOptionFieldId(null));
                                }}
                              >
                                <label><span>{locale === "cs" ? "Nová možnost (CZ)" : "New option (CZ)"} *</span><input name="valueCs" required /></label>
                                <label><span>{locale === "cs" ? "Nová možnost (EN)" : "New option (EN)"} *</span><input name="valueEn" required /></label>
                                <div className="record-actions"><button type="submit" disabled={saving}>{locale === "cs" ? "Přidat" : "Add"}</button><button type="button" onClick={() => setAddingOptionFieldId(null)}>{locale === "cs" ? "Zrušit" : "Cancel"}</button></div>
                              </form>
                            ) : (
                              <button type="button" className="secondary-compact" onClick={() => setAddingOptionFieldId(field.id)}>＋ {locale === "cs" ? "Přidat možnost" : "Add option"}</button>
                            )}
                          </div>
                        )}
                      </span>
                    </div>
                  ))}
                  {fieldsFor(section.id).length === 0 && addingFieldSectionId !== section.id && (
                    <div><i /><span>{locale === "cs" ? "Zatím žádné pole." : "No fields yet."}</span></div>
                  )}
                </div>

                {addingFieldSectionId === section.id ? (
                  <form
                    className="form-grid"
                    style={{ marginTop: "var(--wrc-space-12)" }}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const formData = new FormData(event.currentTarget);
                      void run(() => api("POST", { kind: "field", sectionId: section.id, labelCs: formData.get("labelCs"), labelEn: formData.get("labelEn"), fieldType: formData.get("fieldType") })).then(() => setAddingFieldSectionId(null));
                    }}
                  >
                    <label><span>{locale === "cs" ? "Název pole (CZ)" : "Field name (CZ)"} *</span><input name="labelCs" required /></label>
                    <label><span>{locale === "cs" ? "Název pole (EN)" : "Field name (EN)"} *</span><input name="labelEn" required /></label>
                    <label><span>{locale === "cs" ? "Typ" : "Type"} *</span>
                      <select name="fieldType" defaultValue="text">
                        <option value="text">{locale === "cs" ? "Volný text" : "Free text"}</option>
                        <option value="select">{locale === "cs" ? "Výběr ze seznamu" : "Select from list"}</option>
                      </select>
                    </label>
                    <div className="modal-actions"><span className="modal-actions-spacer" /><button type="button" onClick={() => setAddingFieldSectionId(null)}>{locale === "cs" ? "Zrušit" : "Cancel"}</button><button className="primary-button" type="submit" disabled={saving}>{locale === "cs" ? "Přidat pole" : "Add field"}</button></div>
                  </form>
                ) : (
                  <button type="button" className="secondary-compact" style={{ marginTop: "var(--wrc-space-12)" }} onClick={() => setAddingFieldSectionId(section.id)}>＋ {locale === "cs" ? "Přidat pole" : "Add field"}</button>
                )}
              </div>
            ))}

            {familySections.length === 0 && !addingSection && (
              <p className="form-hint">{locale === "cs" ? "Tahle rodina zatím nemá žádnou sekci." : "This family has no sections yet."}</p>
            )}

            {addingSection ? (
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  void run(() => api("POST", { kind: "section", family: activeFamily, labelCs: formData.get("labelCs"), labelEn: formData.get("labelEn") })).then(() => setAddingSection(false));
                }}
              >
                <label><span>{locale === "cs" ? "Název sekce (CZ)" : "Section name (CZ)"} *</span><input name="labelCs" required /></label>
                <label><span>{locale === "cs" ? "Název sekce (EN)" : "Section name (EN)"} *</span><input name="labelEn" required /></label>
                <div className="modal-actions"><span className="modal-actions-spacer" /><button type="button" onClick={() => setAddingSection(false)}>{locale === "cs" ? "Zrušit" : "Cancel"}</button><button className="primary-button" type="submit" disabled={saving}>{locale === "cs" ? "Přidat sekci" : "Add section"}</button></div>
              </form>
            ) : (
              <button className="primary-button" type="button" onClick={() => setAddingSection(true)}>＋ {locale === "cs" ? "Přidat sekci" : "Add section"}</button>
            )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
