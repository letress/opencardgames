/*
 * kpat-web – webová verze KPatience (kpat)
 * Odvozeno z KDE KPatience (klondike.cpp): https://github.com/KDE/kpat
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

import { makeDeck, shuffle, KING, SPADES, HEARTS, DIAMONDS, CLUBS } from '../engine/state.js';
import {
    canStack, isSequence, canGoToSuitFoundation, sequenceStart, isRed,
} from '../engine/rules.js';

// talon -> stock, pile -> waste, target[i] -> f0..f3, play[i] -> t0..t6
const FOUNDATIONS = ['f0', 'f1', 'f2', 'f3'];
const TABLEAU = ['t0', 't1', 't2', 't3', 't4', 't5', 't6'];
const ALT = { color: 'alternate' };

const isFoundation = id => id[0] === 'f';
const isTableau = id => id[0] === 't';

/** Vrchní hodnota foundation dané barvy (0 = žádná karta). */
function foundationRank(state, suit) {
    for (const f of FOUNDATIONS) {
        const p = state.piles[f];
        if (p.length && p[0].s === suit) return p[p.length - 1].r;
    }
    return 0;
}

/**
 * ZÁSTUPNÉ pravidlo „bezpečného“ odložení (originál bere prioritu z řešiče patsolve):
 * esa a dvojky vždy, ostatní až když obě foundation opačné barvy dosáhly aspoň r - 1.
 */
function isSafeToDrop(state, card) {
    if (card.r <= 2) return true;
    const other = isRed(card.s) ? [SPADES, CLUBS] : [HEARTS, DIAMONDS];
    return other.every(s => foundationRank(state, s) >= card.r - 1);
}

/**
 * @param {number} draw  1 = Draw 1 (easyRules), 3 = Draw 3
 */
export function createKlondike(draw = 1) {
    const easyRules = draw === 1;

    const H = 1 / 6 + 0.02;   // hspacing z klondike.cpp
    const V = 0.25;           // vspacing z klondike.cpp

    const layout = {
        stock: { x: 0, y: 0, fan: 'none', type: 'stock' },
        // waste: vějíř jen z posledních `draw` karet, posun 0,33 šířky karty
        waste: { x: 1 + H, y: 0, fan: `right-${draw}`, spread: 0.33, type: 'waste' },
    };
    FOUNDATIONS.forEach((id, i) => {
        layout[id] = { x: (3 + i) * (1 + H), y: 0, fan: 'none', type: 'foundation' };
    });
    TABLEAU.forEach((id, i) => {
        layout[id] = {
            x: (1 + H) * i, y: 1 + V, fan: 'down', type: 'tableau', bottomPadding: 1.4,
        };
    });

    return {
        id: easyRules ? 'klondike' : 'klondike3',
        name: easyRules ? 'Klondike (Draw 1)' : 'Klondike (Draw 3)',
        layout,

        // Klondike::restart(): kola 0..6, sloupce i = round..6, karty z konce
        deal(state, rng) {
            const cards = shuffle(makeDeck(1), rng);
            for (let round = 0; round < 7; round++) {
                for (let i = round; i < 7; i++) {
                    const c = cards.pop();
                    c.up = i === round;
                    state.piles['t' + i].push(c);
                }
            }
            for (const c of cards) c.up = false;   // zbytek do talonu ve stejném pořadí
            state.piles.stock = cards;             // vrchol talonu = poslední prvek
        },

        // Klondike::checkRemove()
        canDrag(state, pile, idx) {
            const p = state.piles[pile];
            if (pile === 'stock') return false;
            if (pile === 'waste') return idx === p.length - 1;
            if (isFoundation(pile)) return easyRules && idx === p.length - 1;
            return isSequence(p.slice(idx), ALT);   // alternate color descending
        },

        // Klondike::checkAdd()
        canDrop(state, cards, toPile) {
            const dest = state.piles[toPile];
            const first = cards[0];
            if (isFoundation(toPile)) {
                return cards.length === 1 && canGoToSuitFoundation(first, dest);
            }
            if (isTableau(toPile)) {
                if (dest.length === 0) return first.r === KING;
                const onto = dest[dest.length - 1];
                return onto.up && canStack(first, onto, ALT);
            }
            return false;   // waste a stock nepřijímají karty
        },

        // Klondike::newCards()
        onClick(state, pile) {
            if (pile !== 'stock') return false;
            const { stock, waste } = state.piles;
            if (stock.length === 0 && waste.length <= 1) return false;

            if (stock.length === 0) {
                // vše z odkládací hromádky zpět do talonu (flipCardsToPile)
                while (waste.length > 0) {
                    const c = waste.pop();
                    c.up = false;
                    stock.push(c);
                }
            } else {
                // talon->topCards(cardsToShow) -> odkládací hromádka
                const n = Math.min(draw, stock.length);
                const taken = stock.splice(stock.length - n, n);
                for (let i = n - 1; i >= 0; i--) {
                    taken[i].up = true;
                    waste.push(taken[i]);
                }
            }
            return true;
        },

        // signál newCardsPossible
        canDeal(state) {
            return state.piles.stock.length > 0 || state.piles.waste.length > 1;
        },

        autoMove(state, pile, idx) {
            const p = state.piles[pile];
            if (idx !== p.length - 1 || isFoundation(pile)) return null;
            const card = p[idx];
            return FOUNDATIONS.find(f => canGoToSuitFoundation(card, state.piles[f])) || null;
        },

        // Kandidáti pro automatické odkládání (DealerScene::drop)
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
                if (!card.up || !isSafeToDrop(state, card)) continue;
                const to = FOUNDATIONS.find(f => canGoToSuitFoundation(card, state.piles[f]));
                if (to) out.push({ ...s, to });
            }
            return out.sort((a, b) => state.piles[a.from][a.idx].r - state.piles[b.from][b.idx].r);
        },

        // Klondike::drop(): po odložení poslední karty z odkládací hromádky se dobere nová
        afterDrop(state, { from }) {
            if (from === 'waste' && state.piles.waste.length === 0) this.onClick(state, 'stock');
        },

        // setAutoTurnTop(true) u sloupců
        afterMove(state) {
            for (const id of TABLEAU) {
                const p = state.piles[id];
                if (p.length > 0 && !p[p.length - 1].up) p[p.length - 1].up = true;
            }
        },

        isWon(state) {
            return FOUNDATIONS.reduce((n, f) => n + state.piles[f].length, 0) === 52;
        },

        // Zjednodušený tip. Originál používá KlondikeSolver (patsolve), který zatím nemáme.
        hint(state) {
            const def = this;
            const sources = [];
            const w = state.piles.waste;
            if (w.length) sources.push({ from: 'waste', idx: w.length - 1 });
            for (const t of TABLEAU) {
                const p = state.piles[t];
                for (let i = sequenceStart(p, ALT); i < p.length; i++) {
                    if (i === 0 && p[0].r === KING) continue;
                    sources.push({ from: t, idx: i });
                }
            }
            for (const s of sources) {
                const cards = state.piles[s.from].slice(s.idx);
                for (const to of [...FOUNDATIONS, ...TABLEAU]) {
                    if (to !== s.from && def.canDrop(state, cards, to)) return { ...s, to };
                }
            }
            if (def.canDeal(state)) return { from: 'stock', idx: -1, to: null };
            return null;
        },
    };
}

export const klondikeDraw1 = createKlondike(1);
export const klondikeDraw3 = createKlondike(3);
export default klondikeDraw1;
