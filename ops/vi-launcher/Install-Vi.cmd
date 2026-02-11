@echo off
REM Vi Console Setup Installer (One-Click Admin Setup)
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%~dp0Install-Vi.ps1'"
endlocal
