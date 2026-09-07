import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";

type ChecklistItemPayload = { section?: string; partNumber?: string; name?: string; quantity?: number };
type ChecklistPayload = { id?: string; name?: string; notes?: string; items?: ChecklistItemPayload[] };
type ChecklistItemRow = { id: string; checklistId: string; section: string; partNumber: string; name: string; quantity: number };

function clean(value: unknown, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

export async function GET() {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const d1 = getD1();
  const checklists = await d1.prepare(
    "SELECT id, name, notes, created_at AS createdAt, updated_at AS updatedAt FROM checklists WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE"
  ).all<{ id: string; name: string; notes: string; createdAt: number; updatedAt: number }>();
  const items = await d1.prepare(
    "SELECT id, checklist_id AS checklistId, section, part_number AS partNumber, name, quantity FROM checklist_items ORDER BY checklist_id, sort_order"
  ).all<ChecklistItemRow>();
  const itemRows: ChecklistItemRow[] = items.results;
  const byChecklist = new Map<string, ChecklistItemRow[]>();
  for (const item of itemRows) {
    const list = byChecklist.get(item.checklistId) ?? [];
    list.push(item);
    byChecklist.set(item.checklistId, list);
  }
  const checklistRows: Array<{ id: string; name: string; notes: string; createdAt: number; updatedAt: number }> = checklists.results;
  return Response.json({ checklists: checklistRows.map((checklist) => ({ ...checklist, items: byChecklist.get(checklist.id) ?? [] })) });
}

export async function POST(request: Request) { return authorizeAndSave(request, false); }
export async function PUT(request: Request) { return authorizeAndSave(request, true); }

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
  await ensureRuntimeSchema();
  let payload: ChecklistPayload;
  try { payload = await request.json() as ChecklistPayload; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = clean(payload.id, 80); const now = Date.now();
  const result = await getD1().prepare("UPDATE checklists SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(now, now, id).run();
  return result.meta.changes ? Response.json({ id }) : Response.json({ error: "Checklist not found" }, { status: 404 });
}

async function authorizeAndSave(request: Request, editing: boolean) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  let payload: ChecklistPayload;
  try { payload = await request.json() as ChecklistPayload; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const id = editing ? clean(payload.id, 80) : crypto.randomUUID();
  const name = clean(payload.name, 160);
  const notes = clean(payload.notes, 1000);
  if (!name) return Response.json({ error: "Checklist name is required" }, { status: 400 });
  if (!Array.isArray(payload.items)) return Response.json({ error: "Add at least one item" }, { status: 400 });

  const items: Array<{ section: string; partNumber: string; name: string; quantity: number }> = [];
  for (const raw of payload.items) {
    const itemName = clean(raw?.name, 200);
    if (!itemName) continue;
    const quantity = Number(raw?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100_000) return Response.json({ error: "Invalid item quantity" }, { status: 400 });
    items.push({ section: clean(raw?.section, 120), partNumber: clean(raw?.partNumber, 80), name: itemName, quantity });
  }
  if (!items.length) return Response.json({ error: "Add at least one item" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  if (editing) {
    const existing = await d1.prepare("SELECT id FROM checklists WHERE id = ? AND archived_at IS NULL").bind(id).first();
    if (!existing) return Response.json({ error: "Checklist not found" }, { status: 404 });
  }
  const duplicate = await d1.prepare("SELECT id FROM checklists WHERE LOWER(name) = LOWER(?) AND archived_at IS NULL AND id != ?").bind(name, id).first();
  if (duplicate) return Response.json({ error: "Checklist already exists" }, { status: 409 });

  const now = Date.now();
  const statements = editing
    ? [
        d1.prepare("UPDATE checklists SET name = ?, notes = ?, updated_at = ? WHERE id = ?").bind(name, notes, now, id),
        d1.prepare("DELETE FROM checklist_items WHERE checklist_id = ?").bind(id),
      ]
    : [d1.prepare("INSERT INTO checklists (id, name, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, name, notes, user.email, now, now)];
  items.forEach((item, index) => {
    statements.push(d1.prepare(
      "INSERT INTO checklist_items (id, checklist_id, section, part_number, name, quantity, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), id, item.section, item.partNumber, item.name, item.quantity, index));
  });
  await d1.batch(statements);
  return Response.json({ id }, { status: editing ? 200 : 201 });
}
