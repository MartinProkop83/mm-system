import { env } from "cloudflare:workers";
import { getAssetsBucket, getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";

const importableTables = new Set([
  "app_users",
  "audit_logs",
  "carburetor_service_entries",
  "carburetor_types",
  "carburetors",
  "circuits",
  "clothing_items",
  "customers",
  "drivers",
  "engine_service_entries",
  "engine_usage_logs",
  "engines",
  "inventory_parts",
  "mechanic_clothing_assignments",
  "mechanics",
  "race_accommodations",
  "race_car_rentals",
  "race_categories",
  "race_deliveries",
  "race_entries",
  "race_entry_finance",
  "race_extras",
  "race_flights",
  "race_followup_notes",
  "race_mechanics",
  "race_templates",
  "race_vehicles",
  "races",
  "sale_items",
  "sales",
  "service_catalog",
  "teams",
  "travel_attachments",
  "vehicles",
  "work_items",
]);

type RowsPayload = {
  mode: "rows";
  table: string;
  columns: string[];
  rows: unknown[][];
};

type ObjectPayload = {
  mode: "object";
  key: string;
  contentType: string;
  data: string;
};

type CleanupPayload = { mode: "cleanup" };

export async function POST(request: Request) {
  const expectedToken = (env as unknown as { MM_DATA_IMPORT_TOKEN?: string }).MM_DATA_IMPORT_TOKEN;
  if (!expectedToken || request.headers.get("authorization") !== `Bearer ${expectedToken}`) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const payload = await request.json().catch(() => null) as RowsPayload | ObjectPayload | CleanupPayload | null;
  if (!payload) return Response.json({ error: "Invalid payload" }, { status: 400 });
  await ensureRuntimeSchema();

  if (payload.mode === "rows") {
    if (!importableTables.has(payload.table)) return Response.json({ error: "Table is not importable" }, { status: 400 });
    if (!payload.columns.length || payload.columns.some((column) => !/^[a-z][a-z0-9_]*$/.test(column))) {
      return Response.json({ error: "Invalid columns" }, { status: 400 });
    }
    if (!payload.rows.length || payload.rows.length > 50 || payload.rows.some((row) => row.length !== payload.columns.length)) {
      return Response.json({ error: "Invalid rows" }, { status: 400 });
    }

    const quotedTable = `"${payload.table}"`;
    const quotedColumns = payload.columns.map((column) => `"${column}"`).join(", ");
    const placeholders = payload.columns.map(() => "?").join(", ");
    const sql = `INSERT OR REPLACE INTO ${quotedTable} (${quotedColumns}) VALUES (${placeholders})`;
    await getD1().batch(payload.rows.map((row) => getD1().prepare(sql).bind(...row)));
    return Response.json({ imported: payload.rows.length, table: payload.table });
  }

  if (payload.mode === "object") {
    if (!payload.key || payload.key.length > 500 || payload.key.includes("..") || !payload.data) {
      return Response.json({ error: "Invalid object" }, { status: 400 });
    }
    const binary = atob(payload.data);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    await getAssetsBucket().put(payload.key, bytes, {
      httpMetadata: { contentType: payload.contentType || "application/octet-stream" },
    });
    return Response.json({ key: payload.key, size: bytes.byteLength });
  }

  if (payload.mode === "cleanup") {
    await getD1()
      .prepare("DELETE FROM app_users WHERE email IN (?, ?)")
      .bind("sites-screenshot-service-noreply@chatgpt.com", "martin@local.mm")
      .run();
    return Response.json({ cleaned: true });
  }

  return Response.json({ error: "Unsupported operation" }, { status: 400 });
}
