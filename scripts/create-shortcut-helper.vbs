Set WshShell = CreateObject("WScript.Shell")
Set objArgs = WScript.Arguments

If objArgs.Count < 4 Then
    WScript.Echo "Usage: cscript create-shortcut-helper.vbs <shortcut-path> <target> <arguments> <working-dir> [icon-path]"
    WScript.Quit 1
End If

shortcutPath = objArgs(0)
targetPath = objArgs(1)
arguments = objArgs(2)
workingDir = objArgs(3)

Set Shortcut = WshShell.CreateShortcut(shortcutPath)
Shortcut.TargetPath = targetPath
Shortcut.Arguments = arguments
Shortcut.WorkingDirectory = workingDir
Shortcut.Description = "启动面试助手"

If objArgs.Count >= 5 Then
    Shortcut.IconLocation = objArgs(4) & ",0"
End If

Shortcut.Save

WScript.Echo shortcutPath
WScript.Quit 0
