"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Locale = "cs" | "en";
type Role = "superadmin" | "boss" | "mechanic";
type TaskFilter = "active" | "today" | "overdue" | "done";

export type WorkItem = {
  id: string;
  kind: "task" | "reminder";
  title: string;
  description: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "done";
  dueAt: string | null;
  assigneeName: string;
  raceId: string | null;
  raceName: string;
  raceTrack: string;
  completedBy: string | null;
  completedAt: number | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
};

type RaceChoice = { id: string; name: string; track: string; startDate: string; status: string };
type MechanicChoice = { id: string; name: string };

export function TaskPage({ locale, role, currentUser }: { locale: Locale; role: Role; currentUser: string }) {
  const [tasks, setTasks] = useState<WorkItem[]>([]);
  const [races, setRaces] = useState<RaceChoice[]>([]);
  const [mechanics, setMechanics] = useState<MechanicChoice[]>([]);
  const [filter, setFilter] = useState<TaskFilter>("active");
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksResponse, racesResponse, catalogResponse] = await Promise.all([
        fetch("/api/tasks", { cache: "no-store" }),
        fetch("/api/races", { cache: "no-store" }),
        fetch("/api/catalog", { cache: "no-store" }),
      ]);
      if (!tasksResponse.ok || !racesResponse.ok || !catalogResponse.ok) throw new Error("load failed");
      const taskData = (await tasksResponse.json()) as { tasks: WorkItem[] };
      const raceData = (await racesResponse.json()) as { races: RaceChoice[] };
      const catalogData = (await catalogResponse.json()) as { mechanics: MechanicChoice[] };
      setTasks(taskData.tasks);
      setRaces(raceData.races.filter((race) => race.status !== "archived"));
      setMechanics(catalogData.mechanics);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const now = localIsoMinute(new Date());
  const today = now.slice(0, 10);
  const counts = useMemo(() => ({
    active: tasks.filter((task) => task.status !== "done").length,
    today: tasks.filter((task) => task.status !== "done" && task.dueAt?.slice(0, 10) === today).length,
    overdue: tasks.filter((task) => task.status !== "done" && Boolean(task.dueAt && task.dueAt < now)).length,
    done: tasks.filter((task) => task.status === "done").length,
  }), [now, tasks, today]);
  const visible = useMemo(() => tasks.filter((task) => {
    if (filter === "active") return task.status !== "done";
    if (filter === "done") return task.status === "done";
    if (filter === "today") return task.status !== "done" && task.dueAt?.slice(0, 10) === today;
    return task.status !== "done" && Boolean(task.dueAt && task.dueAt < now);
  }), [filter, now, tasks, today]);

  async function setStatus(task: WorkItem, status: WorkItem["status"]) {
    const response = await fetch("/api/tasks", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...task, status }),
    });
    if (!response.ok) {
      window.alert(locale === "cs" ? "Stav úkolu se nepodařilo změnit." : "Could not change the task status.");
      return;
    }
    await load();
  }

  async function remove(task: WorkItem) {
    if (role !== "superadmin") return;
    if (!window.confirm(locale === "cs" ? `Opravdu odstranit „${task.title}“?` : `Remove “${task.title}”?`)) return;
    const response = await fetch("/api/tasks", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: task.id }) });
    if (!response.ok) {
      window.alert(locale === "cs" ? "Úkol se nepodařilo odstranit." : "Could not remove the task.");
      return;
    }
    await load();
  }

  const tiles: Array<{ id: TaskFilter; cs: string; en: string; tone: string }> = [
    { id: "active", cs: "Aktivní", en: "Active", tone: "active" },
    { id: "today", cs: "Na dnešek", en: "Due today", tone: "today" },
    { id: "overdue", cs: "Po termínu", en: "Overdue", tone: "overdue" },
    { id: "done", cs: "Hotové", en: "Completed", tone: "done" },
  ];

  return <div className="tasks-page">
    <section className="panel tasks-summary">
      <div><span className="eyebrow">MM WORKFLOW</span><h2>{locale === "cs" ? "Úkoly a připomínky" : "Tasks & reminders"}</h2><p>{locale === "cs" ? "Co je potřeba udělat, kdo to řeší a do kdy." : "What needs to be done, who owns it and when it is due."}</p></div>
      <button className="primary-button" type="button" onClick={() => { setEditing(null); setFormOpen(true); }}>＋ {locale === "cs" ? "Nový úkol" : "New task"}</button>
    </section>

    <section className="task-filter-grid" aria-label={locale === "cs" ? "Filtr úkolů" : "Task filter"}>
      {tiles.map((tile) => <button key={tile.id} type="button" className={`task-filter-card tone-${tile.tone}${filter === tile.id ? " active" : ""}`} onClick={() => setFilter(tile.id)} aria-pressed={filter === tile.id}><span>{locale === "cs" ? tile.cs : tile.en}</span><strong>{counts[tile.id]}</strong></button>)}
    </section>

    <section className="panel task-list-panel">
      {loading && <div className="empty-state"><span className="spinner" /><p>{locale === "cs" ? "Načítám úkoly…" : "Loading tasks…"}</p></div>}
      {!loading && error && <div className="empty-state error-state"><b>!</b><p>{locale === "cs" ? "Úkoly se nepodařilo načíst." : "Tasks could not be loaded."}</p></div>}
      {!loading && !error && visible.length === 0 && <div className="empty-state"><span className="empty-engine">✓</span><h2>{locale === "cs" ? "V této skupině nic není." : "Nothing in this group."}</h2><p>{locale === "cs" ? "Přidej úkol nebo připomínku pomocí tlačítka nahoře." : "Add a task or reminder with the button above."}</p></div>}
      {!loading && !error && visible.map((task) => {
        const overdue = task.status !== "done" && Boolean(task.dueAt && task.dueAt < now);
        return <article key={task.id} className={`task-row priority-${task.priority}${task.status === "done" ? " completed" : ""}${overdue ? " overdue" : ""}`}>
          <button className={`task-check${task.status === "done" ? " checked" : ""}`} type="button" aria-label={task.status === "done" ? (locale === "cs" ? "Znovu otevřít" : "Reopen") : (locale === "cs" ? "Označit jako hotové" : "Mark completed")} onClick={() => { void setStatus(task, task.status === "done" ? "open" : "done"); }}>{task.status === "done" ? "✓" : ""}</button>
          <div className="task-main">
            <div className="task-title-line"><span className={`task-kind ${task.kind}`}>{task.kind === "reminder" ? (locale === "cs" ? "Připomínka" : "Reminder") : (locale === "cs" ? "Úkol" : "Task")}</span><h3>{task.title}</h3><span className={`task-priority ${task.priority}`}>{priorityLabel(task.priority, locale)}</span></div>
            {task.description && <p>{task.description}</p>}
            <div className="task-meta">
              <span className={overdue ? "danger-text" : ""}>◷ {task.dueAt ? formatDue(task.dueAt, locale) : (locale === "cs" ? "Bez termínu" : "No due date")}</span>
              <span>◎ {task.assigneeName || (locale === "cs" ? "Nepřiřazeno" : "Unassigned")}</span>
              {task.raceName && <span>⚑ {task.raceName}{task.raceTrack ? ` · ${task.raceTrack}` : ""}</span>}
              {task.status === "in_progress" && <span className="status-pill warning-pill">{locale === "cs" ? "Probíhá" : "In progress"}</span>}
              {task.status === "done" && <span className="status-pill success">{locale === "cs" ? `Dokončil: ${task.completedBy || "—"}` : `Completed by: ${task.completedBy || "—"}`}</span>}
            </div>
          </div>
          <div className="task-actions">
            {task.status !== "done" && <button type="button" onClick={() => { void setStatus(task, task.status === "in_progress" ? "open" : "in_progress"); }}>{task.status === "in_progress" ? (locale === "cs" ? "Pozastavit" : "Pause") : (locale === "cs" ? "Začít" : "Start")}</button>}
            <button type="button" onClick={() => { setEditing(task); setFormOpen(true); }}>{locale === "cs" ? "Upravit" : "Edit"}</button>
            {role === "superadmin" && <button className="delete" type="button" onClick={() => { void remove(task); }}>{locale === "cs" ? "Smazat" : "Delete"}</button>}
          </div>
        </article>;
      })}
    </section>

    {formOpen && <TaskForm locale={locale} task={editing} races={races} mechanics={mechanics} currentUser={currentUser} onClose={() => { setFormOpen(false); setEditing(null); }} onSaved={async () => { setFormOpen(false); setEditing(null); await load(); }} />}
  </div>;
}

