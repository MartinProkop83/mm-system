# Pravidla pro CSS

## Barvy
Nikdy nepiš hex ani rgba přímo do komponent.
Používej --wrc-* tokeny z :root v globals.css.
Chybí-li token, řekni to a nevymýšlej hodnotu.

## Stavy vs. značka
--wrc-red je značková barva (tlačítka, akcenty, logo).
--wrc-danger-ink je stavová (chyba, nezaplaceno). Nesluč je.

## Stavové páry
Vždy color: var(--wrc-{stav}-ink) + background: var(--wrc-{barva}-dim).
Nikdy nepiš ruční :root[data-mode="dark"] override — alfa-dim to řeší sám.

## Kategorie
--wrc-tone-{mini,okj,okn,ok}-ink jsou barvy kategorií, ne stavy.

## Rozměry
Spacing: 2/4/6/8/12/16/20/24/32/48
Radius: xs 3 / sm 4 / md 8 / lg 12 / xl 16 / 2xl 20 / pill / circle
Font-size: micro 8 / xs 10 / sm 12 / base 14 / lg 17 / xl 22 / 2xl 30
         + display-1 36 / display-2 48
Font-weight: 400/500/600/700/800/900
Breakpointy: 1440/1280/1120/900/760/600/420

## Grid
grid-template-columns vždy s minmax(0, 1fr), nikdy holé 1fr.
Holé 1fr = minmax(auto, 1fr) a způsobuje vodorovné přetékání.

## Panely
Karty a panely používají třídu .panel (pozadí, rámeček, radius).
Nepiš je znovu ručně.

## Před dokončením
Zkontroluj světlý i tmavý režim a šířky 1440/1000/760/500.

# TypeScript — dva tsconfigy

Projekt má dva tsconfigy, protože `@cloudflare/workers-types` je čistě ambientní
balíček (žádné importy, jen globální deklarace) — jakmile je načtený, přepíše
globály jako `Response`/`fetch`/`FormData` pro celý program. To koliduje s DOM
typy, které potřebuje browser ("use client") kód.

- `tsconfig.json` — hlavní, pro `app/**/*.tsx` a client kód. DOM lib, žádné
  Cloudflare typy. Toto čte editor a Next.js/vinext.
- `tsconfig.server.json` — pro `db/**`, `worker/**`, `app/api/**` a sdílené
  server-safe helpery `app/*.ts` (auth, image URL buildery apod.). Má
  `@cloudflare/workers-types`, žádné DOM. Je to `composite` projekt napojený
  na hlavní přes `references` — hlavní tsconfig tak vidí jen zkompilované typy
  (`.ts-out/server/`), ne zdrojový kód, takže se odtud nešíří ani Cloudflare
  globály do browser kódu, ani "chybí typ" chyby zpátky do hlavního configu
  (i když `app/page.tsx` importuje `server-auth.ts`, který importuje `db/index.ts`).

`worker/cloudflare-env.d.ts` obsahuje ruční `Cloudflare.Env` augmentaci (normálně
by ji generoval `wrangler types` z `wrangler.toml`, který projekt nemá) a
záplatu pro mezeru v typech `FormData.get()` v nainstalované verzi workers-types.

**Spouštění:** `npm run typecheck` spustí oba configy v pořadí (server nejdřív,
protože musí vygenerovat `.d.ts` pro hlavní config). Nikdy nespouštěj jen
`tsc --noEmit -p .` a nepovažuj to za kompletní kontrolu — přeskočí to celý
`db/**`, `worker/**`, `app/api/**`.

# Databáze — schéma se aplikuje přes runtime-schema.ts, ne přes drizzle migrace

`db/schema.ts` + `drizzle/*.sql` (drizzle-kit) a skutečný běh appky jsou
rozejité. `db/schema.ts` slouží jen jako deklarativní zápis pro konzistenci —
`getDb()` (drizzle query builder) nemá v `app/**` jediné volání.

Skutečné schéma se aplikuje přes **`db/runtime-schema.ts`** — `ensureRuntimeSchema()`
běží idempotentně (`CREATE TABLE IF NOT EXISTS` + `PRAGMA table_info` →
podmíněné `ALTER TABLE ADD COLUMN`) na začátku prakticky každého API route
handleru. To je jediné místo, které v D1 (lokální i produkční) reálně
vytváří/upravuje tabulky.

- **Novou tabulku přidávej do `db/runtime-schema.ts`** (`CREATE TABLE IF NOT
  EXISTS` + odpovídající `CREATE UNIQUE INDEX IF NOT EXISTS`/`CREATE INDEX IF
  NOT EXISTS` do stejného `d1.batch([...])`), stejným raw-SQL stylem jako
  ostatní tabulky tam. Zápis do `db/schema.ts` přidej taky, kvůli konzistenci,
  ale sám o sobě nic nezaloží.
- **Nespouštěj `npm run db:generate`** — vytvoří nepoužitelnou migraci, protože
  drizzle snapshot a skutečné schéma jsou rozejité (drizzle neví o tabulkách,
  které vznikly jen přes `runtime-schema.ts`).
- **Přístup k datům jde přes `getD1()` a raw SQL** (`d1.prepare(...).bind(...)`,
  `d1.batch([...])`), ne přes `getDb()`.

# Git — push hned po commitu

Po každém commitu na `main` rovnou spusť `git push`, bez čekání na dotaz.
V hlášení po pushi napiš, že je commit na GitHubu.

Platí jen pro běžný `git push` na `main`. Force push, přepis historie nebo
push na jinou větev než `main` se stále nejdřív ptá.

# Úklid testovacích dat v D1 — žádný DELETE/UPDATE bez WHERE

14. 9. 2026 smazal blanket `DELETE FROM customers;` (bez WHERE) tři existující
zákazníky včetně aktivního „Martin Prokop" napojeného na reálný prodej — tabulka
`customers` existovala už před touhle relací, takže úklid testovacích řádků
smazal i to, co s testem nemělo nic společného. Auditem stejného dne se navíc
našly dva stejné případy na `engine_service_entries` (legacy tabulka servisní
historie z prvního release, 23. 8. 2026) — bez zálohy z doby před incidentem,
takže nešlo ověřit ani vrátit.

Pravidla, ne doporučení:

- **Nikdy `DELETE` ani `UPDATE` bez `WHERE`** na tabulce v D1 (lokální i
  produkční). Bez výjimky — i „vím jistě, že je prázdná" se ověří dotazem,
  ne předpokladem.
- Testovací data maž **jen podle konkrétních ID**, která jsi sám vytvořil.
  Tahle ID si zapiš hned při vytvoření (proměnná v shellu, komentář v
  transkriptu) — ne až zpětně, kdy už nejde rozlišit test od zbytku.
- **Před každým mazáním vypiš, co se smaže** (`SELECT` se stejnou podmínkou,
  jakou bude mít `DELETE`) a přečti si výstup, než pošleš mazací příkaz.
- Nová tabulka založená v týhle relaci (viz `runtime-schema.ts`) může být
  bez rizika kompletně prázdná — i tak ji ale maž podle ID, ne blanketově;
  jistota bez ověření se časem stává zdrojem přesně týchž chyb.
- Když si nejsi jistý, co je testovací a co uživatelovo, **nemaž nic a
  zeptej se.**
