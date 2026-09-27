@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM Открываем браузер с задержкой 3 сек, чтобы сервер успел стартовать
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://127.0.0.1:5000"

python app.py

echo.
echo Сервер остановлен.
pause