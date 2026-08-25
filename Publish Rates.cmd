@echo off
title Karat Board - publish rates
cd /d "%~dp0"

echo.
echo  Karat Board - sweeping all eight merchants from this PC
echo  ------------------------------------------------------
echo  Tanishq and Bhima block GitHub's servers but not your home
echo  connection, so this is the only way their numbers get refreshed.
echo.

python tools\build_site.py _site
if errorlevel 1 goto :failed

copy /y "_site\rates.json" "seed\rates.json" >nul

git add seed/rates.json
git diff --cached --quiet && goto :nochange

for /f "tokens=1-3 delims=/: " %%a in ("%time%") do set NOW=%%a:%%b
git commit -q -m "Rates swept from home %date% %NOW%"
git push -q origin main
if errorlevel 1 goto :failed

echo.
echo  Published. The site rebuilds and goes live in about a minute:
echo  https://karatboard.yourcardjourney.store
echo.
pause
exit /b 0

:nochange
echo.
echo  Nothing changed - the published rates already match this sweep.
echo.
pause
exit /b 0

:failed
echo.
echo  Something went wrong above. Nothing was published.
echo.
pause
exit /b 1
