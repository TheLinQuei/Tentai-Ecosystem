# Vi Launcher (Windows)

This folder contains the recommended no-command launch path for Vi on Windows.

## What it does

- Start Vi containers automatically on login (Task Scheduler)
- Provide a one-click desktop launcher (CMD shortcut)

## Files

- Start-Vi.ps1: Starts Vi containers via docker compose
- Launch-Vi.cmd: One-click launcher (use for desktop shortcut)
- TaskScheduler-Vi.xml: Task Scheduler definition

## Setup

1) Desktop shortcut
- Right click Launch-Vi.cmd and choose "Create shortcut"
- Move the shortcut to your desktop

2) Task Scheduler (auto-start)
- Open Task Scheduler as Administrator
- "Create Task..." -> "Import Task..."
- Select TaskScheduler-Vi-utf16.xml (preferred) or TaskScheduler-Vi.xml
- If your repo path differs, update the path inside the XML

## Optional

To open the console automatically after start, edit Launch-Vi.cmd or run:

powershell -ExecutionPolicy Bypass -File "Start-Vi.ps1" -OpenConsole

The default console URL is https://tentaitech.com/console.
