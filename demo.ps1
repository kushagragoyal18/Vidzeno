#Requires -Version 5.1
<#
.SYNOPSIS
    VideoShift End-to-End Demo Script (Windows PowerShell)

.DESCRIPTION
    Demonstrates the full VideoShift conversion flow:
      1. Check server health
      2. Register / login a test user
      3. Create and upload a test video
      4. List available output formats
      5. Start a conversion job
      6. Poll until the job completes
      7. Download the converted file

.PARAMETER ApiUrl
    Base URL of the VideoShift API. Default: http://localhost:3001

.PARAMETER OutputFormat
    Target output format (mp4, avi, mov, mkv, webm, gif, mp3). Default: mp4

.PARAMETER Email
    Email address for the demo user. Default: demo_<timestamp>@videoshift.test

.PARAMETER Password
    Password for the demo user. Default: demo_password_123

.EXAMPLE
    .\demo.ps1
    .\demo.ps1 -ApiUrl http://myserver:3001 -OutputFormat mp3
#>

[CmdletBinding()]
param(
    [string]$ApiUrl      = $env:API_URL     ?? 'http://localhost:3001',
    [string]$OutputFormat = $env:OUTPUT_FORMAT ?? 'mp4',
    [string]$Email       = "demo_$(Get-Date -Format 'yyyyMMddHHmmss')@videoshift.test",
    [string]$Password    = 'demo_password_123'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Helpers ───────────────────────────────────────────────────

function Write-Step  ([string]$msg) { Write-Host "`n▶ $msg" -ForegroundColor Cyan }
function Write-Ok    ([string]$msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn  ([string]$msg) { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Err   ([string]$msg) { Write-Host "  ✗ $msg" -ForegroundColor Red }
function Fail        ([string]$msg) { Write-Err $msg; exit 1 }

$Session  = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$TempDir  = [System.IO.Path]::GetTempPath()
$TestVideo = Join-Path $TempDir "videoshift_demo_$PID.mp4"

function Invoke-Api {
    param(
        [string]$Method  = 'GET',
        [string]$Path,
        [object]$Body    = $null,
        [string]$Form    = $null,
        [switch]$Raw
    )

    $uri = "$ApiUrl$Path"
    $params = @{
        Uri             = $uri
        Method          = $Method
        WebSession      = $Session
        UseBasicParsing = $true
    }

    if ($Body) {
        $params['Body']        = ($Body | ConvertTo-Json -Compress)
        $params['ContentType'] = 'application/json'
    }

    try {
        $resp = Invoke-WebRequest @params
        if ($Raw) { return $resp }
        return $resp.Content | ConvertFrom-Json
    } catch {
        $status = $_.Exception.Response?.StatusCode?.value__
        $detail = $_.ErrorDetails?.Message
        throw "API $Method $Path returned $status : $detail"
    }
}

# ── Steps ─────────────────────────────────────────────────────

function Check-Server {
    Write-Step "Checking API server at $ApiUrl"
    try {
        $health = Invoke-Api -Path '/health'
        Write-Ok "Server is up (status: $($health.status))"
    } catch {
        Fail "Server not reachable at $ApiUrl. Start it with: docker-compose up -d"
    }
}

function Create-TestVideo {
    Write-Step "Creating test video"

    $ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($ffmpeg) {
        & ffmpeg -f lavfi -i "testsrc=duration=3:size=320x240:rate=24" `
                 -f lavfi -i "sine=frequency=440:duration=3" `
                 -c:v libx264 -c:a aac -pix_fmt yuv420p `
                 $TestVideo -y 2>$null
        $size = (Get-Item $TestVideo).Length
        Write-Ok "Created $TestVideo ($size bytes)"
    } else {
        # Minimal stub file — enough to pass the upload endpoint's extension check
        [byte[]]$stub = 0x00,0x00,0x00,0x20,0x66,0x74,0x79,0x70,0x6d,0x70,0x34,0x32
        [System.IO.File]::WriteAllBytes($TestVideo, $stub)
        Write-Warn "ffmpeg not found — using stub file. Real conversion may fail."
    }
}

function Register-Or-Login {
    Write-Step "Registering user: $Email"
    try {
        $resp = Invoke-Api -Method POST -Path '/api/auth/register' -Body @{
            email    = $Email
            password = $Password
        }
        Write-Ok "Registered (id: $($resp.user.id))"
    } catch {
        Write-Warn "Registration failed — trying login"
        Write-Step "Logging in as $Email"
        $resp = Invoke-Api -Method POST -Path '/api/auth/login' -Body @{
            email    = $Email
            password = $Password
        }
        Write-Ok "Logged in (id: $($resp.user.id))"
    }
}

function List-Formats {
    Write-Step "Fetching supported formats"
    $resp = Invoke-Api -Path '/api/convert/formats'
    $resp.formats | ForEach-Object { Write-Host "    • $($_.id) — $($_.description)" }
    Write-Ok "Done"
}

function Upload-File {
    Write-Step "Uploading $TestVideo"

    # PowerShell multipart/form-data upload
    $boundary = [System.Guid]::NewGuid().ToString()
    $fileBytes = [System.IO.File]::ReadAllBytes($TestVideo)
    $LF = "`r`n"

    $bodyLines = @(
        "--$boundary",
        'Content-Disposition: form-data; name="file"; filename="test.mp4"',
        'Content-Type: video/mp4',
        '',
        [System.Text.Encoding]::Latin1.GetString($fileBytes),
        "--$boundary--"
    )
    $bodyBytes = [System.Text.Encoding]::Latin1.GetBytes(($bodyLines -join $LF))

    $resp = Invoke-WebRequest -Uri "$ApiUrl/api/upload" `
        -Method POST `
        -Body $bodyBytes `
        -ContentType "multipart/form-data; boundary=$boundary" `
        -WebSession $Session `
        -UseBasicParsing

    $data = $resp.Content | ConvertFrom-Json
    if (-not $data.fileId) { Fail "Upload failed: $($resp.Content)" }

    $script:FileId = $data.fileId
    Write-Ok "Uploaded — fileId: $($script:FileId)"
}

function Start-Conversion {
    Write-Step "Starting conversion to $OutputFormat"
    $resp = Invoke-Api -Method POST -Path '/api/convert' -Body @{
        fileId       = $script:FileId
        outputFormat = $OutputFormat
    }
    if (-not $resp.jobId) { Fail "Conversion failed: $($resp | ConvertTo-Json)" }
    $script:JobId = $resp.jobId
    Write-Ok "Job queued — jobId: $($script:JobId)"
}

function Poll-Job {
    Write-Step "Polling job $($script:JobId) (max 120s)"
    $maxAttempts = 60

    for ($i = 1; $i -le $maxAttempts; $i++) {
        $resp = Invoke-Api -Path "/api/convert/job/$($script:JobId)"
        $status   = $resp.status
        $progress = $resp.progress ?? 0

        Write-Host ("  attempt {0,2}/{1} — status: {2,-12} progress: {3}%" -f $i, $maxAttempts, $status, $progress)

        switch ($status) {
            'completed' {
                Write-Ok "Conversion complete!"
                $script:DownloadUrl = $resp.downloadUrl
                return
            }
            'failed' {
                Fail "Conversion failed: $($resp.errorMessage)"
            }
        }

        Start-Sleep -Seconds 2
    }

    Fail "Timed out after 120 seconds"
}

function Download-Result {
    if (-not $script:DownloadUrl) {
        Write-Warn "No download URL returned — skipping download"
        return
    }

    Write-Step "Downloading result"
    $outFile = Join-Path $TempDir "videoshift_result_$PID.$OutputFormat"
    try {
        Invoke-WebRequest -Uri "$ApiUrl$($script:DownloadUrl)" `
            -OutFile $outFile `
            -WebSession $Session `
            -UseBasicParsing

        $size = (Get-Item $outFile).Length
        Write-Ok "Saved to $outFile ($size bytes)"
    } catch {
        Write-Warn "Download failed — file may still be available at $($script:DownloadUrl)"
    }
}

function Remove-TempFiles {
    if (Test-Path $TestVideo) { Remove-Item $TestVideo -Force }
}

# ── Main ──────────────────────────────────────────────────────

try {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║        VideoShift End-to-End Demo        ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host "  API:    $ApiUrl"
    Write-Host "  Format: $OutputFormat"

    $script:FileId      = $null
    $script:JobId       = $null
    $script:DownloadUrl = $null

    Check-Server
    Create-TestVideo
    List-Formats
    Register-Or-Login
    Upload-File
    Start-Conversion
    Poll-Job
    Download-Result

    Write-Host ""
    Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║        Demo completed successfully!      ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
} finally {
    Remove-TempFiles
}
