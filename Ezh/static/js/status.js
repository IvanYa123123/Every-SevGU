// Строка статуса под шапкой: «до пар / во время пары / после пар».

function updateScheduleStatus() {
    let el = document.getElementById('scheduleStatus');
    if (!el) return;

    if (!cachedSchedule || cachedSchedule.length === 0) {
        el.textContent = '';
        return;
    }

    let now = new Date();
    let nowMins = now.getHours() * 60 + now.getMinutes();
    let todayStr = getLocalDateStr(now);

    // Только настоящие пары (без кастомных событий), на сегодня
    let todayPairs = cachedSchedule
        .filter(item => item.date === todayStr)
        .map(item => {
            let parts = item.time_range.split(' - ');
            let [sh, sm] = parts[0].split(':').map(Number);
            let [eh, em] = parts[1].split(':').map(Number);
            return { ...item, startMins: sh * 60 + sm, endMins: eh * 60 + em };
        })
        .sort((a, b) => a.startMins - b.startMins);

    // 1. Есть пары сегодня
    if (todayPairs.length > 0) {
        // 1а. Идёт какая-то пара прямо сейчас
        let current = todayPairs.find(p => p.startMins <= nowMins && nowMins < p.endMins);
        if (current) {
            let remaining = current.endMins - nowMins;
            let pairNum = current.n || '?';
            el.textContent = `Окончание ${pairNum} пары через ${formatDuration(remaining)}`;
            return;
        }

        // 1б. Ещё ничего не началось
        let first = todayPairs[0];
        if (nowMins < first.startMins) {
            let until = first.startMins - nowMins;
            let timeStr = fixTime(first.time_range.split(' - ')[0]);
            if (until <= 60) {
                el.textContent = `Начало пар в ${timeStr} — через ${formatDuration(until)}`;
            } else {
                el.textContent = `Начало пар в ${timeStr}`;
            }
            return;
        }

        // 1в. Перерыв между парами
        let next = todayPairs.find(p => p.startMins > nowMins);
        if (next) {
            let until = next.startMins - nowMins;
            let timeStr = fixTime(next.time_range.split(' - ')[0]);
            let pairNum = next.n || '?';
            el.textContent = `Начало ${pairNum} пары в ${timeStr} — через ${formatDuration(until)}`;
            return;
        }

        // 1г. Все пары на сегодня закончились
        setStatusForNextDay(now, el);
        return;
    }

    // 2. Сегодня пар нет — ищем следующий день с парами
    setStatusForNextDay(now, el);
}

function setStatusForNextDay(now, el) {
    let datesWithPairs = new Set(cachedSchedule.map(x => x.date));

    for (let i = 1; i <= 365; i++) {
        let d = new Date(now);
        d.setDate(d.getDate() + i);
        let dateStr = getLocalDateStr(d);

        if (!datesWithPairs.has(dateStr)) continue;

        let first = cachedSchedule
            .filter(x => x.date === dateStr)
            .sort((a, b) => (a.n || 0) - (b.n || 0))[0];
        if (!first) continue;

        let firstTime = fixTime(first.time_range.split(' - ')[0]);

        if (i === 1) {
            el.textContent = `Начало пар завтра в ${firstTime}`;
        } else {
            el.textContent = `Начало пар ${formatDateRu(dateStr)} в ${firstTime}`;
        }
        return;
    }

    el.textContent = '';
}