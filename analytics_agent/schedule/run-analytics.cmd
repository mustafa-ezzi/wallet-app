@echo off
setlocal
cd /d "%~dp0..\.."
py -m analytics_agent
exit /b %ERRORLEVEL%
