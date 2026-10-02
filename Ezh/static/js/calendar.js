// Рендер сетки календаря, раскрытие дня, кастомные события.

function getCustomItemsForDate(dateStr) {
    let items = [];
    let [ty, tm, td] = dateStr.split('-');
    let tDate = new Date(ty, tm - 1, td);

    customScheduleItems.forEach(item => {
        let [by, bm, bd] = item.base_date.split('-');
        let bDate = new Date(by, bm - 1, bd);
        if (tDate < bDate) return;

        let exceptions = [];
        try { exceptions = JSON.parse(item.exceptions || '[]'); } catch (e) {}
        if (exceptions.includes(dateStr)) return;

        let diffDays = Math.round(Math.abs(tDate - bDate) / (1000 * 60 * 60 * 24));
        let match = false;
        if (item.recurrence === 'none' && diffDays === 0) match = true;
        else if (item.recurrence === 'weekly' && diffDays % 7 === 0) match = true;
        else if (item.recurrence === 'biweekly' && diffDays % 14 === 0) match = true;

        if (match) {
            items.push({
                is_custom: true,
                custom_id: item.id,
                base_date: item.base_date,
                recurrence: item.recurrence,
                exceptions: item.exceptions,
                is_event: item.is_event === 1,
                date: dateStr,
                time_range: item.time_range,
                lesson: item.lesson,
                type_name: item.type_name,
                teacher: item.teacher,
                location: item.location
            });
        }
    });
    return items;
}

