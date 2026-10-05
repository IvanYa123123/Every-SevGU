// Модальное окно настроек: видимость, статус, уведомления, экспорт, тема.
// Настройки сохраняются в localStorage и синхронизируются с переменными из state.js.

function initSettings() {
    applyTheme();
    applyWidgetVisibility();
}

function openSettingsModal() {
    // Синхронизируем UI с текущими значениями
    document.getElementById('settingsToggleTeacher').checked  = showTeacher;
    document.getElementById('settingsToggleLocation').checked = showLocation;
    document.getElementById('settingsToggleFriends').checked  = showFriends;
    document.getElementById('settingsToggleStatus').checked   = showStatus;

    document.getElementById('settingsToggleWidgetGlobal').checked = showWidgetGlobal;
    document.getElementById('settingsToggleWidgetLabs').checked   = showWidgetLabs;
    document.getElementById('settingsToggleWidgetPacing').checked = showWidgetPacing;

    document.getElementById('settingsStatusFormat').value    = statusFormat;
    document.getElementById('settingsStatusPrecision').value = statusPrecision;

    document.getElementById('settingsNotifEnabled').checked   = notificationsEnabled;
    document.getElementById('settingsNotifMinutes').value     = notificationMinutes;
    document.getElementById('settingsTheme').value            = theme;

    updateNotificationsHint();

    let modalEl = document.getElementById('settingsModal');
    let modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    modal.show();
}

// Сохранить текущее состояние UI в переменные + localStorage и перерисовать то, что нужно.
function saveSettingsFromUI() {
    showTeacher  = document.getElementById('settingsToggleTeacher').checked;
    showLocation = document.getElementById('settingsToggleLocation').checked;
    showFriends  = document.getElementById('settingsToggleFriends').checked;
    showStatus   = document.getElementById('settingsToggleStatus').checked;

    localStorage.setItem('showTeacher',  showTeacher);
    localStorage.setItem('showLocation', showLocation);
    localStorage.setItem('showFriends',  showFriends);
    localStorage.setItem('showStatus',   showStatus);

    // Виджеты
    showWidgetGlobal = document.getElementById('settingsToggleWidgetGlobal').checked;
    showWidgetLabs   = document.getElementById('settingsToggleWidgetLabs').checked;
    showWidgetPacing = document.getElementById('settingsToggleWidgetPacing').checked;

    localStorage.setItem('showWidgetGlobal', showWidgetGlobal);
    localStorage.setItem('showWidgetLabs',   showWidgetLabs);
    localStorage.setItem('showWidgetPacing', showWidgetPacing);

    applyWidgetVisibility();

    // Статус: формат и точность
    statusFormat = document.getElementById('settingsStatusFormat').value;
    if (!['interval', 'both', 'time'].includes(statusFormat)) statusFormat = 'interval';
    localStorage.setItem('statusFormat', statusFormat);

    let p = document.getElementById('settingsStatusPrecision').value;
    if (!['min', 'sec', 'cs'].includes(p)) p = 'min';
    statusPrecision = p;
    localStorage.setItem('statusPrecision', statusPrecision);

    // Уведомления
    notificationsEnabled = document.getElementById('settingsNotifEnabled').checked;
    let m = parseInt(document.getElementById('settingsNotifMinutes').value, 10);
    if (isNaN(m) || m < 1) m = 1;
    if (m > 120) m = 120;
    notificationMinutes = m;
    document.getElementById('settingsNotifMinutes').value = m;

    localStorage.setItem('notificationsEnabled', notificationsEnabled ? 'true' : 'false');
    localStorage.setItem('notificationMinutes', String(notificationMinutes));

    // Тема
    theme = document.getElementById('settingsTheme').value;
    localStorage.setItem('theme', theme);
    applyTheme();

    // Обновить интерфейс
    renderCalendar();
    updateScheduleStatus();
    restartStatusTimer();
    refreshNotifications();

    updateNotificationsHint();
}

// Перезапускает таймер статуса с интервалом, зависящим от точности.
// При «до сотых» тикаем 10 раз в секунду, при «до секунды» — раз в секунду.
function restartStatusTimer() {
    if (_statusIntervalId) {
        clearInterval(_statusIntervalId);
        _statusIntervalId = null;
    }
    _statusIntervalId = setInterval(updateScheduleStatus, getStatusTickMs());
}

// Обработчик переключателя уведомлений — если включают впервые,
// нужно запросить разрешение у браузера.
async function handleNotificationsToggle(checkbox) {
    if (checkbox.checked) {
        let result = await requestNotificationPermission();
        if (result !== 'granted') {
            checkbox.checked = false;
            notificationsEnabled = false;
            localStorage.setItem('notificationsEnabled', 'false');
            updateNotificationsHint();
            return;
        }
    }
    saveSettingsFromUI();
}

function updateNotificationsHint() {
    let hint = document.getElementById('settingsNotifHint');
    if (!hint) return;

    if (!('Notification' in window)) {
        hint.style.display = 'block';
        hint.textContent = 'Ваш браузер не поддерживает уведомления.';
        return;
    }

    let perm = Notification.permission;

    if (perm === 'denied') {
        hint.style.display = 'block';
        hint.textContent = 'Уведомления запрещены в настройках браузера. Разрешите их для этого сайта вручную.';
    } else if (perm === 'default' && notificationsEnabled) {
        hint.style.display = 'block';
        hint.textContent = 'Нужно разрешить уведомления — нажмите на переключатель ещё раз.';
    } else if (perm === 'granted' && notificationsEnabled) {
        hint.style.display = 'block';
        hint.textContent = `Готово. Предупредим за ${notificationMinutes} мин. до пары, пока вкладка открыта.`;
    } else {
        hint.style.display = 'none';
    }
}

// Применяет выбранную тему (пока только светлая — тёмная появится позже).
function applyTheme() {
    document.documentElement.setAttribute('data-theme', theme);
}

// Скачивает .ics-файл для текущей группы.
function downloadICS() {
    let group = document.getElementById('groupSelect').value.trim();
    let subgroup = document.getElementById('subgroupSelect').value;

    if (!group) {
        alert("Сначала выберите группу!");
        return;
    }

    let url = `/api/schedule.ics?group=${encodeURIComponent(group)}&subgroup=${subgroup}`;
    window.location.href = url;
}

// Показывает / скрывает карточки виджетов в правой колонке.
function applyWidgetVisibility() {
    let wg = document.getElementById('widgetGlobalCard');
    let wl = document.getElementById('widgetLabsCard');
    let wp = document.getElementById('widgetPacingCard');
    if (wg) wg.style.display = showWidgetGlobal ? 'block' : 'none';
    if (wl) wl.style.display = showWidgetLabs   ? 'block' : 'none';
    if (wp) wp.style.display = showWidgetPacing ? 'block' : 'none';
}