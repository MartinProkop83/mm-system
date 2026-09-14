# MM System — co systém umí

Přehled pro vedení firmy. Popisuje, co je v systému hotové a používá se, sekci po sekci.
Stav k 14. 9. 2026.

---

## Co je MM System

Vnitřní systém Macháč Motors pro správu kartingového týmu a dílny. Běží v prohlížeči na
počítači, tabletu i telefonu a nahrazuje tabulky, papíry a lepíky, na kterých dosud stálo
plánování závodů, evidence motorů a servisní práce.

Tři věci, které systém dělá jinak než tabulka:

1. **Nic se nepřepisuje beze stopy.** U každé změny zůstane, kdo ji udělal a kdy. Historie se
   ukládá jako otisk stavu v době zápisu — když se za rok přejmenuje díl nebo archivuje
   varianta, starý záznam zůstane čitelný tak, jak byl pořízen.
2. **Co jde dopočítat, systém počítá sám.** Motohodiny, stav motorů po závodě, fronta na
   servis, skladové množství po prodeji, vzdálenost na trať i počasí na závodním víkendu.
3. **Každý vidí to svoje.** Mechanik u ponku má jinou obrazovku než vedení a k obchodním
   číslům se nedostane.

---

# Sekce v levém menu

## Přehled

**K čemu:** Domovská obrazovka s tím, co je dnes důležité — nejbližší závod, co vyžaduje
pozornost a jak na tom stojí vybavení.

**Co umí**

- Karta **nejbližšího závodu** s termínem, tratí a počty přihlášených pilotů, motorů
  a karburátorů; prokliknutím se otevře plán závodu
- **Úkoly a upozornění** — kolik motorů potřebuje servis, kolik karburátorů, kolik aut,
  kolik je otevřených úkolů; každý řádek je proklik na místo, kde se to řeší
- **Přehled vybavení** — počty pilotů, motorů a karburátorů
- **Stav motorů podle kategorie** — kolik je připravených, kolik čeká na servis, kolik
  je v přestavbě a kolik ve skladu, rozpadnuté po kategoriích MINI / OKJ / OKN / OKN-J / OK / KZ
- **Nadcházející závody** a **sezónní přehled** s možností přepnout na celý kalendář
- **Poslední aktivita** — co se v systému naposledy dělo
- **Zvonek s upozorněními** v horní liště: motory a auta, které potřebují servis; číslo
  u zvonku ukazuje, kolik jich je, a kliknutím se otevře přímo daná karta

**Data:** vlastní data nedrží, vše skládá z ostatních sekcí.

**Propojení:** Závody, Motory, Auta, Úkoly, Kalendář.

---

## Úkoly

**K čemu:** Seznam toho, co je potřeba udělat, kdo to má na starosti a do kdy.

**Co umí**

- Zakládání **úkolů i připomínek** (dvě odlišené kategorie)
- **Priorita** ve čtyřech stupních: nízká, normální, vysoká, kritická
- **Stav** otevřeno → probíhá → hotovo, s možností úkol znovu otevřít
- **Termín** s hlídáním po termínu
- **Přiřazení konkrétnímu mechanikovi** z adresáře, nebo bez přiřazení
- **Navázání na závod** — úkol se dá připnout ke konkrétnímu výjezdu
- Filtry **Aktivní / Na dnešek / Po termínu / Hotové**
- Popis a poznámka u každého úkolu

**Data:** název, popis, priorita, stav, termín, odpovědný mechanik, navázaný závod,
kdo úkol vytvořil, kdo a kdy ho dokončil.

**Historie:** u hotového úkolu zůstává, kdo ho dokončil a kdy.

**Propojení:** Závody (navázání úkolu), Mechanici (přiřazení).

---

## Kalendář

**K čemu:** Roční kalendář výjezdů, kde je na jednom místě vidět, kdo kdy kam jede a s čím.

**Co umí**

- Měsíční pohled se závody, který ukazuje i navazující logistiku: **přiřazené mechaniky,
  týmová auta, pronajatá auta, ubytování a lety**
- **Filtr podle mechanika** a **podle auta** — „kde je tenhle týden dodávka" nebo
  „kdy má Vašut volno"
- Barevné odlišení závodů podle typu (barva se nastavuje u typu závodu)
- Proklik z kteréhokoli dne rovnou na detail závodu
- **Tisk kalendáře**
- Dny bez výjezdu zůstávají prázdné, takže jsou volné termíny vidět na první pohled

**Data:** vlastní nemá, skládá závody s logistikou a přiřazeními.

