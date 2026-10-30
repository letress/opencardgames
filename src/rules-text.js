/*
 * kpat-web – a web version of KPatience (kpat)
 * Rules text shown by the "Rules" button, written to match this
 * implementation's actual mechanics (not a generic description of the
 * classic game, since several variants here have their own small twists).
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 2, or (at your option) any
 * later version. This program is distributed WITHOUT ANY WARRANTY.
 * See the LICENSE file.
 */

// Each entry is a list of blocks: { h: heading } | { p: paragraph } | { ul: [items] }

const klondikeCommon = draw => [
    { p: 'Build all four foundations up in suit, from the Ace to the King.' },
    { h: 'Tableau' },
    {
        p: 'Seven columns, dealt with 1 to 7 cards each and only the top card face up. '
        + 'Build sequences going down in rank, alternating colours (for example a red 8 on a black 9). '
        + 'A face-up sequence can be dragged as a group. Only a King (or a sequence starting with one) '
        + 'can be placed on an empty column.',
    },
    { h: 'Stock & waste' },
    {
        p: draw === 1
        ? 'Click the stock to turn one card onto the waste pile.'
        : 'Click the stock to turn up to three cards onto the waste pile — only the top one can be played.',
    },
    { p: 'Once the stock is empty, click it again to flip the waste back into a new stock, face down — you can go through the deck as many times as you like.' },
    { h: 'Win' },
    { p: 'All 52 cards end up on the foundations.' },
];

const spiderCommon = suits => [
    { p: 'Clear all 104 cards (two decks) off the table by building complete King-to-Ace runs, one suit at a time.' },
    { h: 'Setup' },
    { p: 'Ten columns, dealt from a shuffled two-deck shoe: the first four columns get 5 cards, the rest get 4, all face down except the top card of each column.' },
    { h: 'Tableau' },
    {
        p: 'Drag any card (and anything stacked on it) onto a card exactly one rank higher — suit doesn\'t matter for placing a card. '
        + 'But you can only pick up and move several cards together if they already form an unbroken same-suit run in descending order '
        + '(for example 9♠-8♠-7♠); otherwise only the single top card can move. An empty column accepts any card or run.',
    },
    { h: 'Stock' },
    { p: 'Click the stock to deal one new card face up onto every column — there are 5 such deals in the stock, 50 cards in total.' },
    { h: 'Completing a suit' },
    { p: 'Whenever a column holds a complete King-down-to-Ace run of one suit, face up, it\'s swept off the table automatically and counted as done — no need to drag it anywhere.' },
    { h: 'Suits in play' },
    { p: suits === 1
      ? 'Easiest variant: the whole shoe is a single suit (Spades), so any card can legally follow any other — only the sequencing rule for picking up multiple cards together still applies.'
      : suits === 2
      ? 'Medium variant: two suits (Hearts and Spades), each appearing four times across the two decks.'
      : 'Hardest variant: all four suits, exactly as in a normal double deck — matching suits for a movable run are the hardest to line up.' },
    { h: 'Win' },
    { p: 'All 104 cards have been swept into 8 completed runs.' },
];

