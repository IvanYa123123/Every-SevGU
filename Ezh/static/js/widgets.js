// Виджеты: графики Chart.js, управление лабами, модалка статистики.

async function updateLabsCache() {
    const group = document.getElementById("groupSelect").value.trim();
    if (!group) return;
    try { cachedLabs = await apiLoadLabs(group); }
    catch (e) { cachedLabs = {}; }
}

function showStats() {
    const group = document.getElementById("groupSelect").value.trim();
    if (!group || cachedSchedule.length === 0) return alert("Сначала загрузите расписание!");

    new bootstrap.Modal(document.getElementById('statsModal')).show();
    let stats = {};
    let todayStr = getLocalDateStr(new Date());

    cachedSchedule.forEach(item => {
        let subject = item.lesson;
        let type = item.type_name;
        if (!stats[subject]) stats[subject] = { display: subject, types: {} };
        if (!stats[subject].types[type]) stats[subject].types[type] = { past: 0, future: 0 };
        (item.date < todayStr ? stats[subject].types[type].past++ : stats[subject].types[type].future++);
    });

    let html = '<div class="row">';
    for (let subject in stats) {
        html += `<div class="col-md-6 mb-3"><div class="card h-100 border-0 shadow-sm"><div class="card-header bg-light fw-bold" style="font-size:0.9em" title="${escapeHtml(subject)}">${escapeHtml(stats[subject].display)}</div><div class="card-body py-2"><div class="row">`;
        for (let type in stats[subject].types) {
            let past = stats[subject].types[type].past;
            let future = stats[subject].types[type].future;
            html += `<div class="col-6 mb-2"><div class="border rounded p-2 text-center bg-white shadow-sm"><small class="text-muted d-block border-bottom mb-1" style="font-size:0.75em">${type}</small><span class="text-danger fw-bold" title="Прошло">✔ ${past}</span> | <span class="text-success fw-bold" title="Осталось">⏳ ${future}</span></div></div>`;
        }
        html += `</div></div></div></div>`;
    }
    html += '</div>';
    if (Object.keys(stats).length === 0) html = "<p class='text-center'>Нет данных для выбранной группы.</p>";
    document.getElementById('statsContent').innerHTML = html;
}

function showLabs() {
    const group = document.getElementById("groupSelect").value.trim();
    if (!group || cachedSchedule.length === 0) return alert("Сначала загрузите расписание!");
    renderLabsContent();
    new bootstrap.Modal(document.getElementById('labsModal')).show();
}

function renderLabsContent() {
    let labItems = cachedSchedule.filter(item => item.type_name === 'ЛЗ' || item.type_name === 'ПЗ');
    let uniqueSubjects = [...new Set(labItems.map(item => `${item.lesson} (${item.type_name})`))].sort();
    currentSubjectsList = uniqueSubjects;

    let html = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <span class="text-muted small">Внесите изменения и нажмите "Сохранить все"</span>
            <button class="btn btn-sm btn-primary px-4 shadow-sm" onclick="saveAllLabs()">Сохранить все</button>
        </div>
        <div class="list-group mb-3">
    `;

    uniqueSubjects.forEach((subjKey, idx) => {
        let comp = cachedLabs[subjKey] ? cachedLabs[subjKey].completed : 0;
        let tot = cachedLabs[subjKey] ? cachedLabs[subjKey].total : 0;
        let percent = tot > 0 ? Math.round((comp / tot) * 100) : 0;
        let displaySubj = getDisplaySubjectKey(subjKey);
        html += `
            <div class="list-group-item border-0 shadow-sm mb-2 rounded">
                <h6 class="mb-2 fw-bold" style="font-size:0.9em" title="${escapeHtml(subjKey)}">${escapeHtml(displaySubj)}</h6>
                <div class="d-flex align-items-center gap-2 mb-2">
                    <span style="font-size: 0.85em;">Сдано:</span>
                    <input type="number" id="lab-comp-${idx}" class="form-control form-control-sm" style="width: 70px" value="${comp}" min="0">
                    <span style="font-size: 0.85em;">из</span>
                    <input type="number" id="lab-tot-${idx}" class="form-control form-control-sm" style="width: 70px" value="${tot}" min="0">
                </div>
                <div class="progress" style="height: 10px;">
                    <div class="progress-bar ${percent === 100 ? 'bg-success' : 'bg-info'}" role="progressbar" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    });
    html += `</div><div class="d-flex justify-content-end mb-2"><button class="btn btn-sm btn-primary px-4 shadow-sm" onclick="saveAllLabs()">Сохранить все</button></div>`;

    if (uniqueSubjects.length === 0) html = "<p class='text-center'>Нет данных.</p>";
    document.getElementById('labsContent').innerHTML = html;
}

