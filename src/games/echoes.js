/*
 * kpat-web – webová verze KPatience (kpat)
 * Hra Echoes: původní autorská hra autorů kpat-web (není převzata z KDE KPatience).
 *
 * Tento program je svobodný software; můžete jej šířit a/nebo upravovat
 * podle podmínek GNU General Public License, vydané Free Software Foundation,
 * a to buď ve verzi 2, nebo (podle vašeho uvážení) kterékoli pozdější verze.
 * Program je šířen BEZ JAKÉKOLI ZÁRUKY. Viz soubor LICENSE.
 */

import { makeDeck, shuffle } from '../engine/state.js';
import { isRed } from '../engine/rules.js';

const ACE_KING_ADJACENT = true;   // eso navazuje na krále (… Q, K, A, 2 …)
const STEP_POINTS = 10;           // 1. karta série 10, 2. karta 20, 3. karta 30 …
const CLEAR_BONUS = 100;          // bonus za úplné vyčištění diamantu (výhra)
const ECHO_BONUS = 15;            // bonus za kartu, kterou hráč už znal z ozvěny

const UNIT_X = 1.03;
const ROW_Y = 0.46;   // tolik, aby zůstal vidět horní okraj zakryté karty (ozvěny), ale ne víc
const Z_PER_ROW = 20;

/**
 * Tvar diamantu: devět řad širokých 1,2,3,4,5,4,3,2,1 — jedna velká pyramida
 * nahoru (k vrcholu) a její zrcadlový obraz dolů (ke druhému vrcholu). Prostřední
 * řada (šířka 5) nemá nic, co by ji zakrývalo, takže je odkrytá hned od začátku;
 * odkrývání pak postupuje od středu k oběma hrotům, podobně jako tri-peaks.
 */
const MID = 4;
const WIDTHS = [1, 2, 3, 4, 5, 4, 3, 2, 1];
const CENTER = 2;   // nejširší řada (5 karet) zabírá x = 0..4, střed na 2

/** Karty řady o dané šířce, vystředěné kolem CENTER (odstup 1, půlkrokový posun mezi sousedními řadami). */
function centeredXs(width) {
    const half = (width - 1) / 2;
    return Array.from({ length: width }, (_, k) => CENTER - half + k);
}

const ROWS = WIDTHS.map((w, r) => ({ ids: centeredXs(w).map((_, k) => `d${r}c${k}`), xs: centeredXs(w) }));

const TABLEAU = [];
const POS = {};
ROWS.forEach((row, r) => {
    row.ids.forEach((id, k) => {
        TABLEAU.push(id);
        POS[id] = { r, x: row.xs[k] };
    });
});

// Soused "blíž ke středu" pro danou řadu — tím směrem postupuje odkrývání.
// Prostřední řada (MID) sousedem nemá: nic ji nezakrývá.
function middleNeighborRow(r) {
    if (r === MID) return null;
    return r < MID ? r + 1 : r - 1;
}

const COVERS = {};
for (const id of TABLEAU) {
    const { r, x } = POS[id];
    const nr = middleNeighborRow(r);
    COVERS[id] = nr === null
    ? []
    : ROWS[nr].ids
    .map((id2, k) => ({ id: id2, x2: ROWS[nr].xs[k] }))
    .filter(o => Math.abs(o.x2 - x) === 0.5)
    .map(o => o.id);
}

const lastOf = arr => arr[arr.length - 1];

/** Je karta volná (nic ji nezakrývá)? */
function exposed(state, id) {
    return COVERS[id].every(c => state.piles[c].length === 0);
}

/**
 * Odhalí nově volné karty tableau. Karta, která už byla lícem nahoru díky
 * ozvěně (viz triggerEcho), dostane při svém skutečném odkrytí bonus — hráč
 * ji už znal předem a teď se mu to vyplatilo.
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
            state.meta.score += ECHO_BONUS;   // ozvěna to prozradila předem
        } else {
            card.up = true;
        }
    }
    state.meta.exposedIds = [...seen];
}

/** Dvě karty stejné hodnoty a stejné barvy (♠↔♣ nebo ♥↔♦) jsou vzájemná "ozvěna". */
function isEchoPair(a, b) {
    return a.r === b.r && isRed(a.s) === isRed(b.s);
}

/**
 * Jakmile se karta stane známou (zahraje se na odkládací hromádku, ať už
 * z tableau nebo z balíčku), její ozvěna — pokud ještě leží skrytá v
 * diamantu — se rovnou otočí lícem nahoru. Zůstává na místě a dál zakrytá,
 * dokud na ni nepřijde řada, ale její horní okraj je odteď vidět.
 */
function triggerEcho(state, card) {
    for (const id of TABLEAU) {
        const pile = state.piles[id];
        const twin = pile[0];
        if (pile.length && !twin.up && isEchoPair(twin, card)) {
            twin.up = true;
            return;
        }
    }
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
    if (TABLEAU.every(id => state.piles[id].length === 0)) {
        state.meta.score += CLEAR_BONUS;
    }
}

const layout = {
    // diamant je mnohem užší než např. tri-peaks — vějíř balíčku proto smí
    // ukazovat jen pár karet (card-width rozpětí vstupuje i do výpočtu
    // velikosti karty, ne jen do vykreslení), jinak by zbytečně vynutil
    // menší karty, nebo by zajel přes odkládací hromádku
    stock: {
        x: 0.1, y: 0, anchor: 'bottom', fan: 'right-9', spread: 0.25,
        jitter: false, type: 'stock',
    },
    waste: { x: 3.3, y: 0, anchor: 'bottom', fan: 'none', type: 'waste' },
};
for (const id of TABLEAU) {
    const { r, x } = POS[id];
    const dist = Math.abs(r - MID);
    layout[id] = {
        x: x * UNIT_X,
        y: r * ROW_Y,
        z: (4 - dist) * Z_PER_ROW,
        fan: 'none',
        jitter: false,
        noSlot: true,
        type: 'tableau',
    };
}

const echoes = {
    id: 'echoes',
    name: 'Echoes',
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
        triggerEcho(state, first);
        revealExposed(state);   // prostřední řada je volná hned od začátku
    },

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
            triggerEcho(state, moved[0]);
            revealExposed(state);
        }
    },

    onClick(state, pile) {
        const { stock, waste } = state.piles;

        if (pile === 'stock') {
            if (stock.length === 0) return false;
            const c = stock.pop();
            c.up = true;
            waste.push(c);
            state.meta.streak = 0;
            triggerEcho(state, c);
            revealExposed(state);
            return true;
        }

        if (TABLEAU.includes(pile)) {
            const p = state.piles[pile];
            if (p.length === 0 || !exposed(state, pile)) return false;
            const card = lastOf(p);
            if (!canPlayOn(lastOf(waste), card)) return false;
            p.pop();
            card.up = true;
            waste.push(card);
            scorePlay(state);
            triggerEcho(state, card);
            revealExposed(state);
            return true;
        }
        return false;
    },

    canDeal(state) {
        return state.piles.stock.length > 0;
    },

    isWon(state) {
        return TABLEAU.every(id => state.piles[id].length === 0);
    },

    isLost(state) {
        if (TABLEAU.every(id => state.piles[id].length === 0)) return false;
        if (state.piles.stock.length > 0) return false;
        const top = lastOf(state.piles.waste);
        return !TABLEAU.some(id =>
        state.piles[id].length > 0
        && exposed(state, id)
        && canPlayOn(top, state.piles[id][0])
        );
    },
};

export default echoes;