function TaskForm({ locale, task, races, mechanics, currentUser, onClose, onSaved }: { locale: Locale; task: WorkItem | null; races: RaceChoice[]; mechanics: MechanicChoice[]; currentUser: string; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const response = await fetch("/api/tasks", { method: task ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, id: task?.id }) });
    const result = (await response.json()) as { id?: string; error?: string };
    if (!response.ok || !result.id) {
      setError(result.error || (locale === "cs" ? "Úkol se nepodařilo uložit." : "Could not save the task."));
      setSaving(false);
      return;
    }
    await onSaved();
  }

  const assignees = Array.from(new Set([currentUser, ...mechanics.map((mechanic) => mechanic.name)].filter(Boolean))).sort((a, b) => a.localeCompare(b, locale === "cs" ? "cs" : "en"));

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal task-modal" role="dialog" aria-modal="true" aria-labelledby="task-form-title">
      <div className="modal-header"><div><span className="eyebrow">MM WORKFLOW</span><h2 id="task-form-title">{task ? (locale === "cs" ? "Upravit úkol" : "Edit task") : (locale === "cs" ? "Nový úkol nebo připomínka" : "New task or reminder")}</h2></div><button className="close-button" type="button" onClick={onClose}>×</button></div>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label><span>{locale === "cs" ? "Typ" : "Type"} *</span><select name="kind" defaultValue={task?.kind ?? "task"}><option value="task">{locale === "cs" ? "Úkol" : "Task"}</option><option value="reminder">{locale === "cs" ? "Připomínka" : "Reminder"}</option></select></label>
          <label><span>{locale === "cs" ? "Priorita" : "Priority"} *</span><select name="priority" defaultValue={task?.priority ?? "normal"}><option value="low">{locale === "cs" ? "Nízká" : "Low"}</option><option value="normal">{locale === "cs" ? "Normální" : "Normal"}</option><option value="high">{locale === "cs" ? "Vysoká" : "High"}</option><option value="urgent">{locale === "cs" ? "Kritická" : "Urgent"}</option></select></label>
          <label className="full-field"><span>{locale === "cs" ? "Název" : "Title"} *</span><input name="title" defaultValue={task?.title ?? ""} placeholder={locale === "cs" ? "Např. objednat písty KZ" : "E.g. order KZ pistons"} maxLength={160} required autoFocus /></label>
          <label><span>{locale === "cs" ? "Termín" : "Due date"}</span><input name="dueAt" type="datetime-local" defaultValue={task?.dueAt ?? ""} /></label>
          <label><span>{locale === "cs" ? "Přiřazeno" : "Assigned to"}</span><select name="assigneeName" defaultValue={task?.assigneeName ?? currentUser}><option value="">{locale === "cs" ? "Nepřiřazeno" : "Unassigned"}</option>{assignees.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label><span>{locale === "cs" ? "Závod" : "Race"}</span><select name="raceId" defaultValue={task?.raceId ?? ""}><option value="">{locale === "cs" ? "Bez vazby na závod" : "No linked race"}</option>{races.map((race) => <option key={race.id} value={race.id}>{race.name} · {race.track}</option>)}</select></label>
          {task && <label><span>{locale === "cs" ? "Stav" : "Status"}</span><select name="status" defaultValue={task.status}><option value="open">{locale === "cs" ? "Otevřeno" : "Open"}</option><option value="in_progress">{locale === "cs" ? "Probíhá" : "In progress"}</option><option value="done">{locale === "cs" ? "Hotovo" : "Completed"}</option></select></label>}
          {!task && <input type="hidden" name="status" value="open" />}
          <label className="full-field"><span>{locale === "cs" ? "Popis / poznámka" : "Description / note"}</span><textarea name="description" defaultValue={task?.description ?? ""} rows={4} placeholder={locale === "cs" ? "Podrobnosti, co je potřeba udělat…" : "Details of what needs to be done…"} /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><span className="modal-actions-spacer" /><button className="secondary-compact" type="button" onClick={onClose} disabled={saving}>{locale === "cs" ? "Zrušit" : "Cancel"}</button><button className="primary-button" type="submit" disabled={saving}>{saving ? (locale === "cs" ? "Ukládám…" : "Saving…") : (locale === "cs" ? "Uložit" : "Save")}</button></div>
      </form>
    </section>
  </div>;
}

function localIsoMinute(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function priorityLabel(priority: WorkItem["priority"], locale: Locale) {
  const labels = { low: ["Nízká", "Low"], normal: ["Normální", "Normal"], high: ["Vysoká", "High"], urgent: ["Kritická", "Urgent"] } as const;
  return labels[priority][locale === "cs" ? 0 : 1];
}

function formatDue(value: string, locale: Locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