async function saveAllLabs() {
    const group = document.getElementById("groupSelect").value.trim();
    let payload = [];
    currentSubjectsList.forEach((subject, idx) => {
        let comp = parseInt(document.getElementById(`lab-comp-${idx}`).value) || 0;
        let tot = parseInt(document.getElementById(`lab-tot-${idx}`).value) || 0;
        if (comp > tot) comp = tot;
        payload.push({ group, subject, completed: comp, total: tot });
    });
    try { await apiSaveLabs(payload); } catch (e) { return alert("Не удалось сохранить лабы"); }
    await updateLabsCache();
    renderCharts();
    let modal = bootstrap.Modal.getInstance(document.getElementById('labsModal'));
    if (modal) modal.hide();
}

// ============================================================
//  ГРАФИКИ
// ============================================================
// Все цвета читаются через getThemeColor() (см. utils.js) — он берёт
// значения из CSS-переменных текущей темы. Когда тема меняется,
// applyTheme() из settings.js вызывает refreshChartsTheme(), который
// уничтожает старые чарты и создаёт здесь новые с актуальной палитрой.

function renderCharts() {
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js не загружен — графики пропущены.");
        return;
    }

    // Палитра текущей темы
    const cPassed     = getThemeColor('--chart-passed',       '#6366f1');
    const cRemaining  = getThemeColor('--chart-remaining',    '#cbd5e1');
    const cLabDone    = getThemeColor('--chart-lab-done',     '#14b8a6');
    const cLabLeft    = getThemeColor('--chart-lab-left',     '#f59e0b');
    const cText       = getThemeColor('--text-secondary',     '#64748b');
    const cTooltipBg  = getThemeColor('--chart-tooltip-bg',   'rgba(15, 23, 42, 0.92)');
    const cTooltipTx  = getThemeColor('--chart-tooltip-text', '#f8fafc');
    const cBorder     = getThemeColor('--border-color',       '#e2e8f0');

    const tooltipOpts = {
        backgroundColor: cTooltipBg,
        titleColor:      cTooltipTx,
        bodyColor:       cTooltipTx,
        borderColor:     cBorder,
        borderWidth:     1,
        padding:         8,
        cornerRadius:    6,
        displayColors:   false,
    };

    // --- Общий график «прошло / осталось» ---
    let passed = 0, remaining = 0;
    let todayStr = getLocalDateStr(new Date());
    cachedSchedule.forEach(item => { item.date < todayStr ? passed++ : remaining++; });

    const ctx1 = document.getElementById('globalStatsChart').getContext('2d');
    if (globalChart) {
        globalChart.data.datasets[0].data = [passed, remaining];
        globalChart.data.datasets[0].backgroundColor = [cPassed, cRemaining];
        globalChart.options.plugins.legend.labels.color = cText;
        globalChart.options.plugins.tooltip = Object.assign(
            {}, globalChart.options.plugins.tooltip, tooltipOpts
        );
        globalChart.update();
    } else {
        globalChart = new Chart(ctx1, {
            type: 'doughnut',
            data: {
                labels: ['Прошло', 'Осталось'],
                datasets: [{ data: [passed, remaining], backgroundColor: [cPassed, cRemaining], borderWidth: 0 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: cText } },
                    tooltip: tooltipOpts,
                }
            }
        });
    }

    // --- График лабораторных ---
    let labItems = cachedSchedule.filter(item => item.type_name === 'ЛЗ' || item.type_name === 'ПЗ');
    let validSubjects = new Set(labItems.map(item => `${item.lesson} (${item.type_name})`));
    let totLabs = 0, compLabs = 0;
    for (let subj in cachedLabs) {
        if (!validSubjects.has(subj)) continue;
        totLabs += cachedLabs[subj].total;
        compLabs += cachedLabs[subj].completed;
    }
    let uncompLabs = Math.max(0, totLabs - compLabs);
    let labData = totLabs === 0 ? [0, 1] : [compLabs, uncompLabs];
    let labColors = totLabs === 0 ? [cRemaining, cRemaining] : [cLabDone, cLabLeft];
    let labLabels = totLabs === 0 ? ['Нет данных', ''] : ['Сдано', 'Осталось'];

    const ctx2 = document.getElementById('labStatsChart').getContext('2d');
    if (globalLabChart) {
        globalLabChart.data.datasets[0].data = labData;
        globalLabChart.data.datasets[0].backgroundColor = labColors;
        globalLabChart.data.labels = labLabels;
        globalLabChart.options.plugins.legend.labels.color = cText;
        globalLabChart.options.plugins.tooltip = Object.assign(
            {}, globalLabChart.options.plugins.tooltip, tooltipOpts
        );
        globalLabChart.update();
    } else {
        globalLabChart = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: labLabels,
                datasets: [{ data: labData, backgroundColor: labColors, borderWidth: 0 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: cText } },
                    tooltip: tooltipOpts,
                }
            }
        });
    }

    renderLabPacing();
}

