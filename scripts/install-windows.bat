@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Auto J/L Cutter - installer

REM ============================================================
REM  Auto J/L Cutter - installer for Windows
REM   1) allow Premiere to load unsigned extensions
REM   2) copy the extension into the right folder
REM ============================================================

set "PASTA_SCRIPT=%~dp0"
set "ORIGEM=%PASTA_SCRIPT%auto-jl-cutter"
set "DESTINO=%APPDATA%\Adobe\CEP\extensions"

echo.
echo   AUTO J/L CUTTER - Windows installer
echo.

if not exist "%ORIGEM%\CSXS\manifest.xml" (
	echo   ERROR: could not find the "auto-jl-cutter" folder.
	echo   Extract the .zip first ^(right-click -^> Extract All^) and run this again.
	echo.
	pause
	exit /b 1
)

tasklist /FI "IMAGENAME eq Adobe Premiere Pro.exe" 2>nul | find /I "Adobe Premiere Pro.exe" >nul
if not errorlevel 1 (
	echo   HEADS UP: Premiere is running. Close it and reopen after installing.
	echo.
)

echo   [1/3] Allowing unsigned extensions...
for %%v in (9 10 11 12 13 14 15) do (
	reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
)

echo   [2/3] Installing...
if not exist "%DESTINO%" mkdir "%DESTINO%" >nul 2>&1
if exist "%DESTINO%\auto-jl-cutter" rmdir /S /Q "%DESTINO%\auto-jl-cutter"
xcopy /E /I /Y /Q "%ORIGEM%" "%DESTINO%\auto-jl-cutter" >nul

echo   [3/3] Verifying...
set FALTANDO=0
for %%f in ("CSXS\manifest.xml" "client\index.html" "client\js\main.js" "client\js\planner.js" "client\js\matrix.js" "client\js\CSInterface.js" "host\main.jsx") do (
	if not exist "%DESTINO%\auto-jl-cutter\%%~f" (
		echo         missing: %%~f
		set FALTANDO=1
	)
)

echo.
if "!FALTANDO!"=="0" (
	echo   INSTALLED SUCCESSFULLY -^> %DESTINO%\auto-jl-cutter
	echo.
	echo   Open Premiere -^> Window -^> Extensions -^> Auto J/L Cutter
) else (
	echo   Installed, but with files missing ^(see above^). Please open an issue on GitHub with this output.
)
echo.
pause
