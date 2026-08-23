import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { type AppRole, getAppUser } from "../../server-auth";

type UserPayload = {
  id?: unknown;
  email?: unknown;
  fullName?: unknown;
  role?: unknown;
  locale?: unknown;
  isActive?: unknown;
};

type UserRow = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  locale: "cs" | "en";
  isActive: number | boolean;
  createdAt: number;
  updatedAt: number;
};

const roles = new Set<AppRole>(["superadmin", "boss", "mechanic"]);
const locales = new Set(["cs", "en"]);

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeEmail(value: unknown) {
  return clean(value, 254).toLowerCase();
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function readPayload(request: Request) {
  try {
    return (await request.json()) as UserPayload;
  } catch {
    return null;
  }
}

async function requireSuperadmin() {
  const user = await getAppUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (user.role !== "superadmin") return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

function mapUser(row: UserRow) {
  return {
    ...row,
    isActive: Boolean(row.isActive),
  };
}

export async function GET() {
  const auth = await requireSuperadmin();
  if ("error" in auth) return auth.error;

  await ensureRuntimeSchema();
  const result = await getD1().prepare(`
    SELECT id, email, full_name AS fullName, role, locale,
           is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
    FROM app_users
    ORDER BY is_active DESC, full_name COLLATE NOCASE, email COLLATE NOCASE
  `).all<UserRow>();

  return Response.json({ users: result.results.map(mapUser), currentUserId: auth.user.id });
}

export async function POST(request: Request) {
  const auth = await requireSuperadmin();
  if ("error" in auth) return auth.error;

  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const email = normalizeEmail(payload.email);
  const fullName = clean(payload.fullName, 120);
  const role = clean(payload.role, 30) as AppRole;
  const locale = clean(payload.locale, 10) || "cs";

  if (!validEmail(email)) return Response.json({ error: "Invalid email" }, { status: 400 });
  if (fullName.length < 2) return Response.json({ error: "Name is required" }, { status: 400 });
  if (!roles.has(role)) return Response.json({ error: "Invalid role" }, { status: 400 });
  if (!locales.has(locale)) return Response.json({ error: "Invalid locale" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  const existing = await d1.prepare("SELECT id FROM app_users WHERE email = ? LIMIT 1").bind(email).first();
  if (existing) return Response.json({ error: "User already exists" }, { status: 409 });

  const id = crypto.randomUUID();
  const now = Date.now();
  await d1.batch([
    d1.prepare(`
      INSERT INTO app_users (id, email, full_name, role, locale, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(id, email, fullName, role, locale, now, now),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'create', 'app_user', ?, ?, ?)
    `).bind(crypto.randomUUID(), auth.user.email, id, JSON.stringify({ email, fullName, role, locale, isActive: true }), now),
  ]);

  return Response.json({
    user: { id, email, fullName, role, locale, isActive: true, createdAt: now, updatedAt: now },
  }, { status: 201 });
}

export async function PUT(request: Request) {
  const auth = await requireSuperadmin();
  if ("error" in auth) return auth.error;

  const payload = await readPayload(request);
  if (!payload) return Response.json({ error: "Invalid JSON" }, { status: 400 });

  const id = clean(payload.id, 80);
  const fullName = clean(payload.fullName, 120);
  const role = clean(payload.role, 30) as AppRole;
  const locale = clean(payload.locale, 10) || "cs";
  const isActive = payload.isActive !== false;

  if (!id) return Response.json({ error: "User id is required" }, { status: 400 });
  if (fullName.length < 2) return Response.json({ error: "Name is required" }, { status: 400 });
  if (!roles.has(role)) return Response.json({ error: "Invalid role" }, { status: 400 });
  if (!locales.has(locale)) return Response.json({ error: "Invalid locale" }, { status: 400 });

  await ensureRuntimeSchema();
  const d1 = getD1();
  const existing = await d1.prepare(`
    SELECT id, email, full_name AS fullName, role, locale,
           is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
    FROM app_users WHERE id = ? LIMIT 1
  `).bind(id).first<UserRow>();
  if (!existing) return Response.json({ error: "User not found" }, { status: 404 });

  if (id === auth.user.id && (role !== "superadmin" || !isActive)) {
    return Response.json({ error: "You cannot remove your own superadmin access" }, { status: 400 });
  }

  if (existing.role === "superadmin" && Boolean(existing.isActive) && (role !== "superadmin" || !isActive)) {
    const other = await d1.prepare(`
      SELECT id FROM app_users
      WHERE id != ? AND role = 'superadmin' AND is_active = 1
      LIMIT 1
    `).bind(id).first();
    if (!other) return Response.json({ error: "At least one active superadmin is required" }, { status: 400 });
  }

  const now = Date.now();
  await d1.batch([
    d1.prepare(`
      UPDATE app_users
      SET full_name = ?, role = ?, locale = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).bind(fullName, role, locale, isActive ? 1 : 0, now, id),
    d1.prepare(`
      INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, 'update', 'app_user', ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      auth.user.email,
      id,
      JSON.stringify({
        before: mapUser(existing),
        after: { email: existing.email, fullName, role, locale, isActive },
      }),
      now,
    ),
  ]);

  return Response.json({
    user: {
      id,
      email: existing.email,
      fullName,
      role,
      locale,
      isActive,
      createdAt: existing.createdAt,
      updatedAt: now,
    },
  });
}
