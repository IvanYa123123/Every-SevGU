// Глобальное состояние приложения.
// Все модули читают и мутируют эти переменные напрямую.

let currentBaseDate = new Date();
currentBaseDate.setDate(currentBaseDate.getDate() - (currentBaseDate.getDay() === 0 ? 6 : currentBaseDate.getDay() - 1));

let cachedSchedule = [];
let cachedLabs = {};
let cachedSubjectSettings = {};
let globalChart = null;
let globalLabChart = null;
let currentSubjectsList = [];

let validGroups = new Set();
let allGroups = [];
let groupsLoaded = false;

let friendsList = [];
let friendsSchedules = {};
let visibleFriends = new Set(JSON.parse(localStorage.getItem('visibleFriends') || '[]'));
let draggingFriendId = null;
let editingFriendId = null;
let draggingDropdownFriendId = null;
let customCategories = JSON.parse(localStorage.getItem('customCategories') || '[]');

let expandedDayDateStr = null;
let customScheduleItems = [];

let showTeacher  = localStorage.getItem('showTeacher')  !== 'false';
let showLocation = localStorage.getItem('showLocation') !== 'false';
let showFriends  = localStorage.getItem('showFriends')  !== 'false';

let showStatus = localStorage.getItem('showStatus') !== 'false';
let statusFormat = localStorage.getItem('statusFormat') || 'interval';
let statusPrecision = localStorage.getItem('statusPrecision') || 'min';
if (!['min', 'sec', 'cs'].includes(statusPrecision)) statusPrecision = 'min';

function getStatusTickMs() {
    if (statusPrecision === 'cs')  return 100;
    if (statusPrecision === 'sec') return 1000;
    return 30000;
}
let _statusIntervalId = null;

let notificationsEnabled = localStorage.getItem('notificationsEnabled') === 'true';

let notificationAdvance = parseInt(localStorage.getItem('notificationAdvance') || '', 10);
let notificationUnit    = localStorage.getItem('notificationUnit') || '';

if (isNaN(notificationAdvance) || notificationAdvance < 1) {
    const legacy = parseInt(localStorage.getItem('notificationMinutes') || '15', 10);
    notificationAdvance = (isNaN(legacy) || legacy < 1) ? 15 : legacy;
}
if (notificationAdvance > 60) notificationAdvance = 60;

if (!['min', 'hour', 'day', 'week'].includes(notificationUnit)) {
    notificationUnit = 'min';
}

let theme = localStorage.getItem('theme') || 'light';

let taskDatesSet = new Set();

let loaderInterval = null;

function saveVisibleFriends() {
    localStorage.setItem('visibleFriends', JSON.stringify([...visibleFriends]));
}

let showWidgetMiniCal = localStorage.getItem('showWidgetMiniCal') !== 'false';
let showWidgetGlobal  = localStorage.getItem('showWidgetGlobal') !== 'false';
let showWidgetLabs    = localStorage.getItem('showWidgetLabs')   !== 'false';
let showWidgetPacing  = localStorage.getItem('showWidgetPacing') !== 'false';

// ============================================================
//  SYNC TIMES — для индикатора свежести расписания
// ------------------------------------------------------------
//  Храним timestamp последней успешной синхронизации для каждой
//  группы. Ключ — "group_subgroup". Значение — Date.now().
// ============================================================

function loadSyncTimes() {
    try {
        const raw = localStorage.getItem('sync_times');
        const parsed = raw ? JSON.parse(raw) : {};
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) { return {}; }
}

function saveSyncTime(group, subgroup) {
    try {
        const map = loadSyncTimes();
        map[`${group}_${subgroup}`] = Date.now();
        localStorage.setItem('sync_times', JSON.stringify(map));
    } catch (e) {}
}

function getSyncTime(group, subgroup) {
    const map = loadSyncTimes();
    return map[`${group}_${subgroup}`] || null;
}

// ============================================================
//  UNDO-БУФЕР
// ------------------------------------------------------------
//  Хранит одну отменяемую операцию. При новой — предыдущая
//  немедленно «сгорает» (нельзя откатить две вещи подряд).
// ============================================================

let _undoTimer = null;
let _undoCallback = null;

function scheduleUndo(message, callback, durationMs = 6000) {
    if (_undoTimer) { clearTimeout(_undoTimer); _undoTimer = null; }
    _undoCallback = callback;

    if (typeof showUndoBar === 'function') {
        showUndoBar(message, () => {
            const cb = _undoCallback;
            _undoCallback = null;
            if (_undoTimer) { clearTimeout(_undoTimer); _undoTimer = null; }
            if (typeof hideUndoBar === 'function') hideUndoBar();
            if (typeof cb === 'function') cb();
        });
    }

    _undoTimer = setTimeout(() => {
        _undoCallback = null;
        _undoTimer = null;
        if (typeof hideUndoBar === 'function') hideUndoBar();
    }, durationMs);
}

function cancelUndo() {
    if (_undoTimer) { clearTimeout(_undoTimer); _undoTimer = null; }
    _undoCallback = null;
    if (typeof hideUndoBar === 'function') hideUndoBar();
}