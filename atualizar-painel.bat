@echo off
rem Junta os ficheiros novos de entrada\ (sem repetidos), verifica as fontes e gera painel-leads.html.
cd /d "%~dp0"
node atualizar.mjs --verificar
if errorlevel 1 (echo Falhou. Confirme que o Node.js 18 ou superior esta instalado. & pause & exit /b 1)
echo.
echo Pronto. Abra painel-leads.html com duplo clique.
start "" painel-leads.html
pause
