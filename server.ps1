$port = 3000
$baseAddress = "http://127.0.0.1:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($baseAddress)

try {
    $listener.Start()
} catch {
    $port = 3001
    $baseAddress = "http://127.0.0.1:$port/"
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($baseAddress)
    $listener.Start()
}

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  3D Print Library - Servidor Local Ativo" -ForegroundColor Green
Write-Host "  Acesse: $baseAddress" -ForegroundColor Yellow
Write-Host "  Pressione Ctrl+C para encerrar quando desejar." -ForegroundColor DarkGray
Write-Host "====================================================" -ForegroundColor Cyan

# Abrir no navegador padrão
try {
    Start-Process $baseAddress
} catch {
    # Silencioso se não houver interface interativa
}

$mimeMap = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".stl"  = "application/octet-stream"
    ".3mf"  = "application/octet-stream"
}

$currentDir = $PSScriptRoot
if (-not $currentDir -or -not (Test-Path $currentDir)) { 
    $currentDir = (Get-Location).Path 
}

function Find-InstalledSlicer {
    $candidates = @(
        "C:\Program Files\AnycubicSlicerNext\AnycubicSlicerNext.exe",
        "C:\Program Files\Bambu Studio\bambu-studio.exe",
        "C:\Program Files\OrcaSlicer\orca-slicer.exe",
        "C:\Program Files\Prusa3D\PrusaSlicer\prusa-slicer.exe",
        "$env:LOCALAPPDATA\Programs\Bambu Studio\bambu-studio.exe",
        "$env:LOCALAPPDATA\Programs\OrcaSlicer\orca-slicer.exe",
        "C:\Program Files\Creality\Creality Print\CrealityPrint.exe",
        "C:\Program Files\UltiMaker Cura 5.8.0\UltiMaker-Cura.exe",
        "C:\Program Files\UltiMaker Cura 5.7.0\UltiMaker-Cura.exe"
    )
    foreach ($cand in $candidates) {
        if (Test-Path $cand -PathType Leaf) {
            return $cand
        }
    }
    # Busca dinamica rapida
    $dynamic = Get-ChildItem -Path "C:\Program Files", "$env:LOCALAPPDATA\Programs", "C:\Program Files (x86)" -Filter "*slicer*.exe" -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if ($dynamic) { return $dynamic }
    return $null
}

$script:resolvedFolderCache = @{}

