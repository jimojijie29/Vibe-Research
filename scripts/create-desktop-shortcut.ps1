#Requires -Version 5.1
<#
.SYNOPSIS
  Create a Windows desktop shortcut for the Vibe-Research project.

.DESCRIPTION
  Creates or updates a shortcut named "Vibe-Research.lnk" on the current
  user's desktop. Double-clicking it launches the Vibe-Research backend and
  frontend dev servers and opens the dashboard in the default browser.

.NOTES
  The script derives the repo root from its own location, so the current
  working directory does not matter. Example invocation:
    powershell -ExecutionPolicy Bypass -File scripts/create-desktop-shortcut.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot | Convert-Path
$iconPath = [System.IO.Path]::Combine($repoRoot, "frontend", "public", "app-icon.ico")
$launcherPath = [System.IO.Path]::Combine($repoRoot, "scripts", "start-project.cmd")
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "Vibe-Research.lnk"

if (-not (Test-Path $iconPath -PathType Leaf)) {
    throw "Icon not found: $iconPath. Run 'python scripts/generate-icon.py' first."
}

if (-not (Test-Path $launcherPath -PathType Leaf)) {
    throw "Launcher not found: $launcherPath."
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $null
try {
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $launcherPath
    $shortcut.IconLocation = "$iconPath,0"
    $shortcut.Description = "Launch Vibe-Research"
    $shortcut.WorkingDirectory = $repoRoot
    $shortcut.Save()

    Write-Host "Desktop shortcut created: $shortcutPath"
    Write-Host "Launcher: $launcherPath"
    Write-Host "Icon: $iconPath"
}
finally {
    if ($shortcut) {
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($shortcut) | Out-Null
    }
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
}
