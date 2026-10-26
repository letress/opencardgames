/*
 * kpat-web – a web version of KPatience (kpat)
 * Derived from KDE KPatience: https://github.com/KDE/kpat
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 2, or (at your option) any
 * later version. This program is distributed WITHOUT ANY WARRANTY.
 * See the LICENSE file.
 */

import { Game } from './engine/game.js';
import { AutoDrop } from './engine/autodrop.js';
import { Board } from './ui/board.js';
import { attachDrag } from './ui/drag.js';
import { createSelect } from './ui/select.js';
import {
    saveGame, loadGame, clearGame, getStats, recordResult, getSettings, setSettings,
} from './storage.js';
import { klondikeDraw1, klondikeDraw3 } from './games/klondike.js';
import grandfather from './games/grandfather.js';
import fortyeight from './games/fortyeight.js';
import victorian from './games/victorian.js';
import sabine from './games/sabine.js';
import pyramids from './games/pyramids.js';
import tripeaks from './games/tripeaks.js';

const NEXT_ROUND_DELAY = 1500;   // pause between a finished round and dealing the next one (ms)

/* All interface text lives here (easy to localize). */
const STRINGS = {
    noMoves: 'No further moves found.',
    askSeed: 'Deal number (positive integer):',
    winTitle: 'Congratulations!',
    lostTitle: 'Game Over',
    roundDone: (n, score) => `Round ${n} complete · score: ${score}`,
    allRounds: score => `You completed all rounds. Total score: ${score}.`,
    stuckInRound: (round, score) => `No more moves. Game over in round ${round}. Total score: ${score}.`,
    won: (n, score) => (score !== null ? `You won. Score: ${score}.` : `You won in ${n} moves.`),
    lost: score => (score !== null ? `No more moves. Score: ${score}.` : 'No more moves.'),
    stats: s =>
    `Played: ${s.played} · Won: ${s.won}` +
    (s.played ? ` (${Math.round((100 * s.won) / s.played)}%)` : '') +
    (s.bestScore != null ? ` · Best score: ${s.bestScore}` : ` · Fewest moves: ${s.bestMoves ?? '–'}`) +
    ` · Streak: ${s.streak} (best ${s.bestStreak})`,
};

const GAMES = [klondikeDraw1, klondikeDraw3, grandfather, fortyeight, victorian, sabine, pyramids, tripeaks];
const byId = id => GAMES.find(g => g.id === id) || GAMES[0];
const $ = id => document.getElementById(id);

let game = null;
let board = null;
let gameSelect = null;
let autodrop = null;
let unsubscribe = null;
let winTimer = null;
let hintEls = [];
let over = false;          // the game has ended (won or stuck); the result is recorded only once
let pendingNext = false;   // the round is cleared and the next one will deal itself shortly
let lastScore = null;      // score at the last event, used to compute the +N/-N bubble

const scoreOf = g => (g.def.scoring ? (g.state.meta.score ?? 0) : null);

/* ---------- game lifecycle ---------- */

/** Records an in-progress, unfinished game as a loss. */
function finalizeCurrent() {
    if (game && !game.won && !over && game.moves > 0) {
        recordResult(game.def.id, {
            won: false, moves: game.moves, score: scoreOf(game), finished: false,
        });
    }
}

function openGame(def, { fresh = false } = {}) {
    finalizeCurrent();
    if (unsubscribe) unsubscribe();
    clearTimeout(winTimer);
    clearHints();
    over = false;
    pendingNext = false;

    game = new Game(def);
    let loaded = false;
    if (!fresh) {
        const saved = loadGame(def.id);
        if (saved) loaded = game.load(saved);
    }
    lastScore = scoreOf(game);

    if (!board) {
        board = new Board($('board'), game);
        attachDrag(board);
        autodrop = new AutoDrop(game, {
            waitIdle: () => board.whenIdle(),
                                onActive: active => { $('btn-drop').disabled = active; },
        });
        autodrop.setEnabled(getSettings().autoDrop);
    } else {
        board.setGame(game);
        autodrop.setGame(game);
    }

    unsubscribe = game.subscribe(onEvent);
    setSettings({ lastGame: def.id });
    saveGame(game.save());
    updateUi();

    if (loaded) {
        // a saved game may have ended right after clearing a round, or got stuck
        if (game.won) roundCleared();
        else checkLost();
    } else {
        // after a fresh deal, auto-collect kicks in as usual; a loaded game is left alone
        autodrop.kick();
    }
}

