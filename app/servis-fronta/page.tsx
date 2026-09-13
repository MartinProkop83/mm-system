import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "../chatgpt-auth";
import { getAppUser } from "../server-auth";
import { ServiceQueueScreen } from "../service-queue-screen";

export const dynamic = "force-dynamic";

/**
 * Fronta na servis na samostatné adrese, bez bočního menu.
 *
 * Slouží dvěma věcem naráz: nástěnce na zdi v dílně a mechanikům, které nemá co rozptylovat.
 * Mechanik sem po přihlášení spadne rovnou (viz app/page.tsx) a zpět do zbytku aplikace se
 * odsud nedostane; superadmin a vedení mají v rohu odkaz na návrat.
 */
export default async function ServiceQueuePage() {
  const authenticatedUser = await getChatGPTUser();

  if (process.env.NODE_ENV === "production" && !authenticatedUser) {
    return (
      <main className="sign-in-page">
        <section className="sign-in-card">
          <div className="sign-in-brand"><img src="/machac-motors-logo.jpg" alt="Macháč Motors" /></div>
          <span className="settings-kicker">MM SYSTEM · SECURE ACCESS</span>
          <h1>Přihlášení do systému</h1>
          <p>Přihlaste se ověřeným ChatGPT účtem. Do systému budou vpuštěni pouze uživatelé povolení superadminem.</p>
          <a className="primary-button sign-in-button" href={chatGPTSignInPath("/servis-fronta")}>Přihlásit se přes ChatGPT</a>
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
          <a className="secondary-compact" href={chatGPTSignOutPath("/servis-fronta")}>Přihlásit se jiným účtem</a>
        </section>
      </main>
    );
  }

  return <ServiceQueueScreen locale={appUser.locale} role={appUser.role} userName={appUser.fullName} />;
}
