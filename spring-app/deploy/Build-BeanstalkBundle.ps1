param(
    [string]$CertificateUrl = 'https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem'
)

$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$jar = Join-Path $appRoot 'target/assessment-platform.jar'
if (-not (Test-Path -LiteralPath $jar -PathType Leaf)) {
    throw 'Build the executable JAR first: .\mvnw.cmd -B -ntp verify'
}
$destination = Join-Path $appRoot 'target/beanstalk'
[IO.Directory]::CreateDirectory($destination) | Out-Null
$certificate = Join-Path $destination 'global-bundle.pem'
Invoke-WebRequest -Uri $CertificateUrl -OutFile $certificate
if (-not (Get-Content -LiteralPath $certificate -Raw).Contains('-----BEGIN CERTIFICATE-----')) {
    throw 'The RDS trust store response is not a PEM certificate bundle.'
}

# Whitelist the release files; never package local databases, credentials or previews.
$zipPath = Join-Path $destination 'assessment-platform.zip'
$files = [ordered]@{
    'application.jar' = $jar
    'Procfile' = (Join-Path $PSScriptRoot 'Procfile')
    'global-bundle.pem' = $certificate
}
$stream = [IO.File]::Open($zipPath, [IO.FileMode]::Create)
try {
    $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        foreach ($entry in $files.GetEnumerator()) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $entry.Value, $entry.Key) | Out-Null
        }
    } finally { $archive.Dispose() }
} finally { $stream.Dispose() }

$checksum = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
"$checksum  assessment-platform.zip" | Set-Content -LiteralPath "$zipPath.sha256" -Encoding ascii
Write-Output "Created $zipPath"
Write-Output "SHA256: $checksum"
