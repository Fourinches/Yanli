!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_POSTINSTALL
  MessageBox MB_YESNO|MB_ICONQUESTION "是否在开机时自动启动砚历？" IDNO skip_autostart
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "YanliCalendar" '"$INSTDIR\${MAINBINARYNAME}.exe"'
  skip_autostart:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "YanliCalendar"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend
