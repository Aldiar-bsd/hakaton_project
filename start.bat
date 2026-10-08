@echo off
chcp 65001 >nul
title Allur Digital Twin
cd /d "%~dp0"

set "PY="
where py >nul 2>&1
if not errorlevel 1 set "PY=py -3"
if not defined PY (
  where python >nul 2>&1
  if not errorlevel 1 set "PY=python"
)
if not defined PY (
  echo [!] Python не найден.
  echo     Установите Python 3.10 - 3.12: https://www.python.org/downloads/
  echo     При установке поставьте галочку "Add python.exe to PATH".
  echo     Либо в командной строке: winget install Python.Python.3.12
  pause
  exit /b 1
)

if not exist .env (
  copy .env.example .env >nul
  echo Создан файл настроек .env ^(бот выключен, ИИ можно подключить позже^).
)

rem Окружение, скопированное с другого компьютера, ссылается на чужой Python и не запускается - пересоздаём его
if exist .venv\Scripts\python.exe (
  .venv\Scripts\python.exe -c "import sys" >nul 2>&1
  if errorlevel 1 (
    echo Окружение .venv создано на другом компьютере - пересоздаю...
    rmdir /s /q .venv
  )
)

if not exist .venv\Scripts\python.exe (
  echo Первый запуск: создаю окружение...
  %PY% -m venv .venv
  if errorlevel 1 (
    echo [!] Не удалось создать окружение.
    pause
    exit /b 1
  )
)

if not exist .venv\.deps_ok (
  echo Устанавливаю библиотеки, нужен интернет, 1-2 минуты...
  .venv\Scripts\python.exe -m pip install --disable-pip-version-check -q -r requirements.txt
  if errorlevel 1 (
    echo [!] Не удалось установить библиотеки. Проверьте интернет и повторите запуск.
    pause
    exit /b 1
  )
  echo ok> .venv\.deps_ok
)

rem ---- ключ ИИ: спрашиваем один раз при первом запуске ----
if exist .ai_asked goto run
.venv\Scripts\python.exe -c "import sys;from server import config as c;sys.exit(0 if (c.AI_API_KEY or c.AI_PROVIDER=='ollama') else 1)" >nul 2>&1
if not errorlevel 1 goto aiok
echo.
echo ИИ-агент: вставьте ключ, чтобы чат отвечал настоящей моделью ^(Gemini: AIza... , Claude: sk-ant-...^).
echo Бесплатный ключ Gemini: https://aistudio.google.com/apikey
echo Без ключа всё работает, чат отвечает в простом режиме. Ключ можно добавить позже: файл API_KEY.txt или Настройки.
set "KEY="
set /p "KEY=Ключ (Enter - пропустить): "
echo asked> .ai_asked
if not defined KEY goto run
set "ALLUR_KEY=%KEY%"
.venv\Scripts\python.exe -c "import os;open('API_KEY.txt','w',encoding='utf-8').write(os.environ['ALLUR_KEY'].strip()+chr(10))"
set "ALLUR_KEY="
echo Ключ сохранён в API_KEY.txt ^(в GitHub он не попадает^).
goto run
:aiok
echo ok> .ai_asked
:run

echo.
echo Запускаю Allur Digital Twin. Браузер откроется сам. Окно не закрывайте.
echo Остановить: Ctrl+C
echo.
.venv\Scripts\python.exe -m server.main
pause
