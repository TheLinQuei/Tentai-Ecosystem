@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0Start-Vi.ps1" -OpenConsole
endlocal
