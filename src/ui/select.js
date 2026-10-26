/*
 * kpat-web – a web version of KPatience (kpat)
 * A small accessible "select-only" combobox (APG pattern), fully styled with CSS.
 * Native <select> popups are OS chrome and can't reliably be themed across browsers,
 * so the game picker uses this instead.
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation, either version 2, or (at your option) any
 * later version. This program is distributed WITHOUT ANY WARRANTY.
 * See the LICENSE file.
 */

/**
 * @param {HTMLElement} root    the `.select` wrapper already in the DOM (button + menu inside)
 * @param {{id: string, name: string}[]} items
 * @param {(id: string) => void} onChange  called when the user picks a different item
 * @returns {{ setValue(id: string): void }}
 */
export function createSelect(root, items, onChange) {
    const btn = root.querySelector('.select-btn');
    const label = root.querySelector('.select-label');
    const menu = root.querySelector('.select-menu');

    let value = items[0] ? items[0].id : null;
    let active = 0;
    let open = false;

    menu.innerHTML = '';
    const optionEls = items.map((item, i) => {
        const li = document.createElement('li');
        li.id = `${menu.id}-opt-${i}`;
        li.setAttribute('role', 'option');
        li.className = 'select-option';
        li.textContent = item.name;
        menu.appendChild(li);
        return li;
    });

    function render() {
        const item = items.find(i => i.id === value);
        label.textContent = item ? item.name : '';
        optionEls.forEach((li, i) => {
            li.setAttribute('aria-selected', String(items[i].id === value));
            li.classList.toggle('is-selected', items[i].id === value);
        });
    }

    function setActive(i) {
        active = Math.max(0, Math.min(items.length - 1, i));
        optionEls.forEach((li, j) => li.classList.toggle('is-active', j === active));
        btn.setAttribute('aria-activedescendant', optionEls[active].id);
        optionEls[active].scrollIntoView({ block: 'nearest' });
    }

    function onOutside(e) {
        if (!root.contains(e.target)) closeMenu();
    }

    function openMenu() {
        if (open) return;
        open = true;
        menu.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        const idx = items.findIndex(i => i.id === value);
        setActive(idx < 0 ? 0 : idx);
        document.addEventListener('pointerdown', onOutside, true);
    }

    function closeMenu({ focusBtn = false } = {}) {
        if (!open) return;
        open = false;
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        btn.removeAttribute('aria-activedescendant');
        document.removeEventListener('pointerdown', onOutside, true);
        if (focusBtn) btn.focus();
    }

    function choose(i) {
        const item = items[i];
        if (!item) return;
        const changed = item.id !== value;
        value = item.id;
        render();
        closeMenu({ focusBtn: true });
        if (changed) onChange(value);
    }

    btn.addEventListener('click', () => (open ? closeMenu({ focusBtn: true }) : openMenu()));

    btn.addEventListener('keydown', e => {
        if (!open) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openMenu();
            }
            return;
        }
        switch (e.key) {
            case 'ArrowDown': e.preventDefault(); setActive(active + 1); break;
            case 'ArrowUp': e.preventDefault(); setActive(active - 1); break;
            case 'Home': e.preventDefault(); setActive(0); break;
            case 'End': e.preventDefault(); setActive(items.length - 1); break;
            case 'Enter':
            case ' ': e.preventDefault(); choose(active); break;
            case 'Escape': e.preventDefault(); closeMenu({ focusBtn: true }); break;
            case 'Tab': closeMenu(); break;
            default: break;
        }
    });

    optionEls.forEach((li, i) => {
        li.addEventListener('pointerenter', () => setActive(i));
        li.addEventListener('click', () => choose(i));
    });

    render();

    return {
        setValue(id) {
            if (id === value) return;
            value = id;
            render();
        },
    };
}