// Уничтожает существующие чарты и создаёт их заново, чтобы подхватить
// палитру текущей темы. Вызывается из applyTheme() в settings.js при
// смене темы. Идемпотентна: если графиков нет — просто тихо выйдет.
function refreshChartsTheme() {
    if (typeof globalChart !== 'undefined' && globalChart) {
        try { globalChart.destroy(); } catch (e) {}
        globalChart = null;
    }
    if (typeof globalLabChart !== 'undefined' && globalLabChart) {
        try { globalLabChart.destroy(); } catch (e) {}
        globalLabChart = null;
    }
    // Перерисовываем только если расписание уже загружено — иначе
    // renderCharts() создаст чарты с нулевыми данными, а потом
    // fetchSemesterData → renderCharts() создаст их повторно. Потери нет,
    // но и смысла тоже.
    if (typeof cachedSchedule !== 'undefined'
        && Array.isArray(cachedSchedule)
        && cachedSchedule.length > 0) {
        try { renderCharts(); }
        catch (e) { console.error('[theme] renderCharts failed', e); }
    }
}

function renderLabPacing() {
    const container = document.getElementById('labPacingContent');
    if (!cachedLabs || Object.keys(cachedLabs).length === 0) {
        container.innerHTML = "<div class='text-center text-muted small mt-2'>Нет данных</div>";
        return;
    }

    let todayStr = getLocalDateStr(new Date());
    let scheduleStats = {};
    cachedSchedule.forEach(item => {
        if (item.type_name === 'ЛЗ' || item.type_name === 'ПЗ') {
            let subjKey = `${item.lesson} (${item.type_name})`;
            if (!scheduleStats[subjKey]) scheduleStats[subjKey] = { passed: 0, total: 0 };
            scheduleStats[subjKey].total++;
            if (item.date < todayStr) scheduleStats[subjKey].passed++;
        }
    });

    let validSubjects = new Set(Object.keys(scheduleStats));
    let html = '<div class="list-group list-group-flush">';
    let hasData = false;

    for (let subj in cachedLabs) {
        if (!validSubjects.has(subj)) continue;
        let data = cachedLabs[subj];
        if (data.total === 0) continue;
        hasData = true;
        let stats = scheduleStats[subj];

        let expectedCount = 0;
        if (stats.total > 1) expectedCount = Math.round(data.total * (stats.passed / (stats.total - 1)));
        else if (stats.passed >= 1) expectedCount = data.total;
        if (expectedCount > data.total) expectedCount = data.total;
        if (expectedCount < 0) expectedCount = 0;

        let actualCount = data.completed;
        let statusClass = actualCount >= expectedCount ? 'text-success' : 'text-danger';
        let icon = actualCount >= expectedCount ? '✅' : '⚠️';
        let displaySubj = getDisplaySubjectKey(subj);

        html += `<div class="d-flex justify-content-between align-items-center mb-2 border-bottom pb-1"><span class="text-truncate me-2" style="max-width: 65%; font-size: 0.8em;" title="${escapeHtml(displaySubj)}">${escapeHtml(displaySubj)}</span><span class="fw-bold ${statusClass}" style="font-size: 0.8em; white-space: nowrap;">${actualCount} / ${expectedCount} ${icon}</span></div>`;
    }
    html += '</div>';

    container.innerHTML = hasData ? html : "<div class='text-center text-muted small mt-2'>Нет данных</div>";
}