"use client";

import { useEffect, useState } from "react";
import { EmptyState, LoadingState } from "./empty-state";
import { useModalA11y } from "./use-modal-a11y";

type Locale = "cs" | "en";
type AppRole = "superadmin" | "boss" | "mechanic";

type ServiceEngineType = {
  id: string; code: string; nameCs: string; nameEn: string; sortOrder: number; isActive: boolean;
};

const content = {
  cs: {
    heading: "Typy motorů pro servis",
    intro: "Číselník pro zákaznické motory — nezávislý na kategoriích našich motorů, takže sem patří i motokros a všechno ostatní, co k nám přijede. Přetažením změníš pořadí v nabídce.",
    loading: "Načítám typy motorů…",
    loadError: "Typy motorů se nepodařilo načíst.",
    retry: "Zkusit znovu",
    add: "＋ Nový typ",
    dragHint: "Přetažením změníš pořadí",
    code: "Kód",
    name: "Název",
    active: "Aktivní",
    inactive: "Neaktivní",
    actions: "Akce",
    edit: "Upravit",
    remove: "Deaktivovat",
    confirmRemove: (name: string) => `Deaktivovat typ „${name}"? Motory tohoto typu zůstanou zachované, jen zmizí z nabídky u nového motoru.`,
    newTitle: "Nový typ motoru",
    editTitle: "Upravit typ motoru",
    codeLabel: "Kód",
    codeHint: "Krátké označení, třeba ROK nebo MX125.",
    nameCsLabel: "Název česky",
    nameEnLabel: "Název anglicky",
    nameEnHint: "Prázdné = použije se český název.",
    save: "Uložit",
    saving: "Ukládám…",
    cancel: "Zrušit",
    codeRequired: "Vyplň kód.",
    nameRequired: "Vyplň český název.",
    duplicate: "Tenhle kód už v číselníku je.",
    saveError: "Uložení se nepodařilo.",
    empty: "Zatím žádné typy motorů",
    emptyHelp: "Přidej první typ, ať se dá u zákaznického motoru vybrat.",
    readOnly: "Číselník mění jen superadmin.",
  },
  en: {
    heading: "Service engine types",
    intro: "The catalog for customer engines — independent of our own engine categories, so motocross and anything else that arrives belongs here too. Drag a row to reorder the picker.",
    loading: "Loading engine types…",
    loadError: "The engine types could not be loaded.",
    retry: "Try again",
    add: "＋ New type",
    dragHint: "Drag to reorder",
    code: "Code",
    name: "Name",
    active: "Active",
    inactive: "Inactive",
    actions: "Actions",
    edit: "Edit",
    remove: "Deactivate",
    confirmRemove: (name: string) => `Deactivate type "${name}"? Its engines stay as they are, it just disappears from the picker for a new engine.`,
    newTitle: "New engine type",
    editTitle: "Edit engine type",
    codeLabel: "Code",
    codeHint: "A short label, for example ROK or MX125.",
    nameCsLabel: "Czech name",
    nameEnLabel: "English name",
    nameEnHint: "Empty = the Czech name is used.",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    codeRequired: "Fill in the code.",
    nameRequired: "Fill in the Czech name.",
    duplicate: "That code is already in the catalog.",
    saveError: "Save failed.",
    empty: "No engine types yet",
    emptyHelp: "Add the first type so it can be picked for a customer engine.",
    readOnly: "Only a superadmin can change the catalog.",
  },
} as const;

type Copy = (typeof content)[Locale];

function localized(locale: Locale, cs: string, en: string) {
  return locale === "cs" ? cs : en || cs;
}

async function api(method: string, body: unknown) {
  const response = await fetch("/api/service-engine-types", {
    method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error || "request failed");
}

export function ServiceEngineTypesSettings({ locale, role }: { locale: Locale; role: AppRole }) {
  const t = content[locale];
  const [types, setTypes] = useState<ServiceEngineType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ServiceEngineType | "new" | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const canManage = role === "superadmin";

  async function load() {
    setLoadError(false);
    try {
      const response = await fetch("/api/service-engine-types", { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = (await response.json()) as { types: ServiceEngineType[] };
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
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "";
      setError(message === "Code already exists" ? t.duplicate : t.saveError);
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
              <th>{t.code}</th><th>{t.name}</th><th>{t.active}</th>
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
                  <td><code className="settings-code">{type.code}</code></td>
                  <td><strong>{localized(locale, type.nameCs, type.nameEn)}</strong></td>
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
        <EngineTypeModal t={t} type={editing === "new" ? null : editing} saving={saving}
          onClose={() => setEditing(null)}
          onSave={(payload) => void run(() => editing === "new" ? api("POST", payload) : api("PUT", { id: editing.id, ...payload }))} />
      )}
    </section>
  );
}

function EngineTypeModal({ t, type, saving, onClose, onSave }: {
  t: Copy; type: ServiceEngineType | null; saving: boolean;
  onClose: () => void;
  onSave: (payload: { code: string; nameCs: string; nameEn: string }) => void;
}) {
  const dialogRef = useModalA11y(onClose);
  const [code, setCode] = useState(type?.code ?? "");
  const [nameCs, setNameCs] = useState(type?.nameCs ?? "");
  const [nameEn, setNameEn] = useState(type?.nameEn ?? "");
  const [formError, setFormError] = useState("");

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={dialogRef as React.RefObject<HTMLFormElement>} className="modal settings-user-modal" role="dialog" aria-modal="true" aria-labelledby="engine-type-title" tabIndex={-1}
        onSubmit={(event) => {
          event.preventDefault();
          if (!code.trim()) { setFormError(t.codeRequired); return; }
          if (!nameCs.trim()) { setFormError(t.nameRequired); return; }
          onSave({ code: code.trim(), nameCs: nameCs.trim(), nameEn: nameEn.trim() });
        }}>
        <header className="modal-header">
          <div><h2 id="engine-type-title">{type ? t.editTitle : t.newTitle}</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t.cancel}>×</button>
        </header>
        <div className="form-grid">
          <label><span>{t.codeLabel} *</span>
            <input value={code} onChange={(event) => setCode(event.target.value)} autoFocus maxLength={40} />
            <small>{t.codeHint}</small>
          </label>
          <label><span>{t.nameCsLabel} *</span>
            <input value={nameCs} onChange={(event) => setNameCs(event.target.value)} maxLength={120} />
          </label>
          <label className="full-field"><span>{t.nameEnLabel}</span>
            <input value={nameEn} onChange={(event) => setNameEn(event.target.value)} maxLength={120} />
            <small>{t.nameEnHint}</small>
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
