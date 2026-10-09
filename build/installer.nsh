; Atalhos com o ícone atual.
; Em atualizações o instalador mantém os atalhos antigos, e o Windows guarda em
; cache o ícone do Vault3D.exe. Aqui os atalhos existentes são regravados
; apontando para resources\shortcut-icon.ico, um caminho que o cache ainda não
; conhece, e o Explorer é avisado para redesenhar os ícones.
!macro customInstall
  ${if} ${FileExists} "$newDesktopLink"
    CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\resources\shortcut-icon.ico" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${endIf}
  ${if} ${FileExists} "$newStartMenuLink"
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$INSTDIR\resources\shortcut-icon.ico" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${endIf}
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
