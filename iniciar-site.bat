@echo off
title Estocai - Servidor Local
echo ==============================================
echo   Iniciando o servidor local do Estocai...
echo ==============================================
start http://localhost:3000
node server.js
pause
