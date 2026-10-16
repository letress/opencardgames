/*
 * kpat-web – webová verze KPatience (kpat)
 * Hra Victorian: původní hra autorů kpat-web (není převzata z KDE KPatience).
 *
 * Tento program je svobodný software; můžete jej šířit a/nebo upravovat
 * podle podmínek GNU General Public License, vydané Free Software Foundation,
 * a to buď ve verzi 2, nebo (podle vašeho uvážení) kterékoli pozdější verze.
 * Program je šířen BEZ JAKÉKOLI ZÁRUKY. Viz soubor LICENSE.
 */

import { makeDeck, shuffle } from '../engine/state.js';
import { isRed, canGoToSuitFoundation } from '../engine/rules.js';

// m0..m3 = přihrádky Mantel (pro ♠ ♥ ♦ ♣), f0..f3 = základny, t0..t7 = sloupce
const MANTEL = ['m0', 'm1', 'm2', 'm3'];
const FOUNDATIONS = ['f0', 'f1', 'f2', 'f3'];
const TABLEAU = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'];
const DIST_X = 1.1;

const isMantel = id => id[0] === 'm';
const isFoundation = id => id[0] === 'f';
const isTableau = id => id[0] === 't';

/** Karta smí ležet na jiné kartě: o jedničku nižší hodnota a STEJNÁ barva (červená/černá). */
function fitsOn(card, onto) {
    return card.r === onto.r - 1 && isRed(card.s) === isRed(onto.s);
}

/** Je to souvislá řada (klesající o 1, stejná barva)? */
function isRun(cards) {
    if (cards.length === 0) return false;
    for (let i = 1; i < cards.length; i++) {
        if (!fitsOn(cards[i], cards[i - 1])) return false;
    }
    return true;
}

function foundationRank(state, suit) {
    for (const f of FOUNDATIONS) {
        const p = state.piles[f];
        if (p.length && p[0].s === suit) return p[p.length - 1].r;
    }
    return 0;
}

/** Druhá barva (♠↔♣, ♥↔♦) téže barvy. */
const sameColorSuit = s => ({ 0: 3, 3: 0, 1: 2, 2: 1 })[s];

/**
 * Bezpečné odložení: na kartu hodnoty r - 1 se hodí dvě karty hodnoty r téže barvy.
 * Odložením jedné z nich nikdy nesmí zůstat karta r - 1 druhé barvy bez hostitele.
 */
function isSafeToDrop(state, card) {
    if (card.r === 1) return true;
    return foundationRank(state, sameColorSuit(card.s)) >= card.r - 1;
}

const layout = {};
MANTEL.forEach((id, i) => {
    layout[id] = { x: DIST_X * i, y: 0, fan: 'none', type: 'cell' };
});
FOUNDATIONS.forEach((id, i) => {
    layout[id] = { x: DIST_X * (4 + i), y: 0, fan: 'none', type: 'foundation' };
});
TABLEAU.forEach((id, i) => {
    layout[id] = {
        x: DIST_X * i,
        y: 1.15,
        fan: 'down',
        bottomPadding: 1.75,
        depth: { down: 0, up: 8 },
        type: 'tableau',
    };
});

const victorian = {
    id: 'victorian',
    name: 'Victorian',
    layout,
    dealOrigin: { x: 3.5 * DIST_X, y: -2 },

    // 52 karet lícem nahoru do osmi sloupců (7, 7, 7, 7, 6, 6, 6, 6)
    deal(state, rng) {
        const cards = shuffle(makeDeck(1), rng);
        cards.forEach((c, i) => {
            c.up = true;
            state.piles[TABLEAU[i % TABLEAU.length]].push(c);
        });
    },

    canDrag(state, pile, idx) {
        const p = state.piles[pile];
        if (isFoundation(pile)) return false;                 // ze základny se nebere
        if (isMantel(pile)) return idx === p.length - 1;
        return isRun(p.slice(idx));
    },

    canDrop(state, cards, toPile) {
        const dest = state.piles[toPile];
        const first = cards[0];

        if (isFoundation(toPile)) {
            return cards.length === 1 && canGoToSuitFoundation(first, dest);
        }
        if (isMantel(toPile)) {
            // přihrádka patří jedné barvě a drží jedinou kartu
            return cards.length === 1 && toPile === `m${first.s}` && dest.length === 0;
        }
        if (isTableau(toPile)) {
            if (dest.length === 0) return true;                 // na prázdný sloupec cokoli
            return fitsOn(first, dest[dest.length - 1]);
        }
        return false;
    },

    // Dvojklik: nejdřív na základnu, jinak (ze sloupce) do přihrádky její barvy
    autoMove(state, pile, idx) {
        const p = state.piles[pile];
        if (isFoundation(pile) || idx !== p.length - 1) return null;
        const card = p[idx];

        const f = FOUNDATIONS.find(id => canGoToSuitFoundation(card, state.piles[id]));
        if (f) return f;

        const cell = `m${card.s}`;
        if (!isMantel(pile) && state.piles[cell].length === 0) return cell;
        return null;
    },

    // Kandidáti pro automatické odkládání na základny
    dropCandidates(state) {
        const out = [];
        const sources = [];
        for (const id of [...MANTEL, ...TABLEAU]) {
            const p = state.piles[id];
            if (p.length) sources.push({ from: id, idx: p.length - 1 });
        }
        for (const s of sources) {
            const card = state.piles[s.from][s.idx];
            if (!isSafeToDrop(state, card)) continue;
            const to = FOUNDATIONS.find(f => canGoToSuitFoundation(card, state.piles[f]));
            if (to) out.push({ ...s, to });
        }
        return out.sort((a, b) => state.piles[a.from][a.idx].r - state.piles[b.from][b.idx].r);
    },

    isWon(state) {
        return FOUNDATIONS.reduce((n, f) => n + state.piles[f].length, 0) === 52;
    },
};

export default victorian;
