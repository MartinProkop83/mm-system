import { getD1 } from "../db";
import { ensureRuntimeSchema } from "../db/runtime-schema";
import { getChatGPTUser } from "./chatgpt-auth";
import { cookies } from "next/headers";

export type AppRole = "superadmin" | "boss" | "mechanic";

export type AppUser = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  locale: "cs" | "en";
};

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  locale: "cs" | "en";
};

export async function getAppUser(): Promise<AppUser | null> {
  const chatGPTUser = await getChatGPTUser();
  const identity = chatGPTUser ?? await developmentIdentity();
  if (!identity) return null;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const email = identity.email.trim().toLowerCase();
  const fullName = identity.fullName?.trim() || identity.displayName || email;

  const existing = await d1
    .prepare("SELECT id, email, full_name, role, locale FROM app_users WHERE email = ? AND is_active = 1 LIMIT 1")
    .bind(email)
    .first<UserRow>();

  if (existing) {
    if (existing.full_name !== fullName) {
      await d1
        .prepare("UPDATE app_users SET full_name = ?, updated_at = ? WHERE id = ?")
        .bind(fullName, Date.now(), existing.id)
        .run();
      return mapUser({ ...existing, full_name: fullName });
    }
    return mapUser(existing);
  }

  const countRow = await d1.prepare("SELECT COUNT(*) AS count FROM app_users").first<{ count: number }>();
  if ((countRow?.count ?? 0) > 0) return null;

  const now = Date.now();
  const id = crypto.randomUUID();
  try {
    await d1
      .prepare("INSERT INTO app_users (id, email, full_name, role, locale, is_active, created_at, updated_at) VALUES (?, ?, ?, 'superadmin', 'cs', 1, ?, ?)")
      .bind(id, email, fullName, now, now)
      .run();
  } catch {
    const raced = await d1
      .prepare("SELECT id, email, full_name, role, locale FROM app_users WHERE email = ? AND is_active = 1 LIMIT 1")
      .bind(email)
      .first<UserRow>();
    return raced ? mapUser(raced) : null;
  }

  return { id, email, fullName, role: "superadmin", locale: "cs" };
}

async function developmentIdentity() {
  if (process.env.NODE_ENV === "production") return null;

  const selectedUserId = (await cookies()).get("mm-dev-user-id")?.value;
  if (selectedUserId) {
    await ensureRuntimeSchema();
    const selected = await getD1()
      .prepare("SELECT email, full_name AS fullName FROM app_users WHERE id = ? AND is_active = 1 LIMIT 1")
      .bind(selectedUserId)
      .first<{ email: string; fullName: string }>();
    if (selected) {
      return {
        email: selected.email,
        fullName: selected.fullName,
        displayName: selected.fullName,
      };
    }
  }

  return {
    email: "martin@local.mm",
    fullName: "Martin Prokop",
    displayName: "Martin Prokop",
  };
}

function mapUser(row: UserRow): AppUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    locale: row.locale,
  };
}
