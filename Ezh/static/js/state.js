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

let showTeacher = localStorage.getItem('showTeacher') !== 'false';
let showLocation = localStorage.getItem('showLocation') !== 'false';
let showFriends = localStorage.getItem('showFriends') !== 'false';

let loaderInterval = null;

// Даты, на которые есть хотя бы одна заметка. Используется для навигации.
let taskDatesSet = new Set();

function saveVisibleFriends() {
    localStorage.setItem('visibleFriends', JSON.stringify([...visibleFriends]));
}