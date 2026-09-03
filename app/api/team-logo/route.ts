import { getAssetsBucket, getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";
import { sniffFileType } from "../../file-signature";

const allowedTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);
const maxLogoBytes = 5 * 1024 * 1024;

export async function GET(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema();
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return Response.json({ error: "Team id is required" }, { status: 400 });

  const team = await getD1().prepare(`
    SELECT logo_key AS logoKey, logo_content_type AS logoContentType
    FROM teams WHERE id = ? AND archived_at IS NULL
  `).bind(id).first<{ logoKey: string | null; logoContentType: string | null }>();
  if (!team?.logoKey) return Response.json({ error: "Logo not found" }, { status: 404 });

  const object = await getAssetsBucket().get(team.logoKey);
  if (!object) return Response.json({ error: "Logo not found" }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", team.logoContentType || object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("cache-control", "private, max-age=86400, immutable");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  await ensureRuntimeSchema();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid upload" }, { status: 400 });
  }
  const teamId = String(form.get("teamId") ?? "").trim();
  const logo = form.get("logo");
  if (!teamId) return Response.json({ error: "Team id is required" }, { status: 400 });
  if (!(logo instanceof File) || !logo.size) return Response.json({ error: "Select a logo file" }, { status: 400 });
  if (logo.size > maxLogoBytes) return Response.json({ error: "Logo is larger than 5 MB" }, { status: 413 });
  const sniffed = await sniffFileType(logo);
  if (!sniffed || !allowedTypes.has(sniffed.type)) return Response.json({ error: "Logo must be PNG, JPG or WebP" }, { status: 400 });
  const { type: contentType, extension } = sniffed;

  const d1 = getD1();
  const existing = await d1.prepare(`
    SELECT id, logo_key AS logoKey FROM teams
    WHERE id = ? AND archived_at IS NULL
  `).bind(teamId).first<{ id: string; logoKey: string | null }>();
  if (!existing) return Response.json({ error: "Team not found" }, { status: 404 });

  const key = `team-logos/${teamId}/${crypto.randomUUID()}.${extension}`;
  const now = Date.now();
  const bucket = getAssetsBucket();
  await bucket.put(key, logo.stream(), {
    httpMetadata: { contentType },
    customMetadata: { teamId, uploadedBy: user.email },
  });
  try {
    await d1.batch([
      d1.prepare(`
        UPDATE teams
        SET logo_key = ?, logo_content_type = ?, logo_updated_at = ?, updated_at = ?
        WHERE id = ? AND archived_at IS NULL
      `).bind(key, contentType, now, now, teamId),
      d1.prepare(`
        INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at)
        VALUES (?, ?, 'upload_logo', 'team', ?, ?, ?)
      `).bind(crypto.randomUUID(), user.email, teamId, JSON.stringify({ contentType, size: logo.size }), now),
    ]);
  } catch (error) {
    await bucket.delete(key);
    throw error;
  }
  if (existing.logoKey && existing.logoKey !== key) await bucket.delete(existing.logoKey);
  return Response.json({ teamId, updatedAt: now });
}

export async function DELETE(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "mechanic") return Response.json({ error: "Forbidden" }, { status: 403 });
  await ensureRuntimeSchema();
  const payload = await request.json().catch(() => ({})) as { teamId?: string };
  const teamId = String(payload.teamId ?? "").trim();
  if (!teamId) return Response.json({ error: "Team id is required" }, { status: 400 });

  const d1 = getD1();
  const existing = await d1.prepare(`
    SELECT logo_key AS logoKey FROM teams WHERE id = ? AND archived_at IS NULL
  `).bind(teamId).first<{ logoKey: string | null }>();
  if (!existing) return Response.json({ error: "Team not found" }, { status: 404 });
  const now = Date.now();
  await d1.batch([
    d1.prepare(`UPDATE teams SET logo_key = NULL, logo_content_type = NULL, logo_updated_at = NULL, updated_at = ? WHERE id = ?`).bind(now, teamId),
    d1.prepare(`INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, 'delete_logo', 'team', ?, '{}', ?)`).bind(crypto.randomUUID(), user.email, teamId, now),
  ]);
  if (existing.logoKey) await getAssetsBucket().delete(existing.logoKey);
  return Response.json({ teamId });
}
