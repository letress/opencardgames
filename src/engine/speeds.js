/*
 * kpat-web – webová verze KPatience (kpat)
 * Odvozeno z KDE KPatience: https://github.com/KDE/kpat
 *
 * Tento program je svobodný software; můžete jej šířit a/nebo upravovat
 * podle podmínek GNU General Public License, vydané Free Software Foundation,
 * a to buď ve verzi 2, nebo (podle vašeho uvážení) kterékoli pozdější verze.
 * Program je šířen BEZ JAKÉKOLI ZÁRUKY. Viz soubor LICENSE.
 */

// ZÁSTUPNÉ HODNOTY. Nahraďte je hodnotami ze src/speeds.h z kpat (v ms, faktor bez jednotky).
export const TIME_BETWEEN_MOVES = 150;        // pauza mezi dvěma odloženími
export const DURATION_AUTODROP = 230;         // doba animace odložení
export const DURATION_AUTODROP_MINIMUM = 60;  // nejkratší čas po zrychlení
export const AUTODROP_SPEEDUP_FACTOR = 0.85;  // zrychlení po každém odložení
