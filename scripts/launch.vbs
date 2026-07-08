' Vibe-Research hidden launcher
' Starts backend and frontend dev servers without showing console windows,
' waits for both ports to be reachable, then opens the dashboard.

Option Explicit

Dim fso, WshShell, repoRoot, backendDir, frontendDir, pythonExe
Dim backendReady, frontendReady, i, cmdLine, returnCode
Dim quote
quote = Chr(34)

Set fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")

repoRoot = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
backendDir = repoRoot & "\backend"
frontendDir = repoRoot & "\frontend"
pythonExe = backendDir & "\.venv\Scripts\python.exe"

' Validate backend environment.
If Not fso.FileExists(pythonExe) Then
    WScript.Echo "Backend virtual environment not found." & vbCrLf & _
                 "Please run: cd backend && python -m venv .venv && .venv\Scripts\pip install -r requirements.txt"
    WScript.Quit 1
End If

If Not fso.FolderExists(frontendDir & "\node_modules") Then
    WScript.Echo "Frontend dependencies not found." & vbCrLf & _
                 "Please run: cd frontend && npm install"
    WScript.Quit 1
End If

' Kill any leftover processes using our ports.
cmdLine = "powershell -Command " & quote & _
    "Get-NetTCPConnection -LocalPort 8900,5899 -ErrorAction SilentlyContinue " & _
    "| Select-Object -ExpandProperty OwningProcess -Unique " & _
    "| ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" & _
    quote
WshShell.Run cmdLine, 0, True

WScript.Sleep 1000

' Start backend hidden (working directory is already set to backend).
WshShell.CurrentDirectory = backendDir
WshShell.Run pythonExe & " -m uvicorn app:app --host 127.0.0.1 --port 8900", 0, False

' Start frontend hidden.
WshShell.CurrentDirectory = frontendDir
WshShell.Run "cmd /c npm run dev", 0, False

' Wait for backend port.
backendReady = False
For i = 1 To 30
    WScript.Sleep 1000
    cmdLine = "powershell -Command " & quote & _
        "try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', 8900); $c.Close(); exit 0 } catch { exit 1 }" & _
        quote
    returnCode = WshShell.Run(cmdLine, 0, True)
    If returnCode = 0 Then
        backendReady = True
        Exit For
    End If
Next

If Not backendReady Then
    WScript.Echo "Backend did not start on http://localhost:8900 within 30 seconds."
    WScript.Quit 1
End If

' Wait for frontend port.
frontendReady = False
For i = 1 To 30
    WScript.Sleep 1000
    cmdLine = "powershell -Command " & quote & _
        "try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', 5899); $c.Close(); exit 0 } catch { exit 1 }" & _
        quote
    returnCode = WshShell.Run(cmdLine, 0, True)
    If returnCode = 0 Then
        frontendReady = True
        Exit For
    End If
Next

If Not frontendReady Then
    WScript.Echo "Frontend did not start on http://localhost:5899 within 30 seconds."
    WScript.Quit 1
End If

' Open dashboard.
WshShell.Run "http://localhost:5899", 1, False
