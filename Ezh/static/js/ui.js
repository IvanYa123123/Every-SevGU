// Лоадер, уведомления, сворачивание виджетов.

const loadingPhrases = [
    "Грызем гранит науки...",
    "Связываемся с деканатом...",
    "Ищем расписание...",
    "Раскладываем пары по полочкам...",
    "Будим преподавателей...",
    "Проверяем наличие окон...",
    "Пинаем сервер...",
    "Сканируем мудл...",
    "Переписываем программу...",
    "Пьем чай...",
    "Слушаем лекцию...",
    "Взламываем калькулятор..."
];

function showGlobalLoader() {
    let idx = 0;
    document.getElementById('loaderText').textContent = loadingPhrases[idx];
    document.getElementById('globalLoader').style.display = 'flex';
    loaderInterval = setInterval(() => {
        idx = (idx + 1) % loadingPhrases.length;
        document.getElementById('loaderText').textContent = loadingPhrases[idx];
    }, 3000);
}

function hideGlobalLoader() {
    document.getElementById('globalLoader').style.display = 'none';
    if (loaderInterval) clearInterval(loaderInterval);
}

function showUpdateNotification(message) {
    let notif = document.getElementById('updateNotification');
    document.getElementById('updateNotificationText').textContent = message;
    notif.style.display = 'block';
    notif.animate([
        {opacity: 0, transform: 'translateY(20px)'},
        {opacity: 1, transform: 'translateY(0)'}
    ], {duration: 300, fill: 'forwards'});
    setTimeout(() => {
        let anim = notif.animate([
            {opacity: 1, transform: 'translateY(0)'},
            {opacity: 0, transform: 'translateY(20px)'}
        ], {duration: 300, fill: 'forwards'});
        anim.onfinish = () => notif.style.display = 'none';
    }, 3000);
}

function toggleWidget(bodyId, btn) {
    let body = document.getElementById(bodyId);
    if (body.style.height === '0px') {
        body.style.height = body.dataset.originalHeight || (bodyId === 'labPacingBody' ? 'auto' : '160px');
        setTimeout(() => { body.style.overflow = 'visible'; }, 300);
        btn.textContent = '−';
        localStorage.setItem('widget_' + bodyId, 'expanded');
    } else {
        if (!body.dataset.originalHeight) {
            let h = body.style.height;
            if (!h || h === 'auto') h = window.getComputedStyle(body).height;
            body.dataset.originalHeight = h;
        }
        body.style.overflow = 'hidden';
        body.style.height = '0px';
        btn.textContent = '+';
        localStorage.setItem('widget_' + bodyId, 'collapsed');
    }
}
