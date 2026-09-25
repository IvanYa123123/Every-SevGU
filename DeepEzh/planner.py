import requests
from collections import defaultdict
from datetime import datetime, timedelta

class SevSUPlanner:
    def __init__(self):
        self.api_url = "https://schedule.sevsu.ru/api/schedule"
        self.groups_api = "https://schedule.sevsu.ru/api/groups"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        self.session = requests.Session()
        self.session.headers.update(self.headers)
        
        self.time_map = {
            1: "08:30 - 10:00",
            2: "10:10 - 11:40",
            3: "11:50 - 13:20",
            4: "14:00 - 15:30",
            5: "15:40 - 17:10",
            6: "17:20 - 18:50",
            7: "19:00 - 20:30",
            8: "20:40 - 22:10"
        }
        self.type_map = {0: "Лекция", 1: "Практика", 2: "Лабораторная", 3: "Экзамен/Зачет"}

        # Праздничные дни (месяц, день)
        self.holidays = {
            (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7), (1, 8),
            (2, 23),
            (3, 8),
            (5, 1),
            (5, 9),
            (6, 12),
            (11, 4)
        }

    def get_semester_season(self, date_obj: datetime) -> int:
        """Определяет, к какому семестру относится дата (1 - осенний, 2 - весенний, 0 - прочее)"""
        if 9 <= date_obj.month <= 12:
            return 1 # Осенний (сентябрь - декабрь)
        elif 2 <= date_obj.month <= 6:
            return 2 # Весенний (февраль - июнь)
        return 0

    def is_valid_study_day(self, date_obj: datetime) -> bool:
        """Проверяет, не выпадает ли дата на каникулы, сессию или праздники"""
        if date_obj.month in [1, 7, 8]:
            return False
        if (date_obj.month, date_obj.day) in self.holidays:
            return False
        return True

    def get_schedule_for_week(self, group_name: str, week: int) -> list:
        params = {"v": "6.2", "section": "0", "group": group_name, "week": week}
        try:
            response = self.session.get(self.api_url, params=params, timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data.get("ok"):
                    return data.get("schedule", [])
        except requests.RequestException:
            pass
        return []

    def get_semester_schedule(self, group_name: str, target_subgroup: str = "0", max_weeks: int = 25) -> list:
        full_schedule = []
        
        odd_template = None
        odd_template_week = None
        even_template = None
        even_template_week = None

        for week in range(1, max_weeks + 1):
            week_data = self.get_schedule_for_week(group_name, week)
            
            if week_data:
                processed_week = []
                for item in week_data:
                    item_subgroup = str(item.get("subgroup", "0"))
                    if target_subgroup == "0" or item_subgroup == "0" or item_subgroup == str(target_subgroup):
                        new_item = item.copy()
                        new_item["time_range"] = self.time_map.get(new_item.get("n"), "")
                        new_item["type_name"] = self.type_map.get(new_item.get("type"), "Занятие")
                        processed_week.append(new_item)
                
                full_schedule.extend(processed_week)
                
                if week % 2 != 0:
                    odd_template = processed_week
                    odd_template_week = week
                else:
                    even_template = processed_week
                    even_template_week = week
                    
            else:
                template_to_use = None
                template_week = None
                
                if week % 2 != 0 and odd_template:
                    template_to_use = odd_template
                    template_week = odd_template_week
                elif week % 2 == 0 and even_template:
                    template_to_use = even_template
                    template_week = even_template_week
                
                if template_to_use:
                    diff_weeks = week - template_week
                    
                    for item in template_to_use:
                        extrapolated_item = item.copy()
                        if "date" in extrapolated_item:
                            try:
                                date_str = extrapolated_item["date"].split("T")[0]
                                orig_date = datetime.strptime(date_str, "%Y-%m-%d")
                                new_date = orig_date + timedelta(days=diff_weeks * 7)
                                
                                # Строгое ограничение: экстраполируем только в пределах того же семестра
                                orig_season = self.get_semester_season(orig_date)
                                new_season = self.get_semester_season(new_date)
                                
                                if orig_season == 0 or orig_season != new_season:
                                    continue
                                    
                                if not self.is_valid_study_day(new_date):
                                    continue
                                    
                                extrapolated_item["date"] = new_date.strftime("%Y-%m-%d")
                            except ValueError:
                                pass 
                        
                        full_schedule.append(extrapolated_item)
                        
        return full_schedule
