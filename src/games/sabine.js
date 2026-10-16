/*
 * kpat-web – webová verze KPatience (kpat)
 * Hra Sabine: původní hra autorů kpat-web (není převzata z KDE KPatience).
 *
 * Tento program je svobodný software; můžete jej šířit a/nebo upravovat
 * podle podmínek GNU General Public License, vydané Free Software Foundation,
 * a to buď ve verzi 2, nebo (podle vašeho uvážení) kterékoli pozdější verze.
 * Program je šířen BEZ JAKÉKOLI ZÁRUKY. Viz soubor LICENSE.
 */

import { makeDeck, shuffle } from '../engine/state.js';
import { canGoToSuitFoundation } from '../engine/rules.js';

// f0..f3 = základny, t0..t6 = sloupce
const FOUNDATIONS = ['f0', 'f1', 'f2', 'f3'];
const TABLEAU = ['t0', 't1', 't2', 't3', 't4', 't5', 't6'];
const DIST_X = 1.15;
const CARDS_PER_COLUMN = 4;

const isFoundation = id => id[0] === 'f';
const isTableau = id => id[0] === 't';

/**
 * Hodnoty tvoří kruh (eso navazuje na krále).
 * Vrací +1, když b následuje po a (a -> b stoupá), -1, když a následuje po b, jinak 0.
 */
function step(a, b) {
    if (b === (a % 13) + 1) return 1;
    if (a === (b % 13) + 1) return -1;
    return 0;
}

/** Směr sloupce určují jeho VRCHNÍ dvě karty; 0 = volný (kterýkoli soused). */
function topDir(col) {
    return col.length >= 2 ? step(col[col.length - 2].r, col[col.length - 1].r) : 0;
}

/** Je to řada (všechny kroky stejným směrem po kruhu)? */
function isRun(cards) {
    if (cards.length === 0) return false;
    if (cards.length === 1) return true;
    const d = step(cards[0].r, cards[1].r);
    if (d === 0) return false;
    for (let i = 1; i < cards.length; i++) {
        if (step(cards[i - 1].r, cards[i].r) !== d) return false;
    }
    return true;
}

/** Smí řada ležet na sloupci (bez zpětných obratů)? */
function canPlace(run, dest) {
    if (dest.length === 0) return true;
    const top = dest[dest.length - 1];
    const d = step(top.r, run[0].r);
    if (d === 0) return false;
    const cd = topDir(dest);
    if (cd !== 0 && cd !== d) return false;           // řetěz se nesmí otočit
    if (run.length >= 2 && step(run[0].r, run[1].r) !== d) return false;
    return true;
}

function foundationRank(state, suit) {
    for (const f of FOUNDATIONS) {
        const p = state.piles[f];
        if (p.length && p[0].s === suit) return p[p.length - 1].r;
    }
    return 0;
}

/** Opatrné odkládání: esa a dvojky vždy, jinak když ostatní barvy nezaostávají o víc než dvě. */
function isSafeToDrop(state, card) {
    if (card.r <= 2) return true;
    return [0, 1, 2, 3]
    .filter(s => s !== card.s)
    .every(s => foundationRank(state, s) >= card.r - 2);
}

const layout = {
    stock: { x: 0, y: 0, fan: 'none', type: 'stock' },
    waste: { x: DIST_X, y: 0, fan: 'none', type: 'waste' },
};
FOUNDATIONS.forEach((id, i) => {
    layout[id] = { x: DIST_X * (3 + i), y: 0, fan: 'none', type: 'foundation' };
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

const sabine = {
    id: 'sabine',
    name: 'Sabine',
    layout,

    // 7 sloupců po 4 kartách lícem nahoru, zbylých 24 karet do zásobníku
    deal(state, rng) {
        const cards = shuffle(makeDeck(1), rng);
        TABLEAU.forEach((id, i) => {
            for (const c of cards.slice(i * CARDS_PER_COLUMN, (i + 1) * CARDS_PER_COLUMN)) {
                c.up = true;
                state.piles[id].push(c);
            }
        });
        const rest = cards.slice(TABLEAU.length * CARDS_PER_COLUMN);
        for (const c of rest) c.up = false;
        state.piles.stock = rest;                     // vrchol zásobníku = poslední prvek
    },

    canDrag(state, pile, idx) {
        const p = state.piles[pile];
        if (pile === 'stock' || isFoundation(pile)) return false;
        if (pile === 'waste') return idx === p.length - 1;
        return isRun(p.slice(idx));
    },

    canDrop(state, cards, toPile) {
        const dest = state.piles[toPile];
        if (isFoundation(toPile)) {
            return cards.length === 1 && canGoToSuitFoundation(cards[0], dest);
        }
        if (isTableau(toPile)) return isRun(cards) && canPlace(cards, dest);
        return false;
    },

    // Kliknutí na zásobník: jedna karta do odkládací hromádky, bez opakování
    onClick(state, pile) {
        if (pile !== 'stock') return false;
        const { stock, waste } = state.piles;
        if (stock.length === 0) return false;
        const c = stock.pop();
        c.up = true;
        waste.push(c);
        return true;
    },

    canDeal(state) {
        return state.piles.stock.length > 0;
    },

    // Dvojklik: vrchní karta na základnu
    autoMove(state, pile, idx) {
        const p = state.piles[pile];
        if (isFoundation(pile) || pile === 'stock' || idx !== p.length - 1) return null;
        const card = p[idx];
        return FOUNDATIONS.find(f => canGoToSuitFoundation(card, state.piles[f])) || null;
    },

    // Kandidáti pro automatické odkládání na základny
    dropCandidates(state) {
        const out = [];
        const sources = [];
        const w = state.piles.waste;
        if (w.length) sources.push({ from: 'waste', idx: w.length - 1 });
        for (const t of TABLEAU) {
            const p = state.piles[t];
            if (p.length) sources.push({ from: t, idx: p.length - 1 });
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

export default sabine;
