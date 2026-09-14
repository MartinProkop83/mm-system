import { redirect } from "next/navigation";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "./chatgpt-auth";
import MMDashboard from "./mm-dashboard";
import { getAppUser } from "./server-auth";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ motor?: string }> }) {
  // `?motor=` sem pošle trvalý odkaz z QR kódu (viz app/m/[code]/page.tsx).
  const { motor } = await searchParams;
  const authenticatedUser = await getChatGPTUser();

  if (process.env.NODE_ENV === "production" && !authenticatedUser) {
    return (
      <main className="sign-in-page">
        <section className="sign-in-card">
          <div className="sign-in-brand"><img src="/machac-motors-logo.jpg" alt="Macháč Motors" /></div>
          <span className="settings-kicker">MM SYSTEM · SECURE ACCESS</span>
          <h1>Přihlášení do systému</h1>
          <p>Přihlaste se ověřeným ChatGPT účtem. Do systému budou vpuštěni pouze uživatelé povolení superadminem.</p>
          <a className="primary-button sign-in-button" href={chatGPTSignInPath("/")}>Přihlásit se přes ChatGPT</a>
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
          <a className="secondary-compact" href={chatGPTSignOutPath("/")}>Přihlásit se jiným účtem</a>
        </section>
      </main>
    );
  }

  // Mechanik má jako domovskou obrazovku frontu na servis — bez bočního menu a bez zbytku
  // aplikace. Rozhoduje se na serveru, aby se sem nedalo dostat ani přímým zadáním adresy.
  if (appUser.role === "mechanic") redirect(motor ? `/servis-fronta?motor=${encodeURIComponent(motor)}` : "/servis-fronta");

  return <MMDashboard initialEngineId={motor ?? ""} />;
}
