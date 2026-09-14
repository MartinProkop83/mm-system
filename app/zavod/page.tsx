import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "../chatgpt-auth";
import { getAppUser } from "../server-auth";
import { RaceModeScreen } from "../race-mode-screen";

export const dynamic = "force-dynamic";

/**
 * RACE MODE — celoobrazovkový režim pro práci přímo na závodě, na vlastní adrese, bez
 * bočního menu. Stejný vzor jako `/servis-fronta`.
 *
 * Smí sem superadmin, vedení i mechanik — na place jsou všichni. Data ale každý dostane
 * přes `/api/race-mode`, která vrací jen název a termín závodu, piloty a jejich motory;
 * mechanikovi ji navíc ještě jednou ořeže whitelist v `app/api-access.ts`.
 *
 * Předávky zákazníkům se mechanikovi nezobrazí vůbec — ani blok na obrazovce, ani data.
 */
export default async function RaceModePage() {
  const authenticatedUser = await getChatGPTUser();

  if (process.env.NODE_ENV === "production" && !authenticatedUser) {
    return (
      <main className="sign-in-page">
        <section className="sign-in-card">
          <div className="sign-in-brand"><img src="/machac-motors-logo.jpg" alt="Macháč Motors" /></div>
          <span className="settings-kicker">MM SYSTEM · SECURE ACCESS</span>
          <h1>Přihlášení do systému</h1>
          <p>Přihlaste se ověřeným ChatGPT účtem. Do systému budou vpuštěni pouze uživatelé povolení superadminem.</p>
          <a className="primary-button sign-in-button" href={chatGPTSignInPath("/zavod")}>Přihlásit se přes ChatGPT</a>
          <small>MM SYSTEM neukládá vaše heslo.</small>
        </section>
      </main>
    );
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
          <a className="secondary-compact" href={chatGPTSignOutPath("/zavod")}>Přihlásit se jiným účtem</a>
        </section>
      </main>
    );
  }

  return <RaceModeScreen locale={appUser.locale} role={appUser.role} />;
}
