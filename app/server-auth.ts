import { getD1 } from "../db";
import { ensureRuntimeSchema } from "../db/runtime-schema";
import { getChatGPTUser } from "./chatgpt-auth";
import { isApiAccessAllowed, filterResponseForMechanic } from "./api-access";
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

const AUTOMATED_IDENTITY_EMAILS = new Set([
  "sites-screenshot-service-noreply@chatgpt.com",
]);

export async function getAppUser(): Promise<AppUser | null> {
  const chatGPTUser = await getChatGPTUser();
  const identity = chatGPTUser ?? await developmentIdentity();
  if (!identity) return null;

  await ensureRuntimeSchema();
  const d1 = getD1();
  const email = identity.email.trim().toLowerCase();
  const fullName = identity.fullName?.trim() || identity.displayName || email;

  if (AUTOMATED_IDENTITY_EMAILS.has(email)) {
    await d1
      .prepare("UPDATE app_users SET is_active = 0, updated_at = ? WHERE email = ? AND is_active = 1")
      .bind(Date.now(), email)
      .run();
    return null;
  }

  await d1
    .prepare("UPDATE app_users SET is_active = 0, updated_at = ? WHERE email = ? AND is_active = 1")
    .bind(Date.now(), "sites-screenshot-service-noreply@chatgpt.com")
    .run();

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

  // Bootstrap: the first sign-in becomes superadmin. The eligibility check and the
  // insert must be one atomic statement — two different new emails signing in at
  // the same moment would otherwise both read zero active users and both insert,
  // making two superadmins instead of one.
  const now = Date.now();
  const id = crypto.randomUUID();
  try {
    const result = await d1
      .prepare(`
        INSERT INTO app_users (id, email, full_name, role, locale, is_active, created_at, updated_at)
        SELECT ?, ?, ?, 'superadmin', 'cs', 1, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM app_users WHERE is_active = 1)
      `)
      .bind(id, email, fullName, now, now)
      .run();
    if (!result.meta.changes) return null;
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

/**
 * Přihlášený uživatel pro API routu, včetně kontroly, jestli na ni vůbec smí.
 *
 * Tohle je jediné místo, kde se vynucuje politika z `api-access.ts` — proto ho volají všechny
 * routy místo holého `getAppUser()`. Mechanik dostane 403 na všem, co není výslovně povolené;
 * ostatní role projdou a případná další omezení si routa řeší sama.
 *
 * Vrací buď `{ user, json }`, nebo `{ error }` s hotovou odpovědí — stejný tvar, jaký už
 * používají `requireSuperadmin()` helpery v jednotlivých routách.
 *
 * **`json()` je jediný správný způsob, jak z routy vrátit data.** Ořezání odpovědi podle role
 * je v něm zabudované, takže routa na něj nemůže zapomenout tím, že ho prostě nezavolá —
 * dřív se filtr volal ručně a nová routa ho tiše přeskočila. Chybové odpovědi (`{ error }`)
 * přes něj chodit nemusí, ty žádná data nenesou.
 */
export async function getApiUser(request: Request) {
  const user = await getAppUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) } as const;

  const { pathname } = new URL(request.url);
  if (!isApiAccessAllowed(user.role, pathname, request.method)) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }
  return {
    user,
    json: (payload: unknown, init?: ResponseInit) =>
      Response.json(filterResponseForMechanic(user.role, pathname, payload), init),
  } as const;
}
