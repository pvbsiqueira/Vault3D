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

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

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
            $response.AddHeader("Access-Control-Allow-Origin", "*")
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
