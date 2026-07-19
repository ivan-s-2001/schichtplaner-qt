@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

(
  echo Updating Outline and Schedule from origin/main...

  where git >nul 2>&1
  if errorlevel 1 (
    echo ERROR: Git was not found in PATH.
    echo Install Git for Windows and restart the terminal.
    exit /b 1
  )

  if not exist ".git" (
    echo ERROR: Schedule is not a Git repository.
    echo Expected path: C:\OSPanel\home\schedule.qt.local
    exit /b 1
  )

  if not exist "..\outline.qt.local\.git" (
    echo ERROR: Outline repository was not found.
    echo Expected path: C:\OSPanel\home\outline.qt.local
    echo Clone it with:
    echo git clone https://github.com/ivan-s-2001/Outline-osp.git C:\OSPanel\home\outline.qt.local
    exit /b 1
  )

  set "SCHEDULE_BRANCH="
  set "OUTLINE_BRANCH="
  for /f "usebackq delims=" %%B in (`git -C "." branch --show-current`) do set "SCHEDULE_BRANCH=%%B"
  for /f "usebackq delims=" %%B in (`git -C "..\outline.qt.local" branch --show-current`) do set "OUTLINE_BRANCH=%%B"

  if /I not "!SCHEDULE_BRANCH!"=="main" (
    echo ERROR: Schedule must be on the main branch. Current branch: !SCHEDULE_BRANCH!
    exit /b 1
  )

  if /I not "!OUTLINE_BRANCH!"=="main" (
    echo ERROR: Outline must be on the main branch. Current branch: !OUTLINE_BRANCH!
    exit /b 1
  )

  set "SCHEDULE_DIRTY="
  set "OUTLINE_DIRTY="
  for /f "usebackq delims=" %%S in (`git -C "." status --porcelain`) do set "SCHEDULE_DIRTY=1"
  for /f "usebackq delims=" %%S in (`git -C "..\outline.qt.local" status --porcelain`) do set "OUTLINE_DIRTY=1"

  if defined SCHEDULE_DIRTY (
    echo ERROR: Schedule contains local changes.
    echo Commit, stash, or discard them before automatic update.
    git -C "." status --short
    exit /b 1
  )

  if defined OUTLINE_DIRTY (
    echo ERROR: Outline contains local changes.
    echo Commit, stash, or discard them before automatic update.
    git -C "..\outline.qt.local" status --short
    exit /b 1
  )

  echo.
  echo Updating Outline...
  git -C "..\outline.qt.local" pull --ff-only origin main
  if errorlevel 1 (
    echo ERROR: Outline update failed.
    exit /b 1
  )

  echo.
  echo Updating Schedule...
  git -C "." pull --ff-only origin main
  if errorlevel 1 (
    echo ERROR: Schedule update failed.
    exit /b 1
  )

  echo.
  echo Outline and Schedule are up to date.
  exit /b 0
)
