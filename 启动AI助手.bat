@echo off
cd /d D:\jlceda-extension\ai-test
start "" /min cmd /c "node bridge-server.js"

cd /d D:\jlceda-extension\ai-desktop
start "" /min cmd /c "npm start"
exit