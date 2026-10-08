#requires -Version 7.0
param(
    [Parameter(Mandatory = $true)][string]$ProjectId,
    [string]$Region = 'asia-southeast1',
    [string]$SecretVersion = '1',
    [string]$GcloudPath = '',
    [string]$PythonPath = ''
)

# Run this yourself in an interactive PowerShell terminal. Never pipe the admin
# password, put it in command arguments or enable verbose credential logging.
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$jar = Join-Path $appRoot 'target/assessment-platform.jar'
if (-not (Test-Path -LiteralPath $jar -PathType Leaf)) { throw 'Build first: .\mvnw.cmd -B -ntp verify' }
if ($ProjectId -notmatch '^[a-z][a-z0-9-]{4,28}[a-z0-9]$' -or $Region -notmatch '^[a-z0-9-]+$' -or $SecretVersion -notmatch '^[0-9]+$') {
    throw 'Invalid project, region or pinned secret version.'
}
if (-not $GcloudPath) {
    $installed = Get-Command gcloud -ErrorAction SilentlyContinue
    if ($installed) { $GcloudPath = $installed.Source }
    else {
        $cached = Get-ChildItem -LiteralPath (Join-Path $appRoot '.tools') -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like 'google-cloud-*' } | Sort-Object Name | Select-Object -Last 1
        if ($cached) { $GcloudPath = Join-Path $cached.FullName 'google-cloud-sdk/bin/gcloud.cmd' }
    }
}
if (-not $GcloudPath -or -not (Test-Path -LiteralPath $GcloudPath -PathType Leaf)) { throw 'Install Google Cloud CLI or supply -GcloudPath.' }
$sdkRoot = Split-Path -Parent (Split-Path -Parent $GcloudPath)
$gcloudScript = Join-Path $sdkRoot 'lib/gcloud.py'
if (-not $PythonPath) { $PythonPath = $env:CLOUDSDK_PYTHON }
if (-not $PythonPath) {
    $bundled = Join-Path $sdkRoot 'platform/bundledpython/python.exe'
    if (Test-Path -LiteralPath $bundled -PathType Leaf) { $PythonPath = $bundled }
    else { $PythonPath = (Get-Command python -ErrorAction Stop).Source }
}
if (-not (Test-Path -LiteralPath $gcloudScript -PathType Leaf)) { throw 'Cannot locate the Google SDK Python entry point.' }

function Read-CloudOutput([string[]]$Arguments) {
    # Capture SDK output in memory; even secret payloads never reach the console.
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $PythonPath
    $start.ArgumentList.Add($gcloudScript)
    foreach ($argument in $Arguments) { $start.ArgumentList.Add($argument) }
    $start.UseShellExecute = $false
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($start)
    try {
        $output = $process.StandardOutput.ReadToEndAsync()
        $errors = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) {
            throw 'Google Cloud request failed. Check your login, project ID and secret permissions; no secret payload was displayed.'
        }
        $null = $errors.GetAwaiter().GetResult()
        return $output.GetAwaiter().GetResult().TrimEnd("`r", "`n")
    } finally { $process.Dispose() }
}

$names = @('CLOUDSDK_CONFIG','CLOUDSDK_CORE_DISABLE_USAGE_REPORTING','CLOUDSDK_PYTHON',
    'SPRING_PROFILES_ACTIVE','APP_BASE_URL','MAIL_MODE','MAIL_FROM','SMTP_HOST','SMTP_PORT',
    'DATABASE_URL','DATABASE_USERNAME','DATABASE_PASSWORD','SMTP_USERNAME','SMTP_PASSWORD')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    $localLogin = Join-Path $appRoot '.qa/gcloud'
    if (-not $env:CLOUDSDK_CONFIG -and (Test-Path -LiteralPath $localLogin -PathType Container)) { $env:CLOUDSDK_CONFIG = $localLogin }
    $env:CLOUDSDK_CORE_DISABLE_USAGE_REPORTING = 'true'
    $env:CLOUDSDK_PYTHON = $PythonPath
    $url = Read-CloudOutput @('run','services','describe','psychological-value-test',"--project=$ProjectId", "--region=$Region",'--format=value(status.url)','--quiet')
    if ($url -notmatch '^https://[a-zA-Z0-9.-]+/?$') { throw 'The service has no valid HTTPS URL yet.' }
    $map = [ordered]@{
        DATABASE_URL = 'assessment-database-url'
        DATABASE_USERNAME = 'assessment-database-username'
        DATABASE_PASSWORD = 'assessment-database-password'
        SMTP_USERNAME = 'assessment-smtp-username'
        SMTP_PASSWORD = 'assessment-smtp-password'
    }
    foreach ($item in $map.GetEnumerator()) {
        $value = Read-CloudOutput @('secrets','versions','access',$SecretVersion,"--secret=$($item.Value)","--project=$ProjectId",'--quiet')
        if (-not $value) { throw "Required secret is empty: $($item.Value)" }
        [Environment]::SetEnvironmentVariable($item.Key, $value, 'Process')
        $value = $null
    }
    $env:SPRING_PROFILES_ACTIVE = 'prod,cloudrun'
    $env:APP_BASE_URL = $url.TrimEnd('/')
    $env:MAIL_MODE = 'smtp'
    # Bootstrap does not send mail. Its required from-address is only a placeholder.
    $env:MAIL_FROM = 'bootstrap@example.invalid'
    $env:SMTP_HOST = 'smtp-relay.brevo.com'
    $env:SMTP_PORT = '587'
    Write-Output 'Enter your administrator details at the Java prompt. Use a new password of at least 12 characters, not the local demo password.'
    & java -jar $jar --app.command=bootstrap-admin
    if ($LASTEXITCODE -ne 0) { throw 'Administrator initialization did not complete. Existing administrators are never overwritten.' }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    $previous.Clear()
}
