/*
 * kpat-web – webová verze KPatience (kpat)
 * Odvozeno z KDE KPatience (dealer.cpp): https://github.com/KDE/kpat
 *
 * Copyright (C) 1995 Paul Olav Tvete <paul@troll.no>
 * Copyright (C) 2000-2009 Stephan Kulow <coolo@kde.org>
 * Copyright (C) 2009-2010 Parker Coates <coates@kde.org>
 * Úpravy a přepis do JavaScriptu: autoři kpat-web
 *
 * License of original code:
 * -------------------------------------------------------------------------
 *   Permission to use, copy, modify, and distribute this software and its
 *   documentation for any purpose and without fee is hereby granted,
 *   provided that the above copyright notice appear in all copies and that
 *   both that copyright notice and this permission notice appear in
 *   supporting documentation.
 *
 *   This file is provided AS IS with no warranties of any kind.  The author
 *   shall have no liability with respect to the infringement of copyrights,
 *   trade secrets or any patents by this file or any part thereof.  In no
 *   event will the author be liable for any lost revenue or profits or
 *   other special, indirect and consequential damages.
 * -------------------------------------------------------------------------
 *
 * License of modifications/additions made after 2009-01-01:
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

import {
    TIME_BETWEEN_MOVES,
    DURATION_AUTODROP_MINIMUM,
    AUTODROP_SPEEDUP_FACTOR,
} from './speeds.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** DealerScene::speedUpTime() */
function speedUp(delay, factor) {
    if (delay < DURATION_AUTODROP_MINIMUM) return delay;
    return Math.max(delay * factor, DURATION_AUTODROP_MINIMUM);
}

/**
 * Automatické odkládání karet na foundation (DealerScene::startDrop/drop/stopDrop).
 *
 *  - enabled: volba „automatické odkládání“; po každém novém stavu hry se
 *    odkládání zařadí do fronty a spustí, až doběhnou animace.
 *  - start(): ruční akce Drop (běží i při vypnuté volbě).
 *  - stop(): přeruší odkládání (klik, undo, redo, ...).
 */
export class AutoDrop {
    /**
     * @param {import('./game.js').Game} game
     * @param {{waitIdle?: () => Promise<void>, onActive?: (active: boolean) => void}} [opts]
     */
    constructor(game, { waitIdle = () => Promise.resolve(), onActive = () => {} } = {}) {
        this.game = game;
        this.waitIdle = waitIdle;
        this.onActive = onActive;
        this.enabled = false;
        this.active = false;
        this.factor = 1;
        this.queueToken = 0;
        this.runToken = 0;
    }

    setGame(game) {
        this.stop();
        this.game = game;
    }

    setEnabled(enabled) {
        this.enabled = !!enabled;
        if (!this.enabled) this.stop();
    }

    /** Zařadí odkládání do fronty (jako m_dropQueued v takeState()). */
    kick() {
        if (!this.enabled || this.active || this.game.won || this.game.canRedo) return;
        const t = ++this.queueToken;
        this.waitIdle().then(() => {
            if (t === this.queueToken && this.enabled && !this.active) this.start();
        });
    }

    /** Volá se z main.js při každé události hry. */
    handleEvent(type) {
        switch (type) {
            case 'move':
            case 'click':
                if (!this.active) this.kick();     // vlastní odložení neodstartuje další frontu
                break;
            case 'start':
                this.stop();
                this.kick();
                break;
            case 'undo':
            case 'redo':
            case 'won':
                this.stop();
                break;
        }
    }

    start() {
        if (this.active || this.game.won) return;
        this.active = true;
        this.factor = 1;
        const token = ++this.runToken;
        this.onActive(true);
        this.#run(token);
    }

    stop() {
        this.queueToken++;
        this.runToken++;
        if (this.active) {
            this.active = false;
            this.onActive(false);
        }
    }

    async #run(token) {
        const alive = () => this.active && token === this.runToken;

        while (alive()) {
            const candidate = this.game.nextDrop();
            if (!candidate) break;

            this.game.drop(candidate, { speed: Math.min(1 / this.factor, 3) });
            this.factor = Math.max(this.factor * AUTODROP_SPEEDUP_FACTOR, 0.2);

            await this.waitIdle();
            if (!alive()) return;
            await sleep(speedUp(TIME_BETWEEN_MOVES, this.factor));
        }

        if (token === this.runToken && this.active) {
            this.active = false;
            this.onActive(false);
        }
    }
     }
