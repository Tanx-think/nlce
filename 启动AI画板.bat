@echo off
chcp 65001 >nul
title AI 电路设计助手 - 一键启动器

echo ====================================================
echo   正在启动 NLCE AI 电路设计系统...
echo ====================================================
echo.

echo [1/2] 正在启动 AI 服务端 (bridge-server)...
start "AI Service" cmd /k "cd /d F:\jlceda-extension\ai-test && node bridge-server.js"

echo [2/2] 正在启动桌面悬浮球 (ai-desktop)...
start "AI Desktop" cmd /k "cd /d F:\jlceda-extension\ai-desktop && npm start"

echo.
echo ✅ 启动完毕！请去嘉立创 EDA 点击连接 AI 服务。
pause
