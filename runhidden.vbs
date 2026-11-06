Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File D:\jlceda-extension\runhidden.ps1", 0, False
Set WshShell = Nothing