function Resolve-ModelDiskPath {
    param(
        [string]$folder,
        [string]$path
    )
    
    $cleanRel = if ($path) { $path.Trim().Replace('/', '\') } else { '' }
    $cleanFolder = if ($folder) { $folder.Trim() } else { '' }

    # Se a pasta já for um caminho absoluto (ex: C:\...)
    if ($cleanFolder -match '^[a-zA-Z]:\\') {
        $combined = if ($cleanRel) { Join-Path $cleanFolder $cleanRel } else { $cleanFolder }
        $dir = [System.IO.Path]::GetDirectoryName($combined)
        if ($dir -and -not $dir.EndsWith('\')) { $dir += '\' }
        return @{
            success = $true
            fullPath = $combined
            folderPath = $dir
            rootFolder = $cleanFolder
            fileName = [System.IO.Path]::GetFileName($combined)
        }
    }

    # Se já estiver em cache
    if ($cleanFolder -and $script:resolvedFolderCache.ContainsKey($cleanFolder)) {
        $root = $script:resolvedFolderCache[$cleanFolder]
        $sub = $cleanRel
        if ($sub.StartsWith($cleanFolder + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
            $sub = $sub.Substring($cleanFolder.Length + 1)
        } elseif ($sub -eq $cleanFolder) {
            $sub = ''
        }
        $combined = if ($sub) { Join-Path $root $sub } else { $root }
        $dir = [System.IO.Path]::GetDirectoryName($combined)
        if ($dir -and -not $dir.EndsWith('\')) { $dir += '\' }
        return @{
            success = $true
            fullPath = $combined
            folderPath = $dir
            rootFolder = $root
            fileName = [System.IO.Path]::GetFileName($combined)
        }
    }

    # Modelos de exemplo do projeto
    if ($cleanFolder -match 'sample_models' -or $cleanRel -match 'sample_models') {
        $sampleDir = Join-Path $currentDir "sample_models"
        $fName = [System.IO.Path]::GetFileName($cleanRel)
        $fullSample = Join-Path $sampleDir $fName
        $dir = $sampleDir + '\'
        $script:resolvedFolderCache[$cleanFolder] = $sampleDir
        return @{
            success = $true
            fullPath = $fullSample
            folderPath = $dir
            rootFolder = $sampleDir
            fileName = $fName
        }
    }

    $userProf = if ($env:USERPROFILE) { $env:USERPROFILE } else { "C:\Users\eustudio" }
    $candidateBases = @(
        (Join-Path $userProf "Downloads"),
        (Join-Path $userProf "Desktop"),
        (Join-Path $userProf "Documents"),
        (Join-Path $userProf "Pictures"),
        (Join-Path $userProf "OneDrive"),
        $userProf,
        $currentDir,
        "C:\"
    )

    $foundRoot = $null
    foreach ($base in $candidateBases) {
        if (-not (Test-Path $base)) { continue }
        $check = Join-Path $base $cleanFolder
        if (Test-Path $check) {
            $foundRoot = (Get-Item $check).FullName
            break
        }
    }

    if (-not $foundRoot) {
        $searchBases = @(
            (Join-Path $userProf "Downloads"),
            (Join-Path $userProf "Desktop"),
            (Join-Path $userProf "Documents"),
            $userProf
        )
        foreach ($sb in $searchBases) {
            if (-not (Test-Path $sb)) { continue }
            $match = Get-ChildItem -Path $sb -Directory -Filter $cleanFolder -Recurse -Depth 3 -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($match) {
                $foundRoot = $match.FullName
                break
            }
        }
    }

    if ($foundRoot) {
        $script:resolvedFolderCache[$cleanFolder] = $foundRoot
        $sub = $cleanRel
        if ($sub.StartsWith($cleanFolder + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
            $sub = $sub.Substring($cleanFolder.Length + 1)
        } elseif ($sub -eq $cleanFolder) {
            $sub = ''
        }
        $combined = if ($sub) { Join-Path $foundRoot $sub } else { $foundRoot }
        $dir = [System.IO.Path]::GetDirectoryName($combined)
        if ($dir -and -not $dir.EndsWith('\')) { $dir += '\' }
        return @{
            success = $true
            fullPath = $combined
            folderPath = $dir
            rootFolder = $foundRoot
            fileName = [System.IO.Path]::GetFileName($combined)
        }
    }

    # Fallback estruturado com drive C:\
    $fallbackRoot = "C:\Users\eustudio\$cleanFolder"
    $combined = if ($cleanRel) { Join-Path $fallbackRoot $cleanRel } else { $fallbackRoot }
    $dir = [System.IO.Path]::GetDirectoryName($combined)
    if ($dir -and -not $dir.EndsWith('\')) { $dir += '\' }
    return @{
        success = $false
        fullPath = $combined
        folderPath = $dir
        rootFolder = $fallbackRoot
        fileName = [System.IO.Path]::GetFileName($combined)
    }
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # Headers CORS Globais
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        $response.AddHeader("Access-Control-Allow-Headers", "*")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        # Endpoint: GET /api/detect-slicer
        if ($request.Url.LocalPath -eq "/api/detect-slicer") {
            $slicer = Find-InstalledSlicer
            $info = @{
                hasSlicer = (-not [string]::IsNullOrWhiteSpace($slicer))
                slicerPath = $slicer
                slicerName = if ($slicer) { [System.IO.Path]::GetFileNameWithoutExtension($slicer) } else { "Fatiador Padrao" }
            }
            $jsonBytes = [System.Text.Encoding]::UTF8.GetBytes(($info | ConvertTo-Json -Compress))
            $response.ContentType = "application/json; charset=utf-8"
            $response.StatusCode = 200
            $response.ContentLength64 = $jsonBytes.Length
            $response.OutputStream.Write($jsonBytes, 0, $jsonBytes.Length)
            $response.Close()
            continue
        }

        # Endpoint: GET /api/resolve-path
        if ($request.Url.LocalPath -eq "/api/resolve-path") {
            $folder = $request.QueryString["folder"]
            $path = $request.QueryString["path"]
            $resolved = Resolve-ModelDiskPath -folder $folder -path $path
            $jsonBytes = [System.Text.Encoding]::UTF8.GetBytes(($resolved | ConvertTo-Json -Compress))
            $response.ContentType = "application/json; charset=utf-8"
            $response.StatusCode = 200
            $response.ContentLength64 = $jsonBytes.Length
            $response.OutputStream.Write($jsonBytes, 0, $jsonBytes.Length)
            $response.Close()
            continue
        }

        # Endpoint: POST /api/open-slicer
        if ($request.Url.LocalPath -eq "/api/open-slicer") {
            if ($request.HttpMethod -eq "POST") {
                try {
                    $directFilePath = $request.QueryString["filePath"]
                    $fileName = $request.QueryString["filename"]
                    $destPath = $null

                    if (-not [string]::IsNullOrWhiteSpace($directFilePath) -and (Test-Path $directFilePath -PathType Leaf)) {
                        # Arquivo já existe diretamente no disco (abertura instantânea sem cópia)
                        $destPath = $directFilePath
                    } else {
                        if ([string]::IsNullOrWhiteSpace($fileName)) {
                            $fileName = "modelo_3d.3mf"
                        }
                        $fileName = [System.IO.Path]::GetFileName($fileName)

                        # Diretorio temporario dedicado para o fatiador
                        $slicerTempDir = Join-Path $env:TEMP "3DPrintLibrary_Slicer"
                        if (-not (Test-Path $slicerTempDir)) {
                            New-Item -ItemType Directory -Path $slicerTempDir -Force | Out-Null
                        }

                        $destPath = Join-Path $slicerTempDir $fileName

                        # Copiar arquivo recebido do stream do navegador
                        $fileStream = [System.IO.File]::Create($destPath)
                        $request.InputStream.CopyTo($fileStream)
                        $fileStream.Close()
                    }

                    # Descobrir fatiador instalado ou padrao do Windows
                    $slicerExe = Find-InstalledSlicer
                    $slicerName = if ($slicerExe) { [System.IO.Path]::GetFileNameWithoutExtension($slicerExe) } else { "Fatiador Padrao" }

                    if ($slicerExe -and (Test-Path $slicerExe -PathType Leaf)) {
                        Start-Process -FilePath $slicerExe -ArgumentList "`"$destPath`""
                    } else {
                        Start-Process -FilePath $destPath
                    }

                    $resObj = @{
                        success = $true
                        message = "Arquivo aberto no fatiador!"
                        slicer = $slicerName
                        filePath = $destPath
                    }
                    $resBytes = [System.Text.Encoding]::UTF8.GetBytes(($resObj | ConvertTo-Json -Compress))
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.StatusCode = 200
                    $response.ContentLength64 = $resBytes.Length
                    $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
                } catch {
                    $errObj = @{
                        success = $false
                        error = $_.Exception.Message
                    }
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes(($errObj | ConvertTo-Json -Compress))
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.StatusCode = 500
                    $response.ContentLength64 = $errBytes.Length
                    $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                }
                $response.Close()
                continue
            }
        }

        # Servir Arquivos Estaticos
        $relPath = [System.Uri]::UnescapeDataString($request.Url.LocalPath.TrimStart('/'))
        if ([string]::IsNullOrWhiteSpace($relPath)) {
            $relPath = "index.html"
        }

        # Sanitizar caminho para evitar directory traversal
        $relPath = $relPath.Replace('/', '\')
        $localFilePath = [System.IO.Path]::GetFullPath((Join-Path $currentDir $relPath))

        if ($localFilePath.StartsWith($currentDir, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path $localFilePath -PathType Leaf)) {
            $ext = [System.IO.Path]::GetExtension($localFilePath).ToLower()
            $mime = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { "application/octet-stream" }

            $bytes = [System.IO.File]::ReadAllBytes($localFilePath)
            $response.ContentType = $mime
            $response.ContentLength64 = $bytes.Length
            $response.AddHeader("Cache-Control", "no-cache")
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $relPath")
            $response.OutputStream.Write($notFoundBytes, 0, $notFoundBytes.Length)
        }
        $response.Close()
    } catch {
        # Loop continua
    }
}