function newDeal(seed) {
    finalizeCurrent();
    clearGame(game.def.id);
    game.start(seed);        // the 'start' event takes care of saving and redrawing
}

/* ---------- game events ---------- */

function onEvent({ type }) {
    clearHints();

    if (type === 'start') {
        over = false;
        pendingNext = false;
        clearTimeout(winTimer);
        const dlg = $('win-dialog');
        if (dlg.open) dlg.close();
        lastScore = scoreOf(game);
    }

    if (type === 'won') {
        roundCleared();
    } else {
        saveGame(game.save());
    }

    autodrop.handleEvent(type);
    if (type !== 'won') checkLost();

    if (game.def.scoring && type !== 'start') {
        const score = scoreOf(game);
        if ((type === 'click' || type === 'move') && lastScore !== null && score !== lastScore) {
            board.showScorePopup(score - lastScore);
        }
        lastScore = score;
    }

    updateUi();
}

function showDialog({ title, text, stats }) {
    $('win-title').textContent = title;
    $('win-text').textContent = text;
    $('win-stats').textContent = stats;
    const dlg = $('win-dialog');
    if (!dlg.open) dlg.showModal();
}

/**
 * All cards have been played (for peak games: the tableau is empty).
 * In a multi-round game, the next round deals itself shortly; the last round ends the game.
 */
function roundCleared() {
    const def = game.def;
    const round = game.state.meta.round ?? 1;

    if (def.rounds && round < def.rounds) {
        pendingNext = true;
        clearTimeout(winTimer);
        saveGame(game.save());
        setStatus(STRINGS.roundDone(round, scoreOf(game)));
        winTimer = setTimeout(() => game.nextRound(), NEXT_ROUND_DELAY);
        return;
    }
    finishGame(true);
}

/** Game over: won (last round cleared) or stuck in any round. */
function finishGame(won) {
    const def = game.def;
    const score = scoreOf(game);
    const round = game.state.meta.round ?? 1;
    const multi = !!def.rounds;

    over = true;
    const stats = recordResult(def.id, { won, moves: game.moves, score });
    clearGame(def.id);

    clearTimeout(winTimer);
    winTimer = setTimeout(() => showDialog({
        title: won ? STRINGS.winTitle : STRINGS.lostTitle,
        text: multi
        ? (won ? STRINGS.allRounds(score) : STRINGS.stuckInRound(round, score))
        : (won ? STRINGS.won(game.moves, score) : STRINGS.lost(score)),
                                           stats: STRINGS.stats(stats),
    }), won ? 1400 : 700);
}

/** Games that can detect a stuck position end here. */
function checkLost() {
    // a move can clear the board (win) before Game.won is updated; never call that "stuck"
    if (over || pendingNext || game.won || game.def.isWon(game.state)) return;
    if (!game.def.isLost || !game.def.isLost(game.state)) return;
    finishGame(false);
}

/* ---------- interface ---------- */

/** The score element; created if it is missing from index.html. */
function scoreBox() {
    let box = $('score-box');
    if (!box) {
        box = document.createElement('span');
        box.id = 'score-box';
        box.hidden = true;
        box.innerHTML = 'Score: <span id="score">0</span>' +
        '<span id="round-info"> · Round: <span id="round">1</span>/<span id="rounds">3</span></span>';
        (document.querySelector('.info') || document.body).appendChild(box);
    }
    return box;
}

function updateUi() {
    const def = game.def;
    document.title = `${def.name} – KPat Web`;
    gameSelect.setValue(def.id);
    $('moves').textContent = String(game.moves);
    $('seed').textContent = '#' + game.seed;

    const noUndo = !!def.noUndo;
    $('btn-undo').hidden = noUndo;
    $('btn-redo').hidden = noUndo;
    $('btn-undo').disabled = !game.canUndo;
    $('btn-redo').disabled = !game.canRedo;

    const scoring = !!def.scoring;
    scoreBox().hidden = !scoring;
    if (scoring) {
        $('score').textContent = String(game.state.meta.score ?? 0);
        const roundInfo = $('round-info');
        if (roundInfo) roundInfo.hidden = !def.rounds;
        if (def.rounds) {
            const r = $('round');
            const rs = $('rounds');
            if (r) r.textContent = String(game.state.meta.round ?? 1);
            if (rs) rs.textContent = String(def.rounds);
        }
    }

    const hasRedeal = !!(def.actions && def.actions.redeal);
    $('btn-redeal').hidden = !hasRedeal;
    $('btn-redeal').disabled = !game.canAction('redeal');
    if (hasRedeal) {
        $('btn-redeal').title = `${Math.max(0, 3 - (game.state.meta.deals ?? 3))}×`;
    }

    // auto-collecting onto foundations only makes sense for games that support it
    const hasDrop = !!def.dropCandidates;
    $('btn-drop').hidden = !hasDrop;
    const toggle = $('opt-autodrop').closest('label');
    if (toggle) toggle.hidden = !hasDrop;
    $('opt-autodrop').checked = autodrop.enabled;

    $('stats').textContent = STRINGS.stats(getStats(def.id));
}

