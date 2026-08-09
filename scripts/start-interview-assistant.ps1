#Requires -Version 5.1
<#
.SYNOPSIS
    Silently starts the Interview Assistant development environment.

.DESCRIPTION
    Checks dependencies, starts Vite renderer if needed, conditionally builds
    Electron, and launches the application in a detached process. Prevents
    duplicate instances and recovers project instances whose windows are hidden.

.PARAMETER CheckOnly
    Validate dependencies and existing instances without launching Electron.

.PARAMETER WaitTimeoutSeconds
    Maximum seconds to wait for Vite renderer readiness. Default: 60.
#>

[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [int]$WaitTimeoutSeconds = 60
)

$ErrorActionPreference = 'Stop'

# Resolve project root from script location
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot 'logs\launcher'
$LogFile = Join-Path $LogDir 'launcher.log'
$ViteStdoutLog = Join-Path $LogDir 'vite.stdout.log'
$ViteStderrLog = Join-Path $LogDir 'vite.stderr.log'

# Ensure log directory exists
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Write-LauncherLog {
    param([string]$Message)
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $logLine = "[$timestamp] $Message"
    Add-Content -Path $LogFile -Value $logLine -Encoding UTF8
    Write-Host $logLine
}

Write-LauncherLog "=== Launcher started ==="
Write-LauncherLog "ProjectRoot: $ProjectRoot"
Write-LauncherLog "CheckOnly: $CheckOnly"
Write-LauncherLog "WaitTimeoutSeconds: $WaitTimeoutSeconds"

# Define required paths
# npm is not shipped inside node_modules/.bin; resolve it from PATH (or next to node.exe)
function Resolve-NpmCommand {
    $localNpm = Join-Path $ProjectRoot 'node_modules\.bin\npm.cmd'
    if (Test-Path $localNpm) { return $localNpm }

    $fromPath = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
    if ($fromPath) { return $fromPath.Source }

    $nodeCmd = Get-Command 'node.exe' -ErrorAction SilentlyContinue
    if ($nodeCmd) {
        $sibling = Join-Path (Split-Path -Parent $nodeCmd.Source) 'npm.cmd'
        if (Test-Path $sibling) { return $sibling }
    }

    return $null
}

$NpmCmd = Resolve-NpmCommand
$ElectronExe = Join-Path $ProjectRoot 'node_modules\electron\dist\electron.exe'
$DistElectronDir = Join-Path $ProjectRoot 'dist-electron'
$ElectronMain = Join-Path $DistElectronDir 'electron\main.js'
$NodeModules = Join-Path $ProjectRoot 'node_modules'
$RendererUrl = 'http://127.0.0.1:5180'

# Step 3: Dependency checks
Write-LauncherLog "Checking dependencies..."

if (-not (Test-Path $NodeModules)) {
    Write-LauncherLog "ERROR: node_modules directory not found at: $NodeModules"
    Write-LauncherLog "Run 'npm install' first"
    exit 1
}

if (-not $NpmCmd) {
    Write-LauncherLog "ERROR: npm.cmd could not be resolved from node_modules\.bin, PATH, or the node.exe directory"
    Write-LauncherLog "Install Node.js or ensure npm is on PATH"
    exit 1
}
Write-LauncherLog "Using npm: $NpmCmd"

if (-not (Test-Path $ElectronExe)) {
    Write-LauncherLog "ERROR: Electron executable not found at: $ElectronExe"
    Write-LauncherLog "Run 'npm install' to restore Electron"
    exit 1
}

Write-LauncherLog "Dependencies validated"

# Step 3: Check for an existing instance of this project.
# Get-Process.MainWindowTitle is empty when Electron hides every BrowserWindow,
# so use the executable path and Chromium child-process marker to find the main
# process reliably. Other Electron applications use different executable paths.
Write-LauncherLog "Checking for existing project instance..."

$allProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
$existingMainProcesses = @($allProcesses | Where-Object {
    $_.ExecutablePath -eq $ElectronExe -and
    $_.CommandLine -and
    $_.CommandLine -notmatch '--type='
})

$visibleMainIds = @($existingMainProcesses | Where-Object {
    $liveProcess = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
    $liveProcess -and $liveProcess.Responding -and $liveProcess.MainWindowHandle -ne 0
} | ForEach-Object { [int]$_.ProcessId })

if ($visibleMainIds.Count -gt 0) {
    Write-LauncherLog "Found visible project instance (PID: $($visibleMainIds -join ', '))"
    Write-LauncherLog "Application already running - exiting successfully"
    exit 0
}

