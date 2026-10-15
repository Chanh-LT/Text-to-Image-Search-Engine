@echo off
title OmniLens - Multi-Engine Reverse Image Search
color 0b
echo ========================================================
echo       OMNILENS - REVERSE IMAGE SEARCH TOOL
echo   Google Lens + Bing Visual Search + Yandex Images
echo ========================================================
echo.

:: Check python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python chua duoc cai dat hoac chua duoc them vao PATH!
    echo Vui long cai dat Python 3.10 tro len de tiep tuc.
    pause
    exit /b 1
)

echo [1/2] Dang kiem tra thu vien phu thuoc...
python -m pip install -r requirements.txt --quiet

echo [2/2] Dang khoi dong Web Server tren http://127.0.0.1:8000...
echo.
echo ========================================================
echo   Web App dang chay tai: http://127.0.0.1:8000
echo   Trinh duyet se tu dong mo sau 2 giay...
echo   (Nhan Ctrl + C de dung server)
echo ========================================================
echo.

start "" http://127.0.0.1:8000
python main.py

pause
