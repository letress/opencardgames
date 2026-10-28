/*
 * kpat-web – a web version of KPatience (kpat)
 *
 * Decides whether a game is still winnable from its CURRENT position —
 * the same question kpat's own DealerScene::isGameLost() answers, but
 * without the real engine behind it.
 *
 * In kpat (see src/dealer.cpp), isGameLost() does NOT just check whether an
 * immediate move exists. For games with a registered solver it calls
 * solver()->patsolve(...), which hands the board to the external
 * freecell-solver C library and only reports a loss once that library
 * returns NoSolutionExists — an actual proof, found by searching sequences
 * of moves, not a single-move heuristic. (bruteForceHints(), the one-ply
 * move finder, is only ever used to populate the Hint button, and only for
 * games that have *no* solver — it is never consulted to decide a loss.)
 *
 * We don't have (and don't want to port) that external solver library, so
 * this does the same kind of thing ourselves: a breadth-first search of the
 * actual reachable game-state graph, deduplicated by state, up to a node
 * budget.
 *   - a winning state is reachable            -> still winnable
 *   - the whole reachable graph is exhausted   -> genuinely stuck (a real
 *     without ever reaching a win                 proof, like kpat's
 *                                                   NoSolutionExists)
 *   - the budget runs out first                -> inconclusive; treated as
 *                                                   NOT stuck, same as kpat
 *                                                   never declaring a loss
 *                                                   on an aborted solve
 */

import { cloneState } from './state.js';

// A genuinely dead-end position has very little branching left, so it proves
// itself in well under this; the budget mostly controls how long a *healthy*
// mid-game position (which will never find a full win within reach anyway)
// spends being inconclusive before giving up.
const DEFAULT_BUDGET = 1200;

/** Compact, order-sensitive fingerprint of a state (card identity + face). */
function stateKey(state, pileIds) {
    let key = '';
    for (const id of pileIds) {
        key += id;
        key += ':';
        for (const c of state.piles[id]) key += (c.up ? 'u' : 'd') + c.id + ',';
        key += '|';
    }
    return key + JSON.stringify(state.meta);
}

/**
 * Every state reachable from `state` in a single action: a drag-drop move,
 * a click (stock draws and the like — every onClick in this codebase
 * ignores idx, so every pile is tried with idx -1), or a named action
 * (e.g. redeal). Mirrors exactly what Game#transaction can do, including
 * calling afterMove so newly-exposed cards become draggable too.
 */
function* successors(def, state, pileIds) {
    const finish = next => {
        if (def.afterMove) def.afterMove(next);
        return next;
    };

    for (const from of pileIds) {
        const pile = state.piles[from];
        for (let idx = 0; idx < pile.length; idx++) {
            if (!def.canDrag(state, from, idx)) continue;
            const moving = pile.slice(idx);
            for (const to of pileIds) {
                if (to === from) continue;
                if (!def.canDrop(state, moving, to, from)) continue;
                const next = cloneState(state);
                next.piles[to].push(...next.piles[from].splice(idx));
                yield finish(next);
            }
        }
    }

    if (def.onClick) {
        // reuse one clone across failed attempts: a false return never mutates
        let scratch = cloneState(state);
        for (const pile of pileIds) {
            if (def.onClick(scratch, pile, -1)) {
                yield finish(scratch);
                scratch = cloneState(state);
            }
        }
    }

    if (def.actions) {
        for (const name of Object.keys(def.actions)) {
            if (def.canAction && !def.canAction(state, name)) continue;
            const next = cloneState(state);
            if (def.actions[name](next)) yield finish(next);
        }
    }
}

/**
 * True if no sequence of moves from `state` can reach a win, proven by
 * exhausting the whole reachable state graph. False both when a win is
 * found AND when the search budget runs out first (inconclusive).
 */
export function isDeadEnd(def, state, pileIds, budget = DEFAULT_BUDGET) {
    if (def.isWon(state)) return false;

    const visited = new Set([stateKey(state, pileIds)]);
    const queue = [state];
    let explored = 0;

    while (queue.length) {
        const current = queue.shift();
        for (const next of successors(def, current, pileIds)) {
            if (def.isWon(next)) return false;
            const key = stateKey(next, pileIds);
            if (visited.has(key)) continue;
            visited.add(key);
            if (++explored > budget) return false;   // inconclusive: never report a loss on a guess
            queue.push(next);
        }
    }
    return true;   // the whole reachable graph was exhausted without ever winning
}
