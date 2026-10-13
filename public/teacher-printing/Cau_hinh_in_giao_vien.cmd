@echo off
setlocal
chcp 65001 >nul
set "TEACHER_CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "TEACHER_CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined TEACHER_CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "TEACHER_CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined TEACHER_CHROME if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "TEACHER_CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
echo MAY IN GIAO VIEN - LOP HOC THONG MINH 4.0
echo.
echo 1. Bat in khong can bam nut tren Google Chrome
echo 2. Tat in tu dong, khoi phuc hop thoai In
echo 3. Mo trang web
echo 4. Mo cai dat may in Windows
echo.
echo Che do nay ap dung cho Google Chrome cua tai khoan Windows hien tai.
echo Chi bat tren may giao vien dung de nhan bai va in phieu.
echo Chon may in GIAY lam mac dinh; khong chon PDF, XPS hay OneNote.
echo.
choice /c 1234 /n /m "Chon 1, 2, 3 hoac 4: "
if errorlevel 4 goto printers
if errorlevel 3 goto open
if errorlevel 2 goto off
if errorlevel 1 goto on
:on
if not defined TEACHER_CHROME goto missing
powershell -NoProfile -Command "if ((Get-Item -LiteralPath $env:TEACHER_CHROME).VersionInfo.ProductMajorPart -lt 144) { Write-Host 'Can Google Chrome 144 tro len. Hay cap nhat Chrome.'; exit 1 }; $printer = Get-CimInstance Win32_Printer | Where-Object Default; if (-not $printer -or $printer.Name -match 'PDF|XPS|OneNote|Fax') { Write-Host 'Chua co may in GIAY mac dinh. Chon muc 4 de cau hinh may in truoc.'; exit 1 }; Write-Host ('May in mac dinh: ' + $printer.Name)"
if errorlevel 1 goto done
reg add "HKCU\Software\Policies\Google\Chrome" /v SilentPrintingEnabled /t REG_DWORD /d 1 /f >nul
if errorlevel 1 goto error
reg add "HKCU\Software\Policies\Google\Chrome" /v PrintPreviewUseSystemDefaultPrinter /t REG_DWORD /d 1 /f >nul
if errorlevel 1 goto error
echo Da bat in tu dong tren Chrome cho tai khoan Windows nay.
echo Dong va mo lai Chrome, hoac vao chrome://policy va chon Reload policies.
echo Dang nhap giao vien, vao Quan ly ky thi va bat Tram in giao vien truoc gio thi.
echo Bam In thu mot phieu mot lan de kiem tra: giay phai ra ma khong can bam In.
goto open
:off
reg add "HKCU\Software\Policies\Google\Chrome" /v SilentPrintingEnabled /t REG_DWORD /d 0 /f >nul
if errorlevel 1 goto error
reg delete "HKCU\Software\Policies\Google\Chrome" /v PrintPreviewUseSystemDefaultPrinter /f >nul 2>&1
echo Da tat in tu dong. Mo lai Chrome hoac tai lai chinh sach tai chrome://policy.
goto done
:printers
start "" "ms-settings:printers"
goto done
:open
if not defined TEACHER_CHROME goto missing
start "" "%TEACHER_CHROME%" --new-window "https://trungtuyen.github.io/4.0/?auth=login&app=exam-manager"
goto done
:missing
echo Khong tim thay Google Chrome. Can cai Chrome 144 tro len de dung che do nay.
goto done
:error
echo Khong ghi duoc chinh sach Chrome. May co the dang duoc co quan quan ly.
echo Kiem tra chrome://policy hoac lien he phu trach CNTT.
:done
echo.
pause
endlocal
