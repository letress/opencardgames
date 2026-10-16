/*
 * kpat-web – webová verze KPatience (kpat)
 * Odvozeno z KDE KPatience (grandf.cpp): https://github.com/KDE/kpat
 *
 * Copyright (C) 1995 Paul Olav Tvete <paul@troll.no>
 * Copyright (C) 2000-2009 Stephan Kulow <coolo@kde.org>
 * Copyright (C) 2010 Parker Coates <coates@kde.org>
 * Úpravy a přepis do JavaScriptu: autoři kpat-web
 *
 * License of original code:
 * -------------------------------------------------------------------------
 *   Permission to use, copy, modify, and distribute this software and its
 *   documentation for any purpose and without fee is hereby granted,
 *   provided that the above copyright notice appear in all copies and that
 *   both that copyright notice and this permission notice appear in
 *   supporting documentation.
 *
 *   This file is provided AS IS with no warranties of any kind.  The author
 *   shall have no liability with respect to the infringement of copyrights,
 *   trade secrets or any patents by this file or any part thereof.  In no
 *   event will the author be liable for any lost revenue or profits or
 *   other special, indirect and consequential damages.
 * -------------------------------------------------------------------------
 *
 * License of modifications/additions made after 2009-01-01:
 * -------------------------------------------------------------------------
 *   This program is free software; you can redistribute it and/or
 *   modify it under the terms of the GNU General Public License as
 *   published by the Free Software Foundation; either version 2 of
 *   the License, or (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * -------------------------------------------------------------------------
 */

import { makeDeck, shuffle, ACE, KING } from '../engine/state.js';
import { canStack } from '../engine/rules.js';

// target[i] -> f0..f3, store[i] -> t0..t6
const FOUNDATIONS = ['f0', 'f1', 'f2', 'f3'];
const STORE = ['t0', 't1', 't2', 't3', 't4', 't5', 't6'];
const SAME_SUIT = { color: 'same' };
const MAX_DEALS = 3;                       // numberOfDeals >= 3 => redeal není možný

const DIST_X = 1.4;
const TARGET_OFFSET = 1.5 * DIST_X;

const isFoundation = id => id[0] === 'f';
const isTableau = id => id[0] === 't';

/** Grandf::deal(): hadovitý vzor, karty se berou z konce pole. */
function dealCards(state, cards) {
    let start = 0;
    let stop = 7 - 1;
    let dir = 1;

    for (let round = 0; round < 7; round++) {
        let i = start;
        do {
            if (cards.length > 0) {
                const c = cards.pop();
                c.up = i === start;
                state.piles[STORE[i]].push(c);
            }
            i += dir;
        } while (i !== stop + dir);
        const t = start;
        start = stop;
        stop = t + dir;
        dir = -dir;
    }

    let i = 0;
    while (cards.length > 0) {
        const c = cards.pop();
        c.up = true;
        state.piles[STORE[i + 1]].push(c);
        i = (i + 1) % 6;
    }

    for (const id of STORE) {
        const p = state.piles[id];
        if (p.length > 0) p[p.length - 1].up = true;
    }
}

/** checkAddSameSuitAscendingFromAce() – pileutils.cpp jsem neviděl, chování je odhad. */
function canAddToFoundation(cards, dest) {
    for (let i = 0; i < cards.length; i++) {
        if (!cards[i].up) return false;
        if (i > 0 && !(cards[i].s === cards[i - 1].s && cards[i].r === cards[i - 1].r + 1)) {
            return false;
        }
    }
    const first = cards[0];
    if (dest.length === 0) return first.r === ACE;
    const t = dest[dest.length - 1];
    return first.s === t.s && first.r === t.r + 1;
}

const layout = {};
FOUNDATIONS.forEach((id, i) => {
    layout[id] = { x: TARGET_OFFSET + i * DIST_X, y: 0, fan: 'none', type: 'foundation' };
});
STORE.forEach((id, i) => {
    layout[id] = { x: DIST_X * i, y: 1.2, fan: 'down', type: 'tableau', bottomPadding: 2.5 };
});

const grandfather = {
    id: 'grandfather',
    name: 'Grandfather',
    layout,
    dealOrigin: { x: DIST_X * 3, y: 1.2 },   // initPos v Grandf::deal()

    // Grandf::restart()
    deal(state, rng) {
        dealCards(state, shuffle(makeDeck(1), rng));
        state.meta.deals = 1;                  // numberOfDeals
    },

    // Grandf::checkRemove(): jen sloupce a jen odkrytá karta (i s kartami nad ní)
    canDrag(state, pile, idx) {
        return isTableau(pile) && state.piles[pile][idx].up;
    },

    // Grandf::checkAdd()
    canDrop(state, cards, toPile) {
        const dest = state.piles[toPile];
        const first = cards[0];
        if (isTableau(toPile)) {
            if (dest.length === 0) return first.r === KING;
            return canStack(first, dest[dest.length - 1], SAME_SUIT);
        }
        if (isFoundation(toPile)) return canAddToFoundation(cards, dest);
        return false;
    },

    // Grandf::newCards() – akce Redeal
    actions: {
        redeal(state) {
            if (state.meta.deals >= MAX_DEALS) return false;
            // POZNÁMKA z originálu: hromádky by se při sbírání měly „obracet“
            // (částečně převrátit); originál to také nedělá.
            const collected = [];
            for (let pos = 6; pos >= 0; pos--) {
                collected.push(...state.piles[STORE[pos]]);
                state.piles[STORE[pos]].length = 0;
            }
            dealCards(state, collected);
            state.meta.deals++;
            return true;
        },
    },

    // signál newCardsPossible
    canAction(state, name) {
        return name === 'redeal' && state.meta.deals < MAX_DEALS;
    },

    autoMove(state, pile, idx) {
        const p = state.piles[pile];
        if (!isTableau(pile) || idx !== p.length - 1) return null;
        const card = [p[idx]];
        return FOUNDATIONS.find(f => canAddToFoundation(card, state.piles[f])) || null;
    },

    // Kandidáti pro automatické odkládání (DealerScene::drop)
    dropCandidates(state) {
        const out = [];
        for (const t of STORE) {
            const p = state.piles[t];
            if (!p.length) continue;
            const idx = p.length - 1;
            const card = p[idx];
            if (!card.up) continue;
            const to = FOUNDATIONS.find(f => canAddToFoundation([card], state.piles[f]));
            if (to) out.push({ from: t, idx, to });
        }
        return out;
    },

    // setAutoTurnTop(true)
    afterMove(state) {
        for (const id of STORE) {
            const p = state.piles[id];
            if (p.length > 0 && !p[p.length - 1].up) p[p.length - 1].up = true;
        }
    },

    isWon(state) {
        return FOUNDATIONS.reduce((n, f) => n + state.piles[f].length, 0) === 52;
    },

    // Zjednodušený tip. Originál používá GrandfSolver (patsolve), který zatím nemáme.
    hint(state) {
        const def = this;
        for (const from of STORE) {
            const p = state.piles[from];
            for (let i = 0; i < p.length; i++) {
                if (!p[i].up) continue;
                if (i === 0 && p[0].r === KING) continue;                       // král na dně
                if (i > 0 && p[i - 1].up && canStack(p[i], p[i - 1], SAME_SUIT)) continue;
                const cards = p.slice(i);
                for (const to of [...FOUNDATIONS, ...STORE]) {
                    if (to !== from && def.canDrop(state, cards, to)) return { from, idx: i, to };
                }
            }
        }
        return null;
    },
};

export default grandfather;
