/*
 * kpat-web – webová verze KPatience (kpat)
 * Hra Pyramids: původní implementace autorů kpat-web (není převzata z KDE KPatience).
 *
 * Tento program je svobodný software; můžete jej šířit a/nebo upravovat
 * podle podmínek GNU General Public License, vydané Free Software Foundation,
 * a to buď ve verzi 2, nebo (podle vašeho uvážení) kterékoli pozdější verze.
 * Program je šířen BEZ JAKÉKOLI ZÁRUKY. Viz soubor LICENSE.
 */

import { makeDeck, shuffle } from '../engine/state.js';

const ROUNDS = 3;                 // hra má tři kola
const ACE_KING_ADJACENT = true;   // eso navazuje na krále (… Q, K, A, 2 …)
const DRAW_COST = 5;              // dobrání karty z pořadače
const STEP_POINTS = 5;            // 1. karta série 5, 2. karta 10, 3. karta 15 …
const JOKER_COST = 50;            // položení žolíka
const ROUND_BONUS = 50;           // bonus za dokončené kolo (všechny karty z pyramid pryč)

const UNIT_X = 1.03;              // vodorovná jednotka (šířka karty + malá mezera)
const ROW_Y = 0.585;              // svislý odstup řad v násobcích výšky karty
const Z_PER_ROW = 20;             // nižší řady leží přes vyšší

// Pyramidy: x jsou v půlkrocích (karta v řadě r je překryta kartami o ±0,5 níže)
const ROWS = [
    { prefix: 'a', xs: [1.5, 4.5, 7.5] },
{ prefix: 'b', xs: [1, 2, 4, 5, 7, 8] },
{ prefix: 'c', xs: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5] },
{ prefix: 'd', xs: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
];

const PYRAMID = [];
const POS = {};
ROWS.forEach((row, r) => {
    row.xs.forEach((x, k) => {
        const id = row.prefix + k;
        PYRAMID.push(id);
        POS[id] = { r, x };
    });
});

// Které hromádky překrývají danou kartu
const COVERS = {};
for (const id of PYRAMID) {
    const { r, x } = POS[id];
    COVERS[id] = r < ROWS.length - 1
    ? ROWS[r + 1].xs
    .map((x2, k) => ({ id: ROWS[r + 1].prefix + k, x2 }))
    .filter(o => Math.abs(o.x2 - x) === 0.5)
    .map(o => o.id)
    : [];
}

const isPyramid = id => /^[abcd]\d/.test(id);
const lastOf = arr => arr[arr.length - 1];

/** Je karta hratelná (nic ji už nepřekrývá)? */
function exposed(state, id) {
    return COVERS[id].every(c => state.piles[c].length === 0);
}

/** Sousední hodnoty (nezávisle na barvě). */
function adjacent(a, b) {
    const d = Math.abs(a - b);
    return d === 1 || (ACE_KING_ADJACENT && d === 12);
}

/** Smí karta na odkládací hromádku? Žolík je „divoký“ na obě strany. */
function canPlayOn(top, card) {
    if (!top || top.joker || card.joker) return true;
    return adjacent(top.r, card.r);
}

/** Body za kartu položenou na odkládací hromádku. */
function scorePlay(state, from, card) {
    if (card.joker) {
        state.meta.score -= JOKER_COST;               // série se nemění
        return;
    }
    if (isPyramid(from)) {
        state.meta.streak += 1;                        // 1. = 5, 2. = 10, 3. = 15 …
        state.meta.score += STEP_POINTS * state.meta.streak;

        // poslední karta pyramid: kolo je dokončeno, bonus navíc
        if (PYRAMID.every(id => state.piles[id].length === 0)) {
            state.meta.score += ROUND_BONUS;
        }
    }
}