**Propojení:** Závody, Mechanici, Auta, Ubytování, Letenky, Pronájem aut.

---

## Závody

**K čemu:** Úplné plánování závodního víkendu od přihlášek přes techniku a posádku až po
peníze a poznatky.

**Co umí**

*Základ závodu*

- Založení závodu z **přednastaveného typu** (série) nebo ručně
- Termíny ve čtyřech krocích: **odjezd z dílny → začátek → konec závodu → návrat**, systém
  hlídá, že jdou ve správném pořadí
- Napojení na **trať z adresáře** — tím se do závodu automaticky dostane mapa tratě,
  vzdálenost a doba jízdy z dílny v Kopřivnici
- **Počasí na trati** pro termín závodu (teplota, vítr, déšť), dostupné zhruba 16 dní dopředu
- Stavy **Plánováno → Probíhá → Dokončeno → Archiv**
- Přetahováním se dá přeuspořádat pořadí bloků v detailu závodu podle toho, co kdo potřebuje
  mít nahoře

*Piloti a vybavení*

- Přihlášení pilotů po kategoriích, s pořadím a poznámkou u každého
- Ke každému pilotovi až **tři motory a tři karburátory** (hlavní a náhradní)
- **Kontrola kolizí** — stejný motor ani karburátor nejde vybrat dvakrát; systém hlásí,
  když je kus už přiřazený k jinému souběžnému závodu nebo je zapůjčený
- **Extra vybavení** nad rámec pilotů
- **Potvrzení pilotů** jednotlivě nebo všech najednou
- Neaktivního pilota systém k novému závodu nepustí
- Ukazatel **„Závod je připraven" / „Závod ještě není kompletní"**

*Posádka a doprava*

- Přiřazení **mechaniků** k závodu
- **Týmová auta** a rozdělení, kdo jede v kterém
- Napojení na ubytování, lety a pronájmy z logistiky

*Předávky a platby*

- Evidence **předávek zákazníkům** přímo na place: co se předalo, komu, za kolik,
  hotově nebo převodem, zda už bylo předáno a zaplaceno
- **Návštěvy jiných týmů** — když si někdo z cizího týmu přijde pro díl, servis nebo
  materiál; eviduje se tým, pilot, položka ze skladu nebo z ceníku servisu, množství a cena
- **Finance závodu** — součet dílů, servisu, prodejů a nákladů na cestu, celkový výsledek
  závodu (vidí jen superadmin a vedení)

*Ostatní*

- **Checklisty vybavení** — přiřazení šablony z Dokumentů a odškrtávání před odjezdem
- **Poznatky ze závodu** — volné poznámky po návratu
- **Historie změn závodu** — kdo kdy přidal pilota, změnil posádku, potvrdil přihlášky,
  přidal předávku nebo návštěvu jiného týmu
- **Archiv závodů** s vlastním filtrem

**Data:** název, série, typ, trať, země, termíny, stav, přihlášky pilotů s motory
a karburátory, mechanici, auta, extra vybavení, předávky, návštěvy jiných týmů, finance,
checklisty, poznatky.

**Historie:** kompletní — každý zásah do závodu je zaznamenaný se jménem a časem. Dokončený
závod smí měnit už jen superadmin.

**Propojení:** prakticky se vším — Piloti, Týmy, Motory, Karburátory, Mechanici, Auta,
Tratě, Typy závodů, Zákazníci, Sklad, Ceník servisu, Ubytování, Letenky, Pronájem aut,
Dokumenty, Kalendář, Servis (motor po závodě spadne do fronty).

---

## Typy závodů

**K čemu:** Číselník závodních sérií a přednastavených závodů, aby se nový výjezd zakládal
jedním kliknutím.

**Co umí**

- Pojmenované typy závodů (série) s **vlastním logem**
- **Barva v kalendáři** — každá série má svou barvu
- **Výchozí kategorie** závodu
- Ochrana proti smazání typu, který je použitý u existujícího závodu

**Data:** název, logo, barva, výchozí kategorie.

**Propojení:** Závody, Kalendář.

---

## Tratě

**K čemu:** Adresář tratí s polohou, dopravou a podkladem pro počasí.

**Co umí**

