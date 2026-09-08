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
