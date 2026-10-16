/*
 * kpat-web – webová verze KPatience (kpat)
 * Odvozeno z KDE KPatience: https://github.com/KDE/kpat
 *
 * Tento program je svobodný software; můžete jej šířit a/nebo upravovat
 * podle podmínek GNU General Public License, vydané Free Software Foundation,
 * a to buď ve verzi 2, nebo (podle vašeho uvážení) kterékoli pozdější verze.
 * Program je šířen BEZ JAKÉKOLI ZÁRUKY. Viz soubor LICENSE.
 */

import { rankLabel, isRed } from '../engine/rules.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';
const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];

// Symboly: 0 = piky, 1 = srdce, 2 = káry, 3 = kříže (shodně s engine/state.js), 4 = hvězda (žolík)
const SPRITE = `
<svg xmlns="${SVG_NS}" width="0" height="0" style="position:absolute" aria-hidden="true">
<defs>
<symbol id="s0" viewBox="0 0 100 100" fill="currentColor">
<path d="M50 8C20 40 8 52 22 68c10 10 22 4 25-6-1 14-5 23-13 30h32c-8-7-12-16-13-30 3 10 15 16 25 6C92 52 80 40 50 8z"/>
</symbol>
<symbol id="s1" viewBox="0 0 100 100" fill="currentColor">
<path d="M50 88C10 58 5 35 22 22c12-9 24-2 28 10 4-12 16-19 28-10 17 13 12 36-28 66z"/>
</symbol>
<symbol id="s2" viewBox="0 0 100 100" fill="currentColor">
<path d="M50 8 88 50 50 92 12 50z"/>
</symbol>
<symbol id="s3" viewBox="0 0 100 100" fill="currentColor">
<circle cx="50" cy="28" r="18"/><circle cx="30" cy="56" r="18"/>
<circle cx="70" cy="56" r="18"/><path d="M50 50 40 92h20z"/>
</symbol>
<symbol id="s4" viewBox="0 0 100 100" fill="currentColor">
<path d="M50 6 61 38 95 38 67 58 78 92 50 71 22 92 33 58 5 38 39 38z"/>
</symbol>
</defs>
</svg>`;

let spriteInstalled = false;

/** Vloží SVG sprite se symboly do stránky (jen jednou). */
export function installSprite() {
    if (spriteInstalled) return;
    const holder = document.createElement('div');
    holder.innerHTML = SPRITE.trim();
    document.body.prepend(holder.firstChild);
    spriteInstalled = true;
}

function suitSvg(suit, cls) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', cls);
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#s${suit}`);
    use.setAttributeNS(XLINK, 'xlink:href', `#s${suit}`);
    svg.appendChild(use);
    return svg;
}

function corner(card, extraClass) {
    const c = document.createElement('div');
    c.className = `corner ${extraClass}`;
    if (card.joker) {
        c.append(suitSvg(4, 'sm'));
        return c;
    }
    const rk = document.createElement('span');
    rk.className = 'rk';
    rk.textContent = rankLabel(card.r);
    c.append(rk, suitSvg(card.s, 'sm'));
    return c;
}

/**
 * Vytvoří DOM element karty. Hodnota a barva se nemění, takže se obsah staví
 * jednou; měnit se bude jen strana (`setFace`).
 *
 * Struktura (líc i rub jsou skutečné plochy, překlápí se ve 3D):
 *   .card.red|blk|joker.up|down
 *     > .inner
 *         > .face.front > .corner.tl, .corner.br, .center
 *         > .face.back
 * Žolík (card.joker) má v rozích i uprostřed hvězdu a nápis JOKER.
 */
export function createCardEl(card) {
    const el = document.createElement('div');
    el.className = `card ${card.joker ? 'joker' : isRed(card.s) ? 'red' : 'blk'}`;
    el.dataset.id = String(card.id);
    el.setAttribute('role', 'img');
    el._label = card.joker ? 'joker' : `${rankLabel(card.r)} ${SUIT_NAMES[card.s]}`;

    const inner = document.createElement('div');
    inner.className = 'inner';

    const front = document.createElement('div');
    front.className = 'face front';
    front.append(corner(card, 'tl'), corner(card, 'br'));

    const center = document.createElement('div');
    center.className = 'center';
    if (card.joker) {
        const jk = document.createElement('span');
        jk.className = 'jk';
        jk.textContent = 'JOKER';
        center.append(suitSvg(4, 'big'), jk);
    } else {
        center.append(suitSvg(card.s, 'big'));
    }
    front.append(center);

    const back = document.createElement('div');
    back.className = 'face back';

    inner.append(front, back);
    el.append(inner);

    setFace(el, card.up);
    return el;
}

/** Nastaví (bez animace) stranu karty. Popisek odhaluje jen kartu lícem nahoru. */
export function setFace(el, up) {
    el.classList.toggle('up', !!up);
    el.classList.toggle('down', !up);
    el.setAttribute('aria-label', up ? el._label : 'card face down');
}

/** Synchronizuje element s kartou ze stavu (bez animace). */
export function syncCardEl(el, card) {
    const isUp = el.classList.contains('up');
    if (isUp !== !!card.up) setFace(el, card.up);
}

/** Vytvoří prázdné místo pro hromádku (rámeček + volitelný symbol). */
export function createSlotEl(pileId, type) {
    const el = document.createElement('div');
    el.className = `slot slot-${type || 'tableau'}`;
    el.dataset.pile = pileId;
    return el;
}
