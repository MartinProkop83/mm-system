import type { getD1 } from "../db";
import { AUTO_SERVICE_ON_RACE_ENGINE_FAMILIES } from "./engine-family-rules";

const AUTO_SERVICE_ACTOR_EMAIL = "system";

type DueRow = {
  engineId: string;
  raceId: string;
  raceName: string;
};

/**
 * MINI-family engines (Baby/U10/GR3) get flagged for a rebuild after every single completed
 * race they raced in — not after N hours, since that family doesn't track engine hours at all.
 * Each (engine, race) pair is applied at most once: engine_auto_service_log's unique index makes
 * the INSERT a no-op on a repeat run, so a mechanic who manually reverts the status to "ready"
 * isn't overridden again on the next page load — only a *new* race for that engine re-triggers it.
 */
export async function applyMiniAutoService(d1: ReturnType<typeof getD1>) {
  const families = AUTO_SERVICE_ON_RACE_ENGINE_FAMILIES;
  if (families.length === 0) return;

  const placeholders = families.map(() => "?").join(", ");
  const due = await d1.prepare(`
    SELECT DISTINCT eng.id AS engineId, r.id AS raceId, r.name AS raceName
    FROM race_entries re
    JOIN races r ON r.id = re.race_id
    JOIN engines eng ON eng.id IN (re.engine_1_id, re.engine_2_id, re.engine_3_id)
    WHERE r.status != 'archived'
      AND r.end_date < date('now')
      AND eng.archived_at IS NULL
      AND eng.family IN (${placeholders})
  `).bind(...families).all<DueRow>();

  for (const row of due.results) {
    const now = Date.now();
    const inserted = await d1.prepare(`
      INSERT INTO engine_auto_service_log (id, engine_id, race_id, race_name_snapshot, applied_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (engine_id, race_id) DO NOTHING
    `).bind(crypto.randomUUID(), row.engineId, row.raceId, row.raceName, now).run();

    if (inserted.meta.changes === 0) continue;

    await d1.batch([
      d1.prepare(`
        UPDATE engines SET status = 'service', updated_at = ? WHERE id = ? AND archived_at IS NULL
      `).bind(now, row.engineId),
      d1.prepare(`
        INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
        VALUES (?, ?, 'engine_auto_service', 'engine', ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        AUTO_SERVICE_ACTOR_EMAIL,
        row.engineId,
        JSON.stringify({ raceId: row.raceId, raceName: row.raceName }),
        now,
      ),
    ]);
  }
}
