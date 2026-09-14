import { redirect } from "next/navigation";
import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "../../chatgpt-auth";
import { getAppUser } from "../../server-auth";
import { isPublicCode, normalizePublicCode } from "../../engine-public-code";

export const dynamic = "force-dynamic";

/**
 * Trvalý odkaz z QR kódu na štítku motoru.
 *
 * Je schválně co nejkratší a nezávislý na tom, jak jsou uvnitř poskládané routy: `/m/<kód>`
 * jen najde motor a přesměruje na jeho servisní kartu. Kdyby se vnitřní adresy někdy
 * přeskládaly, mění se tahle jediná funkce — vytištěné štítky platí dál.
 *
 * Přihlášení je povinné, ale nesmí scan zahodit: nepřihlášený uživatel jde na přihlášení
 * s `return_to` na tenhle odkaz, takže po přihlášení skončí na motoru, ne na hlavní stránce.
 */
export default async function EngineQrPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const scanned = decodeURIComponent(rawCode ?? "");
  const target = `/m/${encodeURIComponent(scanned)}`;

  const authenticatedUser = await getChatGPTUser();
  if (process.env.NODE_ENV === "production" && !authenticatedUser) {
    redirect(chatGPTSignInPath(target));
  }

  const appUser = await getAppUser();
  if (!appUser) {
    return (
      <main className="access-denied-page">
        <section className="panel access-denied-card">
          <span className="access-denied-icon" aria-hidden="true">🔒</span>
          <span className="settings-kicker">MM SYSTEM · ACCESS</span>
          <h1>Přístup není povolen</h1>
          <p>Váš účet zatím není mezi aktivními uživateli systému. Požádejte superadmina o přidání přístupu.</p>
          <a className="secondary-compact" href={chatGPTSignOutPath(target)}>Přihlásit se jiným účtem</a>
        </section>
      </main>
    );
  }

  await ensureRuntimeSchema();
  // Ze štítku se čte krátký kód, ze starších odkazů může přijít i UUID motoru — obojí vede
  // na stejný motor, aby žádný dřív vytištěný ani odeslaný odkaz nepřestal platit.
  const normalized = normalizePublicCode(scanned);
  const engine = await getD1().prepare(`
    SELECT id, code FROM engines
    WHERE (public_code = ? OR id = ?) AND archived_at IS NULL AND sold_at IS NULL
  `).bind(isPublicCode(normalized) ? normalized : "", scanned).first<{ id: string; code: string }>();

  if (!engine) {
    return (
      <main className="access-denied-page">
        <section className="panel access-denied-card">
          <span className="access-denied-icon" aria-hidden="true">?</span>
          <span className="settings-kicker">MM SYSTEM · QR</span>
          <h1>Tenhle motor tu není</h1>
          <p>
            Kód <strong>{normalized || scanned}</strong> neodpovídá žádnému živému motoru.
            Mohl být vyřazený nebo prodaný — zkus ho najít podle čísla na štítku.
          </p>
          <a className="secondary-compact" href={appUser.role === "mechanic" ? "/servis-fronta" : "/"}>
            {appUser.role === "mechanic" ? "Zpět na frontu" : "Zpět do systému"}
          </a>
        </section>
      </main>
    );
  }

  // Mechanik má jako celou aplikaci frontu, takže se karta otevře v režimu bez menu.
  redirect(appUser.role === "mechanic"
    ? `/servis-fronta?motor=${engine.id}`
    : `/?motor=${engine.id}`);
}
