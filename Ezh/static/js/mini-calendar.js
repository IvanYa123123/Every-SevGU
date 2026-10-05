// Мини-календарь в сайдбаре: компактная месячная сетка.
// Точки на днях, где есть заметки / пары / кастомные события.
// Клик по дню — переход на него в основном календаре.
//
// Точки:
//   📝 заметка    — точка цвета акцента
//   🎓 пары       — точка цвета --chart-passed
//   🎯 событие    — точка цвета --status-orange

let _miniCalMonth = new Date();
_miniCalMonth.setDate(1);

const MINI_CAL_WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MINI_CAL_MONTHS = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

function renderMiniCalendar() {
    const container = document.getElementById('miniCalendarBody');
    if (!container) return;

    const year  = _miniCalMonth.getFullYear();
    const month = _miniCalMonth.getMonth();

    const titleEl = document.getElementById('miniCalendarTitle');
    if (titleEl) titleEl.textContent = `${MINI_CAL_MONTHS[month]} ${year}`;

    // --- Источники точек ---
    const datesWithTasks = (typeof taskDatesSet !== 'undefined') ? taskDatesSet : new Set();

    const datesWithSchedule = new Set();
    if (Array.isArray(cachedSchedule)) {
        cachedSchedule.forEach(item => {
            if (item.date) datesWithSchedule.add(item.date);
        });
    }

    const datesWithCustom = new Set();
    if (typeof customScheduleItems !== 'undefined' && Array.isArray(customScheduleItems) && customScheduleItems.length > 0) {
        const firstOfMonth = new Date(year, month, 1);
        const lastOfMonth  = new Date(year, month + 1, 0);
        for (let d = new Date(firstOfMonth); d <= lastOfMonth; d.setDate(d.getDate() + 1)) {
            const ds = getLocalDateStr(d);
            try {
                const items = getCustomItemsForDate(ds);
                if (items && items.length > 0) datesWithCustom.add(ds);
            } catch (e) { /* ignore */ }
        }
    }

    // --- Сетка ---
    const firstDay = new Date(year, month, 1);
    let firstDow = firstDay.getDay();
    if (firstDow === 0) firstDow = 7;
    firstDow -= 1; // 0 = Пн

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = getLocalDateStr(new Date());

    const currentWeekStart = new Date(currentBaseDate);
    currentWeekStart.setHours(0, 0, 0, 0);
    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);

    let html = '<div class="mini-cal-grid">';
    MINI_CAL_WEEKDAYS.forEach(w => {
        html += `<div class="mini-cal-weekday">${w}</div>`;
    });

    for (let i = 0; i < firstDow; i++) {
        html += '<div class="mini-cal-day mini-cal-empty"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dateStr = getLocalDateStr(date);

        const classes = ['mini-cal-day'];
        if (dateStr === todayStr) classes.push('mini-cal-today');
        if (date >= currentWeekStart && date <= currentWeekEnd) classes.push('mini-cal-current-week');

        let dots = '';
        if (datesWithTasks.has(dateStr))    dots += '<span class="mini-cal-dot mini-cal-dot-task" title="Есть заметки"></span>';
        if (datesWithSchedule.has(dateStr)) dots += '<span class="mini-cal-dot mini-cal-dot-class" title="Есть пары"></span>';
        if (datesWithCustom.has(dateStr))   dots += '<span class="mini-cal-dot mini-cal-dot-event" title="Есть события"></span>';

        html += `<div class="${classes.join(' ')}" onclick="miniCalPickDate('${dateStr}')" title="${dateStr}">
            <span class="mini-cal-num">${d}</span>
            <span class="mini-cal-dots">${dots}</span>
        </div>`;
    }

    html += '</div>';
    container.innerHTML = html;
}

function miniCalPrevMonth() {
    _miniCalMonth.setMonth(_miniCalMonth.getMonth() - 1);
    renderMiniCalendar();
}

function miniCalNextMonth() {
    _miniCalMonth.setMonth(_miniCalMonth.getMonth() + 1);
    renderMiniCalendar();
}

function miniCalToday() {
    _miniCalMonth = new Date();
    _miniCalMonth.setDate(1);
    renderMiniCalendar();
}

function miniCalPickDate(dateStr) {
    if (typeof jumpToDate === 'function') {
        jumpToDate(dateStr);
    }
}

// Пересчитывает точки без сброса позиции. Вызывается после
// изменений в расписании, заметках, событиях.
function refreshMiniCalendar() {
    renderMiniCalendar();
}