@echo off
chcp 65001 >nul
cd /d C:\dev\ramzor-program
powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:RAMZOR_MANAGER_PASSWORD = Read-Host 'Type the manager password and press Enter (it is not saved)'; & .\tools\backup-live-data.ps1; Read-Host 'Done. Press Enter to close'"
