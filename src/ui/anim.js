/*
 * kpat-web – webová verze KPatience (kpat)
 * Odvozeno z KDE KPatience: https://github.com/KDE/kpat
 *
 * Tento program je svobodný software; můžete jej šířit a/nebo upravovat
 * podle podmínek GNU General Public License, vydané Free Software Foundation,
 * a to buď ve verzi 2, nebo (podle vašeho uvážení) kterékoli pozdější verze.
 * Program je šířen BEZ JAKÉKOLI ZÁRUKY. Viz soubor LICENSE.
 */

/*
 * Poloha karty je ve vlastnosti CSS `translate` (nejvnější transformace),
 * měřítko ve `scale` a otočení v `rotate`. Překlopení karty (rotateY) se
 * děje na vnitřním prvku `.inner`, takže se nemíchá s polohou.
 */

export const DURATION = 220;

const EASING_SMOOTH = 'cubic-bezier(.22,1,.36,1)';        // náhradní křivka, bez dojezdu
const EASING_FLIP = 'cubic-bezier(.45,0,.25,1)';          // překlopení karty
const ELEVATE_RELEASE = 0.55;                             // kdy karta „přistane“ (podíl doby animace)

/** Jemná pružina (podhlcená, přesáhnutí asi 0,5 %) jako CSS `linear()`. */
function makeSpring(zeta = 0.85, omega = 7.5, n = 64) {
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const pts = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const v = 1 - Math.exp(-zeta * omega * t)
        * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
        pts.push(i === n ? 1 : Math.round(v * 10000) / 10000);
    }
    return `linear(${pts.join(', ')})`;
}

const springSupported =
typeof CSS !== 'undefined' && CSS.supports && CSS.supports('animation-timing-function', 'linear(0, 1)');

export const EASING = springSupported ? makeSpring() : EASING_SMOOTH;

// Sdílí stejnou pružinovou křivku s CSS (tlačítka, dialog, rozbalovací seznam…),
// takže veškerý pohyb v aplikaci — ať řízený JS, nebo čistě CSS přechodem — působí jednotně.
if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--spring', EASING);
}

const reducedMotionQuery =
typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

export function motionAllowed() {
    return !(reducedMotionQuery && reducedMotionQuery.matches);
}

/** Doba animace podle uražené vzdálenosti (px). */
export function durationFor(dist, flip = false) {
    const min = flip ? 380 : 240;
    const max = 520;
    return Math.round(Math.min(max, Math.max(min, 190 + dist * 0.22)));
}

/** Okamžitě nastaví polohu prvku (v px vůči kontejneru plochy). */
export function setPos(el, x, y) {
    el._x = x;
    el._y = y;
    el.style.translate = `${x}px ${y}px`;
}

/** Poloha při tažení: výchozí bod + posun. */
export function dragTo(el, from, dx, dy) {
    setPos(el, from.x + dx, from.y + dy);
}

/**
 * Poloha, ve které je prvek právě vidět. Během animace se čte z vypočteného stylu,
 * jinak je shodná s logickou polohou. POZOR: čtení vynucuje přepočet stylů,
 * proto je dobré číst pro více karet najednou, než se začne zapisovat.
 */
export function visualPos(el) {
    const logical = { x: el._x, y: el._y };
    if (!el._anims) return logical;
    const t = getComputedStyle(el).translate;
    if (!t || t === 'none') return logical;
    const [a, b = '0px'] = t.split(' ');
    const x = parseFloat(a);
    const y = parseFloat(b);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : logical;
}

/** Zruší běžící animace karty; karta zůstane v logické (cílové) poloze. */
export function cancelAnim(el) {
    if (el._anims) {
        for (const a of el._anims) a.cancel();
        el._anims = null;
    }
    if (el._elevT) {
        clearTimeout(el._elevT);
        el._elevT = null;
    }
    el.classList.remove('moving');
}

/**
 * Přesune kartu na (x, y); volitelně ji během pohybu překlopí (flipTo = nová strana).
 * Konečná poloha i strana se nastaví hned, animace jen vizuálně „dojíždí“ z viditelné
 * polohy, takže navazuje i na animaci, která ještě běží.
 * @param {object} [o]
 *   duration  ms (výchozí podle vzdálenosti)
 *   delay     ms
 *   flipTo    true = karta se otáčí lícem nahoru, false = rubem nahoru, null = bez otočení
 *   lift      lehké zvětšení při delším přesunu (výchozí true)
 *   elevate   karta se při pohybu zvedne nad ostatní (stín + vyšší z-index); false pro
 *             pouhou změnu odsazení ve stejné hromádce
 *   easing    vlastní křivka (výchozí pružina)
 *   speed     zrychlení animace (1 = běžná rychlost)
 *   from      předem načtená viditelná poloha {x, y} (viz visualPos)
 * @returns {Promise<void>}
 */
