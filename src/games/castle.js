/*
 * kpat-web – webová verze KPatience (kpat)
 * Odvozeno z KDE KPatience (castle.cpp): https://github.com/KDE/kpat
 * Implementuje výchozí předvolbu "Beleaguered Castle" (jediný balíček,
 * esa rovnou na základny, bez volných buněk) — ostatní přednastavení
 * v originále mění jen tyto parametry (volné buňky, pravidlo pro
 * prázdný sloupec…), zde je pro přehlednost jedna pevná varianta.
 *
 * Copyright 2021 Michael Lang <criticaltemp@protonmail.com>
 * Úpravy a přepis do JavaScriptu: autoři kpat-web
 *
 * License of original code:
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
import { isSequence, canGoToSuitFoundation } from '../engine/rules.js';

const FOUNDATIONS = ['f0', 'f1', 'f2', 'f3'];
const TABLEAU = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'];
const ANY_SUIT_DOWN = { color: 'any' };

const DIST_X = 1.11;

const isFoundation = id => id[0] === 'f';
const isTableau = id => id[0] === 't';

/**
 * Castle::canPutStore() — bez volných buněk (reserves = 0): nejvýš 2^frees
 * karet najednou, kde frees je počet prázdných sloupců kromě cíle.
 * Prázdný sloupec přijme cokoli (emptyStackFill = "Any"); jinak jen kartu
 * o jednu hodnotu nižší, barva/barevnost nerozhoduje (sequenceBuiltBy = "Rank").
 */
function canPutStore(state, cards, toPile) {
    const dest = state.piles[toPile];

    let frees = 0;
    for (const id of TABLEAU) if (id !== toPile && state.piles[id].length === 0) frees++;
    if (cards.length > 1 << frees) return false;

    if (dest.length === 0) return true;
    return cards[0].r === dest[dest.length - 1].r - 1;
}

const NARROW_BREAKPOINT = 700;   // stejný práh jako obecný "compact" režim v app.css

/**
 * Osm sloupců v jedné řadě je na úzké obrazovce zbytečně stísněné (karty by
 * se zmenšily, aby se vlezly na šířku, a zbyl by nevyužitý prostor pod nimi) —
 * proto se na mobilu tableau rozdělí do dvou řad po čtyřech, podobně jako
 * originální kpat dělá svůj "Modern" layout dvěma sloupci vedle sebe.
 */
function buildLayout(narrow) {
    const layout = {};
    // základny se roztáhnou přes stejnou šířku, jakou pod nimi zabírá tableau
    // (8 sloupců v řadě na šířku, nebo jen 4 na úzké obrazovce)
    const foundationSpan = (narrow ? 3 : 7) * DIST_X;
    FOUNDATIONS.forEach((id, i) => {
        layout[id] = { x: i * foundationSpan / 3, y: 0, fan: 'none', type: 'foundation' };
    });
    TABLEAU.forEach((id, i) => {
        const col = narrow ? i % 4 : i;
        const row = narrow ? Math.floor(i / 4) : 0;
        layout[id] = {
            x: DIST_X * col,
            // mezera mezi oběma řadami musí počítat s tím, že sloupec typicky
            // naroste nad počátečních 6 karet (karty se při hře nezmenšují),
            // jinak by si delší sloupec v první řadě "sáhl" do druhé
            y: row === 0 ? 1.1 : 1.1 + 3.2,
            fan: 'down',
            bottomPadding: 1.75,
            depth: { down: 0, up: 6 },
            type: 'tableau',
        };
    });
    return layout;
}

const castle = {
    id: 'castle',
    name: 'Castle',
    get layout() {
        return buildLayout(typeof window !== 'undefined' && window.innerWidth <= NARROW_BREAKPOINT);
    },
    dealOrigin: { x: 3.5 * DIST_X, y: -2 },

    // Castle::restart(): esa jdou rovnou na základny, zbylých 48 karet
    // (lícem nahoru) se rozdá postupně do osmi sloupců — přesně 6 na každý.
    deal(state, rng) {
        const cards = shuffle(makeDeck(1), rng);

        for (let i = cards.length - 1; i >= 0; i--) {
            if (cards[i].r === ACE) {
                const [ace] = cards.splice(i, 1);
                ace.up = true;
                state.piles[`f${ace.s}`].push(ace);
            }
        }

        cards.forEach((c, i) => {
            c.up = true;
            state.piles[TABLEAU[i % TABLEAU.length]].push(c);
        });
    },

    // Castle::checkRemove(): z tableau jde táhnout jen sestupná řada podle
    // hodnoty (barva/barevnost nerozhoduje); ze základny vždy jen vrchní karta.
    canDrag(state, pile, idx) {
        const p = state.piles[pile];
        if (isFoundation(pile)) return idx === p.length - 1;
        if (isTableau(pile)) return isSequence(p.slice(idx), ANY_SUIT_DOWN);
        return false;
    },

    // Castle::checkAdd()
    canDrop(state, cards, toPile) {
        if (isFoundation(toPile)) {
            return cards.length === 1 && canGoToSuitFoundation(cards[0], state.piles[toPile]);
        }
        if (isTableau(toPile)) return canPutStore(state, cards, toPile);
        return false;
    },

    // DealerScene::tryAutomaticMove(): dvojklik pošle vrchní kartu na základnu
    autoMove(state, pile, idx) {
        const p = state.piles[pile];
        if (isFoundation(pile) || idx !== p.length - 1) return null;
        const card = p[idx];
        const f = `f${card.s}`;
        return canGoToSuitFoundation(card, state.piles[f]) ? f : null;
    },

    isWon(state) {
        return FOUNDATIONS.reduce((n, f) => n + state.piles[f].length, 0) === 52;
    },
};

export default castle;
