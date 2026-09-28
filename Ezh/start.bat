@echo off
chcp 65001 >nul
cd /d "%~dp0"

title Every-SevGU

where python >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Python не найден в PATH.
    echo Установи Python или добавь его в переменную PATH.
    pause
    exit /b 1
)

echo === Every-SevGU ===
echo Запуск сервера на http://127.0.0.1:5000
echo Браузер откроется через 3 секунды...
echo.
echo Чтобы остановить — нажми Ctrl+C в этом окне.
echo.

REM Открыть браузер через 3 секунды в свёрнутом окне cmd
start "" /min cmd /c "timeout /t 3 /nobreak >nul & start http://127.0.0.1:5000"

python app.py

echo.
echo === Сервер остановлен ===
pause