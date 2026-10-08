# Собирает архив для друзей: ..\Allur_share.zip (без .venv, кэша и базы). Запускается через make_zip.bat.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$out = Join-Path (Split-Path $root -Parent) 'Allur_share.zip'
$tmp = Join-Path $env:TEMP ('allur_pack_' + [guid]::NewGuid().ToString('N'))
$dst = Join-Path $tmp 'Allur'
New-Item -ItemType Directory -Path $dst | Out-Null
$skipDirs = @('.venv', '__pycache__')

function Copy-Tree($src, $to) {
    foreach ($i in Get-ChildItem -LiteralPath $src -Force) {
        if ($i.PSIsContainer) {
            if ($skipDirs -contains $i.Name) { continue }
            $d = Join-Path $to $i.Name
            New-Item -ItemType Directory -Path $d | Out-Null
            Copy-Tree $i.FullName $d
        } else {
            if ($i.Name -like 'allur.db*' -or $i.Name -eq '.env') { continue }   # .env (токены, PIN) в архив не кладём
            Copy-Item -LiteralPath $i.FullName -Destination $to
        }
    }
}
Copy-Tree $root $dst

# ключ: из API_KEY.txt, а если его там нет — из .env (если вы вставляли его на сайте в Настройках)
function Get-FileKey($path) {
    if (-not (Test-Path -LiteralPath $path)) { return '' }
    foreach ($ln in Get-Content -LiteralPath $path -Encoding UTF8) {
        $t = $ln.Trim().Trim('"').Trim("'")
        if ($t -and -not $t.StartsWith('#')) { return $t }
    }
    return ''
}
$key = Get-FileKey (Join-Path $root 'API_KEY.txt')
if (-not $key) {
    $envFile = Join-Path $root '.env'
    if (Test-Path -LiteralPath $envFile) {
        foreach ($ln in Get-Content -LiteralPath $envFile -Encoding UTF8) {
            if ($ln -match '^\s*AI_API_KEY\s*=\s*(\S+)') { $key = $Matches[1]; break }
        }
    }
    if ($key) {
        $kf = Join-Path $dst 'API_KEY.txt'
        [IO.File]::WriteAllText($kf, "# Ключ ИИ (вставлен автоматически при сборке архива)`r`n$key`r`n", (New-Object Text.UTF8Encoding($false)))
    }
}

if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Force }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
# имена внутри архива — со стандартными слэшами «/» (чтобы открывалось и на Windows, и на Mac/Linux)
$fs = [IO.File]::Open($out, 'Create')
$zip = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Create)
foreach ($f in Get-ChildItem -LiteralPath $tmp -Recurse -File) {
    $rel = $f.FullName.Substring($tmp.Length + 1).Replace('\', '/')
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $rel, [IO.Compression.CompressionLevel]::Optimal)
}
$zip.Dispose(); $fs.Dispose()
Remove-Item -LiteralPath $tmp -Recurse -Force

$mb = [math]::Round((Get-Item -LiteralPath $out).Length / 1MB, 2)
Write-Host ''
Write-Host "Готово: $out ($mb МБ)" -ForegroundColor Green
if ($key) {
    Write-Host 'ИИ-ключ В АРХИВЕ: да. Друзья смогут пользоваться вашим ключом — лучше ключ с лимитом расходов.' -ForegroundColor Yellow
} else {
    Write-Host 'ИИ-ключа в архиве НЕТ: у друзей будет демо-режим. Вставьте ключ в API_KEY.txt и соберите архив снова.' -ForegroundColor Yellow
}
