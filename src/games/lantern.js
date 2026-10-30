/*
 * kpat-web – webová verze KPatience (kpat)
 * Hra Lantern: původní autorská hra autorů kpat-web (není převzata z KDE KPatience).
 *
 * Tento program je svobodný software; můžete jej šířit a/nebo upravovat
 * podle podmínek GNU General Public License, vydané Free Software Foundation,
 * a to buď ve verzi 2, nebo (podle vašeho uvážení) kterékoli pozdější verze.
 * Program je šířen BEZ JAKÉKOLI ZÁRUKY. Viz soubor LICENSE.
 */

import { makeDeck, shuffle } from '../engine/state.js';

const ACE_KING_ADJACENT = true;   // eso navazuje na krále (… Q, K, A, 2 …)
const STEP_POINTS = 10;           // 1. karta série 10, 2. karta 20, 3. karta 30 …
const CLEAR_BONUS = 100;          // bonus za úplné vyčištění pyramidy (výhra)
const ROW_CLEAR_BONUS = 20;       // bonus za vyklizení celé řady
const TORCH_COST = 8;             // kolik bodů stojí nahlédnutí pod zakrytou kartu
const PEEK_PAYOFF = 15;           // bonus, když se zaplacené nahlédnutí later vyplatí
const REDEALS = 2;                // kolikrát smí talon znovu naskládat odhozené karty

const UNIT_X = 1.03;
const ROW_Y = 0.55;
const Z_PER_ROW = 20;

// Klasický trojúhelník: řady 1,2,3,4,5,6,7 karet (28 celkem). Vrchol je
// nejhlouběji skrytý, základna (nejširší řada) je odkrytá hned od začátku.
const WIDTHS = [1, 2, 3, 4, 5, 6, 7];
const CENTER = 3;   // nejširší řada (7 karet) zabírá x = 0..6, střed na 3

function centeredXs(width) {
    const half = (width - 1) / 2;
    return Array.from({ length: width }, (_, k) => CENTER - half + k);
}

const ROWS = WIDTHS.map((w, r) => ({ ids: centeredXs(w).map((_, k) => `p${r}c${k}`), xs: centeredXs(w) }));
const BASE_ROW = ROWS.length - 1;

const TABLEAU = [];
const POS = {};
ROWS.forEach((row, r) => {
    row.ids.forEach((id, k) => {
        TABLEAU.push(id);
        POS[id] = { r, x: row.xs[k] };
    });
});

const COVERS = {};
for (const id of TABLEAU) {
    const { r, x } = POS[id];
    COVERS[id] = r === BASE_ROW
    ? []
    : ROWS[r + 1].ids
    .map((id2, k) => ({ id: id2, x2: ROWS[r + 1].xs[k] }))
    .filter(o => Math.abs(o.x2 - x) === 0.5)
    .map(o => o.id);
}

const lastOf = arr => arr[arr.length - 1];

/** Je karta volná (nic ji nezakrývá)? */
function exposed(state, id) {
    return COVERS[id].every(c => state.piles[c].length === 0);
}

/**
 * Odhalí nově volné karty. Karta odhalená dřív za body (viz onClick) dostane
 * při svém skutečném odkrytí bonus — zaplacené nahlédnutí se vyplatilo.
 */
function revealExposed(state) {
    const seen = new Set(state.meta.exposedIds);
    for (const id of TABLEAU) {
        const pile = state.piles[id];
        if (!pile.length || !exposed(state, id)) continue;
        const card = pile[0];
        if (seen.has(card.id)) continue;
        seen.add(card.id);
        if (card.up) {
            state.meta.score += PEEK_PAYOFF;
        } else {
            card.up = true;
        }
    }
    state.meta.exposedIds = [...seen];
}

/** Sousední hodnoty (na barvě nezáleží). */
function adjacent(a, b) {
    const d = Math.abs(a - b);
    return d === 1 || (ACE_KING_ADJACENT && d === 12);
}

function canPlayOn(top, card) {
    return !top || adjacent(top.r, card.r);
}

function scorePlay(state) {
    state.meta.streak += 1;
    state.meta.score += STEP_POINTS * state.meta.streak;
}

