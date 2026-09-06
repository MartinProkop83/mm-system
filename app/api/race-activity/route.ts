import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";

type ActivityRow = { id: string; actorEmail: string; action: string; entityType: string; entityId: string; details: string; createdAt: number };

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const raceId = new URL(request.url).searchParams.get("raceId")?.trim() ?? "";
  if (!raceId) return Response.json({ error: "Race id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  const d1 = getD1();
  const race = await d1.prepare("SELECT id FROM races WHERE id = ?").bind(raceId).first();
  if (!race) return Response.json({ error: "Race not found" }, { status: 404 });
  const rows = await d1.prepare(`
    SELECT id, actor_email AS actorEmail, action, entity_type AS entityType, entity_id AS entityId, details, created_at AS createdAt
    FROM audit_logs
    WHERE (entity_type = 'race' AND entity_id = ?1)
       OR details LIKE '%"raceId":"' || ?1 || '"%'
       OR details LIKE '%"race_id":"' || ?1 || '"%'
    ORDER BY created_at DESC
    LIMIT 200
  `).bind(raceId).all<ActivityRow>();
  const activityRows: ActivityRow[] = rows.results;
  const activity = activityRows.map((row) => {
    let details: unknown = null;
    try { details = JSON.parse(row.details); } catch { details = null; }
    return { id: row.id, actorEmail: row.actorEmail, action: row.action, entityType: row.entityType, createdAt: Number(row.createdAt), details };
  });
  return Response.json({ activity });
}
