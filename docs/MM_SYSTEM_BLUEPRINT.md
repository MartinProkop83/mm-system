# MM System — produktový blueprint

Stav: návrh první verze k potvrzení  
Jazyky rozhraní: čeština a angličtina  
První oblast: motory, servis a závody

## 1. Cíl systému

MM System bude centrální provozní aplikace Macháč Motors. Nahradí informace
uložené na papíře a v různých složkách Google Drivu jedním dohledatelným
systémem. Na počítači bude sloužit ke správě a plánování, na telefonu k rychlé
práci mechaniků během závodu.

## 2. Uživatelské role

### Superadmin

- úplný přístup ke všem datům a nastavením;
- vytváření uživatelů a nastavování jejich rolí;
- správa jazyků, číselníků a servisních pravidel;
- oprava, archivace a obnova dat;
- přístup k auditní historii a exportům.

### Šéf

- přístup ke všem provozním datům;
- vytváření a úprava motorů, závodů, jezdců a přiřazení;
- plánování a schvalování servisu;
- přístup k reportům, dokumentům a historii;
- bez přístupu k bezpečnostním a systémovým nastavením.

### Mechanik

- prohlížení motorů, závodů a přiřazení;
- zapisování provozu, servisních zásahů, poznámek a fotografií;
- používání mobilního Race Mode;
- bez možnosti mazat historii, měnit role nebo systémová pravidla.

Každá významná změna bude obsahovat informaci kdo, co a kdy změnil. Záznamy se
budou primárně archivovat, nikoliv nenávratně mazat.

## 3. První funkční celek

První verze musí umožnit celý následující postup:

1. Přihlásit uživatele a použít jeho roli a jazyk.
2. Založit motor včetně fotografie a technických údajů.
3. Nastavit motoru servisní profil a intervaly jednotlivých komponentů.
4. Založit závod a jeho jízdy nebo session.
5. Přiřadit motor jezdci pro konkrétní závod.
6. Zapsat použití motoru během jízdy.
7. Automaticky přepočítat stav a zbývající servisní intervaly.
8. Zapsat servis, vyměněné díly, mechanika, poznámku a fotografie.
9. Zobrazit kompletní historii motoru i historii konkrétního závodu.
10. Zobrazit důležité informace v jednoduchém mobilním Race Mode.

## 4. Základní data

### Motor

- interní kód a sériové číslo;
- značka, model, kategorie a technické údaje;
- stav: připraven, brzy servis, servis, přestavba, sklad, vyřazen;
- servisní profil;
- fotografie a dokumenty;
- historická přiřazení, používání a servis.

### Servis

- datum a typ zásahu;
- motor a servisované komponenty;
- mechanik;
- stav před a po servisu;
- vyměněné díly;
- naměřené hodnoty, poznámky, dokumenty a fotografie;
- automatický výpočet dalšího servisu.

### Závod

- název, seriál, trať, země a termín;
- program a jednotlivé jízdy;
- jezdci a jejich přiřazení;
- použité motory a později také karburátory, výfuky a převody;
- setup, servis, logistika, dokumenty a poznámky;
- stav: plánovaný, probíhající, dokončený, archivovaný.

## 5. Důležitá pravidla dat

- Motor může mít v jednom čase pouze jedno aktivní přiřazení.
- Historická přiřazení se nepřepisují.
- Provoz motoru se zapisuje jako samostatné události, ne jako ručně přepisovaný
  součet.
- Servisní stav se počítá ze servisních pravidel, provozu a výměn komponentů.
- Dokončený servis se neupravuje bez auditní stopy.
- Dokumenty a fotografie mají vlastní oprávnění a historii.
- Česká a anglická verze používají stejná data; překládají se názvy rozhraní a
  systémové číselníky.

## 6. Hlavní obrazovky první verze

- Přihlášení
- Dashboard
- Motory — seznam
- Motor — detail, servis, provoz, dokumenty a historie
- Servis — plán a nový servisní záznam
- Závody — seznam
- Závod — přehled, jezdci, přiřazení, program, servis a poznámky
- Mobilní Race Mode
- Uživatelé, role, jazyk a základní nastavení

## 7. Vizuální principy

- desktopová navigace a rychlost inspirovaná Linear;
- servisní logika inspirovaná Fleetio;
- jedna centrální detailní stránka se záložkami jako v Notion;
- mobilní ovládání jednou rukou inspirované Revolutem;
- závodní režim s vysokou čitelností, velkými akcemi a minimem kliknutí;
- světlé administrační prostředí a výrazný tmavý Race Mode;
- stejné názvosloví, stavy a barvy v celém systému.

## 8. Co zatím není v první etapě

- kompletní skladové hospodářství;
- fakturace a účetnictví;
- veřejný portál pro jezdce;
- pokročilá telemetrie;
- samostatná nativní aplikace z App Storu;
- plná automatická synchronizace s Google Drivem.

Tyto oblasti lze doplnit bez změny základní architektury.

## 9. Další krok po potvrzení

Založit technický projekt, vytvořit prázdnou aplikaci s českým a anglickým
rozhraním a připravit přihlášení a kostru navigace. Poté vytvořit první skutečný
datový tok: motor -> přiřazení k závodu -> provoz -> servis.
