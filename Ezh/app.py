import os
import json
import time
import sqlite3
from flask import Flask, render_template, request, jsonify, g
from planner import SevSUPlanner

app = Flask(__name__)
planner = SevSUPlanner()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "planner.db")
GROUPS_FILE = os.path.join(BASE_DIR, "Group.txt")
CUSTOM_GROUPS_FILE = os.path.join(BASE_DIR, "custom_groups.json")
SCHEDULES_DIR = os.path.join(BASE_DIR, "schedules")
SYNC_TIMES_FILE = os.path.join(BASE_DIR, ".sync_times.json")

# Троттлинг фоновой синхронизации: по умолчанию не чаще, чем раз в 6 часов.
MIN_SYNC_INTERVAL = 6 * 3600

os.makedirs(SCHEDULES_DIR, exist_ok=True)

# ============================================================
#  БАЗА ДАННЫХ
# ============================================================

def get_db():
    """Возвращает соединение с БД, привязанное к текущему запросу."""
    if 'db' not in g:
        g.db = sqlite3.connect(DB_FILE)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db

@app.teardown_appcontext
def close_db(exc=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def _column_exists(conn, table, column):
    """Проверяет наличие колонки в таблице — надёжнее, чем try/except ALTER TABLE."""
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(r[1] == column for r in rows)

def _add_column_if_missing(conn, table, column, ddl):
    if not _column_exists(conn, table, column):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")

def init_db():
    """Создаёт схему при первом запуске и докатывает недостающие колонки."""
    with sqlite3.connect(DB_FILE) as conn:
        # WAL: параллельные чтения не блокируют запись.
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")

        conn.execute('''CREATE TABLE IF NOT EXISTS tasks
                        (id INTEGER PRIMARY KEY AUTOINCREMENT,
                         date TEXT NOT NULL,
                         text TEXT NOT NULL,
                         status TEXT NOT NULL DEFAULT 'green')''')

        conn.execute('''CREATE TABLE IF NOT EXISTS lab_progress
                        (group_name TEXT NOT NULL,
                         subject TEXT NOT NULL,
                         completed INTEGER NOT NULL DEFAULT 0,
                         total INTEGER NOT NULL DEFAULT 0,
                         PRIMARY KEY(group_name, subject))''')

        conn.execute('''CREATE TABLE IF NOT EXISTS friends
                        (id INTEGER PRIMARY KEY AUTOINCREMENT,
                         name TEXT NOT NULL,
                         group_name TEXT NOT NULL,
                         subgroup TEXT NOT NULL DEFAULT '0',
                         category TEXT DEFAULT 'Мои друзья')''')

        conn.execute('''CREATE TABLE IF NOT EXISTS subject_settings
                        (subject TEXT PRIMARY KEY,
                         custom_name TEXT,
                         link TEXT)''')

        # Таблица для кастомного расписания (пары и события, добавленные пользователем)
        conn.execute('''CREATE TABLE IF NOT EXISTS custom_schedule
                        (id INTEGER PRIMARY KEY AUTOINCREMENT,
                         group_name TEXT,
                         base_date TEXT,
                         time_range TEXT,
                         lesson TEXT,
                         type_name TEXT,
                         teacher TEXT,
                         location TEXT,
                         is_event INTEGER,
                         recurrence TEXT,
                         exceptions TEXT DEFAULT '[]')''')

        # Миграции: докатываем колонки, которых может не быть в старой БД.
        _add_column_if_missing(conn, "subject_settings", "teacher", "TEXT")
        _add_column_if_missing(conn, "subject_settings", "location", "TEXT")
        _add_column_if_missing(conn, "friends", "category", "TEXT DEFAULT 'Мои друзья'")
        _add_column_if_missing(conn, "custom_schedule", "exceptions", "TEXT DEFAULT '[]'")

        # Индексы для частых выборок.
        conn.execute("CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_friends_category ON friends(category)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_lab_group ON lab_progress(group_name)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_custom_group ON custom_schedule(group_name)")

init_db()

# ============================================================
#  РАБОТА С ГРУППАМИ
# ============================================================

def load_custom_groups():
    """Загружает список пользовательских групп из JSON-файла."""
    if os.path.exists(CUSTOM_GROUPS_FILE):
        try:
            with open(CUSTOM_GROUPS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    return [str(x).strip() for x in data if str(x).strip()]
        except (json.JSONDecodeError, OSError):
            pass
    return []

def save_custom_groups(groups):
    """Сохраняет список пользовательских групп в JSON-файл."""
    try:
        with open(CUSTOM_GROUPS_FILE, 'w', encoding='utf-8') as f:
            json.dump(groups, f, ensure_ascii=False, indent=2)
    except OSError:
        pass

def load_local_groups():
    """Group.txt + custom_groups.json с дедупликацией."""
    groups = []
    seen = set()

    if os.path.exists(GROUPS_FILE):
        try:
            with open(GROUPS_FILE, 'r', encoding='utf-8') as f:
                for line in f:
                    name = line.strip()
                    if name and name not in seen:
                        seen.add(name)
                        groups.append(name)
        except OSError:
            pass

    for name in load_custom_groups():
        if name and name not in seen:
            seen.add(name)
            groups.append(name)

    return groups

def make_safe_filename(name):
    """Заменяет символы, запрещённые в именах файлов."""
    forbidden = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']
    result = str(name)
    for ch in forbidden:
        result = result.replace(ch, '_')
    return result

# ============================================================
#  ТРОТТЛИНГ СИНХРОНИЗАЦИИ
# ============================================================

def _load_sync_times():
    if os.path.exists(SYNC_TIMES_FILE):
        try:
            with open(SYNC_TIMES_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return {}

def _save_sync_times(times):
    try:
        with open(SYNC_TIMES_FILE, 'w', encoding='utf-8') as f:
            json.dump(times, f)
    except OSError:
        pass

def _needs_sync(key):
    """True, если с момента последней синхронизации прошло больше MIN_SYNC_INTERVAL."""
    last = _load_sync_times().get(key, 0)
    return (time.time() - last) > MIN_SYNC_INTERVAL

def _mark_synced(key):
    times = _load_sync_times()
    times[key] = time.time()
    _save_sync_times(times)

# ============================================================
#  РОУТЫ
# ============================================================

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/groups")
def get_groups():
    """Список групп из локальной базы. Если пусто — тянем с сервера СевГУ."""
    local_groups = load_local_groups()
    if local_groups:
        return jsonify(local_groups)

    try:
        params = {"v": "6.2", "section": "0"}
        resp = planner.session.get(planner.groups_api, params=params, timeout=5)
        if resp.status_code == 200:
            try:
                return jsonify(resp.json())
            except ValueError:
                pass
    except Exception:
        pass
    return jsonify([])

@app.route("/api/groups/custom", methods=["POST"])
def add_custom_group():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({"success": False, "error": "empty name"}), 400

    existing = load_local_groups()
    if any(g.lower() == name.lower() for g in existing):
        return jsonify({"success": True, "already": True})

    custom = load_custom_groups()
    if not any(g.lower() == name.lower() for g in custom):
        custom.append(name)
        save_custom_groups(custom)

    return jsonify({"success": True})

@app.route("/api/schedule_all")
def get_schedule_all():
    group = request.args.get('group')
    subgroup = request.args.get('subgroup', '0')
    if not group:
        return jsonify([])

    safe_group = make_safe_filename(group)
    cache_file = os.path.join(SCHEDULES_DIR, f"{safe_group}_{subgroup}.json")

    # 1. Кэш
    if os.path.exists(cache_file):
        try:
            with open(cache_file, 'r', encoding='utf-8') as f:
                return jsonify(json.load(f))
        except (json.JSONDecodeError, OSError):
            pass

    # 2. Загрузка с сайта
    schedule = planner.get_semester_schedule(group, subgroup)
    if schedule:
        try:
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(schedule, f, ensure_ascii=False, indent=2)
        except OSError:
            pass
    return jsonify(schedule)

@app.route("/api/schedule_sync")
def sync_schedule():
    """Фоновое обновление расписания. Троттлится, чтобы не дёргать СевГУ зря."""
    group = request.args.get('group')
    subgroup = request.args.get('subgroup', '0')
    if not group:
        return jsonify([])

    force = request.args.get('force') == '1'
    sync_key = f"{group}_{subgroup}"

    if not force and not _needs_sync(sync_key):
        # Недавно синхронизировали — не трогаем.
        return jsonify([])

    schedule = planner.get_semester_schedule(group, subgroup)

    if schedule:
        safe_group = make_safe_filename(group)
        cache_file = os.path.join(SCHEDULES_DIR, f"{safe_group}_{subgroup}.json")

        # Защита: не перезаписываем кэш, если пришло меньше 90% старого объёма.
        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    old_schedule = json.load(f)
                if len(schedule) < len(old_schedule) * 0.9:
                    print(f"[Защита] Отмена записи: получено {len(schedule)} пар, в кэше {len(old_schedule)}")
                    return jsonify(old_schedule)
            except (json.JSONDecodeError, OSError):
                pass

        try:
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(schedule, f, ensure_ascii=False, indent=2)
        except OSError:
            pass

    # Отмечаем синхронизацию независимо от результата — чтобы не долбить СевГУ.
    _mark_synced(sync_key)
    return jsonify(schedule)

# ============================================================
#  ЛАБЫ
# ============================================================

@app.route("/api/labs", methods=["GET", "POST"])
def manage_labs():
    conn = get_db()

    if request.method == "POST":
        data = request.get_json(silent=True)
        if data is None:
            return jsonify({"error": "invalid json"}), 400

        items = data if isinstance(data, list) else [data]
        for item in items:
            group = (item.get('group') or '').strip()
            subject = (item.get('subject') or '').strip()
            if not group or not subject:
                continue
            try:
                completed = max(0, int(item.get('completed', 0)))
                total = max(0, int(item.get('total', 0)))
            except (TypeError, ValueError):
                continue
            if completed > total:
                completed = total
            conn.execute(
                "INSERT OR REPLACE INTO lab_progress (group_name, subject, completed, total) "
                "VALUES (?, ?, ?, ?)",
                (group, subject, completed, total)
            )
        conn.commit()
        return jsonify({"success": True})

    group = request.args.get('group')
    if not group:
        return jsonify({})

    cursor = conn.execute(
        "SELECT subject, completed, total FROM lab_progress WHERE group_name=?",
        (group,)
    )
    labs = {row["subject"]: {"completed": row["completed"], "total": row["total"]}
            for row in cursor.fetchall()}
    return jsonify(labs)

# ============================================================
#  ЗАДАЧИ
# ============================================================

@app.route("/api/tasks", methods=["GET", "POST"])
def manage_tasks():
    conn = get_db()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        date = (data.get('date') or '').strip()
        text = (data.get('text') or '').strip()
        status = (data.get('status') or 'green').strip()

        if not date or not text:
            return jsonify({"error": "date and text required"}), 400
        if status not in ('green', 'orange', 'red', 'completed'):
            status = 'green'

        cursor = conn.execute(
            "INSERT INTO tasks (date, text, status) VALUES (?, ?, ?)",
            (date, text, status)
        )
        conn.commit()
        return jsonify({"id": cursor.lastrowid})

    start_date = request.args.get('start')
    end_date = request.args.get('end')
    if not start_date or not end_date:
        return jsonify([])

    cursor = conn.execute(
        "SELECT id, date, text, status FROM tasks WHERE date BETWEEN ? AND ?",
        (start_date, end_date)
    )
    tasks = [{"id": row["id"], "date": row["date"],
              "text": row["text"], "status": row["status"]}
             for row in cursor.fetchall()]
    return jsonify(tasks)

@app.route("/api/tasks/<int:task_id>", methods=["PUT", "DELETE"])
def update_task(task_id):
    conn = get_db()

    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        date = (data.get('date') or '').strip()
        text = (data.get('text') or '').strip()
        status = (data.get('status') or 'green').strip()

        if not date or not text:
            return jsonify({"error": "date and text required"}), 400

        conn.execute(
            "UPDATE tasks SET date=?, status=?, text=? WHERE id=?",
            (date, status, text, task_id)
        )
        conn.commit()
        return jsonify({"success": True})

    conn.execute("DELETE FROM tasks WHERE id=?", (task_id,))
    conn.commit()
    return jsonify({"success": True})

# ============================================================
#  ДРУЗЬЯ
# ============================================================

@app.route("/api/friends", methods=["GET", "POST"])
def manage_friends():
    conn = get_db()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        name = (data.get('name') or '').strip()
        group = (data.get('group') or '').strip()
        subgroup = str(data.get('subgroup', '0'))
        category = (data.get('category') or '').strip()

        if not name or not group:
            return jsonify({"error": "name and group required"}), 400

        cursor = conn.execute(
            "INSERT INTO friends (name, group_name, subgroup, category) VALUES (?, ?, ?, ?)",
            (name, group, subgroup, category)
        )
        conn.commit()
        return jsonify({"id": cursor.lastrowid})

    cursor = conn.execute("SELECT id, name, group_name, subgroup, category FROM friends")
    friends = [{"id": row["id"], "name": row["name"], "group": row["group_name"],
                "subgroup": row["subgroup"], "category": row["category"] or ""}
               for row in cursor.fetchall()]
    return jsonify(friends)

@app.route("/api/friends/<int:friend_id>", methods=["PUT", "DELETE"])
def update_or_delete_friend(friend_id):
    conn = get_db()

    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        name = (data.get('name') or '').strip()
        group = (data.get('group') or '').strip()
        subgroup = str(data.get('subgroup', '0'))
        category = (data.get('category') or '').strip()

        if not name or not group:
            return jsonify({"error": "name and group required"}), 400

        conn.execute(
            "UPDATE friends SET name=?, group_name=?, subgroup=?, category=? WHERE id=?",
            (name, group, subgroup, category, friend_id)
        )
        conn.commit()
        return jsonify({"success": True})

    conn.execute("DELETE FROM friends WHERE id=?", (friend_id,))
    conn.commit()
    return jsonify({"success": True})

# ============================================================
#  НАСТРОЙКИ ПРЕДМЕТОВ
# ============================================================

@app.route("/api/subjects", methods=["GET", "POST"])
def manage_subjects():
    conn = get_db()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        subject = (data.get('subject') or '').strip()
        if not subject:
            return jsonify({"error": "subject required"}), 400

        conn.execute(
            "INSERT OR REPLACE INTO subject_settings "
            "(subject, custom_name, link, teacher, location) VALUES (?, ?, ?, ?, ?)",
            (subject,
             data.get('custom_name', '') or '',
             data.get('link', '') or '',
             data.get('teacher', '') or '',
             data.get('location', '') or '')
        )
        conn.commit()
        return jsonify({"success": True})

    cursor = conn.execute(
        "SELECT subject, custom_name, link, teacher, location FROM subject_settings"
    )
    settings = {row["subject"]: {
        "custom_name": row["custom_name"],
        "link": row["link"],
        "teacher": row["teacher"],
        "location": row["location"],
    } for row in cursor.fetchall()}
    return jsonify(settings)

# ============================================================
#  КАСТОМНОЕ РАСПИСАНИЕ (пары и события, добавленные пользователем)
# ============================================================

@app.route("/api/custom_schedule", methods=["GET", "POST"])
def manage_custom_schedule():
    conn = get_db()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        group = (data.get('group') or '').strip()
        lesson = (data.get('lesson') or '').strip()
        if not group or not lesson:
            return jsonify({"error": "group and lesson required"}), 400

        cursor = conn.execute(
            "INSERT INTO custom_schedule "
            "(group_name, base_date, time_range, lesson, type_name, teacher, location, is_event, recurrence, exceptions) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (group,
             data.get('base_date', '') or '',
             data.get('time_range', '') or '',
             lesson,
             data.get('type_name', '') or '',
             data.get('teacher', '') or '',
             data.get('location', '') or '',
             int(data.get('is_event', 0) or 0),
             data.get('recurrence', 'none') or 'none',
             data.get('exceptions', '[]') or '[]')
        )
        conn.commit()
        return jsonify({"id": cursor.lastrowid})

    group = request.args.get('group')
    if not group:
        return jsonify([])

    cursor = conn.execute(
        "SELECT id, base_date, time_range, lesson, type_name, teacher, location, is_event, recurrence, exceptions "
        "FROM custom_schedule WHERE group_name=?",
        (group,)
    )
    items = [{
        "id": row["id"],
        "base_date": row["base_date"],
        "time_range": row["time_range"],
        "lesson": row["lesson"],
        "type_name": row["type_name"],
        "teacher": row["teacher"],
        "location": row["location"],
        "is_event": row["is_event"],
        "recurrence": row["recurrence"],
        "exceptions": row["exceptions"] or "[]",
    } for row in cursor.fetchall()]
    return jsonify(items)

@app.route("/api/custom_schedule/<int:item_id>", methods=["PUT", "DELETE"])
def update_custom_schedule(item_id):
    conn = get_db()

    if request.method == "PUT":
        data = request.get_json(silent=True) or {}
        lesson = (data.get('lesson') or '').strip()
        if not lesson:
            return jsonify({"error": "lesson required"}), 400

        conn.execute(
            "UPDATE custom_schedule SET base_date=?, time_range=?, lesson=?, "
            "type_name=?, teacher=?, location=?, is_event=?, recurrence=?, exceptions=? "
            "WHERE id=?",
            (data.get('base_date', '') or '',
             data.get('time_range', '') or '',
             lesson,
             data.get('type_name', '') or '',
             data.get('teacher', '') or '',
             data.get('location', '') or '',
             int(data.get('is_event', 0) or 0),
             data.get('recurrence', 'none') or 'none',
             data.get('exceptions', '[]') or '[]',
             item_id)
        )
        conn.commit()
        return jsonify({"success": True})

    conn.execute("DELETE FROM custom_schedule WHERE id=?", (item_id,))
    conn.commit()
    return jsonify({"success": True})

# ============================================================
#  ЗАПУСК
# ============================================================

if __name__ == "__main__":
    # debug включается явно: FLASK_DEBUG=1 python app.py
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug, host="127.0.0.1", port=5000)