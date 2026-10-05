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

// Настройки отображения пар
let showTeacher  = localStorage.getItem('showTeacher')  !== 'false';
let showLocation = localStorage.getItem('showLocation') !== 'false';
let showFriends  = localStorage.getItem('showFriends')  !== 'false';

// Статус-строка (до / во время / после пар)
let showStatus = localStorage.getItem('showStatus') !== 'false';
let statusFormat = localStorage.getItem('statusFormat') || 'interval';
let statusPrecision = localStorage.getItem('statusPrecision') || 'min';
if (!['min', 'sec', 'cs'].includes(statusPrecision)) statusPrecision = 'min';

// Частота обновления статуса зависит от выбранной точности
function getStatusTickMs() {
    if (statusPrecision === 'cs')  return 100;
    if (statusPrecision === 'sec') return 1000;
    return 30000;
}
let _statusIntervalId = null;

// Уведомления о парах
let notificationsEnabled = localStorage.getItem('notificationsEnabled') === 'true';
let notificationMinutes = parseInt(localStorage.getItem('notificationMinutes') || '15', 10);
if (isNaN(notificationMinutes) || notificationMinutes < 1) notificationMinutes = 15;

// Тема (пока только светлая)
let theme = localStorage.getItem('theme') || 'light';

// Даты, на которые есть хотя бы одна заметка. Используется для навигации.
let taskDatesSet = new Set();

let loaderInterval = null;

function saveVisibleFriends() {
    localStorage.setItem('visibleFriends', JSON.stringify([...visibleFriends]));
}

// Настройки видимости виджетов
let showWidgetGlobal = localStorage.getItem('showWidgetGlobal') !== 'false';
let showWidgetLabs   = localStorage.getItem('showWidgetLabs')   !== 'false';
let showWidgetPacing = localStorage.getItem('showWidgetPacing') !== 'false';