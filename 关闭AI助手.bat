@echo off
echo 正在关闭 AI 电路助手...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM electron.exe /T >nul 2>&1
echo 已关闭。
pause