async function renderCalendar() {
    let openDays = new Set();
    document.querySelectorAll('div[id^="schedule-details-"]').forEach(el => {
        if (el.style.display !== "none") openDays.add(el.id.replace('schedule-details-', ''));
    });

    updateWeekDropdown();

    const cal = document.getElementById("calendar");
    if (!cal) return;
    cal.innerHTML = "";

    let startStr = getLocalDateStr(currentBaseDate);
    let endD = new Date(currentBaseDate);
    endD.setDate(endD.getDate() + 6);
    let endStr = getLocalDateStr(endD);
    let realTodayStr = getLocalDateStr(new Date());

    for (let i = 0; i < 7; i++) {
        let d = new Date(currentBaseDate);
        d.setDate(d.getDate() + i);
        let dateStr = getLocalDateStr(d);
        let displayDate = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();

        let isTodayClass = (dateStr === realTodayStr) ? "day-today" : "";
        let daySchedule = cachedSchedule.filter(item => item.date === dateStr);
        let customItems = getCustomItemsForDate(dateStr);
        daySchedule = daySchedule.concat(customItems);

        daySchedule.sort((a, b) => {
            let aTime = a.time_range ? a.time_range.split(' - ')[0] : "99:99";
            let bTime = b.time_range ? b.time_range.split(' - ')[0] : "99:99";
            return aTime.localeCompare(bTime);
        });

        let scheduleHtml = "";
        if (daySchedule.length > 0) {
            let startTime = fixTime(daySchedule[0].time_range.split(' - ')[0]);
            let endTime = fixTime(daySchedule[daySchedule.length - 1].time_range.split(' - ')[1]);
            let isExpanded = openDays.has(dateStr);
            let detailsStyle = isExpanded ? 'display: block;' : 'display: none;';
            let arrowIcon = isExpanded ? '▲' : '▼';

            scheduleHtml += `
                <div class="schedule-summary shadow-sm" onclick="toggleSchedule('${dateStr}')">
                    🕒 Пары: ${startTime} - ${endTime} <span id="arrow-${dateStr}">${arrowIcon}</span>
                </div>
                <div id="schedule-details-${dateStr}" style="${detailsStyle}">
            `;

            daySchedule.forEach(item => {
                let origLesson = item.lesson;
                let subjectKey = item.is_custom ? origLesson : `${item.lesson} (${item.type_name})`;
                let safeSubjectKey = escapeJsString(subjectKey);
                let displayLesson = origLesson;
                let lessonLink = "";
                let displayTeacher = item.teacher || "";
                let displayLocation = item.location || "";

                if (!item.is_custom && cachedSubjectSettings[subjectKey]) {
                    if (cachedSubjectSettings[subjectKey].custom_name) displayLesson = cachedSubjectSettings[subjectKey].custom_name;
                    if (cachedSubjectSettings[subjectKey].link) lessonLink = cachedSubjectSettings[subjectKey].link;
                    if (cachedSubjectSettings[subjectKey].teacher) displayTeacher = cachedSubjectSettings[subjectKey].teacher;
                    if (cachedSubjectSettings[subjectKey].location) displayLocation = cachedSubjectSettings[subjectKey].location;
                }

                let lessonHtml = lessonLink
                    ? `<a href="${lessonLink}" target="_blank" class="text-decoration-none fw-bold" style="color: #4f46e5;" title="${escapeHtml(origLesson)}">${escapeHtml(displayLesson)}</a>`
                    : `<span title="${escapeHtml(origLesson)}">${escapeHtml(displayLesson)}</span>`;

                if (!item.is_custom) {
                    lessonHtml += ` <span style="cursor:pointer; font-size: 0.9em; opacity: 0.4;" onclick="openSubjectSettings('${safeSubjectKey}')" title="Настроить предмет">⚙️</span>`;
                }

                let typeBadge = '';
                if (item.is_custom && item.is_event) {
                    typeBadge = `<span class="badge bg-success ms-2" style="font-size: 0.7em;">Событие</span>`;
                } else if (item.type_name) {
                    typeBadge = `<span class="badge bg-secondary ms-2" style="font-size: 0.7em;">${item.type_name}</span>`;
                }

                let editCustomHtml = item.is_custom ? `<span style="cursor:pointer; font-size: 0.9em; margin-left: 8px;" onclick="openCustomScheduleModal('${item.date}', ${item.custom_id})" title="Редактировать">✏️</span>` : '';
                let teacherInfo = (displayTeacher && showTeacher) ? `<span class="text-muted" style="font-size: 0.85em;">👨‍🏫 ${escapeHtml(displayTeacher)}</span>` : '';
                let locInfo = (displayLocation && showLocation) ? `<span class="text-muted" style="font-size: 0.85em;">🚪 ${escapeHtml(displayLocation)}</span>` : '';
                let customStyle = item.is_custom ? (item.is_event ? 'border-left: 3px solid #10b981;' : 'border-left: 3px solid #8b5cf6;') : 'border-left: 3px solid #6366f1;';

                scheduleHtml += `
                    <div class="schedule-item shadow-sm" style="padding: 6px 8px; margin-bottom: 5px; line-height: 1.2; ${customStyle}">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <div><strong class="text-primary">${item.time_range}</strong>${typeBadge}${editCustomHtml}</div>
                            <span class="add-task-btn mt-0" style="font-size: 0.75em;" onclick="createTaskFromSchedule('${item.date}', 'Сдать: ${safeSubjectKey}')">+ Заметка</span>
                        </div>
                        <div class="mb-1">${lessonHtml}</div>
                        <div class="d-flex gap-2 flex-wrap">${teacherInfo} ${locInfo}</div>
                    </div>
                `;
            });
            scheduleHtml += `</div>`;
        }

        cal.innerHTML += `
            <div class="day-col ${isTodayClass}" id="day-col-${dateStr}" ondragover="allowDrop(event)" ondrop="drop(event, '${dateStr}')">
                <div class="day-header">
                    <div class="day-nav-btn-group">
                        <button class="day-nav-btn day-nav-note-prev" onclick="navigateNote('${dateStr}', -1)" title="Предыдущая заметка">◀ Заметка</button>
                        <button class="day-nav-btn day-nav-event-prev" onclick="navigateEvent('${dateStr}', -1)" title="Предыдущее событие">◀ Событие</button>
                    </div>
                    <span class="day-nav-center">${displayDate}</span>
                    <div class="day-nav-btn-group">
                        <button class="day-nav-btn day-nav-note-next" onclick="navigateNote('${dateStr}', 1)" title="Следующая заметка">Заметка ▶</button>
                        <button class="day-nav-btn day-nav-event-next" onclick="navigateEvent('${dateStr}', 1)" title="Следующее событие">Событие ▶</button>
                    </div>
                </div>

                <div class="day-schedule-wrap">
                    <div class="mb-2">${scheduleHtml}</div>
                </div>

                <div class="day-tasks-wrap d-flex flex-column" style="flex-grow: 1;">
                    <div id="tasks-${dateStr}" style="flex-grow: 1; min-height: 50px;"></div>

                    <div id="expand-btn-wrap-${dateStr}" style="display: none; text-align: center;">
                        <span class="add-task-btn mt-1" style="color: #f59e0b;" onclick="toggleExpandDay('${dateStr}')">Развернуть</span>
                    </div>

                    <div class="text-center mt-2 d-flex justify-content-center gap-2">
                        <button class="btn btn-outline-primary btn-sm rounded-circle fw-bold shadow-sm"
                                style="width: 28px; height: 28px; line-height: 12px; padding: 0;"
                                onclick="toggleTaskInput('${dateStr}')" title="Добавить заметку">+</button>
                        <button class="btn btn-outline-success btn-sm rounded-circle fw-bold shadow-sm"
                                style="width: 28px; height: 28px; line-height: 12px; padding: 0;"
                                onclick="openCustomScheduleModal('${dateStr}')" title="Добавить в расписание">+</button>
                    </div>

                    <div id="task-input-wrap-${dateStr}" style="display: none;" class="mt-2">
                        <textarea id="task-input-${dateStr}" class="form-control form-control-sm"
                               placeholder="Текст заметки" rows="2" style="resize: none;"
                               onkeydown="handleNewTask(event, '${dateStr}')"
                               onblur="handleTaskBlur('${dateStr}')"></textarea>
                    </div>
                </div>
            </div>
        `;
    }

    try {
        let tasks = await apiLoadTasks(startStr, endStr);
        tasks.forEach(t => renderTask(t));
    } catch (e) { console.error("Tasks load error", e); }

    renderFriendsCalendar();

    if (expandedDayDateStr) {
        let grid = document.querySelector('.calendar-grid');
        let col = document.getElementById(`day-col-${expandedDayDateStr}`);
        if (col) {
            col.classList.add('fullscreen-day');
            grid.classList.add('has-fullscreen');
            let btn = document.querySelector(`#expand-btn-wrap-${expandedDayDateStr} span`);
            if (btn) btn.textContent = "Свернуть";
            let details = document.getElementById(`schedule-details-${expandedDayDateStr}`);
            let arrow   = document.getElementById(`arrow-${expandedDayDateStr}`);
            if (details) details.style.display = "block";
            if (arrow) arrow.textContent = "▲";
            rebalanceDayText(expandedDayDateStr);
            updateNavButtonsState(expandedDayDateStr);
        } else {
            expandedDayDateStr = null;
        }
    }
}

