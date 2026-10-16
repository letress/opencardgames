/*
 * kpat-web – webová verze KPatience (kpat)
 * Odvozeno z KDE KPatience: https://github.com/KDE/kpat
 *
 * Tento program je svobodný software; můžete jej šířit a/nebo upravovat
 * podle podmínek GNU General Public License, vydané Free Software Foundation,
 * a to buď ve verzi 2, nebo (podle vašeho uvážení) kterékoli pozdější verze.
 * Program je šířen BEZ JAKÉKOLI ZÁRUKY. Viz soubor LICENSE.
 */

import { setPos, cancelAnim, snapBack } from './anim.js';

const DOUBLE_TAP_MS = 350;
const THRESHOLD_MOUSE = 4;
const THRESHOLD_TOUCH = 8;

/**
 * Připojí ovládání myší/dotykem/perem k hrací ploše.
 * @param {import('./board.js').Board} board
 * @returns {() => void} funkce pro odpojení
 */
export function attachDrag(board) {
    const root = board.root;
    let pending = null;   // {pointerId, hit, sx, sy, items, draggable, dragging, target}
    let lastTap = null;   // {cardId, time}
    let hint = null;      // prvek zvýraznění cíle

    /* ---------- zvýraznění cíle ---------- */

    function showHint(pileId) {
        if (!pileId) return hideHint();
        const r = board.hintRects[pileId];
        if (!r) return hideHint();
        if (!hint) {
            hint = document.createElement('div');
            hint.className = 'drop-hint';
            root.appendChild(hint);
        }
        hint.style.cssText =
        `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
    }

    function hideHint() {
        if (hint) {
            hint.remove();
            hint = null;
        }
    }

    /* ---------- hledání cíle ---------- */

    function findTarget(p) {
        const first = p.items[0].el.getBoundingClientRect();
        const candidates = board.pilesByOverlap(first, p.hit.pile);
        return candidates.find(id => board.game.canDrop(p.hit.pile, p.hit.idx, id)) || null;
    }

    /* ---------- obsluha událostí ---------- */

    function onDown(e) {
        if (pending) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const hit = board.hit(e.target);
        if (!hit) return;

        const game = board.game;
        const draggable = hit.idx >= 0 && game.canDrag(hit.pile, hit.idx);
        pending = {
            pointerId: e.pointerId,
            hit,
            sx: e.clientX,
            sy: e.clientY,
            touch: e.pointerType !== 'mouse',
            draggable,
            dragging: false,
            items: draggable ? board.items(hit.pile, hit.idx) : null,   // viditelné polohy
            target: null,
        };
        try { root.setPointerCapture(e.pointerId); } catch (_) { /* ignorováno */ }
    }

    function startDrag(p) {
        p.dragging = true;
        for (const it of p.items) {
            cancelAnim(it.el);
            setPos(it.el, it.x, it.y);          // karta zůstane přesně tam, kde je právě vidět
            it.el.classList.add('dragging');
        }
    }

    function onMove(e) {
        const p = pending;
        if (!p || e.pointerId !== p.pointerId) return;
        const dx = e.clientX - p.sx;
        const dy = e.clientY - p.sy;

        if (!p.dragging) {
            if (!p.draggable) return;
            const limit = p.touch ? THRESHOLD_TOUCH : THRESHOLD_MOUSE;
            if (Math.hypot(dx, dy) < limit) return;
            startDrag(p);
        }

        for (const it of p.items) setPos(it.el, it.x + dx, it.y + dy);

        const target = findTarget(p);
        if (target !== p.target) {
            p.target = target;
            showHint(target);
        }
        e.preventDefault();
    }

    function finishDrag(p, cancelled) {
        hideHint();
        const game = board.game;
        const { pile, idx } = p.hit;
        const target = cancelled ? null : findTarget(p);

        for (const it of p.items) it.el.classList.remove('dragging');

        let moved = false;
        if (target) moved = game.move(pile, idx, target);
        if (!moved) snapBack(board.homeItems(pile, idx));
    }

    function handleTap(p) {
        const game = board.game;
        const { pile, idx } = p.hit;

        if (idx < 0) {            // prázdný rámeček (např. nové dobrání)
            game.click(pile, -1);
            lastTap = null;
            return;
        }

        const card = game.state.piles[pile][idx];
        const now = performance.now();
        const isDouble = lastTap && lastTap.cardId === card.id && now - lastTap.time < DOUBLE_TAP_MS;

        if (isDouble) {
            lastTap = null;
            if (!game.autoMove(pile, idx)) game.click(pile, idx);
            return;
        }

        lastTap = { cardId: card.id, time: now };
        game.click(pile, idx);
    }

    function onUp(e) {
        const p = pending;
        if (!p || e.pointerId !== p.pointerId) return;
        pending = null;
        try { root.releasePointerCapture(e.pointerId); } catch (_) { /* ignorováno */ }

        if (p.dragging) {
            lastTap = null;
            finishDrag(p, false);
        } else {
            handleTap(p);
        }
    }

    function onCancel(e) {
        const p = pending;
        if (!p || e.pointerId !== p.pointerId) return;
        pending = null;
        if (p.dragging) finishDrag(p, true);
    }

    function onContextMenu(e) {
        if (pending && pending.dragging) e.preventDefault();
    }

    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onCancel);
    root.addEventListener('contextmenu', onContextMenu);

    return function detach() {
        root.removeEventListener('pointerdown', onDown);
        root.removeEventListener('pointermove', onMove);
        root.removeEventListener('pointerup', onUp);
        root.removeEventListener('pointercancel', onCancel);
        root.removeEventListener('contextmenu', onContextMenu);
        hideHint();
        pending = null;
    };
}
