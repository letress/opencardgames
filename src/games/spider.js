/*
 * kpat-web – a web version of KPatience (kpat)
 * Odvozeno z KDE KPatience (spider.cpp): https://github.com/KDE/kpat
 *
 * Copyright (C) 2003 Josh Metzler <joshdeb@metzlers.org>
 * Copyright (C) 2000-2009 Stephan Kulow <coolo@kde.org>
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

import { makeDeck, shuffle, SPADES, HEARTS, DIAMONDS, CLUBS } from '../engine/state.js';
import { isSequence, isOneLower, isCompleteDescendingRun } from '../engine/rules.js';

// stack[i] -> t0..t9, legs[i] -> g0..g7 (8 legs — a spider has 8 legs)
const TABLEAU = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9'];
const LEGS = ['g0', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'];
const SAME_SUIT = { color: 'same' };
const TOTAL_CARDS = 104;   // two decks

const DIST_X = 1.03;

const isTableau = id => id[0] === 't';

/** Card A may be dropped onto card B: any rank is fine, it only needs to be one lower — suit doesn't matter. */
function canPlaceOnTableau(state, cards, toPile) {
    const dest = state.piles[toPile];
    if (dest.length === 0) return true;
    const top = dest[dest.length - 1];
    return top.up && isOneLower(cards[0], top);
}

// Suit variants mirror kpat's own "Spider (N Suit)" options — 3-suit skipped since it
// relies on an uneven suit split (one suit doubled) that doesn't fit the generic deck
// builder here, and most other implementations only offer 1/2/4 anyway.
const SUIT_SETS = {
    1: [SPADES],
    2: [HEARTS, SPADES],
    4: [SPADES, HEARTS, DIAMONDS, CLUBS],
};

/** @param {1|2|4} suitCount */
export function createSpider(suitCount) {
    const layout = {
        // 50 remaining cards; one card is dealt face up onto each column per click
        stock: {
            x: 0, y: 0, fan: 'right-5', spread: 0.22, jitter: false, type: 'stock',
        },
    };
    LEGS.forEach((id, i) => {
        layout[id] = {
            x: 2.1 + i * 0.3, y: 0, fan: 'none', jitter: false, noSlot: true, type: 'foundation',
        };
    });
    TABLEAU.forEach((id, i) => {
        layout[id] = {
            x: DIST_X * i,
            y: 1.2,
            fan: 'down',
            bottomPadding: 1.75,
            depth: { down: 5, up: 10 },
            type: 'tableau',
        };
    });

    return {
        id: `spider${suitCount}`,
        name: `Spider (${suitCount} Suit)`,
        layout,
        dealOrigin: { x: 4.5 * DIST_X, y: -2 },

        // Spider::restart(): 44 cards face down (5 to the first 4 columns, 4 to the rest),
        // then one face-up card per column, then the remaining 50 cards become the stock.
        deal(state, rng) {
            const cards = shuffle(makeDeck(2, SUIT_SETS[suitCount]), rng);

            for (let i = 0; i < 44; i++) {
                const c = cards.pop();
                c.up = false;
                state.piles[TABLEAU[i % 10]].push(c);
            }
            for (let i = 0; i < 10; i++) {
                const c = cards.pop();
                c.up = true;
                state.piles[TABLEAU[i % 10]].push(c);
            }

            for (const c of cards) c.up = false;
            state.piles.stock = cards;   // top of stock = last element
        },

        // Spider::checkRemove(): only a same-suit descending run may be dragged
        canDrag(state, pile, idx) {
            if (!isTableau(pile)) return false;
            return isSequence(state.piles[pile].slice(idx), SAME_SUIT);
        },

        // Spider::checkAdd(): any rank is fine as long as it's exactly one lower — suit is irrelevant
        canDrop(state, cards, toPile) {
            return isTableau(toPile) && canPlaceOnTableau(state, cards, toPile);
        },

        // Spider::newCards(): deal one card face up onto every column, until the stock runs out
        onClick(state, pile) {
            if (pile !== 'stock' || state.piles.stock.length === 0) return false;
            for (const id of TABLEAU) {
                const c = state.piles.stock.pop();
                c.up = true;
                state.piles[id].push(c);
            }
            return true;
        },

        canDeal(state) {
            return state.piles.stock.length > 0;
        },

        // double-click: send a draggable run to the first tableau column that accepts it
        autoMove(state, pile, idx) {
            if (!isTableau(pile)) return null;
            const cards = state.piles[pile].slice(idx);
            return TABLEAU.find(to => to !== pile && canPlaceOnTableau(state, cards, to)) || null;
        },

        // Spider::cardsMoved() + moveFullRunToLeg(): a completed King-to-Ace run is swept off
        // the table automatically, and the card newly exposed underneath is turned face up
        // (setAutoTurnTop(true)).
        afterMove(state) {
            for (const id of TABLEAU) {
                const p = state.piles[id];
                if (p.length < 13) continue;
                const run = p.slice(-13);
                if (!isCompleteDescendingRun(run)) continue;
                const leg = LEGS.find(l => state.piles[l].length === 0);
                if (!leg) continue;
                p.splice(p.length - 13, 13);
                state.piles[leg].push(...run);
            }
            for (const id of TABLEAU) {
                const p = state.piles[id];
                if (p.length && !p[p.length - 1].up) p[p.length - 1].up = true;
            }
        },

        isWon(state) {
            return LEGS.reduce((n, l) => n + state.piles[l].length, 0) === TOTAL_CARDS;
        },
    };
}

export const spiderOneSuit = createSpider(1);
export const spiderTwoSuit = createSpider(2);
export const spiderFourSuit = createSpider(4);
export default spiderTwoSuit;
