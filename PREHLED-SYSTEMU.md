# MM System — přehled systému

Kompletní popis toho, co MM System pro Macháč Motors umí, k datu **15. 9. 2026**.

Dokument je psaný od nuly na základě aktuálního stavu repozitáře (ne na základě starší
verze tohoto dokumentu) a popisuje i vše, co přibylo v posledních dnech: dokumenty u
motoru, celý zakázkový servis pro zákazníky (zakázky, koš, tisk, karta zákazníka),
servisní kartu s číselníky, přesun technických údajů do Nastavení a QR kódy.

Je psaný pro člověka, který se do kódu nedívá — popisuje, co se v aplikaci vidí a co
se s tím dá dělat, ne jak je to naprogramované.

---

## Obsah

1. [Provoz](#1-provoz) — Přehled, Úkoly, Kalendář
2. [Závody](#2-závody) — Závody, Typy závodů, Tratě, RACE MODE
3. [Tým](#3-tým) — Piloti, Týmy, Zákazníci, Mechanici, Oblečení
4. [Vybavení](#4-vybavení) — Motory, Karburátory, Auta, Servis, Servisní historie, QR kódy, Sklad
5. [Logistika](#5-logistika) — Ubytování, Letenky, Pronájem aut
6. [Obchod](#6-obchod) — Prodej, Zakázky, Dokumenty (checklisty)
7. [Nastavení](#7-nastavení)
8. [Role a oprávnění](#8-role-a-oprávnění)
9. [Co systém hlídá a počítá sám](#9-co-systém-hlídá-a-počítá-sám)
10. [Vícejazyčnost](#10-vícejazyčnost)
11. [Tisk a tiskové výstupy](#11-tisk-a-tiskové-výstupy)
12. [Zálohování](#12-zálohování)
13. [Co ještě není hotové](#13-co-ještě-není-hotové)
14. [Struktura a rozsah](#14-struktura-a-rozsah) — kompletní technický popis

---

## 8. Role a oprávnění

Systém má tři role: **superadmin** (majitel/vedoucí dílny), **vedení** (boss) a **mechanik**.
Přihlašování je přes ověřený ChatGPT účet — MM System si nikdy neukládá žádné heslo.
Superadmin v Nastavení → Přístupy a role rozhoduje, kdo se do systému vůbec dostane a s
jakou rolí. Poslední aktivní superadmin nejde odebrat ani smazat — systém by se jinak
mohl sám zamknout.

### Co která role vidí

- **Superadmin** — vidí a smí úplně vše, včetně Nastavení, mazání číselníků, koše
  v Zakázkách a obnovy z koše, stornování zakázek a prodejů, odemykání vyfakturovaných
  zakázek.
- **Vedení** — vidí prakticky totéž jako superadmin (celé menu, všechny karty a detaily,
  zakázkový servis, servisní kartu). Nesmí ale: mazat/archivovat v číselnících (jen
  superadmin), stornovat prodej nebo zakázku, mazat zakázku do koše, odemykat
  vyfakturovanou zakázku, měnit přístupy uživatelů, upravovat Nastavení (kromě těch
  částí, které jsou pro vedení otevřené).
- **Mechanik** — po přihlášení nevidí *nic* z hlavní aplikace. Server ho přesměruje
  rovnou na `/servis-fronta` — samostatnou obrazovku bez bočního menu, bez horní lišty,
  bez hledání. Vidí jen:
  - frontu motorů čekajících na servis (naše i zákaznické, jako dvě oddělené desky),
  - kartu motoru, kterou zrovna zpracovává (servisní historie, technické údaje, zápis
    servisu), ale bez obchodních údajů (nákupní/prodejní cena, kde byl motor zapůjčen),
  - RACE MODE na place (potvrzování jel/nejel, zápis motohodin),
  - svou jedinou pracovní obrazovku pro zákaznický motor (rozsah práce, zápis provedené
    práce a materiálu podle ceníku, přepnutí na „čeká na díl", tlačítko „hotovo").

  Mechanik **nikdy** neuvidí: Nastavení, sekci Zakázky (celkové přehledy, slevy, ceny za
  celou zakázku), dokumenty motoru (mohou v nich být faktury a ceny), zákazníky, prodej,
  sklad, logistiku, karburátory/auta/týmy/piloty jako samostatné sekce.

### Jak je to vynucené (tři vrstvy, ne jen schování v menu)

Schování položky z menu by samo o sobě nic nezaručilo — kdokoliv by si mohl zkusit
zadat adresu API přímo. Systém má proto tři na sobě nezávislé pojistky:

1. **Default-deny na úrovni routy** (`app/api-access.ts`). Existuje jeden centrální
   seznam `MECHANIC_READ` (co mechanik smí číst) a `MECHANIC_WRITE` (co smí zapisovat).
   Cesta k API, která v tom seznamu není, vrátí mechanikovi „Forbidden" **automaticky** —
   i cesta, která teprve v budoucnu vznikne. Není potřeba nikde psát „mechanik na tohle
   nesmí" — nesmí na všechno, dokud se výslovně nepovolí. Dnes je povoleno jen 10 cest
   ke čtení a 4 z nich i k zápisu (fronta na servis, servisní záznamy, RACE MODE,
   zakázkový servis pro jeho jedinou obrazovku).
2. **Whitelist polí v odpovědi, ne seznam zakázaných** (`filterResponseForMechanic`).
   I na routě, kterou mechanik smí číst, se mu odpověď ořeže na vyjmenovaná pole — třeba
   u motoru vidí technické údaje, ale ne nákupní cenu, prodejní cenu ani to, komu byl
   zapůjčen. Nový sloupec, který někdo v budoucnu přidá do SQL dotazu a zapomene na
   oprávnění, se mechanikovi **neprosákne** — musí se explicitně přidat na whitelist,
   jinak zmizí sám. To je záměrně obrácené pořadí uvažování oproti „co mu zakážu" a je to
   tak proto, že se to jednou reálně stalo (tři routy zapomněly na ruční filtrování, než
   se filtr centralizoval).
3. **Centrální průchod přes jednu funkci** (`getApiUser()`). Každá API routa volá jednu
   společnou funkci, která ověří přihlášení, ověří oprávnění k té konkrétní cestě a vrátí
   `json()` pomůcku, která filtr podle role použije automaticky. Routa nemůže na filtrování
   zapomenout tím, že by ho „prostě nezavolala" — je součástí jediného způsobu, jak z
   routy vůbec něco vrátit. Existuje i automatizovaný test, který ověří, že seznam
   povolených rout v `api-access.ts` sedí s tím, co routy reálně vrací.

U zakázkového servisu je tahle architektura vidět nejlíp: mechanik nemá přístup na
`/api/service-orders` (celá sekce Zakázky) vůbec — ani ke čtení. Pro jeho práci existuje
samostatná, úzká routa `/api/customer-service`, která mu ukáže jen konkrétní motor, na
kterém pracuje, ceníkové ceny položek (aby mohl vybrat, co dělal), ale **žádnou slevu a
žádný součet za zakázku** — z ceny, množství a celkové ceny by šla sleva zpětně
dopočítat, takže whitelist zahodí obě dohromady, ne jen jednu.

---

## 1. Provoz

### 1.1 Přehled (úvodní obrazovka, dashboard)

Slouží jako první obrazovka po přihlášení — souhrn toho, co je potřeba řešit dnes, bez nutnosti procházet jednotlivé sekce.

Zobrazuje postupně:

- **Nadcházející závod / „Tento víkend"** — dlaždice s nejbližším závodem (nebo víc dlaždic, když jich je víc ve stejném termínu): logo/vlajka, odpočet do startu („dnes"/„probíhá"/počet dní), termín, trať, počty přiřazených pilotů/motorů/karburátorů. Pokud je u některého přiřazeného motoru potřeba servis, dlaždice na to rovnou upozorní s odkazem na řešení.
- **Akční centrum** — klikací seznam upozornění vedoucí přímo do příslušné sekce: kolik motorů potřebuje servis, kolik karburátorů potřebuje servis, kolik vozidel potřebuje servis (zobrazí se jen, když nějaké je — kriticky červeně, pokud je servis už po termínu), kolik úkolů je po termínu (kriticky), kolik je otevřených úkolů, a název nejbližšího nadcházejícího úkolu.
- **Poslední aktivita** — poslední tři záznamy z celosystémového auditního logu (kdo, co udělal, jak dávno) — appka umí popsat srozumitelně desítky typů akcí (založení závodu, zápis servisu, přiřazení motoru, stornování prodeje, nahrání dokumentu atd.) nad desítkami typů dat.
- **Nadcházející závody** — vodorovná řada až 8 nejbližších závodů v sezóně s pořadím kola, terminem, tratí a odpočtem; nejbližší je zvýrazněný.
- **Souhrnné dlaždice** — počet aktivních pilotů, počet vlastních motorů, celkový počet závodů v sezóně, počet motorů potřebujících servis/přestavbu, počet položek na skladu — každá dlaždice je zároveň odkazem do příslušné sekce.
- **Sezóna — přehled závodů** — tabulka až 8 nejbližších závodů (kolo, název, trať, termín, stav, počty pilotů/motorů/karburátorů) s odkazem na celý kalendář.
- **Stav motorů podle kategorie** — vodorovný pruhový graf pro každou kategorii motoru (Připraven/Blíží se servis/V přestavbě/V uskladnění), s čísly; kliknutím na kategorii se dole přepne tabulka konkrétních motorů dané kategorie.
- **Souhrnné dlaždice zakázkového servisu** („V řešení"/„Čeká na díl"/„Ke kontrole"/„Čeká na vyzvednutí") — zobrazí se, jen když modul zakázek obsahuje nějaká data; podrobně popsáno v kapitole 6 (Zakázky).

Přehled je čistě informativní — nic se z něj přímo needituje, všechny dlaždice a řádky jsou odkazy do příslušných sekcí. Mechanik tuto obrazovku nikdy nevidí — jeho domovská obrazovka je fronta na servis (kapitola 4.4).

### 1.2 Úkoly

Jednoduchý úkolovník pro provozní věci, které nepatří ke konkrétnímu motoru ani závodu (ale volitelně se k závodu dají přivázat).

**Přehledové filtry** (s počty): Aktivní (vše nehotové), Na dnešek (nehotové s dnešním termínem), Po termínu (nehotové s termínem v minulosti), Hotové.

**Pole úkolu**: typ (Úkol / Připomínka), priorita (Nízká/Normální/Vysoká/Kritická), název (povinný), termín (datum a čas, nepovinné), komu je přiřazen (přihlášený uživatel, kterýkoli mechanik, nebo nepřiřazeno), volitelná vazba na konkrétní závod (pak se u úkolu zobrazí jeho název a trať), popis/poznámka, a (jen při úpravě) stav Otevřeno/Probíhá/Hotovo.

**Práce se seznamem**: zaškrtávací kolečko rovnou přepne na Hotovo/zpět na Otevřeno; tlačítko Začít/Pozastavit přepíná Probíhá↔Otevřeno; Upravit otevře formulář s předvyplněnými hodnotami; Smazat (jen superadmin) úkol archivuje s potvrzením. U dokončeného úkolu se eviduje kdo a kdy ho dokončil — při znovuotevření a opětovném uzavření se tento údaj nepřepisuje, pokud už existoval. Úkoly po termínu jsou v seznamu vizuálně zvýrazněné.

Mechanik k úkolům nemá přístup vůbec (jeho jediná obrazovka je fronta na servis) — čtení i zápis mají superadmin a vedení, mazání jen superadmin.

### 1.3 Kalendář

Měsíční kalendářní mřížka (týdny pondělí–neděle) se šipkami pro přepínání měsíců a tlačítkem „Dnes".

- Do každého dne se vloží dlaždičky závodů probíhajících v ten den (podle rozpětí odjezd–návrat), nejvýš 3 viditelně na den. Barva dlaždičky odpovídá **barvě typu závodu** nastavené v číselníku Typy závodů (přes 50 pojmenovaných barev na výběr). Dlaždička ukazuje logo/vlajku, název, trať a počet přiřazených mechaniků a aut; najetí myší zobrazí bublinu se jmenným výpisem.
- Kliknutím na dlaždičku se otevře detail daného závodu.
- Pod mřížkou je **„Přehled výjezdů"** — karta pro každý zobrazený závod se sloupci Mechanici, Auta týmu, Ubytování (název, počet osob, vzdálenost/čas na trať), Letenky (trasa, číslo letu, u zpáteční cesty i druhý úsek) a Pronájem auta (společnost, typ vozu).
- **Filtry** podle mechanika a podle auta (lze kombinovat) — zúží kalendář i přehled výjezdů jen na závody, kde je vybraný člověk/vozidlo přiřazeno.
- **Tisk kalendáře** — tiskový náhled jen s mřížkou (bez ovládacích prvků), v titulku uvede měsíc/rok a aktivní filtry.

Kalendář je čistě čtecí obrazovka — úpravy se dělají v detailu závodu nebo v Logistice. Mechanik k datům kalendáře nemá přístup.

---

## 2. Závody

### 2.1 Závody — přehled a detail

Hlavní seznam závodů lze zobrazit jako **karty** (logo/vlajka, série a kolo, název, termín, trať, země, výčet kategorií, počet pilotů, stavový štítek Plánováno/Probíhá/Dokončeno, odznak připravenosti) nebo jako **tabulku**. Lze filtrovat podle kategorie a podle tratě. Dokončené závody automaticky mizí do **archivu**, seskupeného podle roku a s dlaždicemi četnosti podle typu závodu.

**Vytvoření/úprava závodu**: výběr z číselníku Typy závodů (nejde napsat volně), volitelná série a číslo kola, země, výběr tratě z adresáře (automaticky doplní místo i adresu) nebo ruční zadání, čtyři data v pevném pořadí odjezd ≤ začátek ≤ konec ≤ návrat (odjezd/návrat se při zadání začátku/konce automaticky navrhnou, dokud je uživatel neupraví ručně), zaškrtnutí kategorií, které na závodě startují (aspoň jedna povinná; kategorii s existujícími přiřazeními nejde zpětně odškrtnout), přiřazení mechaniků a aut z adresáře, poznámky. Systém hlídá **kolize termínů** — mechanik ani auto nejdou přiřadit na dva závody, jejichž termíny (odjezd–návrat) se překrývají.

**Detail závodu** má přetahatelné záložky (pořadí lze měnit, appka si ho pamatuje): Plán závodu, Piloti, Posádka a doprava, Checklist, Cesta a ubytování, Prodej a servis, Jiné týmy, Předávky a platby / Poznatky ze závodu, Finance, Historie. Poslední tři záložky mechanik nikdy nevidí.

- **Panel „Souhrn připravenosti"** — klikací kontrolní body (mechanici/auta přiřazeni, servis vozidel v pořádku, počet potvrzených pilotů, přiřazených motorů, přiřazených karburátorů) se zeleným/žlutým celkovým stavem.
- **Panel „Fakta o závodě"** — termín, mechanici, auta, termín cesty, trať/adresa, orientační vzdálenost a doba jízdy z dílny, organizátor.
- **Panel „Trať" a počasí** — mapa/obrázek tratě, adresa, vzdálenost z dílny, odkazy na Google Maps a web tratě, živé počasí a předpověď po dnech (až ~16 dní dopředu) s rozklikáváním na hodinovou předpověď.
- **Plán závodu** (jádro sekce) — karta pro každou kategorii se seznamem pilotů: startovní číslo, jméno + vlajka + tým, sloty motorů (max. 3, u KZ jen 2 — sloupce se dynamicky přidávají, jen když je někdo potřebuje), sloty karburátorů (max. 3, u KZ žádný), poznámka k pilotovi, potvrzení účasti, akce úpravy/odebrání. Kliknutím na buňku motoru/karburátoru se nabídne výběr z kompatibilních kusů se stavem (volný / už přiřazen tomuto pilotovi / naposledy použit / 🔒 obsazen jinde). Uvolnění slotu automaticky posune zbývající obsazené sloty, aby nevznikla mezera. Piloty v kategorii lze přeuspořádat přetažením. Existuje i **„Extra vybavení"** — motor/karburátor vzatý s sebou bez konkrétního pilota (např. náhradní kus). Systém hlídá, že motor/karburátor nejde přiřadit dvakrát témuž pilotovi, musí sedět kategorií, nejde přiřadit, je-li už na jiném závodě se stejným termínem, ani je-li právě zapůjčený s kryjícím se termínem.
- **Posádka a doprava** — přiřazení mechaniků a aut k závodu, s volitelným párováním „kdo jede v kterém autě"; u auta se ukazuje odznak blížícího se servisu.

### 2.2 Tisk plánu závodu

Tlačítko „Vytisknout plán" (a obdobná tlačítka na dalších záložkách) přepne appku do speciálního tiskového režimu, který skryje menu a vše nepodstatné a vytiskne jen aktuální záložku: **plán** (fakta + kompletní přehled vybavení po kategoriích, každá kategorie na nové straně), **piloti** (jen tabulky pilotů, zvětšené písmo pro čitelnost na place), **checklist** (karty se zaškrtávacími poli po sekcích), **finance** (souhrny a tabulka plateb) a samostatně **kalendář** (měsíční mřížka). Titulek okna se dočasně přejmenuje podle názvu závodu a data, aby uložené PDF mělo smysluplný název.

### 2.3 Finance závodu

Jen pro superadmina a vedení. Souhrn zvlášť za CZK a EUR: cena před slevou, slevy, piloti po slevě, prodej, jiné týmy, předávky, celkem, zaplaceno, zbývá (červeně, pokud je co doplácet), náklady na cestu z Logistiky, čistý zisk. Tabulka plateb pilotů (cena bez DPH, měna, sleva v %, dopočítaná konečná cena, forma platby, zaplaceno/nezaplaceno, poznámka). Dále přehled prodeje/servisu a plateb od jiných týmů navázaných na tento závod.

### 2.4 Historie závodu

Chronologický log změn na konkrétním závodě (jen superadmin/vedení) — kdo a kdy přidal/odebral/potvrdil pilota, přiřadil/odebral mechanika či auto, upravil platbu, přidal/zrušil ubytování/let/pronájem apod. Barevně odlišené podle typu akce (zeleně vznik/potvrzení, červeně smazání/zrušení, neutrálně ostatní úpravy).

### 2.5 Typy závodů (číselník)

Šablona, ze které se při zakládání konkrétního závodu vybírá povinné pole „Závod" — bez šablony nejde závod založit. Obsahuje: název přednastaveného závodu (použije se jako výchozí název), volitelný seznam možných sérií (čárkou oddělený text, při zakládání závodu jde vybrat nebo napsat vlastní), povinnou barvu pro kalendář (z přes 48 pojmenovaných barev), volitelné logo (zobrazí se u všech závodů této šablony všude v appce) a poznámky. Smazání (jen superadmin) je možné, jen pokud typ ještě nepoužívá žádný existující závod.

### 2.6 Tratě (adresář)

Samostatný, znovupoužitelný adresář — jednou zadaná trať jde přiřadit libovolnému budoucímu závodu ve stejné zemi. Karta tratě: obrázek/mapa, vlajka a země, adresa, stav polohy pro počasí, orientační vzdálenost a doba jízdy z dílny, odkazy na Google Maps a web tratě. Formulář: název, země, adresa, web, odkaz na Google Maps, a tlačítko **„Načíst polohu"**, které ze zadané adresy/odkazu automaticky dohledá GPS souřadnice (nebo je lze doplnit ručně) — souřadnice jsou nutné pro zobrazení počasí u závodu. Jakákoli změna názvu/země/adresy/odkazu zneplatní už nalezenou polohu, aby nezůstala neaktuální. Vzdálenost a doba jízdy z dílny se při nalezení polohy dopočítají automaticky, ale jdou přepsat ručně. Smazání jen pro superadmina.

### 2.7 RACE MODE — režim na place

Samostatná celoobrazovková obrazovka (`/zavod`, bez menu, ovladatelná i na mobilu/tabletu), určená k práci přímo v boxech. Na rozdíl od zbytku Závodů sem má přístup **i mechanik** — na place jsou si všichni rovni, ale co uvidí, se výrazně liší.

- **Mechanik** vidí jen: jméno a termín závodu, piloty s kategorií, jejich přiřazené motory a stav jel/nejel. Nevidí organizátora, adresy, mechaniky, auta, poznámky ani nic obchodního; blok pro předávky zákazníkům se mu vůbec nenačte.
- **Výběr závodu** — nabídnou se jen závody, kde dnešní datum padá do rozsahu odjezd–návrat, nebo které skončily nejvýš před dvěma dny (aby šlo doplnit i o den později). Je-li vyhovující jen jeden, appka do něj vstoupí rovnou.
- **Potvrzování jel/nejel** — u každého přiřazeného motoru dvě velká tlačítka JEL/NEJEL; zápis se projeví okamžitě (ještě než odpoví server) a váže se na dvojici závod+motor, ne na konkrétní přihlášku — díky tomu na to navazuje fronta na servis. Lze zapsat i po skončení závodu, na rozdíl od jiných úprav plánu (kde po dokončení smí zasahovat jen superadmin).
- **Motohodiny (Oppama) na place** — pokud pilot jel a motor patří k rodině, která motohodiny sleduje (vše kromě MINI a OKJ), zobrazí se pole na zápis ve formátu HH:MM. Zápis se přidá do servisní historie motoru **s datem konce závodu** (ne dneškem), aby pořadí záznamů v historii sedělo, i když se zapisuje o den později.
- **Rychlé předávky zákazníkům** (jen superadmin a vedení) — jednoduchý formulář: komu, co (ze skladu s automatickým odečtem množství, nebo volný text), kolik kusů, za kolik, zaplaceno. Ukládá se do stejných dat jako plnohodnotná záložka Předávky v detailu závodu — jde jen o rychlejší cestu zápisu přímo v boxech.
- RACE MODE neobsahuje logistiku, organizátorské údaje, finance pilotů ani přiřazování motorů/karburátorů — to všechno zůstává jen v sekci Závody → Plán.

---

## 3. Tým

### 3.1 Piloti

Číselník pilotů s vlastní detailní kartou historie a financí.

**Seznam**: filtrovací dlaždice s počty (Aktivní, MINI, OKJ, OKN, OK, KZ, Neaktivní), tabulka (foto, jméno, tým, kategorie, startovní číslo, národnost, stav).

**Pole záznamu**: jméno (povinné), tým (nebo bez týmu), výchozí kategorie, startovní číslo, národnost, stav Aktivní/Neaktivní (neaktivní = zmizí z výchozích filtrů, historie zůstává), **fakturační režim** — Platí sám / Tým (jen má-li pilot vybraný tým) / Zákazník (vyžaduje výběr konkrétního zákazníka) — určuje, na koho půjde faktura za jeho starty; fotka (do 5 MB); poznámky.

**Archivace** (jen superadmin) — nikdy fyzické smazání, historie závodů zůstává dohledatelná.

**Detailní karta pilota** — hlavička s fotkou a základními údaji, tisk/PDF; statistiky (počet závodů, kategorií, použitých motorů a karburátorů); **finance pilota** (jen s právem na finance) — filtry podle závodu/měny/stavu platby, souhrn po měnách, řádek „Fakturuje se" ukazující skutečný cílový subjekt podle fakturačního režimu; nejbližší závod s konkrétními motory/karburátory na jeho pozicích; kompletní historie startů (závod, kategorie, motory a karburátory 1–3, cena a stav platby, stav závodu).

### 3.2 Týmy

Stejný princip jako u pilotů. **Pole**: název (povinný), země, volitelné propojení na existujícího zákazníka (pro centrální fakturaci za všechny piloty týmu), logo, poznámky. **Detailní karta týmu**: statistiky (počet závodů, pilotů, motorů, karburátorů), finance týmu s navíc rozpisem podle jednotlivého pilota, nejbližší závod a kompletní historie (navíc se sloupcem Pilot, protože jeden tým může mít víc pilotů na startu). Archivace jen pro superadmina, historie zůstává.

### 3.3 Zákazníci a karta zákazníka

Zákazníci jsou lidé nebo firmy, kterým se prodává (sekce Prodej) nebo pro které se servisují motory (Zakázky). **Pole**: jméno/firma (povinné), telefon, e-mail (musí být platný formát, nesmí se duplikovat s existujícím aktivním zákazníkem), adresa, IČO, DIČ, poznámky, kód země, **sleva na práci** a **sleva na materiál** v procentech (0–100, automaticky se ořežou na rozsah) — používají se jako výchozí sleva při zakládání nové zakázky pro tohoto zákazníka.

Seznam zákazníků zobrazuje i souhrn: počet prodejů (nestornovaných) a jejich celkovou hodnotu. Smazání (jen superadmin) je archivace, ne fyzické mazání.

**Karta zákazníka** (detail) je centrální místo, kde se sbíhá vše, co se u tohoto zákazníka kdy odehrálo:
- základní kontaktní údaje a nastavené slevy,
- **historie motorů zákazníka** — všechny motory, které si u nás kdy nechal servisovat (typ motoru, kdy přišel, aktuální/poslední stav zakázky),
- **historie zakázek** — přehled všech zakázek daného zákazníka napříč stavy (nová/v práci/čeká na díl/hotovo/vyfakturováno/zrušeno), s odkazem do detailu každé,
- křížové vyhledávání umožňuje najít zákazníka i z kontextu zakázky nebo motoru a naopak (viz kapitola 6.2 „Zakázky").

### 3.4 Mechanici

Základní evidence je záměrně jednoduchá (jen jméno), ale detailní karta shromažďuje bohatou historii.

**Seznam**: jméno + nejbližší/poslední závod (nebo „Bez plánovaného závodu"). Archivace jen superadmin, historie zůstává.

**Detailní karta mechanika**: statistiky (počet závodů celkem, nadcházející závody, počet navštívených zemí, dny na cestách), nejbližší závod s přiřazeným autem a rozbalenou cestovní kartou, panel **„Oblečení a velikosti"** (co má mechanik aktuálně přiřazeno — jen zobrazení, editace probíhá v sekci Oblečení), a kompletní historie závodů s rozbaleným detailem cesty ke každému (ubytování, letenky, pronájem auta) — vše připravené k tisku/PDF.

### 3.5 Oblečení

Evidence týmového vybavení mechaniků — velikosti, počty kusů, fotky. Dvě záložky.

**Přiřazení mechanikům** — pro vybraného mechanika se zobrazí karta ke každé položce katalogu (i těm, které mu ještě nejsou přiřazeny): velikost (jen z povolených velikostí dané položky), počet kusů (1–20), poznámka, datum předání (zafixuje se při prvním přiřazení a dál se neposouvá). Přiřazovat/odebírat smí jen superadmin a vedení. **Přehled celého týmu** — dlaždice s počtem přiřazených položek pro každého mechanika.

**Nastavení oblečení** (katalog) — název položky, výchozí počet kusů, dostupné velikosti (seznam, pořadí se zachovává v nabídce), fotka (do 10 MB — vyšší limit než jinde v systému), poznámka. Smazání typu (jen superadmin) je zakázané, dokud je položka někomu přiřazená; totéž pro odebrání konkrétní velikosti, která je právě u někoho použitá. Tlačítko **„Přidat doporučenou sadu"** jednorázově založí šest standardních položek (kombinéza, boty, rukavice, funkční prádlo, pláštěnka, tričko) s běžnými velikostmi, pokud v katalogu ještě nejsou.

### 3.6 Kdo co v sekci Tým smí

Piloti, Týmy, Karburátory (viz kapitola 4), Mechanici, Oblečení a Auta jsou vyhrazené **superadminovi a vedení**. Mechanik k nim nemá přístup na žádné úrovni — nejde jen o schované menu, žádná z příslušných API cest není na jeho whitelistu, takže i přímý dotaz by dostal odmítnutí. Sekce Zákazníci a karta zákazníka patří logicky pod Zakázky (kapitola 6.2) a řídí se stejným pravidlem — mechanik k nim nemá přístup, jeho jediná obrazovka pro zákaznický motor je zjednodušený pracovní panel bez cen zakázky.

---

## 4. Vybavení

### 4.1 Motory — karta motoru

Karta motoru je centrální místo pro vše, co se motoru týká. V záhlaví je vždy vidět barevný štítek (viz níže), kód motoru, stavový štítek (Připraveno/Brzy servis/Servis/Přestavba/Sklad/Vyřazen) a řádek s rodinou/variantou/zapalováním. Karta má záložky: **Přehled, Technické údaje, Servisní karta, Motohodiny** (jen u rodin, které je sledují), **Historie, Dokumenty, QR kód**.

**Přehled** shrnuje: základní informace (kód, rodina, zapalování, úprava, datum nákupu, aktuální jezdec), aktuální provoz (u rodin s motohodinami velké počítadlo ojnice/kliky s ukazatelem, u ostatních poznámka o kalendářním servisu), rychlé akce, **polohu motoru** (Na závodě / Zápůjčka — s upozorněním na prošlý termín — / V dílně, se zápůjčním formulářem), poznámky a náhled technických údajů. Motor nejde zapůjčit, je-li už na závodě nebo v jiné zápůjčce se stejným termínem.

**Technické údaje** — digitální přepis fyzické karty motoru. Superadmin může pro každou rodinu motoru v Nastavení nadefinovat vlastní strukturu (sekce → pole → možnosti výběru, s volbou počtu sloupců a s možností zvolit, které pole se má zobrazovat i na Přehledu) — dokud to neudělá, používá se stará pevná sada deseti polí (píst, válec, úprava válce, liner, degree, timing, carter, reeds, spacer, squish). Superadmin může strukturu jedné rodiny zkopírovat do dalších rodin (jednorázově, žádná trvalá vazba) a rodiny, které už vlastní strukturu mají, se při kopírování automaticky přeskočí.

**Motohodiny** — u rodin OKN, OKN-J, OK a KZ se sleduje čas na pístu, na ojnici/klice a poslední zápis „Oppama" (ve formátu HH:MM). Po každém zápisu, opravě nebo smazání se **celá historie motoru přepočítá od nuly** (vstupní stav + všechny následné záznamy chronologicky), takže se počítadla a historie nikdy nerozejdou. Výměna kompletní ojnice vynuluje ojnici i píst, výměna jen pístu vynuluje jen píst. Vstupní stav (pro zavedení existujícího motoru) smí nastavit jen superadmin. Oprava a smazání záznamu motohodin/servisu je vždy jen superadmin.

**Servisní karta** — u kategorií, které mají v Nastavení zavedenou novou servisní kartu, se zobrazují dlaždice jednotlivých položek karty (píst, ojnice, brzdové destičky…) s barevným stavem podle najetého času vůči nastavenému intervalu (v pořádku/blíží se limitu/po limitu/bez měření). Zápis nového servisu: výběr typu servisu (automaticky předvyplní výchozí položky), datum a volitelný čas, mechanik, needitovatelný stav motohodin (bere se přímo ze serveru), zaškrtnutí provedených položek s volbou konkrétní varianty materiálu tam, kde je to definované. Pokud se zvolený materiál liší od hodnoty v technických údajích motoru, appka na to upozorní a nabídne automatické sjednocení. Název typu servisu, položky i materiálu se v okamžiku uložení vždy „zafotí" do záznamu (pozdější přejmenování definice historii nezmění). Oprava záznamu je možná jen do 24 hodin od zápisu, autorem nebo superadminem; po uplynutí lhůty (nebo kdykoliv pro superadmina) se dá jen **stornovat** s povinným důvodem — záznam se nikdy nemaže, jen zůstane v historii přeškrtnutý. Zápis servisu automaticky odbaví motor z fronty na servis. Kategorie, které na novou kartu ještě nepřešly, používají starý model (pevný checklist dílů, čtyři typy servisu, přímé nulování počítadel) — přechod na novou kartu nastavuje superadmin v Nastavení → Servisní karta (kapitola 7.2).

**Historie** — jedna souvislá časová osa napříč vším, co se s motorem kdy stalo: servis (i stornovaný, i podle starého modelu), účast na závodě, zápůjčka a její vrácení, zařazení do fronty a jeho odbavení, změna technického údaje (s rozlišením, zda šlo o ruční úpravu nebo o automatický přepis ze servisního zápisu — s odkazem přímo na daný servisní záznam), zápis motohodin, a systémové události (založení motoru, archivace, nastavení vstupního stavu apod. — skryté, dokud se nezapne přepínač „Zobrazit i systémové události"). Nahoře jsou filtrovací tlačítka podle typu události, jen ty, které mají aspoň jednu položku.

**Dokumenty** — k motoru lze nahrávat soubory (faktury, homologace, fotky) formátů PDF/PNG/JPG/WebP do 15 MB na soubor, max. 50 dokumentů na motor. U každého se vybírá typ dokumentu (z číselníku Nastavení → Typy dokumentů) a volitelná poznámka. Stažení může kdokoli s přístupem na kartu, mazání jen s právem správy. Mechanik se k této záložce vůbec nedostane.

**QR kód** — každý motor má trvalý, krátký veřejný kód (nemění se, i když se přejmenuje kód motoru), díky kterému je QR kód hrubší a lépe čitelný i v zamaštěné dílně. Záložka nabízí stažení PNG a tisk jednoho štítku (40×45 mm). Podrobnosti viz kapitola 4.5.

**Barevné označení motoru** — u každého motoru lze zvolit barvu (z předdefinované palety nebo vlastní), která se zobrazí jako čtvereček u kódu motoru a jako akcentová barva celé karty — pomáhá rychle rozlišit motory od pohledu.

**Rozdíly mezi rodinami motorů**: MINI se po každém dokončeném závodě automaticky přepne do stavu „Servis" (přestavuje se po každém závodě, ne podle hodin) a po zapsání servisu se automaticky vrátí na „Připraveno"; OKJ ani MINI motohodiny nesledují vůbec; OKN, OKN-J, OK a KZ motohodiny sledují.

**Prodej motoru** neprobíhá na kartě motoru samotné, ale v sekci Prodej (kapitola 6.1) — prodaný motor zmizí z nabídek pro závody, frontu na servis i QR vyhledávání, ale jeho historie zůstává navždy dohledatelná.

**Trvalé údaje** motoru (rodina, zapalování, generace KZ) po založení může měnit už jen superadmin — chrání to proti omylem přepsané identitě motoru.

### 4.2 Karburátory

Dvouúrovňová evidence: **katalog typů** (šablony — značka, model, kompatibilní kategorie, fotka) a **konkrétní kusy** (fyzický karburátor s kódem, stavem a historií).

Katalog typů: značka a model (povinné, kombinace musí být unikátní), zaškrtnutí kompatibilních kategorií (aspoň jedna), fotka, poznámky; karta typu v katalogu ukazuje i počet kusů daného typu v evidenci. Typ nejde smazat, dokud ho používá existující karburátor.

Konkrétní kus: kód (unikátní, formát velká písmena/číslice/pomlčka), povinný výběr z katalogu typů (značka a model se přeberou automaticky), kategorie (jen z těch, které typ povoluje), stav (Připraveno/Servis/Sklad/Vyřazen), poznámky. Prodané kusy (s datem prodeje v minulosti) automaticky mizí ze všech výpisů a filtrů.

Detail karburátoru má tři záložky: **Přehled** (fakta, aktuální přiřazení na závod/pilota, poslední servis), **Historie závodů** (závod, pilot, tým, spárovaný motor, pozice), **Servisní historie** (datum, typ servisu, mechanik, provedené práce, vyměněné díly, poznámka — kliknutím na řádek se dá upravit). Servisní záznamy karburátoru jsou samostatná historie, needitují se přes formulář karburátoru.

### 4.3 Auta

Evidence vozového parku dílny s fotkou, nájezdem kilometrů a servisním upozorněním.

Pole: název (povinný), SPZ, aktuální nájezd v km, servisní interval v km, fotka, poznámky. Systém sám dopočítává **stav servisu** ze vztahu aktuálního nájezdu, intervalu a km při posledním servisu: bez sledování (chybí údaje) / Servis potřeba (červeně, zbývá 0 km nebo míň) / Brzy servis (žlutě, zbývá do 1000 km) / Připraveno (zeleně). Tento štítek se ukazuje v seznamu i na detailu a promítá se i do plánu závodu (upozornění, že přiřazené auto potřebuje servis).

Detail auta: fakta (nájezd, interval, poslední servis, stav), historie závodů (kde bylo auto nasazené a s jakou posádkou), servisní historie (datum, nájezd, provedené práce, mechanik) s formulářem přidání/úpravy servisu. Po uložení servisního záznamu appka **automaticky přepočítá** souhrnná pole auta (aktuální km, poslední servis) z nejnovějšího záznamu — a stejně tak po smazání záznamu.

### 4.4 Servis (fronta na servis)

Pracovní deska ukazující motory čekající na servisní zásah — nikam se trvale neukládá, počítá se vždy znovu ze tří zdrojů, takže se sama opraví, když se něco změní jinde v systému:

1. **Motor se vrátil ze závodu** — den po skončení závodu se do fronty zařadí každý motor, který na něm byl přiřazený (systém nepozná, který motor skutečně jel, proto raději „přestřelí" a zařadí víc motorů, než je nutné — pokud RACE MODE zaznamenal, že motor „nejel", do fronty se za ten závod nezařadí).
2. **Motor se vrátil ze zápůjčky** — jakmile je vyplněné skutečné datum vrácení.
3. **Motor byl zařazen ručně** — kdokoli přihlášený může motor přidat s povinnou poznámkou proč (např. „divný zvuk").

Pokud se u jednoho motoru sejde víc důvodů, zobrazí se jen jedna dlaždice — jeden motor, jedno odbavení vyřídí všechny důvody najednou. Archivovaný nebo prodaný motor se do fronty nikdy nezařadí.

**Vzhled desky**: digitální hodiny s datem (deska slouží i jako nástěnka v dílně), filtrovací dlaždice podle kategorie s počty, volitelná hustota zobrazení (1–6 dlaždic na řádek, pamatuje se per zařízení, ne per účet), automatické obnovení každou minutu.

**Řazení**: nejdřív motory, na kterých už někdo pracuje (nejdéle zabraný nahoře), pak motory s nejbližším naplánovaným závodem, nakonec ostatní podle data návratu do dílny.

**Barevné zvýraznění naléhavosti**: dlaždice motoru s blížícím se závodem, dlaždice ručně zařazeného motoru, a u zabraného motoru odlišení podle délky práce — čerstvě zabraný / dlouho rozdělaný (přes 4 hodiny) / přes noc (byl zabraný ještě předešlý kalendářní den). Přebarvuje se samo každých 30 sekund.

**Akce**: „Beru si ho" (zabrání — smí kdokoli přihlášený; na sdíleném účtu dílny appka navíc nechá vybrat konkrétního mechanika, aby se u zabraného motoru nezobrazovalo pořád stejné společné jméno), „Vrátit do fronty" (uvolnění — smí jen ten, kdo motor zabral, nebo vedení/superadmin), hromadné i jednotlivé **„Nejel / bez servisu"** (odbaví bez vytvoření servisního záznamu, s uložením kdo a kdy — typicky po velkém závodě, kdy ve frontě zůstane spousta motorů, které ve skutečnosti nejely) a **„Přidat motor do fronty"** (ruční zařazení s povinnou poznámkou).

Pod hlavní deskou je oddělená sekce **„Zákaznické motory"** (zdůrazněno textem „Naše motory mají přednost") s dlaždicemi zákaznických motorů čekajících na zakázkový servis — termín dokončení je barevně zvýrazněný (po termínu / blíží se do 2 dnů / v pořádku). Kliknutím se otevře mechanikova zjednodušená pracovní obrazovka pro daný motor (viz kapitola 6.2).

**Celoobrazovkový režim bez menu** (`/servis-fronta`) slouží dvojímu účelu — nástěnce na zdi v dílně (sdílený účet) i domovské a jediné obrazovce mechanika. Obsahuje odkaz na RACE MODE a (jen pro vedení/superadmina) odkaz zpět do plné aplikace. Umí se otevřít rovnou na konkrétním motoru (z QR kódu). Po kliknutí na dlaždici se otevře zápis servisu daného motoru bez menu; pokud kategorie ještě jede na staré servisní kartě, appka to řekne a nabídne odbavení nebo doporučí zápis v plné aplikaci.

### 4.5 Servisní historie

Samostatná sekce (nedostupná mechanikovi) odpovídající na otázku „co se v dílně za dané období udělalo" — na rozdíl od časové osy jednotlivého motoru. Čerpá zároveň z nové i staré servisní karty, aby report nikdy neukázal jen část reality.

**Filtry**: období (Dnes/Tento týden/Tento měsíc/Vlastní rozsah), kategorie, motor, mechanik.

**Report** s pěti čísly: Čekalo na servis, Odbaveno servisem, Nejel/bez servisu, Zbývá ve frontě (první čtyři se počítají z fronty podle data, kdy motor frontu opustil), a nezávisle **Zapsaných servisů** (podle data servisu — zahrnuje i servisy mimo frontu, proto se číslo může od ostatních legitimně lišit; appka to v poznámce vysvětluje). K tomu tabulky „Podle kategorie" a „Kdo kolik udělal" (počet zapsaných servisů na mechanika — odbavení „Nejel" se sem nepočítá, protože to není odvedená práce). Report se vždy dopočítává za běhu z živých dat, takže se zpětně opraví, pokud se něco v mezičase změní (smaže se závod, opraví datum apod.).

Tabulka jednotlivých záznamů: datum a čas, kategorie, motor, typ servisu (u staré karty se štítkem „Stará karta"), mechanik, co se dělalo, poznámka (u stornovaného záznamu důvod storna místo poznámky, se štítkem „Storno"). Export ani tisk tato sekce nenabízí — je čistě k prohlížení na obrazovce.

### 4.6 QR kódy

**Hromadný tisk (arch štítků)** — samostatná stránka pro vytištění QR štítků na motory z vybrané kategorie najednou. Fyzický rozměr štítku je pevný 40×45 mm, na list A4 se jich vejde 20, na tisku max. 4 na řádek (na obrazovce lze nastavit i víc pro náhled). Tiskne se přesně to, co je vyfiltrované. Motor bez veřejného kódu se do archu nezahrne. Každý štítek nese QR kód, kód motoru, kategorii a čitelný krátký identifikátor (pro dohledání i od oka, bez čtečky).

**QR kód na kartě motoru** — vlastní panel s QR kódem, tlačítky Stáhnout PNG a Vytisknout štítek, textovou adresou a čitelným krátkým identifikátorem. Korekce chyb v kódu je zvýšená (kód se má přečíst i po částečném poškození nebo zamaštění štítku) — proto je důležité mít krátkou „základní adresu" (nastavuje se v Nastavení → Obecné).

**Co se stane po naskenování** — odkaz je trvalý a krátký, nezávislý na vnitřní struktuře appky, takže zůstává platný, i kdyby se appka později přestavěla. Nepřihlášeného uživatele appka nejdřív pošle na přihlášení a pak ho vrátí přesně na naskenovaný motor. Pokud kód neodpovídá žádnému živému motoru (vyřazen/prodán), zobrazí se „Tenhle motor tu není" s vysvětlením. Pokud motor existuje: mechanik jde rovnou do celoobrazovkového režimu na kartu motoru, ostatní role se otevřou v plné aplikaci na servisní kartě.

### 4.7 Sklad dílů

Evidence náhradních dílů. Karty s fotkou, kódem, názvem, popisem, štítky kompatibilních kategorií motorů (nebo „Všechny typy"), aktuálním skladovým množstvím (barevně zvýrazněné při nízkém stavu) a cenou zvlášť v CZK a EUR bez DPH.

Množství se **automaticky odečítá**, když se díl vybere jako položka v Prodeji (kapitola 6.1) nebo jako materiál v zakázce (kapitola 6.2), a **automaticky se vrací**, když se prodej/zakázka stornuje nebo se položka odebere/upraví. Appka nedovolí prodat/použít víc kusů, než je skladem. Smazání dílu (jen superadmin) je archivace — historie prodejů zůstává.

Součástí stejné sekce je i starší **Servisní ceník** (`service_catalog`) — číselník předdefinovaných prací s cenou v CZK a EUR, používaný výhradně jako zdroj položek typu „Servis/práce" v Prodeji. Je to záměrně oddělené od servisu motorů i od zakázkového servisu (viz kapitola 6.2, kde má zakázkový servis vlastní, novější ceník prací).

### 4.8 Kdo co v sekci Vybavení smí

Piloti, Týmy, Karburátory, Mechanici, Oblečení a Auta jsou pro mechanika nedostupné na žádné úrovni (viz kapitola 3.6 a 8). Frontu na servis, servisní kartu, technické údaje a historii motoru mechanik naopak vidí a smí do nich zapisovat — je to jeho hlavní pracovní nástroj; obchodní pole (nákupní/prodejní cena, kde je motor zapůjčen) se mu ale z odpovědi vždy odříznou. Servisní historii (report za období), Dokumenty motoru, Zápůjčky a Sklad dílů mechanik nevidí vůbec, ani ke čtení.

---

## 5. Logistika

Tři sekce se stejnou logikou (Ubytování, Letenky, Pronájem aut) — každý záznam lze založit buď přímo v menu Logistika, nebo rovnou z panelu „Cesta a ubytování" v detailu závodu (kde je vazba na závod předvyplněná a zamčená).

### 5.1 Ubytování

Pole: vazba na závod, název a adresa (povinná), web a odkaz na Booking (musí být platná webová adresa), check-in/check-out (výjezd musí být později než příjezd), počet pokojů a osob, číslo rezervace, stav platby (Nezaplaceno/Částečně/Zaplaceno), cena a měna, stav (Plánováno/Rezervováno/Zrušeno), poznámky.

**Vzdálenost od tratě** se počítá tlačítkem „Spočítat podle adresy" (appka dohledá vzdálenost v km a dobu jízdy podle uložené polohy okruhu) nebo se dá zadat ručně; v detailu je i odkaz „Trasa na trať" přímo do Google Map.

**Přílohy** — libovolný počet PDF/PNG/JPG/WebP souborů (rezervace, doklady), max. 15 MB na soubor, max. 20 na záznam, s náhledem a samostatným mazáním jednotlivé přílohy.

### 5.2 Letenky

Pole navíc rozlišují **typ cesty** — Tam / Zpět / Tam i zpět / Jiný. U „Tam i zpět" appka rozdělí formulář na dvě sekce (cesta tam, cesta zpět), každá se svými letišti, časy, aerolinkou, číslem letu a rezervačním kódem — appka hlídá, že zpáteční let nezačíná dřív, než skončí let tam. Dále: kdo letí (výběr z mechaniků/týmu, případně volná poznámka), zavazadla, cena, měna, stav, poznámky. Přílohy se u zpáteční cesty rozdělují na „cesta tam" / „cesta zpět" (plus starší „společné" přílohy z doby před rozdělením).

### 5.3 Pronájem aut

Pole: společnost/půjčovna, typ auta, místo převzetí a vrácení, čas převzetí a vrácení (vrácení musí být později), rezervační kód, SPZ, hlavní řidič, cena, měna, stav, poznámky. Přílohy stejným způsobem jako u ostatních dvou sekcí.

### 5.4 Společné vlastnosti a oprávnění

Všechny tři sekce logují každou akci (vytvoření/úprava/smazání/nahrání či odstranění přílohy) do auditního logu. Zápis a úpravy smí superadmin a vedení; smazání celého záznamu (i s přílohami, které se fyzicky odstraní z úložiště) je vyhrazeno jen superadminovi, s potvrzovacím dialogem. Mechanik k datům Logistiky nemá přístup vůbec — jeho verze aplikace tuto sekci neobsahuje ani ke čtení.

---

## 6. Obchod

### 6.1 Prodej

Evidence prodeje motorů, karburátorů, dílů ze skladu a servisních prací. Tři záložky: **Aktivní prodeje**, **Prodané motory**, **Prodané karburátory**; nahoře souhrn aktivních tržeb zvlášť v CZK a EUR.

Každý prodej dostane automaticky číslo ve tvaru `PRO-RRRR-NNNN` (rok + pořadové číslo od 1 v daném roce). Kupující se volí ve čtyřech režimech: existující zákazník, nový zákazník (rovnou se založí, s automatickou ochranou proti duplicitě podle e-mailu/jména), tým, nebo **rychlý prodej** bez jakékoli evidence osoby (pro drobný prodej za hotové, např. jedna svíčka).

Hlavička prodeje: datum, volitelné číslo faktury/dokladu, měna cen (přepnutí přepočítá ceny servisních položek podle aktuální ceny v ceníku), forma platby, příznaky Zaplaceno a Předáno, volitelná vazba na závod, poznámka.

Položky prodeje mohou být: **motor** nebo **karburátor** (konkrétní kus z evidence — appka odmítne prodat kus, který je už prodaný nebo přiřazený k budoucímu/aktivnímu závodu, s konkrétním vysvětlením proč), **díl ze skladu** (s kontrolou dostupného množství), **servis/práce** (ze Servisního ceníku, cena se doplní automaticky a nejde ručně přepsat) nebo **ostatní/díly** (volná položka bez vazby na číselník).

Při uložení appka označí prodaný motor/karburátor jako prodaný a odečte prodané množství ze skladu; při úpravě prodeje appka nejdřív vrátí staré položky zpět a pak uloží nové, aby sklad i evidence vybavení zůstaly v pořádku. **Stornovat** prodej smí jen superadmin — appka ho neodstraní, jen označí jako zrušený a automaticky vrátí do evidence vše, co bylo prodejem vázáno (motor/karburátor je znovu k prodeji, díl se vrátí na sklad).

Záložky „Prodané motory"/„Prodané karburátory" mají tlačítko **„Zobrazit použití a servis"**, které i po prodeji ukáže kompletní historii kusu (závody, motohodiny, servisy) — historie se prodejem neztrácí.

### 6.2 Zakázky (zakázkový servis pro zákazníky)

Samostatný modul pro servis cizích (zákaznických) motorů — na rozdíl od vlastních týmových motorů v kapitole 4, tady jde o placenou zakázku s vlastním číslem, cenou, slevou a fakturací.

**Zakázka** eviduje: zákazníka (z Karty zákazníka, kapitola 3.3), motor (typ podle číselníku Nastavení → Typy motorů pro servis — nezávislý na kategoriích vlastních motorů, takže sem patří i motokros a cokoliv dalšího), termín přijetí a slíbený termín dokončení, stav (nová/přijato/v práci/čeká na díl/hotovo/vyfakturováno/zrušeno/v koši), a slevu (výchozí se přebere z karty zákazníka, ale jde upravit pro konkrétní zakázku).

**Rozsah práce a materiál**: mechanik i vedení přidávají provedené práce výběrem z **Ceníku prací** zakázkového servisu (Nastavení → Ceník prací — kód, název, popis „co je v ceně", cena v CZK a EUR) a použitý materiál buď ze **Skladu** (s automatickým odečtem), nebo jako „zákazníkův vlastní díl" bez ceny. Očekávané (čekané) díly se evidují zvlášť a označují jako objednané/dorazilé — jakmile díl dorazí, zakázka se automaticky vrátí ze stavu „čeká na díl" zpátky do „v práci".

**Fotky a přílohy** k zakázce (např. stav motoru při přijetí) se dají nahrát obdobně jako u dokumentů motoru.

**Koš a mazání** — zakázku lze přesunout do koše (ne smazat rovnou); z koše ji superadmin může obnovit, nebo po 30 dnech appka koš sama automaticky vyčistí (lze i ručně vyprázdnit dřív, jen superadmin). Vyfakturovanou zakázku appka uzamkne proti dalším změnám — odemknout ji smí jen superadmin.

**Cena a sleva** se vždy dopočítávají na serveru z ceníku a zadaného množství — mechanik nikdy nezadává cenu ani slevu ručně a ve svém zjednodušeném pohledu (viz níže) je ani nevidí.

**Tisk** — zakázkový list (rozsah práce, díly, cena) jde vytisknout stejným principem jako ostatní tiskové výstupy v systému (kapitola 11).

**Mechanikova obrazovka pro zákaznický motor** — jediná, zjednodušená pracovní obrazovka (bez menu, součást fronty na servis, kapitola 4.4): mechanik vidí rozsah práce, informace o zákazníkovi a typu motoru, zda je součástí servis karburátoru, zda si zákazník přivezl vlastní díly, aktuální stav a kdo na motoru pracuje. Může: vzít si motor do práce, přepnout na „čeká na díl", označit hotovo (s potvrzením, protože po tomto kroku zakázku už vidí jen vedení při kontrole), přidávat/mazat provedené práce a materiál, přidávat/mazat čekané díly. Cenu, slevu ani celkový součet zakázky mechanik nikde nevidí ani nezadává. Uzavřenou zakázku (zrušenou, v koši, nebo vyfakturovanou a neodemčenou) už mechanik nesmí upravovat.

**Křížové hledání** — z Karty zákazníka (kapitola 3.3) lze dohledat všechny jeho motory a zakázky, a naopak z detailu zakázky se dá skočit přímo na kartu zákazníka; totéž funguje napříč vyhledáváním v celé appce (hledání zákazníka najde i jeho zakázky a naopak).

### 6.3 Dokumenty (checklisty vybavení)

Položka menu „Dokumenty" (v levém menu Obchodu) neslouží k dokumentům motoru ani zakázky — je to knihovna **šablon kontrolních seznamů** (checklistů) pro balení a vybavení na závod: jednotlivé položky mají sekci, číslo dílu, název a množství. Šablona se pak volitelně připojí ke konkrétnímu závodu (záložka Checklist v detailu závodu) — tam se z ní stane samostatná instance, kterou lze na place odškrtávat, aniž by se upravila původní šablona. Mazání šablony (jen superadmin) je vždy jen archivace.

### 6.4 Kdo co v sekci Obchod smí

Prodej a Sklad jsou pro mechanika zcela nedostupné (kapitola 4.8). Do Zakázek mechanik nesmí vůbec — nemá přístup ani ke čtení na `/api/service-orders`; pro jeho práci existuje jen úzká, samostatná cesta `/api/customer-service`, která mu ukáže výhradně motor, na kterém právě pracuje, a ceníkové jednotkové ceny (aby věděl, co vybírá), ale nikdy slevu ani celkovou cenu řádku — obě se skrývají společně, protože ze zbylých dvou údajů (ceny a množství) by šla sleva zpětně dopočítat.

---

## 7. Nastavení

Sekce dostupná výhradně roli **superadmin** — ostatním rolím se v menu vůbec nezobrazí a přímý přístup na adresu Nastavení jim ukáže uzamčenou kartu „Tuto část může spravovat pouze superadmin." Má sedm záložek: Přístupy a role, Servisní karta, Technické údaje, Typy dokumentů, Typy motorů pro servis, Ceník prací, Obecné.

### 7.1 Přístupy a role

Přihlašování běží přes ověřený ChatGPT/OpenAI účet — appka nikdy neukládá žádné heslo a nemůže ho zobrazit ani změnit; změna hesla probíhá jen v uživatelově ChatGPT účtu. Přístup do appky má jen aktivní účet uvedený v seznamu uživatelů zde.

Přehledové dlaždice: počet aktivních uživatelů, počet superadminů. Tabulka uživatelů: jméno, e-mail, role (superadmin/vedení/mechanik — s krátkým popisem každé role přímo v UI), jazyk rozhraní, stav (aktivní/pozastavený), akce Upravit. Uživatele nejde smazat, jen deaktivovat — historie jeho práce v systému zůstává.

Dvě samostatné pojistky proti uzamčení systému: **u vlastního účtu** nejde v editaci změnit vlastní roli ani zrušit vlastní aktivní přístup; a appka **nikdy nedovolí**, aby po úpravě (změna role nebo deaktivace kohokoli) v systému nezůstal ani jeden aktivní superadmin.

### 7.2 Servisní karta

Nejsložitější záložka Nastavení — pro každou kategorii motoru zvlášť (MINI, OKJ, OKN, OKN-J, OK, KZ) definuje, jak vypadá jeho servisní karta (kapitola 4.1). Tři podzáložky:

- **Typy servisu** — kód, název, popis, pořadí (přetažením); u každého typu se zaškrtnutím vybírají výchozí položky karty, které se při zápisu servisu automaticky předvyplní. Tlačítko „Převzít z…" umožňuje jednorázově zkopírovat zaškrtnutí z jiného typu (bez trvalé vazby).
- **Položky karty** — název, volitelná kategorie materiálu (prázdná = jen zaškrtávátko bez výběru varianty), interval a varovný práh v procentech (jen u kategorií, které sledují počítadlo), pořadí.
- **Materiál** — kategorie materiálu (např. Písty, Těsnění) → atributy dané kategorie (např. Značka, Rozměr; typ Výběr/Číslo/Text, u Výběru štítky zadávané přes Enter) → konkrétní varianty (to, co si mechanik skutečně vybírá — atributy samotné mechanik nikdy nevyplňuje ručně). Atribut typu Výběr lze propojit s odpovídajícím polem v technických údajích motoru, aby appka uměla upozornit na rozpor mezi zapsanými technickými údaji a použitým materiálem.

Kategorie, která ještě nemá novou kartu zavedenou, má speciální panel s tlačítkem **„Přepnout na novou kartu"** — zablokovaným, dokud nemá aspoň jednu položku a dokud kritické položky (píst, ojnice/klika) nemají vyplněný interval. Po potvrzení appka vysvětlí, co konkrétně zanikne (automatické nulování starých počítadel) a co to nahradí, a založí pro každý motor kategorie výchozí záznam dopočítaný z dnešních motohodin, aby dlaždice nezačaly od nuly. Samostatný panel navíc umožňuje **přenést starou historii servisu** (napříč kategoriemi) do nového formátu, s náhledem před ostrým spuštěním a možností přenos i vzít zpět.

### 7.3 Technické údaje

Pro každou rodinu motoru zvlášť definuje strukturu technické karty (kapitola 4.1): počet sloupců mřížky, sekce, pole (typu Text nebo Výběr, s volbou „Zobrazit i na Přehledu"), možnosti u polí typu Výběr — vše s pořadím měnitelným přetažením a s archivací místo mazání. Rodina bez vlastní struktury dostane návrh převodu podle původních tří sekcí a deseti polí staré karty, který lze upravit a buď převést (i s přenosem existujících hodnot), nebo začít s prázdnou strukturou. Strukturu jde jednorázově zkopírovat do dalších rodin — rodiny, které už vlastní strukturu mají, se automaticky přeskočí.

### 7.4 Typy dokumentů

Číselník typů dokumentů přikládaných ke kartě motoru (faktura, homologace apod.) — název, příznak „Předává se kupci" (zatím jen informativní, samotné předávání dokumentů kupci ještě není funkčně navázané), pořadí, archivace místo mazání.

### 7.5 Typy motorů pro servis

Číselník typů motorů pro **zakázkový servis** (nezávislý na kategoriích vlastních motorů) — kód (unikátní), název, pořadí, archivace místo mazání.

### 7.6 Ceník prací

Ceník položek pro zakázkový servis: kód (unikátní), název, popis „co je v ceně" (tiskne se na zakázkový list), cena v CZK a EUR bez DPH (zadávané samostatně, appka je kurzem nepřepočítává), volná textová skupina pro filtrování, pořadí, archivace místo mazání.

### 7.7 Obecné

Zatím jediná hodnota: **základní adresa pro QR kódy** — pokud zůstane prázdná, appka místo ní použije adresu, ze které byla zrovna appka otevřená. Změna se projeví okamžitě u všech QR kódů, není potřeba nic přegenerovávat ručně.

---

## 9. Co systém hlídá a počítá sám

Řada věcí v MM System se **nezadává ručně** — systém je buď automaticky dopočítá, nebo si sám pohlídá, aby nešlo omylem uložit nesmysl.

- **Motohodiny a servisní počítadla** se po každém zápisu, opravě nebo smazání přepočítají znovu od vstupního stavu přes celou historii motoru — nikdy se neukládá jen „nová hodnota", vždy se dopočítá z toho, co se skutečně stalo (kapitola 4.1).
- **Veřejný kód motoru pro QR** se vygeneruje automaticky při založení motoru a už se nikdy nemění, i když se přejmenuje kód motoru samotného — díky tomu zůstávají vytištěné štítky navždy platné.
- **Číslo prodeje** (`PRO-RRRR-NNNN`) a čísla zakázek se přidělují automaticky, řadí se podle roku a appka sama vyřeší kolizi, kdyby se dva záznamy zkusily uložit ve stejný okamžik.
- **Fronta na servis** se nikam neukládá — počítá se vždy znovu ze tří zdrojů (návrat ze závodu, návrat ze zápůjčky, ruční zařazení), takže se automaticky opraví, když se něco změní jinde (smaže se závod, opraví se datum návratu apod.).
- **Stav vozidla** (Připraveno/Brzy servis/Servis potřeba) se dopočítává z aktuálního nájezdu, servisního intervalu a km při posledním servisu — nikde se nezadává ručně.
- **Barevný stav dlaždice servisní karty** (v pořádku/blíží se limitu/po limitu) se dopočítává z najetého času od poslední výměny vůči nastavenému intervalu a varovnému prahu.
- **Stav zakázky „čeká na díl"** se automaticky vrátí na „v práci", jakmile se čekaný díl označí jako dorazilý.
- **Kolize termínů** — appka nedovolí přiřadit téhož mechanika, auto, motor ani karburátor na dva závody (nebo na závod a zápůjčku) s překrývajícím se termínem, a nedovolí zapůjčit motor, který je v tu dobu už na závodě nebo v jiné zápůjčce.
- **Odbavení fronty na servis** proběhne automaticky při uložení servisního záznamu — mechanik nemusí frontu řešit zvlášť.
- **Přepočet skladu** — prodej nebo zakázka automaticky odečte použité množství ze skladu a při stornu/úpravě ho zase vrátí; appka nedovolí použít víc kusů, než je skladem.
- **Auto-přestavba u MINI** — po každém dokončeném závodě se motor rodiny MINI automaticky přepne do stavu „Servis" (tato rodina se přestavuje po každém závodě, ne podle motohodin); po zapsání servisu se u MINI zase automaticky vrátí na „Připraveno".
- **Historie se nikdy nepřepisuje updatem definice** — název typu servisu, položky karty i materiálu se v okamžiku zápisu „zafotí" (snapshot) do záznamu, takže pozdější přejmenování nebo archivace číselníku historii nezmění.
- **Nic se skutečně nemaže** — motory, piloti, týmy, mechanici, zákazníci, karburátory, auta, číselníky i servisní/prodejní záznamy se vždy jen archivují nebo stornují (`archived_at`/`cancelled_at`), nikdy fyzicky needstraní; jedinou výjimkou je koš u zakázek, který appka sama po 30 dnech vyprázdní, a přiřazení oblečení mechanikovi (to je jen vztah, ne historický záznam).
- **Auditní log** zaznamenává automaticky (bez ručního zásahu) kdo, kdy a co udělal — založení, úpravu, archivaci, storno, přiřazení, potvrzení — napříč prakticky celou appkou, a je vidět jak na Přehledu (poslední 3 akce), tak v historii jednotlivých závodů a motorů.
- **Poslední superadmin** nejde odebrat ani deaktivovat — systém by se tím mohl sám zamknout.
- Appka u nahrávaných souborů **kontroluje skutečný obsah**, ne jen příponu v názvu souboru — a hlídá limity velikosti a počtu (liší se sekci od sekce, typicky 5–15 MB na soubor).

---

## 10. Vícejazyčnost

Rozhraní existuje v češtině a angličtině. Každá obrazovka má v kódu jeden objekt s oběma překlady vedle sebe, takže při úpravě textu vidí vývojář obě jazykové verze pohromadě a nemůže zapomenout jednu z nich aktualizovat.

Jazyk rozhraní se nastavuje **za každého uživatele zvlášť** (v Nastavení → Přístupy a role) — dva lidé přihlášení ve stejnou chvíli tak mohou appku vidět každý ve svém jazyce. Číselníky se zadávají rovnou dvojjazyčně (název CZ + název EN u typů závodů, typů servisu, položek karty, typů dokumentů apod.) — appka si u prázdného anglického názvu občas vezme na pomoc český (např. u typů dokumentů), jinde anglický název vyžaduje zvlášť.

Jazyk **tiskového výstupu** je od jazyka rozhraní nezávislý — dá se zvolit zvlášť přímo při tisku, protože se může hodit vytisknout dokument pro zahraničního zákazníka nebo organizátora v jiném jazyce, než ve kterém právě pracuje obsluha.

---

## 11. Tisk a tiskové výstupy

Systém nemá žádný samostatný „export" modul — všechny tiskové výstupy fungují stejným principem: appka nastaví na stránce speciální příznak tiskového režimu, který v CSS skryje menu, filtry a vše ostatní nepodstatné, ponechá jen relevantní obsah, přepne rozvržení na fyzické rozměry papíru (A4, nebo pevný rozměr štítku 40×45 mm u QR kódů) a spustí tisk prohlížeče (odkud jde uložit i jako PDF). Po dokončení se appka sama vrátí do běžného zobrazení.

Tiskové výstupy existují minimálně na těchto místech:
- **Plán závodu** (fakta + kompletní přehled vybavení po kategoriích, každá kategorie na nové straně).
- **Piloti** (jen tabulky pilotů, zvětšené písmo pro čitelnost na place).
- **Checklist** (karty se zaškrtávacími poli, rozdělené do sloupců, s logem a identifikací závodu).
- **Finance závodu** (souhrny + tabulka plateb).
- **Kalendář** (měsíční mřížka bez ovládacích prvků).
- **Karta pilota, týmu a mechanika** (kompletní historie, tisk i uložení jako PDF).
- **Servisní/zakázkový list** (rozsah práce, díly, cena) v Zakázkách.
- **QR štítky** — hromadný arch (max. 4 na řádek, pevný rozměr štítku) i jednotlivý štítek z karty motoru.

Appka při tisku dočasně přejmenuje titulek okna (např. podle názvu závodu a data), aby uložené PDF mělo od začátku smysluplný název souboru.

---

## 12. Zálohování

Zálohování databáze je **ruční, na vyžádání** — spouští ho superadmin, není naplánované na žádný automatický interval. Použitý mechanismus (`VACUUM INTO`) vytvoří kompletní, samostatně použitelnou kopii celé databáze k danému okamžiku a uloží ji do složky `~/MM-WORKSHOP/mm-system-zalohy/` na počítači, ze kterého se záloha spouští. Žádná záloha se automaticky nemaže ani nerotuje — o úklid starých záloh se musí postarat obsluha ručně.

---

## 13. Co ještě není hotové

Poctivý výčet věcí, které appka zatím jen připravuje nebo neřeší vůbec:

- **Předávání dokumentů kupci při prodeji motoru** — příznak „Předává se kupci" u Typů dokumentů (Nastavení) je zatím jen informativní. Appka zatím nijak automaticky nesváže prodej motoru s předáním jeho dokumentů novému majiteli — druhý krok (`hand_over_to_buyer`) je připravený v datech, ale ve workflow prodeje se nepoužívá.
- **Odesílání dokumentů/reportů e-mailem** — appka nikde sama neposílá e-maily (potvrzení, faktury, reporty); vše, co appka vytvoří, se dá jen stáhnout/vytisknout a odeslat ručně mimo systém.
- **Automatické zálohování** — zálohuje se jen ručně na vyžádání (kapitola 12), žádný naplánovaný automatický běh ani rotace starých záloh neexistuje.
- **Ruční vyprázdnění koše zakázek před uplynutím 30 dnů** je sice technicky možné pro superadmina, ale v běžném provozu se koš čistí jen automaticky po uplynutí lhůty.
- **Export dat ze Servisní historie** (report za období) appka nenabízí — jde jen prohlížet na obrazovce, ne stáhnout jako soubor.
- **Přepočet měn** — appka nikde sama nepřevádí CZK na EUR ani naopak; obě ceny (u ceníků, prodeje i zakázek) se zadávají a evidují nezávisle vedle sebe.
- **Živá doprava a navigace** — vzdálenosti a doby jízdy (z dílny na trať, z ubytování na trať) jsou vždy jen orientační odhad podle silniční trasy, ne aktuální stav dopravy.
- Některé starší kategorie motorů dosud běží na **staré servisní kartě a staré struktuře technických údajů** (dokud je superadmin v Nastavení jednotlivě nepřepne na nový model) — po dobu přechodu tak v systému souběžně existují oba modely vedle sebe.

---

## 14. Struktura a rozsah

Tato kapitola je jediná v dokumentu, která popisuje appku technicky — je určená spíš pro
budoucí orientaci v repozitáři než pro běžného uživatele. Všechna čísla níže jsou **skutečně
spočítaná z repozitáře** (přes `git ls-files`, které automaticky vynechá `node_modules` i
`.git` a respektuje `.gitignore`), ne odhadnutá. Spočítáno **15. 9. 2026** skriptem, který:

1. vzal seznam všech souborů sledovaných gitem (`git ls-files`),
2. u kódových souborů (`.ts`, `.tsx`, `.css`, `.mjs`) spočítal řádky a znaky (`wc -l` / délka obsahu),
3. skutečné schéma databáze získal rozborem `db/runtime-schema.ts` — všech `CREATE TABLE IF NOT
   EXISTS` příkazů sloučených se všemi následnými `ALTER TABLE ... ADD COLUMN` (obě textové podoby,
   v jakých se v souboru vyskytují), takže odpovídá tomu, co appka skutečně vytvoří v databázi,
   ne zastaralému deklarativnímu zápisu v `db/schema.ts` (viz CLAUDE.md),
4. seznam API rout a jejich metody získal rozborem souborů `app/api/**/route.ts`,
5. přístup mechanika ověřil přímo podle whitelistů `MECHANIC_READ`/`MECHANIC_WRITE` v
   `app/api-access.ts` — to je jediný zdroj pravdy pro to, co mechanik smí, takže je to
   v tabulce níže 100% přesné; přístup ostatních rolí (kdy je něco jen pro superadmina) je
   u části rout jen odhad podle kódu dané routy a u pár rout se sdílenou kontrolou přístupu
   v pomocné funkci nemusí sedět úplně přesně.

**Tato čísla se změní s dalším vývojem appky** — přibudou další soubory, tabulky i API routy.
Kdokoliv bude chtít mít znovu přesná čísla, musí přepočítat stejným postupem, ne opisovat
čísla z tohoto dokumentu donekonečna.

### 14.1 Strom souborů (bez `node_modules` a `.git`)

Celý repozitář sledovaný gitem (`git ls-files`), seskupený podle složky. U kódových souborů (`.ts/.tsx/.css/.mjs`) je uveden počet řádků. Uvnitř skupiny řazeno abecedně.

**`app/api/…`  — API routy** — 61 souborů

`app/api/accommodation-distance/route.ts` (56 ř.); `app/api/activity/route.ts` (129 ř.); `app/api/app-settings/route.ts` (79 ř.); `app/api/carburetor-records/route.ts` (121 ř.); `app/api/carburetor-type-photo/route.ts` (115 ř.); `app/api/carburetor-types/route.ts` (104 ř.); `app/api/catalog/route.ts` (365 ř.); `app/api/checklists/route.ts` (99 ř.); `app/api/circuit-image/route.ts` (44 ř.); `app/api/circuit-location/route.ts` (14 ř.); `app/api/circuits/route.ts` (155 ř.); `app/api/clothing-image/route.ts` (95 ř.); `app/api/clothing/route.ts` (267 ř.); `app/api/competition-history/route.ts` (110 ř.); `app/api/customer-engines/route.ts` (155 ř.); `app/api/customer-search/route.ts` (71 ř.); `app/api/customer-service/route.ts` (334 ř.); `app/api/customers/route.ts` (104 ř.); `app/api/dev-session/route.ts` (73 ř.); `app/api/driver-photo/route.ts` (115 ř.); `app/api/engine-document-types/route.ts` (157 ř.); `app/api/engine-documents/route.ts` (205 ř.); `app/api/engine-loans/route.ts` (209 ř.); `app/api/engine-records/route.ts` (663 ř.); `app/api/engine-service-part-catalog/route.ts` (148 ř.); `app/api/engine-technical-structure/route.ts` (395 ř.); `app/api/engine-timeline/route.ts` (331 ř.); `app/api/engines/route.ts` (589 ř.); `app/api/inventory-image/route.ts` (73 ř.); `app/api/inventory/route.ts` (79 ř.); `app/api/logistics-attachments/route.ts` (117 ř.); `app/api/logistics/route.ts` (359 ř.); `app/api/mechanic-records/route.ts` (162 ř.); `app/api/race-activity/route.ts` (33 ř.); `app/api/race-checklists/route.ts` (136 ř.); `app/api/race-deliveries/route.ts` (155 ř.); `app/api/race-finance/route.ts` (179 ř.); `app/api/race-followup-notes/route.ts` (80 ř.); `app/api/race-mode/route.ts` (310 ř.); `app/api/race-planning/route.ts` (491 ř.); `app/api/race-team-visits/route.ts` (186 ř.); `app/api/race-template-logo/route.ts` (115 ř.); `app/api/races/route.ts` (330 ř.); `app/api/sales/route.ts` (301 ř.); `app/api/service-card-settings/route.ts` (562 ř.); `app/api/service-catalog/route.ts` (56 ř.); `app/api/service-engine-types/route.ts` (148 ř.); `app/api/service-history/route.ts` (331 ř.); `app/api/service-order-photos/route.ts` (153 ř.); `app/api/service-orders/route.ts` (1032 ř.); `app/api/service-price-items/route.ts` (185 ř.); `app/api/service-queue/route.ts` (416 ř.); `app/api/service-records/route.ts` (584 ř.); `app/api/session/route.ts` (13 ř.); `app/api/tasks/route.ts` (160 ř.); `app/api/team-logo/route.ts` (115 ř.); `app/api/users/route.ts` (193 ř.); `app/api/vehicle-photo/route.ts` (115 ř.); `app/api/vehicle-records/route.ts` (81 ř.); `app/api/vehicle-service-entries/route.ts` (135 ř.); `app/api/weather/route.ts` (43 ř.)

**`app/…` (mimo `app/api`) — obrazovky a sdílená logika** — 80 souborů

`app/api-access.ts` (226 ř.); `app/calendar-color-select.tsx` (56 ř.); `app/calendar-page.tsx` (109 ř.); `app/carburetor-detail.tsx` (99 ř.); `app/carburetor-type-photo.ts` (5 ř.); `app/catalog-pages.tsx` (625 ř.); `app/chatgpt-auth.ts` (86 ř.); `app/checklist-pages.tsx` (169 ř.); `app/circuit-image.ts` (5 ř.); `app/circuit-location.ts` (208 ř.); `app/circuits-page.tsx` (98 ř.); `app/clothing-image-url.ts` (5 ř.); `app/clothing-page.tsx` (306 ř.); `app/clothing-photo.tsx` (27 ř.); `app/commerce-pages.tsx` (146 ř.); `app/competition-history-detail.tsx` (261 ř.); `app/countries.ts` (50 ř.); `app/country-select.tsx` (53 ř.); `app/customer-detail.tsx` (334 ř.); `app/customer-service-screen.tsx` (398 ř.); `app/driver-photo.ts` (5 ř.); `app/empty-state.tsx` (40 ř.); `app/engine-auto-service.ts` (67 ř.); `app/engine-documents-panel.tsx` (264 ř.); `app/engine-family-rules.ts` (27 ř.); `app/engine-public-code.ts` (44 ř.); `app/engine-qr-panel.tsx` (94 ř.); `app/engine-qr.tsx` (131 ř.); `app/engine-service-card.tsx` (682 ř.); `app/engine-service-entry-screen.tsx` (100 ř.); `app/engine-service-part-catalog-panel.tsx` (244 ř.); `app/engine-technical-log.ts` (92 ř.); `app/engine-timeline.tsx` (222 ř.); `app/engine-usage.ts` (204 ř.); `app/file-signature.ts` (38 ř.); `app/format-hours.ts` (13 ř.); `app/globals.css` (4868 ř.); `app/inventory-image-url.ts` (5 ř.); `app/layout.tsx` (44 ř.); `app/logistics-pages.tsx` (338 ř.); `app/m/[code]/page.tsx` (77 ř.); `app/mechanic-detail.tsx` (202 ř.); `app/mm-dashboard.tsx` (2998 ř.); `app/page.tsx` (48 ř.); `app/pluralize.ts` (25 ř.); `app/qr-sheet-page.tsx` (167 ř.); `app/race-activity.tsx` (139 ř.); `app/race-calendar-colors.ts` (62 ř.); `app/race-checklist-panel.tsx` (174 ř.); `app/race-deliveries.tsx` (288 ř.); `app/race-finance.tsx` (477 ř.); `app/race-logo-badge.tsx` (15 ř.); `app/race-logo.ts` (5 ř.); `app/race-mode-screen.tsx` (575 ř.); `app/race-pages.tsx` (1340 ř.); `app/race-sales.tsx` (109 ř.); `app/race-team-visits.tsx` (367 ř.); `app/sales-page.tsx` (140 ř.); `app/server-auth.ts` (159 ř.); `app/service-card-shared.ts` (235 ř.); `app/service-history-page.tsx` (372 ř.); `app/service-order-detail.tsx` (868 ř.); `app/service-order-print.tsx` (294 ř.); `app/service-orders-page.tsx` (507 ř.); `app/service-queue-page.tsx` (959 ř.); `app/service-queue-screen.tsx` (65 ř.); `app/servis-fronta/page.tsx` (50 ř.); `app/settings-document-types.tsx` (264 ř.); `app/settings-general.tsx` (131 ř.); `app/settings-page.tsx` (442 ř.); `app/settings-price-list.tsx` (390 ř.); `app/settings-service-card.tsx` (1533 ř.); `app/settings-service-engine-types.tsx` (270 ř.); `app/settings-technical-structure.tsx` (802 ř.); `app/task-pages.tsx` (232 ř.); `app/team-logo.ts` (5 ř.); `app/use-modal-a11y.ts` (92 ř.); `app/vehicle-detail.tsx` (169 ř.); `app/vehicle-photo.ts` (5 ř.); `app/zavod/page.tsx` (51 ř.)

**`db/…` — databáze** — 3 souborů

`db/index.ts` (34 ř.); `db/runtime-schema.ts` (2562 ř.); `db/schema.ts` (1295 ř.)

**`worker/…` — Cloudflare Workers vstupní bod** — 2 souborů

`worker/cloudflare-env.d.ts` (57 ř.); `worker/index.ts` (47 ř.)

**`tests/…` — automatizované testy** — 1 soubor

`tests/rendered-html.test.mjs` (637 ř.)

**(kořen repozitáře — konfigurace)** — 4 souborů

`drizzle.config.ts` (7 ř.); `eslint.config.mjs` (18 ř.); `next.config.ts` (11 ř.); `vite.config.ts` (60 ř.)

**`examples/…`, `build/…` — šablona frameworku, není součástí MM System** — 3 souborů

`build/sites-vite-plugin.ts` (45 ř.); `examples/d1/app/api/notes/route.ts` (58 ř.); `examples/d1/db/schema.ts` (9 ř.)

**Ostatní sledované soubory mimo kód** (bez počtu řádků u binárních formátů):
- `drizzle/*.sql` — 30 souborů, 563 řádků celkem (deklarativní migrace, viz CLAUDE.md — neaplikují se, skutečné schéma dělá `db/runtime-schema.ts`)
- `drizzle/meta/*.json` — 30 snapshotů + `_journal.json`, 77 759 řádků celkem (interní evidence drizzle-kit, negenerovaná appkou)
- `package.json` (43 ř.), `package-lock.json` (10 541 ř.) — závislosti projektu
- `tsconfig.json` (35 ř.), `tsconfig.server.json` (40 ř.) — viz CLAUDE.md, dva tsconfigy
- `.gitignore` (55 ř.), `.openai/hosting.json` (5 ř.)
- `CLAUDE.md` (119 ř.), `README.md` (109 ř.), `docs/MM_SYSTEM_BLUEPRINT.md` (136 ř.), `PREHLED-SYSTEMU.md` (tento dokument)
- `public/favicon.svg` (6 ř.), `public/file.svg`, `public/globe.svg`, `public/window.svg` (šablonové ikony, nevyužité v MM System), `public/machac-motors-logo.jpg` (95 915 B), `public/machac-motors-symbol.jpg` (24 568 B)

### 14.2 Tabulka souborů podle velikosti (od největšího)

| Cesta | Řádků | Znaků | Účel |
|---|---:|---:|---|
| `app/globals.css` | 4868 | 416105 | Veškerý CSS styl aplikace — barevné tokeny, komponenty, tisk, tmavý režim |
| `app/mm-dashboard.tsx` | 2998 | 191213 | Hlavní obrazovka appky — boční menu, přepínání sekcí, karta motoru |
| `db/runtime-schema.ts` | 2562 | 133793 | Skutečné vytváření a úprava databázových tabulek za běhu appky |
| `app/settings-service-card.tsx` | 1533 | 78528 | Nastavení → Servisní karta (typy servisu, položky, materiál) |
| `app/race-pages.tsx` | 1340 | 106667 | Sekce Závody — seznam, detail, plán pilotů/motorů/karburátorů |
| `db/schema.ts` | 1295 | 66960 | Deklarativní zápis schématu databáze (jen pro konzistenci) |
| `app/api/service-orders/route.ts` | 1032 | 60919 | Zakázky zakázkového servisu |
| `app/service-queue-page.tsx` | 959 | 46469 | Fronta motorů na servis (nástěnka i domovská obrazovka mechanika) |
| `app/service-order-detail.tsx` | 868 | 52674 | Detail jedné zakázky zakázkového servisu |
| `app/settings-technical-structure.tsx` | 802 | 41482 | Nastavení → Technické údaje podle rodiny motoru |
| `app/engine-service-card.tsx` | 682 | 32879 | Servisní karta motoru (nová i stará) na kartě motoru |
| `app/api/engine-records/route.ts` | 663 | 31638 | Zápis servisu a motohodin — starý model karty |
| `tests/rendered-html.test.mjs` | 637 | 34008 | Automatizované testy vykresleného HTML |
| `app/catalog-pages.tsx` | 625 | 63816 | Piloti, Týmy, Mechanici, Auta — společná číselníková obrazovka |
| `app/api/engines/route.ts` | 589 | 28193 | Evidence motorů a jejich základních/technických údajů |
| `app/api/service-records/route.ts` | 584 | 31518 | Zápis a historie servisu — nová servisní karta |
| `app/race-mode-screen.tsx` | 575 | 23137 | RACE MODE — obrazovka pro potvrzování na place |
| `app/api/service-card-settings/route.ts` | 562 | 31411 | Nastavení nové servisní karty (typy servisu, položky, materiál) |
| `app/service-orders-page.tsx` | 507 | 27920 | Seznam zakázek zakázkového servisu |
| `app/api/race-planning/route.ts` | 491 | 35931 | Přiřazení pilotů, motorů a karburátorů k závodu |
| `app/race-finance.tsx` | 477 | 31721 | Finance závodu (platby pilotů, prodej, náklady, zisk) |
| `app/settings-page.tsx` | 442 | 19004 | Nastavení → Přístupy a role |
| `app/api/service-queue/route.ts` | 416 | 19623 | Fronta motorů na servis |
| `app/customer-service-screen.tsx` | 398 | 22276 | Mechanikova pracovní obrazovka pro zákaznický motor |
| `app/api/engine-technical-structure/route.ts` | 395 | 23897 | Nastavení struktury technických údajů podle rodiny motoru |
| `app/settings-price-list.tsx` | 390 | 17841 | Nastavení → Ceník prací zakázkového servisu |
| `app/service-history-page.tsx` | 372 | 15770 | Servisní historie — report za období |
| `app/race-team-visits.tsx` | 367 | 24737 | Návštěvy jiných týmů na závodě |
| `app/api/catalog/route.ts` | 365 | 25364 | Společný číselník pilotů, týmů, mechaniků a aut |
| `app/api/logistics/route.ts` | 359 | 27743 | Ubytování, letenky a pronájem aut k závodům |
| `app/logistics-pages.tsx` | 338 | 53417 | Ubytování, Letenky, Pronájem aut |
| `app/api/customer-service/route.ts` | 334 | 18811 | Mechanikova pracovní obrazovka pro zákaznický motor |
| `app/customer-detail.tsx` | 334 | 16999 | Karta zákazníka s historií motorů a zakázek |
| `app/api/service-history/route.ts` | 331 | 15942 | Report servisní historie za období |
| `app/api/engine-timeline/route.ts` | 331 | 14451 | Časová osa motoru (historie napříč zdroji) |
| `app/api/races/route.ts` | 330 | 20912 | Evidence závodů (základní údaje a seznam) |
| `app/api/race-mode/route.ts` | 310 | 14666 | RACE MODE — potvrzení jel/nejel a motohodiny na place |
| `app/clothing-page.tsx` | 306 | 24795 | Sekce Oblečení — katalog a přiřazení mechanikům |
| `app/api/sales/route.ts` | 301 | 23861 | Prodej motorů, karburátorů, dílů a servisu |
| `app/service-order-print.tsx` | 294 | 15203 | Tiskový zakázkový list |
| `app/race-deliveries.tsx` | 288 | 22289 | Předávky a platby zákazníkům na závodě |
| `app/settings-service-engine-types.tsx` | 270 | 11695 | Nastavení → Typy motorů pro servis |
| `app/api/clothing/route.ts` | 267 | 14947 | Katalog oblečení a přiřazení mechanikům |
| `app/engine-documents-panel.tsx` | 264 | 11553 | Záložka Dokumenty na kartě motoru |
| `app/settings-document-types.tsx` | 264 | 11522 | Nastavení → Typy dokumentů |
| `app/competition-history-detail.tsx` | 261 | 22745 | Sdílená karta historie startů (pilot/tým) |
| `app/engine-service-part-catalog-panel.tsx` | 244 | 11855 | Katalog dílů servisní karty MINI (starý model) |
| `app/service-card-shared.ts` | 235 | 8828 | Sdílené výpočty pro novou servisní kartu (stav dlaždic) |
| `app/task-pages.tsx` | 232 | 15493 | Sekce Úkoly |
| `app/api-access.ts` | 226 | 10473 | Centrální whitelist toho, co smí volat role mechanik |
| `app/engine-timeline.tsx` | 222 | 9317 | Záložka Historie (časová osa) na kartě motoru |
| `app/api/engine-loans/route.ts` | 209 | 10880 | Zápůjčky motorů |
| `app/circuit-location.ts` | 208 | 8446 | Dohledání a výpočet GPS polohy a vzdálenosti tratě |
| `app/api/engine-documents/route.ts` | 205 | 10223 | Dokumenty (faktury, homologace) u motoru |
| `app/engine-usage.ts` | 204 | 7965 | Logika motohodin a přepočtu počítadel motoru |
| `app/mechanic-detail.tsx` | 202 | 18509 | Detailní karta mechanika |
| `app/api/users/route.ts` | 193 | 6619 | Správa uživatelů a rolí (Nastavení) |
| `app/api/race-team-visits/route.ts` | 186 | 10796 | Návštěvy jiných týmů na závodě |
| `app/api/service-price-items/route.ts` | 185 | 8905 | Ceník prací pro zakázkový servis |
| `app/api/race-finance/route.ts` | 179 | 8903 | Finance závodu (platby pilotů, prodej, náklady) |
| `app/race-checklist-panel.tsx` | 174 | 10969 | Checklist připojený ke konkrétnímu závodu |
| `app/vehicle-detail.tsx` | 169 | 14379 | Detailní karta auta |
| `app/checklist-pages.tsx` | 169 | 11793 | Knihovna šablon kontrolních seznamů (Dokumenty) |
| `app/qr-sheet-page.tsx` | 167 | 6861 | Hromadný tisk archu QR štítků |
| `app/api/mechanic-records/route.ts` | 162 | 8205 | Detailní karta mechanika s historií cest |
| `app/api/tasks/route.ts` | 160 | 7425 | Úkoly a připomínky |
| `app/server-auth.ts` | 159 | 5418 | Ověření uživatele a centrální filtr odpovědi pro mechanika |
| `app/api/engine-document-types/route.ts` | 157 | 6593 | Číselník typů dokumentů motoru |
| `app/api/circuits/route.ts` | 155 | 8908 | Adresář tratí |
| `app/api/race-deliveries/route.ts` | 155 | 8413 | Předávky zákazníkům na závodě |
| `app/api/customer-engines/route.ts` | 155 | 7244 | Zákaznické motory evidované u zákazníka |
| `app/api/service-order-photos/route.ts` | 153 | 7220 | Fotky u zakázky zakázkového servisu |
| `app/api/service-engine-types/route.ts` | 148 | 6420 | Číselník typů motorů pro zakázkový servis |
| `app/api/engine-service-part-catalog/route.ts` | 148 | 5664 | Katalog dílů servisní karty MINI (starý model) |
| `app/commerce-pages.tsx` | 146 | 24705 | Společný obal sekce Obchod |
| `app/sales-page.tsx` | 140 | 37357 | Sekce Prodej |
| `app/race-activity.tsx` | 139 | 9407 | Historie změn na závodě (záložka Historie) |
| `app/api/race-checklists/route.ts` | 136 | 7968 | Checklisty připojené ke konkrétnímu závodu |
| `app/api/vehicle-service-entries/route.ts` | 135 | 8014 | Servisní záznamy auta |
| `app/settings-general.tsx` | 131 | 5221 | Nastavení → Obecné |
| `app/engine-qr.tsx` | 131 | 4819 | Vykreslení a stažení QR kódu motoru |
| `app/api/activity/route.ts` | 129 | 5610 | Poslední záznamy z auditního logu pro Přehled |
| `app/api/carburetor-records/route.ts` | 121 | 9201 | Detail karburátoru a jeho servisní historie |
| `app/api/logistics-attachments/route.ts` | 117 | 8191 | Přílohy k ubytování/letence/pronájmu auta |
| `app/api/carburetor-type-photo/route.ts` | 115 | 5450 | Fotka typu karburátoru v katalogu |
| `app/api/race-template-logo/route.ts` | 115 | 5436 | Logo typu závodu |
| `app/api/vehicle-photo/route.ts` | 115 | 5410 | Fotka auta |
| `app/api/driver-photo/route.ts` | 115 | 5376 | Fotka pilota |
| `app/api/team-logo/route.ts` | 115 | 5265 | Logo týmu |
| `app/api/competition-history/route.ts` | 110 | 5758 | Kompletní historie startů pilota nebo týmu |
| `app/race-sales.tsx` | 109 | 9171 | Prodej a servis navázaný na konkrétní závod |
| `app/calendar-page.tsx` | 109 | 13258 | Sekce Kalendář |
| `app/api/carburetor-types/route.ts` | 104 | 6194 | Katalog typů karburátorů (značka/model) |
| `app/api/customers/route.ts` | 104 | 6125 | Evidence zákazníků a karta zákazníka |
| `app/engine-service-entry-screen.tsx` | 100 | 4200 | Zjednodušený zápis servisu z fronty (bez menu) |
| `app/api/checklists/route.ts` | 99 | 5635 | Šablony kontrolních seznamů (balicí listy) |
| `app/carburetor-detail.tsx` | 99 | 17178 | Detailní karta karburátoru |
| `app/circuits-page.tsx` | 98 | 14773 | Adresář tratí |
| `app/api/clothing-image/route.ts` | 95 | 5297 | Fotka položky týmového oblečení |
| `app/engine-qr-panel.tsx` | 94 | 4042 | Záložka QR kód na kartě motoru |
| `app/use-modal-a11y.ts` | 92 | 4549 | Sdílené chování modálních oken (přístupnost) |
| `app/engine-technical-log.ts` | 92 | 4512 | Formátování historie změn technických údajů |
| `app/chatgpt-auth.ts` | 86 | 2404 | Přihlášení přes ChatGPT/OpenAI účet |
| `app/api/vehicle-records/route.ts` | 81 | 4155 | Detail auta a jeho historie |
| `app/api/race-followup-notes/route.ts` | 80 | 3427 | Poznatky ze závodu |
| `app/api/inventory/route.ts` | 79 | 6303 | Sklad náhradních dílů |
| `app/api/app-settings/route.ts` | 79 | 2969 | Obecné nastavení systému (základní adresa pro QR) |
| `app/m/[code]/page.tsx` | 77 | 3547 | Cílová stránka po naskenování QR kódu motoru |
| `app/api/inventory-image/route.ts` | 73 | 5186 | Fotka dílu ve skladu |
| `app/api/dev-session/route.ts` | 73 | 2360 | Vývojářské přihlášení mimo produkci |
| `app/api/customer-search/route.ts` | 71 | 2732 | Křížové hledání zákazníka napříč systémem |
| `app/engine-auto-service.ts` | 67 | 2726 | Automatické přepnutí stavu motoru MINI po závodě/servisu |
| `app/service-queue-screen.tsx` | 65 | 2775 | Obal fronty na servis v celoobrazovkovém režimu |
| `app/race-calendar-colors.ts` | 62 | 7132 | Paleta pojmenovaných barev pro typy závodů |
| `vite.config.ts` | 60 | 1717 | Pomocná část appky (viz příslušná kapitola výše) |
| `examples/d1/app/api/notes/route.ts` | 58 | 1700 | Pomocná část appky (viz příslušná kapitola výše) |
| `worker/cloudflare-env.d.ts` | 57 | 3277 | Typy pro Cloudflare Workers prostředí |
| `app/api/service-catalog/route.ts` | 56 | 4350 | Starší servisní ceník pro Prodej |
| `app/calendar-color-select.tsx` | 56 | 3329 | Výběr barvy typu závodu |
| `app/api/accommodation-distance/route.ts` | 56 | 2902 | Dopočítá vzdálenost a dobu jízdy ubytování od tratě |
| `app/country-select.tsx` | 53 | 3627 | Výběr země s vlajkou |
| `app/zavod/page.tsx` | 51 | 2340 | Adresa RACE MODE |
| `app/countries.ts` | 50 | 2577 | Číselník zemí a vlajek |
| `app/servis-fronta/page.tsx` | 50 | 2447 | Adresa celoobrazovkového režimu fronty na servis |
| `app/page.tsx` | 48 | 2301 | Vstupní stránka — přesměrování podle role |
| `worker/index.ts` | 47 | 1731 | Vstupní bod Cloudflare Workers runtime |
| `build/sites-vite-plugin.ts` | 45 | 1254 | Pomocná část appky (viz příslušná kapitola výše) |
| `app/api/circuit-image/route.ts` | 44 | 3672 | Obrázek/mapa tratě |
| `app/engine-public-code.ts` | 44 | 1747 | Generování a normalizace veřejného kódu motoru pro QR |
| `app/layout.tsx` | 44 | 1332 | Základní HTML layout aplikace |
| `app/api/weather/route.ts` | 43 | 3787 | Počasí a předpověď pro trať závodu |
| `app/empty-state.tsx` | 40 | 1072 | Sdílená komponenta prázdného stavu |
| `app/file-signature.ts` | 38 | 1594 | Kontrola skutečného typu nahraného souboru podle obsahu |
| `db/index.ts` | 34 | 910 | Přístup k D1 databázi |
| `app/api/race-activity/route.ts` | 33 | 1662 | Historie změn na konkrétním závodě |
| `app/engine-family-rules.ts` | 27 | 1672 | Pravidla odlišující rodiny motorů (motohodiny, auto-přestavba) |
| `app/clothing-photo.tsx` | 27 | 1671 | Náhled fotky položky oblečení |
| `app/pluralize.ts` | 25 | 819 | Skloňování počtu položek v textu |
| `eslint.config.mjs` | 18 | 465 | Pomocná část appky (viz příslušná kapitola výše) |
| `app/race-logo-badge.tsx` | 15 | 1006 | Odznak loga typu závodu |
| `app/api/circuit-location/route.ts` | 14 | 750 | Dohledání GPS polohy tratě podle adresy |
| `app/format-hours.ts` | 13 | 696 | Formátování a parsování času HH:MM (motohodiny) |
| `app/api/session/route.ts` | 13 | 346 | Údaje o přihlášené session |
| `next.config.ts` | 11 | 184 | Pomocná část appky (viz příslušná kapitola výše) |
| `examples/d1/db/schema.ts` | 9 | 370 | Pomocná část appky (viz příslušná kapitola výše) |
| `drizzle.config.ts` | 7 | 148 | Pomocná část appky (viz příslušná kapitola výše) |
| `app/carburetor-type-photo.ts` | 5 | 283 | URL fotky typu karburátoru |
| `app/vehicle-photo.ts` | 5 | 277 | URL fotky auta |
| `app/race-logo.ts` | 5 | 277 | URL loga typu závodu |
| `app/circuit-image.ts` | 5 | 277 | URL obrázku tratě |
| `app/inventory-image-url.ts` | 5 | 272 | URL fotky skladového dílu |
| `app/driver-photo.ts` | 5 | 272 | URL fotky pilota |
| `app/clothing-image-url.ts` | 5 | 270 | URL fotky položky oblečení |
| `app/team-logo.ts` | 5 | 256 | URL loga týmu |

### 14.3 Souhrn podle typu souboru

| Typ | Počet souborů | Řádků celkem |
|---|---:|---:|
| Soubory .tsx (obrazovky a komponenty) | 55 | 19355 |
| API routy (app/api/**/route.ts) | 61 | 12730 |
| Ostatní .ts soubory (sdílená logika mimo API a db) | 27 | 1746 |
| db/** (schéma a jeho aplikace za běhu) | 3 | 3891 |
| worker/** (Cloudflare Workers) | 2 | 104 |
| CSS (app/globals.css) | 1 | 4868 |
| Automatizované testy | 1 | 637 |
| Šablona frameworku (examples/, build/) — není součástí MM System | 3 | 112 |
| Ostatní konfigurační soubory (.mjs) | 1 | 18 |
| **Celkem (kódové soubory sledované gitem)** | **154** | **43461** |

### 14.4 Databáze — kompletní výpis tabulek

Seskupeno podle oblasti; u každé tabulky je uveden účel, počet sloupců a seznam sloupců s typem/omezením přesně podle databáze.

#### Motory

**`engines`** — Základní a technické údaje vlastních motorů týmu (42 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `code` TEXT NOT NULL; `serial_number` TEXT NOT NULL DEFAULT ''; `brand` TEXT NOT NULL; `model` TEXT NOT NULL; `category` TEXT NOT NULL DEFAULT ''; `family` TEXT NOT NULL DEFAULT 'OKN'; `ignition` TEXT NOT NULL DEFAULT 'PVL'; `kz_generation` TEXT; `current_configuration` TEXT; `upgrade_code` TEXT NOT NULL DEFAULT ''; `label_color` TEXT NOT NULL DEFAULT ''; `purchase_date` TEXT; `piston_spec` TEXT NOT NULL DEFAULT ''; `cylinder_code` TEXT NOT NULL DEFAULT ''; `cylinder_upgrade` TEXT NOT NULL DEFAULT ''; `liner` TEXT NOT NULL DEFAULT ''; `degree` TEXT NOT NULL DEFAULT ''; `timing` TEXT NOT NULL DEFAULT ''; `carter` TEXT NOT NULL DEFAULT ''; `reeds` TEXT NOT NULL DEFAULT ''; `spacer` TEXT NOT NULL DEFAULT ''; `squish` TEXT NOT NULL DEFAULT ''; `status` TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'service_soon', 'service', 'rebuild', 'storage', 'retired')); `total_minutes` INTEGER NOT NULL DEFAULT 0; `piston_minutes` INTEGER NOT NULL DEFAULT 0; `rod_minutes` INTEGER NOT NULL DEFAULT 0; `last_oppama_minutes` INTEGER NOT NULL DEFAULT 0; `current_piston_size` TEXT NOT NULL DEFAULT ''; `baseline_total_minutes` INTEGER NOT NULL DEFAULT 0; `baseline_piston_minutes` INTEGER NOT NULL DEFAULT 0; `baseline_rod_minutes` INTEGER NOT NULL DEFAULT 0; `baseline_last_oppama_minutes` INTEGER NOT NULL DEFAULT 0; `baseline_piston_size` TEXT NOT NULL DEFAULT ''; `service_interval_minutes` INTEGER NOT NULL DEFAULT 360; `notes` TEXT NOT NULL DEFAULT ''; `sold_at` INTEGER; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL; `public_code` TEXT NOT NULL DEFAULT ''

**`engine_categories`** — Kategorie motorů a jejich nastavení pro novou servisní kartu (11 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `code` TEXT NOT NULL; `name_cs` TEXT NOT NULL; `name_en` TEXT NOT NULL; `sort_order` INTEGER NOT NULL DEFAULT 0; `counter_unit` TEXT CHECK (counter_unit IN ('hours', 'days', 'race_weekends')); `service_card_migrated` INTEGER NOT NULL DEFAULT 0; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`engine_technical_sections`** — Sekce technických údajů podle rodiny motoru (9 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `family` TEXT NOT NULL; `label_cs` TEXT NOT NULL; `label_en` TEXT NOT NULL; `sort_order` INTEGER NOT NULL DEFAULT 0; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`engine_technical_fields`** — Jednotlivá pole technických údajů v sekci (12 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `section_id` TEXT NOT NULL; `label_cs` TEXT NOT NULL; `label_en` TEXT NOT NULL; `field_type` TEXT NOT NULL; `show_on_overview` INTEGER NOT NULL DEFAULT 0; `sort_order` INTEGER NOT NULL DEFAULT 0; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL; `legacy_key` TEXT

**`engine_technical_field_options`** — Možnosti výběru u polí typu Výběr (7 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `field_id` TEXT NOT NULL; `value_cs` TEXT NOT NULL; `value_en` TEXT NOT NULL; `sort_order` INTEGER NOT NULL DEFAULT 0; `archived_at` INTEGER; `created_at` INTEGER NOT NULL

**`engine_technical_layout`** — Počet sloupců mřížky technických údajů pro rodinu (4 sloupců)
- `family` TEXT PRIMARY KEY NOT NULL; `column_count` INTEGER NOT NULL DEFAULT 3; `updated_by` TEXT NOT NULL; `updated_at` INTEGER NOT NULL

**`engine_technical_values`** — Uložené hodnoty technických polí u konkrétních motorů (6 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `engine_id` TEXT NOT NULL; `field_id` TEXT NOT NULL; `value` TEXT NOT NULL DEFAULT ''; `updated_by` TEXT NOT NULL; `updated_at` INTEGER NOT NULL

**`engine_technical_value_changes`** — Historie změn technických hodnot (kdo, kdy, staré/nové) (11 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `engine_id` TEXT NOT NULL; `field_id` TEXT; `field_label_cs` TEXT NOT NULL; `field_label_en` TEXT NOT NULL; `old_value` TEXT NOT NULL DEFAULT ''; `new_value` TEXT NOT NULL DEFAULT ''; `source` TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'service')); `service_record_id` TEXT; `changed_by` TEXT NOT NULL; `changed_at` INTEGER NOT NULL

**`engine_usage_logs`** — Zápisy motohodin (Oppama) (9 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `engine_id` TEXT NOT NULL; `entry_date` TEXT NOT NULL; `oppama_minutes` INTEGER NOT NULL; `race_name` TEXT NOT NULL DEFAULT ''; `driver_name` TEXT NOT NULL DEFAULT ''; `notes` TEXT NOT NULL DEFAULT ''; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL

**`engine_loans`** — Zápůjčky motorů (komu, od kdy do kdy) (12 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `engine_id` TEXT NOT NULL; `recipient_type` TEXT NOT NULL; `recipient_id` TEXT NOT NULL; `recipient_name_snapshot` TEXT NOT NULL; `start_date` TEXT NOT NULL; `expected_return_date` TEXT NOT NULL; `actual_return_date` TEXT; `notes` TEXT NOT NULL DEFAULT ''; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`engine_documents`** — Nahrané dokumenty u motoru (faktury, homologace) (10 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `engine_id` TEXT NOT NULL; `document_type_id` TEXT NOT NULL; `file_name` TEXT NOT NULL; `object_key` TEXT NOT NULL; `content_type` TEXT NOT NULL; `size_bytes` INTEGER NOT NULL DEFAULT 0; `note` TEXT NOT NULL DEFAULT ''; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL

**`engine_document_types`** — Číselník typů dokumentů motoru (10 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `code` TEXT NOT NULL; `name_cs` TEXT NOT NULL; `name_en` TEXT NOT NULL; `hand_over_to_buyer` INTEGER NOT NULL DEFAULT 0; `sort_order` INTEGER NOT NULL DEFAULT 0; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`engine_auto_service_log`** — Log automatických přepnutí stavu motoru MINI (5 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `engine_id` TEXT NOT NULL; `race_id` TEXT NOT NULL; `race_name_snapshot` TEXT NOT NULL DEFAULT ''; `applied_at` INTEGER NOT NULL

**`engine_service_part_catalog`** — Katalog dílů servisní karty MINI (starý model) (10 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `family` TEXT NOT NULL; `part_key` TEXT NOT NULL; `label_cs` TEXT NOT NULL; `label_en` TEXT NOT NULL; `sort_order` INTEGER NOT NULL DEFAULT 0; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`engine_service_claims`** — Zabrání motoru mechanikem ve frontě na servis (9 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `engine_id` TEXT NOT NULL; `claimed_by` TEXT NOT NULL; `claimed_by_name` TEXT NOT NULL; `claimed_mechanic_id` TEXT; `claimed_at` INTEGER NOT NULL; `released_at` INTEGER; `released_by` TEXT; `release_reason` TEXT NOT NULL DEFAULT '' CHECK (release_reason IN ('', 'manual', 'service'))

**`engine_service_entries`** — Servisní záznamy — starý model karty (14 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `engine_id` TEXT NOT NULL; `service_date` TEXT NOT NULL; `service_type` TEXT NOT NULL; `replaced_parts` TEXT NOT NULL DEFAULT '[]'; `replaced_parts_snapshot` TEXT NOT NULL DEFAULT '[]'; `piston_size` TEXT NOT NULL DEFAULT ''; `notes` TEXT NOT NULL DEFAULT ''; `piston_minutes_before` INTEGER NOT NULL DEFAULT 0; `rod_minutes_before` INTEGER NOT NULL DEFAULT 0; `mechanic_id` TEXT; `mechanic_name_snapshot` TEXT NOT NULL DEFAULT ''; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL

**`engine_service_queue_manual`** — Ruční zařazení motoru do fronty na servis (5 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `engine_id` TEXT NOT NULL; `note` TEXT NOT NULL; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL

**`engine_service_queue_resolutions`** — Odbavení fronty tlačítkem Nejel / bez servisu (9 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `engine_id` TEXT NOT NULL; `source_type` TEXT NOT NULL CHECK (source_type IN ('race', 'loan', 'manual')); `source_id` TEXT NOT NULL; `resolution` TEXT NOT NULL CHECK (resolution IN ('serviced', 'skipped')); `service_record_id` TEXT; `resolved_by` TEXT NOT NULL; `resolved_at` INTEGER NOT NULL; `legacy_entry_id` TEXT

#### Servis (nová servisní karta)

**`service_types`** — Typy servisních zásahů podle kategorie motoru (12 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `engine_category_id` TEXT NOT NULL; `code` TEXT NOT NULL; `name_cs` TEXT NOT NULL; `name_en` TEXT NOT NULL; `description_cs` TEXT NOT NULL DEFAULT ''; `description_en` TEXT NOT NULL DEFAULT ''; `sort_order` INTEGER NOT NULL DEFAULT 0; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`service_card_items`** — Položky (dlaždice) nové servisní karty (13 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `engine_category_id` TEXT NOT NULL; `name_cs` TEXT NOT NULL; `name_en` TEXT NOT NULL; `material_category_id` TEXT; `interval_minutes` INTEGER; `warn_percent` INTEGER NOT NULL DEFAULT 80; `legacy_part_key` TEXT; `sort_order` INTEGER NOT NULL DEFAULT 0; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`service_type_default_items`** — Výchozí položky předvyplněné u typu servisu (4 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `service_type_id` TEXT NOT NULL; `service_card_item_id` TEXT NOT NULL; `created_at` INTEGER NOT NULL

**`material_categories`** — Kategorie materiálu (např. Písty, Těsnění) (9 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `engine_category_id` TEXT NOT NULL; `name_cs` TEXT NOT NULL; `name_en` TEXT NOT NULL; `sort_order` INTEGER NOT NULL DEFAULT 0; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`material_attributes`** — Atributy materiálu (Značka, Rozměr…) (13 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `material_category_id` TEXT NOT NULL; `name_cs` TEXT NOT NULL; `name_en` TEXT NOT NULL; `attribute_type` TEXT NOT NULL DEFAULT 'text' CHECK (attribute_type IN ('dropdown', 'number', 'text')); `unit` TEXT NOT NULL DEFAULT ''; `options` TEXT NOT NULL DEFAULT '[]'; `technical_field_id` TEXT; `sort_order` INTEGER NOT NULL DEFAULT 0; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`material_variants`** — Konkrétní varianty materiálu k výběru (8 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `material_category_id` TEXT NOT NULL; `name` TEXT NOT NULL; `attribute_values` TEXT NOT NULL DEFAULT '{}'; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`service_records`** — Zápisy servisu — nová servisní karta (18 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `engine_id` TEXT NOT NULL; `service_type_id` TEXT; `service_type_snapshot` TEXT NOT NULL DEFAULT ''; `service_date` TEXT NOT NULL; `service_time` TEXT NOT NULL DEFAULT ''; `counter_minutes` INTEGER; `mechanic_id` TEXT; `mechanic_name_snapshot` TEXT NOT NULL DEFAULT ''; `note` TEXT NOT NULL DEFAULT ''; `cancelled_reason` TEXT NOT NULL DEFAULT ''; `cancelled_at` INTEGER; `cancelled_by` TEXT NOT NULL DEFAULT ''; `import_source` TEXT NOT NULL DEFAULT ''; `divergence_note` TEXT NOT NULL DEFAULT ''; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`service_record_items`** — Provedené položky a použitý materiál u servisního zápisu (9 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `service_record_id` TEXT NOT NULL; `service_card_item_id` TEXT; `item_name_cs_snapshot` TEXT NOT NULL; `item_name_en_snapshot` TEXT NOT NULL; `material_variant_id` TEXT; `material_snapshot` TEXT; `sort_order` INTEGER NOT NULL DEFAULT 0; `created_at` INTEGER NOT NULL

#### Závody

**`races`** — Základní údaje závodů (termín, trať, kategorie) (20 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `race_template_id` TEXT; `circuit_id` TEXT; `name` TEXT NOT NULL; `series` TEXT NOT NULL DEFAULT ''; `series_round` INTEGER; `race_type` TEXT NOT NULL DEFAULT ''; `track` TEXT NOT NULL; `address` TEXT NOT NULL DEFAULT ''; `country_code` TEXT NOT NULL; `start_date` TEXT NOT NULL; `end_date` TEXT NOT NULL; `departure_date` TEXT NOT NULL DEFAULT ''; `return_date` TEXT NOT NULL DEFAULT ''; `organizer` TEXT NOT NULL DEFAULT ''; `notes` TEXT NOT NULL DEFAULT ''; `status` TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed', 'archived')); `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`race_categories`** — Kategorie startující na daném závodě (5 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `race_id` TEXT NOT NULL; `category` TEXT NOT NULL; `sort_order` INTEGER NOT NULL; `notes` TEXT NOT NULL DEFAULT ''

**`race_entries`** — Přihlášky pilotů na závod (motory a karburátory na pozicích 1–3) (28 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `race_id` TEXT NOT NULL; `category` TEXT NOT NULL; `driver_id` TEXT NOT NULL; `driver_name_snapshot` TEXT NOT NULL; `team_id` TEXT; `team_name_snapshot` TEXT NOT NULL DEFAULT ''; `engine_1_id` TEXT; `engine_1_code` TEXT NOT NULL DEFAULT ''; `engine_1_configuration` TEXT NOT NULL DEFAULT ''; `engine_2_id` TEXT; `engine_2_code` TEXT NOT NULL DEFAULT ''; `engine_2_configuration` TEXT NOT NULL DEFAULT ''; `engine_3_id` TEXT; `engine_3_code` TEXT NOT NULL DEFAULT ''; `engine_3_configuration` TEXT NOT NULL DEFAULT ''; `carburetor_1_id` TEXT; `carburetor_1_code` TEXT NOT NULL DEFAULT ''; `carburetor_2_id` TEXT; `carburetor_2_code` TEXT NOT NULL DEFAULT ''; `carburetor_3_id` TEXT; `carburetor_3_code` TEXT NOT NULL DEFAULT ''; `is_confirmed` INTEGER NOT NULL DEFAULT 0; `sort_order` INTEGER NOT NULL DEFAULT 0; `notes` TEXT NOT NULL DEFAULT ''; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`race_entry_finance`** — Cena, sleva a platba za start pilota (13 sloupců)
- `race_entry_id` TEXT PRIMARY KEY NOT NULL; `race_id` TEXT NOT NULL; `base_price_cents` INTEGER NOT NULL DEFAULT 0; `currency` TEXT NOT NULL DEFAULT 'EUR' CHECK (currency IN ('CZK', 'EUR')); `discount_basis_points` INTEGER NOT NULL DEFAULT 0 CHECK (discount_basis_points >= 0 AND discount_basis_points <= 10000); `final_price_cents` INTEGER NOT NULL DEFAULT 0; `payment_method` TEXT NOT NULL DEFAULT '' CHECK (payment_method IN ('', 'cash', 'card', 'bank_transfer')); `is_paid` INTEGER NOT NULL DEFAULT 0; `notes` TEXT NOT NULL DEFAULT ''; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_by` TEXT NOT NULL; `updated_at` INTEGER NOT NULL

**`race_extras`** — Extra vybavení vzaté na závod bez konkrétního pilota (9 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `race_id` TEXT NOT NULL; `category` TEXT NOT NULL; `resource_type` TEXT NOT NULL; `resource_id` TEXT NOT NULL; `resource_code_snapshot` TEXT NOT NULL; `notes` TEXT NOT NULL DEFAULT ''; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL

**`race_engine_runs`** — Zápis jel/nejel u motoru na závodě (RACE MODE) (7 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `race_id` TEXT NOT NULL; `race_entry_id` TEXT NOT NULL; `engine_id` TEXT NOT NULL; `raced` INTEGER NOT NULL DEFAULT 1; `recorded_by` TEXT NOT NULL; `recorded_at` INTEGER NOT NULL

**`race_vehicles`** — Auta přiřazená k závodu (5 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `race_id` TEXT NOT NULL; `vehicle_id` TEXT NOT NULL; `vehicle_name_snapshot` TEXT NOT NULL; `license_plate_snapshot` TEXT NOT NULL DEFAULT ''

**`race_mechanics`** — Mechanici přiřazení k závodu (5 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `race_id` TEXT NOT NULL; `mechanic_id` TEXT NOT NULL; `mechanic_name_snapshot` TEXT NOT NULL; `vehicle_id` TEXT

**`race_templates`** — Typy závodů (šablony pro zakládání závodů) (12 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `name` TEXT NOT NULL UNIQUE; `notes` TEXT NOT NULL DEFAULT ''; `series_options` TEXT NOT NULL DEFAULT '[]'; `calendar_color` TEXT NOT NULL DEFAULT 'sky'; `logo_key` TEXT; `logo_content_type` TEXT; `logo_updated_at` INTEGER; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`race_checklists`** — Checklisty připojené ke konkrétnímu závodu (10 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `race_id` TEXT NOT NULL; `checklist_id` TEXT; `vehicle_id` TEXT; `vehicle_name_snapshot` TEXT NOT NULL DEFAULT ''; `name` TEXT NOT NULL; `notes` TEXT NOT NULL DEFAULT ''; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`race_checklist_items`** — Položky checklistu na závodě (odškrtávání) (8 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `race_checklist_id` TEXT NOT NULL; `section` TEXT NOT NULL DEFAULT ''; `part_number` TEXT NOT NULL DEFAULT ''; `name` TEXT NOT NULL; `quantity` INTEGER NOT NULL DEFAULT 1; `is_checked` INTEGER NOT NULL DEFAULT 0; `sort_order` INTEGER NOT NULL DEFAULT 0

**`race_followup_notes`** — Poznatky ze závodu (7 sloupců)
- `race_id` TEXT PRIMARY KEY NOT NULL; `next_race` TEXT NOT NULL DEFAULT ''; `consumed` TEXT NOT NULL DEFAULT ''; `missing` TEXT NOT NULL DEFAULT ''; `other_notes` TEXT NOT NULL DEFAULT ''; `updated_by` TEXT NOT NULL; `updated_at` INTEGER NOT NULL

**`race_team_visits`** — Návštěvy jiných týmů na place (20 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `race_id` TEXT NOT NULL; `team_id` TEXT; `team_name` TEXT NOT NULL; `driver_id` TEXT; `driver_name` TEXT NOT NULL DEFAULT ''; `item_type` TEXT NOT NULL DEFAULT 'part' CHECK (item_type IN ('part', 'service', 'stock', 'oil', 'other')); `resource_id` TEXT; `description` TEXT NOT NULL DEFAULT ''; `quantity` INTEGER NOT NULL DEFAULT 1; `visit_date` TEXT NOT NULL DEFAULT ''; `mechanic_id` TEXT; `mechanic_name` TEXT NOT NULL DEFAULT ''; `currency` TEXT NOT NULL DEFAULT 'CZK' CHECK (currency IN ('CZK', 'EUR')); `amount_cents` INTEGER; `is_paid` INTEGER NOT NULL DEFAULT 0; `notes` TEXT NOT NULL DEFAULT ''; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`race_deliveries`** — Předávky a platby zákazníkům na závodě (15 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `race_id` TEXT NOT NULL; `customer_name` TEXT NOT NULL; `description` TEXT NOT NULL; `quantity` INTEGER NOT NULL DEFAULT 1; `currency` TEXT NOT NULL DEFAULT 'CZK' CHECK (currency IN ('CZK', 'EUR')); `amount_cents` INTEGER NOT NULL DEFAULT 0; `payment_method` TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'invoice', 'other')); `is_delivered` INTEGER NOT NULL DEFAULT 0; `is_paid` INTEGER NOT NULL DEFAULT 0; `notes` TEXT NOT NULL DEFAULT ''; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL; `inventory_part_id` TEXT

**`race_accommodations`** — Ubytování k závodu (22 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `race_id` TEXT NOT NULL; `name` TEXT NOT NULL; `address` TEXT NOT NULL DEFAULT ''; `check_in_date` TEXT NOT NULL; `check_out_date` TEXT NOT NULL; `reservation_code` TEXT NOT NULL DEFAULT ''; `website_url` TEXT NOT NULL DEFAULT ''; `booking_url` TEXT NOT NULL DEFAULT ''; `track_distance_km` REAL; `track_drive_minutes` INTEGER; `room_count` INTEGER NOT NULL DEFAULT 0; `guest_count` INTEGER NOT NULL DEFAULT 0; `currency` TEXT NOT NULL DEFAULT 'EUR' CHECK (currency IN ('CZK', 'EUR')); `total_cents` INTEGER NOT NULL DEFAULT 0; `payment_status` TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')); `status` TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'booked', 'cancelled')); `notes` TEXT NOT NULL DEFAULT ''; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`race_flights`** — Letenky k závodu (29 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `race_id` TEXT NOT NULL; `direction` TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound', 'return', 'other')); `trip_kind` TEXT NOT NULL DEFAULT 'outbound'; `departure_airport` TEXT NOT NULL; `arrival_airport` TEXT NOT NULL; `departure_at` TEXT NOT NULL; `arrival_at` TEXT NOT NULL; `airline` TEXT NOT NULL DEFAULT ''; `flight_number` TEXT NOT NULL DEFAULT ''; `return_departure_airport` TEXT NOT NULL DEFAULT ''; `return_arrival_airport` TEXT NOT NULL DEFAULT ''; `return_departure_at` TEXT NOT NULL DEFAULT ''; `return_arrival_at` TEXT NOT NULL DEFAULT ''; `return_airline` TEXT NOT NULL DEFAULT ''; `return_flight_number` TEXT NOT NULL DEFAULT ''; `reservation_code` TEXT NOT NULL DEFAULT ''; `return_reservation_code` TEXT NOT NULL DEFAULT ''; `passengers_note` TEXT NOT NULL DEFAULT ''; `passengers_json` TEXT NOT NULL DEFAULT '[]'; `baggage` TEXT NOT NULL DEFAULT ''; `currency` TEXT NOT NULL DEFAULT 'EUR' CHECK (currency IN ('CZK', 'EUR')); `total_cents` INTEGER NOT NULL DEFAULT 0; `status` TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'booked', 'cancelled')); `notes` TEXT NOT NULL DEFAULT ''; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`race_car_rentals`** — Pronájem auta k závodu (19 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `race_id` TEXT NOT NULL; `company` TEXT NOT NULL; `vehicle_type` TEXT NOT NULL DEFAULT ''; `pickup_place` TEXT NOT NULL; `return_place` TEXT NOT NULL; `pickup_at` TEXT NOT NULL; `return_at` TEXT NOT NULL; `reservation_code` TEXT NOT NULL DEFAULT ''; `license_plate` TEXT NOT NULL DEFAULT ''; `driver_name` TEXT NOT NULL DEFAULT ''; `currency` TEXT NOT NULL DEFAULT 'EUR' CHECK (currency IN ('CZK', 'EUR')); `total_cents` INTEGER NOT NULL DEFAULT 0; `status` TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'booked', 'cancelled')); `notes` TEXT NOT NULL DEFAULT ''; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`travel_attachments`** — Přílohy k ubytování/letence/pronájmu (soubory) (10 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `entity_type` TEXT NOT NULL CHECK (entity_type IN ('accommodation', 'flight', 'rental')); `entity_id` TEXT NOT NULL; `leg` TEXT NOT NULL DEFAULT 'general' CHECK (leg IN ('general', 'outbound', 'return')); `file_name` TEXT NOT NULL; `object_key` TEXT NOT NULL; `content_type` TEXT NOT NULL; `size_bytes` INTEGER NOT NULL DEFAULT 0; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL

**`circuits`** — Adresář tratí (poloha, vzdálenost, kontakty) (17 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `name` TEXT NOT NULL; `country_code` TEXT NOT NULL; `address` TEXT NOT NULL DEFAULT ''; `website_url` TEXT NOT NULL DEFAULT ''; `maps_url` TEXT NOT NULL DEFAULT ''; `latitude` REAL; `longitude` REAL; `distance_km` REAL; `drive_minutes` INTEGER; `image_key` TEXT; `image_content_type` TEXT; `image_updated_at` INTEGER; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

#### Tým a vybavení

**`drivers`** — Evidence pilotů (17 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `name` TEXT NOT NULL; `team_id` TEXT; `default_category` TEXT NOT NULL DEFAULT ''; `race_number` TEXT NOT NULL DEFAULT ''; `nationality` TEXT NOT NULL DEFAULT ''; `is_active` INTEGER NOT NULL DEFAULT 1; `notes` TEXT NOT NULL DEFAULT ''; `photo_key` TEXT; `photo_content_type` TEXT; `photo_updated_at` INTEGER; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL; `billing_mode` TEXT NOT NULL DEFAULT 'self'; `customer_id` TEXT

**`teams`** — Evidence týmů (12 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `name` TEXT NOT NULL; `country_code` TEXT NOT NULL DEFAULT ''; `notes` TEXT NOT NULL DEFAULT ''; `logo_key` TEXT; `logo_content_type` TEXT; `logo_updated_at` INTEGER; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL; `customer_id` TEXT

**`mechanics`** — Evidence mechaniků (6 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `name` TEXT NOT NULL; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`clothing_items`** — Katalog položek týmového oblečení (12 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `name` TEXT NOT NULL; `sizes` TEXT NOT NULL DEFAULT '[]'; `default_quantity` INTEGER NOT NULL DEFAULT 1; `notes` TEXT NOT NULL DEFAULT ''; `image_key` TEXT; `image_content_type` TEXT; `image_updated_at` INTEGER; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`mechanic_clothing_assignments`** — Přiřazení oblečení konkrétnímu mechanikovi (11 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `mechanic_id` TEXT NOT NULL; `clothing_item_id` TEXT NOT NULL; `size` TEXT NOT NULL; `quantity` INTEGER NOT NULL DEFAULT 1; `assigned_at` INTEGER NOT NULL DEFAULT 0; `notes` TEXT NOT NULL DEFAULT ''; `created_by` TEXT NOT NULL; `updated_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`carburetors`** — Evidence konkrétních kusů karburátorů (14 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `code` TEXT NOT NULL UNIQUE; `carburetor_type_id` TEXT; `category` TEXT NOT NULL DEFAULT ''; `family` TEXT NOT NULL; `brand` TEXT NOT NULL DEFAULT ''; `model` TEXT NOT NULL DEFAULT ''; `status` TEXT NOT NULL DEFAULT 'ready'; `notes` TEXT NOT NULL DEFAULT ''; `sold_at` INTEGER; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`carburetor_types`** — Katalog typů karburátorů (značka/model) (12 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `brand` TEXT NOT NULL; `model` TEXT NOT NULL; `categories` TEXT NOT NULL DEFAULT '[]'; `notes` TEXT NOT NULL DEFAULT ''; `photo_key` TEXT; `photo_content_type` TEXT; `photo_updated_at` INTEGER; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`carburetor_service_entries`** — Servisní historie karburátoru (11 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `carburetor_id` TEXT NOT NULL; `service_date` TEXT NOT NULL; `service_type` TEXT NOT NULL CHECK (service_type IN ('check', 'routine', 'full', 'repair')); `mechanic_id` TEXT; `mechanic_name_snapshot` TEXT NOT NULL DEFAULT ''; `work_done` TEXT NOT NULL DEFAULT ''; `replaced_parts` TEXT NOT NULL DEFAULT ''; `notes` TEXT NOT NULL DEFAULT ''; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL

**`vehicles`** — Evidence vozového parku dílny (16 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `name` TEXT NOT NULL; `license_plate` TEXT NOT NULL DEFAULT ''; `notes` TEXT NOT NULL DEFAULT ''; `photo_key` TEXT; `photo_content_type` TEXT; `photo_updated_at` INTEGER; `current_km` INTEGER; `service_interval_km` INTEGER; `last_service_km` INTEGER; `last_service_note` TEXT NOT NULL DEFAULT ''; `last_service_date` TEXT NOT NULL DEFAULT ''; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`vehicle_service_entries`** — Servisní historie auta (9 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `vehicle_id` TEXT NOT NULL; `service_date` TEXT NOT NULL; `km` INTEGER; `work_done` TEXT NOT NULL DEFAULT ''; `mechanic_id` TEXT; `mechanic_name_snapshot` TEXT NOT NULL DEFAULT ''; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL

#### Zakázky (zakázkový servis)

**`customers`** — Evidence zákazníků zakázkového servisu (15 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `name` TEXT NOT NULL; `phone` TEXT NOT NULL DEFAULT ''; `email` TEXT NOT NULL DEFAULT ''; `address` TEXT NOT NULL DEFAULT ''; `company_id` TEXT NOT NULL DEFAULT ''; `vat_id` TEXT NOT NULL DEFAULT ''; `notes` TEXT NOT NULL DEFAULT ''; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL; `discount_work_percent` INTEGER NOT NULL DEFAULT 0; `discount_material_percent` INTEGER NOT NULL DEFAULT 0; `country_code` TEXT NOT NULL DEFAULT ''

**`customer_engines`** — Zákaznické motory evidované u zákazníka (9 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `customer_id` TEXT NOT NULL; `code` TEXT NOT NULL; `service_engine_type_id` TEXT NOT NULL; `note` TEXT NOT NULL DEFAULT ''; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`service_orders`** — Zakázky zakázkového servisu (28 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `number` TEXT NOT NULL; `customer_id` TEXT NOT NULL; `currency` TEXT NOT NULL DEFAULT 'CZK' CHECK (currency IN ('CZK', 'EUR')); `discount_work_percent` INTEGER NOT NULL DEFAULT 0; `discount_material_percent` INTEGER NOT NULL DEFAULT 0; `received_at` TEXT NOT NULL; `deadline_date` TEXT NOT NULL DEFAULT ''; `deadline_note` TEXT NOT NULL DEFAULT ''; `customer_note` TEXT NOT NULL DEFAULT ''; `internal_note` TEXT NOT NULL DEFAULT ''; `handover_type` TEXT NOT NULL DEFAULT 'personal' CHECK (handover_type IN ('personal', 'carrier', 'race')); `carrier` TEXT NOT NULL DEFAULT ''; `tracking_number` TEXT NOT NULL DEFAULT ''; `shipping_price_czk_cents` INTEGER NOT NULL DEFAULT 0; `shipping_price_eur_cents` INTEGER NOT NULL DEFAULT 0; `shipped_at` TEXT NOT NULL DEFAULT ''; `invoiced_at` INTEGER; `unlocked_at` INTEGER; `unlocked_by` TEXT NOT NULL DEFAULT ''; `cancelled_at` INTEGER; `cancelled_by` TEXT NOT NULL DEFAULT ''; `cancelled_reason` TEXT NOT NULL DEFAULT ''; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL; `deleted_at` INTEGER; `deleted_by` TEXT NOT NULL DEFAULT ''

**`service_order_engines`** — Motory zařazené do zakázky (24 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `order_id` TEXT NOT NULL; `customer_engine_id` TEXT NOT NULL; `engine_minutes` INTEGER; `scope` TEXT NOT NULL DEFAULT ''; `carb_service` INTEGER NOT NULL DEFAULT 0; `customer_parts` INTEGER NOT NULL DEFAULT 0; `customer_parts_text` TEXT NOT NULL DEFAULT ''; `status` TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'in_progress', 'waiting_part', 'done', 'checked', 'handed_over')); `taken_by` TEXT NOT NULL DEFAULT ''; `taken_by_name` TEXT NOT NULL DEFAULT ''; `taken_at` INTEGER; `completed_by` TEXT NOT NULL DEFAULT ''; `completed_by_name` TEXT NOT NULL DEFAULT ''; `completed_at` INTEGER; `checked_by` TEXT NOT NULL DEFAULT ''; `checked_at` INTEGER; `handed_over_at` INTEGER; `reopened_at` INTEGER; `reopened_by` TEXT NOT NULL DEFAULT ''; `reopen_reason` TEXT NOT NULL DEFAULT ''; `sort_order` INTEGER NOT NULL DEFAULT 0; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`service_order_materials`** — Použitý materiál na zakázce (16 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `order_engine_id` TEXT NOT NULL; `inventory_part_id` TEXT; `code` TEXT NOT NULL DEFAULT ''; `name` TEXT NOT NULL; `quantity` INTEGER NOT NULL DEFAULT 1; `unit_price_czk_cents` INTEGER NOT NULL DEFAULT 0; `unit_price_eur_cents` INTEGER NOT NULL DEFAULT 0; `discount_percent` INTEGER NOT NULL DEFAULT 0; `total_czk_cents` INTEGER NOT NULL DEFAULT 0; `total_eur_cents` INTEGER NOT NULL DEFAULT 0; `source` TEXT NOT NULL DEFAULT 'stock' CHECK (source IN ('stock', 'customer')); `created_by` TEXT NOT NULL; `created_by_name` TEXT NOT NULL DEFAULT ''; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`service_order_works`** — Provedené práce na zakázce (16 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `order_engine_id` TEXT NOT NULL; `price_item_id` TEXT; `code_snapshot` TEXT NOT NULL DEFAULT ''; `name_cs_snapshot` TEXT NOT NULL; `name_en_snapshot` TEXT NOT NULL; `quantity` INTEGER NOT NULL DEFAULT 1; `unit_price_czk_cents` INTEGER NOT NULL DEFAULT 0; `unit_price_eur_cents` INTEGER NOT NULL DEFAULT 0; `discount_percent` INTEGER NOT NULL DEFAULT 0; `total_czk_cents` INTEGER NOT NULL DEFAULT 0; `total_eur_cents` INTEGER NOT NULL DEFAULT 0; `created_by` TEXT NOT NULL; `created_by_name` TEXT NOT NULL DEFAULT ''; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`service_order_photos`** — Fotky přiložené k zakázce (10 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `order_id` TEXT NOT NULL; `order_engine_id` TEXT; `file_name` TEXT NOT NULL; `object_key` TEXT NOT NULL; `content_type` TEXT NOT NULL; `size_bytes` INTEGER NOT NULL DEFAULT 0; `note` TEXT NOT NULL DEFAULT ''; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL

**`service_order_waiting_parts`** — Čekané (objednané) díly u zakázky (12 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `order_engine_id` TEXT NOT NULL; `code` TEXT NOT NULL DEFAULT ''; `name` TEXT NOT NULL; `price_czk_cents` INTEGER NOT NULL DEFAULT 0; `price_eur_cents` INTEGER NOT NULL DEFAULT 0; `expected_date` TEXT NOT NULL DEFAULT ''; `is_ordered` INTEGER NOT NULL DEFAULT 0; `arrived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`service_order_numbers`** — Ledger přidělených čísel zakázek (3 sloupců)
- `number` TEXT PRIMARY KEY NOT NULL; `order_id` TEXT NOT NULL; `created_at` INTEGER NOT NULL

**`service_engine_types`** — Číselník typů motorů pro zakázkový servis (9 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `code` TEXT NOT NULL; `name_cs` TEXT NOT NULL; `name_en` TEXT NOT NULL; `sort_order` INTEGER NOT NULL DEFAULT 0; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`service_price_items`** — Ceník prací pro zakázkový servis (14 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `code` TEXT NOT NULL; `name_cs` TEXT NOT NULL; `name_en` TEXT NOT NULL; `material_included_cs` TEXT NOT NULL DEFAULT ''; `material_included_en` TEXT NOT NULL DEFAULT ''; `price_czk_cents` INTEGER NOT NULL DEFAULT 0; `price_eur_cents` INTEGER NOT NULL DEFAULT 0; `group_name` TEXT NOT NULL DEFAULT ''; `sort_order` INTEGER NOT NULL DEFAULT 0; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

#### Obchod

**`sales`** — Prodeje motorů, karburátorů, dílů a servisu (19 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `race_id` TEXT; `customer_id` TEXT; `team_id` TEXT; `sale_number` TEXT NOT NULL UNIQUE; `sale_date` TEXT NOT NULL; `customer_name` TEXT NOT NULL; `document_number` TEXT NOT NULL DEFAULT ''; `currency` TEXT NOT NULL DEFAULT 'CZK' CHECK (currency IN ('CZK', 'EUR')); `total_cents` INTEGER NOT NULL DEFAULT 0; `payment_method` TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'invoice', 'other')); `is_paid` INTEGER NOT NULL DEFAULT 0; `is_delivered` INTEGER NOT NULL DEFAULT 0; `notes` TEXT NOT NULL DEFAULT ''; `voided_at` INTEGER; `voided_by` TEXT; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`sale_items`** — Jednotlivé položky prodeje (11 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `sale_id` TEXT NOT NULL; `item_type` TEXT NOT NULL CHECK (item_type IN ('engine', 'carburetor', 'part', 'service', 'other')); `line_kind` TEXT NOT NULL DEFAULT ''; `resource_id` TEXT; `code_snapshot` TEXT NOT NULL DEFAULT ''; `description` TEXT NOT NULL; `description_en_snapshot` TEXT NOT NULL DEFAULT ''; `quantity` INTEGER NOT NULL DEFAULT 1; `unit_price_cents` INTEGER NOT NULL DEFAULT 0; `line_total_cents` INTEGER NOT NULL DEFAULT 0

**`inventory_parts`** — Sklad náhradních dílů (16 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `code` TEXT NOT NULL UNIQUE; `name` TEXT NOT NULL; `categories` TEXT NOT NULL DEFAULT '[]'; `quantity` INTEGER NOT NULL DEFAULT 0; `unit` TEXT NOT NULL DEFAULT 'ks'; `price_czk_cents` INTEGER NOT NULL DEFAULT 0; `price_eur_cents` INTEGER NOT NULL DEFAULT 0; `notes` TEXT NOT NULL DEFAULT ''; `image_key` TEXT; `image_content_type` TEXT; `image_updated_at` INTEGER; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`service_catalog`** — Starší servisní ceník použitý v Prodeji (11 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `name` TEXT NOT NULL; `description` TEXT NOT NULL DEFAULT ''; `description_cs` TEXT NOT NULL DEFAULT ''; `description_en` TEXT NOT NULL DEFAULT ''; `price_czk_cents` INTEGER NOT NULL DEFAULT 0; `price_eur_cents` INTEGER NOT NULL DEFAULT 0; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`checklists`** — Šablony kontrolních seznamů (balicí listy) (7 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `name` TEXT NOT NULL; `notes` TEXT NOT NULL DEFAULT ''; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`checklist_items`** — Položky šablony kontrolního seznamu (7 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `checklist_id` TEXT NOT NULL; `section` TEXT NOT NULL DEFAULT ''; `part_number` TEXT NOT NULL DEFAULT ''; `name` TEXT NOT NULL; `quantity` INTEGER NOT NULL DEFAULT 1; `sort_order` INTEGER NOT NULL DEFAULT 0

#### Systém

**`app_settings`** — Obecné nastavení systému (např. adresa pro QR) (4 sloupců)
- `key` TEXT PRIMARY KEY NOT NULL; `value` TEXT NOT NULL DEFAULT ''; `updated_by` TEXT NOT NULL DEFAULT ''; `updated_at` INTEGER NOT NULL

**`app_users`** — Uživatelé systému, role a jazyk rozhraní (8 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `email` TEXT NOT NULL UNIQUE; `full_name` TEXT NOT NULL; `role` TEXT NOT NULL CHECK (role IN ('superadmin', 'boss', 'mechanic')); `locale` TEXT NOT NULL DEFAULT 'cs' CHECK (locale IN ('cs', 'en')); `is_active` INTEGER NOT NULL DEFAULT 1; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

**`audit_logs`** — Centrální auditní log všech akcí v systému (7 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `actor_email` TEXT NOT NULL; `action` TEXT NOT NULL; `entity_type` TEXT NOT NULL; `entity_id` TEXT NOT NULL; `details` TEXT NOT NULL DEFAULT '{}'; `created_at` INTEGER NOT NULL

**`work_items`** — Pomocná/starší evidence prací (bez vlastní obrazovky v menu) (15 sloupců)
- `id` TEXT PRIMARY KEY NOT NULL; `kind` TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('task', 'reminder')); `title` TEXT NOT NULL; `description` TEXT NOT NULL DEFAULT ''; `priority` TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')); `status` TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')); `due_at` TEXT; `assignee_name` TEXT NOT NULL DEFAULT ''; `race_id` TEXT; `completed_by` TEXT; `completed_at` INTEGER; `archived_at` INTEGER; `created_by` TEXT NOT NULL; `created_at` INTEGER NOT NULL; `updated_at` INTEGER NOT NULL

Celkem: **76 tabulek, 923 sloupců.**

### 14.5 API routy — kompletní seznam

Přístup mechanika je uveden přesně podle whitelistu v `app/api-access.ts` (default-deny - vše, co tu není označeno ANO, mechanik nesmí ani ke čtení). Sloupec Zápis u ostatních rolí je orientační odhad podle kódu jednotlivé routy - u drobného počtu rout, kde je kontrola role schovaná ve sdílené pomocné funkci, se nemusí zobrazit přesně; s jistotou platí vždy sloupec Mechanik.

| Cesta | K čemu je | Metody | Mechanik čte | Mechanik zapisuje | Zápis (ostatní role) |
|---|---|---|---|---|---|
| `/api/accommodation-distance` | Dopočítá vzdálenost a dobu jízdy ubytování od tratě | POST | ne | ne | vedení i superadmin |
| `/api/activity` | Poslední záznamy z auditního logu pro Přehled | GET | ne | ne | - (jen čtení) |
| `/api/app-settings` | Obecné nastavení systému (základní adresa pro QR) | GET, PUT | ne | ne | vedení i superadmin, PUT jen superadmin |
| `/api/carburetor-records` | Detail karburátoru a jeho servisní historie | GET, POST, PUT | ne | ne | vedení i superadmin |
| `/api/carburetor-type-photo` | Fotka typu karburátoru v katalogu | GET, POST, DELETE | ne | ne | vedení i superadmin |
| `/api/carburetor-types` | Katalog typů karburátorů (značka/model) | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin, DELETE jen superadmin |
| `/api/catalog` | Společný číselník pilotů, týmů, mechaniků a aut | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin, DELETE jen superadmin |
| `/api/checklists` | Šablony kontrolních seznamů (balicí listy) | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin, DELETE jen superadmin |
| `/api/circuit-image` | Obrázek/mapa tratě | GET, POST | ne | ne | vedení i superadmin |
| `/api/circuit-location` | Dohledání GPS polohy tratě podle adresy | POST | ne | ne | vedení i superadmin |
| `/api/circuits` | Adresář tratí | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin, DELETE jen superadmin |
| `/api/clothing` | Katalog oblečení a přiřazení mechanikům | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin, DELETE jen superadmin |
| `/api/clothing-image` | Fotka položky týmového oblečení | GET, POST, DELETE | ne | ne | vedení i superadmin |
| `/api/competition-history` | Kompletní historie startů pilota nebo týmu | GET | ne | ne | - (jen čtení) |
| `/api/customer-engines` | Zákaznické motory evidované u zákazníka | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin |
| `/api/customer-search` | Křížové hledání zákazníka napříč systémem | GET | ne | ne | - (jen čtení) |
| `/api/customer-service` | Mechanikova pracovní obrazovka pro zákaznický motor | GET, PUT | ANO | ANO | vedení i superadmin |
| `/api/customers` | Evidence zákazníků a karta zákazníka | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin, DELETE jen superadmin |
| `/api/dev-session` | Vývojářské přihlášení mimo produkci | GET, POST | ne | ne | vedení i superadmin |
| `/api/driver-photo` | Fotka pilota | GET, POST, DELETE | ne | ne | vedení i superadmin |
| `/api/engine-document-types` | Číselník typů dokumentů motoru | GET, POST, PUT, DELETE | ne | ne | číst smí i vedení, zapisovat a mazat jen superadmin |
| `/api/engine-documents` | Dokumenty (faktury, homologace) u motoru | GET, POST, DELETE | ne | ne | vedení i superadmin |
| `/api/engine-loans` | Zápůjčky motorů | GET, POST, PUT | ne | ne | vedení i superadmin |
| `/api/engine-records` | Zápis servisu a motohodin — starý model karty | GET, POST, PATCH, DELETE | ne | ne | vedení i superadmin, POST/PATCH/DELETE jen superadmin |
| `/api/engine-service-part-catalog` | Katalog dílů servisní karty MINI (starý model) | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin, POST/PUT/DELETE jen superadmin |
| `/api/engine-technical-structure` | Nastavení struktury technických údajů podle rodiny motoru | GET, POST, PUT, DELETE | ANO | ne | vedení i superadmin, POST/PUT/DELETE jen superadmin |
| `/api/engine-timeline` | Časová osa motoru (historie napříč zdroji) | GET | ANO | ne | - (jen čtení) |
| `/api/engines` | Evidence motorů a jejich základních/technických údajů | GET, POST, PUT, PATCH, DELETE | ANO | ne | vedení i superadmin, PUT/DELETE jen superadmin |
| `/api/inventory` | Sklad náhradních dílů | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin, DELETE jen superadmin |
| `/api/inventory-image` | Fotka dílu ve skladu | GET, POST, DELETE | ne | ne | vedení i superadmin |
| `/api/logistics` | Ubytování, letenky a pronájem aut k závodům | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin, DELETE jen superadmin |
| `/api/logistics-attachments` | Přílohy k ubytování/letence/pronájmu auta | GET, POST, DELETE | ne | ne | vedení i superadmin |
| `/api/mechanic-records` | Detailní karta mechanika s historií cest | GET | ne | ne | - (jen čtení) |
| `/api/race-activity` | Historie změn na konkrétním závodě | GET | ne | ne | - (jen čtení) |
| `/api/race-checklists` | Checklisty připojené ke konkrétnímu závodu | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin |
| `/api/race-deliveries` | Předávky zákazníkům na závodě | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin |
| `/api/race-finance` | Finance závodu (platby pilotů, prodej, náklady) | GET, PUT | ne | ne | vedení i superadmin |
| `/api/race-followup-notes` | Poznatky ze závodu | GET, PUT | ne | ne | vedení i superadmin, PUT jen superadmin |
| `/api/race-mode` | RACE MODE — potvrzení jel/nejel a motohodiny na place | GET, POST | ANO | ANO | vedení i superadmin |
| `/api/race-planning` | Přiřazení pilotů, motorů a karburátorů k závodu | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin |
| `/api/race-team-visits` | Návštěvy jiných týmů na závodě | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin |
| `/api/race-template-logo` | Logo typu závodu | GET, POST, DELETE | ne | ne | vedení i superadmin |
| `/api/races` | Evidence závodů (základní údaje a seznam) | GET, POST, PUT, DELETE | ANO | ne | vedení i superadmin, DELETE jen superadmin |
| `/api/sales` | Prodej motorů, karburátorů, dílů a servisu | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin, DELETE jen superadmin |
| `/api/service-card-settings` | Nastavení nové servisní karty (typy servisu, položky, materiál) | GET, POST, PUT, DELETE | ANO | ne | vedení i superadmin, POST/PUT/DELETE jen superadmin |
| `/api/service-catalog` | Starší servisní ceník pro Prodej | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin, DELETE jen superadmin |
| `/api/service-engine-types` | Číselník typů motorů pro zakázkový servis | GET, POST, PUT, DELETE | ne | ne | číst smí i vedení, zapisovat a mazat jen superadmin |
| `/api/service-history` | Report servisní historie za období | GET | ne | ne | - (jen čtení) |
| `/api/service-order-photos` | Fotky u zakázky zakázkového servisu | GET, POST, DELETE | ne | ne | vedení i superadmin |
| `/api/service-orders` | Zakázky zakázkového servisu | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin; jen superadmin smí přesun do koše, odemčení vyfakturované zakázky a DELETE |
| `/api/service-price-items` | Ceník prací pro zakázkový servis | GET, POST, PUT, DELETE | ne | ne | číst smí i vedení, zapisovat a mazat jen superadmin |
| `/api/service-queue` | Fronta motorů na servis | GET, POST | ANO | ANO | vedení i superadmin |
| `/api/service-records` | Zápis a historie servisu — nová servisní karta | GET, POST, PATCH, DELETE | ANO | ANO | vedení i superadmin; PATCH (do 24 h) a DELETE (storno) smí jen autor záznamu nebo superadmin |
| `/api/session` | Údaje o přihlášené session | GET | ANO | ne | - (jen čtení) |
| `/api/tasks` | Úkoly a připomínky | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin, DELETE jen superadmin |
| `/api/team-logo` | Logo týmu | GET, POST, DELETE | ne | ne | vedení i superadmin |
| `/api/users` | Správa uživatelů a rolí (Nastavení) | GET, POST, PUT | ne | ne | vedení i superadmin, POST/PUT jen superadmin |
| `/api/vehicle-photo` | Fotka auta | GET, POST, DELETE | ne | ne | vedení i superadmin |
| `/api/vehicle-records` | Detail auta a jeho historie | GET | ne | ne | - (jen čtení) |
| `/api/vehicle-service-entries` | Servisní záznamy auta | GET, POST, PUT, DELETE | ne | ne | vedení i superadmin, DELETE jen superadmin |
| `/api/weather` | Počasí a předpověď pro trať závodu | GET | ne | ne | - (jen čtení) |

### 14.6 Celkové součty

| Metrika | Hodnota |
|---|---:|
| Kódových souborů (.ts/.tsx/.css/.mjs) sledovaných gitem | 154 |
| Řádků kódu celkem | 43461 |
| Znaků kódu celkem | 2693246 |
| z toho řádků CSS (`app/globals.css`) | 4868 |
| Databázových tabulek | 76 |
| Databázových sloupců celkem | 923 |
| API rout | 61 |
| Položek v levém menu (nav) | 25 |
| Skupin v levém menu | 7 |
| Kapitol v tomto dokumentu | 14 |

Mimo tato čísla repozitář dále obsahuje: 30 souborů deklarativních drizzle migrací (563 řádků,
neaplikují se), `package-lock.json` (10 541 řádků závislostí), a pár desítek konfiguračních a
obrázkových souborů (viz kapitola 14.1).
