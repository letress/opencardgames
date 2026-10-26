/*
 * kpat-web – web version of KPatience (kpat)
 * Tri Peaks: original implementation by the kpat-web authors (not taken from KDE KPatience).
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 2, or (at your option) any
 * later version. This program is distributed WITHOUT ANY WARRANTY.
 * See the LICENSE file.
 */

import { makeDeck, shuffle } from '../engine/state.js';

const ACE_KING_ADJACENT = true;   // ace wraps around the king (… Q, K, A, 2 …)
const STEP_POINTS = 10;           // 1st card of a streak = 10, 2nd = 20, 3rd = 30 …
const CLEAR_BONUS = 100;          // bonus for clearing the whole tableau (win)

const UNIT_X = 1.03;              // horizontal unit (card width + small gap)
const ROW_Y = 0.585;              // vertical row spacing, in card-height multiples
const Z_PER_ROW = 20;             // lower rows lie on top of higher ones

// Three peaks side by side (apex -> 2 cards -> 3 cards), sitting on one shared
// connecting row of 10 cards that is always exposed (nothing lies on top of it).
const PEAK_OFFSETS = [0, 3.5, 7];                 // left edge of each peak (card-width units)
const PEAK_ROWS = [[1], [0.5, 1.5], [0, 1, 2]];   // local x per row within a peak
const BASE_ROW = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];  // shared bottom row

// ROWS[r] = {ids, xs} for every row, top (apex) to bottom (base row)
const ROWS = PEAK_ROWS.map((xs, r) => {
    const ids = [];
    const abs = [];
    PEAK_OFFSETS.forEach((off, p) => {
        xs.forEach((x, k) => {
            ids.push(`p${p}r${r}c${k}`);
            abs.push(off + x);
        });
    });
    return { ids, xs: abs };
});
ROWS.push({ ids: BASE_ROW.map((_, k) => `base${k}`), xs: BASE_ROW });

const TABLEAU = [];
const POS = {};
ROWS.forEach((row, r) => {
    row.ids.forEach((id, k) => {
        TABLEAU.push(id);
        POS[id] = { r, x: row.xs[k] };
    });
});

// Which piles cover a given card (must be empty for it to be playable)
const COVERS = {};
for (const id of TABLEAU) {
    const { r, x } = POS[id];
    COVERS[id] = r < ROWS.length - 1
    ? ROWS[r + 1].ids
    .map((id2, k) => ({ id: id2, x2: ROWS[r + 1].xs[k] }))
    .filter(o => Math.abs(o.x2 - x) === 0.5)
    .map(o => o.id)
    : [];
}

const lastOf = arr => arr[arr.length - 1];

/** Is the card playable (nothing left covering it)? */
function exposed(state, id) {
    return COVERS[id].every(c => state.piles[c].length === 0);
}

/** Adjacent ranks (suit-independent). */
function adjacent(a, b) {
    const d = Math.abs(a - b);
    return d === 1 || (ACE_KING_ADJACENT && d === 12);
}

/** Can `card` be played onto the waste pile? */
function canPlayOn(top, card) {
    return !top || adjacent(top.r, card.r);
}

/** Points for a card played from the tableau onto the waste pile. */
function scorePlay(state, card) {
    state.meta.streak += 1;                        // 1st = 10, 2nd = 20, 3rd = 30 …
    state.meta.score += STEP_POINTS * state.meta.streak;

    if (TABLEAU.every(id => state.piles[id].length === 0)) {
        state.meta.score += CLEAR_BONUS;
    }
}

const layout = {
    // stock: fan of face-down cards, left to right, top card on the right
    stock: {
        x: 0.1, y: 0, anchor: 'bottom', fan: 'right-23', spread: 0.25,
        jitter: false, type: 'stock',
    },
    waste: { x: 8.3, y: 0, anchor: 'bottom', fan: 'none', type: 'waste' },
};
for (const id of TABLEAU) {
    const { r, x } = POS[id];
    layout[id] = {
        x: x * UNIT_X,
        y: r * ROW_Y,
        z: r * Z_PER_ROW,
        fan: 'none',
        jitter: false,
        noSlot: true,                    // empty tableau slots are not drawn
        type: 'tableau',
    };
}

const tripeaks = {
    id: 'tripeaks',
    name: 'Tri Peaks',
    layout,
    scoring: true,                      // shows the score indicator

    deal(state, rng) {
        const cards = shuffle(makeDeck(1), rng);
        TABLEAU.forEach((id, i) => {
            cards[i].up = true;
            state.piles[id].push(cards[i]);
        });

        const rest = cards.slice(TABLEAU.length);
        const first = rest.pop();                      // first waste card (free)
        first.up = true;
        state.piles.waste.push(first);

        for (const c of rest) c.up = false;
        state.piles.stock = rest;                      // top of stock = last element

        state.meta.score = 0;
        state.meta.streak = 0;
    },

    // Only an exposed tableau card can be dragged onto the waste pile
    canDrag(state, pile) {
        return TABLEAU.includes(pile) && exposed(state, pile);
    },

    canDrop(state, cards, toPile) {
        if (toPile !== 'waste' || cards.length !== 1) return false;
        return canPlayOn(lastOf(state.piles.waste), cards[0]);
    },

    // Scoring for a card dragged onto the waste pile (Game.move)
    onMove(state, { from, moved }) {
        if (TABLEAU.includes(from)) scorePlay(state, moved[0]);
    },

    // Click: draw from the stock, or play a tableau card onto the waste pile
    onClick(state, pile) {
        const { stock, waste } = state.piles;

        if (pile === 'stock') {
            if (stock.length === 0) return false;
            const c = stock.pop();
            c.up = true;
            waste.push(c);
            state.meta.streak = 0;                       // a new streak starts
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
            scorePlay(state, card);
            return true;
        }
        return false;
    },

    canDeal(state) {
        return state.piles.stock.length > 0;
    },

    // Won once every tableau pile is empty
    isWon(state) {
        return TABLEAU.every(id => state.piles[id].length === 0);
    },

    // Lost when the stock is empty and no exposed card can be played
    isLost(state) {
        if (state.piles.stock.length > 0) return false;
        const top = lastOf(state.piles.waste);
        return !TABLEAU.some(id =>
        state.piles[id].length > 0
        && exposed(state, id)
        && canPlayOn(top, state.piles[id][0])
        );
    },
};

export default tripeaks;
