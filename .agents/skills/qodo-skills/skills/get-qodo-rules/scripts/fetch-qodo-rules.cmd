@echo off
set SCRIPT_DIR=%~dp0
py -3 "%SCRIPT_DIR%fetch-qodo-rules.py" %*
