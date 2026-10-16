/*
 * kpat-web – webová verze KPatience (kpat)
 * Odvozeno z KDE KPatience: https://github.com/KDE/kpat
 *
 * Tento program je svobodný software; můžete jej šířit a/nebo upravovat
 * podle podmínek GNU General Public License, vydané Free Software Foundation,
 * a to buď ve verzi 2, nebo (podle vašeho uvážení) kterékoli pozdější verze.
 * Program je šířen BEZ JAKÉKOLI ZÁRUKY. Viz soubor LICENSE.
 */

import { Game } from './engine/game.js';
import { AutoDrop } from './engine/autodrop.js';
import { Board } from './ui/board.js';
import { attachDrag } from './ui/drag.js';
import {
    saveGame, loadGame, clearGame, getStats, recordResult, getSettings, setSettings,
} from './storage.js';
import { klondikeDraw1, klondikeDraw3 } from './games/klondike.js';
import grandfather from './games/grandfather.js';
import fortyeight from './games/fortyeight.js';
import victorian from './games/victorian.js';
import sabine from './games/sabine.js';
import pyramids from './games/pyramids.js';

const NEXT_ROUND_DELAY = 1500;   // pauza mezi dokončeným kolem a rozdáním dalšího (ms)

/* Texty rozhraní na jednom místě (snadná lokalizace). */
const STRINGS = {
    noMoves: 'Žádný další tah nenalezen.',
    askSeed: 'Číslo rozdání (kladné celé číslo):',
    winTitle: 'Gratulujeme!',
    lostTitle: 'Konec hry',
    roundDone: (n, score) => `Kolo ${n} dokončeno · body: ${score}`,
    allRounds: score => `Dokončili jste všechna kola. Celkem bodů: ${score}.`,
    stuckInRound: (round, score) => `Už nelze táhnout. Konec hry v kole ${round}. Celkem bodů: ${score}.`,
    won: (n, score) => (score !== null ? `Vyhráli jste. Body: ${score}.` : `Vyhráli jste na ${n} tahů.`),
    lost: score => (score !== null ? `Už nelze táhnout. Body: ${score}.` : 'Už nelze táhnout.'),
    stats: s =>
    `Odehráno: ${s.played} · Výher: ${s.won}` +
    (s.played ? ` (${Math.round((100 * s.won) / s.played)} %)` : '') +
    (s.bestScore != null ? ` · Nejvíc bodů: ${s.bestScore}` : ` · Nejméně tahů: ${s.bestMoves ?? '–'}`) +
    ` · Série: ${s.streak} (max. ${s.bestStreak})`,
};

const GAMES = [klondikeDraw1, klondikeDraw3, grandfather, fortyeight, victorian, sabine, pyramids];
const byId = id => GAMES.find(g => g.id === id) || GAMES[0];
const $ = id => document.getElementById(id);

let game = null;
let board = null;
let autodrop = null;
let unsubscribe = null;
let winTimer = null;
let hintEls = [];
let over = false;          // hra skončila (výhra nebo uvíznutí), výsledek se zapíše jen jednou
let pendingNext = false;   // kolo je dokončeno a za chvíli se samo rozdá další

const scoreOf = g => (g.def.scoring ? (g.state.meta.score ?? 0) : null);

/* ---------- životní cyklus hry ---------- */

/** Rozehranou, ale neskončenou hru zapíše jako prohru. */
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
        // uložená hra mohla být ukončena těsně po dokončení kola nebo uvíznutí
        if (game.won) roundCleared();
        else checkLost();
    } else {
        // Po nové hře se karty odkládají jako po každém rozdání; načtená hra se nechá být.
        autodrop.kick();
    }
}

function newDeal(seed) {
    finalizeCurrent();
    clearGame(game.def.id);
    game.start(seed);        // událost 'start' se postará o uložení a překreslení
}

/* ---------- události hry ---------- */