function toggleSchedule(dateStr) {
    let details = document.getElementById(`schedule-details-${dateStr}`);
    let arrow = document.getElementById(`arrow-${dateStr}`);
    if (details.style.display === "none") {
        details.style.display = "block"; arrow.textContent = "▲";
    } else {
        details.style.display = "none"; arrow.textContent = "▼";
    }
}

function toggleExpandDay(dateStr) {
    let grid = document.querySelector('.calendar-grid');
    let col  = document.getElementById(`day-col-${dateStr}`);
    let btn  = document.querySelector(`#expand-btn-wrap-${dateStr} span`);
    let headerEl = document.querySelector('.controls-header');
    let headerOffset = headerEl ? headerEl.offsetHeight + 25 : 90;

    function scrollToCol(alignTop) {
        let rect = col.getBoundingClientRect();
        let targetY = window.pageYOffset + rect.top - (alignTop ? headerOffset : 0);
        window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    }

    if (col.classList.contains('fullscreen-day')) {
        col.classList.remove('fullscreen-day');
        grid.classList.remove('has-fullscreen');
        btn.textContent = "Развернуть";
        expandedDayDateStr = null;
        let details = document.getElementById(`schedule-details-${dateStr}`);
        let arrow   = document.getElementById(`arrow-${dateStr}`);
        if (details) details.style.display = "none";
        if (arrow)   arrow.textContent = "▼";
        rebalanceDayText(dateStr);
    } else {
        col.classList.add('fullscreen-day');
        grid.classList.add('has-fullscreen');
        btn.textContent = "Свернуть";
        expandedDayDateStr = dateStr;
        let details = document.getElementById(`schedule-details-${dateStr}`);
        let arrow   = document.getElementById(`arrow-${dateStr}`);
        if (details) {
            details.style.display = "block";
            details.style.animation = 'none';
            void details.offsetWidth;
            details.style.animation = '';
        }
        if (arrow) arrow.textContent = "▲";
        setTimeout(() => updateNavButtonsState(dateStr), 70);
        setTimeout(() => scrollToCol(true), 60);
    }
}

