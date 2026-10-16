/*
 * kpat-web – webová verze KPatience (kpat)
 * Odvozeno z KDE KPatience: https://github.com/KDE/kpat
 *
 * Tento program je svobodný software; můžete jej šířit a/nebo upravovat
 * podle podmínek GNU General Public License, vydané Free Software Foundation,
 * a to buď ve verzi 2, nebo (podle vašeho uvážení) kterékoli pozdější verze.
 * Program je šířen BEZ JAKÉKOLI ZÁRUKY. Viz soubor LICENSE.
 */

import { createCardEl, setFace, createSlotEl, installSprite } from './cards.js';
import {
    setPos, animateCard, celebrate, cancelAnim, visualPos, motionAllowed,
} from './anim.js';

const ASPECT = 1.4;          // výška / šířka karty
const PAD = 8;               // okraj plochy v px
const MIN_CW = 28;
const MAX_CW = 140;          // největší šířka karty v px

// Svislé odsazení ve sloupcích jako násobek ŠÍŘKY karty.
const FAN_UP = 0.33;         // běžné odsazení lícem nahoru (vždy vidět hodnota i symbol)
const FAN_DOWN = 0.13;       // běžné odsazení rubem nahoru
const MIN_UP = 0.08;         // nejmenší odsazení lícem nahoru (u přeplněného sloupce vyčnívá jen proužek)
const MIN_DOWN = 0.06;       // nejmenší odsazení rubem nahoru
const FAN_RIGHT = 0.22;      // výchozí vodorovný posun (násobek šířky karty)
const BOTTOM_GAP = 0.35;     // volné místo pod kartami (násobek šířky karty)
const BOTTOM_ROW = 1.1;      // výška dolní řady hromádek (násobek výšky karty, včetně mezery)
const DEFAULT_DEPTH = { down: 4, up: 6 };   // „běžný“ sloupec pro výpočet velikosti karet

// Karty, které leží přesně přes sebe (talon, odkládací hromádka, základny), mají drobnou
// stálou nesouosost, aby bylo vidět, že je to hromádka a ne jedna karta.
const JITTER_POS = 0.014;    // posunutí jako násobek šířky karty (asi 1,4 px při 100 px)
const JITTER_ROT = 1.1;      // naklonění ve stupních
const BURIED_DIST = 0.05;    // karta blíž než tolik (násobek šířky) k další je „zakrytá“

/** Stálé pseudonáhodné hodnoty odvozené z čísla karty (nemění se při dalších tazích). */
function jitterOf(id, cw) {
    const rnd = k => {
        const s = Math.sin((id + 1) * 12.9898 + k * 78.233) * 43758.5453;
        return (s - Math.floor(s)) * 2 - 1;     // -1 .. 1
    };
    const amp = cw * JITTER_POS;
    return { x: rnd(1) * amp, y: rnd(2) * amp, r: rnd(3) * JITTER_ROT };
}

function parseFan(fan = 'none') {
    if (fan.startsWith('right')) {
        const n = fan.includes('-') ? parseInt(fan.split('-')[1], 10) : 3;
        return { kind: 'right', n };
    }
    if (fan === 'down') return { kind: 'down' };
    return { kind: 'none' };
}

