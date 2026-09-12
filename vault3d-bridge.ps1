param(
    [string]$Url
)

if (-not $Url -and $args.Count -gt 0) {
    $Url = $args[0]
}

if (-not $Url) {
    exit 0
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
    return $null
}

try {
    $cleanUrl = $Url.Trim('"').Trim("'").Trim()
    
    $extractedPath = $null
    if ($cleanUrl -match '(?i)vault3d:\/\/(?:open\/?\??)?.*?[?&]path=([^&]+)') {
        $extractedPath = $matches[1]
    } elseif ($cleanUrl -match '(?i)vault3d:\/\/open\/?(.*)') {
        $extractedPath = $matches[1]
    }

    if (-not $extractedPath) {
        exit 0
    }

    $filePath = [System.Uri]::UnescapeDataString($extractedPath)
    $filePath = $filePath.Trim().TrimEnd('/')

    $targetFile = $null
    if (Test-Path $filePath -PathType Leaf) {
        $targetFile = $filePath
    } else {
        $fileName = [System.IO.Path]::GetFileName($filePath)
        $userProf = [System.Environment]::GetFolderPath("UserProfile")
        $searchBases = @(
            (Join-Path $userProf "Downloads"),
            (Join-Path $userProf "Desktop"),
            (Join-Path $userProf "Documents")
        )
        foreach ($sb in $searchBases) {
            if (-not (Test-Path $sb)) { continue }
            $match = Get-ChildItem -Path $sb -File -Filter $fileName -Recurse -Depth 4 -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($match) {
                $targetFile = $match.FullName
                break
            }
        }
    }

    if (-not $targetFile -or -not (Test-Path $targetFile -PathType Leaf)) {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show("O arquivo 3D não foi localizado no disco:`n$filePath", "Vault3D", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
        exit 0
    }

    $slicerExe = Find-InstalledSlicer

    if ($slicerExe -and (Test-Path $slicerExe -PathType Leaf)) {
        $slicerDir = [System.IO.Path]::GetDirectoryName($slicerExe)
        if ($slicerDir -and (Test-Path $slicerDir -PathType Container)) {
            Start-Process -FilePath $slicerExe -ArgumentList "`"$targetFile`"" -WorkingDirectory $slicerDir
        } else {
            Start-Process -FilePath $slicerExe -ArgumentList "`"$targetFile`""
        }
    } else {
        Start-Process -FilePath $targetFile
    }

} catch {
}
