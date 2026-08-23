import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";

type FollowupPayload = {
  raceId?: string;
  nextRace?: string;
  consumed?: string;
  missing?: string;
  otherNotes?: string;
};

type RaceRow = { id: string; status: string };

function clean(value: unknown, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

async function getRace(raceId: string) {
  return getD1().prepare("SELECT id, status FROM races WHERE id = ? AND status != 'archived'").bind(raceId).first<RaceRow>();
}

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const raceId = clean(new URL(request.url).searchParams.get("raceId"), 80);
  if (!raceId) return Response.json({ error: "Race id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  if (!await getRace(raceId)) return Response.json({ error: "Race not found" }, { status: 404 });
  const notes = await getD1().prepare(`
    SELECT race_id AS raceId, next_race AS nextRace, consumed, missing,
           other_notes AS otherNotes, updated_by AS updatedBy, updated_at AS updatedAt
    FROM race_followup_notes WHERE race_id = ?
  `).bind(raceId).first();
  return Response.json({ notes: notes ?? { raceId, nextRace: "", consumed: "", missing: "", otherNotes: "" } });
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let payload: FollowupPayload;
  try {
    payload = await request.json() as FollowupPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const raceId = clean(payload.raceId, 80);
  if (!raceId) return Response.json({ error: "Race id is required" }, { status: 400 });
  await ensureRuntimeSchema();
  const race = await getRace(raceId);
  if (!race) return Response.json({ error: "Race not found" }, { status: 404 });
  if (race.status === "completed" && user.role !== "superadmin") {
    return Response.json({ error: "Completed races can only be corrected by superadmin" }, { status: 403 });
  }

  const nextRace = clean(payload.nextRace);
  const consumed = clean(payload.consumed);
  const missing = clean(payload.missing);
  const otherNotes = clean(payload.otherNotes);
  const now = Date.now();
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`
      INSERT INTO race_followup_notes (race_id, next_race, consumed, missing, other_notes, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(race_id) DO UPDATE SET
        next_race = excluded.next_race,
        consumed = excluded.consumed,
        missing = excluded.missing,
        other_notes = excluded.other_notes,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `).bind(raceId, nextRace, consumed, missing, otherNotes, user.email, now),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'update', 'race_followup_notes', ?, ?, ?)")
      .bind(crypto.randomUUID(), user.email, raceId, JSON.stringify({ nextRace, consumed, missing, otherNotes }), now),
  ]);
  return Response.json({ notes: { raceId, nextRace, consumed, missing, otherNotes, updatedBy: user.email, updatedAt: now } });
}
