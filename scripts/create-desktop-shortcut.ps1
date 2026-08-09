#Requires -Version 5.1
<#
.SYNOPSIS
    Creates a desktop shortcut for the Interview Assistant.

.DESCRIPTION
    Generates a Windows .lnk shortcut on the current user's desktop that
    silently launches the Interview Assistant via PowerShell.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# Resolve project root from script location
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LauncherScript = Join-Path $ProjectRoot 'scripts\start-interview-assistant.ps1'

# Verify launcher exists
if (-not (Test-Path $LauncherScript)) {
    Write-Error "Launcher script not found at: $LauncherScript"
    exit 1
}

# Get desktop path (handles redirected/localized desktop folders)
$DesktopPath = [Environment]::GetFolderPath('Desktop')
if (-not $DesktopPath) {
    Write-Error "Failed to resolve Desktop folder path"
    exit 1
}

$ShortcutBaseName = -join ([char[]](0x9762, 0x8BD5, 0x52A9, 0x624B))
$ShortcutPath = Join-Path $DesktopPath "$ShortcutBaseName.lnk"

# Create shortcut using WScript.Shell COM object
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)

# Target: absolute path to Windows PowerShell. A bare 'powershell.exe' makes the
# .lnk depend on PATH resolution at click time, which Explorer does not guarantee.
$PowerShellExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path $PowerShellExe)) {
    Write-Error "Windows PowerShell not found at: $PowerShellExe"
    exit 1
}
$Shortcut.TargetPath = $PowerShellExe

# Arguments: hidden window, bypass execution policy, run launcher
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$LauncherScript`""

# Working directory: project root
$Shortcut.WorkingDirectory = $ProjectRoot

# Description
$Shortcut.Description = -join ([char[]](0x542F, 0x52A8, 0x9762, 0x8BD5, 0x52A9, 0x624B))

# Icon: use Electron executable if available
$ElectronExe = Join-Path $ProjectRoot 'node_modules\electron\dist\electron.exe'
if (Test-Path $ElectronExe) {
    $Shortcut.IconLocation = "$ElectronExe,0"
}

# Save the shortcut
$Shortcut.Save()

# Release COM object
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($WshShell) | Out-Null

Write-Output $ShortcutPath
exit 0
