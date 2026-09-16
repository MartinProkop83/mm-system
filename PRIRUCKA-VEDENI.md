# MM System — příručka pro vedení a superadmina

Tohle je referenční příručka, ne text na přečtení od začátku do konce. Najdi si
v obsahu sekci, kterou potřebuješ, a přečti si jen ji. Kapitoly jdou v pořadí,
v jakém jsou sekce v levém menu appky.

Příručka popisuje, **co vidíš na obrazovce a kam kliknout** — ne, jak je appka
naprogramovaná. Kde se role **vedení** a **superadmin** liší, je to řečeno vždy
přímo v textu dané kapitoly (žádná samostatná příručka pro superadmina neexistuje).

---

## Obsah

- [Rychlé postupy](#rychlé-postupy)
- **Provoz**
  - [Přehled (dashboard)](#přehled-dashboard)
  - [Úkoly](#úkoly)
  - [Kalendář](#kalendář)
- **Závody**
  - [Závody](#závody)
  - [Typy závodů](#typy-závodů)
  - [Tratě](#tratě)
  - [RACE MODE](#race-mode)
- **Tým**
  - [Piloti](#piloti)
  - [Týmy](#týmy)
  - [Zákazníci](#zákazníci)
  - [Mechanici](#mechanici)
  - [Oblečení](#oblečení)
- **Vybavení**
  - [Motory](#motory)
  - [Karburátory](#karburátory)
  - [Auta](#auta)
  - [Servis](#servis)
  - [Servisní historie](#servisní-historie)
  - [QR kódy](#qr-kódy)
  - [Sklad](#sklad)
- **Logistika**
  - [Ubytování](#ubytování)
  - [Letenky](#letenky)
  - [Pronájem aut](#pronájem-aut)
- **Obchod**
  - [Prodej](#prodej)
  - [Zakázky](#zakázky)
  - [Dokumenty](#dokumenty-checklisty)
- **Nastavení**
  - [Přístupy a role](#přístupy-a-role)
  - [Servisní karta](#servisní-karta-nastavení)
  - [Technické údaje](#technické-údaje-nastavení)
  - [Typy dokumentů](#typy-dokumentů-nastavení)
  - [Typy motorů pro servis](#typy-motorů-pro-servis-nastavení)
  - [Ceník prací](#ceník-prací-nastavení)
  - [Obecné](#obecné-nastavení)
- [První nastavení systému](#první-nastavení-systému)
- [Zálohování a obnova](#zálohování-a-obnova)
- [Řešení problémů](#řešení-problémů)
- [Slovníček](#slovníček)

---

## Rychlé postupy

Deset nejčastějších úkolů. Kompletní popis každé sekce najdeš dál v příručce —
tady je jen rychlá cesta, jak na to.

### 1. Založit nový závod

1. Menu **Závody → Závody** → tlačítko **„＋ Nový závod"**.
2. Vyber **Závod** (typ ze seznamu — pokud tam není, nejdřív ho založ v
   **Typy závodů**), vyplň **Zemi**, **Trať** (z databáze, nebo ručně),
   čtyři data (odjezd/začátek/konec/návrat).
3. Zaškrtni **kategorie**, které na závodě startují.
4. Přidej **mechaniky** a **auta**.
5. Ulož. V detailu závodu pak na záložce **Plán závodu** přiřaď piloty,
   motory a karburátory (viz kapitola [Závody](#závody)).

### 2. Přijmout zakázku od zákazníka

1. Menu **Obchod → Zakázky** → tlačítko **„＋ Nová zakázka"**.
2. Vyber nebo založ **zákazníka**, vyber **typ motoru**, zapiš termín
   přijetí a slíbený termín dokončení.
3. Ulož — zakázka se objeví ve stavu „Přijato" a motor uvidí mechanik ve
   frontě na servis, sekce „Zákaznické motory".
4. Podrobnosti — viz kapitola [Zakázky](#zakázky).

### 3. Vytisknout QR štítky na motory

1. Menu **Vybavení → Motory** → nahoře odkaz/tlačítko na **hromadný tisk QR
   štítků** (arch).
2. Vyber kategorii (nebo „Všechny"), zvol hustotu náhledu.
3. Klikni **„Tisk"** — appka vytiskne jen mřížku štítků 40×45 mm, max. 4 na
   řádek na papíře. Podrobně viz kapitola [QR kódy](#qr-kódy).

### 4. Přidat nového uživatele (mechanika, vedení, superadmina)

1. Menu **Nastavení → Přístupy a role** → tlačítko **„＋ Přidat uživatele"**.
2. Vyplň jméno, e-mail (musí odpovídat jeho ChatGPT účtu), roli, jazyk.
3. Ulož. Podrobně viz kapitola [Přístupy a role](#přístupy-a-role).

### 5. Zálohovat databázi

1. Spusť zálohovací příkaz na počítači, ze kterého zálohu spouštíš (viz
   kapitola [Zálohování a obnova](#zálohování-a-obnova) — je to jediný
   ruční krok, appka sama nic nezálohuje).
2. Zkontroluj, že se v cílové složce objevil nový soubor se zálohou.

### 6. Zapůjčit motor

1. Otevři kartu motoru (**Vybavení → Motory** → klikni na motor).
2. Na záložce **Přehled**, panel **Poloha motoru** → tlačítko
   **„Zapůjčit motor"**.
3. Vyber příjemce (zákazník/tým/pilot), datum od a očekávaný návrat.

### 7. Přepnout kategorii motoru na novou servisní kartu

1. Menu **Nastavení → Servisní karta** → vyber kategorii.
2. Nejdřív nadefinuj aspoň jednu **položku karty** (podzáložka „Položky karty")
   a u položek **Píst** a **Ojnice/klika** vyplň **interval**.
3. Klikni **„Přepnout na novou kartu"**, potvrď v dialogu.
4. Podrobně viz kapitola [Servisní karta (Nastavení)](#servisní-karta-nastavení).

### 8. Prodat motor nebo karburátor

1. Menu **Obchod → Prodej** → tlačítko **„＋ Nový prodej"**.
2. Vyber kupujícího (existující zákazník / nový / tým / rychlý prodej).
3. Přidej položku typu **Motor** nebo **Karburátor**, vyber konkrétní kus.
4. Doplň formu platby, zaškrtni Zaplaceno/Předáno, ulož.

### 9. Vytvořit typ servisu a položky servisní karty pro novou kategorii

1. Menu **Nastavení → Servisní karta** → vyber kategorii.
2. Podzáložka **Typy servisu** → **„＋ Přidat typ servisu"**.
3. Podzáložka **Položky karty** → **„＋ Přidat položku"** pro každý díl,
   který se má sledovat.
4. (Volitelně) podzáložka **Materiál** — založ kategorie materiálu, atributy
   a varianty, pokud chceš u položek nabízet konkrétní typ dílu.

### 10. Obnovit smazanou zakázku z koše

1. Menu **Obchod → Zakázky** → záložka/sekce **Koš**.
2. Najdi zakázku, klikni **„Obnovit"**.
3. Pozor: appka po 30 dnech koš sama vyprázdní — pak obnovení není možné.

---

## Přehled (dashboard)

**K čemu je:** úvodní obrazovka po přihlášení — souhrn toho, co je potřeba řešit
dnes, s odkazy do jednotlivých sekcí. Nic se na ní přímo needituje.

**Co je na obrazovce, shora dolů:**

- **Nadcházející závod / „Tento víkend"** — dlaždice nejbližšího závodu (nebo víc,
  je-li jich víc ve stejném termínu): logo/vlajka, odpočet do startu, termín,
  trať, počty pilotů/motorů/karburátorů. Pokud přiřazený motor potřebuje servis,
  appka na to upozorní přímo na dlaždici. Tlačítko **„Otevřít závod"** vede do detailu.
- **Akční centrum** — klikací řádky s počty: kolik motorů/karburátorů/vozidel
  potřebuje servis (vozidla jen pokud nějaké potřebují, červeně po termínu),
  kolik úkolů je po termínu nebo otevřených, název nejbližšího úkolu. Klikni na
  řádek a appka tě odveze přímo do dané sekce.
- **Poslední aktivita** — poslední 3 záznamy z auditního logu celé appky (kdo,
  co udělal, jak dávno).
- **Nadcházející závody** — vodorovná řada až 8 nejbližších závodů v sezóně.
- **Souhrnné dlaždice** — aktivní piloti, vlastní motory, závody v sezóně, motory
  potřebující servis/přestavbu, položky na skladu — každá je odkaz do sekce.
- **Sezóna — přehled závodů** — tabulka až 8 nejbližších závodů s odkazem
  „Celá sezóna".
- **Stav motorů podle kategorie** — pruhový graf (Připraven/Blíží se
  servis/V přestavbě/V uskladnění) pro každou kategorii. Klikni na kategorii —
  dole se přepne tabulka na motory právě téhle kategorie.
- **Motory — vybraná kategorie** — tabulka prvních 3 motorů vybrané kategorie,
  odkaz „Zobrazit všech N" do sekce Motory.
- **Souhrn zakázkového servisu** (jen pokud nějaké zakázky existují) — čtyři
  klikací dlaždice: V řešení / Čeká na díl / Ke kontrole / Čeká na vyzvednutí,
  vedou do sekce Zakázky.

**Na co si dát pozor:** přehled je jen zrcadlo dat z ostatních sekcí — pokud
tam něco nesedí, oprav to v příslušné sekci, ne zde (zde není co upravovat).

**Rozdíl vedení/superadmin:** žádný, obsah přehledu je pro obě role stejný.

---

## Úkoly

**K čemu je:** jednoduchý úkolovník pro provozní věci, volitelně navázaný na
konkrétní závod.

**Filtry nahoře** (s počty): **Aktivní** (vše nehotové), **Na dnešek** (nehotové
s dnešním termínem), **Po termínu** (nehotové s termínem v minulosti), **Hotové**.

**Formulář nového/upraveného úkolu:**

| Pole | Popis |
|---|---|
| Typ | Úkol nebo Připomínka |
| Priorita | Nízká / Normální / Vysoká / Kritická |
| Název | povinné, max. 160 znaků |
| Termín | datum a čas, nepovinné — bez termínu se úkol nikdy neobjeví ve filtru „Po termínu" ani „Na dnešek" |
| Přiřazeno | přihlášený uživatel, kterýkoli mechanik z evidence, nebo „Nepřiřazeno" |
| Závod | nepovinná vazba na konkrétní závod — appka pak u úkolu ukáže jeho název a trať |
| Popis / poznámka | volný text |
| Stav | jen při úpravě: Otevřeno / Probíhá / Hotovo (nový úkol vždy vzniká jako Otevřeno) |

**Akce v seznamu:**
- **Zaškrtávací kolečko** — rovnou přepne úkol na Hotovo (a zpátky na Otevřeno).
- **Začít / Pozastavit** — přepíná Probíhá ↔ Otevřeno.
- **Upravit** — otevře formulář s předvyplněnými hodnotami.
- **Smazat** (jen **superadmin**) — archivuje úkol, appka se zeptá na potvrzení.

**Co appka dopočítá sama:** u dokončeného úkolu appka zapamatuje, kdo a kdy ho
dokončil — pokud úkol znovu otevřeš a zase uzavřeš, tento údaj se nepřepíše,
pokud tam už byl. Úkoly po termínu appka v seznamu barevně zvýrazní sama.

**Rozdíl vedení/superadmin:** vedení může úkoly vytvářet a upravovat, **mazat
je smí jen superadmin**.

---

## Kalendář

**K čemu je:** měsíční přehled všech výjezdů na závody, se štítky jednotlivých
typů závodů.

**Co je na obrazovce:**
- Měsíční mřížka (Po–Ne), šipky pro přepnutí měsíce, tlačítko **„Dnes"**.
- Do dne, ve kterém probíhá závod (rozpětí odjezd–návrat), appka vloží
  barevnou dlaždičku (barva podle **typu závodu**, nastavuje se v sekci Typy
  závodů) s logem/vlajkou, názvem, tratí a počtem přiřazených mechaniků a aut.
  Najetí myší ukáže bublinu se jmény.
- Klikni na dlaždičku — otevře se detail toho závodu.
- Pod mřížkou: **„Přehled výjezdů"** — karta pro každý zobrazený závod se
  sloupci Mechanici, Auta, Ubytování, Letenky, Pronájem auta.

**Filtry:** podle mechanika a podle auta (lze kombinovat) — zúží kalendář i
přehled výjezdů jen na závody, kde je vybraný přiřazen.

**Tisk:** tlačítko **„Tisk kalendáře"** vytiskne jen mřížku (bez ovládacích
prvků), do titulku appka napíše měsíc/rok a aktivní filtry.

**Na co si dát pozor:** kalendář je čistě čtecí obrazovka — úpravy (kdo jede,
kdy) se dělají v detailu závodu nebo v sekci Logistika, ne tady.

**Rozdíl vedení/superadmin:** žádný.

---

## Závody

**K čemu je:** hlavní evidence a plánování všech závodů — kdo jede, na jakém
motoru a karburátoru, kdo z posádky, jak to vypadá finančně.

### Seznam závodů

- Přepínání zobrazení **Karty** / **Tabulka**.
- **Filtry**: podle kategorie, podle tratě.
- Karta/řádek ukazuje: logo/vlajku, sérii a kolo, název, termín, trať, zemi,
  kategorie, počet pilotů, stavový štítek (**Plánováno / Probíhá / Dokončeno**)
  a odznak **„✓ Připraveno"** / **„⚠ Připraveno"** (appka ho počítá sama —
  zelený je, jen když má závod aspoň jednoho pilota, motorů je aspoň tolik co
  pilotů, je přiřazen aspoň jeden mechanik a jedno auto).
- Dokončené závody automaticky mizí do **archivu** pod hlavním seznamem,
  seskupené podle roku, s dlaždicemi četnosti podle typu závodu.

### Založení / úprava závodu

Tlačítko **„＋ Nový závod"** (v archivu i u dokončeného závodu smí upravovat
už jen **superadmin**).

| Pole | Popis |
|---|---|
| Závod | povinný výběr z číselníku **Typy závodů** — appka nedovolí napsat vlastní název, pokud číselník ještě nic neobsahuje |
| Série | nepovinné, návrhy z předdefinovaných sérií vybraného typu, nebo napiš vlastní |
| Round | číslo kola 1–10, nepovinné |
| Země | povinné — ovlivňuje nabídku tratí níže |
| Trať z databáze | výběr z adresáře tratí omezený na vybranou zemi — po výběru appka zamkne a doplní pole Trať/město a adresu |
| Trať / město | povinné, needitovatelné, pokud je vybraná trať z databáze |
| Odjezd, Začátek závodu, Konec závodu, Návrat | čtyři data, musí jít v tomto pořadí. Při zadání začátku appka navrhne odjezd o den dřív (dokud ho neupravíš ručně), při zadání konce navrhne návrat týž den |
| Kategorie na závodě | zaškrtávací pole, aspoň jedna povinná. U existujícího závodu nejde odškrtnout kategorii, která už má přiřazení |
| Mechanici | přidávání ze seznamu + tlačítko „Přidat", odebrání × |
| Auta | totéž |
| Poznámky | volný text |

**Co appka odmítne a proč:**
- kolizi termínu — mechanik nebo auto přiřazené na jiný závod, jehož termín
  (odjezd–návrat) se překrývá,
- odškrtnutí kategorie, ve které jsou už piloti nebo extra vybavení.

### Hlavička detailu závodu

Logo/vlajka, název, série+kolo, vlajka a trať. Tlačítka **„⌁ Vytisknout
plán"**, **„✎ Upravit"** (u dokončeného závodu jen superadmin), **„Smazat
závod"** (jen **superadmin** — data zůstávají v databázi jako archivovaná,
jen zmizí ze všech přehledů).

### Panel „Souhrn připravenosti"

Klikací kontrolní body: mechanici/auta přiřazeni, servis vozidel v pořádku,
počet potvrzených pilotů, přiřazených motorů, přiřazených karburátorů. Klikni
na kterýkoli bod — appka tě odveze na příslušnou záložku.

### Panel „Fakta o závodě" a panel „Trať"

Fakta: termín, mechanici, auta, termín cesty, trať/adresa, orientační
vzdálenost/doba jízdy z dílny, organizátor.

Trať (pokud je propojena z adresáře): obrázek/mapa, adresa, vzdálenost, odkazy
na Google Maps a web tratě, **živé počasí a předpověď** (až ~16 dní dopředu,
klikací dlaždice s hodinovou předpovědí). Pokud trať není propojena, appka to
řekne a nabídne tlačítko „Vybrat trať" (otevře úpravu závodu).

### Záložka „Plán závodu" — piloti, motory, karburátory

Karta pro **každou kategorii** startující na závodě, s tabulkou pilotů:

- **Sloupce**: startovní číslo, Pilot (+ vlajka, tým), sloty Motor 1/2/3 (u
  KZ jen 2 sloty), sloty Karb. 1/2/3 (u KZ žádný — KZ karburátor nemá), Poznámka,
  Stav (potvrzen/nepotvrzen), Akce.
- **Přiřazení motoru/karburátoru**: klikni na buňku, appka nabídne výběr z
  kompatibilních kusů se stavem — **volný** / **přiřazen tomuto pilotovi** /
  **naposledy použit** (historicky, teď volný) / **🔒 obsazen** (u jiného
  pilota nebo termínově kolizní — nejde vybrat). Uvolnění slotu („— Bez
  přiřazení") appka sama posune zbývající sloty, aby nezůstala mezera.
- **Poznámka k pilotovi** — krátký text (max. 140 znaků), uloží se při
  odchodu z pole nebo Enterem.
- **Potvrzení pilota** — tlačítko „✓ Potvrzen" / „Nepotvrzen"; hromadně
  přes „✓ Potvrdit všechny piloty" (na záložce Piloti).
- **Přeuspořádání pilotů** — přetažením řádku za pořadové číslo.
- **Přidání/odebrání pilota** — tužka a × u superadmina/vedení; tlačítko
  **„＋ Přidat pilota"** v hlavičce kategorie.
- **Extra vybavení** — tlačítko **„＋ Přidat extra"**: motor/karburátor vzatý
  s sebou bez konkrétního pilota (např. náhradní kus).

**Co appka odmítne a proč**: dvě stejné položky u jednoho pilota, motor/
karburátor nekompatibilní kategorií, motor/karburátor přiřazený jinam se
stejným termínem, motor právě zapůjčený se stejným termínem, neaktivního
pilota nově přidat (existující přiřazení upravovat lze).

### Záložka „Posádka a doprava"

Přiřazení mechaniků a aut (přidání/odebrání ze seznamu). U auta appka ukáže
odznak „Servis"/„Brzy servis", pokud auto potřebuje servis. Volitelné
**párování „kdo jede v kterém autě"** — pro každého mechanika vyber konkrétní
auto ze seznamu přiřazených.

### Tisk

Tlačítka na jednotlivých záložkách: **„Vytisknout plán"** (plán + fakta,
kategorie na samostatných stranách), **„Vytisknout piloty"** (jen tabulky
pilotů, větší písmo), **„Vytisknout checklist"**, **„Vytisknout finance"**.
Appka dočasně přejmenuje titulek okna podle názvu závodu a data (kvůli
uloženému PDF).

### Záložka „Finance" *(jen superadmin a vedení)*

- Souhrn zvlášť za CZK a EUR: cena před slevou, slevy, piloti po slevě,
  prodej, jiné týmy, předávky, celkem, zaplaceno, **zbývá** (červeně, je-li
  co doplácet), náklady na cestu z Logistiky, **čistý zisk**.
- **Tabulka plateb pilotů** — editovatelné: cena bez DPH, měna, sleva v %,
  appka sama dopočítá konečnou cenu, forma platby, zaškrtávátko Zaplaceno,
  poznámka. Ulož tlačítkem u řádku — bez uložení se změna neprojeví.
- Přehled prodeje/servisu a plateb od jiných týmů navázaných na tento závod.

### Záložka „Historie" *(jen superadmin a vedení)*

Chronologický log změn na tomto závodě — kdo a kdy co udělal, barevně podle
typu akce (zeleně vznik/potvrzení, červeně smazání/zrušení).

### Záložky „Jiné týmy" a „Předávky a platby / Poznatky ze závodu"

Popsáno v kapitolách [Zakázky](#zakázky) a Obchod — jde o zápis návštěv
jiných týmů na place a rychlé předávky/platby zákazníkům přímo u závodu.

**Rozdíl vedení/superadmin v celé sekci Závody:** vedení čte a zapisuje plán,
checklisty, finance, prodej, předávky, jiné týmy; **nemůže mazat (archivovat)
závod**, ani upravovat **dokončený** závod (to smí jen superadmin).

---

## Typy závodů

**K čemu je:** číselník šablon, ze kterých se při zakládání konkrétního
závodu vybírá povinné pole „Závod" — bez šablony nejde založit žádný závod.

**Formulář:**

| Pole | Popis |
|---|---|
| Název přednastaveného závodu | povinný — použije se jako výchozí název všech závodů z této šablony |
| Série | nepovinné, čárkou oddělený seznam možných sérií — při zakládání závodu jde vybrat nebo napsat vlastní |
| Barva v kalendáři | povinná, výběr z přes 48 pojmenovaných barev — slouží k rychlé identifikaci v Kalendáři a přehledech |
| Logo | nepovinné, PNG/JPG/WebP do 5 MB — zobrazí se u všech závodů této šablony všude v appce; lze odstranit tlačítkem „Odstranit" |
| Poznámky | volný text |

**Smazání** (jen **superadmin**) je možné, jen pokud typ ještě nepoužívá
žádný existující závod — jinak appka to odmítne s vysvětlením.

**Rozdíl vedení/superadmin:** vedení může typy vytvářet a upravovat, mazat
smí jen superadmin.

---

## Tratě

**K čemu je:** znovupoužitelný adresář tratí — jednou zadaná trať se dá
přiřadit libovolnému budoucímu závodu ve stejné zemi.

**Seznam:** filtr podle země, tratě seskupené podle země s počty.

**Formulář:**

| Pole | Popis |
|---|---|
| Název | povinné |
| Země | povinné — ovlivňuje, při jakém závodě se trať nabídne k výběru |
| Adresa | volitelná |
| Web | volitelný |
| Google Maps | odkaz sdílený z Google Maps |
| Poloha pro počasí | tlačítko **„Načíst polohu"** — appka ze zadaného odkazu/adresy/názvu dohledá GPS souřadnice automaticky; jde i doplnit ručně v „Ruční upřesnění souřadnic" (Latitude/Longitude) |
| Orientační vzdálenost z dílny (km) a doba jízdy (min) | dopočítá appka automaticky při nalezení polohy, lze přepsat ručně |
| Obrázek / mapa tratě | PNG/JPG/WebP do 10 MB |

**Na co si dát pozor:** jakákoli změna názvu, země, adresy nebo mapového
odkazu appka **zneplatní už nalezenou polohu** — musíš ji dohledat znovu nebo
doplnit ručně, jinak se u závodu nezobrazí počasí.

**Smazání** jen **superadmin** — historická data závodů, které trať použily,
zůstanou zachovaná.

**Rozdíl vedení/superadmin:** vedení vytváří a upravuje, mazat smí jen superadmin.

---

## RACE MODE

**K čemu je:** samostatná celoobrazovková obrazovka pro práci přímo v boxech
na závodě (funguje i na mobilu). Na rozdíl od zbytku appky sem má přístup
i mechanik — proto je i pro vedení/superadmina obsah stejný jako v příručce
pro mechanika, s tím, že vedení a superadmin navíc vidí i blok předávek.

**Jak se tam dostat:** odkaz **⚑ Race Mode** v horní liště appky (i na
obrazovce fronty na servis).

**Výběr závodu:** appka nabídne jen závody, kde dnešní datum padá do rozsahu
odjezd–návrat, nebo které skončily nejvýš před 2 dny. Je-li vyhovující jen
jeden, appka do něj vstoupí sama.

**Potvrzování jel/nejel:** u každého přiřazeného motoru dvě tlačítka
**JEL**/**NEJEL** — zápis se projeví okamžitě. Váže se na dvojici závod+motor,
takže na to navazuje automaticky fronta na servis.

**Motohodiny (Oppama) na místě:** pokud pilot jel a motor patří k rodině, co
motohodiny sleduje (vše kromě MINI a OKJ), appka nabídne pole na zápis ve
formátu **HH:MM**. Appka si zápis uloží s datem **konce závodu**, ne dneškem
(kdyby se potvrzovalo o den později).

**Rychlé předávky zákazníkům** *(jen superadmin a vedení — mechanik tento
blok nevidí)*: formulář „Nová předávka" — komu (jméno/firma), co (ze skladu
s automatickým odečtem, nebo volný text), počet kusů, cena, zaškrtávátko
zaplaceno. Ukládá se do stejných dat jako plná záložka „Předávky a platby"
v detailu závodu — je to jen rychlejší cesta zápisu přímo v boxech.

**Na co si dát pozor:** RACE MODE neobsahuje logistiku, ceny pilotů,
přiřazování motorů/karburátorů (to se dělá jen v Závody → Plán) ani checklisty
— je to čistě potvrzovací nástroj pro den závodu.

---

## Piloti

**K čemu je:** evidence pilotů s vlastní kartou historie startů a financí.

**Seznam:** filtrovací dlaždice s počty (Aktivní, MINI, OKJ, OKN, OK, KZ,
Neaktivní), tabulka (foto, jméno, tým, kategorie, startovní číslo, národnost,
stav).

**Formulář:**

| Pole | Popis |
|---|---|
| Jméno pilota | povinné, max. 120 znaků |
| Tým | výběr z existujících týmů, nebo „Bez týmu" |
| Výchozí kategorie | BABY / MINI / MINI U10 / MINI GR3 / OKJ / OKN-J / OKN / OK / KZ |
| Startovní číslo | text, max. 10 znaků |
| Národnost | výběr země (zobrazí se jako vlajka) |
| Stav | Aktivní / Neaktivní — neaktivní zmizí z výchozích filtrů, historie zůstane |
| Fakturace | **Platí sám** / **Tým** (jen má-li pilot vybraný tým) / **Zákazník** (vyžaduje vybraného zákazníka) — určuje, komu půjde faktura za jeho starty |
| Fotka pilota | nepovinná, PNG/JPG/WebP do 5 MB; lze nahradit nebo odstranit |
| Poznámky | volný text |

**Smazání** (jen **superadmin**) — nikdy fyzicky, jen archivace; historie
startů zůstává dohledatelná.

**Detailní karta pilota** — otevře se kliknutím na řádek nebo tlačítkem
„Karta": statistiky (počet závodů, kategorií, použitých motorů a
karburátorů), **finance** *(jen s právem na finance — vedení/superadmin)* s
filtry podle závodu/měny/stavu platby a řádkem „Fakturuje se" (podle
fakturačního režimu), nejbližší závod, kompletní historie startů. Tlačítka
Tisk a Uložit jako PDF.

**Rozdíl vedení/superadmin:** žádný — obě role vidí a upravují stejně.

---

## Týmy

**K čemu je:** evidence týmů, stejný princip jako Piloti.

**Formulář:**

| Pole | Popis |
|---|---|
| Název týmu | povinné, max. 120 znaků |
| Země | výběr (zobrazí se jako vlajka) |
| Vedeno jako zákazník | nepovinná vazba na existujícího zákazníka — pro centrální fakturaci za všechny piloty týmu |
| Logo týmu | nepovinné, PNG/JPG/WebP do 5 MB |
| Poznámky | volný text |

**Detailní karta týmu:** statistiky (počet závodů, pilotů, motorů,
karburátorů), finance týmu s rozpisem podle jednotlivého pilota, nejbližší
závod a kompletní historie (navíc se sloupcem Pilot).

**Smazání** jen **superadmin** (archivace, historie zůstává).

**Rozdíl vedení/superadmin:** žádný.

---

## Zákazníci

**K čemu je:** evidence lidí a firem, kterým se prodává (Prodej) nebo pro
které se servisují motory (Zakázky).

**Formulář:**

| Pole | Popis |
|---|---|
| Jméno / firma | povinné |
| Telefon | nepovinné |
| E-mail | musí být platný formát; nesmí se duplikovat s existujícím aktivním zákazníkem |
| Adresa | nepovinná |
| IČO, DIČ | nepovinné |
| Kód země | nepovinný |
| Sleva na práci (%) | 0–100, automaticky se ořeže na rozsah — výchozí sleva při zakládání nové zakázky |
| Sleva na materiál (%) | totéž |
| Poznámky | volný text |

Seznam zákazníků ukazuje i souhrn: počet prodejů (nestornovaných) a jejich
celkovou hodnotu.

**Karta zákazníka** — centrální místo, kde se sbíhá vše, co u zákazníka kdy
bylo: kontaktní údaje a slevy, **historie motorů** (všechny motory, které
zde nechal servisovat), **historie zakázek** (přehled napříč stavy —
nová/v práci/čeká na díl/hotovo/vyfakturováno/zrušeno, s odkazem do detailu
každé). Z karty se dá skočit přímo do detailu motoru nebo zakázky a naopak.
Křížové vyhledávání appky umí najít zákazníka i z kontextu zakázky nebo
motoru.

**Smazání** (jen **superadmin**) — archivace, ne fyzické mazání.

**Rozdíl vedení/superadmin:** vedení vytváří a upravuje zákazníky, mazat
smí jen superadmin.

---

## Mechanici

**K čemu je:** evidence mechaniků — základní záznam je jen jméno, ale
detailní karta shromažďuje bohatou historii.

**Formulář:** jediné pole — **Jméno mechanika** (povinné, max. 120 znaků).

**Seznam:** jméno + nejbližší/poslední závod (nebo „Bez plánovaného závodu").

**Detailní karta mechanika:** statistiky (počet závodů, nadcházející závody,
počet zemí, dnů na cestách), nejbližší závod s přiřazeným autem a rozbalenou
cestovní kartou, panel **„Oblečení a velikosti"** (jen zobrazení — editace v
sekci Oblečení), kompletní historie závodů s rozbaleným detailem cesty
(ubytování, letenky, pronájem auta) ke každému. Tisk a PDF.

**Smazání** jen **superadmin** (archivace, historie zůstává).

**Rozdíl vedení/superadmin:** žádný.

---

## Oblečení

**K čemu je:** evidence týmového vybavení mechaniků — velikosti, počty kusů,
fotky. Dvě záložky.

### Přiřazení mechanikům

1. Vyber mechanika z rozbalovacího seznamu.
2. Appka zobrazí kartu ke každé položce z katalogu (i těm, které mu ještě
   nejsou přiřazeny): fotka, název, poznámka, a pokud je přiřazená, datum
   předání a štítek „✓ Přiřazeno".
3. Vyplň **Velikost** (jen z velikostí povolených u dané položky), **Počet**
   (1–20 ks), volitelnou **Poznámku** (max. 500 znaků, např. „náhradní kus").
4. Klikni **„Přiřadit"** / **„Uložit změny"**, nebo **„Odebrat"**.

**Přehled celého týmu** — dlaždice pro každého mechanika s počtem přiřazených
kusů; po rozkliknutí seznam konkrétních kusů.

### Nastavení oblečení (katalog)

**Formulář položky:**

| Pole | Popis |
|---|---|
| Název položky | povinné, max. 100 znaků, musí být unikátní |
| Výchozí počet kusů | 1–20 |
| Dostupné velikosti | text oddělený čárkami, pořadí se zachovává v nabídce |
| Fotografie | nepovinná, PNG/JPG/WebP do **10 MB** |
| Poznámka | max. 600 znaků |

**Co appka odmítne:** smazání typu, který je aktuálně někomu přiřazený
(„je přiřazená mechanikovi, nejdřív ji z jeho karty odeber"); odebrání
velikosti, která je právě u někoho použitá.

**Tlačítko „Přidat doporučenou sadu"** jednorázově založí šest standardních
položek (kombinéza, boty, rukavice, funkční prádlo, pláštěnka, tričko)
s běžnými velikostmi, pokud v katalogu ještě nejsou.

**Rozdíl vedení/superadmin:** přiřazovat/odebírat i upravovat katalog smí
obě role stejně; **smazání typu z katalogu jen superadmin**.

---

## Motory

**K čemu je:** karta motoru je centrální místo pro vše, co se motoru týká —
technické údaje, servis, historie, dokumenty, QR kód.

**Seznam motorů:** appka zobrazuje kód, stavový štítek (barevně), rodinu,
umístění. Klikni na motor — otevře se karta se záložkami.

### Záhlaví karty

Barevný štítek (čtvereček), kód motoru, stavový štítek (**Připraveno / Brzy
servis / Servis / Přestavba / Sklad / Vyřazen**), řádek s rodinou/variantou/
zapalováním. Tlačítko **„✎ Upravit motor"**.

**Formulář Upravit/Nový motor:**

| Pole | Popis |
|---|---|
| Kód | povinné, 2–24 znaků (písmena, číslice, mezery, závorky, tečka, lomítko, podtržítko, +, -). Musí být unikátní v rámci kategorie |
| Rodina motoru | MINI / OKJ / OKN / OKN-J / OK / KZ — po založení může měnit jen **superadmin** |
| Zapalování | prázdné / PVL / Selettra — po založení jen superadmin |
| Generace KZ | R2 / R3, povinné jen u KZ — po založení jen superadmin |
| Konfigurace | MINI/MINI 3/MINI 4/BABY/BABY 3/BABY 4, jen u MINI |
| Úprava motoru | max. 40 znaků, volný text (např. „A12/LA4") |
| Datum nákupu | datum |
| Stav | Připraveno / Brzy servis / Servis / Přestavba / Sklad / Vyřazen (nový motor vzniká vždy jako Připraveno) |
| Barevné označení | paleta / vlastní barva / bez barvy |
| Poznámky | volný text |

**Smazání motoru** (jen **superadmin**, tlačítko dostupné jen při úpravě) —
ve skutečnosti archivace, historie zůstane navždy dohledatelná.

### Záložka Přehled

- **Informace o motoru**, **Aktuální provoz** (u rodin s motohodinami velké
  počítadlo s ukazatelem; u ostatních poznámka o kalendářním servisu).
- **Rychlé akce**: „Upravit technické údaje", „Přidat servisní záznam",
  „Zapsat motohodiny" (jen u rodin, co je sledují).
- **Poloha motoru**: Na závodě / Zápůjčka / V dílně.
  - **Zapůjčit motor**: tlačítko na panelu → vyber příjemce (zákazník/tým/
    pilot), datum od, očekávaný návrat, poznámka. Appka odmítne, je-li motor
    v tu dobu už na závodě nebo v jiné zápůjčce.
  - **Prodloužit** zápůjčku: jen nové očekávané datum vrácení.
  - **Označit vrácení**: datum vrácení (výchozí dnešek) — appka poté vrátí
    polohu na „V dílně".
- **Poznámky** a náhled technických údajů (jen pole se zaškrtnutým
  „Zobrazit i na Přehledu").

### Záložka Technické údaje

Appka zobrazí buď **vlastní strukturu** rodiny motoru (sekce a pole
definované v Nastavení → Technické údaje), nebo starou pevnou sadu deseti
polí. Tlačítko **„✎ Upravit technické údaje"** otevře formulář podle toho,
jaká pole rodina má.

### Záložka Servisní karta

U kategorií na **nové servisní kartě**: dlaždice položek s barevným stavem
(v pořádku/blíží se limitu/po limitu/bez měření).

**Zápis nového servisu:**
1. Vyber **typ servisu** — appka sama předvyplní výchozí položky.
2. Zkontroluj **datum** (a volitelně čas).
3. Zkontroluj/vyber **mechanika**.
4. **Stav motohodin** je needitovatelný, appka ho vezme sama ze systému.
5. Zaškrtni provedené **položky**; u položky s materiálem vyber konkrétní
   **variantu**.
6. Pokud se vybraný materiál liší od technických údajů motoru, appka nabídne
   panel „Technické údaje se liší" — zaškrtnuto (výchozí) = appka je po
   uložení sama aktualizuje; odškrtnuto = zůstanou, appka jen poznamená rozpor.
7. Doplň **Poznámku**, ulož.

**Oprava** je možná do **24 hodin** od zápisu, jen autorem záznamu nebo
superadminem. Po lhůtě (nebo pro superadmina kdykoli) jen **storno** s
povinným důvodem — záznam se nikdy nemaže, jen zůstane přeškrtnutý v historii.

U kategorií na **staré kartě**: pevný checklist dílů, formulář s typem
servisu (Kontrola/Servis pístu/Top end/Kompletní servis), vyměněnými díly,
novým rozměrem pístu (u rodin, kde se vybírá). Oprava a smazání jen
**superadmin**.

### Záložka Motohodiny

*(jen u rodin OKN, OKN-J, OK, KZ — MINI a OKJ ji nemají)*

- **Vstupní stav motoru** (tlačítko „⌁ Vstupní stav", **jen superadmin**) —
  Celkem na motoru, Píst od výměny, Ojnice/klika od výměny, Poslední Oppama
  (vše HH:MM), u OKN/OKN-J/OK i aktuální rozměr pístu. Používá se k zavedení
  existujícího motoru do systému.
- **Zápis motohodin**: datum, Oppama HH:MM, volitelně závod/akce a pilot,
  poznámka. Appka ukáže náhled „Píst nyní → + Oppama → Ojnice nyní".
- **Oprava a smazání** záznamu — jen **superadmin**; appka po každé úpravě
  přepočítá celou historii počítadel od vstupního stavu, takže se nikdy
  nerozejdou.

### Záložka Historie

Jedna souvislá časová osa napříč vším: servis, závody, zápůjčky, zařazení do
fronty, změny technických údajů (s odlišením ruční úprava/propsáno ze
servisu), motohodiny, systémové události (skryté, dokud nezapneš přepínač
„Zobrazit i systémové události"). Filtrovací tlačítka nahoře podle typu.

### Záložka Dokumenty

Nahrávání souborů (faktury, homologace, fotky) — PDF/PNG/JPG/WebP do 15 MB,
max. 50 dokumentů na motor. Při nahrání vybíráš **Typ dokumentu** (z
číselníku Nastavení → Typy dokumentů) a volitelnou **poznámku**. Stažení
kdokoli s přístupem na kartu, **mazání jen s právem správy**.

### Záložka QR kód

Zobrazí QR kód, textovou adresu a čitelný krátký identifikátor. Tlačítka
**„⇩ Stáhnout PNG"** a **„⎙ Vytisknout štítek"** (jeden štítek 40×45 mm).
Podrobný postup hromadného tisku — viz kapitola [QR kódy](#qr-kódy).

**Rozdíl vedení/superadmin:** vedení může upravovat základní i technické
údaje, zapisovat servis a motohodiny, zapůjčovat motor, nahrávat/mazat
dokumenty. **Jen superadmin** smí: měnit trvalé údaje motoru (rodina,
zapalování, generace KZ), smazat motor, nastavit vstupní stav motohodin,
opravit/smazat záznam motohodin nebo servisu.

---

## Karburátory

**K čemu je:** dvouúrovňová evidence — **katalog typů** (šablony) a
**konkrétní kusy**.

### Katalog typů karburátorů

**Formulář typu:**

| Pole | Popis |
|---|---|
| Značka | povinné, max. 80 znaků |
| Typ/model | povinné, max. 80 znaků — kombinace značka+model musí být unikátní |
| Pro kategorie | zaškrtávací výběr, aspoň jedna povinná |
| Fotka karburátoru | nepovinná, do 5 MB |
| Poznámky | volný text |

Karta typu v katalogu ukazuje i **počet kusů** daného typu v evidenci.
**Smazání typu** (jen superadmin) je zakázané, dokud ho používá existující
karburátor.

### Konkrétní kus

**Formulář:**

| Pole | Popis |
|---|---|
| Kód karburátoru | povinný, velká písmena/číslice/pomlčka, 2–20 znaků, unikátní |
| Předdefinovaný typ | povinný výběr z katalogu — značka/model se přeberou automaticky |
| Kategorie | jen z těch, které typ povoluje |
| Stav | Připraveno / Servis / Sklad / Vyřazen |
| Poznámky | volný text |

Prodané kusy (s datem prodeje v minulosti) automaticky mizí ze všech
výpisů a filtrů.

**Detail karburátoru** — tři záložky: **Přehled** (fakta, aktuální
přiřazení, poslední servis), **Historie závodů**, **Servisní historie**
(datum, typ servisu, mechanik, provedené práce, vyměněné díly, poznámka —
klikni na řádek pro úpravu).

**Přidat servis:** datum (povinné), typ servisu (Kontrola/Běžný
servis/Kompletní servis/Oprava), mechanik, provedené práce, vyměněné díly,
poznámka.

**Rozdíl vedení/superadmin:** vedení zapisuje servis i vytváří/upravuje
karburátory a typy; **smazání typu jen superadmin**.

---

## Auta

**K čemu je:** evidence vozového parku dílny s automatickým sledováním
servisního intervalu.

**Formulář:**

| Pole | Popis |
|---|---|
| Název auta | povinný, max. 120 znaků |
| SPZ | max. 20 znaků, ukládá se velkými písmeny |
| Aktuální stav (km) | celé kladné číslo, nepovinné |
| Servisní interval (km) | celé kladné číslo, nepovinné |
| Fotka auta | nepovinná, do 5 MB |
| Poznámky | volný text |

**Co appka počítá sama:** stav servisu (Bez sledování / **Servis potřeba**
červeně / **Brzy servis** žlutě, do 1000 km / **Připraveno** zeleně) —
z aktuálního nájezdu, intervalu a km při posledním servisu.

**Detail auta:** fakta, historie závodů, servisní historie s formulářem
**„Přidat/upravit servis"**: datum (povinné), nájezd při servisu, mechanik,
co bylo provedeno. Po uložení appka **sama přepočítá** souhrnná pole auta
(aktuální km, poslední servis) z nejnovějšího záznamu.

**Smazání servisního záznamu** jen **superadmin**.

**Rozdíl vedení/superadmin:** vedení zapisuje servis a upravuje auta;
mazání servisního záznamu jen superadmin.

---

## Servis

**K čemu je:** fronta motorů čekajících na servis — nikam se trvale
neukládá, počítá se pokaždé znovu.

**Jak se motor do fronty dostane:** sám, den po skončení závodu (pokud na
něm nebyl vyznačen jako „nejel"), po vrácení ze zápůjčky, nebo ho tam
kdokoli přihlášený **přidá ručně** tlačítkem „Přidat motor do fronty" s
povinnou poznámkou proč.

**Vzhled desky:** digitální hodiny, filtrovací dlaždice podle kategorie,
volba hustoty (1–6 na řádek). Motory na dlaždicích jsou řazené: nejdřív
zabrané (nejdéle zabraný nahoře), pak s nejbližším závodem, pak podle data
návratu.

**Akce:**
- **„Beru si ho"** — kdokoli přihlášený; na sdíleném účtu appka nechá
  vybrat konkrétního mechanika.
- **„Vrátit do fronty"** — jen ten, kdo motor zabral, nebo vedení/superadmin.
- **„Nejel / bez servisu"** — jednotlivě nebo hromadně (zaškrtnutím +
  tlačítko nahoře) — appka se zeptá na potvrzení, motor zmizí z fronty **bez
  servisního záznamu**, appka si zapamatuje kdo a kdy.
- **„Přidat motor do fronty"** — výběr motoru + povinná poznámka.

Pod hlavní deskou je sekce **„Zákaznické motory"** — servisní zakázky ve
frontě, popsané v kapitole [Zakázky](#zakázky).

**Rozdíl vedení/superadmin:** žádný v samotné frontě — obě role mají stejné
možnosti jako mechanik, jen navíc vidí i vše ostatní v appce.

---

## Servisní historie

**K čemu je:** report toho, co se v dílně za dané období udělalo (na rozdíl
od historie jednoho konkrétního motoru).

**Filtry:** období (Dnes / Tento týden / Tento měsíc / Vlastní rozsah),
kategorie, motor, mechanik.

**Report** (dopočítává se za běhu, ne jako zamrzlý snímek): Čekalo na
servis, Odbaveno servisem, Nejel/bez servisu, Zbývá ve frontě, a nezávisle
**Zapsaných servisů** (může se od ostatních lišit — počítá se jinak).
Tabulky **„Podle kategorie"** a **„Kdo kolik udělal"**.

**Tabulka záznamů**: datum a čas, kategorie, motor, typ servisu, mechanik,
co se dělalo, poznámka (u stornovaného záznamu důvod storna).

**Na co si dát pozor:** appka export ani tisk zde nenabízí — je to čistě
k prohlížení na obrazovce.

**Rozdíl vedení/superadmin:** žádný.

---

## QR kódy

**K čemu je:** trvalé krátké kódy na motorech pro rychlé otevření karty
mobilem.

### Hromadný tisk (arch štítků)

1. Otevři stránku hromadného tisku QR štítků (přes sekci Motory).
2. Vyber **kategorii** (nebo „Všechny").
3. Zvol **„Štítků na řádek"** pro náhled na obrazovce (2–6).
4. Klikni **„Tisk"** — appka vytiskne jen mřížku štítků, fyzický rozměr
   pevně 40×45 mm, na A4 se vejde 20, na tisk max. **4 na řádek** (i když je
   na obrazovce zvolena vyšší hustota).

Motor bez veřejného kódu se do archu nezahrne.

### Jednotlivý štítek (na kartě motoru)

Záložka QR kód na kartě → **„⇩ Stáhnout PNG"** nebo **„⎙ Vytisknout
štítek"**.

**Co se stane po naskenování:** appka pošle nepřihlášeného na přihlášení a
vrátí ho přesně na naskenovaný motor; neexistující/prodaný/vyřazený motor
appka nahlásí zprávou „Tenhle motor tu není"; mechanika appka pošle rovnou do
fronty s otevřenou kartou motoru, vedení/superadmina do plné aplikace na
servisní kartě.

**Rozdíl vedení/superadmin:** žádný.

---

## Sklad

**K čemu je:** evidence náhradních dílů s automatickým odečítáním při
prodeji nebo použití v zakázce.

**Formulář dílu:**

| Pole | Popis |
|---|---|
| Kód dílu | povinný, unikátní |
| Název dílu | povinný |
| Pro jaké typy motorů | zaškrtávací výběr (Všechny / MINI / OKJ / OKN / OK / KZ), aspoň jedno |
| Množství skladem | číslo |
| Jednotka | výchozí „ks" |
| Cena bez DPH v CZK | |
| Cena bez DPH v EUR | |
| Fotografie dílu | nepovinná, do 10 MB |
| Popis / poznámka | volný text |

**Co appka počítá sama:** množství se automaticky odečte, když se díl
vybere v Prodeji nebo v Zakázce, a automaticky vrátí při stornu/úpravě.
Appka nedovolí použít víc kusů, než je skladem.

**Smazání** (jen **superadmin**) — archivace, historie prodejů zůstává.

### Servisní ceník (na stejné obrazovce)

Starší číselník prací pro **Prodej** (ne pro Zakázky, ty mají vlastní Ceník
prací v Nastavení): název/kód, popis CZ/EN, cena v CZK a EUR. **Smazání jen
superadmin.**

**Rozdíl vedení/superadmin:** vedení přidává/upravuje díly a ceník, mazání
jen superadmin.

---

## Ubytování

**K čemu je:** evidence ubytování k závodům. Založit lze buď zde, nebo přímo
v detailu závodu (panel „Cesta a ubytování").

**Formulář:**

| Pole | Popis |
|---|---|
| Závod | povinná vazba — v detailu závodu je předvyplněná a zamčená |
| Název ubytování | povinný |
| Místo / adresa | povinné |
| Web ubytování, Odkaz na Booking | musí být platná webová adresa |
| Check-in, Check-out | check-out musí být později |
| Počet pokojů, Počet osob | |
| Číslo rezervace | |
| Platba | Nezaplaceno / Částečně / Zaplaceno |
| Cena celkem, Měna | CZK nebo EUR |
| Stav | Plánováno / Rezervováno / Zrušeno |
| Poznámky / výjimky | volný text |

**Vzdálenost od tratě** — tlačítko **„Spočítat podle adresy"** appka
dohledá automaticky (nebo zadej ručně), v detailu je i odkaz „Trasa na trať"
do Google Map.

**Přílohy** — PDF/PNG/JPG/WebP, max. 15 MB na soubor, max. 20 na záznam,
lze mazat jednotlivě.

**Rozdíl vedení/superadmin:** vedení zapisuje a upravuje; **smazání celého
záznamu (i s přílohami) jen superadmin**.

---

## Letenky

**Formulář:**

| Pole | Popis |
|---|---|
| Typ cesty | Tam / Zpět / Tam i zpět / Jiný — u „Tam i zpět" appka rozdělí formulář na cestu tam a cestu zpět |
| Odletové/příletové letiště | povinné |
| Odlet, Přílet | přílet musí být po odletu |
| Aerolinka, Číslo letu | |
| Rezervační kód | |
| (u zpáteční cesty totéž znovu pro cestu zpět) | appka hlídá, že zpáteční let nezačíná dřív, než skončí let tam |
| Kdo letí | zaškrtávací výběr mechaniků/týmu, nebo volná poznámka |
| Zavazadla | volný text |
| Cena, Měna, Stav, Poznámky | |

**Přílohy** se u zpáteční cesty rozdělují na „cesta tam"/„cesta zpět".

**Rozdíl vedení/superadmin:** stejné jako Ubytování — smazání záznamu jen
superadmin.

---

## Pronájem aut

**Formulář:**

| Pole | Popis |
|---|---|
| Společnost / půjčovna | povinné |
| Typ auta | volný text |
| Místo převzetí, Místo vrácení | povinné |
| Převzetí, Vrácení | vrácení musí být později |
| Rezervační kód | ukládá se velkými písmeny |
| SPZ | velkými písmeny |
| Hlavní řidič | |
| Cena, Měna, Stav, Poznámky | |

**Rozdíl vedení/superadmin:** stejné jako u předchozích dvou — smazání jen
superadmin.

---

## Prodej

**K čemu je:** prodej motorů, karburátorů, dílů ze skladu a servisních
prací zákazníkům, s automatickým číslem a evidencí skladu.

**Tři záložky:** Aktivní prodeje, Prodané motory, Prodané karburátory.

**Nový prodej — krok za krokem:**
1. Tlačítko **„＋ Nový prodej"**.
2. Vyber **kupujícího**: existující zákazník / nový zákazník (rovnou se
   založí) / tým / **rychlý prodej** (bez evidence osoby — pro drobný
   prodej za hotové).
3. Vyplň hlavičku: datum, volitelné číslo faktury/dokladu, měnu, formu
   platby, zaškrtávátka Zaplaceno/Předáno, volitelnou vazbu na závod,
   poznámku.
4. Přidej **položky**:
   - **Motor/Karburátor** — konkrétní kus z evidence (appka odmítne kus, co
     je už prodaný nebo přiřazený na budoucí/aktivní závod, a řekne proč),
   - **Díl ze skladu** — s kontrolou dostupného množství,
   - **Servis/práce** — z ceníku, cena se doplní automaticky,
   - **Ostatní/díly** — volná položka bez vazby na číselník.
5. Ulož. Appka přidělí číslo `PRO-RRRR-NNNN`, odečte prodané kusy/díly
   z evidence a skladu.

**Úprava prodeje** — appka nejdřív vrátí staré položky (motor/karburátor
zpátky k prodeji, díl zpátky na sklad) a pak uloží nové.

**Storno** (jen **superadmin**) — appka prodej neodstraní, jen označí jako
zrušený a **automaticky vrátí do evidence** vše, co bylo prodejem vázáno.

**„Zobrazit použití a servis"** u prodaného motoru/karburátoru — appka
ukáže kompletní historii i po prodeji (historie se prodejem neztrácí).

**Rozdíl vedení/superadmin:** vedení vytváří a upravuje prodej, **stornovat
smí jen superadmin**.

---

## Zakázky

**K čemu je:** zakázkový servis pro zákaznické motory — na rozdíl od
vlastních motorů týmu jde o placenou zakázku s cenou, slevou a fakturací.

### Nová zakázka — krok za krokem

1. Tlačítko **„＋ Nová zakázka"**.
2. Vyber/založ **zákazníka** (viz kapitola [Zákazníci](#zákazníci)).
3. Vyber **typ motoru** z číselníku Nastavení → Typy motorů pro servis.
4. Zapiš termín přijetí a **slíbený termín dokončení**.
5. Sleva se přebere z karty zákazníka, ale jde upravit pro tuto konkrétní
   zakázku.
6. Ulož — zakázka je ve stavu „nová"/„přijato", motor se objeví mechanikovi
   ve frontě na servis, sekce „Zákaznické motory".

### Práce se zakázkou

- **Rozsah práce**: přidávej provedené práce z **Ceníku prací** (Nastavení),
  a použitý materiál ze **Skladu** nebo jako „zákazníkův vlastní díl" bez
  ceny.
- **Čekané díly**: přidej díl, označ objednaný/dorazilý — po dorazilém dílu
  appka **sama** vrátí zakázku ze stavu „čeká na díl" do „v práci".
- **Fotky**: lze přiložit (např. stav motoru při přijetí).
- **Cena a sleva** se vždy dopočítávají ze zadaného ceníku a množství — nikdy
  je nezadáváš ručně přímo jako číslo.

### Stavy zakázky

nová → přijato → v práci → čeká na díl ↔ v práci → hotovo → vyfakturováno
(nebo zrušeno / v koši kdykoliv).

### Koš

- Zakázku lze přesunout do **koše** (ne smazat rovnou) tlačítkem, které
  appka nabídne u zakázky.
- Z koše ji **superadmin** může tlačítkem **„Obnovit"** vrátit zpátky.
- Appka koš **automaticky vyprázdní po 30 dnech** — obnovení pak už
  nejde. Superadmin může koš i vyprázdnit ručně dřív.

### Vyfakturovaná zakázka

Appka ji **uzamkne** proti dalším změnám. Odemknout smí jen **superadmin**
tlačítkem u zakázky.

### Tisk

Zakázkový list (rozsah práce, díly, cena) se tiskne stejným principem jako
ostatní tiskové výstupy v appce — tlačítko na detailu zakázky.

**Rozdíl vedení/superadmin:** vedení zakázky vytváří a upravuje; **jen
superadmin** smí přesunout zakázku do koše, obnovit ji, vyprázdnit koš
ručně a odemknout vyfakturovanou zakázku.

---

## Dokumenty (checklisty)

**K čemu je:** knihovna **šablon** kontrolních seznamů pro balení a
vybavení na závod — ne dokumenty motoru (ty jsou na kartě motoru, záložka
Dokumenty) ani zakázky.

**Formulář položky šablony**: sekce, číslo dílu, název, množství.

**Použití:** šablona se volitelně připojí ke konkrétnímu závodu (záložka
Checklist v detailu závodu) — z ní vznikne samostatná odškrtávací instance,
aniž by se upravila původní šablona.

**Smazání** (jen **superadmin**) — archivace.

**Rozdíl vedení/superadmin:** vedení vytváří a upravuje šablony, mazání jen
superadmin.

---

## Přístupy a role

**K čemu je:** kdo se do appky dostane a s jakým oprávněním. **Vidí a
upravuje jen superadmin** — vedení tuto záložku vůbec nevidí.

**Přihlašování**: appka běží přes ověřený ChatGPT/OpenAI účet — nikdy
neukládá heslo, superadmin ho nemůže zobrazit ani změnit. Přístup má jen
aktivní účet uvedený v seznamu níže.

**Přidat uživatele — krok za krokem:**
1. Tlačítko **„＋ Přidat uživatele"**.
2. Vyplň jméno a příjmení, **e-mail** (musí odpovídat jeho přihlašovacímu
   ChatGPT účtu — appka odmítne duplicitu), **roli** (superadmin/vedení/
   mechanik), **jazyk rozhraní** (Čeština/English), přepínač **„Účet je
   aktivní"**.
3. Ulož.

**Upravit uživatele** — tlačítko „Upravit" u řádku, stejný formulář.

**Deaktivace** — přepnutím „Účet je aktivní" na vypnuto; uživatele **nejde
smazat trvale**, jen deaktivovat — historie jeho práce zůstává.

**Dvě pojistky proti uzamčení systému:**
- U **vlastního účtu** nejde v editaci změnit vlastní roli ani zrušit
  vlastní přístup (pole jsou needitovatelná, appka to i napíše).
- Appka **nedovolí**, aby po úpravě (změna role nebo deaktivace kohokoli)
  nezůstal v systému ani jeden aktivní superadmin.

**Přehledové dlaždice:** počet aktivních uživatelů, počet superadminů.

**Rozdíl vedení/superadmin:** tato záložka je **jen pro superadmina** —
vedení k ní nemá přístup vůbec.

---

## Servisní karta (Nastavení)

**K čemu je:** pro každou kategorii motoru (MINI, OKJ, OKN, OKN-J, OK, KZ)
definuje, jak vypadá jeho servisní karta. **Vidí a upravuje jen
superadmin.**

Nahoře vyber kategorii, pak jednu ze tří podzáložek.

### Podzáložka Typy servisu

1. **„＋ Přidat typ servisu"**.
2. Vyplň kód, název (CZ povinný, EN volitelné), popis, přepínač Aktivní.
3. Zaškrtávacím seznamem vyber **výchozí položky karty** — automaticky se
   předvyplní při zápisu servisu tohoto typu.
4. Tlačítko **„Převzít z…"** — jednorázově zkopíruje zaškrtnutí z jiného
   typu (bez trvalé vazby — pozdější změna zdroje se nepromítne).
5. Pořadí lze měnit přetažením řádku.

**Smazání** typu (archivace) — historie zůstává, jen zmizí z nabídky u
nového zápisu.

### Podzáložka Položky karty

1. **„＋ Přidat položku"**.
2. Vyplň název CZ/EN, volitelnou **kategorii materiálu** (prázdné = jen
   zaškrtávátko bez výběru varianty), **interval** a **varovný práh** v %
   (jen u kategorií, které sledují počítadlo — interval se zadává jako
   HH:MM), přepínač Aktivní.
3. Pořadí přetažením.

### Podzáložka Materiál

1. Vlevo **kategorie materiálu** (např. Písty, Těsnění) — přidej tlačítkem
   „＋ Přidat kategorii" (název CZ/EN).
2. U vybrané kategorie vpravo nahoře **atributy** (např. Značka, Rozměr) —
   typ Výběr/Číslo/Text, u Výběru zadáváš hodnoty jako štítky (napiš text,
   potvrď Enterem, smaž křížkem).
3. Atribut typu Výběr lze **propojit s polem v technických údajích motoru**
   — appka pak umí upozornit na rozpor mezi zapsanými údaji a použitým
   materiálem.
4. Vpravo dole **varianty** — konkrétní věc, kterou si mechanik vybírá
   (atributy samotné mechanik nikdy nevyplňuje ručně).

**Pozor:** přepnutí typu atributu z „Výběr" na „Číslo"/„Text", když má
vyplněné hodnoty, appka nedovolí bez potvrzení — ukáže, co se ztratí.

### Přepnutí kategorie na novou servisní kartu

1. Appka ukáže panel „⚠ Tato kategorie zatím jede po staré servisní kartě",
   dokud kategorie nemá aspoň jednu položku karty a interval u položek
   **Píst** a **Ojnice/klika**.
2. Tlačítko **„Přepnout na novou kartu"** appka odemkne, až tyhle podmínky
   splníš — jinak vypíše, co konkrétně chybí.
3. Po kliknutí appka vysvětlí ve dvou sloupcích, co zanikne (automatické
   nulování starých počítadel) a co to nahradí (stav dlaždic z intervalů),
   a založí výchozí záznam pro každý motor kategorie z dnešních motohodin.

### Přenos staré historie servisu

Samostatný panel — appka nejdřív ukáže **náhled** (kolik záznamů/položek
čeká, kolik nemá odpovídající položku karty), pak tlačítko **„Přenést
historii"** spustí ostrý přenos. Přenos lze i **„Vrátit"** (smaže se jen
to, co přenos sám vytvořil).

**Rozdíl vedení/superadmin:** celá tato záložka je **jen pro superadmina**.

---

## Technické údaje (Nastavení)

**K čemu je:** pro každou rodinu motoru definuje strukturu technické karty
(sekce → pole → možnosti výběru). **Jen superadmin.**

1. Vyber rodinu motoru.
2. Nastav **počet sloupců mřížky** (1–6).
3. **Sekce**: název CZ/EN, pořadí přetažením, archivace (hodnoty u motorů
   zůstanou uložené, vrátí se při obnovení).
4. **Pole** v sekci: název CZ/EN, typ **Text** nebo **Výběr**, přepínač
   „Zobrazit i na Přehledu" (zobrazí pole i na záložce Přehled karty
   motoru).
5. **Možnosti výběru** u polí typu Výběr: hodnota CZ/EN, pořadí, archivace.

**Rodina bez vlastní struktury** dostane návrh **„Návrh převodu dnešních
technických údajů"** podle starých 3 sekcí a 10 polí — appka nabídne
odškrtnout, co se nemá převádět, tlačítko **„Převést a uložit"** (i s
přenosem existujících hodnot) nebo **„Začít s prázdnou strukturou"**.

**Kopírování struktury** — tlačítko **„Zkopírovat strukturu do…"**,
jednorázová kopie do zvolených rodin (rodiny, které už vlastní strukturu
mají, se automaticky přeskočí).

**Rozdíl vedení/superadmin:** čtení (i pro zápis servisu) smí i mechanik;
zápis/úprava **jen superadmin** — vedení tuto záložku vůbec neuvidí.

---

## Typy dokumentů (Nastavení)

**K čemu je:** číselník typů dokumentů přikládaných ke kartě motoru.

**Formulář:** název CZ (povinný), název EN (prázdné = použije se český),
zaškrtávátko **„Předává se kupci"** (zatím jen informativní, sám prodej
motor kupci automaticky nepředá).

Pořadí přetažením. **Smazání** = archivace (existující dokumenty zůstávají).

**Rozdíl vedení/superadmin:** jen **superadmin** — vedení vidí tabulku jen
ke čtení s poznámkou.

---

## Typy motorů pro servis (Nastavení)

**K čemu je:** číselník typů motorů pro **zakázkový servis** (nezávislý na
kategoriích vlastních motorů — patří sem třeba i motokros).

**Formulář:** kód (unikátní), název CZ/EN, pořadí, archivace místo mazání.

**Rozdíl vedení/superadmin:** jen **superadmin**.

---

## Ceník prací (Nastavení)

**K čemu je:** ceník položek pro **zakázkový servis** (jiný než Servisní
ceník v sekci Sklad, který slouží Prodeji).

**Formulář:** kód (unikátní), název, popis „co je v ceně" CZ/EN (tiskne se
na zakázkový list), cena v CZK a EUR bez DPH (zadávané samostatně —
appka je kurzem nepřepočítává), volná textová skupina pro filtrování,
pořadí, archivace místo mazání.

**Rozdíl vedení/superadmin:** jen **superadmin**.

---

## Obecné (Nastavení)

**K čemu je:** obecné hodnoty platné pro celou appku. Zatím jediná
položka: **základní adresa pro QR kódy** — pokud zůstane prázdná, appka
použije adresu, ze které je zrovna otevřená. Změna se projeví okamžitě u
všech QR kódů.

**Rozdíl vedení/superadmin:** jen **superadmin**.

---

## První nastavení systému

Pokud appku rozjíždíš poprvé (nebo přidáváš úplně novou kategorii/rodinu
motoru od nuly), vyplňuj číselníky v tomto pořadí — každý další krok se
opírá o ten předchozí:

1. **Nastavení → Přístupy a role** — přidej ostatní uživatele (superadmin,
   vedení, mechanici), ať appku nemusíš obsluhovat ty sám za všechny.
2. **Nastavení → Obecné** — vyplň základní adresu appky (kvůli QR kódům).
3. **Nastavení → Typy dokumentů** — pokud plánuješ nahrávat dokumenty
   k motorům (faktury, homologace).
4. **Nastavení → Technické údaje** — pro každou rodinu motoru rozhodni, zda
   chceš vlastní strukturu technických polí, nebo zůstat na staré pevné
   sadě deseti polí. Nemusíš to řešit hned — appka funguje i se starou
   sadou.
5. **Nastavení → Servisní karta** — pro každou kategorii motoru nadefinuj
   typy servisu, položky karty a (pokud chceš) materiál. I tohle je
   nepovinné — kategorie může zůstat na staré servisní kartě.
6. **Tým → Mechanici, Auta, Karburátory (Katalog typů)** — naplň základní
   evidenci lidí a vybavení dřív, než je budeš potřebovat přiřazovat na
   závody.
7. **Vybavení → Motory** — zaveď motory. U motoru s existující historií
   (ne nového) vyplň **Vstupní stav** na záložce Motohodiny (jen superadmin),
   ať appka počítá motohodiny správně od teď dál, ne od nuly.
8. **Závody → Typy závodů a Tratě** — připrav číselníky předtím, než
   začneš zakládat konkrétní závody (bez typu závodu nejde založit žádný
   závod).
9. **Tým → Piloti, Týmy** — přidej piloty a týmy, přiřaď jim kategorie a
   fakturační režim.
10. **Nastavení → Typy motorů pro servis a Ceník prací** — než začneš
    přijímat zákaznické zakázky (sekce Obchod → Zakázky), musí existovat
    aspoň jeden typ motoru pro servis a aspoň jedna položka v ceníku prací.
11. **Vybavení → Sklad** — naplň sklad dílů (kódy, ceny, kompatibilní
    kategorie) — bez toho nejde vybírat materiál v zakázkách ani v Prodeji.

Odteď appka většinu dalších dat (fronta, historie, počítadla, reporty)
dopočítává sama — číselníky se doplňují jen výjimečně, když přibude nový
typ dílu, servisu nebo dokumentu.

---

## Zálohování a obnova

**Důležité:** appka v tuhle chvíli běží **jen lokálně**, na tvém počítači.
Neexistuje žádná produkční verze na serveru — tahle kapitola popisuje
zálohování **lokální databáze**. Až systém poběží na skutečném serveru
(nasazení do produkce), bude se tahle kapitola muset přepsat úplně jinak —
níže popsaný postup pak přestane platit.

### Kde databáze fyzicky leží

Na tomto Macu, ve složce projektu:

```
~/MM-WORKSHOP/mm-system/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite
```

(`<hash>` je název konkrétního souboru — v té složce bývá jen jeden `.sqlite`
soubor, poznáš ho podle velikosti).

### Jak zálohovat

1. Otevři terminál (databázi můžeš zálohovat i za běhu appky/dev serveru —
   `VACUUM INTO` udělá konzistentní kopii bez nutnosti appku vypínat).
2. Spusť příkaz `sqlite3` s **`VACUUM INTO`** na cílový soubor zálohy s
   dnešním datem v názvu (přesný příkaz máš zapsaný v `OBNOVENI.md` ve
   složce se zálohami — tam je i historie, jak přesně to dělat).
3. **Zkopíruj výslednou zálohu jinam než na stejný disk** — třeba na iCloud
   nebo externí disk. Záloha, která leží na stejném disku jako appka, není
   skutečná záloha (při poruše disku bys přišel o obojí najednou).

**Kdy zálohovat:** hlavně **po naplnění číselníků** (číselníky, servisní
karta, ceník — ruční práce, kterou nechceš dělat podruhé) a **po delší
práci s daty** (po sezóně, po hromadném zápisu zakázek apod.). Automaticky
se nezálohuje nic — je to čistě na tobě.

### Jak obnovit zálohu

1. **Zastav dev server** appky (appka nesmí běžet, dokud soubor databáze
   měníš).
2. **Zkopíruj soubor zálohy zpátky přes ten živý** (přepiš aktuální
   `.sqlite` soubor v cestě výše zálohovaným souborem).
3. **Spusť server znovu.**
4. Appka si při prvním požadavku sama doplní případné novější tabulky nebo
   sloupce (`ensureRuntimeSchema()`) — takže jde nahrát i **starší** zálohu
   z doby před nějakou změnou schématu, appka to dorovná sama. Nikdy naopak
   nemaž ani neupravuj tabulky ručně mimo appku.

**Na co si dát pozor:** obnova přepíše **úplně všechno** aktuální — všechny
zápisy udělané po datu zálohy zmizí. Než obnovíš, zvaž, jestli nejde ztracená
data raději dohledat/opravit ručně v appce.

---

## Řešení problémů

**Appka se nechová podle popisu v příručce / vypadá jinak.** Systém se stále
vyvíjí — je možné, že mezitím přibyla nová funkce nebo se něco přejmenovalo.
Zkus se řídit tím, co skutečně vidíš na obrazovce.

**Uživatel se nemůže přihlásit.** Zkontroluj **Nastavení → Přístupy a role**
— musí tam být uveden se svým přesným e-mailem a **aktivním** účtem. Appka
sama neumí ověřit, že e-mail sedí s tím, co člověk zadává při přihlašování
přes ChatGPT — překlep v e-mailu vypadá jako „nemám přístup".

**Nejde smazat poslední superadmin / nejde odebrat vlastní roli.** To je
záměrná pojistka appky, ne chyba — v systému musí vždy zůstat aspoň jeden
aktivní superadmin, a svou vlastní roli si nikdo nemůže sám odebrat, aby se
neodřízl od přístupu. Potřebnou změnu musí udělat **jiný** aktivní superadmin.

**Motor/karburátor/auto nejde přiřadit na závod.** Appka vždy napíše přesný
důvod (kolize termínu, jiné přiřazení, nekompatibilní kategorie, právě
zapůjčeno) — přečti si hlášku, řeší se to podle ní (uvolnění z jiného
závodu, změna termínu, výběr jiného kusu).

**Zakázku nejde upravit.** Zkontroluj stav — zrušená, v koši nebo
vyfakturovaná zakázka je appkou uzamčená. Vyfakturovanou odemkne jen
superadmin (tlačítko na detailu zakázky).

**Zakázka zmizela z koše a nejde ji obnovit.** Appka koš po 30 dnech sama
vyprázdní — po té lhůtě je obnovení nemožné, ani superadmin to nevrátí.

**Mechanik nevidí sekci, kterou by podle tebe vidět měl.** To je záměr —
mechanik vidí jen frontu na servis, RACE MODE a svou obrazovku pro
zákaznický motor. Nic z toho nejde rozšířit — role mechanik má pevně danou,
úzkou sadu oprávnění.

**Chybí varianta materiálu, kterou mechanik potřebuje vybrat.** Doplň ji v
**Nastavení → Servisní karta → [kategorie] → Materiál** u příslušné
kategorie materiálu.

**Appka nedovolí uložit formulář a nevím proč.** Přečti si hlášku appky —
skoro vždy přesně řekne, které pole chybí nebo je špatně (např. neplatný
e-mail, duplicitní kód, kolidující termín). Pokud appka vrátí obecnou chybu
bez vysvětlení, zkus to znovu za chvíli — může jít o chvilkový výpadek
připojení.

**Něco se ztratilo / smazalo omylem.** Nic v appce se běžně **nesmaže
fyzicky** — až na výjimky (koš zakázek po 30 dnech) appka jen archivuje
nebo stornuje, takže data většinou jde dohledat (archivovaný záznam,
stornovaný prodej/servis). Pokud si nejsi jistý, že se něco dá vrátit v
appce, **nezkoušej to opravovat sám v datech** — obnov ze zálohy (viz výše)
nebo se poraď s tím, kdo appku vyvíjí.

---

## Slovníček

- **Fronta (na servis)** — deska motorů čekajících na servisní zásah. Nikam
  se trvale neukládá, appka ji vždy znovu spočítá z toho, co se skutečně
  stalo (návrat ze závodu, ze zápůjčky, ruční zařazení).
- **Rozpracovaný motor / „zabraný" motor** — motor, na kterém právě někdo
  z mechaniků pracuje (kliknul na „Beru si ho"). Dokud ho neuvolní nebo
  nezapíše servis, appka ho ukazuje jako obsazený.
- **Storno vs. smazání** — appka téměř nikdy nic **nesmaže fyzicky**.
  „Smazat" v appce většinou znamená **archivovat** (záznam zmizí z
  výpisů, ale historie a vazby zůstávají v databázi) nebo **stornovat**
  (u servisu, prodeje, zakázky — záznam zůstane vidět, jen přeškrtnutý,
  s důvodem a tím, kdo a kdy stornoval).
- **Koš** — přechodné umístění smazané **zakázky**, ne obecný koš appky.
  Po 30 dnech appka koš sama vyprázdní a obnovení pak už nejde.
- **Snapshot v historii** — když appka zapíše servis nebo zakázku, „vyfotí"
  si aktuální název typu servisu, položky nebo materiálu přímo do záznamu.
  Pokud později přejmenuješ nebo archivuješ definici v Nastavení, starý
  záznam v historii se nezmění — ukazuje to, co skutečně platilo v době
  zápisu.
- **Default-deny u rolí (mechanik)** — appka je nastavená tak, že mechanik
  **nesmí nic**, dokud mu to někdo výslovně nepovolí. Neznamená to jen
  schované menu — i kdyby zkusil přímý odkaz na sekci, kterou nemá vidět,
  appka ho odmítne. Nová funkce, kterou v budoucnu appka získá, je pro
  mechanika automaticky zakázaná, dokud ji někdo výslovně nepovolí.
- **Motohodiny (Oppama)** — čas motoru zapsaný po závodě podle přístroje
  Oppama, ve formátu HH:MM. Appka ho přičítá k počítadlu pístu i ojnice/kliky.
- **Veřejný kód motoru** — krátký kód motoru použitý v QR kódu. Je jiný než
  kód motoru samotného a nikdy se nemění, i když kód motoru přejmenuješ —
  proto vytištěné štítky zůstávají platné navždy.
- **Extra vybavení** (u závodu) — motor nebo karburátor vzatý na závod bez
  konkrétního přiřazení k pilotovi (např. náhradní kus pro jistotu).
- **Fakturační režim** (u pilota) — komu se posílá faktura za jeho starty:
  jemu samotnému, jeho týmu, nebo napojenému zákazníkovi.
- **Servisní karta — stará vs. nová** — appka postupně přechází ze staré,
  pevně dané servisní karty (checklist dílů, čtyři typy servisu) na novou,
  konfigurovatelnou (v Nastavení si sám nadefinuješ typy servisu, položky a
  materiál pro každou kategorii). Obojí může v appce běžet souběžně, dokud
  všechny kategorie nepřepneš.
