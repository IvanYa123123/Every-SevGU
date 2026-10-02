// Уведомления о парах через Notification API + setTimeout.
// Работают, пока вкладка с приложением открыта.

let _notificationTimers = [];
let _notifiedKeys = new Set();
let _notificationCheckInterval = null;

function initNotifications() {
    if (_notificationCheckInterval) clearInterval(_notificationCheckInterval);
    _notificationCheckInterval = setInterval(refreshNotifications, 60000);
    refreshNotifications();
}

function requestNotificationPermission() {
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    if (Notification.permission === 'denied')  return Promise.resolve('denied');
    return Notification.requestPermission();
}

function refreshNotifications() {
    _notificationTimers.forEach(t => clearTimeout(t));
    _notificationTimers = [];

    if (!notificationsEnabled) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!cachedSchedule || cachedSchedule.length === 0) return;

    let now = new Date();
    let todayStr = getLocalDateStr(now);
    let nowMins = now.getHours() * 60 + now.getMinutes();

    for (let k of Array.from(_notifiedKeys)) {
        if (!k.startsWith(todayStr)) _notifiedKeys.delete(k);
    }

    let todayPairs = cachedSchedule.filter(x => x.date === todayStr);

    todayPairs.forEach(pair => {
        let parts = pair.time_range.split(' - ');
        if (parts.length < 2) return;

        let [sh, sm] = parts[0].split(':').map(Number);
        if (isNaN(sh) || isNaN(sm)) return;

        let startMins = sh * 60 + sm;
        let notifyMins = startMins - notificationMinutes;
        let delayMins = notifyMins - nowMins;

        if (delayMins < 0) return;

        let key = `${todayStr}_${pair.n}_${pair.lesson}_${pair.time_range}`;
        if (_notifiedKeys.has(key)) return;

        let delayMs = delayMins * 60 * 1000;
        if (delayMs > 12 * 3600 * 1000) return;

        let t = setTimeout(() => {
            _notifiedKeys.add(key);
            showPairNotification(pair);
        }, delayMs);

        _notificationTimers.push(t);
    });
}

function showPairNotification(pair) {
    let title = `Пара через ${notificationMinutes} ${plural(notificationMinutes, 'минуту', 'минуты', 'минут')}`;

    let body = pair.lesson || 'Пара';
    if (pair.location) body += ` — ${pair.location}`;
    if (pair.teacher)  body += `\n${pair.teacher}`;

    try {
        new Notification(title, {
            body: body,
            tag: `pair-${pair.n}-${pair.lesson}`,
            requireInteraction: false,
        });
    } catch (e) {
        console.error('Notification failed:', e);
    }
}