export function animateCard(
    el,
    x,
    y,
    {
        duration, delay = 0, flipTo = null, lift = true, elevate = true,
        easing = null, speed = 1, from = null,
    } = {}
) {
    const start = from ?? visualPos(el);
    const fx = start.x ?? x;
    const fy = start.y ?? y;
    cancelAnim(el);
    setPos(el, x, y);

    const dist = Math.hypot(x - fx, y - fy);
    const hasMove = dist >= 0.5;
    const flip = flipTo !== null && flipTo !== undefined;
    if (!motionAllowed() || (!hasMove && !flip)) return Promise.resolve();

    const dur = (duration ?? durationFor(dist, flip)) / speed;
    const wait = delay / speed;
    const peak = flip ? 1.06 : lift && dist > 24 ? 1.045 : 1;
    const anims = [];

    if (hasMove || peak !== 1) {
        const a = `${fx}px ${fy}px`;
        const b = `${x}px ${y}px`;
        let frames;
        if (hasMove && peak === 1) {
            frames = [{ translate: a }, { translate: b }];
        } else if (hasMove) {
            // scale na offsetu 0 vynecháno: začíná z aktuální hodnoty (např. po puštění z tažení)
            frames = [
                { translate: a, offset: 0 },
                { scale: String(peak), offset: 0.4 },
                { translate: b, scale: '1', offset: 1 },
            ];
        } else {
            frames = [
                { scale: String(peak), offset: 0.5 },
                { scale: '1', offset: 1 },
            ];
        }
        anims.push(
            el.animate(frames, {
                duration: dur,
                delay: wait,
                easing: easing ?? (hasMove ? EASING : EASING_FLIP),
                       fill: 'backwards',
            })
        );
    }

    if (flip) {
        const inner = el.querySelector('.inner');
        if (inner) {
            const fromDeg = flipTo ? 180 : 0;
            const toDeg = flipTo ? 0 : 180;
            const flipDur = Math.min(Math.max(dur * 0.85, 380), 520);
            anims.push(
                inner.animate(
                    [{ transform: `rotateY(${fromDeg}deg)` }, { transform: `rotateY(${toDeg}deg)` }],
                              { duration: flipDur, delay: wait, easing: EASING_FLIP, fill: 'backwards' }
                )
            );
        }
    }

    if (!anims.length) return Promise.resolve();

    el._anims = anims;
    if (elevate) {
        // karta je nad ostatními jen po dobu skutečného pohybu, ne po celý pružinový dojezd
        el.classList.add('moving');
        el._elevT = setTimeout(() => {
            el._elevT = null;
            el.classList.remove('moving');
        }, wait + dur * ELEVATE_RELEASE);
    }

    return Promise.all(anims.map(a => a.finished.catch(() => {}))).then(() => {
        if (el._anims === anims) {
            el._anims = null;
            if (el._elevT) {
                clearTimeout(el._elevT);
                el._elevT = null;
            }
            el.classList.remove('moving');
        }
    });
}

/** Zpětně kompatibilní zkratka. */
export function animateTo(el, x, y, opts) {
    return animateCard(el, x, y, opts);
}

/** Přesune skupinu karet s malým zpožděním mezi nimi. */
export function animateGroup(items, { duration, stagger = 0 } = {}) {
    const starts = items.map(it => visualPos(it.el));
    return Promise.all(
        items.map((it, i) =>
        animateCard(it.el, it.x, it.y, {
            duration,
            delay: Math.min(i * stagger, 240),
                    from: starts[i],
        })
        )
    );
}

/** Vrátí karty na původní místo po neplatném puštění: krátce a bez pružinového dojezdu. */
export function snapBack(items) {
    const starts = items.map(it => visualPos(it.el));
    return Promise.all(
        items.map((it, i) => {
            const dist = Math.hypot(it.x - starts[i].x, it.y - starts[i].y);
            return animateCard(it.el, it.x, it.y, {
                from: starts[i],
                duration: Math.round(Math.min(320, Math.max(180, 130 + dist * 0.2))),
                               easing: EASING_SMOOTH,
                               lift: false,
            });
        })
    );
}

/**
 * Oslava výhry: karty odletí po náhodných drahách.
 * @returns {{promise: Promise<void>, cancel: () => void}}
 */
export function celebrate(els, area) {
    if (!motionAllowed()) return { promise: Promise.resolve(), cancel() {} };
    const anims = [];
    els.forEach((el, i) => {
        const x0 = el._x ?? 0;
        const y0 = el._y ?? 0;
        const dx = (Math.random() - 0.5) * area.w * 1.6;
        const dy = area.h + 200 + Math.random() * 200;
        const rot = (Math.random() - 0.5) * 720;
        el.classList.add('moving');
        anims.push(
            el.animate(
                [
                    { translate: `${x0}px ${y0}px`, rotate: '0deg', offset: 0 },
                    { translate: `${x0 + dx * 0.5}px ${y0 - 120}px`, rotate: `${rot / 2}deg`, offset: 0.35, easing: 'ease-in' },
                    { translate: `${x0 + dx}px ${y0 + dy}px`, rotate: `${rot}deg`, offset: 1 },
                ],
                { duration: 1200 + Math.random() * 600, delay: i * 40, easing: 'ease-out', fill: 'forwards' }
            )
        );
    });
    const promise = Promise.all(anims.map(a => a.finished.catch(() => {}))).then(() => {});
    return {
        promise,
        cancel() {
            anims.forEach(a => a.cancel());
            els.forEach(el => el.classList.remove('moving'));
        },
    };
}
