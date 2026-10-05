@echo off
chcp 65001 >nul
cd /d C:\dev\ramzor-program
powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:RAMZOR_STAFF_PASSWORD = Read-Host 'Type the staff password and press Enter'; & .\tools\backup-live-data.ps1; Read-Host 'Done. Press Enter to close'"
