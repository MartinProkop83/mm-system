import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";

type WorkItemPayload = {
  id?: string;
  kind?: string;
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  dueAt?: string | null;
  assigneeName?: string;
  raceId?: string | null;
};

const kinds = new Set(["task", "reminder"]);
const priorities = new Set(["low", "normal", "high", "urgent"]);
const statuses = new Set(["open", "in_progress", "done"]);

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function normalize(payload: WorkItemPayload) {
  const kind = clean(payload.kind, 20) || "task";
  const title = clean(payload.title, 160);
  const description = clean(payload.description, 2500);
  const priority = clean(payload.priority, 20) || "normal";
  const status = clean(payload.status, 20) || "open";
  const dueAt = clean(payload.dueAt, 30) || null;
  const assigneeName = clean(payload.assigneeName, 120);
  const raceId = clean(payload.raceId, 80) || null;

  let error = "";
  if (!title) error = "Title is required";
  else if (!kinds.has(kind)) error = "Invalid task type";
  else if (!priorities.has(priority)) error = "Invalid priority";
  else if (!statuses.has(status)) error = "Invalid status";
  else if (dueAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dueAt)) error = "Invalid due date";

  return { kind, title, description, priority, status, dueAt, assigneeName, raceId, error };
}

async function readPayload(request: Request) {
  try {
    return (await request.json()) as WorkItemPayload;
  } catch {
    return null;
  }
}

async function validRace(raceId: string | null) {
  if (!raceId) return true;
  const row = await getD1().prepare("SELECT id FROM races WHERE id = ? AND status != 'archived'").bind(raceId).first();
  return Boolean(row);
}

export async function GET() {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const result = await getD1().prepare(`
    SELECT w.id, w.kind, w.title, w.description, w.priority, w.status,
           w.due_at AS dueAt, w.assignee_name AS assigneeName, w.race_id AS raceId,
           COALESCE(r.name, '') AS raceName, COALESCE(r.track, '') AS raceTrack,
           w.completed_by AS completedBy, w.completed_at AS completedAt,
           w.created_by AS createdBy, w.created_at AS createdAt, w.updated_at AS updatedAt
    FROM work_items w
    LEFT JOIN races r ON r.id = w.race_id
    WHERE w.archived_at IS NULL
    ORDER BY
      CASE w.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
      CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      CASE WHEN w.due_at IS NULL THEN 1 ELSE 0 END,
      w.due_at,
      w.updated_at DESC
  `).all();
  return Response.json({ tasks: result.results });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const item = normalize(payload);
  if (item.error) return Response.json({ error: item.error }, { status: 400 });
  await ensureRuntimeSchema();
  if (!(await validRace(item.raceId))) return Response.json({ error: "Race not found" }, { status: 400 });

  const id = crypto.randomUUID();
  const now = Date.now();
  const completedBy = item.status === "done" ? user.fullName : null;
  const completedAt = item.status === "done" ? now : null;
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`
      INSERT INTO work_items (
        id, kind, title, description, priority, status, due_at, assignee_name,
        race_id, completed_by, completed_at, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, item.kind, item.title, item.description, item.priority, item.status, item.dueAt, item.assigneeName, item.raceId, completedBy, completedAt, user.email, now, now),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'create', 'task', ?, ?, ?)")
      .bind(crypto.randomUUID(), user.email, id, JSON.stringify(item), now),
  ]);
  return Response.json({ id }, { status: 201 });
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Task id is required" }, { status: 400 });
  const item = normalize(payload);
  if (item.error) return Response.json({ error: item.error }, { status: 400 });
  await ensureRuntimeSchema();
  if (!(await validRace(item.raceId))) return Response.json({ error: "Race not found" }, { status: 400 });

  const d1 = getD1();
  const existing = await d1.prepare("SELECT * FROM work_items WHERE id = ? AND archived_at IS NULL").bind(id).first<Record<string, unknown>>();
  if (!existing) return Response.json({ error: "Task not found" }, { status: 404 });
  const now = Date.now();
  const completedBy = item.status === "done" ? (existing.completed_by || user.fullName) : null;
  const completedAt = item.status === "done" ? (existing.completed_at || now) : null;
  await d1.batch([
    d1.prepare(`
      UPDATE work_items SET kind = ?, title = ?, description = ?, priority = ?, status = ?,
        due_at = ?, assignee_name = ?, race_id = ?, completed_by = ?, completed_at = ?, updated_at = ?
      WHERE id = ? AND archived_at IS NULL
    `).bind(item.kind, item.title, item.description, item.priority, item.status, item.dueAt, item.assigneeName, item.raceId, completedBy, completedAt, now, id),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'update', 'task', ?, ?, ?)")
      .bind(crypto.randomUUID(), user.email, id, JSON.stringify({ before: existing, after: item, actor: user.fullName }), now),
  ]);
  return Response.json({ id });
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Task id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  const now = Date.now();
  const d1 = getD1();
  const result = await d1.prepare("UPDATE work_items SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(now, now, id).run();
  if (!result.meta.changes) return Response.json({ error: "Task not found" }, { status: 404 });
  await d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'archive', 'task', ?, '{}', ?)")
    .bind(crypto.randomUUID(), user.email, id, now).run();
  return Response.json({ id });
}
