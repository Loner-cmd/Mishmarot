@echo off
chcp 65001 > nul
echo מפעיל שרת פיתוח מקומי...
start http://localhost:3000
node server.js
pause
