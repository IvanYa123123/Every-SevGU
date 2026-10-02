// Принудительное обновление расписания с сервера СевГУ.
//
// Порядок работы (важно!):
//   1. showGlobalLoader() вызывается ПЕРВЫМ, до любых await.
//   2. Каждый шаг пишет в лоадер свой текст через setLoaderText().
//   3. Любая ошибка — console.error + понятный тост с HTTP-кодом.
//   4. В finally лоадер скрывается, кнопка разблокируется.

async function manualRefresh() {
    const group    = (document.getElementById('groupSelect').value || '').trim();
    const subgroup = document.getElementById('subgroupSelect').value;

    if (!group) {
        alert('Сначала выберите группу');
        return;
    }

    const btn  = document.getElementById('refreshBtn');
    const icon = document.getElementById('refreshIcon');

    console.log('[refresh] START group=%s subgroup=%s', group, subgroup);

    // Лоадер показываем СРАЗУ — никаких confirm() до него (они блокируют поток).
    showGlobalLoader(`🔄 Обновляем «${group}» с СевГУ...`);
    if (btn)  btn.disabled = true;
    if (icon) icon.classList.add('refresh-spinning');

    try {
        // --- 1. Форсим sync с сервера ---
        setLoaderText('📡 Запрашиваем расписание (может занять 5–15 сек)...');
        const fresh = await apiSyncScheduleForce(group, subgroup);
        console.log('[refresh] sync response:',
                    Array.isArray(fresh) ? `${fresh.length} items` : typeof fresh);

        if (Array.isArray(fresh) && fresh.length > 0) {
            cachedSchedule = applyTimeFix(fresh);
        } else {
            // Пустой ответ может значить: сработала защита от затирания (сервер
            // вернул старый кэш), либо у группы реально нет пар. Берём из кэша.
            setLoaderText('📦 Загружаем из локального кэша...');
            const fallback = await apiLoadSchedule(group, subgroup);
            cachedSchedule = applyTimeFix(fallback);
        }

        // --- 2. Кастомное расписание + настройки предметов ---
        setLoaderText('📚 Подтягиваем события и настройки предметов...');
        const [cs, subjects] = await Promise.all([
            apiLoadCustomSchedule(group).catch(() => []),
            apiLoadSubjects().catch(() => ({}))
        ]);
        customScheduleItems   = cs;
        cachedSubjectSettings = subjects;

        // --- 3. Лабы + даты заметок ---
        setLoaderText('📊 Пересчитываем статистику...');
        await updateLabsCache();
        await refreshTaskDates();

        // --- 4. Друзья в фоне (не блокируем UI) ---
        if (typeof syncFriendsSchedules === 'function') {
            syncFriendsSchedules(true).catch(e => console.error('[refresh] friends sync failed', e));
        }

        // --- 5. Перерисовка ---
        setLoaderText('🎨 Рисуем календарь...');
        renderCalendar();
        try { renderCharts(); } catch (e) { console.error('[refresh] renderCharts failed', e); }
        updateScheduleStatus();
        refreshNotifications();

        const count = Array.isArray(cachedSchedule) ? cachedSchedule.length : 0;
        showUpdateNotification(`✅ Расписание обновлено (${count} пар)`);
        console.log('[refresh] OK, %d pairs', count);

    } catch (e) {
        console.error('[refresh] ERROR:', e);
        let msg = '❌ Не удалось обновить расписание';
        if (e && e.status === 429) {
            msg = '⚠️ Слишком часто. Подождите минуту';
        } else if (e && e.status === 500) {
            msg = '❌ Ошибка сервера (500). Смотрите консоль Flask';
        } else if (e && e.status) {
            msg = `❌ Ошибка HTTP ${e.status}`;
        } else if (e && e.message) {
            msg = `❌ ${e.message}`;
        }
        showUpdateNotification(msg);
    } finally {
        hideGlobalLoader();
        if (btn)  btn.disabled = false;
        if (icon) icon.classList.remove('refresh-spinning');
        console.log('[refresh] DONE');
    }
}