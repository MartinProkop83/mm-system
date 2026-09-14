"use client";

import { useEffect, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";
import { useModalA11y } from "./use-modal-a11y";

type Locale = "cs" | "en";
type AppRole = "superadmin" | "boss" | "mechanic";

type DocumentType = {
  id: string; code: string; nameCs: string; nameEn: string;
  handOverToBuyer: boolean; sortOrder: number; isActive: boolean;
};

const content = {
  cs: {
    heading: "Typy dokumentů",
    intro: "Číselník typů dokumentů u karty motoru — faktura, homologace a podobně. Přetažením změníš pořadí v nabídce při nahrávání.",
    loading: "Načítám typy dokumentů…",
    loadError: "Typy dokumentů se nepodařilo načíst.",
    retry: "Zkusit znovu",
    add: "＋ Nový typ",
    dragHint: "Přetažením změníš pořadí",
    name: "Název",
    handOver: "Předává se kupci",
    handOverHint: "Zatím jen příznak — samotné předávání dokumentů kupci ještě nefunguje. Připraveno pro pozdější krok.",
    active: "Aktivní",
    inactive: "Neaktivní",
    actions: "Akce",
    edit: "Upravit",
    remove: "Deaktivovat",
    confirmRemove: (name: string) => `Deaktivovat typ „${name}"? Dokumenty tohoto typu zůstanou zachované, jen zmizí z nabídky při nahrávání.`,
    newTitle: "Nový typ dokumentu",
    editTitle: "Upravit typ dokumentu",
    nameCsLabel: "Název česky",
    nameEnLabel: "Název anglicky",
    nameEnHint: "Prázdné = použije se český název.",
    save: "Uložit",
    saving: "Ukládám…",
    cancel: "Zrušit",
    nameRequired: "Vyplň český název.",
    saveError: "Uložení se nepodařilo.",
    empty: "Zatím žádné typy dokumentů",
    emptyHelp: "Přidej první typ, ať se dá při nahrávání vybrat.",
    readOnly: "Typy dokumentů mění jen superadmin.",
  },
  en: {
    heading: "Document types",
    intro: "The catalog of document types for the engine card — invoice, homologation and similar. Drag a row to reorder the upload picker.",
    loading: "Loading document types…",
    loadError: "The document types could not be loaded.",
    retry: "Try again",
    add: "＋ New type",
    dragHint: "Drag to reorder",
    name: "Name",
    handOver: "Hand over to buyer",
    handOverHint: "Just a flag for now — actually handing documents to a buyer isn't wired up yet. Prepared for a later step.",
    active: "Active",
    inactive: "Inactive",
    actions: "Actions",
    edit: "Edit",
    remove: "Deactivate",
    confirmRemove: (name: string) => `Deactivate type "${name}"? Its documents stay as they are, it just disappears from the upload picker.`,
    newTitle: "New document type",
    editTitle: "Edit document type",
    nameCsLabel: "Czech name",
    nameEnLabel: "English name",
    nameEnHint: "Empty = the Czech name is used.",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    nameRequired: "Fill in the Czech name.",
    saveError: "Save failed.",
    empty: "No document types yet",
    emptyHelp: "Add the first type so it can be picked when uploading.",
    readOnly: "Only a superadmin can change document types.",
  },
} as const;

type Copy = (typeof content)[Locale];

function localized(locale: Locale, cs: string, en: string) {
  return locale === "cs" ? cs : en || cs;
}

async function api(method: string, body: unknown) {
  const response = await fetch("/api/engine-document-types", {
    method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error || "request failed");
}

export function DocumentTypesSettings({ locale, role }: { locale: Locale; role: AppRole }) {
  const t = content[locale];
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<DocumentType | "new" | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const canManage = role === "superadmin";

  async function load() {
    setLoadError(false);
    try {
      const response = await fetch("/api/engine-document-types", { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as { types: DocumentType[] };
      setTypes(data.types);
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
    } catch {
      setError(t.saveError);
    } finally {
      setSaving(false);
    }
  }

  function reorder(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const current = [...types];
    const from = current.findIndex((item) => item.id === draggedId);
    const to = current.findIndex((item) => item.id === targetId);
    if (from === -1 || to === -1) return;
    const [moved] = current.splice(from, 1);
    current.splice(to, 0, moved);
    setTypes(current);
    void run(() => api("PUT", { order: current.map((item) => item.id) }));
  }

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

      {types.length === 0 ? (
        <EmptyState size="inline" title={t.empty} description={t.emptyHelp} />
      ) : (
        <div className="table-wrap">
          <table className="settings-table sc-table">
            <thead><tr>
              <th className="sc-handle-cell" aria-label={t.dragHint} />
              <th>{t.name}</th><th>{t.handOver}</th><th>{t.active}</th>
              {canManage && <th className="action-column">{t.actions}</th>}
            </tr></thead>
            <tbody>
              {types.map((type) => (
                <tr key={type.id} className={dragged === type.id ? "sc-dragging" : ""}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.preventDefault(); if (dragged) reorder(dragged, type.id); setDragged(null); }}>
                  <td className="sc-handle-cell">
                    {canManage && (
                      <span className="sc-drag-handle" draggable role="button" tabIndex={-1} aria-label={t.dragHint} title={t.dragHint}
                        onDragStart={() => setDragged(type.id)} onDragEnd={() => setDragged(null)}>⠿</span>
                    )}
                  </td>
                  <td><strong>{localized(locale, type.nameCs, type.nameEn)}</strong></td>
                  <td><span className={`status-pill ${type.handOverToBuyer ? "success" : "neutral"}`}>{type.handOverToBuyer ? t.handOver : "—"}</span></td>
                  <td><span className={`status-pill ${type.isActive ? "success" : "neutral"}`}>{type.isActive ? t.active : t.inactive}</span></td>
                  {canManage && (
                    <td className="action-column">
                      <div className="record-actions">
                        <button type="button" onClick={() => setEditing(type)} aria-label={t.edit} title={t.edit}>✎</button>
                        {type.isActive && (
                          <button className="delete" type="button" disabled={saving} aria-label={t.remove} title={t.remove}
                            onClick={() => { if (window.confirm(t.confirmRemove(localized(locale, type.nameCs, type.nameEn)))) void run(() => api("DELETE", { id: type.id })); }}>🗑</button>
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

      {!canManage && <p className="form-hint">{t.readOnly}</p>}

      {editing && (
        <DocumentTypeModal t={t} type={editing === "new" ? null : editing} saving={saving}
          onClose={() => setEditing(null)}
          onSave={(payload) => void run(() => editing === "new" ? api("POST", payload) : api("PUT", { id: editing.id, ...payload }))} />
      )}
    </section>
  );
}

function DocumentTypeModal({ t, type, saving, onClose, onSave }: {
  t: Copy; type: DocumentType | null; saving: boolean;
  onClose: () => void;
  onSave: (payload: { nameCs: string; nameEn: string; handOverToBuyer: boolean }) => void;
}) {
  const dialogRef = useModalA11y(onClose);
  const [nameCs, setNameCs] = useState(type?.nameCs ?? "");
  const [nameEn, setNameEn] = useState(type?.nameEn ?? "");
  const [handOverToBuyer, setHandOverToBuyer] = useState(type?.handOverToBuyer ?? false);
  const [formError, setFormError] = useState("");

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={dialogRef as React.RefObject<HTMLFormElement>} className="modal settings-user-modal" role="dialog" aria-modal="true" aria-labelledby="doc-type-title" tabIndex={-1}
        onSubmit={(event) => {
          event.preventDefault();
          if (!nameCs.trim()) { setFormError(t.nameRequired); return; }
          onSave({ nameCs: nameCs.trim(), nameEn: nameEn.trim(), handOverToBuyer });
        }}>
        <header className="modal-header">
          <div><h2 id="doc-type-title">{type ? t.editTitle : t.newTitle}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>
        <div className="form-grid">
          <label><span>{t.nameCsLabel} *</span>
            <input value={nameCs} onChange={(event) => setNameCs(event.target.value)} autoFocus maxLength={120} />
          </label>
          <label><span>{t.nameEnLabel}</span>
            <input value={nameEn} onChange={(event) => setNameEn(event.target.value)} maxLength={120} />
            <small>{t.nameEnHint}</small>
          </label>
        </div>
        <label className="settings-checkbox-row">
          <input type="checkbox" checked={handOverToBuyer} onChange={(event) => setHandOverToBuyer(event.target.checked)} />
          <span>{t.handOver}</span>
        </label>
        <p className="form-hint">{t.handOverHint}</p>
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