export const RULES = {
    klondike: { name: 'Klondike (Draw 1)', blocks: klondikeCommon(1) },
    klondike3: { name: 'Klondike (Draw 3)', blocks: klondikeCommon(3) },

    grandfather: {
        name: 'Grandfather',
        blocks: [
            { p: 'Build all four foundations up in suit, from the Ace to the King. There is no stock — every card is in play from the start.' },
            { h: 'Setup' },
            { p: 'All 52 cards are dealt into seven columns in a back-and-forth pattern; only the top card of each column is face up.' },
            { h: 'Tableau' },
            { p: 'Move a face-up card (and anything stacked on it) onto a card one rank higher of the same suit — for example a 6♠ onto a 7♠. An empty column only accepts a King.' },
            { h: 'Redeal' },
            { p: 'When nothing more can be done, use Redeal to gather every column and deal them out again the same way. You get two redeals, for three deals in total.' },
            { h: 'Win' },
            { p: 'All 52 cards end up on the foundations.' },
        ],
    },

    fortyeight: {
        name: 'Forty & Eight',
        blocks: [
            { p: 'Played with two decks (104 cards) and eight foundations — build each one up in suit from the Ace to the King.' },
            { h: 'Setup' },
            { p: 'Eight tableau columns are dealt four cards each, all face up; the rest of the deck becomes the stock, with one card already turned onto the waste pile.' },
            { h: 'Tableau' },
            {
                p: 'Columns build downward in the same suit (e.g. 9♥ on 10♥). Only a card matching the suit and rank of the destination\'s top card can be added, '
                + 'and an empty column accepts any card. A whole sequence can be moved at once, but the number of cards you can move together is limited by how '
                + 'many empty columns you currently have (more empty columns, bigger moves).',
            },
            { h: 'Stock & waste' },
            { p: 'Click the stock to turn one card onto the waste pile. The waste can be turned back into a new stock only once per game.' },
            { h: 'Win' },
            { p: 'All 104 cards end up on the foundations.' },
        ],
    },

    victorian: {
        name: 'Victorian',
        blocks: [
            { p: 'Build all four foundations up in suit, from the Ace to the King. There is no stock — all 52 cards are dealt face up from the start.' },
            { h: 'Setup' },
            { p: 'Eight tableau columns, dealt the whole deck face up (seven columns of 7 cards, four columns of 6).' },
            { h: 'Tableau' },
            { p: 'Move a run of cards that descends by one rank and stays the same colour — suit doesn\'t matter, so a black 6 can sit on a black 7 of either suit. An empty column accepts any card.' },
            { h: 'Mantel' },
            { p: 'Four small cells, one per suit. Each one holds a single card and only accepts a card of its own suit — handy as a short-term parking spot while you dig for what\'s underneath.' },
            { h: 'Win' },
            { p: 'All 52 cards end up on the foundations.' },
        ],
    },

    sabine: {
        name: 'Sabine',
        blocks: [
            { p: 'Build all four foundations up in suit, from the Ace to the King.' },
            { h: 'Setup' },
            { p: 'Seven columns are dealt four cards each, face up; the remaining 24 cards form the stock.' },
            { h: 'Tableau' },
            {
                p: 'Columns run in a circle where the Ace follows the King, and suit doesn\'t matter at all. '
                + 'A run can go either up or down in rank, but once a column\'s direction is set by its top two cards, '
                + 'every card you add must continue the same way — it can never reverse. An empty column accepts any card or run.',
            },
            { h: 'Stock & waste' },
            { p: 'Click the stock to turn one card onto the waste pile. There is no redeal — once the stock runs out, it\'s gone for good.' },
            { h: 'Win' },
            { p: 'All 52 cards end up on the foundations.' },
        ],
    },

    spider1: { name: 'Spider (1 Suit)', blocks: spiderCommon(1) },
    spider2: { name: 'Spider (2 Suit)', blocks: spiderCommon(2) },
    spider4: { name: 'Spider (4 Suit)', blocks: spiderCommon(4) },

    castle: {
        name: 'Castle',
        blocks: [
            { p: 'Build all four foundations up in suit, from the Ace to the King. There is no stock — every card is in play from the start.' },
            { h: 'Setup' },
            { p: 'The four Aces start already on their foundations. The other 48 cards are dealt face up into eight columns, six cards each.' },
            { h: 'Tableau' },
            {
                p: 'Columns build downward by rank alone — suit and colour don\'t matter, so any 9 can hold any 8. '
                + 'A run of consecutive descending cards can be moved together, but only up to a limit: with no empty columns you can only move '
                + 'one card at a time, and each additional empty column doubles how many you can carry in one move. An empty column accepts any card.',
            },
            { h: 'Win' },
            { p: 'All 52 cards end up on the foundations.' },
        ],
    },

    pyramids: {
        name: 'Pyramids',
        blocks: [
            { p: 'Clear the pyramid of all 28 cards, across three rounds.' },
            { h: 'Setup' },
            { p: 'The 28 cards form a four-row pyramid, all face up and overlapping. The rest of the deck is the stock, with one card already on the waste pile, plus a single wild Joker.' },
            { h: 'Play' },
            {
                p: 'A pyramid card can only be played once it\'s fully uncovered — nothing left resting on it. '
                + 'Click an exposed card (or drag it) onto the waste pile if its rank is exactly one away from the waste\'s top card — suit doesn\'t matter, and the King and Ace count as neighbours. '
                + 'The Joker is wild: it can be played on anything, and anything can be played on it.',
            },
            { p: 'Click the stock to draw a new card onto the waste pile — this costs 5 points and resets your current streak.' },
            { h: 'Scoring' },
            { ul: [
                'Each pyramid card cleared in an unbroken streak is worth more than the last: 5, 10, 15, …',
                'Playing the Joker costs 50 points.',
                'Clearing the whole pyramid earns a 50-point bonus and starts the next round.',
            ] },
            { h: 'End of round' },
            { p: 'A round ends once the stock is empty, the Joker has already been played, and no exposed card can be played on the waste pile.' },
        ],
    },

    tripeaks: {
        name: 'Tri Peaks',
        blocks: [
            { p: 'Clear all 28 tableau cards in a single round.' },
            { h: 'Setup' },
            { p: 'Three small pyramids ("peaks") sit on one shared row of 10 cards. Only that bottom row starts face up — every peak card starts face down.' },
            { h: 'Play' },
            {
                p: 'Click an exposed, face-up card (or drag it) onto the waste pile if its rank is exactly one away from the waste\'s top card — suit doesn\'t matter, '
                + 'and the King and Ace count as neighbours. Once a card is no longer covered by the two cards resting on it, it flips face up automatically.',
            },
            { p: 'Click the stock to draw a new card onto the waste pile — this resets your current streak (there\'s no draw cost).' },
            { h: 'Scoring' },
            { ul: [
                'Each card played in an unbroken streak is worth more than the last: 10, 20, 30, …',
                'Clearing the whole tableau earns a 100-point bonus.',
            ] },
            { h: 'End of game' },
            { p: 'The game ends once the stock is empty and no exposed card can be played on the waste pile.' },
        ],
    },

    lantern: {
        name: 'Lantern',
        blocks: [
            { p: 'Clear the 28-card pyramid in a single round.' },
            { h: 'Setup' },
            { p: 'Seven rows (1 up to 7 cards) build a triangle. Only the wide bottom row starts face up — every other card starts face down and unknown.' },
            { h: 'Play' },
            {
                p: 'Click an exposed, face-up card (or drag it) onto the waste pile if its rank is exactly one away from the waste\'s top card — suit doesn\'t matter, '
                + 'and the King and Ace count as neighbours. A card becomes exposed, and flips face up, once nothing rests on it any more.',
            },
            { p: 'Click the stock to draw a new card onto the waste pile — this resets your current streak. The stock can be reshuffled from the waste and redealt twice, so you get three passes through it in total.' },
            { h: 'The lantern' },
            {
                p: 'Still-buried cards don\'t have to stay a mystery: click any face-down card, even one with two cards resting on top of it, to pay 8 points '
                + 'and turn it face up right where it sits. It won\'t be playable until it\'s actually free, but now you know what\'s waiting — plan your '
                + 'moves around it instead of hoping for the best.',
            },
            { h: 'Scoring' },
            { ul: [
                'Each card played in an unbroken streak is worth more than the last: 10, 20, 30, …',
                'Revealing a card early with the lantern costs 8 points.',
                'A card you paid to reveal earns a 15-point bonus back the moment it finally becomes exposed for real.',
                'Clearing an entire row of the pyramid earns a 20-point bonus.',
                'Clearing the whole pyramid earns a 100-point bonus.',
            ] },
            { h: 'End of game' },
            { p: 'The game ends once the stock and all redeals are exhausted and no exposed card can be played on the waste pile.' },
        ],
    },
};