function setStatus(text) {
    $('status').textContent = text;
    if (text) setTimeout(() => { if ($('status').textContent === text) $('status').textContent = ''; }, 2500);
}

function flash(el) {
    if (!el) return;
    el.classList.add('hint');
    setTimeout(() => el.classList.remove('hint'), 1400);
}

/* ---------- hints ---------- */

function clearHints() {
    for (const el of hintEls) el.classList.remove('hint-on');
    hintEls = [];
}

function showHint() {
    clearHints();

    // highlight every card that can be moved somewhere
    const seen = new Set();
    for (const h of game.hints()) {
        if (seen.has(h.card.id)) continue;
        seen.add(h.card.id);
        const el = board.elOf(h.card.id);
        if (el) {
            el.classList.add('hint-on');
            hintEls.push(el);
        }
    }
    if (hintEls.length) return;

    // no move available: offer drawing from the stock, or a redeal
    const layout = game.def.layout;
    const stockId = Object.keys(layout).find(id => layout[id].type === 'stock');
    if (stockId && game.canDeal()) {
        const stock = game.state.piles[stockId];
        flash(stock.length ? board.elOf(stock[stock.length - 1].id) : board.slots.get(stockId));
        return;
    }
    if (game.canAction('redeal')) {
        flash($('btn-redeal'));
        return;
    }
    setStatus(STRINGS.noMoves);
}

function askSeed() {
    const raw = window.prompt(STRINGS.askSeed, String(game.seed));
    if (raw === null) return;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) newDeal(n);
}

/* ---------- full screen ---------- */

function initFullscreen() {
    const btn = $('btn-fullscreen');
    if (!document.fullscreenEnabled) {
        btn.hidden = true;
        return;
    }
    const sync = () => {
        const on = !!document.fullscreenElement;
        btn.textContent = on ? '⤓' : '⛶';
        btn.title = on ? 'Exit full screen' : 'Full screen';
        btn.setAttribute('aria-pressed', String(on));
    };
    btn.addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
    });
    document.addEventListener('fullscreenchange', sync);
    sync();
}

/* ---------- initialization ---------- */

function init() {
    gameSelect = createSelect(
        $('game-select'),
        GAMES.map(g => ({ id: g.id, name: g.name })),
        id => openGame(byId(id))
    );

    $('btn-new').addEventListener('click', () => newDeal());
    $('btn-restart').addEventListener('click', () => { clearGame(game.def.id); game.restart(); });
    $('btn-seed').addEventListener('click', askSeed);
    $('btn-undo').addEventListener('click', () => game.undo());
    $('btn-redo').addEventListener('click', () => game.redo());
    $('btn-hint').addEventListener('click', showHint);
    $('btn-redeal').addEventListener('click', () => game.action('redeal'));
    $('btn-drop').addEventListener('click', () => autodrop.start());
    $('opt-autodrop').addEventListener('change', e => {
        autodrop.setEnabled(e.target.checked);
        setSettings({ autoDrop: e.target.checked });
        if (e.target.checked) autodrop.kick();
    });

    initFullscreen();

        $('win-new').addEventListener('click', () => {
            $('win-dialog').close();
            newDeal();
        });

        // Any user touch clears hints and stops a running auto-collect (DealerScene::stop()).
        document.addEventListener('pointerdown', () => {
            clearHints();
            if (autodrop) autodrop.stop();
        }, true);

            document.addEventListener('keydown', e => {
                const tag = (e.target.tagName || '').toLowerCase();
                if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
                const mod = e.ctrlKey || e.metaKey;
                if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); game.undo(); }
                else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
                    e.preventDefault(); game.redo();
                } else if (!mod && e.key.toLowerCase() === 'h') { showHint(); }
            });

            window.addEventListener('pagehide', () => { if (game && !game.won) saveGame(game.save()); });

            openGame(byId(getSettings().lastGame));

            // if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
}

init();