const layout = {
    // pořadač: vějíř rubů zleva doprava, vrchní karta je vpravo
    stock: {
        x: 0.1, y: 0, anchor: 'bottom', fan: 'right-23', spread: 0.25,
        jitter: false, type: 'stock',
    },
    waste: { x: 7.2, y: 0, anchor: 'bottom', fan: 'none', type: 'waste' },
    joker: { x: 8.7, y: 0, anchor: 'bottom', fan: 'none', jitter: false, type: 'joker' },
};
for (const id of PYRAMID) {
    const { r, x } = POS[id];
    layout[id] = {
        x: x * UNIT_X,
        y: r * ROW_Y,
        z: r * Z_PER_ROW,
        fan: 'none',
        jitter: false,
        noSlot: true,                    // prázdná místa pyramid se nekreslí
        type: 'pyramid',
    };
}

const pyramids = {
    id: 'pyramids',
    name: 'Pyramids',
    layout,
    noUndo: true,                      // žádný krok zpět ani vpřed
    scoring: true,                     // zobrazuje se skóre
    rounds: ROUNDS,                    // počet kol hry

    deal(state, rng) {
        const cards = shuffle(makeDeck(1), rng);
        PYRAMID.forEach((id, i) => {
            cards[i].up = true;
            state.piles[id].push(cards[i]);
        });

        const rest = cards.slice(PYRAMID.length);
        const first = rest.pop();                      // první karta odkládací hromádky (zdarma)
        first.up = true;
        state.piles.waste.push(first);

        for (const c of rest) c.up = false;
        state.piles.stock = rest;                      // vrchol pořadače = poslední prvek

        state.piles.joker.push({ id: 52, s: 4, r: 0, up: true, joker: true });

        state.meta.score = 0;
        state.meta.streak = 0;
        state.meta.round = 1;
    },

    // Co se přenáší do dalšího kola (Game.nextRound)
    carryOver(state) {
        return { score: state.meta.score, round: (state.meta.round ?? 1) + 1 };
    },

    // Přetahovat lze hratelnou kartu z pyramidy a žolíka
    canDrag(state, pile) {
        if (pile === 'joker') return state.piles.joker.length > 0;
        if (isPyramid(pile)) return exposed(state, pile);
        return false;
    },

    canDrop(state, cards, toPile) {
        if (toPile !== 'waste' || cards.length !== 1) return false;
        return canPlayOn(lastOf(state.piles.waste), cards[0]);
    },

    // Bodování přetažené karty (Game.move)
    onMove(state, { from, to, moved }) {
        if (to === 'waste') scorePlay(state, from, moved[0]);
    },

    // Kliknutí: dobrání z pořadače, nebo zahrání karty / žolíka na odkládací hromádku
    onClick(state, pile) {
        const { stock, waste } = state.piles;

        if (pile === 'stock') {
            if (stock.length === 0) return false;
            const c = stock.pop();
            c.up = true;
            waste.push(c);
            state.meta.score -= DRAW_COST;
            state.meta.streak = 0;                       // série začíná znovu
            return true;
        }

        if (pile === 'joker' || isPyramid(pile)) {
            const p = state.piles[pile];
            if (p.length === 0) return false;
            if (isPyramid(pile) && !exposed(state, pile)) return false;
            const card = lastOf(p);
            if (!canPlayOn(lastOf(waste), card)) return false;
            p.pop();
            card.up = true;
            waste.push(card);
            scorePlay(state, pile, card);
            return true;
        }
        return false;
    },

    canDeal(state) {
        return state.piles.stock.length > 0;
    },

    // Kolo je dokončeno, když v pyramidách nezůstala žádná karta
    isWon(state) {
        return PYRAMID.every(id => state.piles[id].length === 0);
    },

    // Hra končí, když nelze udělat žádný tah (ani s žolíkem); prázdná pyramida je výhra, ne uvíznutí
    isLost(state) {
        if (PYRAMID.every(id => state.piles[id].length === 0)) return false;
        if (state.piles.stock.length > 0 || state.piles.joker.length > 0) return false;
        const top = lastOf(state.piles.waste);
        return !PYRAMID.some(id =>
        state.piles[id].length > 0
        && exposed(state, id)
        && canPlayOn(top, state.piles[id][0])
        );
    },
};

export default pyramids;
