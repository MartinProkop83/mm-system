import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getApiUser } from "../../server-auth";

/**
 * Obecné nastavení aplikace jako klíč/hodnota.
 *
 * Záměrně to není routa pro QR kódy: první klíč je `qr_base_url`, ale stejným způsobem sem
 * půjde cokoli dalšího, co se nastaví jednou a platí pro celý systém. Číst smí kdokoli
 * přihlášený, kdo se do aplikace s menu dostane; měnit jen superadmin.
 */

/** Klíče, které routa zná. Neznámý klíč se odmítne — jinak by se tabulka stala smetištěm. */
const KNOWN_KEYS = new Set(["qr_base_url"]);

type Payload = { key?: string; value?: string };

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * Základní adresa pro QR kódy. Ukládá se bez koncového lomítka a musí být http(s) —
 * do QR kódu se lepí `/m/<kód>`, takže překlep v adrese znamená vytištěné nepoužitelné štítky.
 */
function validateValue(key: string, value: string) {
  if (key !== "qr_base_url" || value === "") return "";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Zadej celou adresu včetně https://";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "Adresa musí začínat http:// nebo https://";
  return "";
}

export function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export async function GET(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;

  await ensureRuntimeSchema();
  const rows = await getD1().prepare("SELECT key, value FROM app_settings").all<{ key: string; value: string }>();
  return Response.json({
    settings: Object.fromEntries(rows.results.map((row) => [row.key, row.value])),
  });
}

export async function PUT(request: Request) {
  const auth = await getApiUser(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const key = clean(payload.key, 60);
  if (!KNOWN_KEYS.has(key)) return Response.json({ error: "Unknown setting" }, { status: 400 });

  const value = key === "qr_base_url" ? normalizeBaseUrl(clean(payload.value)) : clean(payload.value);
  const problem = validateValue(key, value);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  await ensureRuntimeSchema();
  await getD1().prepare(`
    INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).bind(key, value, auth.user.email, Date.now()).run();

  return Response.json({ key, value });
}