export class Board {
    /**
     * @param {HTMLElement} root  prvek #board; jeho rodič (.board-wrap) určuje dostupnou výšku
     * @param {import('../engine/game.js').Game} game
     */
    constructor(root, game) {
        this.root = root;
        this.viewport = root.parentElement || document.body;
        this.els = new Map();        // card.id -> element
        this.slots = new Map();      // pileId -> element
        this.targets = new Map();    // card.id -> {x, y, r?}
        this.pileRects = {};         // pileId -> {x, y, w, h} (oblast pro puštění karty)
        this.hintRects = {};         // pileId -> {x, y, w, h} (jen viditelná hromádka)
        this.m = { cw: 80, ch: 112, offX: PAD, availH: 600, reserve: 0 };
        this.celebration = null;
        this._raf = 0;
        this._dealToken = 0;
        this._pending = null;        // Promise probíhajícího „sbalení“ karet před rozdáním
        this._lw = 0;                // naposledy změřená šířka a výška
        this._lh = 0;

        installSprite();
        root.classList.add('board', 'instant');   // první vykreslení bez přechodu velikosti

        root.addEventListener('animationend', e => {
            if (e.target === root) root.classList.remove('entering');
        });

            this._onResize = () => {
                if (this._raf) return;
                this._raf = requestAnimationFrame(() => {
                    this._raf = 0;
                    // první zavolání ResizeObserveru a podobné „neskutečné“ změny se ignorují
                    if (this.root.clientWidth === this._lw && this.viewport.clientHeight === this._lh) return;
                    this.sync('resize');
                });
            };
            this._ro = typeof ResizeObserver === 'function' ? new ResizeObserver(this._onResize) : null;
            if (this._ro) this._ro.observe(this.viewport);
            else window.addEventListener('resize', this._onResize);

            this.setGame(game);

        requestAnimationFrame(() =>
        requestAnimationFrame(() => this.root.classList.remove('instant'))
        );
    }

    setGame(game) {
        if (this._unsub) this._unsub();
        this._dealToken++;
        this._pending = null;
        this.#stopCelebration();
        this.game = game;
        this.#resetDom();

        // jemné objevení nové plochy
        this.root.classList.remove('entering');
        void this.root.offsetWidth;
        this.root.classList.add('entering');

        this._unsub = game.subscribe(ev => this.#onEvent(ev));
        this.#startDeal();
    }

    destroy() {
        if (this._unsub) this._unsub();
        if (this._ro) this._ro.disconnect();
        else window.removeEventListener('resize', this._onResize);
        cancelAnimationFrame(this._raf);
        this._dealToken++;
        this.#stopCelebration();
    }

    /* ---------- události hry ---------- */

    #onEvent({ type, info }) {
    switch (type) {
        case 'start':
            this.#startDeal();
            break;
        case 'move':
            this.sync('move', (info && info.speed) || 1);   // automatické odložení je rychlejší
            break;
        case 'click':
        case 'undo':
        case 'redo':
            this.sync('move');
            break;
        case 'won':
            this.#startCelebration();
            break;
    }
    }

    /* ---------- DOM ---------- */

