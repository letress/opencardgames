/*
 * kpat-web – webová verze KPatience (kpat)
 * Odvozeno z KDE KPatience: https://github.com/KDE/kpat
 *
 * Tento program je svobodný software; můžete jej šířit a/nebo upravovat
 * podle podmínek GNU General Public License, vydané Free Software Foundation,
 * a to buď ve verzi 2, nebo (podle vašeho uvážení) kterékoli pozdější verze.
 * Program je šířen BEZ JAKÉKOLI ZÁRUKY. Viz soubor LICENSE.
 * (Ověřte přesnou verzi licence v hlavičkách zdrojů kpat a hlavičku upravte.)
 */

// Barvy: 0 = piky, 1 = srdce, 2 = káry, 3 = kříže (shodně se SVG symboly s0..s3)
export const SPADES = 0, HEARTS = 1, DIAMONDS = 2, CLUBS = 3;
export const ACE = 1, JACK = 11, QUEEN = 12, KING = 13;

/**
 * Vytvoří seřazený balíček.
 * @param {number} decks  počet balíčků (1 nebo 2)
 * @param {number[]} suits  použité barvy (např. [0] pro Spider s jednou barvou)
 * Karta: {id, s, r, up}
 */
export function makeDeck(decks = 1, suits = [SPADES, HEARTS, DIAMONDS, CLUBS]) {
    const cards = [];
    let id = 0;
    const copies = decks * (4 / suits.length);
    for (let c = 0; c < copies; c++) {
        for (const s of suits) {
            for (let r = ACE; r <= KING; r++) {
                cards.push({ id: id++, s, r, up: false });
            }
        }
    }
    return cards;
}

/**
 * Deterministický generátor (mulberry32): stejné číslo rozdání = stejná hra.
 * POZOR: není shodný s generátorem KPatience, takže čísla rozdání se
 * neshodují s originálem. Chcete-li shodu, tuto funkci nahraďte
 * přepisem generátoru z kpat.
 */
export function createRng(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Náhodné číslo rozdání. */
export function randomSeed() {
    return Math.floor(Math.random() * 0x7fffffff) + 1;
}

/** Fisher–Yates; zamíchá pole na místě a vrátí je. */
export function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Prázdný stav hry.
 * piles: {idHromádky: Card[]}  (poslední prvek = vrchní karta)
 * meta:  libovolná data hry (počet redealů, počítadla, ...)
 */
export function createState(pileIds) {
    const piles = {};
    for (const id of pileIds) piles[id] = [];
    return { piles, meta: {} };
}

/** Hluboká kopie stavu (karty jsou malé objekty, stačí ruční klonování). */
export function cloneState(state) {
    const piles = {};
    for (const id in state.piles) {
        piles[id] = state.piles[id].map(c => ({ ...c }));
    }
    return { piles, meta: JSON.parse(JSON.stringify(state.meta)) };
}

/** Najde kartu podle id; vrací {pile, idx} nebo null. */
export function findCard(state, cardId) {
    for (const pile in state.piles) {
        const idx = state.piles[pile].findIndex(c => c.id === cardId);
        if (idx !== -1) return { pile, idx };
    }
    return null;
}

/** Vrchní karta hromádky (nebo undefined). */
export function top(state, pileId) {
    const p = state.piles[pileId];
    return p[p.length - 1];
}

/** Serializace pro localStorage. */
export function serialize(state) {
    return JSON.stringify(state);
}
export function deserialize(json) {
    return JSON.parse(json);
}

/**
 * Historie tahů (undo/redo) pomocí snímků stavu.
 * record(state) se volá PŘED provedením tahu.
 */
export class History {
    constructor(limit = 1000) {
        this.limit = limit;
        this.past = [];
        this.future = [];
    }
    record(state) {
        this.past.push(cloneState(state));
        if (this.past.length > this.limit) this.past.shift();
        this.future.length = 0;
    }
    get canUndo() { return this.past.length > 0; }
    get canRedo() { return this.future.length > 0; }
    undo(current) {
        if (!this.canUndo) return null;
        this.future.push(cloneState(current));
        return this.past.pop();
    }
    redo(current) {
        if (!this.canRedo) return null;
        this.past.push(cloneState(current));
        return this.future.pop();
    }
    clear() { this.past.length = 0; this.future.length = 0; }
}
