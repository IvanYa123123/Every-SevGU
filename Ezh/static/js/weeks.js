// Навигация по неделям: dropdown, "Сегодня", стрелки, дельта-переход.

function updateWeekDropdown() {
    let menu = document.getElementById("weekDropdownMenu");
    let btn = document.getElementById("weekDropdownBtn");
    if (!menu || !btn) return;
    menu.innerHTML = "";

    let realBase = new Date();
    realBase.setDate(realBase.getDate() - (realBase.getDay() === 0 ? 6 : realBase.getDay() - 1));
    realBase.setHours(0, 0, 0, 0);

    let currBase = new Date(currentBaseDate);
    currBase.setHours(0, 0, 0, 0);
    let currentOffset = Math.round((currBase - realBase) / (7 * 24 * 60 * 60 * 1000));

    for (let i = -20; i <= 20; i++) {
        let d = new Date(realBase);
        d.setDate(d.getDate() + (i * 7));
        let endD = new Date(d);
        endD.setDate(endD.getDate() + 6);
        let label = `${d.toLocaleDateString('ru-RU', {day:'numeric', month:'short'})} - ${endD.toLocaleDateString('ru-RU', {day:'numeric', month:'short'})}`;
        if (i === 0) label = `🏠 Текущая: ${label}`;

        let li = document.createElement('li');
        let a = document.createElement('a');
        a.className = 'dropdown-item' + (i === currentOffset ? ' active' : '');
        a.href = '#';
        a.textContent = label;
        a.onclick = (e) => { e.preventDefault(); jumpToWeek(i); };
        li.appendChild(a);
        menu.appendChild(li);
    }

    let dBtn = new Date(realBase);
    dBtn.setDate(dBtn.getDate() + (currentOffset * 7));
    let endDBtn = new Date(dBtn);
    endDBtn.setDate(endDBtn.getDate() + 6);
    btn.textContent = `📅 ${dBtn.toLocaleDateString('ru-RU', {day:'numeric', month:'short'})} - ${endDBtn.toLocaleDateString('ru-RU', {day:'numeric', month:'short'})}`;

    btn.addEventListener('shown.bs.dropdown', () => {
        setTimeout(() => {
            let active = menu.querySelector('.dropdown-item.active');
            if (active) active.scrollIntoView({ block: 'center' });
        }, 30);
    }, { once: true });
}

function jumpToWeek(offsetVal) {
    let realBase = new Date();
    realBase.setDate(realBase.getDate() - (realBase.getDay() === 0 ? 6 : realBase.getDay() - 1));
    currentBaseDate = new Date(realBase);
    currentBaseDate.setDate(currentBaseDate.getDate() + (parseInt(offsetVal) * 7));
    if (expandedDayDateStr !== null) expandedDayDateStr = getLocalDateStr(currentBaseDate);
    renderCalendar();
}

function goToToday() {
    let realTodayStr = getLocalDateStr(new Date());
    currentBaseDate = new Date();
    currentBaseDate.setDate(currentBaseDate.getDate() - (currentBaseDate.getDay() === 0 ? 6 : currentBaseDate.getDay() - 1));
    if (expandedDayDateStr !== null) expandedDayDateStr = realTodayStr;
    renderCalendar();
}

function changeWeek(offset) {
    currentBaseDate.setDate(currentBaseDate.getDate() + (offset * 7));
    if (expandedDayDateStr !== null) expandedDayDateStr = getLocalDateStr(currentBaseDate);
    renderCalendar();
}