    #resetDom() {
    this.root.innerHTML = '';
    this.els.clear();
    this.slots.clear();
    this.targets.clear();
    this.pileRects = {};
    this.hintRects = {};
    for (const [id, cfg] of Object.entries(this.game.def.layout)) {
        const slot = createSlotEl(id, cfg.type);
        if (cfg.noSlot) slot.hidden = true;       // např. prázdná místa pyramid se nekreslí
        this.root.appendChild(slot);
        this.slots.set(id, slot);
    }
    }

    #resetCards() {
    for (const el of this.els.values()) {
        cancelAnim(el);
        el.remove();
    }
    this.els.clear();
    this.targets.clear();
    }

    #ensureCards() {
    for (const pile of Object.values(this.game.state.piles)) {
        for (const card of pile) {
            if (!this.els.has(card.id)) {
                const el = createCardEl(card);
                el._up = !!card.up;
                this.root.appendChild(el);
                this.els.set(card.id, el);
            }
        }
    }
    }

    #faceNow(el, card) {
    el._up = !!card.up;
    setFace(el, card.up);
    }

    /**
     * Nové rozdání: stávající karty se nejdřív sjedou na místo rozdání (a použijí se
     * znovu, nic se nemaže a nevytváří), pak se rozdají. Bez předchozích karet se jen rozdá.
     */
    #startDeal() {
    const token = ++this._dealToken;

    // po oslavě výhry jsou karty mimo obrazovku; začne se s čistým stolem
    if (this.celebration) {
        this.#stopCelebration();
        this.#resetCards();
    }

    // prvky, které nové rozdání nepotřebuje (jiný počet karet)
    const ids = new Set();
    for (const pile of Object.values(this.game.state.piles)) {
        for (const c of pile) ids.add(c.id);
    }
    for (const [id, el] of this.els) {
        if (!ids.has(id)) {
            cancelAnim(el);
            el.remove();
            this.els.delete(id);
            this.targets.delete(id);
        }
    }

    this.root.classList.add('dealing');                 // během rozdání nelze s kartami hýbat
    const finish = () => {
        this.whenIdle().then(() => {
            if (token === this._dealToken) this.root.classList.remove('dealing');
        });
    };

    if (!this.els.size || !motionAllowed()) {
        this.sync('deal');
        finish();
        return;
    }

    this.#measure();
    const from = this.#dealOrigin(Object.keys(this.game.def.layout));
    const els = [...this.els.values()];
    const starts = els.map(el => visualPos(el));        // všechna čtení před zápisy
    const gather = els.map((el, n) =>
    animateCard(el, from.x, from.y, {
        from: starts[n],
        duration: 240,
        delay: Math.min(n * 3, 120),
                lift: false,
    })
    );

    const pending = Promise.all(gather)
    .then(() => {
        if (token === this._dealToken) this.sync('deal');
    })
    .then(() => {
        if (this._pending === pending) this._pending = null;
        finish();
    });
    this._pending = pending;
    }

    /* ---------- rozměry a rozložení ---------- */

    #fanExtra(cfg) {
    const f = parseFan(cfg.fan);
    return f.kind === 'right' ? (f.n - 1) * (cfg.spread ?? FAN_RIGHT) : 0;
    }

    /**
     * Šířka karty = menší z hodnot, které se vejdou na šířku okna a na výšku
     * (při běžném sloupci a případné dolní řadě). Velikost NEZÁVISÍ na aktuálním
     * stavu hry, takže se karty při hře nezmenšují; přeplněný sloupec se jen sám
     * více překryje (viz #pilePositions).
     */
    #measure() {
    const layout = this.game.def.layout;
    let maxX = 1;
    let comfy = 0;           // potřebná výška (násobky šířky karty) při běžném sloupci
    let hasBottom = false;   // je ve hře hromádka ukotvená ke spodnímu okraji?

    for (const id in layout) {
        const cfg = layout[id];
        maxX = Math.max(maxX, cfg.x + 1 + this.#fanExtra(cfg));
        if (cfg.anchor === 'bottom') {
            hasBottom = true;
            continue;
        }
        const top = cfg.y * ASPECT + ASPECT;
        comfy = Math.max(comfy, top);

        if (parseFan(cfg.fan).kind === 'down') {
            const d = cfg.depth ?? DEFAULT_DEPTH;
            comfy = Math.max(
                comfy,
                top + d.down * (cfg.spreadDown ?? FAN_DOWN) + Math.max(0, d.up - 1) * (cfg.spreadUp ?? FAN_UP)
            );
        }
    }

    const bottomRow = hasBottom ? BOTTOM_ROW * ASPECT : 0;   // v násobcích šířky karty

    const rootW = this.root.clientWidth;
    const width = rootW || 800;
    const availH = this.viewport.clientHeight || window.innerHeight;
    const byW = (width - 2 * PAD) / maxX;
    const byComfy = (availH - 2 * PAD) / (comfy + bottomRow + BOTTOM_GAP);

    const cw = Math.max(MIN_CW, Math.min(MAX_CW, Math.floor(Math.min(byW, byComfy))));
    const ch = Math.round(cw * ASPECT);
    const offX = Math.max(PAD, Math.floor((width - maxX * cw) / 2));
    const reserve = hasBottom ? Math.round(BOTTOM_ROW * ch) : 0;   // místo pro dolní řadu

    this.m = { cw, ch, offX, availH, reserve };
    this._lw = rootW;
    this._lh = this.viewport.clientHeight;
    this.root.style.setProperty('--cw', cw + 'px');   // --ch se v CSS dopočítá
    }

    /** Levý horní roh hromádky v px (jednotky layoutu = šířky/výšky karty). */
    #slotXY(cfg) {
    const { cw, ch, offX, availH } = this.m;
    const x = offX + cfg.x * cw;
    // anchor: 'bottom' = spodní okraj karty u spodního okraje plochy (y je posun od něj)
    const y = cfg.anchor === 'bottom' ? availH - PAD - ch + cfg.y * ch : PAD + cfg.y * ch;
    return { x, y };
    }

    /** Pozice všech karet v hromádce ({x, y} a případně naklonění r ve stupních). */
    #pilePositions(cfg, pile) {
    const { cw, ch, availH } = this.m;
    const base = this.#slotXY(cfg);
    const fan = parseFan(cfg.fan);
    const jitter = cfg.jitter !== false;
    const out = [];

    if (fan.kind === 'down') {
        // odsazení platí za každou kartu kromě poslední
        let nUp = 0;
        let nDown = 0;
        for (let i = 0; i < pile.length - 1; i++) (pile[i].up ? nUp++ : nDown++);

        const U = (cfg.spreadUp ?? FAN_UP) * cw;
        const D = (cfg.spreadDown ?? FAN_DOWN) * cw;
        const minU = MIN_UP * cw;
        const minD = MIN_DOWN * cw;
        const room = availH - PAD - base.y - ch - BOTTOM_GAP * cw - this.m.reserve;

        let u = U;
        let d = D;
        if (nUp * U + nDown * D > room) {
            // 1. krok: stlačit rubové karty
            d = nDown ? Math.min(D, Math.max(minD, (room - nUp * U) / nDown)) : D;
            // 2. krok: stlačit i lícové karty
            if (nUp * U + nDown * d > room) {
                u = nUp ? Math.min(U, Math.max(minU, (room - nDown * d) / nUp)) : U;
            }
        }

        let y = base.y;
        for (let i = 0; i < pile.length; i++) {
            out.push({ x: base.x, y });
            y += pile[i].up ? u : d;
        }
    } else if (fan.kind === 'right') {
        let step = (cfg.spread ?? FAN_RIGHT) * cw;
        const shown = Math.min(pile.length, fan.n);
        const span = Math.max(0, shown - 1) * Math.abs(step);
        const limit = cfg.fanLimit != null ? cfg.fanLimit * cw : Infinity;
        if (span > limit) step *= limit / span;           // vějíř se nesmí rozjet mimo plochu
        const first = Math.max(0, pile.length - fan.n);
        for (let i = 0; i < pile.length; i++) {
            const k = Math.max(0, i - first);
            // karty, které leží přesně přes sebe (k = 0), dostanou drobnou nesouosost
            const j = k === 0 && jitter ? jitterOf(pile[i].id, cw) : null;
            out.push({
                x: base.x + k * step + (j ? j.x : 0),
                     y: base.y + (j ? j.y : 0),
                     r: j ? j.r : 0,
            });
        }
    } else {
        for (let i = 0; i < pile.length; i++) {
            const j = jitter ? jitterOf(pile[i].id, cw) : null;
            out.push({ x: base.x + (j ? j.x : 0), y: base.y + (j ? j.y : 0), r: j ? j.r : 0 });
        }
    }
    return out;
    }

    /** Místo, odkud karty při rozdání vyletí. */
    #dealOrigin(pileIds) {
    const def = this.game.def;
    if (def.dealOrigin) {
        return { x: this.m.offX + def.dealOrigin.x * this.m.cw, y: PAD + def.dealOrigin.y * this.m.ch };
    }
    const stock = pileIds.find(id => def.layout[id].type === 'stock') || pileIds[0];
    return this.#slotXY(def.layout[stock]);
    }

    /**
     * Přepočítá cíle všech karet a rámečků.
     * mode: 'deal'   – karty vyletí z místa rozdání
     *       'move'   – plynulý přesun a překlopení karet (speed = zrychlení animace)
     *       'resize' – změna velikosti okna: karty se plynule přesunou na nová místa
     */
    sync(mode = 'move', speed = 1) {
        this.#ensureCards();
        this.#measure();
        const { cw, ch, availH } = this.m;
        const state = this.game.state;
        const layout = this.game.def.layout;

        const pileIds = Object.keys(layout);
        const order = [];

        pileIds.forEach((id, pi) => {
            const cfg = layout[id];
            const pile = state.piles[id];
            const base = this.#slotXY(cfg);
            const pos = this.#pilePositions(cfg, pile);
            const last = pos.length ? pos[pos.length - 1] : base;
            const zone = ch * (1 + (cfg.bottomPadding ?? 0));   // oblast pro puštění karty
            const maxH = availH - PAD - base.y;                 // nesmí přesáhnout plochu
            const visH = Math.max(ch, last.y + ch - base.y);    // skutečně viditelná hromádka
            const x0 = Math.min(base.x, last.x);                // vějíř může růst doleva
            const w = cw + Math.abs(last.x - base.x);

            this.slots.get(id).style.translate = `${base.x}px ${base.y}px`;
            this.pileRects[id] = { x: x0, y: base.y, w, h: Math.min(Math.max(zone, visH), maxH) };
            this.hintRects[id] = { x: x0, y: base.y, w, h: Math.min(visH, maxH) };

            pile.forEach((card, i) => {
                const p = pos[i];
                const el = this.els.get(card.id);

                // plně zakrytá karta (leží přes ni další) se ztmaví, aby bylo vidět, že je pod ní
                const next = pos[i + 1];
                el.classList.toggle('buried', !!next && Math.hypot(next.x - p.x, next.y - p.y) < cw * BURIED_DIST);
                el.style.rotate = p.r ? `${p.r.toFixed(2)}deg` : '';

                this.targets.set(card.id, p);
                order.push({ card, pos: p, i, pi, id });
            });
        });

        // Plocha má přesně výšku viewportu (bez posuvníku).
        this.root.style.height = availH + 'px';

        // Pořadí je v --z (pořadí ve sloupci plus základ hromádky `z`); zvednutí při pohybu
        // a tažení se v CSS jen přičítá, takže se pořadí karet nikdy nepřeskládá.
        for (const { card, i, id } of order) {
            this.els.get(card.id).style.setProperty('--z', String((layout[id].z ?? 0) + i + 1));
        }

        if (mode === 'deal') {
            const from = this.#dealOrigin(pileIds);
            order.sort((a, b) => a.i - b.i || a.pi - b.pi);
            order.forEach(({ card, pos, id }, n) => {
                const el = this.els.get(card.id);
                cancelAnim(el);
                this.#faceNow(el, card);
                el._pile = id;
                setPos(el, from.x, from.y);
                animateCard(el, pos.x, pos.y, {
                    from: { x: from.x, y: from.y },
                    delay: Math.min(n * 12, 700),
                            lift: false,
                });
            });
            return;
        }

        // Nejdřív se zjistí, které karty se mění; viditelné polohy se přečtou
        // všechny najednou a teprve potom se spustí animace (bez vynuceného přepočtu).
        const jobs = [];
        for (const { card, pos, id } of order) {
            const el = this.els.get(card.id);
            const up = !!card.up;
            const flipped = el._up !== up;
            const moved = el._x !== pos.x || el._y !== pos.y;
            const samePile = el._pile === id;
            el._pile = id;

            if (mode === 'resize') {
                if (flipped) this.#faceNow(el, card);
                if (moved) jobs.push({ el, pos, up: null, samePile: true });
            } else if (moved || flipped) {
                jobs.push({ el, pos, up: flipped ? up : null, samePile });
            }
        }

        const starts = jobs.map(j => visualPos(j.el));
        let n = 0;
        jobs.forEach((j, i) => {
            if (j.up !== null) {
                j.el._up = j.up;
                setFace(j.el, j.up);                     // strana se nastaví hned, animace se postará o vzhled
            }

            let opts;
            if (mode === 'resize') {
                opts = { from: starts[i], duration: 240, lift: false, elevate: false };
            } else if (j.samePile && j.up === null) {
                // jen se změnilo odsazení ve sloupci: bez zvednutí, stínu a zpoždění
                opts = { from: starts[i], speed, duration: 260, lift: false, elevate: false };
            } else {
                opts = { from: starts[i], delay: Math.min(n++ * 14, 200), speed, flipTo: j.up };
            }
            animateCard(j.el, j.pos.x, j.pos.y, opts);
        });
    }

    relayout() {
        this._onResize();
    }

    /** Promise, který se splní, až doběhnou všechny animace karet (i sbalení před rozdáním). */
    whenIdle() {
        if (this._pending) return this._pending.then(() => this.whenIdle());
        const pending = [];
        for (const el of this.els.values()) {
            if (el._anims) for (const a of el._anims) pending.push(a.finished.catch(() => {}));
        }
        if (!pending.length) return Promise.resolve();
        return Promise.all(pending).then(() => this.whenIdle());
    }

    /* ---------- rozhraní pro drag.js ---------- */

    elOf(cardId) {
        return this.els.get(cardId);
    }

    /** Prvky karet od idx dál spolu s jejich VIDITELNOU polohou. */
    items(pile, idx) {
        const els = this.game.cards(pile, idx).map(c => this.els.get(c.id));
        const starts = els.map(el => visualPos(el));
        return els.map((el, i) => ({ el, x: starts[i].x, y: starts[i].y }));
    }

    /** Prvky karet od idx dál spolu s jejich CÍLOVOU (domovskou) polohou. */
    homeItems(pile, idx) {
        return this.game.cards(pile, idx).map(c => {
            const t = this.targets.get(c.id);
            return { el: this.els.get(c.id), x: t.x, y: t.y };
        });
    }

    /**
     * Zjistí, na co uživatel kliknul/ťukl.
     * @returns {{pile: string, idx: number}|null}  idx = -1 pro prázdný rámeček
     */
    hit(target) {
        if (!target || !target.closest) return null;
        const cardEl = target.closest('.card');
        if (cardEl) {
            const loc = this.game.locate(Number(cardEl.dataset.id));
            return loc ? { pile: loc.pile, idx: loc.idx } : null;
        }
        const slot = target.closest('.slot');
        if (slot) return { pile: slot.dataset.pile, idx: -1 };
        return null;
    }

    /** Hromádky seřazené podle překryvu s obdélníkem (v souřadnicích okna). */
    pilesByOverlap(clientRect, exclude) {
        const rr = this.root.getBoundingClientRect();
        const r = {
            x: clientRect.left - rr.left,
            y: clientRect.top - rr.top,
            w: clientRect.width,
            h: clientRect.height,
        };
        const minArea = this.m.cw * this.m.ch * 0.1;
        const res = [];
        for (const [id, p] of Object.entries(this.pileRects)) {
            if (id === exclude) continue;
            const w = Math.min(r.x + r.w, p.x + p.w) - Math.max(r.x, p.x);
            const h = Math.min(r.y + r.h, p.y + p.h) - Math.max(r.y, p.y);
            if (w > 0 && h > 0 && w * h >= minArea) res.push({ id, area: w * h });
        }
        return res.sort((a, b) => b.area - a.area).map(o => o.id);
    }

    /* ---------- výhra ---------- */

    #startCelebration() {
    const els = [];
    for (const pile of Object.values(this.game.state.piles)) {
        for (let i = pile.length - 1; i >= 0; i--) els.push(this.els.get(pile[i].id));
    }
    this.celebration = celebrate(els, {
        w: this.root.clientWidth,
        h: this.viewport.clientHeight,
    });
    }

    #stopCelebration() {
    if (this.celebration) {
        this.celebration.cancel();
        this.celebration = null;
    }
    }
     }