$hiddenMainIds = @($existingMainProcesses | ForEach-Object { [int]$_.ProcessId })
if ($hiddenMainIds.Count -gt 0) {
    Write-LauncherLog "Found hidden project instance (PID: $($hiddenMainIds -join ', '))"

    if ($CheckOnly) {
        Write-LauncherLog "CheckOnly mode - hidden instance would be recycled"
    } else {
        $projectTreeIds = @($hiddenMainIds)
        do {
            $previousCount = $projectTreeIds.Count
            $childIds = @($allProcesses | Where-Object {
                [int]$_.ParentProcessId -in $projectTreeIds -and
                $_.ExecutablePath -eq $ElectronExe
            } | ForEach-Object { [int]$_.ProcessId })
            $projectTreeIds = @($projectTreeIds + $childIds | Sort-Object -Unique)
        } while ($projectTreeIds.Count -gt $previousCount)

        Write-LauncherLog "Stopping hidden project process tree (PID: $($projectTreeIds -join ', '))"
        Stop-Process -Id $projectTreeIds -Force -ErrorAction SilentlyContinue

        $stopDeadline = (Get-Date).AddSeconds(10)
        do {
            $remainingMainIds = @($hiddenMainIds | Where-Object {
                Get-Process -Id $_ -ErrorAction SilentlyContinue
            })
            if ($remainingMainIds.Count -eq 0) {
                break
            }
            Start-Sleep -Milliseconds 250
        } while ((Get-Date) -lt $stopDeadline)

        if ($remainingMainIds.Count -gt 0) {
            Write-LauncherLog "ERROR: Hidden project instance did not stop (PID: $($remainingMainIds -join ', '))"
            exit 1
        }

        Write-LauncherLog "Hidden project instance stopped; continuing with clean launch"
        Start-Sleep -Milliseconds 500
    }
} else {
    Write-LauncherLog "No existing project instance found"
}

# Step 4: Check renderer readiness and start Vite if needed
Write-LauncherLog "Checking renderer at $RendererUrl..."

$rendererReady = $false
try {
    # GET + UseBasicParsing: Vite does not answer HEAD, and PS 5.1 otherwise needs IE
    $response = Invoke-WebRequest -Uri $RendererUrl -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -eq 200) {
        $rendererReady = $true
        Write-LauncherLog "Renderer already available"
    }
} catch {
    Write-LauncherLog "Renderer not available, will start Vite"
}

if (-not $rendererReady) {
    Write-LauncherLog "Starting Vite dev server..."

    $viteArgs = @('run', 'dev', '--', '--port', '5180', '--strictPort')

    # File-backed redirection keeps Vite alive after this launcher exits; in-process
    # pipe readers would die with the launcher and eventually block the child.
    $viteProcess = Start-Process -FilePath $NpmCmd `
        -ArgumentList $viteArgs `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $ViteStdoutLog `
        -RedirectStandardError $ViteStderrLog `
        -NoNewWindow `
        -PassThru

    Write-LauncherLog "Vite process started (PID: $($viteProcess.Id))"
    Write-LauncherLog "Waiting for renderer readiness (timeout: $WaitTimeoutSeconds seconds)..."

    # Poll for renderer readiness
    $startTime = Get-Date
    $pollInterval = 1
    $ready = $false

    while (((Get-Date) - $startTime).TotalSeconds -lt $WaitTimeoutSeconds) {
        Start-Sleep -Seconds $pollInterval

        if ($viteProcess.HasExited) {
            Write-LauncherLog "ERROR: Vite process exited early with code $($viteProcess.ExitCode)"
            Write-LauncherLog "Check logs at: $ViteStdoutLog and $ViteStderrLog"
            exit 1
        }

        try {
            $response = Invoke-WebRequest -Uri $RendererUrl -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                $ready = $true
                Write-LauncherLog "Renderer is ready"
                break
            }
        } catch {
            # Continue polling
        }
    }

    if (-not $ready) {
        Write-LauncherLog "ERROR: Renderer did not become ready within $WaitTimeoutSeconds seconds"
        Write-LauncherLog "Check logs at: $ViteStdoutLog and $ViteStderrLog"
        exit 1
    }
}

# Step 5: Conditional Electron build
if (-not (Test-Path $ElectronMain)) {
    Write-LauncherLog "Electron build output missing at: $ElectronMain"
    Write-LauncherLog "Running npm run build:electron..."

    $buildOutput = & $NpmCmd run build:electron 2>&1
    $buildOutput | ForEach-Object {
        $line = $_.ToString()
        Add-Content -Path $LogFile -Value $line -Encoding UTF8
    }

    if ($LASTEXITCODE -ne 0) {
        Write-LauncherLog "ERROR: Electron build failed with exit code $LASTEXITCODE"
        exit 1
    }

    Write-LauncherLog "Electron build completed"

    if (-not (Test-Path $ElectronMain)) {
        Write-LauncherLog "ERROR: Electron main still missing after build: $ElectronMain"
        exit 1
    }
}

Write-LauncherLog "Electron build output verified at: $ElectronMain"

# Exit if CheckOnly mode
if ($CheckOnly) {
    Write-LauncherLog "CheckOnly mode - validation complete, skipping Electron launch"
    exit 0
}

# Step 5: Launch Electron in detached mode
Write-LauncherLog "Launching Electron..."

$env:NODE_ENV = 'development'

# No -WindowStyle here: Electron must be free to show its own overlay window.
$electronProcess = Start-Process -FilePath $ElectronExe `
    -ArgumentList '.' `
    -WorkingDirectory $ProjectRoot `
    -PassThru

Write-LauncherLog "Electron launched (PID: $($electronProcess.Id))"
Write-LauncherLog "=== Launcher complete ==="

exit 0
