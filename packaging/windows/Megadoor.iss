#include "generated\Constants.iss"

#if VER < EncodeVer(7, 1, 0)
  #error Este instalador exige Inno Setup 7.1.0 ou superior.
#endif

#if RequiredInnoSetupVersion != "7.1.0"
  #error distribution.config.json deve fixar Inno Setup 7.1.0.
#endif

#define ApplicationGuid "{{57282891-DF6E-4A47-8E56-FB9B144E686E}"
#define PayloadDirectory "payload"
#define LauncherRelativePath "bin\Megadoor.exe"
#define IconRelativePath "assets\megadoor-icon.ico"
#define RuntimeRelativePath "runtime\node.exe"
#define ServerRelativePath "server\static-server.mjs"
#define ApplicationRelativePath "app\index.html"

#ifnexist PayloadDirectory + "\bin\Megadoor.exe"
  #error Payload incompleto: payload\bin\Megadoor.exe ausente.
#endif
#ifnexist PayloadDirectory + "\runtime\node.exe"
  #error Payload incompleto: payload\runtime\node.exe ausente.
#endif
#ifnexist PayloadDirectory + "\server\static-server.mjs"
  #error Payload incompleto: payload\server\static-server.mjs ausente.
#endif
#ifnexist PayloadDirectory + "\app\index.html"
  #error Payload incompleto: payload\app\index.html ausente.
#endif
#ifnexist PayloadDirectory + "\assets\megadoor-icon.ico"
  #error Payload incompleto: payload\assets\megadoor-icon.ico ausente.
#endif
#ifnexist PayloadDirectory + "\payload-manifest.json"
  #error Payload incompleto: payload-manifest.json ausente.
#endif
#ifnexist PayloadDirectory + "\files.sha256"
  #error Payload incompleto: files.sha256 ausente.
#endif
#ifnexist PayloadDirectory + "\THIRD-PARTY-NOTICES.txt"
  #error Payload incompleto: THIRD-PARTY-NOTICES.txt ausente.
#endif

