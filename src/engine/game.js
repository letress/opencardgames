/*
 * kpat-web – webová verze KPatience (kpat)
 * Odvozeno z KDE KPatience: https://github.com/KDE/kpat
 *
 * Tento program je svobodný software; můžete jej šířit a/nebo upravovat
 * podle podmínek GNU General Public License, vydané Free Software Foundation,
 * a to buď ve verzi 2, nebo (podle vašeho uvážení) kterékoli pozdější verze.
 * Program je šířen BEZ JAKÉKOLI ZÁRUKY. Viz soubor LICENSE.
 */

import {
    createState, cloneState, createRng, randomSeed, findCard, History,
} from './state.js';
import { isDeadEnd } from './solver.js';

/*
 * KONTRAKT DEFINICE HRY (objekt exportovaný ze src/games/*.js)
 *
 *  id, name        řetězce
 *  layout          {pileId: {x, y, fan, type, spread?, bottomPadding?, anchor?, z?, noSlot?, jitter?}}
 *                  x, y v jednotkách šířky/výšky karty (jako v kpat);
 *                  type: 'stock' | 'waste' | 'foundation' | 'tableau' | ...
 *  dealOrigin      volitelné {x, y}: odkud karty při rozdání vyletí
 *  deal(state, rng)                povinné
 *  canDrag(state, pile, idx)       povinné
 *  canDrop(state, cards, toPile, fromPile)   povinné
 *  onClick(state, pile, idx)       volitelné; true = změnila stav
 *  onMove(state, {from, idx, to, moved})     volitelné; hák po přesunu (např. bodování)
 *  actions {name: fn(state)}       volitelné; akce bez hromádky (např. redeal)
 *  canAction(state, name)          volitelné
 *  canDeal(state)                  volitelné
 *  autoMove(state, pile, idx)      volitelné; dvojklik
 *  dropCandidates(state)           volitelné; [{from, idx, to}] pro automatické odkládání
 *  afterDrop(state, move)          volitelné
 *  afterMove(state)                volitelné
 *  isWon(state)                    povinné
 *  isLost(state)                   volitelné; true = už nelze vyhrát (jinak Game.isLost()
 *                                  obecně prohledá dosažitelný stavový prostor, viz solver.js)
 *  noUndo                          volitelné; true = bez kroku zpět a vpřed
 *  scoring                         volitelné; true = hra má skóre (state.meta.score)
 *  rounds, carryOver(state)        volitelné; vícekolová hra a co se přenáší do dalšího kola
 */

 export class Game {
     constructor(def, seed = randomSeed()) {
         this.def = def;
         this.pileIds = Object.keys(def.layout);
         this.foundationIds = this.pileIds.filter(id => def.layout[id].type === 'foundation');
         this.history = new History();
         this.listeners = new Set();
         this.start(seed);
     }

     /** Nové rozdání (stejné číslo = stejná hra). */
     start(seed = randomSeed()) {
         this.seed = seed;
         this.state = createState(this.pileIds);
         this.moves = 0;
         this.won = false;
         this.history.clear();
         this.def.deal(this.state, createRng(seed));
         this.#emit('start');
     }

     /** Znovu stejné rozdání. */
     restart() {
         this.start(this.seed);
     }

     /** Další kolo vícekolové hry: nové rozdání, skóre a číslo kola se přenesou. */
     nextRound() {
         if (!this.def.carryOver) return false;
         const keep = this.def.carryOver(this.state);
         this.seed = randomSeed();
         this.state = createState(this.pileIds);
         this.won = false;
         this.history.clear();
         this.def.deal(this.state, createRng(this.seed));
         Object.assign(this.state.meta, keep);
         this.#emit('start');
         return true;
     }

     subscribe(fn) {
         this.listeners.add(fn);
         return () => this.listeners.delete(fn);
     }

     #emit(type, info) {
     for (const fn of this.listeners) fn({ type, info, game: this });
     }

     /**
      * Provede změnu stavu s možností undo. Neúspěšná změna se nezaznamená.
      * `post` se zavolá po afterMove ve stejném kroku zpět (např. dobrání po odložení).
      */
     #transaction(fn, post = null) {
     const savedFuture = this.history.future.slice();
     this.history.record(this.state);
     const changed = fn();
     if (!changed) {
         this.history.past.pop();
         this.history.future = savedFuture;
         return false;
     }
     this.moves++;
     if (this.def.afterMove) this.def.afterMove(this.state);
     if (post) post();
     return true;
     }

     #checkWin() {
     if (!this.won && this.def.isWon(this.state)) {
         this.won = true;
         this.#emit('won');
     }
     }

     /**
      * m_cardsRemovedFromFoundations: karty, které hráč sám vzal z foundation,
      * se automaticky neodkládají znovu.
      */
     #trackTakenDown(from, to, moved) {
     const td = new Set(this.state.meta.takenDown || []);
     if (this.foundationIds.includes(from) && !this.foundationIds.includes(to)) {
         for (const c of moved) td.add(c.id);
     } else {
         for (const c of moved) td.delete(c.id);
     }
     this.state.meta.takenDown = [...td];
     }

     /** Karty od idx do konce hromádky (kopie referencí). */
     cards(pile, idx) {
         return this.state.piles[pile].slice(idx);
     }

     locate(cardId) {
         return findCard(this.state, cardId);
     }

     canDrag(pile, idx) {
         if (this.won) return false;
         const p = this.state.piles[pile];
         if (!p || idx < 0 || idx >= p.length) return false;
         return !!this.def.canDrag(this.state, pile, idx);
     }

     canDrop(fromPile, idx, toPile) {
         if (fromPile === toPile) return false;
         if (!this.canDrag(fromPile, idx)) return false;
         return !!this.def.canDrop(this.state, this.cards(fromPile, idx), toPile, fromPile);
     }

     /**
      * Přesun karet od idx z `from` na `to`. Vrací true při úspěchu.
      * @param {{auto?: boolean, speed?: number}} [opts]  auto = automatické odložení
      */
     move(from, idx, to, { auto = false, speed = 1 } = {}) {
         if (!this.canDrop(from, idx, to)) return false;
         const ok = this.#transaction(
             () => {
                 const moved = this.state.piles[from].splice(idx);
                 this.state.piles[to].push(...moved);
                 this.#trackTakenDown(from, to, moved);
                 if (this.def.onMove) this.def.onMove(this.state, { from, idx, to, moved });
                 return true;
             },
             auto && this.def.afterDrop
             ? () => this.def.afterDrop(this.state, { from, idx, to })
             : null
         );
         if (ok) {
             this.#emit('move', { from, idx, to, auto, speed });
             this.#checkWin();
         }
         return ok;
     }

     /** Klik na kartu/hromádku (např. dobrání ze stocku). */
     click(pile, idx) {
         if (this.won || !this.def.onClick) return false;
         const ok = this.#transaction(() => !!this.def.onClick(this.state, pile, idx));
         if (ok) {
             this.#emit('click', { pile, idx });
             this.#checkWin();
         }
         return ok;
     }

     /** Akce hry bez ukazování na hromádku (např. Redeal v Grandfather). */
     action(name) {
         const fn = this.def.actions && this.def.actions[name];
         if (!fn || this.won) return false;
         const ok = this.#transaction(() => !!fn(this.state));
         if (ok) {
             this.#emit('click', { action: name });
             this.#checkWin();
         }
         return ok;
     }

     canAction(name) {
         return !this.won && !!(this.def.canAction && this.def.canAction(this.state, name));
     }

     /** Dá se ještě dobrat z talonu (Klondike)? */
     canDeal() {
         return !this.won && !!(this.def.canDeal && this.def.canDeal(this.state));
     }

     /** Dvojklik: karta se sama přesune na vhodné místo. */
     autoMove(pile, idx) {
         if (!this.def.autoMove || !this.canDrag(pile, idx)) return false;
         const to = this.def.autoMove(this.state, pile, idx);
         return to ? this.move(pile, idx, to) : false;
     }

     /**
      * Další přesun pro automatické odkládání (DealerScene::drop):
      * první kandidát, který smí na foundation a kterou hráč sám nesundal z foundation.
      */
     nextDrop() {
         if (this.won || !this.def.dropCandidates) return null;
         const taken = new Set(this.state.meta.takenDown || []);
         for (const c of this.def.dropCandidates(this.state)) {
             const card = this.state.piles[c.from][c.idx];
             if (!card || taken.has(card.id)) continue;
             if (this.canDrop(c.from, c.idx, c.to)) return c;
         }
         return null;
     }

     /** Provede automatické odložení (každé je samostatný krok zpět). */
     drop(candidate, { speed = 1 } = {}) {
         return this.move(candidate.from, candidate.idx, candidate.to, { auto: true, speed });
     }

     hint() {
         return this.def.hint ? this.def.hint(this.state) : null;
     }

     /**
      * Všechny karty, které lze někam přesunout (obdoba DealerScene::bruteForceHints()).
      * Používá jen canDrag/canDrop definice hry. Vrací [{from, idx, to, card}].
      */
     hints() {
         if (this.won) return [];
         const { piles } = this.state;
         const out = [];

         for (const from of this.pileIds) {
             if (this.foundationIds.includes(from)) continue;   // z foundation se nenapovídá
             const pile = piles[from];

             let first = 0;                                      // první odkrytá karta
             while (first < pile.length && !pile[first].up) first++;

             for (let idx = first; idx < pile.length; idx++) {
                 if (!this.canDrag(from, idx)) continue;
                 const moving = pile.slice(idx);
                 const below = pile.slice(first, idx);            // odkryté karty pod přesouvanými

                 for (const to of this.pileIds) {
                     if (to === from) continue;
                     const toFoundation = this.foundationIds.includes(to);
                     const destEmpty = piles[to].length === 0;

                     // celý sloupec na prázdné místo nemá smysl
                     if (idx === 0 && destEmpty && !toFoundation) continue;
                     if (!this.def.canDrop(this.state, moving, to, from)) continue;

                     // přesun karet, které už správně navazují na kartu pod sebou, nemá smysl
                     const opensCard = below.length === 0 && !destEmpty;
                     if (!toFoundation && !opensCard && this.#isConnected(from, below, moving)) continue;

                     out.push({ from, idx, to, card: pile[idx] });
                 }
             }
         }
         return out;
     }

     /** Navazují přesouvané karty platně na odkryté karty pod nimi? */
     #isConnected(pileId, below, moving) {
     const tmp = { piles: { ...this.state.piles, [pileId]: below }, meta: this.state.meta };
     return !!this.def.canDrop(tmp, moving, pileId, pileId);
     }

     /**
      * Je hra uvíznutá, tj. z aktuální pozice už nevede žádná posloupnost
      * tahů k výhře (obdoba DealerScene::isGameLost() z kpat, která se ptá
      * svého patsolve řešiče, ne jen jestli existuje jeden tah)? Hra sama
      * definuje `isLost`, pokud umí poznat konkrétní prohranou pozici
      * (např. Pyramids); jinak se prohledá dosažitelný stavový prostor
      * (viz engine/solver.js) — jednotahová heuristika (jako u tlačítka Tip)
      * by zbytečně přeskakovala tahy, co „nevypadají užitečně“, ale přitom
      * mohou být nutné k odemčení výhry.
      */
     isLost() {
     if (this.won) return false;
     if (this.def.isLost) return !!this.def.isLost(this.state);
     return isDeadEnd(this.def, this.state, this.pileIds);
     }

     get canUndo() { return !this.def.noUndo && this.history.canUndo; }
     get canRedo() { return !this.def.noUndo && this.history.canRedo; }

     undo() {
         if (this.def.noUndo) return false;

         const inFoundation = new Set();
         for (const f of this.foundationIds) {
             for (const c of this.state.piles[f]) inFoundation.add(c.id);
         }

         const prev = this.history.undo(this.state);
         if (!prev) return false;

         // Karty, které se undo vrátily z foundation, se hned znovu neodkládají.
         const stillIn = new Set();
         for (const f of this.foundationIds) {
             for (const c of prev.piles[f]) stillIn.add(c.id);
         }
         const td = new Set(prev.meta.takenDown || []);
         for (const id of inFoundation) if (!stillIn.has(id)) td.add(id);
         prev.meta.takenDown = [...td];

         this.state = prev;
         this.moves = Math.max(0, this.moves - 1);
         this.won = false;
         this.#emit('undo');
         return true;
     }

     redo() {
         if (this.def.noUndo) return false;
         const next = this.history.redo(this.state);
         if (!next) return false;
         this.state = next;
         this.moves++;
         this.#emit('redo');
         this.#checkWin();
         return true;
     }

     /** Uložení rozehrané hry (bez historie). */
     save() {
         return { id: this.def.id, seed: this.seed, moves: this.moves, state: cloneState(this.state) };
     }

     /** Načtení uložené hry; vrací true při shodě id hry. */
     load(data) {
         if (!data || data.id !== this.def.id) return false;
         this.seed = data.seed;
         this.state = cloneState(data.state);
         this.moves = data.moves || 0;
         this.history.clear();
         this.won = this.def.isWon(this.state);
         this.#emit('start');
         return true;
     }
      }