- Evidence tratí se zemí a názvem, filtr podle země
- **Obrázek nebo mapa tratě** (PNG/JPG/WebP do 10 MB)
- **Načtení polohy** z odkazu Google Maps nebo z adresy; souřadnice se dají doplnit ručně
- **Orientační vzdálenost z dílny a doba jízdy** — systém je spočítá podle silniční trasy
- Stavový ukazatel, jestli je trať připravená na počasí („Poloha a počasí připravené")

**Data:** název, země, souřadnice, obrázek tratě, vzdálenost a doba jízdy z dílny.

**Propojení:** Závody (počasí a doprava), Kalendář.

---

## Piloti

**K čemu:** Adresář pilotů se zařazením do kategorií a do týmů.

**Co umí**

- Jméno, **národnost**, fotka
- **Kategorie**, ve kterých pilot jezdí (i víc naráz), s filtrem podle kategorie
- Zařazení do **týmu**
- **Fakturační vazba** — na koho půjde faktura: na pilota, na tým, nebo na konkrétního
  zákazníka
- **Aktivní / neaktivní** — neaktivní pilot se nedá přiřadit k novému závodu, ale jeho
  historie zůstává
- **Nejbližší závod** u každého pilota
- Karta pilota s **kompletní historií závodů**

**Data:** jméno, národnost, fotka, kategorie, tým, fakturační vazba, stav.

**Historie:** účast na závodech vzniká automaticky přiřazením v plánu závodu.

**Propojení:** Závody, Týmy, Zákazníci, Prodej (fakturace).

---

## Týmy

**K čemu:** Adresář týmů, pod které piloti spadají.

**Co umí**

- Název týmu a **logo**
- Volitelné **propojení na zákazníka** — faktury týmu pak jdou na něj
- Seznam pilotů týmu

**Data:** název, logo, vazba na zákazníka.

**Propojení:** Piloti, Zákazníci, Závody.

---

## Zákazníci

**K čemu:** Kontakty odběratelů a přehled toho, co u nás kdo nakoupil.

**Co umí**

- Evidence jména nebo firmy, kontaktů; kontrola duplicitního e-mailu
- Zákazníci vznikají **ručně i automaticky při prodeji**
- **Historie odběrů** u každého zákazníka
- Archivace zákazníka se zachováním historie prodejů

**Data:** jméno/firma, kontakt, historie nákupů.

**Propojení:** Prodej, Týmy, Piloti, Závody (předávky na place).

---

## Mechanici

**K čemu:** Adresář mechaniků a jejich karta s vybavením a odjetými závody.

**Co umí**

- Evidence mechaniků
- Karta mechanika s **oblečením a velikostmi**, co má kdo převzato
- **Kompletní historie závodů** — kdy a kde byl mechanik přiřazený, v jakém stavu závod je
- **Statistiky** — dnů na cestách, počet navštívených zemí
- U každého závodu je vidět, jestli má mechanik zajištěné **ubytování, letenku a pronájem auta**
- **Uložení karty do PDF** pro tisk

**Data:** jméno, přiřazené oblečení a velikosti, historie závodů.

**Historie:** účast na závodech vzniká automaticky přiřazením v plánu závodu.

**Propojení:** Závody, Oblečení, Ubytování, Letenky, Pronájem aut, Úkoly, Servis
(mechanik u servisního záznamu).

---

## Oblečení

**K čemu:** Týmové oblečení — jaké typy máme, v jakých velikostech a kdo co dostal.

**Co umí**

- **Katalog typů oblečení** s fotkou, dostupnými velikostmi a výchozím počtem kusů
- Doporučená **startovní sada** pro rychlý rozjezd
- **Přiřazení mechanikům** — konkrétní velikost, počet kusů, poznámka, příznak „předáno"
- Hlídání kolizí: položku přiřazenou mechanikovi nejde smazat, velikost obsazenou jiným
  mechanikem nejde přiřadit podruhé
- Přehled **kolik typů oblečení** a **kolik vybavených mechaniků**

**Data:** typ oblečení, fotka, velikosti, počty kusů, přiřazení konkrétním mechanikům,
poznámky, předání.

**Propojení:** Mechanici.

---

## Motory

**K čemu:** Úplná karta každého motoru — technika, motohodiny, servis, zápůjčky a historie.

**Co umí**

*Evidence*

- Kód motoru, kategorie (MINI, OKJ, OKN, OKN-J, OK, KZ), zapalování, generace u KZ,
  konfigurace u MINI, úprava motoru, datum nákupu, **barevný štítek** pro rozlišení v dílně
- **Stav motoru**: připraveno, brzy servis, servis, přestavba, sklad, vyřazeno
- Filtr podle kategorie a stavu, vyhledávání

*Technické údaje*

- **Volně definovatelná struktura technických údajů** pro každou kategorii zvlášť —
  sekce, pole, typy polí (text, číslo, výběr z voleb) a jejich pořadí si nastavuje superadmin
- Struktura se dá **zkopírovat z jedné kategorie do druhé**
- Vybraná pole se ukazují už v přehledu motoru
- **Historie změn technických údajů** — u každé změny je stará i nová hodnota, kdo ji
  provedl a jestli šlo o ruční zásah, nebo se hodnota propsala ze servisu

*Motohodiny*

- Zápis motohodin z Oppamy po závodech
- **Počítadla pístu a ojnice** se dopočítávají automaticky
- **Výchozí stav** před prvním digitálním záznamem, ke kterému se pozdější zápisy dopočítají
- Oprava i smazání záznamu s automatickým přepočtem
- Kategorie MINI a OKJ motohodiny nesledují vůbec — u nich se nikde neukazují

*Servisní karta*

- Dlaždice položek servisu (píst, gufera, ložiska kliky, kompletní ojnice, horní klec,
  těsnění válce, těsnění hlavy…) podle definice pro danou kategorii
- U kategorií s motohodinami **barva podle najetého intervalu** — zelená, oranžová při
  blížícím se intervalu, červená po jeho překročení
- Zápis servisu: typ servisu, datum, **čas**, mechanik, zaškrtnuté položky, u položek
  s materiálem **výběr hotové varianty z katalogu** (mechanik nikdy nepíše rozměry ručně),
  poznámka
- **Mechanik je povinný** a předvyplní se podle toho, kdo si motor ve frontě zabral
- Rozměr pístu se ze servisu **propíše do technických údajů**; když mechanik propsání
  vypne, uloží se k záznamu, že je rozchod vědomý
- Oprava záznamu do 24 hodin, potom už jen **storno s povinným důvodem** — záznam nezmizí,
  zůstane přeškrtnutý s vysvětlením

*Zápůjčky*

- **Zapůjčení motoru** s příjemcem, termínem a očekávaným vrácením
- **Prodloužení** a **vrácení** zápůjčky
- Prošlé zápůjčky se zvýrazní a řadí se nahoru
- Zapůjčený motor **nejde přiřadit k závodu**, dokud se nevrátí
- Poloha motoru („v dílně / na závodě / zapůjčen") se odvozuje sama

*Historie*

- **Časová osa motoru** — jeden chronologický seznam všeho, co se s motorem dělo: servisy
  (nové i staré), storna, závody, zápůjčky a návraty, zařazení do fronty a odbavení, změny
  technických údajů, motohodiny a systémové události
- Filtry podle druhu události s počty, přepínač systémových událostí
- U změny technického údaje je vidět, jestli šlo o ruční zásah, nebo o propsání ze servisu,
  a proklik na servisní záznam, který ji způsobil

*QR kód*

- QR štítek motoru s krátkým identifikátorem, stažení jako PNG a tisk jednoho štítku
  (podrobně v sekci QR kódy)

**Data:** identifikace a technika motoru, motohodiny, servisní záznamy s materiálem,
zápůjčky, poloha, QR identifikátor.

**Historie:** vše — servis, motohodiny, technické změny, zápůjčky, změny stavu, závody.

**Propojení:** Závody, Servis, Servisní historie, QR kódy, Prodej, Nastavení (servisní karta
a struktura technických údajů).

---

## Karburátory

**K čemu:** Evidence karburátorů s vlastní servisní historií a nasazením na závodech.

**Co umí**

- **Katalog typů karburátorů** (značka, model, kategorie) a jednotlivé kusy s kódem
- Fotka karburátoru
- Stavy připraveno / servis potřeba / vyřazen
- **Servisní záznamy**: běžný i kompletní servis, provedené práce, vyměněné díly, poznámka,
  kdo servis zapsal
- **Historie závodů** — kdy byl karburátor nasazený, u kterého pilota a s jakým motorem,
  na které pozici; počet odjetých závodů
- Ochrana: typ, který používá existující kus, nejde smazat

**Data:** typ, kód, fotka, stav, servisní záznamy, nasazení na závodech.

**Historie:** servis i závodní nasazení.

**Propojení:** Závody, Piloti, Motory, Prodej.

---

## Auta

**K čemu:** Týmová auta — nájezd, servisní intervaly a historie výjezdů.

**Co umí**

- Evidence aut s názvem a **aktuálním nájezdem v km**
- **Servisní interval** a hlídání, kdy se blíží nebo už uplynul (stav připraveno /
  servis potřeba)
- **Servisní záznamy** s nájezdem při servisu, provedenými pracemi a poznámkou
- **Historie výjezdů** — kde a s kým bylo auto naposledy, s termínem a stavem závodu
- Auta se dají v kalendáři filtrovat a přiřazovat k závodům včetně rozdělení posádky

**Data:** název, nájezd, servisní interval, servisní historie, výjezdy.

**Historie:** servis i výjezdy; výjezdy vznikají automaticky přiřazením k závodu.

**Propojení:** Závody, Kalendář, Mechanici, Dokumenty (checklisty vybavení), Přehled
(upozornění na servis).

---

## Servis

**K čemu:** Fronta motorů, které se vrátily a čekají na servis — hlavní pracovní obrazovka
mechanika a nástěnka v dílně.

**Co umí**

- Fronta se **plní sama**: motor se objeví po skončení závodu, na kterém byl přihlášený,
  a po vrácení ze zápůjčky
- **Ruční zařazení** motoru s povinným důvodem („divný zvuk", „kontrola po pádu"); motor,
  který už ve frontě je, nejde přidat podruhé
- **Jedna dlaždice na motor**, i když přijel z víc zdrojů; na dlaždici jsou všechny důvody
  („Cheb + zápůjčka") a odbavení vyřídí všechny najednou
- Dlaždice ukazuje **číslo motoru, kategorii, závod nebo zápůjčku, pilota a datum návratu**,
  všechno v pevné velikosti, aby byla mřížka čitelná z dálky
- **Kanban po kategoriích** s filtrem a počty
- **„Beru si ho"** — mechanik si motor zabere, aby na něm nedělali dva; zabraný motor už
  nikdo jiný vzít nemůže. Uvolnit ho může ten, kdo si ho vzal, plus vedení a superadmin
- Rozpracovaný motor jde nahoru a barevně se stupňuje: **do 4 hodin modrá, nad 4 hodiny
  oranžová, přes noc červená**, aby bylo z druhé strany dílny vidět, co tam visí od včerejška
- Na sdílené obrazovce v dílně (jeden účet za celou partu) se při zabrání **vybírá mechanik**,
  aby se nezapsala nesprávná osoba; mechanikův vlastní účet se nikoho neptá
- **Odbavení servisem** (zápis servisního záznamu) nebo **„Nejel / bez servisu"** jedním
  kliknutím, i hromadně pro celý výběr — po velkém závodě může ve frontě čekat šedesát motorů
- **Hodiny se sekundami a datem** v hlavičce, protože obrazovka v dílně slouží i jako hodiny
- **Volba hustoty** 1–6 dlaždic na řádek, uložená pro dané zařízení (nástěnka na zdi chce
  jinou hodnotu než mobil)
- **Celoobrazovkový režim bez menu** na vlastní adrese — mechanik v něm má celou aplikaci
  a nikam jinam se neproklikne
- Automatické obnovení každou minutu

**Data:** ruční zařazení s důvodem, odbavení fronty, zabrání motorů (kdo, který mechanik,
odkdy, kdy a proč uvolněno).

**Historie:** kdo motor zabral a kdy, kdo ho odbavil a jak, vše i v časové ose motoru.

**Propojení:** Motory, Závody, Zápůjčky, Servisní historie, Mechanici.

---

## Servisní historie

**K čemu:** Přehled odvedené práce napříč všemi motory za zvolené období, včetně denního
reportu.

**Co umí**

- Tabulka všech servisů: **datum a čas, kategorie, motor, typ servisu, mechanik, co se
  dělalo (včetně materiálu), poznámka**
- Zahrnuje záznamy z nové servisní karty i ze staré (kategorie, které na novou ještě
  nepřešly, do ní zapisují dodnes) — staré mají štítek „Stará karta"
- Stornované záznamy jsou přeškrtnuté s důvodem
- **Filtry**: období (dnes / tento týden / tento měsíc / vlastní rozsah), kategorie,
  konkrétní motor, mechanik
- **Denní report** nad tabulkou: kolik motorů čekalo na servis, kolik bylo odbaveno servisem,
  kolik odbaveno bez servisu, kolik zbývá ve frontě a kolik servisů se zapsalo
- **Rozpad po kategoriích** i **po mechanicích** — kdo kolik udělal
- Čísla o frontě se počítají podle data, kdy motor z fronty skutečně odešel, ne podle data
  servisu; „zapsaných servisů" se počítá nezávisle na frontě, aby seděl i servis motoru,
  který frontou nikdy neprošel

**Data:** vlastní nemá, čte servisní záznamy a frontu.

**Přístup:** superadmin a vedení. Mechanik se do sekce nedostane.

**Propojení:** Motory, Servis, Mechanici.

---

## QR kódy

**K čemu:** Štítky na motory — naskenováním telefonem se otevře servisní karta toho motoru.

**Co umí**

- Každý motor má **krátký neměnný identifikátor** (šest znaků, např. `WPH83B`), který vzniká
  při založení motoru a nikdy se nemění — vytištěný štítek platí, i když se motor přejmenuje
- Znaky, které se pletou (0/O, 1/I/l), se v identifikátoru nepoužívají; při ručním dohledání
  se překlepy samy opraví
- Identifikátor je na kartě vytištěný velkým písmem, aby se dal přečíst okem, když QR nejde
  naskenovat
- QR vede na **trvalý odkaz**, který jen najde motor a přesměruje na jeho servisní kartu —
  kdyby se vnitřní adresy někdy přeskládaly, štítky platí dál
- **Přihlášení je povinné**, ale scan se nezahodí: po přihlášení skončí člověk rovnou
  na tom motoru, ne na hlavní stránce
- Mechanik se dostane na kartu v režimu bez menu, vedení do plné aplikace
- **Arch štítků** pro celou kategorii s filtrem a volbou počtu na řádek
- **Tisk** archu i jednoho štítku z karty motoru; tisková podoba je čistá — bez menu,
  hlavičky a filtrů
- Štítek má na papíře pevných **40 × 45 mm**, samotný kód 26 mm; na A4 se vejde 20 štítků
  ve čtyřech sloupcích a žádný se nerozřízne mezi stránkami
- **Stažení kódu jako PNG** pro externí tisk
- **Základní adresa systému je nastavení**, ne pevná hodnota v aplikaci — až bude známá
  ostrá doména, přepíše se na jednom místě a všechny kódy se vygenerují znovu

**Data:** krátký identifikátor u každého motoru.

**Propojení:** Motory, Servis, Nastavení.

---

## Sklad

**K čemu:** Evidence dílů dostupných pro prodej i pro servis.

**Co umí**

- Díly s **kódem, názvem, množstvím skladem** a fotkou
- **Zařazení k typům motorů** — díl může být univerzální, nebo jen pro vybrané kategorie
- Poznámka s upřesněním (rozměr, výrobce)
- **Prodej množství automaticky odečte**
- Kontrola, že se neprodá víc, než je skladem

**Data:** kód, název, množství, fotka, kategorie motorů, poznámka.

**Propojení:** Prodej, Závody (návštěvy jiných týmů a předávky), Servis.

---

## Ubytování

**K čemu:** Rezervace ubytování k jednotlivým závodům.

**Co umí**

- Ubytování navázané na závod: název, adresa, web, **příjezd a odjezd**, rezervační kód
- **Přílohy** — PDF a obrázky rezervací
- **Výpočet vzdálenosti a trasy na trať** z adresy ubytování
- Stav platby (zaplaceno / částečně / zrušeno)
- Přiřazení konkrétním členům týmu

**Data:** ubytování, termíny, rezervační kód, přílohy, vzdálenost na trať, platba.

**Propojení:** Závody, Mechanici, Kalendář.

---

## Letenky

**K čemu:** Letenky pro členy týmu na konkrétní závod.

**Co umí**

- Trasa, **čísla letů tam i zpět**, časy odletu a příletu
- Kontrola, že zpáteční let nezačíná dřív, než přiletí cesta tam
- Rezervační kód a **přílohy** (PDF, obrázky)
- Navázání na člena týmu a závod
- Stav platby

**Data:** trasa, termíny, čísla letů, rezervace, přílohy, platba.

**Propojení:** Závody, Mechanici, Kalendář.

---

## Pronájem aut

**K čemu:** Půjčovny aut na závody, kde nejede týmová dodávka.

**Co umí**

- Půjčovna, **místo a čas převzetí a vrácení**, kontrola pořadí termínů
- Rezervační kód, přílohy
- Navázání na závod a člena týmu
- Stav platby

**Data:** půjčovna, termíny, místa, rezervace, přílohy, platba.

**Propojení:** Závody, Mechanici, Kalendář.

---

## Prodej

**K čemu:** Prodej dílů, servisu, motorů a karburátorů zákazníkům.

**Co umí**

- **Jedna objednávka, víc položek** — díly ze skladu, položky ze servisního ceníku,
  motory, karburátory i volné položky; součet se počítá sám
- **Měna CZK i EUR**
- **Zákazník** existující, nebo rovnou nový (založí se do adresáře)
- Platba hotově nebo převodem, příznak předání
- **Navázání prodeje na závod** — prodeje na place se pak objeví ve financích závodu
- **Kompletní historie** u prodaného motoru nebo karburátoru: servisní záznamy i použití
  v závodech se předají zákazníkovi
- Storno prodeje

**Data:** položky, ceny, měna, zákazník, platba, navázaný závod.

**Historie:** prodeje zůstávají u zákazníka i u prodané věci.

**Propojení:** Sklad, Ceník servisu, Zákazníci, Motory, Karburátory, Závody.

---

## Dokumenty

**K čemu:** Šablony checklistů dílů a vybavení, které se přiřazují k autům a závodům.

**Co umí**

- Vytvoření **checklistu** s libovolným počtem položek a počtem kusů u každé
- Poznámka u položky
- Přiřazení checklistu **k závodu** a volitelně ke konkrétnímu autu
- Odškrtávání před odjezdem
- Archivace checklistu

**Data:** název checklistu, položky, počty kusů, poznámky, přiřazení.

**Propojení:** Závody, Auta.

---

## Nastavení

**K čemu:** Správcovská část systému — uživatelé, servisní karta, technické údaje a obecné
hodnoty.

**Co umí**

*Přístupy a role*

- Správa uživatelů: jméno, e-mail, **role** (superadmin / vedení / mechanik), jazyk
- Aktivace a deaktivace přístupu
- První přihlášený se stane superadminem, další musí superadmin povolit

*Servisní karta*

- Definice servisní karty **zvlášť pro každou kategorii motoru**
- **Typy servisu** (1.A, 1.B, Přestavba, Kontrola…) s popisem a výchozím zaškrtnutím
  položek; zaškrtnutí se dá převzít z jiného typu
- **Položky karty** s pořadím (přetahováním), servisním intervalem a varovným prahem
- **Katalog materiálu** — kategorie (Písty, Těsnění, Ložiska, Gufera, Svíčky, Ojnice),
  jejich atributy (výběr, číslo, text, jednotka) a hotové varianty, ze kterých mechanik
  vybírá
- **Napojení materiálu na technické údaje** — vybraný rozměr pístu se propíše do karty motoru
- Přepnutí kategorie ze staré servisní karty na novou, včetně přenosu historie a náhledu
  předem
- Nic se nemaže — deaktivovaná položka zmizí z nabídky, ale historie ji zná dál

*Technické údaje*

- Návrh struktury technických údajů po kategoriích: sekce, pole, typy polí, volby u výběrů,
  pořadí, počet sloupců
- Kopie struktury do jiné kategorie
- Varování při změně typu pole, které by zahodilo uložené volby

*Obecné*

- **Základní adresa systému** pro QR kódy

**Přístup:** superadmin. Vedení má přístup omezený, mechanik žádný.

**Propojení:** Motory, Servis, Servisní historie, QR kódy.

---

## RACE MODE

**K čemu:** Plánovaný zjednodušený režim pro práci přímo na závodě.

**Stav: zatím není hotový.** Tlačítko v menu existuje, ale po kliknutí jen oznámí, že režim
přijde po dokončení modulů Motory a Závody. Do prezentace ho doporučuju uvést jako
připravovaný, ne jako hotovou funkci.

---

# Role a oprávnění

Systém zná tři role.

| | Superadmin | Vedení | Mechanik |
|---|---|---|---|
| Přehled, Kalendář, Závody | ✅ vše | ✅ vše | ❌ |
| Finance závodu | ✅ | ✅ | ❌ |
| Zakládání a mazání v číselnících | ✅ | ❌ čte | ❌ |
| Motory — karta, technika, motohodiny | ✅ | ✅ čte | jen servisní karta |
| Servis (fronta) | ✅ | ✅ | ✅ hlavní obrazovka |
| Zápis servisu | ✅ | ✅ | ✅ |
| Servisní historie a report | ✅ | ✅ | ❌ |
| Prodej, Sklad, Zákazníci | ✅ | ❌ čte | ❌ |
| Logistika (ubytování, lety, pronájmy) | ✅ | ❌ čte | ❌ |
| Nastavení | ✅ | částečně | ❌ |
| Oprava dokončeného závodu | ✅ | ❌ | ❌ |

**Mechanik má celou aplikaci jen jako frontu na servis.** Po přihlášení se mu otevře
obrazovka bez bočního menu a do zbytku systému se neproklikne. Omezení nestojí jen na
schování odkazů: systém má seznam toho, co mechanik smí, a **cokoliv mimo něj odmítne**, i
kdyby se na to někdo pokusil dostat přímo. Navíc se z dat, která mechanik dostane, ořezávají
citlivé údaje — u motorů a závodů nevidí ceny, zákazníky ani obchodní informace.

Dokončený závod smí opravovat pouze superadmin; vedení a mechanici do něj už nezasáhnou.

---

# Vícejazyčnost

Celý systém je **dvojjazyčný, česky a anglicky**, s přepínačem CZ/EN v horní liště.

- Jazyk se přepíná okamžitě, bez znovunačtení
- Každý uživatel má **vlastní jazyk uložený u účtu** — jeden člověk může mít systém česky,
  druhý anglicky
- Přeložené jsou i **číselníky a definice**: typy servisu, položky servisní karty, kategorie
  materiálu i technická pole mají český a anglický název, které si superadmin zadává sám
- Přeložené jsou i chybové hlášky a nápovědné texty
- Data pořízená v jednom jazyce zůstávají v historii v tom, ve kterém vznikla

---

# Co systém hlídá a počítá sám

Bez jakéhokoli zásahu člověka:

**Motory**
- Přepočet motohodin a počítadel pístu a ojnice po každém zápisu, opravě i smazání
- MINI motory se po každém odjetém závodě samy přepnou do stavu „přestavba" — a jen jednou
  za závod, takže když mechanik stav ručně vrátí, systém ho znovu nepřebije
- Barva dlaždic na servisní kartě podle najetého intervalu
- Poloha motoru (v dílně / na závodě / zapůjčen) podle plánu závodů a zápůjček
- Blokace motoru, který je zapůjčený, aby ho nešlo přiřadit na závod
- Rozměr pístu se propíše ze servisu do technických údajů
- Krátký identifikátor pro QR štítek při založení motoru

**Servis**
- Fronta se plní sama po skončení závodu a po vrácení zápůjčky
- Zápis servisu motor z fronty odbaví a uvolní označení rozpracovaného
- Stupňování barev u rozpracovaných motorů podle času a přes půlnoc

**Závody**
- Kontrola kolizí motorů a karburátorů mezi souběžnými závody
- Kontrola pořadí termínů (odjezd, začátek, konec, návrat)
- Počasí na trati pro termín závodu
- Vzdálenost a doba jízdy z dílny na trať i z ubytování na trať
- Ukazatel, jestli je závod kompletně obsazený
- Historie závodů, mechaniků, aut a karburátorů vzniká přiřazením

**Obchod**
- Odečet skladu po prodeji a kontrola dostupného množství
- Součty v objednávce a ve financích závodu
- Založení zákazníka z prodeje

**Hlídání a upozornění**
- Motory a auta, které potřebují servis (zvonek s počtem)
- Prošlé zápůjčky se zvýrazní a řadí nahoru
- Úkoly po termínu
- Servisní interval u aut podle nájezdu

**Dohledatelnost**
- U každé změny se zaznamená, kdo ji udělal a kdy
- Historie drží otisk hodnot v době zápisu, takže pozdější přejmenování nebo archivace
  starý záznam nepřepíše
- Nic se nemaže — deaktivuje se, stornuje nebo archivuje

---

# Čísla

| | |
|---|---|
| Sekcí v menu | 25 |
| Databázových tabulek | 63 |
| Databázových indexů | 80 |
| Serverových rozhraní (API) | 51 |
| Souborů s kódem | 122 |
| Řádků kódu (bez stylů) | 29 582 |
| Řádků stylů | 4 163 |
| **Celkem řádků** | **33 745** |
| Kategorií motorů | 6 (MINI, OKJ, OKN, OKN-J, OK, KZ) |
| Rolí | 3 (superadmin, vedení, mechanik) |
| Jazyků | 2 (čeština, angličtina) |

Systém běží na infrastruktuře Cloudflare, data jsou v databázi D1. Přihlašuje se ověřeným
účtem, systém neukládá hesla.

---

# Co ještě není hotové

Poctivě, aby to na prezentaci nezaskočilo:

- **RACE MODE** — tlačítko v menu je, funkce zatím ne
- **Nahrávání dokumentů k motoru** — záložka Dokumenty na kartě motoru je připravená, ale
  soubory se do ní zatím nenahrávají
- **Nová servisní karta zatím jen pro MINI** — ostatní kategorie (OKJ, OKN, OKN-J, OK, KZ)
  jedou po staré kartě. Přepnutí je připravené a čeká jen na nastavení servisních intervalů
  u jednotlivých položek
- **QR štítky se zatím netisknou naostro** — funkce je hotová a vyzkoušená, čeká se na
  ostrou adresu systému, aby kódy nemířily na vývojový počítač