[Setup]
AppId={#ApplicationGuid}
AppName={#ApplicationName}
AppVersion={#ApplicationVersion}
AppVerName={#ApplicationName} {#ApplicationVersion}
AppPublisher={#ApplicationPublisher}
AppPublisherURL={#RepositoryUrl}
AppSupportURL={#RepositoryUrl}/issues
AppUpdatesURL={#RepositoryUrl}/releases
AppCopyright=Copyright (C) 2026 {#ApplicationPublisher}
AppComments=Interface desktop do sistema operacional Megadoor.
DefaultDirName={localappdata}\Programs\{#InstallDirectoryName}
DefaultGroupName={#ApplicationName}
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=
SetupArchitecture=x64
ArchitecturesAllowed=x64compatible
MinVersion=10.0.19045
OutputDir=output
OutputBaseFilename=Megadoor-Setup-{#ApplicationVersion}-windows-x64
SetupIconFile=..\assets\megadoor-icon.ico
UninstallDisplayIcon={app}\{#IconRelativePath}
UninstallDisplayName={#ApplicationName}
Uninstallable=yes
CreateUninstallRegKey=yes
SetupLogging=yes
UninstallLogging=yes
WizardStyle=modern dynamic
Compression=lzma2/ultra64
SolidCompression=yes
CloseApplications=yes
CloseApplicationsFilter=Megadoor.exe,node.exe
RestartApplications=no
RestartIfNeededByRun=no
SetupMutex=Local\{#ApplicationId}.installer
UsePreviousAppDir=yes
UsePreviousGroup=yes
UsePreviousTasks=yes
UsePreviousLanguage=yes
UsePreviousPrivileges=no
ChangesEnvironment=no
ChangesAssociations=no
AllowNetworkDrive=no
AllowUNCPath=no
DirExistsWarning=no
VersionInfoVersion={#ApplicationVersion}.0
VersionInfoCompany={#ApplicationPublisher}
VersionInfoDescription=Instalador do {#ApplicationName}
VersionInfoProductName={#ApplicationName}
VersionInfoProductVersion={#ApplicationVersion}
VersionInfoOriginalFileName=Megadoor-Setup.exe

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl,installer-messages.pt-BR.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar um atalho na Área de Trabalho"; GroupDescription: "Atalhos adicionais:"; Flags: checkedonce

[Dirs]
Name: "{localappdata}\Megadoor\config"
Name: "{localappdata}\Megadoor\logs"
Name: "{localappdata}\Megadoor\state"

[Files]
Source: "{#PayloadDirectory}\*"; Excludes: "\payload-manifest.json,\files.sha256"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#PayloadDirectory}\payload-manifest.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PayloadDirectory}\files.sha256"; DestDir: "{app}"; Flags: ignoreversion; AfterInstall: ValidatePayloadAfterCopy

[Icons]
Name: "{autoprograms}\{#ApplicationName}"; Filename: "{app}\{#LauncherRelativePath}"; WorkingDir: "{app}"; IconFilename: "{app}\{#IconRelativePath}"; Comment: "Abrir {#ApplicationName}"
Name: "{autodesktop}\{#ApplicationName}"; Filename: "{app}\{#LauncherRelativePath}"; WorkingDir: "{app}"; IconFilename: "{app}\{#IconRelativePath}"; Comment: "Abrir {#ApplicationName}"; Tasks: desktopicon
Name: "{autoprograms}\Desinstalar {#ApplicationName}"; Filename: "{uninstallexe}"; WorkingDir: "{app}"; IconFilename: "{uninstallexe}"; Comment: "Remover {#ApplicationName}"

[Registry]
Root: HKCU; Subkey: "Software\{#ApplicationPublisher}\{#ApplicationName}"; ValueType: string; ValueName: "InstallLocation"; ValueData: "{app}"
Root: HKCU; Subkey: "Software\{#ApplicationPublisher}\{#ApplicationName}"; ValueType: string; ValueName: "Version"; ValueData: "{#ApplicationVersion}"
Root: HKCU; Subkey: "Software\{#ApplicationPublisher}\{#ApplicationName}"; ValueType: string; ValueName: "ReleaseTag"; ValueData: "{#ReleaseTag}"
Root: HKCU; Subkey: "Software\{#ApplicationPublisher}\{#ApplicationName}"; ValueType: string; ValueName: "ReleaseCommit"; ValueData: "{#ReleaseCommit}"
Root: HKCU; Subkey: "Software\{#ApplicationPublisher}\{#ApplicationName}"; ValueType: string; ValueName: "InstallationId"; ValueData: "{code:InstallationIdConstant}"

[Run]
Filename: "{app}\{#LauncherRelativePath}"; Description: "Abrir {#ApplicationName}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent runasoriginaluser

[UninstallDelete]
Type: files; Name: "{app}\install-state.json"
Type: dirifempty; Name: "{app}"

[Code]
const
  ConfigurationDirectory = '{localappdata}\Megadoor\config';
  ConfigurationFile = '{localappdata}\Megadoor\config\runtime-config.json';
  LogDirectory = '{localappdata}\Megadoor\logs';
  StateDirectory = '{localappdata}\Megadoor\state';
  InstallStateFile = '{app}\install-state.json';
  ExpectedFirebaseProjectId = '{#FirebaseProjectId}';
  FirebaseProjectProbeUrl = 'https://identitytoolkit.googleapis.com/v1/projects?key={#FirebaseWebApiKey}';
  LauncherPath = '{app}\{#LauncherRelativePath}';
  RuntimePath = '{app}\{#RuntimeRelativePath}';
  ServerPath = '{app}\{#ServerRelativePath}';
  ApplicationPath = '{app}\{#ApplicationRelativePath}';
  IconPath = '{app}\{#IconRelativePath}';
  PayloadManifestPath = '{app}\payload-manifest.json';
  PayloadChecksumsPath = '{app}\files.sha256';
  ProductRegistryKey = 'Software\{#ApplicationPublisher}\{#ApplicationName}';

var
  ServerPage: TInputQueryWizardPage;
  ServerWasUnavailable: Boolean;
  PayloadWasValidated: Boolean;
  PreserveUserData: Boolean;
  InstallationId: String;
  UninstallInstallationId: String;
  RollbackWasPrepared: Boolean;
  InstallationWasFinalized: Boolean;
  ConfigurationExistedBeforeSetup: Boolean;
  InstallStateExistedBeforeSetup: Boolean;
  ConfigurationBackupPath: String;
  InstallStateBackupPath: String;

function EscapeJson(const Value: String): String;
begin
  Result := Value;
  StringChangeEx(Result, '\', '\\', True);
  StringChangeEx(Result, '"', '\"', True);
  StringChangeEx(Result, #13, '\r', True);
  StringChangeEx(Result, #10, '\n', True);
  StringChangeEx(Result, #9, '\t', True);
end;

function SaveUtf8TextWithoutBom(const FileName, Contents: String): Boolean;
var
  Lines: TArrayOfString;
begin
  SetArrayLength(Lines, 1);
  Lines[0] := Contents;
  Result := SaveStringsToUTF8FileWithoutBOM(FileName, Lines, False);
end;

function NewInstallationId: String;
begin
  Result := Lowercase(
    GetDateTimeString('yyyymmddhhnnsszzz', #0, #0) + '-' +
    Format('%.8x%.8x', [Random($7FFFFFFF), Random($7FFFFFFF)]));
end;

function IsValidInstallationId(const Value: String): Boolean;
var
  Index: Integer;
begin
  Result := (Length(Value) >= 24) and (Length(Value) <= 80);
  if not Result then
    Exit;

  for Index := 1 to Length(Value) do
    if not (((Value[Index] >= '0') and (Value[Index] <= '9')) or
      ((Value[Index] >= 'a') and (Value[Index] <= 'f')) or
      (Value[Index] = '-')) then
    begin
      Result := False;
      Exit;
    end;
end;

function InstallationIdConstant(Param: String): String;
begin
  Result := InstallationId;
end;

function ConfigurationPath(Param: String): String;
begin
  Result := ExpandConstant(ConfigurationFile);
end;

function ParsePort(const Value: String; var Port: Integer): Boolean;
begin
  Port := StrToIntDef(Trim(Value), -1);
  Result := (Port >= 1) and (Port <= 65535);
end;

function ParseIPv4(const Value: String): Boolean;
var
  Index, Octet, OctetCount: Integer;
  Character: Char;
  CurrentPart: String;
  Octets: array[0..3] of Integer;
begin
  Result := False;
  CurrentPart := '';
  OctetCount := 0;

  if Trim(Value) <> Value then
    Exit;

  for Index := 1 to Length(Value) do
  begin
    Character := Value[Index];
    if Character = '.' then
    begin
      Octet := StrToIntDef(CurrentPart, -1);
      if (CurrentPart = '') or (OctetCount > 2) or
         (Octet < 0) or (Octet > 255) then
        Exit;
      if (Length(CurrentPart) > 1) and (CurrentPart[1] = '0') then
        Exit;
      Octets[OctetCount] := Octet;
      OctetCount := OctetCount + 1;
      CurrentPart := '';
    end
    else if (Character >= '0') and (Character <= '9') then
      CurrentPart := CurrentPart + Character
    else
      Exit;
  end;

  Octet := StrToIntDef(CurrentPart, -1);
  if (CurrentPart = '') or (OctetCount <> 3) or
     (Octet < 0) or (Octet > 255) then
    Exit;
  if (Length(CurrentPart) > 1) and (CurrentPart[1] = '0') then
    Exit;

  Octets[3] := Octet;
  Result := not (
    (Octets[0] = 0) or
    (Octets[0] >= 224) or
    ((Octets[0] = 255) and (Octets[1] = 255) and
      (Octets[2] = 255) and (Octets[3] = 255))
  );
end;

function JsonContainsString(const Json, Name, ExpectedValue: String): Boolean;
var
  Compact: String;
begin
  Compact := Json;
  StringChangeEx(Compact, ' ', '', True);
  StringChangeEx(Compact, #9, '', True);
  StringChangeEx(Compact, #13, '', True);
  StringChangeEx(Compact, #10, '', True);
  Result := Pos('"' + Name + '":"' + ExpectedValue + '"', Compact) > 0;
end;

function JsonContainsInteger(const Json, Name: String; ExpectedValue: Integer): Boolean;
var
  Compact: String;
begin
  Compact := Json;
  StringChangeEx(Compact, ' ', '', True);
  StringChangeEx(Compact, #9, '', True);
  StringChangeEx(Compact, #13, '', True);
  StringChangeEx(Compact, #10, '', True);
  Result := Pos('"' + Name + '":' + IntToStr(ExpectedValue), Compact) > 0;
end;

function ReadSimpleJsonString(const Json, Name: String; var Value: String): Boolean;
var
  Compact, Prefix, Remainder: String;
  StartPosition, EndPosition: Integer;
begin
  Result := False;
  Value := '';
  Compact := Json;
  StringChangeEx(Compact, ' ', '', True);
  StringChangeEx(Compact, #9, '', True);
  StringChangeEx(Compact, #13, '', True);
  StringChangeEx(Compact, #10, '', True);
  Prefix := '"' + Name + '":"';
  StartPosition := Pos(Prefix, Compact);
  if StartPosition = 0 then
    Exit;

  Remainder := Copy(Compact, StartPosition + Length(Prefix), Length(Compact));
  EndPosition := Pos('"', Remainder);
  if EndPosition = 0 then
    Exit;

  Value := Copy(Remainder, 1, EndPosition - 1);
  Result := True;
end;

function ReadSimpleJsonInteger(const Json, Name: String; var Value: Integer): Boolean;
var
  Compact, Prefix, Digits: String;
  StartPosition, Index: Integer;
begin
  Result := False;
  Value := -1;
  Compact := Json;
  StringChangeEx(Compact, ' ', '', True);
  StringChangeEx(Compact, #9, '', True);
  StringChangeEx(Compact, #13, '', True);
  StringChangeEx(Compact, #10, '', True);
  Prefix := '"' + Name + '":';
  StartPosition := Pos(Prefix, Compact);
  if StartPosition = 0 then
    Exit;

  Digits := '';
  for Index := StartPosition + Length(Prefix) to Length(Compact) do
  begin
    if (Compact[Index] < '0') or (Compact[Index] > '9') then
      Break;
    Digits := Digits + Compact[Index];
  end;

  if Digits = '' then
    Exit;
  Value := StrToIntDef(Digits, -1);
  Result := Value >= 0;
end;

function ReadPreservedServerConfiguration(var Address, PortText: String): Boolean;
var
  Json: AnsiString;
  ParsedAddress: String;
  ParsedPort: Integer;
begin
  Result := False;
  if not FileExists(ExpandConstant(ConfigurationFile)) or
     not LoadStringFromFile(ExpandConstant(ConfigurationFile), Json) then
    Exit;

  if not ReadSimpleJsonString(Json, 'address', ParsedAddress) or
     not ReadSimpleJsonInteger(Json, 'port', ParsedPort) or
     not ParseIPv4(ParsedAddress) or
     (ParsedPort < 1) or (ParsedPort > 65535) then
  begin
    Log('PRESERVED_CONFIGURATION_IGNORED reason=invalid');
    Exit;
  end;

  Address := ParsedAddress;
  PortText := IntToStr(ParsedPort);
  Result := True;
  Log(Format('PRESERVED_CONFIGURATION_LOADED address=%s port=%d', [
    Address, ParsedPort]));
end;

function IsLowercaseSha256(const Value: String): Boolean;
var
  Index: Integer;
begin
  Result := Length(Value) = 64;
  if not Result then
    Exit;

  for Index := 1 to Length(Value) do
    if not (((Value[Index] >= '0') and (Value[Index] <= '9')) or
      ((Value[Index] >= 'a') and (Value[Index] <= 'f'))) then
    begin
      Result := False;
      Exit;
    end;
end;

function IsSafePayloadPath(const Value: String): Boolean;
var
  Normalized: String;
begin
  Normalized := Value;
  StringChangeEx(Normalized, '/', '\', True);
  Result := (Normalized <> '') and
    (Normalized[1] <> '\') and
    (Pos(':', Normalized) = 0) and
    (Pos('\..\', '\' + Normalized + '\') = 0) and
    (Pos('\.\', '\' + Normalized + '\') = 0);
end;

function ValidateInstalledChecksums(var FailureReason: String): Boolean;
var
  Lines: TStringList;
  Index, SeparatorPosition: Integer;
  Line, ExpectedHash, RelativePath, InstalledPath, ActualHash: String;
begin
  Result := False;
  FailureReason := '';
  Lines := TStringList.Create;
  try
    Lines.LoadFromFile(ExpandConstant(PayloadChecksumsPath));
    if Lines.Count < 1 then
    begin
      FailureReason := 'files.sha256 está vazio';
      Exit;
    end;

    for Index := 0 to Lines.Count - 1 do
    begin
      Line := Trim(Lines[Index]);
      if Line = '' then
        Continue;

      SeparatorPosition := Pos('  ', Line);
      if SeparatorPosition <> 65 then
      begin
        FailureReason := Format('linha %d inválida em files.sha256', [Index + 1]);
        Exit;
      end;

      ExpectedHash := Copy(Line, 1, 64);
      RelativePath := Copy(Line, 67, Length(Line) - 66);
      if not IsLowercaseSha256(ExpectedHash) or not IsSafePayloadPath(RelativePath) then
      begin
        FailureReason := Format('entrada %d insegura em files.sha256', [Index + 1]);
        Exit;
      end;

      StringChangeEx(RelativePath, '/', '\', True);
      InstalledPath := AddBackslash(ExpandConstant('{app}')) + RelativePath;
      if not FileExists(InstalledPath) then
      begin
        FailureReason := 'arquivo do manifesto ausente: ' + RelativePath;
        Exit;
      end;

      ActualHash := Lowercase(GetSHA256OfFile(InstalledPath));
      if ActualHash <> ExpectedHash then
      begin
        FailureReason := 'SHA-256 divergente: ' + RelativePath;
        Exit;
      end;
    end;

    Result := True;
    Log(Format('PAYLOAD_CHECKSUMS_OK files=%d', [Lines.Count]));
  except
    FailureReason := GetExceptionMessage;
    Log('PAYLOAD_CHECKSUMS_FAILED error=' + FailureReason);
  end;
  Lines.Free;
end;

function ValidatePayloadSource(var FailureReason: String): Boolean;
var
  Manifest: AnsiString;
begin
  Result := False;
  FailureReason := '';

  if not FileExists(ExpandConstant(LauncherPath)) then
    FailureReason := 'launcher ausente'
  else if not FileExists(ExpandConstant(RuntimePath)) then
    FailureReason := 'runtime Node ausente'
  else if not FileExists(ExpandConstant(ServerPath)) then
    FailureReason := 'servidor estático ausente'
  else if not FileExists(ExpandConstant(ApplicationPath)) then
    FailureReason := 'build Vue ausente'
  else if not FileExists(ExpandConstant(IconPath)) then
    FailureReason := 'ícone Windows ausente'
  else if not FileExists(ExpandConstant(PayloadManifestPath)) then
    FailureReason := 'payload-manifest.json ausente'
  else if not FileExists(ExpandConstant(PayloadChecksumsPath)) then
    FailureReason := 'files.sha256 ausente'
  else if not LoadStringFromFile(ExpandConstant(PayloadManifestPath), Manifest) then
    FailureReason := 'payload-manifest.json ilegível'
  else if not JsonContainsString(Manifest, 'version', '{#ApplicationVersion}') then
    FailureReason := 'versão do payload divergente'
  else if not JsonContainsString(Manifest, 'commit', '{#ReleaseCommit}') then
    FailureReason := 'commit do payload divergente'
  else if not JsonContainsString(Manifest, 'version', '{#NodeVersion}') then
    FailureReason := 'runtime do payload divergente'
  else if not JsonContainsString(Manifest, 'platform', 'windows-{#WindowsArchitecture}') then
    FailureReason := 'arquitetura do payload divergente'
  else if not JsonContainsString(Manifest, 'projectId', ExpectedFirebaseProjectId) then
    FailureReason := 'projeto Firebase divergente'
  else if not JsonContainsInteger(Manifest, 'schemaVersion', {#ManifestSchemaVersion}) then
    FailureReason := 'schema do payload incompatível'
  else if not ValidateInstalledChecksums(FailureReason) then
    FailureReason := FailureReason
  else
    Result := True;

  if Result then
    Log('PAYLOAD_VALIDATION_OK version={#ApplicationVersion} commit={#ReleaseCommit}')
  else
    Log('PAYLOAD_VALIDATION_FAILED reason=' + FailureReason);
end;

function SendHttpRequest(const Method, Url, Body, ContentType: String;
  var StatusCode: Integer; var ResponseText, ErrorText: String): Boolean;
var
  Request: Variant;
begin
  Result := False;
  StatusCode := 0;
  ResponseText := '';
  ErrorText := '';

  try
    Request := CreateOleObject('WinHttp.WinHttpRequest.5.1');
    Request.SetTimeouts(5000, 5000, 5000, 7000);
    Request.Open(Method, Url, False);
    Request.SetRequestHeader('Accept', 'application/json');
    if ContentType <> '' then
      Request.SetRequestHeader('Content-Type', ContentType);
    Request.Send(Body);
    StatusCode := Request.Status;
    ResponseText := Request.ResponseText;
    Result := True;
  except
    ErrorText := GetExceptionMessage;
  end;
end;

function ValidateFirebase(var FailureReason: String): Boolean;
var
  StatusCode: Integer;
  ResponseText, ErrorText: String;
begin
  WizardForm.StatusLabel.Caption := 'Validando conexão com o Firebase...';
  WizardForm.ProgressGauge.Style := npbstMarquee;
  Log('FIREBASE_VALIDATION_START project=' + ExpectedFirebaseProjectId);

  Result := SendHttpRequest('GET', FirebaseProjectProbeUrl, '', '',
    StatusCode, ResponseText, ErrorText);

  WizardForm.ProgressGauge.Style := npbstNormal;

  if not Result then
  begin
    FailureReason := ErrorText;
    Log('FIREBASE_VALIDATION_FAILED transport=' + ErrorText);
    Exit;
  end;

  { Este endpoint somente consulta a configuração pública da API key. A resposta
    precisa apontar para o número exato do projeto configurado no build. }
  Result := (StatusCode = 200) and
    JsonContainsString(ResponseText, 'projectId', '{#FirebaseProjectNumber}');

  if Result then
    Log(Format('FIREBASE_PROJECT_VALIDATION_OK status=%d project={#FirebaseProjectId}', [
      StatusCode]))
  else
  begin
    FailureReason := Format('HTTP %d ou projeto divergente', [StatusCode]);
    Log('FIREBASE_PROJECT_VALIDATION_FAILED status=' + IntToStr(StatusCode));
  end;

end;

function ProbeFastApi(const Address: String; Port: Integer): Boolean;
var
  StatusCode: Integer;
  ResponseText, ErrorText, Url: String;
begin
  Url := Format('https://%s:%d/health', [Address, Port]);
  Result := SendHttpRequest('GET', Url, '', '', StatusCode, ResponseText, ErrorText) and
    (StatusCode >= 200) and (StatusCode < 500);

  if Result then
    Log(Format('FASTAPI_PROBE_OK address=%s port=%d status=%d', [Address, Port, StatusCode]))
  else
    Log(Format('FASTAPI_PROBE_WARNING address=%s port=%d status=%d error=%s', [
      Address, Port, StatusCode, ErrorText]));
end;

function StopExistingApplication(var FailureReason: String): Boolean;
var
  Launcher, WorkingDirectory: String;
  ResultCode: Integer;
begin
  Result := True;
  FailureReason := '';
  Launcher := ExpandConstant(LauncherPath);
  if not FileExists(Launcher) then
    Exit;
  if not FileExists(ExpandConstant(InstallStateFile)) then
  begin
    Log('APPLICATION_SHUTDOWN_SKIPPED reason=install-state-missing');
    Exit;
  end;

  WorkingDirectory := ExpandConstant('{app}');
  Log('APPLICATION_SHUTDOWN_REQUESTED launcher=' + Launcher);
  if not Exec(Launcher, '--shutdown', WorkingDirectory, SW_HIDE,
    ewWaitUntilTerminated, ResultCode) then
  begin
    Result := False;
    FailureReason := ExpandConstant('{cm:ShutdownFailed}');
    Log('APPLICATION_SHUTDOWN_FAILED reason=exec');
    Exit;
  end;

  if ResultCode <> 0 then
  begin
    Result := False;
    FailureReason := ExpandConstant('{cm:ShutdownFailed}');
    Log(Format('APPLICATION_SHUTDOWN_FAILED exitCode=%d', [ResultCode]));
    Exit;
  end;

  Log('APPLICATION_SHUTDOWN_OK');
end;

function WriteRuntimeConfiguration(var FailureReason: String): Boolean;
var
  Json: String;
  Port: Integer;
begin
  Result := False;
  FailureReason := '';

  if not ParseIPv4(ServerPage.Values[0]) then
  begin
    FailureReason := ExpandConstant('{cm:InvalidServerAddress}');
    Exit;
  end
  else if not ParsePort(ServerPage.Values[1], Port) then
  begin
    FailureReason := ExpandConstant('{cm:InvalidServerPort}');
    Exit;
  end;

  if not ForceDirectories(ExpandConstant(ConfigurationDirectory)) then
  begin
    FailureReason := 'Não foi possível criar o diretório de configuração.';
    Exit;
  end;

  Json :=
    '{' + #13#10 +
    '  "schemaVersion": {#ConfigurationSchemaVersion},' + #13#10 +
    '  "installationId": "' + EscapeJson(InstallationId) + '",' + #13#10 +
    '  "server": {' + #13#10 +
    '    "address": "' + EscapeJson(ServerPage.Values[0]) + '",' + #13#10 +
    '    "port": ' + IntToStr(Port) + #13#10 +
    '  }' + #13#10 +
    '}' + #13#10;

  Result := SaveUtf8TextWithoutBom(ExpandConstant(ConfigurationFile), Json);
  if Result then
    Log(Format('CONFIGURATION_WRITTEN schema=%d address=%s port=%d', [
      {#ConfigurationSchemaVersion}, ServerPage.Values[0], Port]))
  else
    FailureReason := 'Não foi possível gravar runtime-config.json.';
end;

function WriteInstallState(var FailureReason: String): Boolean;
var
  Json: String;
begin
  Result := False;
  FailureReason := '';

  Json :=
    '{' + #13#10 +
    '  "schemaVersion": {#ManifestSchemaVersion},' + #13#10 +
    '  "installationId": "' + EscapeJson(InstallationId) + '",' + #13#10 +
    '  "application": {' + #13#10 +
    '    "id": "{#ApplicationId}",' + #13#10 +
    '    "name": "{#ApplicationName}",' + #13#10 +
    '    "version": "{#ApplicationVersion}"' + #13#10 +
    '  },' + #13#10 +
    '  "release": {' + #13#10 +
    '    "tag": "{#ReleaseTag}",' + #13#10 +
    '    "commit": "{#ReleaseCommit}"' + #13#10 +
    '  },' + #13#10 +
    '  "runtime": {' + #13#10 +
    '    "name": "node",' + #13#10 +
    '    "version": "{#NodeVersion}",' + #13#10 +
    '    "architecture": "{#WindowsArchitecture}"' + #13#10 +
    '  },' + #13#10 +
    '  "localApplication": {' + #13#10 +
    '    "host": "127.0.0.1",' + #13#10 +
    '    "port": {#LocalApplicationPort}' + #13#10 +
    '  },' + #13#10 +
    '  "configuration": {' + #13#10 +
    '    "schemaVersion": {#ConfigurationSchemaVersion},' + #13#10 +
    '    "path": "' + EscapeJson(ExpandConstant(ConfigurationFile)) + '"' + #13#10 +
    '  },' + #13#10 +
    '  "installedAt": "' +
      GetDateTimeString('yyyy-mm-dd"T"hh:nn:ss', '-', ':') + '"' + #13#10 +
    '}' + #13#10;

  Result := SaveUtf8TextWithoutBom(ExpandConstant(InstallStateFile), Json);
  if Result then
    Log('INSTALL_STATE_WRITTEN installationId=' + InstallationId)
  else
    FailureReason := 'Não foi possível gravar install-state.json.';
end;

function ValidateInstalledPayload(var FailureReason: String): Boolean;
begin
  Result := FileExists(ExpandConstant(LauncherPath)) and
    FileExists(ExpandConstant(RuntimePath)) and
    FileExists(ExpandConstant(ServerPath)) and
    FileExists(ExpandConstant(ApplicationPath)) and
    FileExists(ExpandConstant(IconPath)) and
    FileExists(ExpandConstant(ConfigurationFile)) and
    FileExists(ExpandConstant(InstallStateFile));

  if not Result then
    FailureReason := ExpandConstant('{cm:InstallationValidationFailed}')
  else
    Log('INSTALLED_PAYLOAD_VALIDATION_OK');
end;

function PrepareConfigurationRollback(var FailureReason: String): Boolean;
begin
  Result := False;
  FailureReason := '';
  ConfigurationBackupPath := ExpandConstant('{tmp}\runtime-config.backup.json');
  InstallStateBackupPath := ExpandConstant('{tmp}\install-state.backup.json');
  ConfigurationExistedBeforeSetup := FileExists(ExpandConstant(ConfigurationFile));
  InstallStateExistedBeforeSetup := FileExists(ExpandConstant(InstallStateFile));

  if ConfigurationExistedBeforeSetup and
     not CopyFile(ExpandConstant(ConfigurationFile), ConfigurationBackupPath, False) then
  begin
    FailureReason := 'Não foi possível proteger a configuração existente antes da atualização.';
    Exit;
  end;

  if InstallStateExistedBeforeSetup and
     not CopyFile(ExpandConstant(InstallStateFile), InstallStateBackupPath, False) then
  begin
    FailureReason := 'Não foi possível proteger o estado da instalação existente.';
    Exit;
  end;

  RollbackWasPrepared := True;
  Result := True;
  Log(Format('ROLLBACK_PREPARED configExisted=%d installStateExisted=%d', [
    Ord(ConfigurationExistedBeforeSetup), Ord(InstallStateExistedBeforeSetup)]));
end;

procedure RestoreConfigurationAfterFailure;
begin
  if not RollbackWasPrepared or InstallationWasFinalized then
    Exit;

  if ConfigurationExistedBeforeSetup then
    CopyFile(ConfigurationBackupPath, ExpandConstant(ConfigurationFile), False)
  else
    DeleteFile(ExpandConstant(ConfigurationFile));

  if InstallStateExistedBeforeSetup then
    CopyFile(InstallStateBackupPath, ExpandConstant(InstallStateFile), False)
  else
    DeleteFile(ExpandConstant(InstallStateFile));

  Log('ROLLBACK_CONFIGURATION_RESTORED');
end;

procedure ValidatePayloadAfterCopy;
var
  FailureReason: String;
begin
  if not ValidatePayloadSource(FailureReason) then
    RaiseException(ExpandConstant('{cm:PayloadValidationFailed}') +
      ' (' + FailureReason + ')');
  PayloadWasValidated := True;

  if not WriteRuntimeConfiguration(FailureReason) then
    RaiseException(FailureReason);

  if not WriteInstallState(FailureReason) then
    RaiseException(FailureReason);

  if not ValidateInstalledPayload(FailureReason) then
    RaiseException(FailureReason);

  Log(Format('INSTALLATION_COMPLETE serverUnavailable=%d', [
    Ord(ServerWasUnavailable)]));
end;

procedure InitializeWizard;
var
  PreviousAddress, PreviousPort, ParameterAddress, ParameterPort: String;
begin
  ServerPage := CreateInputQueryPage(
    wpSelectTasks,
    ExpandConstant('{cm:ServerPageTitle}'),
    ExpandConstant('{cm:ServerPageDescription}'),
    'O servidor pode estar offline durante a instalação. O endereço será testado sem bloquear a instalação.');
  ServerPage.Add(ExpandConstant('{cm:ServerAddressLabel}'), False);
  ServerPage.Add(ExpandConstant('{cm:ServerPortLabel}'), False);

  PreviousAddress := GetPreviousData('ServerAddress', '192.168.0.10');
  PreviousPort := GetPreviousData('ServerPort', IntToStr({#DefaultServerPort}));
  ReadPreservedServerConfiguration(PreviousAddress, PreviousPort);

  ParameterAddress := ExpandConstant('{param:SERVERIP|}');
  ParameterPort := ExpandConstant('{param:SERVERPORT|}');
  if ParameterAddress <> '' then
    PreviousAddress := ParameterAddress;
  if ParameterPort <> '' then
    PreviousPort := ParameterPort;

  ServerPage.Values[0] := PreviousAddress;
  ServerPage.Values[1] := PreviousPort;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := WizardSilent and (PageID = ServerPage.ID);
end;

function InitializeSetup: Boolean;
var
  PreviousInstallationId: String;
begin
  PreviousInstallationId := '';
  if RegQueryStringValue(HKCU, ProductRegistryKey, 'InstallationId',
    PreviousInstallationId) and IsValidInstallationId(PreviousInstallationId) then
  begin
    InstallationId := PreviousInstallationId;
    Log('INSTALLATION_ID_REUSED id=' + InstallationId);
  end
  else
  begin
    InstallationId := NewInstallationId;
    Log('INSTALLATION_ID_CREATED id=' + InstallationId);
  end;
  PayloadWasValidated := False;
  ServerWasUnavailable := False;
  RollbackWasPrepared := False;
  InstallationWasFinalized := False;
  Result := True;
  Log(Format(
    'INSTALLER_INITIALIZED appVersion={#ApplicationVersion} commit={#ReleaseCommit} innoRequired={#RequiredInnoSetupVersion}', []));
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Port: Integer;
begin
  Result := True;
  if CurPageID <> ServerPage.ID then
    Exit;

  if not ParseIPv4(ServerPage.Values[0]) then
  begin
    MsgBox(ExpandConstant('{cm:InvalidServerAddress}'), mbError, MB_OK);
    Result := False;
  end
  else if not ParsePort(ServerPage.Values[1], Port) then
  begin
    MsgBox(ExpandConstant('{cm:InvalidServerPort}'), mbError, MB_OK);
    Result := False;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  FailureReason: String;
  Port: Integer;
begin
  Result := '';
  NeedsRestart := False;

  if not ParseIPv4(ServerPage.Values[0]) then
  begin
    Result := ExpandConstant('{cm:InvalidServerAddress}');
    Exit;
  end;
  if not ParsePort(ServerPage.Values[1], Port) then
  begin
    Result := ExpandConstant('{cm:InvalidServerPort}');
    Exit;
  end;

  if not StopExistingApplication(FailureReason) then
  begin
    Result := FailureReason;
    Exit;
  end;

  if not ValidateFirebase(FailureReason) then
  begin
    Result := ExpandConstant('{cm:FirebaseValidationFailed}') + #13#10 + FailureReason;
    Exit;
  end;

  if not ProbeFastApi(ServerPage.Values[0], Port) then
  begin
    ServerWasUnavailable := True;
    SuppressibleMsgBox(ExpandConstant('{cm:ServerUnavailable}'),
      mbInformation, MB_OK, IDOK);
  end;

  if not PrepareConfigurationRollback(FailureReason) then
    Result := FailureReason;
end;

procedure RegisterPreviousData(PreviousDataKey: Integer);
begin
  SetPreviousData(PreviousDataKey, 'ServerAddress', ServerPage.Values[0]);
  SetPreviousData(PreviousDataKey, 'ServerPort', ServerPage.Values[1]);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep <> ssPostInstall then
    Exit;

  if not PayloadWasValidated then
    RaiseException(ExpandConstant('{cm:PayloadValidationFailed}'));

  InstallationWasFinalized := True;
end;

function InitializeUninstall: Boolean;
var
  RemoveDataParameter, FailureReason: String;
begin
  PreserveUserData := True;
  UninstallInstallationId := '';
  RegQueryStringValue(HKCU, ProductRegistryKey, 'InstallationId',
    UninstallInstallationId);
  if not IsValidInstallationId(UninstallInstallationId) then
    UninstallInstallationId := '';
  Result := True;

  if not StopExistingApplication(FailureReason) then
  begin
    if not UninstallSilent then
      MsgBox(FailureReason, mbError, MB_OK);
    Result := False;
    Exit;
  end;

  RemoveDataParameter := ExpandConstant('{param:REMOVEDATA|}');
  if (RemoveDataParameter <> '') and (RemoveDataParameter <> '0') and
     (RemoveDataParameter <> '1') then
  begin
    MsgBox('O parâmetro /REMOVEDATA aceita somente 0 ou 1.', mbError, MB_OK);
    Result := False;
    Exit;
  end;

  if RemoveDataParameter = '1' then
    PreserveUserData := False
  else if RemoveDataParameter = '0' then
    PreserveUserData := True
  else if not UninstallSilent then
    PreserveUserData := MsgBox(
      ExpandConstant('{cm:PreserveUserDataPrompt}'),
      mbConfirmation, MB_YESNO or MB_DEFBUTTON1) = IDYES;

  Log(Format('UNINSTALL_INITIALIZED preserveUserData=%d', [Ord(PreserveUserData)]));
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep <> usPostUninstall then
    Exit;

  DeleteFile(ExpandConstant(InstallStateFile));

  if not PreserveUserData then
  begin
    Log('UNINSTALL_REMOVING_USER_DATA');
    DelTree(ExpandConstant(ConfigurationDirectory), True, True, True);
    DelTree(ExpandConstant(LogDirectory), True, True, True);
    DelTree(ExpandConstant(StateDirectory), True, True, True);
    RemoveDir(ExpandConstant('{localappdata}\Megadoor'));
    RegDeleteValue(HKCU, ProductRegistryKey, 'InstallationId');
  end
  else
  begin
    Log('UNINSTALL_PRESERVED_USER_DATA');
    if UninstallInstallationId <> '' then
      RegWriteStringValue(HKCU, ProductRegistryKey, 'InstallationId',
        UninstallInstallationId);
  end;

  RegDeleteValue(HKCU, ProductRegistryKey, 'InstallLocation');
  RegDeleteValue(HKCU, ProductRegistryKey, 'Version');
  RegDeleteValue(HKCU, ProductRegistryKey, 'ReleaseTag');
  RegDeleteValue(HKCU, ProductRegistryKey, 'ReleaseCommit');
  if not PreserveUserData then
    RegDeleteKeyIfEmpty(HKCU, ProductRegistryKey);
end;

procedure DeinitializeSetup;
var
  Destination: String;
begin
  RestoreConfigurationAfterFailure;

  if not ForceDirectories(ExpandConstant(LogDirectory)) then
    Exit;

  Destination := AddBackslash(ExpandConstant(LogDirectory)) +
    'install-' + GetDateTimeString('yyyymmdd-hhnnss', #0, #0) + '.log';
  if CopyFile(ExpandConstant('{log}'), Destination, False) then
    Log('INSTALL_LOG_PERSISTED path=' + Destination);
end;

procedure DeinitializeUninstall;
var
  Destination: String;
begin
  if not PreserveUserData then
    Exit;
  if not ForceDirectories(ExpandConstant(LogDirectory)) then
    Exit;

  Destination := AddBackslash(ExpandConstant(LogDirectory)) +
    'uninstall-' + GetDateTimeString('yyyymmdd-hhnnss', #0, #0) + '.log';
  CopyFile(ExpandConstant('{log}'), Destination, False);
end;
