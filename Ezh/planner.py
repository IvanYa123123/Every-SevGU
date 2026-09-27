from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from typing import Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

class SevSUPlanner:
    # Праздничные дни (месяц, день).
    # Класс-атрибут, а не instance — доступен через cls.HOLIDAYS
    # из @classmethod/@staticmethod, и через self.HOLIDAYS из экземпляра.
    HOLIDAYS: frozenset[tuple[int, int]] = frozenset({
        (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7), (1, 8),
        (2, 23),
        (3, 8),
        (5, 1),
        (5, 9),
        (6, 12),
        (11, 4),
    })

    def __init__(self) -> None:
        self.api_url: str = "https://schedule.sevsu.ru/api/schedule"
        self.groups_api: str = "https://schedule.sevsu.ru/api/groups"
        self.headers: dict[str, str] = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        }
        self.session: requests.Session = requests.Session()
        self.session.headers.update(self.headers)

        # Автоматический retry на 429/5xx с экспоненциальной задержкой.
        retry = Retry(
            total=3,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET"],
        )
        adapter = HTTPAdapter(
            max_retries=retry,
            pool_connections=10,
            pool_maxsize=10,
        )
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

        self.time_map: dict[int, str] = {
            1: "08:30 - 10:00",
            2: "10:10 - 11:40",
            3: "11:50 - 13:20",
            4: "14:00 - 15:30",
            5: "15:40 - 17:10",
            6: "17:20 - 18:50",
            7: "19:00 - 20:30",
            8: "20:40 - 22:10",
        }
        self.type_map: dict[int, str] = {
            0: "Лекция",
            1: "ПЗ",
            2: "ЛЗ",
            3: "Экзамен/Зачет",
        }

    # --------------------------------------------------------
    #  УТИЛИТЫ ДЛЯ РАБОТЫ С ДАТАМИ
    # --------------------------------------------------------

    @staticmethod
    def get_semester_season(date_obj: datetime) -> int:
        """1 — осень, 2 — весна, 0 — каникулы/сессия."""
        if 9 <= date_obj.month <= 12:
            return 1
        if 2 <= date_obj.month <= 6:
            return 2
        return 0

    @classmethod
    def is_valid_study_day(cls, date_obj: datetime) -> bool:
        """False — если дата попадает на каникулы, сессию или праздник."""
        if date_obj.month in (1, 7, 8):
            return False
        if (date_obj.month, date_obj.day) in cls.HOLIDAYS:
            return False
        return True

    # --------------------------------------------------------
    #  СЕТЬ
    # --------------------------------------------------------

    def get_schedule_for_week(self, group_name: str, week: int) -> list:
        params = {"v": "6.2", "section": "0", "group": group_name, "week": week}
        try:
            response = self.session.get(self.api_url, params=params, timeout=5)
        except requests.RequestException as e:
            logger.warning("Сетевая ошибка (группа=%s, неделя=%d): %s",
                           group_name, week, e)
            return []

        if response.status_code != 200:
            logger.warning("СевГУ вернул %d (группа=%s, неделя=%d)",
                           response.status_code, group_name, week)
            return []

        try:
            data = response.json()
        except ValueError:
            logger.warning("Некорректный JSON (группа=%s, неделя=%d)",
                           group_name, week)
            return []

        if not data.get("ok"):
            logger.warning("API вернул ok=false (группа=%s, неделя=%d): ключи=%s",
                           group_name, week, list(data.keys()))
            return []

        schedule = data.get("schedule", [])
        return schedule if isinstance(schedule, list) else []

    # --------------------------------------------------------
    #  ПОЛУЧЕНИЕ СЕМЕСТРА
    # --------------------------------------------------------

    def get_semester_schedule(self, group_name: str,
                              target_subgroup: str = "0",
                              max_weeks: int = 25) -> list:
        # --- 1. Параллельно тянем все недели ---
        week_data_map: dict[int, list] = {}
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {
                executor.submit(self.get_schedule_for_week, group_name, w): w
                for w in range(1, max_weeks + 1)
            }
            for fut in as_completed(futures):
                w = futures[fut]
                try:
                    week_data_map[w] = fut.result()
                except Exception as e:
                    logger.warning("Неделя %d упала: %s", w, e)
                    week_data_map[w] = []

        # --- 2. Последовательно обрабатываем (порядок важен для чёт/нечет) ---
        full_schedule: list = []

        # Храним шаблон ВМЕСТЕ с номером его недели — так Pylance
        # видит, что если шаблон есть, то и неделя есть.
        odd_template: Optional[tuple[list, int]] = None
        even_template: Optional[tuple[list, int]] = None

        for week in range(1, max_weeks + 1):
            week_data = week_data_map.get(week, [])

            if week_data:
                processed_week: list = []
                for item in week_data:
                    item_subgroup = str(item.get("subgroup", "0"))
                    if (target_subgroup == "0"
                            or item_subgroup == "0"
                            or item_subgroup == str(target_subgroup)):
                        new_item = item.copy()
                        new_item["time_range"] = self.time_map.get(new_item.get("n"), "")
                        new_item["type_name"] = self.type_map.get(
                            new_item.get("type"), "Занятие"
                        )
                        processed_week.append(new_item)

                full_schedule.extend(processed_week)

                if week % 2 != 0:
                    odd_template = (processed_week, week)
                else:
                    even_template = (processed_week, week)
            else:
                # Выбираем шаблон той же чётности (нечёт → odd, чёт → even).
                tpl = odd_template if week % 2 != 0 else even_template
                if tpl is None:
                    # Шаблона ещё не было — экстраполировать не от чего.
                    continue

                template_to_use, template_week = tpl
                diff_weeks = week - template_week

                for item in template_to_use:
                    extrapolated_item = item.copy()
                    if "date" in extrapolated_item:
                        try:
                            date_str = extrapolated_item["date"].split("T")[0]
                            orig_date = datetime.strptime(date_str, "%Y-%m-%d")
                            new_date = orig_date + timedelta(days=diff_weeks * 7)

                            orig_season = self.get_semester_season(orig_date)
                            new_season = self.get_semester_season(new_date)

                            if orig_season == 0 or orig_season != new_season:
                                continue
                            if not self.is_valid_study_day(new_date):
                                continue

                            extrapolated_item["date"] = new_date.strftime("%Y-%m-%d")
                        except ValueError as e:
                            logger.warning(
                                "Не удалось распарсить дату %r: %s",
                                extrapolated_item.get("date"), e
                            )

                    full_schedule.append(extrapolated_item)

        return full_schedule
