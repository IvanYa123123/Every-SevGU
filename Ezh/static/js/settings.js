// Модальное окно настроек: видимость, статус, уведомления, экспорт, тема.
// Секции сворачиваются; ключ settingsSections_v1.

const SETTINGS_SECTIONS_KEY = 'settingsSections_v1';
const SETTINGS_SECTIONS_NAMES = ['display', 'widgets', 'status', 'notif'];

function initSettings() {
    if (typeof migrateLegacyStorageIfNeeded === 'function') {
        migrateLegacyStorageIfNeeded()
            .then(() => {
                if (theme === 'custom' && typeof applyCustomTheme === 'function') {
                    applyCustomTheme();
                }
            })
            .catch(e => console.warn('[settings] migrate failed', e));
    }

    applyTheme();
    applyWidgetVisibility();
}

function openSettingsModal() {
    document.getElementById('settingsToggleTeacher').checked  = showTeacher;
    document.getElementById('settingsToggleLocation').checked = showLocation;
    document.getElementById('settingsToggleFriends').checked  = showFriends;
    document.getElementById('settingsToggleStatus').checked   = showStatus;

    document.getElementById('settingsToggleWidgetMiniCal').checked = showWidgetMiniCal;
    document.getElementById('settingsToggleWidgetGlobal').checked  = showWidgetGlobal;
    document.getElementById('settingsToggleWidgetLabs').checked    = showWidgetLabs;
    document.getElementById('settingsToggleWidgetPacing').checked  = showWidgetPacing;

    document.getElementById('settingsStatusFormat').value    = statusFormat;
    document.getElementById('settingsStatusPrecision').value = statusPrecision;

    document.getElementById('settingsNotifEnabled').checked = notificationsEnabled;
    document.getElementById('settingsNotifAdvance').value   = notificationAdvance;
    document.getElementById('settingsNotifUnit').value      = notificationUnit;
    document.getElementById('settingsTheme').value          = theme;

    updateNotificationsHint();
    restoreSettingsSections();

    if (typeof renderCustomThemePanel === 'function') renderCustomThemePanel();
    if (typeof updateCustomThemePanelVisibility === 'function') updateCustomThemePanelVisibility();

    let modalEl = document.getElementById('settingsModal');
    let modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);

    if (theme === 'custom') {
        modalEl.addEventListener('shown.bs.modal', () => {
            scrollToCustomThemePanel();
        }, { once: true });
    }

    modal.show();
}