function onEvent({ type }) {
    clearHints();

    if (type === 'start') {
        over = false;
        pendingNext = false;
        clearTimeout(winTimer);
        const dlg = $('win-dialog');
        if (dlg.open) dlg.close();
    }

    if (type === 'won') {
        roundCleared();
    } else {
        saveGame(game.save());
    }

    autodrop.handleEvent(type);
    if (type !== 'won') checkLost();
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
 * Všechny karty jsou odložené (u Pyramids: pyramidy jsou prázdné).
 * U vícekolové hry se po chvíli samo rozdá další kolo, po posledním kole hra končí.
 */
function roundCleared() {
    const def = game.def;
    const round = game.state.meta.round ?? 1;

    if (def.rounds && round < def.rounds) {
        pendingNext = true;
        saveGame(game.save());
        setStatus(STRINGS.roundDone(round, scoreOf(game)));
        winTimer = setTimeout(() => game.nextRound(), NEXT_ROUND_DELAY);
        return;
    }
    finishGame(true);
}

/** Konec hry: výhra (poslední kolo vyčištěno) nebo uvíznutí v kterémkoli kole. */
function finishGame(won) {
    const def = game.def;
    const score = scoreOf(game);
    const round = game.state.meta.round ?? 1;
    const multi = !!def.rounds;

    over = true;
    const stats = recordResult(def.id, { won, moves: game.moves, score });
    clearGame(def.id);

    winTimer = setTimeout(() => showDialog({
        title: won ? STRINGS.winTitle : STRINGS.lostTitle,
        text: multi
        ? (won ? STRINGS.allRounds(score) : STRINGS.stuckInRound(round, score))
        : (won ? STRINGS.won(game.moves, score) : STRINGS.lost(score)),
                                           stats: STRINGS.stats(stats),
    }), won ? 1400 : 700);
}

/** Hry, které umějí poznat, že už nelze táhnout, končí. */
function checkLost() {
    if (over || pendingNext || game.won || !game.def.isLost || !game.def.isLost(game.state)) return;
    finishGame(false);
}

/* ---------- rozhraní ---------- */

/** Prvek se skóre; když chybí v index.html, vytvoří se. */
function scoreBox() {
    let box = $('score-box');
    if (!box) {
        box = document.createElement('span');
        box.id = 'score-box';
        box.hidden = true;
        box.innerHTML = 'Body: <span id="score">0</span> · Kolo: <span id="round">1</span>/<span id="rounds">3</span>';
        (document.querySelector('.info') || document.body).appendChild(box);
    }
    return box;
}

function updateUi() {
    const def = game.def;
    document.title = `${def.name} – KPat Web`;
    $('game-select').value = def.id;
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
        const r = $('round');
        const rs = $('rounds');
        if (r) r.textContent = String(game.state.meta.round ?? 1);
        if (rs) rs.textContent = String(def.rounds ?? 1);
    }

    const hasRedeal = !!(def.actions && def.actions.redeal);
    $('btn-redeal').hidden = !hasRedeal;
    $('btn-redeal').disabled = !game.canAction('redeal');
    if (hasRedeal) {
        $('btn-redeal').title = `${Math.max(0, 3 - (game.state.meta.deals ?? 3))}×`;
    }

    // odkládání na základny má smysl jen u her, které ho umějí
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

/* ---------- nápověda ---------- */

function clearHints() {
    for (const el of hintEls) el.classList.remove('hint-on');
    hintEls = [];
}

function showHint() {
    clearHints();

    // zvýraznit všechny karty, které lze někam přesunout
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

    // žádný přesun: nabídnout dobrání z talonu nebo rozdání znovu
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

/* ---------- inicializace ---------- */

function init() {
    const select = $('game-select');
    for (const g of GAMES) {
        const o = document.createElement('option');
        o.value = g.id;
        o.textContent = g.name;
        select.appendChild(o);
    }

    select.addEventListener('change', () => openGame(byId(select.value)));
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

        $('win-new').addEventListener('click', () => {
            $('win-dialog').close();
            newDeal();
        });

        // Jakýkoli dotyk uživatele zruší zvýraznění a přeruší běžící odkládání (DealerScene::stop()).
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
