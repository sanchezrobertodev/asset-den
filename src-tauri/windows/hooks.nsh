; Asset Den was renamed Mimikit in 0.4.0. The installer takes its folder and Apps entry from the product name, so
; installing Mimikit would leave Asset Den installed next to it, still offering the same update. This removes the old
; copy. /S skips the uninstaller's "Delete app data" box, so the library, which both names share through the
; unchanged identifier, is never touched.

; The old uninstaller runs silently, so it would close a running Asset Den without asking. Ask here, before any file is
; written, the way the installer asks about Mimikit itself (passive and silent installs close it without asking).
!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $R5 SHCTX "Software\${MANUFACTURER}\Asset Den" ""
  ${If} $R5 != ""
    !insertmacro CheckIfAppIsRunning "$R5\asset-den.exe" "Asset Den"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ReadRegStr $R1 SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Asset Den" "UninstallString"
  ReadRegStr $R2 SHCTX "Software\${MANUFACTURER}\Asset Den" ""
  ${GetRoot} $R2 $R6
  ; Skip while the old folder's drive is unplugged, so a later install tries again.
  ${If} $R2 != ""
  ${AndIf} ${FileExists} "$R6\*.*"
    ; The in-app updater runs this with /UPDATE, which creates no shortcuts, and the uninstall deletes Asset Den's.
    ; Give back the ones the user had, under the new name.
    StrCpy $R3 0
    StrCpy $R4 0
    ${If} $UpdateMode = 1
      ${IfThen} ${FileExists} "$SMPROGRAMS\Asset Den.lnk" ${|} StrCpy $R3 1 ${|}
      ${IfThen} ${FileExists} "$DESKTOP\Asset Den.lnk" ${|} StrCpy $R4 1 ${|}
    ${EndIf}
    ${If} ${FileExists} "$R2\${MAINBINARYNAME}.exe"
      ; Installed into the old folder, Mimikit replaced its uninstall.exe, so the Asset Den entry in Apps would
      ; uninstall Mimikit.
      DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Asset Den"
    ${ElseIf} $R1 != ""
    ${AndIf} ${FileExists} "$R2\uninstall.exe"
      ; _?= runs it in place so ExecWait waits for it.
      ExecWait '$R1 /S _?=$R2'
    ${EndIf}
    ; Whatever the uninstaller left (it can't delete itself in place), or all of it when there was none to run. An
    ; asset-den.exe that couldn't be closed or is locked keeps everything, so the next install tries again.
    Delete "$R2\asset-den.exe"
    ${IfNot} ${FileExists} "$R2\asset-den.exe"
      ${IfNot} ${FileExists} "$R2\${MAINBINARYNAME}.exe"
        Delete "$R2\uninstall.exe"
        RMDir "$R2"
      ${EndIf}
      Delete "$SMPROGRAMS\Asset Den.lnk"
      Delete "$DESKTOP\Asset Den.lnk"
      DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\Asset Den"
      ; Keep pointing at an uninstall.exe that was still locked, to delete it next time.
      ${IfNot} ${FileExists} "$R2\uninstall.exe"
      ${OrIf} ${FileExists} "$R2\${MAINBINARYNAME}.exe"
        DeleteRegKey SHCTX "Software\${MANUFACTURER}\Asset Den"
      ${EndIf}
    ${EndIf}
    ${If} $R3 = 1
      CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${EndIf}
    ${If} $R4 = 1
      CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}
  ${EndIf}
!macroend