function rebalanceDayText(dateStr) {
    let container = document.getElementById(`tasks-${dateStr}`);
    if (!container) return;
    let cards = Array.from(container.querySelectorAll('.task-card'));
    let wrap  = document.getElementById(`expand-btn-wrap-${dateStr}`);
    let col   = document.getElementById(`day-col-${dateStr}`);
    let isExpanded = col && col.classList.contains('fullscreen-day');

    if (cards.length === 0) {
        if (wrap) wrap.style.display = isExpanded ? 'block' : 'none';
        return;
    }

    let lengths = cards.map(card => {
        let fullEl = card.querySelector('.task-text-full');
        return fullEl ? fullEl.textContent.length : 0;
    });
    let totalLen = lengths.reduce((s, n) => s + n, 0);

    const SHOW_BTN_THRESHOLD = 50;
    let showButton = totalLen > SHOW_BTN_THRESHOLD || isExpanded;
    if (wrap) wrap.style.display = showButton ? 'block' : 'none';

    const SINGLE_NOTE_LIMIT = 50;
    const MULTI_TOTAL_LIMIT = 80;
    let shouldTrim = cards.length === 1 ? lengths[0] > SINGLE_NOTE_LIMIT : totalLen > MULTI_TOTAL_LIMIT;

    if (!shouldTrim) {
        cards.forEach(card => {
            let shortEl = card.querySelector('.task-text-short');
            let fullEl  = card.querySelector('.task-text-full');
            if (shortEl && fullEl) { shortEl.textContent = fullEl.textContent; shortEl.style.opacity = ''; }
        });
        return;
    }

    if (cards.length === 1) {
        let shortEl = cards[0].querySelector('.task-text-short');
        let fullEl  = cards[0].querySelector('.task-text-full');
        if (shortEl && fullEl) shortEl.textContent = fullEl.textContent.slice(0, SINGLE_NOTE_LIMIT).trimEnd() + '…';
        return;
    }

    const TOTAL_BUDGET = MULTI_TOTAL_LIMIT;
    let share = Math.floor(TOTAL_BUDGET / cards.length);
    let remainder = TOTAL_BUDGET - share * cards.length;

    cards.forEach((card, idx) => {
        let shortEl = card.querySelector('.task-text-short');
        let fullEl  = card.querySelector('.task-text-full');
        if (!shortEl || !fullEl) return;
        let full = fullEl.textContent;
        let limit = share + (idx < remainder ? 1 : 0);
        shortEl.textContent = full.length <= limit ? full : full.slice(0, limit).trimEnd() + '…';
    });
}

// Обновляет состояние disabled у кнопок навигации в развёрнутом дне.
function updateNavButtonsState(dateStr) {
    let col = document.getElementById(`day-col-${dateStr}`);
    if (!col) return;

    let notePrev  = col.querySelector('.day-nav-note-prev');
    let noteNext  = col.querySelector('.day-nav-note-next');
    let eventPrev = col.querySelector('.day-nav-event-prev');
    let eventNext = col.querySelector('.day-nav-event-next');

    if (notePrev)  notePrev.disabled  = !computePrevNoteDate(dateStr);
    if (noteNext)  noteNext.disabled  = !computeNextNoteDate(dateStr);
    if (eventPrev) eventPrev.disabled = !findPrevEventDate(dateStr);
    if (eventNext) eventNext.disabled = !findNextEventDate(dateStr);
}