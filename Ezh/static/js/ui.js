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

/**
 * Возвращает DOM-элемент лоадера. Если его нет в HTML — создаёт на лету.
 * Так лоадер появится даже если index.html был старой версии.
 */
function _ensureLoaderEl() {
    let loader = document.getElementById('globalLoader');
    if (loader) return loader;

    console.warn('[ui] #globalLoader не найден — создаю динамически');
    loader = document.createElement('div');
    loader.id = 'globalLoader';
    loader.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
        'background:rgba(255,255,255,0.85)', 'z-index:9999',
        'display:none', 'flex-direction:column',
        'justify-content:center', 'align-items:center',
        'backdrop-filter:blur(4px)'
    ].join(';');
    loader.innerHTML = `
        <div class="spinner-border text-primary" style="width:3rem;height:3rem;" role="status"></div>
        <div id="loaderText" class="mt-3 fw-bold text-secondary fs-5">Загрузка...</div>
    `;
    document.body.appendChild(loader);
    return loader;
}

function _ensureLoaderText(loader) {
    let textEl = document.getElementById('loaderText');
    if (!textEl) {
        textEl = document.createElement('div');
        textEl.id = 'loaderText';
        textEl.className = 'mt-3 fw-bold text-secondary fs-5';
        textEl.textContent = 'Загрузка...';
        loader.appendChild(textEl);
    }
    return textEl;
}

/**
 * Показывает полноэкранный лоадер.
 * @param {string} [message]  Если задано — фиксированный текст вместо
 *                             ротации шутливых фраз (используется в refresh).
 */
function showGlobalLoader(message) {
    const loader = _ensureLoaderEl();
    const textEl = _ensureLoaderText(loader);

    if (loaderInterval) {
        clearInterval(loaderInterval);
        loaderInterval = null;
    }

    if (message) {
        textEl.textContent = message;
    } else {
        let idx = 0;
        textEl.textContent = loadingPhrases[idx];
        loaderInterval = setInterval(() => {
            idx = (idx + 1) % loadingPhrases.length;
            textEl.textContent = loadingPhrases[idx];
        }, 3000);
    }

    loader.style.display = 'flex';
    void loader.offsetHeight;   // force reflow — гарантия, что стиль применился
    console.log('[ui] showGlobalLoader:', message || '(default phrases)');
}

function hideGlobalLoader() {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.style.display = 'none';
    if (loaderInterval) {
        clearInterval(loaderInterval);
        loaderInterval = null;
    }
    console.log('[ui] hideGlobalLoader');
}

/**
 * Меняет текст уже показанного лоадера без пересоздания интервала.
 * Используется в manualRefresh() для пошагового прогресса.
 */
function setLoaderText(message) {
    if (!message) return;
    const textEl = document.getElementById('loaderText');
    if (textEl) textEl.textContent = message;
    console.log('[ui] loader step:', message);
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