function loadSettingsSections() {
    try {
        const raw = localStorage.getItem(SETTINGS_SECTIONS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) { return {}; }
}

function saveSettingsSections(state) {
    try { localStorage.setItem(SETTINGS_SECTIONS_KEY, JSON.stringify(state)); } catch (e) {}
}

function toggleSettingsSection(name) {
    const body  = document.getElementById('settings-section-' + name);
    const arrow = document.getElementById('settings-arrow-' + name);
    if (!body) return;
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? 'block' : 'none';
    if (arrow) arrow.textContent = isHidden ? '▾' : '▸';
    const state = loadSettingsSections();
    state[name] = isHidden ? 'open' : 'closed';
    saveSettingsSections(state);
}

function restoreSettingsSections() {
    const state = loadSettingsSections();
    SETTINGS_SECTIONS_NAMES.forEach(name => {
        const body  = document.getElementById('settings-section-' + name);
        const arrow = document.getElementById('settings-arrow-' + name);
        if (!body) return;
        const isOpen = state[name] === 'open';
        body.style.display = isOpen ? 'block' : 'none';
        if (arrow) arrow.textContent = isOpen ? '▾' : '▸';
    });
}

function saveSettingsFromUI() {
    showTeacher  = document.getElementById('settingsToggleTeacher').checked;
    showLocation = document.getElementById('settingsToggleLocation').checked;
    showFriends  = document.getElementById('settingsToggleFriends').checked;
    showStatus   = document.getElementById('settingsToggleStatus').checked;

    localStorage.setItem('showTeacher',  showTeacher);
    localStorage.setItem('showLocation', showLocation);
    localStorage.setItem('showFriends',  showFriends);
    localStorage.setItem('showStatus',   showStatus);

    showWidgetMiniCal = document.getElementById('settingsToggleWidgetMiniCal').checked;
    showWidgetGlobal  = document.getElementById('settingsToggleWidgetGlobal').checked;
    showWidgetLabs    = document.getElementById('settingsToggleWidgetLabs').checked;
    showWidgetPacing  = document.getElementById('settingsToggleWidgetPacing').checked;

    localStorage.setItem('showWidgetMiniCal', showWidgetMiniCal);
    localStorage.setItem('showWidgetGlobal',  showWidgetGlobal);
    localStorage.setItem('showWidgetLabs',    showWidgetLabs);
    localStorage.setItem('showWidgetPacing',  showWidgetPacing);

    applyWidgetVisibility();

    statusFormat = document.getElementById('settingsStatusFormat').value;
    if (!['interval', 'both', 'time'].includes(statusFormat)) statusFormat = 'interval';
    localStorage.setItem('statusFormat', statusFormat);

    let p = document.getElementById('settingsStatusPrecision').value;
    if (!['min', 'sec', 'cs'].includes(p)) p = 'min';
    statusPrecision = p;
    localStorage.setItem('statusPrecision', statusPrecision);

    notificationsEnabled = document.getElementById('settingsNotifEnabled').checked;

    let adv = parseInt(document.getElementById('settingsNotifAdvance').value, 10);
    if (isNaN(adv) || adv < 1) adv = 1;
    if (adv > 60) adv = 60;
    notificationAdvance = adv;
    document.getElementById('settingsNotifAdvance').value = adv;

    let unit = document.getElementById('settingsNotifUnit').value;
    if (!['min', 'hour', 'day', 'week'].includes(unit)) unit = 'min';
    notificationUnit = unit;

    localStorage.setItem('notificationsEnabled', notificationsEnabled ? 'true' : 'false');
    localStorage.setItem('notificationAdvance', String(notificationAdvance));
    localStorage.setItem('notificationUnit', notificationUnit);

    const prevTheme = theme;
    theme = document.getElementById('settingsTheme').value;
    localStorage.setItem('theme', theme);
    applyTheme();

    if (typeof updateCustomThemePanelVisibility === 'function') updateCustomThemePanelVisibility();
    if (prevTheme !== 'custom' && theme === 'custom') scrollToCustomThemePanel();

    renderCalendar();
    updateScheduleStatus();
    restartStatusTimer();
    refreshNotifications();
    updateNotificationsHint();
}

function scrollToCustomThemePanel() {
    const panel = document.getElementById('customThemePanel');
    if (!panel) return;
    requestAnimationFrame(() => {
        setTimeout(() => {
            try { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            catch (e) { panel.scrollIntoView(true); }
        }, 80);
    });
}

function restartStatusTimer() {
    if (_statusIntervalId) { clearInterval(_statusIntervalId); _statusIntervalId = null; }
    _statusIntervalId = setInterval(updateScheduleStatus, getStatusTickMs());
}

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
    const advanceText = formatAdvanceText(notificationAdvance, notificationUnit);

    if (perm === 'denied') {
        hint.style.display = 'block';
        hint.textContent = 'Уведомления запрещены в настройках браузера. Разрешите их для этого сайта вручную.';
    } else if (perm === 'default' && notificationsEnabled) {
        hint.style.display = 'block';
        hint.textContent = 'Нужно разрешить уведомления — нажмите на переключатель ещё раз.';
    } else if (perm === 'granted' && notificationsEnabled) {
        hint.style.display = 'block';
        hint.textContent = `Готово. Напомним за ${advanceText} до начала события, пока вкладка открыта.`;
    } else {
        hint.style.display = 'none';
    }
}

function applyTheme() {
    const prevTheme = document.documentElement.getAttribute('data-theme');
    if (prevTheme === 'custom' && theme !== 'custom') {
        if (typeof clearCustomThemeInline === 'function') clearCustomThemeInline();
    }
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-bs-theme', theme === 'dark' ? 'dark' : 'light');
    if (theme === 'custom') {
        if (typeof applyCustomTheme === 'function') applyCustomTheme();
    }
    if (prevTheme !== theme && typeof refreshChartsTheme === 'function') refreshChartsTheme();
}

function downloadICS() {
    let group = document.getElementById('groupSelect').value.trim();
    let subgroup = document.getElementById('subgroupSelect').value;
    if (!group) { alert("Сначала выберите группу!"); return; }
    let url = `/api/schedule.ics?group=${encodeURIComponent(group)}&subgroup=${subgroup}`;
    window.location.href = url;
}

function applyWidgetVisibility() {
    let wm = document.getElementById('widgetMiniCalCard');
    let wg = document.getElementById('widgetGlobalCard');
    let wl = document.getElementById('widgetLabsCard');
    let wp = document.getElementById('widgetPacingCard');
    if (wm) wm.style.display = showWidgetMiniCal ? 'block' : 'none';
    if (wg) wg.style.display = showWidgetGlobal  ? 'block' : 'none';
    if (wl) wl.style.display = showWidgetLabs    ? 'block' : 'none';
    if (wp) wp.style.display = showWidgetPacing  ? 'block' : 'none';
}