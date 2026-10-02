// Заметки: создание, редактирование, цвета, drag-n-drop между днями.

const _taskBlurTimers = {};

function toggleTaskInput(dateStr) {
    let wrap = document.getElementById(`task-input-wrap-${dateStr}`);
    let input = document.getElementById(`task-input-${dateStr}`);
    if (wrap.style.display === "none") {
        wrap.style.display = "block"; input.focus();
    } else { wrap.style.display = "none"; }
}

function handleNewTask(e, dateStr) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.blur(); }
}

function handleTaskBlur(dateStr) {
    if (_taskBlurTimers[dateStr]) {
        clearTimeout(_taskBlurTimers[dateStr]);
        delete _taskBlurTimers[dateStr];
    }
    const input = document.getElementById(`task-input-${dateStr}`);
    const wrap  = document.getElementById(`task-input-wrap-${dateStr}`);
    if (!input) return;
    const text = input.value.trim();
    if (text === '') { if (wrap) wrap.style.display = "none"; return; }
    input.value = '';
    _taskBlurTimers[dateStr] = setTimeout(() => {
        delete _taskBlurTimers[dateStr];
        createTask(dateStr, text, 'green');
        if (wrap) wrap.style.display = "none";
    }, 100);
}

function createTaskFromSchedule(date, text) {
    createTask(date, text, 'orange');
}

async function createTask(date, text, status) {
    try {
        let data = await apiCreateTask({date, text, status});
        taskDatesSet.add(date);
        renderTask({id: data.id, date, text, status});
    } catch (e) { console.error("createTask failed", e); }
}

function renderTask(task) {
    const container = document.getElementById(`tasks-${task.date}`);
    if (!container) return;

    let existing = document.getElementById(`task-${task.id}`);
    if (existing) existing.remove();

    let div = document.createElement('div');
    div.className = `task-card status-${task.status}`;
    div.id = `task-${task.id}`;
    div.draggable = true;

    let spanText = document.createElement('div');
    spanText.className = 'task-text';
    let safeText = task.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    spanText.innerHTML = `<span class="task-text-short">${safeText}</span><span class="task-text-full">${safeText}</span>`;
    spanText.onclick = () => { if (task.status !== 'completed') toggleColor(task.id, task.status); };

    let actions = document.createElement('div');
    actions.className = 'task-actions';

    let btnEdit = document.createElement('a');
    btnEdit.className = 'task-btn task-edit';
    btnEdit.innerHTML = '✏️';
    btnEdit.onclick = (e) => {
        e.stopPropagation();
        let newText = prompt("Изменить заметку:", task.text);
        if (newText && newText.trim() !== '') {
            task.text = newText.trim();
            updateTaskRequest(task);
        }
    };

    let btnDel = document.createElement('a');
    btnDel.className = 'task-btn';
    if (task.status === 'completed') { div.classList.add('task-completed'); btnDel.innerHTML = '🗑️'; }
    else { btnDel.innerHTML = '×'; btnDel.style.fontSize = '1.3em'; }
    btnDel.onclick = () => handleTaskDeleteClick(task);

    if (task.status !== 'completed') actions.appendChild(btnEdit);
    actions.appendChild(btnDel);

    div.appendChild(spanText);
    div.appendChild(actions);
    div.ondragstart = (e) => { e.dataTransfer.setData("text/plain", JSON.stringify(task)); };
    container.appendChild(div);
    rebalanceDayText(task.date);
}

function updateTaskRequest(task) {
    renderTask(task);
    apiUpdateTask(task.id, {date: task.date, text: task.text, status: task.status})
        .catch(e => console.error("updateTask failed", e));
}

function handleTaskDeleteClick(task) {
    if (task.status !== 'completed') {
        task.status = 'completed';
        updateTaskRequest(task);
    } else {
        document.getElementById(`task-${task.id}`).remove();
        apiDeleteTask(task.id)
            .then(() => refreshTaskDates())
            .catch(e => console.error(e));
        rebalanceDayText(task.date);
    }
}

function toggleColor(id, currentStatus) {
    let taskElement = document.getElementById(`task-${id}`);
    if (!taskElement) return;
    let newStatus = currentStatus === 'green' ? 'orange' : (currentStatus === 'orange' ? 'red' : 'green');
    let fullEl = taskElement.querySelector('.task-text-full');
    let text = fullEl ? fullEl.textContent : '';
    let dateId = taskElement.parentElement.id.replace('tasks-', '');
    updateTaskRequest({id, date: dateId, text, status: newStatus});
}

function allowDrop(e) { e.preventDefault(); }

function drop(e, newDate) {
    e.preventDefault();
    let taskData = JSON.parse(e.dataTransfer.getData("text/plain"));
    if (taskData.date === newDate) return;
    let oldDate = taskData.date;
    taskData.date = newDate;
    updateTaskRequest(taskData);
    setTimeout(() => rebalanceDayText(oldDate), 50);
}

// Перезапрашивает у бэка список дат, на которые есть заметки.
async function refreshTaskDates() {
    try {
        let dates = await apiLoadTaskDates();
        taskDatesSet = new Set(dates);
    } catch (e) { console.error("refreshTaskDates", e); }
}