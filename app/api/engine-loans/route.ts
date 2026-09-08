import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser, type AppUser } from "../../server-auth";

type RecipientType = "customer" | "team" | "driver";
const recipientTables: Record<RecipientType, string> = { customer: "customers", team: "teams", driver: "drivers" };

type LoanRow = {
  id: string;
  engineId: string;
  engineCode?: string;
  recipientType: RecipientType;
  recipientId: string;
  recipientName: string;
  startDate: string;
  expectedReturnDate: string;
  actualReturnDate: string | null;
  notes: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
};

type Payload = {
  id?: string;
  engineId?: string;
  recipientType?: string;
  recipientId?: string;
  startDate?: string;
  expectedReturnDate?: string;
  actualReturnDate?: string | null;
  notes?: string;
};

function clean(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function intervalsOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA <= endB && endA >= startB;
}

function assertWritable(user: AppUser) {
  return user.role === "mechanic" ? "Forbidden" : "";
}

async function findRaceConflict(engineId: string, startDate: string, endDate: string) {
  const d1 = getD1();
  const rows = await d1.prepare(`
    SELECT r.id AS raceId, r.name, r.start_date AS startDate, r.end_date AS endDate
    FROM race_entries e JOIN races r ON r.id = e.race_id
    WHERE (e.engine_1_id = ? OR e.engine_2_id = ? OR e.engine_3_id = ?) AND r.status != 'archived'
  `).bind(engineId, engineId, engineId).all<{ raceId: string; name: string; startDate: string; endDate: string }>();
  const extras = await d1.prepare(`
    SELECT r.id AS raceId, r.name, r.start_date AS startDate, r.end_date AS endDate
    FROM race_extras x JOIN races r ON r.id = x.race_id
    WHERE x.resource_type = 'engine' AND x.resource_id = ? AND r.status != 'archived'
  `).bind(engineId).all<{ raceId: string; name: string; startDate: string; endDate: string }>();
  const conflict = [...rows.results, ...extras.results].find((row) => intervalsOverlap(row.startDate, row.endDate, startDate, endDate));
  return conflict ? `Engine is already assigned to ${conflict.name}` : "";
}

async function findLoanOverlapConflict(engineId: string, startDate: string, endDate: string, excludeLoanId: string) {
  const rows = await getD1().prepare(`
    SELECT id, recipient_name_snapshot AS recipientName, start_date AS startDate, expected_return_date AS expectedReturnDate
    FROM engine_loans
    WHERE engine_id = ? AND actual_return_date IS NULL AND id != ?
  `).bind(engineId, excludeLoanId).all<{ id: string; recipientName: string; startDate: string; expectedReturnDate: string }>();
  const conflict = rows.results.find((row) => intervalsOverlap(row.startDate, row.expectedReturnDate, startDate, endDate));
  return conflict ? `Engine is currently on loan to ${conflict.recipientName} until ${conflict.expectedReturnDate}` : "";
}

