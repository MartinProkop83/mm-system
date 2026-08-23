import { cookies } from "next/headers";
import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";

type DevUserRow = {
  id: string;
  email: string;
  fullName: string;
  role: "superadmin" | "boss" | "mechanic";
};

function unavailable() {
  return Response.json({ error: "Not found" }, { status: 404 });
}

export async function GET() {
  if (process.env.NODE_ENV === "production") return unavailable();

  const currentUser = await getAppUser();
  if (!currentUser) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await ensureRuntimeSchema();
  const result = await getD1().prepare(`
    SELECT id, email, full_name AS fullName, role
    FROM app_users
    WHERE is_active = 1
    ORDER BY CASE role WHEN 'superadmin' THEN 0 WHEN 'boss' THEN 1 ELSE 2 END,
             full_name COLLATE NOCASE
  `).all<DevUserRow>();

  return Response.json({ users: result.results, currentUserId: currentUser.id });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return unavailable();

  const currentUser = await getAppUser();
  if (!currentUser) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let payload: { userId?: unknown };
  try {
    payload = await request.json() as { userId?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = String(payload.userId ?? "").trim().slice(0, 80);
  if (!userId) return Response.json({ error: "User id is required" }, { status: 400 });

  await ensureRuntimeSchema();
  const target = await getD1().prepare(`
    SELECT id, email, full_name AS fullName, role
    FROM app_users
    WHERE id = ? AND is_active = 1
    LIMIT 1
  `).bind(userId).first<DevUserRow>();
  if (!target) return Response.json({ error: "Active user not found" }, { status: 404 });

  (await cookies()).set("mm-dev-user-id", target.id, {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return Response.json({ user: target });
}
