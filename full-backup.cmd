@echo off
chcp 65001 >nul
cd /d C:\dev\ramzor-program
powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:RAMZOR_BACKUP_EMAIL = Read-Host 'Your sign-in e-mail (the admin)'; $s = Read-Host 'Your password (not shown, not saved)' -AsSecureString; $env:RAMZOR_BACKUP_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)); & .	oolsackup-live-data.ps1; Read-Host 'Done. Press Enter to close'"
