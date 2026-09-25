import os
import json
import sqlite3
from flask import Flask, render_template, request, jsonify
from planner import SevSUPlanner

app = Flask(__name__)
planner = SevSUPlanner()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
GROUPS_FILE = os.path.join(BASE_DIR, "Group.txt")
CUSTOM_GROUPS_FILE = os.path.join(BASE_DIR, "custom_groups.json")

def init_db():
    with sqlite3.connect('planner.db') as conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS tasks 
                        (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                         date TEXT, text TEXT, status TEXT)''')
        conn.execute('''CREATE TABLE IF NOT EXISTS lab_progress 
                        (group_name TEXT, subject TEXT, completed INTEGER, total INTEGER, 
                        PRIMARY KEY(group_name, subject))''')
        # Таблица для друзей
        conn.execute('''CREATE TABLE IF NOT EXISTS friends 
                        (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                         name TEXT, group_name TEXT, subgroup TEXT)''')
init_db()

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
    """Загружает группы из Group.txt (с дедупликацией) + пользовательские группы."""
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

    # Добавляем пользовательские группы
    for name in load_custom_groups():
        if name and name not in seen:
            seen.add(name)
            groups.append(name)

    return groups

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/groups")
def get_groups():
    """Возвращает список групп из локальной базы (Group.txt + custom).
    Если локальная база пуста — пробует получить список с сервера СевГУ."""
    local_groups = load_local_groups()
    if local_groups:
        return jsonify(local_groups)

    # Fallback: внешний API
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
    """Добавляет пользовательскую группу в custom_groups.json."""
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({"success": False, "error": "empty name"}), 400

    # Если группа уже есть в базовом файле — ничего не делаем
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
    schedule = planner.get_semester_schedule(group, subgroup)
    return jsonify(schedule)

@app.route("/api/labs", methods=["GET", "POST"])
def manage_labs():
    with sqlite3.connect('planner.db') as conn:
        if request.method == "POST":
            data = request.json
            if isinstance(data, list):
                for item in data:
                    conn.execute("INSERT OR REPLACE INTO lab_progress (group_name, subject, completed, total) VALUES (?, ?, ?, ?)", 
                                 (item['group'], item['subject'], int(item['completed']), int(item['total'])))
            else:
                conn.execute("INSERT OR REPLACE INTO lab_progress (group_name, subject, completed, total) VALUES (?, ?, ?, ?)", 
                             (data['group'], data['subject'], int(data['completed']), int(data['total'])))
            return jsonify({"success": True})
        
        group = request.args.get('group')
        cursor = conn.execute("SELECT subject, completed, total FROM lab_progress WHERE group_name=?", (group,))
        labs = {row[0]: {"completed": row[1], "total": row[2]} for row in cursor.fetchall()}
        return jsonify(labs)

@app.route("/api/tasks", methods=["GET", "POST"])
def manage_tasks():
    with sqlite3.connect('planner.db') as conn:
        if request.method == "POST":
            data = request.json
            cursor = conn.execute("INSERT INTO tasks (date, text, status) VALUES (?, ?, ?)", 
                                  (data['date'], data['text'], data.get('status', 'green')))
            return jsonify({"id": cursor.lastrowid})
        
        start_date = request.args.get('start')
        end_date = request.args.get('end')
        cursor = conn.execute("SELECT id, date, text, status FROM tasks WHERE date BETWEEN ? AND ?", 
                              (start_date, end_date))
        tasks = [{"id": row[0], "date": row[1], "text": row[2], "status": row[3]} for row in cursor.fetchall()]
        return jsonify(tasks)

@app.route("/api/tasks/<int:task_id>", methods=["PUT", "DELETE"])
def update_task(task_id):
    with sqlite3.connect('planner.db') as conn:
        if request.method == "PUT":
            data = request.json
            conn.execute("UPDATE tasks SET date=?, status=?, text=? WHERE id=?", 
                         (data['date'], data['status'], data['text'], task_id))
            return jsonify({"success": True})
        elif request.method == "DELETE":
            conn.execute("DELETE FROM tasks WHERE id=?", (task_id,))
            return jsonify({"success": True})

# === РОУТЫ ДЛЯ ДРУЗЕЙ ===
@app.route("/api/friends", methods=["GET", "POST"])
def manage_friends():
    with sqlite3.connect('planner.db') as conn:
        if request.method == "POST":
            data = request.json
            cursor = conn.execute("INSERT INTO friends (name, group_name, subgroup) VALUES (?, ?, ?)", 
                                  (data['name'], data['group'], data['subgroup']))
            return jsonify({"id": cursor.lastrowid})
        
        cursor = conn.execute("SELECT id, name, group_name, subgroup FROM friends")
        friends = [{"id": row[0], "name": row[1], "group": row[2], "subgroup": row[3]} for row in cursor.fetchall()]
        return jsonify(friends)

@app.route("/api/friends/<int:friend_id>", methods=["DELETE"])
def delete_friend(friend_id):
    with sqlite3.connect('planner.db') as conn:
        conn.execute("DELETE FROM friends WHERE id=?", (friend_id,))
        return jsonify({"success": True})

if __name__ == "__main__":
    app.run(debug=True)
