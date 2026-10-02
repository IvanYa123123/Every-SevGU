// T9-автокомплит для полей ввода групп.

function initGroupAutocomplete(input) {
    if (!input) return;

    let dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-list';
    document.body.appendChild(dropdown);
    let currentFocus = -1;

    function positionDropdown() {
        let rect = input.getBoundingClientRect();
        dropdown.style.left = rect.left + 'px';
        dropdown.style.top = (rect.bottom + 2) + 'px';
        dropdown.style.width = Math.max(rect.width, 280) + 'px';
    }
    function hide() { dropdown.style.display = 'none'; currentFocus = -1; }
    function getItems() { return dropdown.querySelectorAll('.autocomplete-item:not(.autocomplete-empty)'); }
    function updateActive() {
        let items = getItems();
        items.forEach((it, i) => it.classList.toggle('active', i === currentFocus));
        if (items[currentFocus]) items[currentFocus].scrollIntoView({ block: 'nearest' });
    }

    function render() {
        let query = input.value.trim();
        let lower = query.toLowerCase();
        let matches = [];
        if (!lower) {
            matches = allGroups.slice(0, 40);
        } else {
            let starts = [], contains = [];
            for (let g of allGroups) {
                let gl = g.toLowerCase();
                if (gl.startsWith(lower)) starts.push(g);
                else if (gl.includes(lower)) contains.push(g);
            }
            matches = starts.concat(contains).slice(0, 50);
        }
        let exact = lower && allGroups.some(g => g.toLowerCase() === lower);

        let html = '';
        if (matches.length === 0 && !query) {
            html = '<div class="autocomplete-item autocomplete-empty">Справочник групп пуст</div>';
        } else if (matches.length === 0) {
            html = '<div class="autocomplete-item autocomplete-empty">Ничего не найдено</div>';
        } else {
            matches.forEach(g => {
                html += `<div class="autocomplete-item" data-value="${escapeAttr(g)}">${highlightMatch(g, query)}</div>`;
            });
        }
        if (query && !exact) {
            html += `<div class="autocomplete-item autocomplete-add" data-add="${escapeAttr(query)}">➕ Добавить группу «${escapeHtml(query)}»</div>`;
        }

        dropdown.innerHTML = html;
        positionDropdown();
        dropdown.style.display = 'block';
        currentFocus = -1;
    }

    input.addEventListener('focus', () => render());
    input.addEventListener('input', () => render());
    input.addEventListener('blur', () => setTimeout(hide, 180));

    input.addEventListener('keydown', (e) => {
        let items = getItems();
        if (dropdown.style.display !== 'block') {
            if (e.key === 'ArrowDown') { render(); e.preventDefault(); }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            currentFocus = (currentFocus + 1) % Math.max(items.length, 1);
            updateActive();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            currentFocus = (currentFocus - 1 + items.length) % Math.max(items.length, 1);
            updateActive();
        } else if (e.key === 'Enter') {
            if (currentFocus > -1 && items[currentFocus]) {
                e.preventDefault();
                e.stopPropagation();
                items[currentFocus].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            } else if (items.length > 0 && input.value.trim()) {
                let exact = allGroups.some(g => g.toLowerCase() === input.value.trim().toLowerCase());
                if (exact) hide();
            }
        } else if (e.key === 'Escape') {
            hide();
        }
    });

    dropdown.addEventListener('mousedown', async (e) => {
        let item = e.target.closest('.autocomplete-item');
        if (!item) return;
        e.preventDefault();
        e.stopPropagation();
        if (item.dataset.value) {
            input.value = item.dataset.value;
            hide();
            input.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (item.dataset.add) {
            let name = item.dataset.add.trim();
            if (!name) return;
            try {
                let data = await apiAddCustomGroup(name);
                if (data.success) {
                    if (!validGroups.has(name.toUpperCase())) {
                        validGroups.add(name.toUpperCase());
                        allGroups.push(name);
                    }
                    input.value = name;
                    hide();
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } catch (err) { console.error(err); }
        }
    });

    window.addEventListener('scroll', () => {
        if (dropdown.style.display === 'block') positionDropdown();
    }, true);
    window.addEventListener('resize', () => {
        if (dropdown.style.display === 'block') positionDropdown();
    });
}
