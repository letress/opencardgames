/*
 * kpat-web – webová verze KPatience (kpat)
 * Odvozeno z KDE KPatience: https://github.com/KDE/kpat
 *
 * Tento program je svobodný software; můžete jej šířit a/nebo upravovat
 * podle podmínek GNU General Public License, vydané Free Software Foundation,
 * a to buď ve verzi 2, nebo (podle vašeho uvážení) kterékoli pozdější verze.
 * Program je šířen BEZ JAKÉKOLI ZÁRUKY. Viz soubor LICENSE.
 */

import { SPADES, HEARTS, DIAMONDS, CLUBS, ACE, KING } from './state.js';

export const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];

/** Červené barvy jsou srdce a káry. */
export function isRed(suit) {
    return suit === HEARTS || suit === DIAMONDS;
}

export function rankLabel(rank) {
    return RANK_LABELS[rank - 1];
}

/** Mají karty opačnou barvu (červená/černá)? */
export function alternatesColor(a, b) {
    return isRed(a.s) !== isRed(b.s);
}

export function sameSuit(a, b) {
    return a.s === b.s;
}

/** Je `card` o jednu hodnotu nižší než `onto`? (sestupná řada) */
export function isOneLower(card, onto) {
    return card.r === onto.r - 1;
}

/** Je `card` o jednu hodnotu vyšší než `onto`? (vzestupná řada) */
export function isOneHigher(card, onto) {
    return card.r === onto.r + 1;
}

/**
 * Může `card` ležet na `onto` v tableau?
 * @param {object} opt
 *   color: 'alternate' | 'same' | 'any'   (výchozí 'alternate')
 *   dir:   'down' | 'up'                  (výchozí 'down')
 */
export function canStack(card, onto, opt = {}) {
    const { color = 'alternate', dir = 'down' } = opt;
    if (!onto) return false;
    const rankOk = dir === 'down' ? isOneLower(card, onto) : isOneHigher(card, onto);
    if (!rankOk) return false;
    if (color === 'alternate') return alternatesColor(card, onto);
    if (color === 'same') return sameSuit(card, onto);
    return true;
}

/**
 * Je celé pole karet platná posloupnost (např. pro tažení více karet)?
 * Všechny karty musí být lícem nahoru a navazovat podle `opt`.
 */
export function isSequence(cards, opt = {}) {
    if (cards.length === 0) return false;
    for (let i = 0; i < cards.length; i++) {
        if (!cards[i].up) return false;
        if (i > 0 && !canStack(cards[i], cards[i - 1], opt)) return false;
    }
    return true;
}

/**
 * Nejdelší platná posloupnost na konci hromádky.
 * Vrací index prvního prvku (nebo pile.length, pokud je hromádka prázdná
 * nebo vrchní karta je rubem nahoru).
 */
export function sequenceStart(pile, opt = {}) {
    let i = pile.length - 1;
    if (i < 0 || !pile[i].up) return pile.length;
    while (i > 0 && pile[i - 1].up && canStack(pile[i], pile[i - 1], opt)) i--;
    return i;
}

/**
 * Může karta na základovou hromádku (foundation), která se staví
 * vzestupně od esa v jedné barvě?
 */
export function canGoToSuitFoundation(card, pile) {
    if (pile.length === 0) return card.r === ACE;
    const t = pile[pile.length - 1];
    return t.s === card.s && card.r === t.r + 1;
}

/** Je řada kompletní (od esa po krále v jedné barvě)? */
export function isCompleteSuit(pile) {
    return pile.length === KING && pile.every(c => c.s === pile[0].s)
    && pile.every((c, i) => c.r === i + 1);
}

/** Je kompletní řada od krále po eso v jedné barvě (Spider)? */
export function isCompleteDescendingRun(cards) {
    if (cards.length !== KING) return false;
    return cards.every((c, i) => c.up && c.s === cards[0].s && c.r === KING - i);
}

/**
 * Vybere cílovou hromádku pro dvojklik: první z `candidates`,
 * kam hra povolí položení. `canDrop(cards, pileId)` dodá volající hra.
 */
export function firstAccepting(candidates, canDrop) {
    for (const id of candidates) {
        if (canDrop(id)) return id;
    }
    return null;
}

export { SPADES, HEARTS, DIAMONDS, CLUBS };
