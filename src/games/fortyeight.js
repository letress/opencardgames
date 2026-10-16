/*
 * kpat-web – webová verze KPatience (kpat)
 * Odvozeno z KDE KPatience (fortyeight.cpp): https://github.com/KDE/kpat
 *
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

import { makeDeck, shuffle, ACE } from '../engine/state.js';
import { isSequence } from '../engine/rules.js';

// talon -> stock, pile -> waste, target[i] -> f0..f7, stack[i] -> t0..t7
const FOUNDATIONS = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'];
const TABLEAU = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'];
const SAME_SUIT = { color: 'same' };
const TOTAL_CARDS = 104;

const DIST_X = 1.11;

const isFoundation = id => id[0] === 'f';
const isTableau = id => id[0] === 't';

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

/** Fortyeight::canPutStore() */
function canPutStore(state, toPile, cards) {
    const dest = state.piles[toPile];

    let frees = 0;
    for (const id of TABLEAU) if (state.piles[id].length === 0) frees++;
    if (dest.length === 0) frees--;                 // cíl je prázdný

    if (cards.length > 1 << frees) return false;    // nejvýš 2^frees karet najednou

    if (dest.length === 0) return true;             // na prázdný sloupec cokoli

    const top = dest[dest.length - 1];
    const c = cards[0];                             // předpokládáme platnou posloupnost
    return top.s === c.s && top.r === c.r + 1;
}

/**
 * ZÁSTUPNÉ pravidlo „bezpečného“ odložení (originál bere prioritu z řešiče patsolve):
 * karta r se neodkládá, dokud kdekoli mimo foundation zbývá karta r - 1 stejné barvy
 * (ve hře jsou dvě kopie a ta druhá by na kartu r mohla potřebovat ležet).
 */
function isSafeToDrop(state, card) {
    if (card.r === ACE) return true;
    for (const id of Object.keys(state.piles)) {
        if (isFoundation(id)) continue;
        if (state.piles[id].some(c => c.s === card.s && c.r === card.r - 1)) return false;
    }
    return true;
}

const layout = {
    // talon a odkládací hromádka jsou ukotvené ke spodnímu okraji plochy
    stock: { x: 7 * DIST_X, y: 0, anchor: 'bottom', fan: 'none', type: 'stock' },
    // vějíř odkládací hromádky doleva (spread -0,21); kdyby přesáhl 6 sloupců, stlačí se
    waste: {
        x: 6 * DIST_X, y: 0, anchor: 'bottom', fan: 'right-200', spread: -0.21,
        fanLimit: 6 * DIST_X, type: 'waste',
    },
};
FOUNDATIONS.forEach((id, i) => {
    layout[id] = { x: DIST_X * i, y: 0, fan: 'none', type: 'foundation' };
});
TABLEAU.forEach((id, i) => {
    layout[id] = {
        x: DIST_X * i,
        y: 1.1,
        fan: 'down',
        spreadUp: 0.35,            // setSpread(0, 0.25) = 0,25 výšky karty = 0,35 šířky
                spreadDown: 0.35,
                bottomPadding: 1.75,
                depth: { down: 0, up: 6 },
                type: 'tableau',
    };
});

const fortyeight = {
    id: 'fortyeight',
    name: 'Forty & Eight',
    layout,
    // v originále karty přilétají shora nad svůj sloupec; zde z místa nad středem tableau
    dealOrigin: { x: 3.5 * DIST_X, y: -2 },

    // Fortyeight::restart()
    deal(state, rng) {
        const cards = shuffle(makeDeck(2), rng);

        for (let r = 0; r < 4; r++) {
            for (let col = 0; col < 8; col++) {
                const c = cards.pop();
                c.up = true;
                state.piles[TABLEAU[col]].push(c);
            }
        }

        for (const c of cards) c.up = false;     // zbytek do talonu ve stejném pořadí
        state.piles.stock = cards;               // vrchol talonu = poslední prvek

        const first = state.piles.stock.pop();   // flipCardToPile(talon->topCard(), pile)
        first.up = true;
        state.piles.waste.push(first);

        state.meta.lastdeal = false;
    },

    // Fortyeight::checkRemove()
    canDrag(state, pile, idx) {
        const p = state.piles[pile];
        if (pile === 'waste') return idx === p.length - 1;
        if (isTableau(pile)) return isSequence(p.slice(idx), SAME_SUIT);
        return false;                            // foundation a talon ne
    },

    // Fortyeight::checkAdd()
    canDrop(state, cards, toPile) {
        if (isFoundation(toPile)) return canAddToFoundation(cards, state.piles[toPile]);
        if (isTableau(toPile)) return canPutStore(state, toPile, cards);
        return false;
    },

    // Fortyeight::newCards()
    onClick(state, pile) {
        if (pile !== 'stock') return false;
        const { stock, waste } = state.piles;

        if (stock.length === 0) {
            if (state.meta.lastdeal) return false;          // jediné recyklování už proběhlo
            state.meta.lastdeal = true;
            while (waste.length > 0) {                      // flipCardsToPile(pile->cards(), talon)
                const c = waste.pop();
                c.up = false;
                stock.push(c);
            }
        } else {
            const c = stock.pop();                          // flipCardToPile(talon->topCard(), pile)
            c.up = true;
            waste.push(c);
        }
        return true;
    },

    // signál newCardsPossible
    canDeal(state) {
        return !state.meta.lastdeal || state.piles.stock.length > 0;
    },

    // DealerScene::tryAutomaticMove(): vrchní karta na foundation
    autoMove(state, pile, idx) {
        const p = state.piles[pile];
        if (isFoundation(pile) || pile === 'stock' || idx !== p.length - 1) return null;
        const card = [p[idx]];
        return FOUNDATIONS.find(f => canAddToFoundation(card, state.piles[f])) || null;
    },

    // Kandidáti pro automatické odkládání (DealerScene::drop)
    // Výjimka: ve Forty & Eight se odkládá hned, kdykoli je přesun na foundation možný.
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
            if (!card.up) continue;
            const to = FOUNDATIONS.find(f => canAddToFoundation([card], state.piles[f]));
            if (to) out.push({ ...s, to });
        }
        return out.sort((a, b) => state.piles[a.from][a.idx].r - state.piles[b.from][b.idx].r);
    },

    // DealerScene::isGameWon(): všechny karty jsou na foundation
    isWon(state) {
        return FOUNDATIONS.reduce((n, f) => n + state.piles[f].length, 0) === TOTAL_CARDS;
    },
};

export default fortyeight;
