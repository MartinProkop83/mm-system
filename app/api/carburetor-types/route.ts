import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";

const categories = new Set(["BABY", "MINI", "MINI U10", "MINI GR3", "OKJ", "OKN-J", "OKN", "OK", "KZ"]);
type Payload = { id?: string; brand?: string; model?: string; categories?: unknown; notes?: string };

function clean(value: unknown, max = 160) { return String(value ?? "").trim().slice(0, max); }
function parseCategories(value: unknown) {
  let values: unknown = value;
  if (typeof value === "string") { try { values = JSON.parse(value); } catch { values = []; } }
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((item) => clean(item, 20).toUpperCase()).filter((item) => categories.has(item)))];
}

export async function GET() {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const rows = await getD1().prepare(`SELECT id, brand, model, categories, notes, created_at AS createdAt, updated_at AS updatedAt FROM carburetor_types WHERE archived_at IS NULL ORDER BY brand, model`).all<Record<string, unknown>>();
  return Response.json({ carburetorTypes: rows.results.map((row) => ({ ...row, categories: parseCategories(row.categories) })) });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  const validated = validate(payload);
  if (validated instanceof Response) return validated;
  await ensureRuntimeSchema();
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await getD1().batch([
      getD1().prepare("INSERT INTO carburetor_types (id, brand, model, categories, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, validated.brand, validated.model, JSON.stringify(validated.categories), validated.notes, user.email, now, now),
      getD1().prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'create', 'carburetorType', ?, ?, ?)").bind(crypto.randomUUID(), user.email, id, JSON.stringify(validated), now),
    ]);
  } catch (error) {
    if ((error instanceof Error ? error.message : "").toLowerCase().includes("unique")) return Response.json({ error: "Carburetor type already exists" }, { status: 409 });
    return Response.json({ error: "Could not save carburetor type" }, { status: 500 });
  }
  return Response.json({ id }, { status: 201 });
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Type id is required" }, { status: 400 });
  const validated = validate(payload);
  if (validated instanceof Response) return validated;
  await ensureRuntimeSchema();
  const existing = await getD1().prepare("SELECT id FROM carburetor_types WHERE id = ? AND archived_at IS NULL").bind(id).first();
  if (!existing) return Response.json({ error: "Carburetor type not found" }, { status: 404 });
  const now = Date.now();
  try {
    await getD1().prepare("UPDATE carburetor_types SET brand = ?, model = ?, categories = ?, notes = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(validated.brand, validated.model, JSON.stringify(validated.categories), validated.notes, now, id).run();
  } catch (error) {
    if ((error instanceof Error ? error.message : "").toLowerCase().includes("unique")) return Response.json({ error: "Carburetor type already exists" }, { status: 409 });
    return Response.json({ error: "Could not update carburetor type" }, { status: 500 });
  }
  return Response.json({ id });
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const payload = await readPayload(request);
  if (payload instanceof Response) return payload;
  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Type id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  const inUse = await getD1().prepare("SELECT code FROM carburetors WHERE carburetor_type_id = ? AND archived_at IS NULL LIMIT 1").bind(id).first<{ code: string }>();
  if (inUse) return Response.json({ error: `Type is used by ${inUse.code}` }, { status: 409 });
  const now = Date.now();
  const result = await getD1().prepare("UPDATE carburetor_types SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL").bind(now, now, id).run();
  if (!result.meta.changes) return Response.json({ error: "Carburetor type not found" }, { status: 404 });
  return Response.json({ id });
}

function validate(payload: Payload) {
  const brand = clean(payload.brand, 80);
  const model = clean(payload.model, 80);
  const selected = parseCategories(payload.categories);
  if (!brand || !model) return Response.json({ error: "Brand and model are required" }, { status: 400 });
  if (!selected.length) return Response.json({ error: "At least one category is required" }, { status: 400 });
  return { brand, model, categories: selected, notes: clean(payload.notes, 1000) };
}

async function readPayload(request: Request): Promise<Payload | Response> {
  try { return await request.json() as Payload; }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
}
