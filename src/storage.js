/*
 * kpat-web – webová verze KPatience (kpat)
 * Odvozeno z KDE KPatience: https://github.com/KDE/kpat
 *
 * Tento program je svobodný software; můžete jej šířit a/nebo upravovat
 * podle podmínek GNU General Public License, vydané Free Software Foundation,
 * a to buď ve verzi 2, nebo (podle vašeho uvážení) kterékoli pozdější verze.
 * Program je šířen BEZ JAKÉKOLI ZÁRUKY. Viz soubor LICENSE.
 */

const PREFIX = 'kpat-web:';
const VERSION = 1;

/* ---------- bezpečný přístup k localStorage ---------- */

const memory = new Map();   // záloha, když localStorage není k dispozici

function rawGet(key) {
    try {
        const v = localStorage.getItem(PREFIX + key);
        return v === null ? (memory.get(key) ?? null) : v;
    } catch (_) {
        return memory.get(key) ?? null;
    }
}

function rawSet(key, value) {
    memory.set(key, value);
    try {
        localStorage.setItem(PREFIX + key, value);
        return true;
    } catch (_) {
        return false;
    }
}

function rawRemove(key) {
    memory.delete(key);
    try {
        localStorage.removeItem(PREFIX + key);
    } catch (_) { /* ignorováno */ }
}

function readJson(key, fallback) {
    const raw = rawGet(key);
    if (raw === null) return fallback;
    try {
        const data = JSON.parse(raw);
        return data && data.v === VERSION ? data.d : fallback;
    } catch (_) {
        return fallback;
    }
}

function writeJson(key, value) {
    return rawSet(key, JSON.stringify({ v: VERSION, d: value }));
}

/* ---------- rozehraná hra ---------- */

/** Uloží výsledek `Game.save()` pod id hry. */
export function saveGame(data) {
    if (!data || !data.id) return false;
    return writeJson('game:' + data.id, data);
}

/** Vrátí uloženou hru pro dané id nebo null. */
export function loadGame(gameId) {
    return readJson('game:' + gameId, null);
}

export function clearGame(gameId) {
    rawRemove('game:' + gameId);
}

/* ---------- statistiky ---------- */

const EMPTY_STATS = {
    played: 0, won: 0, bestMoves: null, bestScore: null, streak: 0, bestStreak: 0,
};

export function getStats(gameId) {
    return { ...EMPTY_STATS, ...readJson('stats:' + gameId, {}) };
}

/**
 * Zapíše výsledek dohrané nebo opuštěné hry.
 * @param {string} gameId
 * @param {{won: boolean, moves: number, score?: number|null, finished?: boolean}} result
 *   finished = hra skončila sama (výhra nebo uvíznutí); jen taková se počítá do nejlepšího skóre
 */
export function recordResult(gameId, { won, moves, score = null, finished = true }) {
    const s = getStats(gameId);
    s.played++;
    if (won) {
        s.won++;
        s.streak++;
        s.bestStreak = Math.max(s.bestStreak, s.streak);
        if (s.bestMoves === null || moves < s.bestMoves) s.bestMoves = moves;
    } else {
        s.streak = 0;
    }
    if (finished && score !== null && (s.bestScore === null || score > s.bestScore)) {
        s.bestScore = score;
    }
    writeJson('stats:' + gameId, s);
    return s;
}

export function resetStats(gameId) {
    rawRemove('stats:' + gameId);
}

/* ---------- nastavení ---------- */

const DEFAULT_SETTINGS = {
    lastGame: 'klondike',
    animations: true,
    autoDrop: true,
    theme: 'auto',   // 'auto' | 'light' | 'dark'
};

export function getSettings() {
    return { ...DEFAULT_SETTINGS, ...readJson('settings', {}) };
}

export function setSettings(patch) {
    const next = { ...getSettings(), ...patch };
    writeJson('settings', next);
    return next;
}
