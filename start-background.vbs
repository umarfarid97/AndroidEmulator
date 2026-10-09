Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath

' Launch node server completely hidden (window style 0, no console window)
WshShell.Run "cmd.exe /c node src\server.js", 0, False