/** Dala karta zahraná z `id` právě poslední chybějící kus své řady? Pokud ano, vyplatí bonus přesně jednou. */
function maybeRowBonus(state, id) {
    const { r } = POS[id];
    const rowIds = ROWS[r].ids;
    if (!rowIds.every(rid => state.piles[rid].length === 0)) return;
    if (state.meta.rowBonusGiven.includes(r)) return;
    state.meta.rowBonusGiven.push(r);
    state.meta.score += ROW_CLEAR_BONUS;
}

const layout = {
    stock: {
        x: 0.1, y: 0, anchor: 'bottom', fan: 'right-10', spread: 0.25,
        jitter: false, type: 'stock',
    },
    waste: { x: 7.3, y: 0, anchor: 'bottom', fan: 'none', type: 'waste' },
};
for (const id of TABLEAU) {
    const { r, x } = POS[id];
    layout[id] = {
        x: x * UNIT_X,
        y: r * ROW_Y,
        z: r * Z_PER_ROW,
        fan: 'none',
        jitter: false,
        noSlot: true,
        type: 'tableau',
    };
}

const lantern = {
    id: 'lantern',
    name: 'Lantern',
    layout,
    scoring: true,
    noEndEarly: true,   // žádný žolík k vynucení — na rozdíl od Pyramids tu není past k obcházení

    deal(state, rng) {
        const cards = shuffle(makeDeck(1), rng);
        TABLEAU.forEach((id, i) => {
            cards[i].up = false;
            state.piles[id].push(cards[i]);
        });

        const rest = cards.slice(TABLEAU.length);
        const first = rest.pop();
        first.up = true;
        state.piles.waste.push(first);

        for (const c of rest) c.up = false;
        state.piles.stock = rest;

        state.meta.score = 0;
        state.meta.streak = 0;
        state.meta.exposedIds = [];
        state.meta.rowBonusGiven = [];
        state.meta.redealsLeft = REDEALS;
        revealExposed(state);   // základní řada je volná hned od začátku
    },

    // Táhnout (přetažením) lze jen skutečně volnou, odkrytou kartu.
    canDrag(state, pile) {
        return TABLEAU.includes(pile) && exposed(state, pile);
    },

    canDrop(state, cards, toPile) {
        if (toPile !== 'waste' || cards.length !== 1) return false;
        return canPlayOn(lastOf(state.piles.waste), cards[0]);
    },

    onMove(state, { from, moved }) {
        if (TABLEAU.includes(from)) {
            moved[0].up = true;
            scorePlay(state);
            maybeRowBonus(state, from);
            revealExposed(state);
        }
    },

    // Klik na kartu v pyramidě: odkrytou zahraje na odkládací hromádku; zakrytou,
    // dosud neznámou (lícem dolů) odhalí za cenu pár bodů — koupené nahlédnutí
    // pod kartu, která ještě leží zavalená a nejde zahrát, ale hráč už ví, co tam je.
    onClick(state, pile) {
        const { stock, waste } = state.piles;

        if (pile === 'stock') {
            if (stock.length === 0) {
                if (state.meta.redealsLeft <= 0) return false;
                state.meta.redealsLeft -= 1;
                while (waste.length > 0) {
                    const c = waste.pop();
                    c.up = false;
                    stock.push(c);
                }
            }
            const c = stock.pop();
            c.up = true;
            waste.push(c);
            state.meta.streak = 0;
            return true;
        }

        if (TABLEAU.includes(pile)) {
            const p = state.piles[pile];
            if (p.length === 0) return false;
            const card = p[0];

            if (!exposed(state, pile)) {
                if (card.up) return false;          // už odhaleno dřív, není co platit
                card.up = true;
                state.meta.score -= TORCH_COST;
                return true;
            }

            if (!canPlayOn(lastOf(waste), card)) return false;
            p.pop();
            card.up = true;
            waste.push(card);
            scorePlay(state);
            maybeRowBonus(state, pile);
            revealExposed(state);
            return true;
        }
        return false;
    },

    canDeal(state) {
        return state.piles.stock.length > 0 || state.meta.redealsLeft > 0;
    },

    isWon(state) {
        return TABLEAU.every(id => state.piles[id].length === 0);
    },

    isLost(state) {
        if (TABLEAU.every(id => state.piles[id].length === 0)) return false;
        if (state.piles.stock.length > 0 || state.meta.redealsLeft > 0) return false;
        const top = lastOf(state.piles.waste);
        return !TABLEAU.some(id =>
        state.piles[id].length > 0
        && exposed(state, id)
        && canPlayOn(top, state.piles[id][0])
        );
    },
};

export default lantern;