async function resolveRecipient(recipientType: string, recipientId: string) {
  if (!["customer", "team", "driver"].includes(recipientType)) return null;
  const table = recipientTables[recipientType as RecipientType];
  return getD1().prepare(`SELECT id, name FROM ${table} WHERE id = ? AND archived_at IS NULL`).bind(recipientId).first<{ id: string; name: string }>();
}

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();

  const engineId = new URL(request.url).searchParams.get("engineId")?.trim() ?? "";
  const d1 = getD1();
  const query = engineId
    ? d1.prepare(`
        SELECT l.id, l.engine_id AS engineId, e.code AS engineCode, l.recipient_type AS recipientType, l.recipient_id AS recipientId,
               l.recipient_name_snapshot AS recipientName, l.start_date AS startDate, l.expected_return_date AS expectedReturnDate,
               l.actual_return_date AS actualReturnDate, l.notes, l.created_by AS createdBy, l.created_at AS createdAt, l.updated_at AS updatedAt
        FROM engine_loans l JOIN engines e ON e.id = l.engine_id WHERE l.engine_id = ? ORDER BY l.start_date DESC
      `).bind(engineId)
    : d1.prepare(`
        SELECT l.id, l.engine_id AS engineId, e.code AS engineCode, l.recipient_type AS recipientType, l.recipient_id AS recipientId,
               l.recipient_name_snapshot AS recipientName, l.start_date AS startDate, l.expected_return_date AS expectedReturnDate,
               l.actual_return_date AS actualReturnDate, l.notes, l.created_by AS createdBy, l.created_at AS createdAt, l.updated_at AS updatedAt
        FROM engine_loans l JOIN engines e ON e.id = l.engine_id WHERE l.actual_return_date IS NULL ORDER BY l.expected_return_date ASC
      `);
  const loans = await query.all<LoanRow>();
  return Response.json({ loans: loans.results });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const writeError = assertWritable(user);
  if (writeError) return Response.json({ error: writeError }, { status: 403 });

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const engineId = clean(payload.engineId, 80);
  const startDate = clean(payload.startDate, 10);
  const expectedReturnDate = clean(payload.expectedReturnDate, 10);
  if (!engineId || !isDate(startDate) || !isDate(expectedReturnDate) || startDate > expectedReturnDate) {
    return Response.json({ error: "Engine and valid start/return dates are required" }, { status: 400 });
  }

  await ensureRuntimeSchema();
  const d1 = getD1();
  const engine = await d1.prepare("SELECT id, code FROM engines WHERE id = ? AND archived_at IS NULL").bind(engineId).first<{ id: string; code: string }>();
  if (!engine) return Response.json({ error: "Engine not found" }, { status: 404 });

  const recipient = await resolveRecipient(clean(payload.recipientType, 20), clean(payload.recipientId, 80));
  if (!recipient) return Response.json({ error: "Recipient not found" }, { status: 404 });

  const raceConflict = await findRaceConflict(engineId, startDate, expectedReturnDate);
  if (raceConflict) return Response.json({ error: raceConflict }, { status: 409 });
  const loanConflict = await findLoanOverlapConflict(engineId, startDate, expectedReturnDate, "");
  if (loanConflict) return Response.json({ error: loanConflict }, { status: 409 });

  const id = crypto.randomUUID();
  const now = Date.now();
  const notes = clean(payload.notes, 1000);
  await d1.batch([
    d1.prepare(`
      INSERT INTO engine_loans (id, engine_id, recipient_type, recipient_id, recipient_name_snapshot, start_date, expected_return_date, notes, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, engineId, payload.recipientType, recipient.id, recipient.name, startDate, expectedReturnDate, notes, user.email, now, now),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'create', 'engine_loan', ?, ?, ?)")
      .bind(crypto.randomUUID(), user.email, id, JSON.stringify({ engineId, engineCode: engine.code, recipientType: payload.recipientType, recipientName: recipient.name, startDate, expectedReturnDate }), now),
  ]);
  return Response.json({ id }, { status: 201 });
}

export async function PUT(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const writeError = assertWritable(user);
  if (writeError) return Response.json({ error: writeError }, { status: 403 });

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = clean(payload.id, 80);
  if (!id) return Response.json({ error: "Loan id is required" }, { status: 400 });

  const d1 = getD1();
  const existing = await d1.prepare(`
    SELECT id, engine_id AS engineId, start_date AS startDate, expected_return_date AS expectedReturnDate,
           actual_return_date AS actualReturnDate, recipient_name_snapshot AS recipientName
    FROM engine_loans WHERE id = ?
  `).bind(id).first<{ id: string; engineId: string; startDate: string; expectedReturnDate: string; actualReturnDate: string | null; recipientName: string }>();
  if (!existing) return Response.json({ error: "Loan not found" }, { status: 404 });

  const now = Date.now();

  // Mark returned: only actualReturnDate is provided.
  if (payload.actualReturnDate !== undefined) {
    const actualReturnDate = payload.actualReturnDate ? clean(payload.actualReturnDate, 10) : null;
    if (actualReturnDate && !isDate(actualReturnDate)) return Response.json({ error: "Valid return date is required" }, { status: 400 });
    await d1.batch([
      d1.prepare("UPDATE engine_loans SET actual_return_date = ?, updated_at = ? WHERE id = ?").bind(actualReturnDate, now, id),
      d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, 'engine_loan', ?, ?, ?)")
        .bind(crypto.randomUUID(), user.email, actualReturnDate ? "return" : "unreturn", id, JSON.stringify({ recipientName: existing.recipientName, actualReturnDate }), now),
    ]);
    return Response.json({ id, actualReturnDate });
  }

  // Extend: change expectedReturnDate.
  const expectedReturnDate = clean(payload.expectedReturnDate, 10);
  if (!isDate(expectedReturnDate) || expectedReturnDate < existing.startDate) return Response.json({ error: "Valid new return date is required" }, { status: 400 });
  const loanConflict = await findLoanOverlapConflict(existing.engineId, existing.startDate, expectedReturnDate, id);
  if (loanConflict) return Response.json({ error: loanConflict }, { status: 409 });
  const raceConflict = await findRaceConflict(existing.engineId, existing.startDate, expectedReturnDate);
  if (raceConflict) return Response.json({ error: raceConflict }, { status: 409 });

  await d1.batch([
    d1.prepare("UPDATE engine_loans SET expected_return_date = ?, updated_at = ? WHERE id = ?").bind(expectedReturnDate, now, id),
    d1.prepare("INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'extend', 'engine_loan', ?, ?, ?)")
      .bind(crypto.randomUUID(), user.email, id, JSON.stringify({ recipientName: existing.recipientName, from: existing.expectedReturnDate, to: expectedReturnDate }), now),
  ]);
  return Response.json({ id, expectedReturnDate });
}
