using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class MegadoorLauncher
{
    private const string HealthPath = "/__megadoor/health";
    private const int ReadyTimeoutMilliseconds = 15000;
    private const int ShutdownTimeoutMilliseconds = 15000;
    private const string ShutdownArgument = "--shutdown";

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcess(
        string applicationName,
        StringBuilder commandLine,
        IntPtr processAttributes,
        IntPtr threadAttributes,
        bool inheritHandles,
        uint creationFlags,
        IntPtr environment,
        string currentDirectory,
        ref StartupInfo startupInfo,
        out ProcessInformation processInformation);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateJobObject(IntPtr jobAttributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr job,
        int informationClass,
        ref JobObjectExtendedLimitInformation information,
        uint informationLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        public int cb;
        public string reserved;
        public string desktop;
        public string title;
        public int x;
        public int y;
        public int xSize;
        public int ySize;
        public int xCountChars;
        public int yCountChars;
        public int fillAttribute;
        public int flags;
        public short showWindow;
        public short reserved2;
        public IntPtr reservedPointer;
        public IntPtr standardInput;
        public IntPtr standardOutput;
        public IntPtr standardError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInformation
    {
        public IntPtr processHandle;
        public IntPtr threadHandle;
        public int processId;
        public int threadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JobObjectBasicLimitInformation
    {
        public long perProcessUserTimeLimit;
        public long perJobUserTimeLimit;
        public uint limitFlags;
        public UIntPtr minimumWorkingSetSize;
        public UIntPtr maximumWorkingSetSize;
        public uint activeProcessLimit;
        public UIntPtr affinity;
        public uint priorityClass;
        public uint schedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters
    {
        public ulong readOperationCount;
        public ulong writeOperationCount;
        public ulong otherOperationCount;
        public ulong readTransferCount;
        public ulong writeTransferCount;
        public ulong otherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JobObjectExtendedLimitInformation
    {
        public JobObjectBasicLimitInformation basicLimitInformation;
        public IoCounters ioInfo;
        public UIntPtr processMemoryLimit;
        public UIntPtr jobMemoryLimit;
        public UIntPtr peakProcessMemoryUsed;
        public UIntPtr peakJobMemoryUsed;
    }

    private sealed class LauncherConfiguration
    {
        public string InstallationRoot;
        public string ApplicationRoot;
        public string NodeExecutable;
        public string ServerScript;
        public string RuntimeConfigurationPath;
        public string ReadyFile;
        public string InstallationId;
        public string ApplicationId;
        public string ApplicationVersion;
        public int ConfigurationSchemaVersion;
        public int Port;
    }

    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        bool isShutdownCommand = args.Length == 1 &&
            String.Equals(args[0], ShutdownArgument, StringComparison.OrdinalIgnoreCase);

        try
        {
            if (args.Length > 0 && !isShutdownCommand)
            {
                Log("ERROR Argumentos inválidos fornecidos ao launcher.");
                return 2;
            }

            LauncherConfiguration configuration = ReadConfiguration();
            if (isShutdownCommand)
            {
                return RequestShutdown(configuration);
            }

            bool createdNew;
            using (Mutex mutex = new Mutex(true, LauncherMutexName(configuration), out createdNew))
            {
                if (ServerBelongsToThisInstallation(configuration))
                {
                    WarnIfFastApiIsUnavailable(configuration);
                    OpenBrowser(configuration.Port);
                    return 0;
                }

                if (!createdNew)
                {
                    if (!WaitForServer(configuration, 5000))
                    {
                        ShowError("O Megadoor já está iniciando. Aguarde alguns segundos e tente novamente.");
                        return 10;
                    }

                    WarnIfFastApiIsUnavailable(configuration);
                    OpenBrowser(configuration.Port);
                    return 0;
                }

                using (EventWaitHandle shutdownEvent = new EventWaitHandle(
                    false,
                    EventResetMode.ManualReset,
                    ShutdownEventName(configuration)))
                {
                    ValidateFiles(configuration);
                    Process serverProcess = StartServer(configuration);

                    if (!WaitForServer(configuration, ReadyTimeoutMilliseconds))
                    {
                        TryStopOwnedServer(serverProcess);
                        ShowError("Não foi possível iniciar os componentes locais do Megadoor.");
                        return 11;
                    }

                    WarnIfFastApiIsUnavailable(configuration);
                    OpenBrowser(configuration.Port);
                    return WaitForServerOrShutdown(serverProcess, shutdownEvent);
                }
            }
        }
        catch (Exception error)
        {
            Log("ERROR " + error);
            if (!isShutdownCommand)
            {
                ShowError("Não foi possível abrir o Megadoor. Consulte o log da aplicação para obter detalhes.");
            }
            return 1;
        }
    }

    private static LauncherConfiguration ReadConfiguration()
    {
        string executableDirectory = AppDomain.CurrentDomain.BaseDirectory;
        string installationRoot = Path.GetFullPath(Path.Combine(executableDirectory, ".."));
        string manifestPath = Path.Combine(installationRoot, "install-state.json");
        if (!File.Exists(manifestPath))
        {
            throw new FileNotFoundException("O estado da instalação não foi encontrado.", manifestPath);
        }

        Dictionary<string, object> manifest = DeserializeObject(File.ReadAllText(manifestPath, Encoding.UTF8));
        Dictionary<string, object> application = ReadObject(manifest, "application");
        Dictionary<string, object> localApplication = ReadObject(manifest, "localApplication");
        Dictionary<string, object> configuration = ReadObject(manifest, "configuration");

        string localApplicationData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        LauncherConfiguration result = new LauncherConfiguration
        {
            InstallationRoot = installationRoot,
            ApplicationRoot = Path.Combine(installationRoot, "app"),
            NodeExecutable = Path.Combine(installationRoot, "runtime", "node.exe"),
            ServerScript = Path.Combine(installationRoot, "server", "static-server.mjs"),
            RuntimeConfigurationPath = Environment.ExpandEnvironmentVariables(
                ReadRequiredString(configuration, "path")),
            ReadyFile = Path.Combine(localApplicationData, "Megadoor", "state", "server-state.json"),
            InstallationId = ReadRequiredString(manifest, "installationId"),
            ApplicationId = ReadRequiredString(application, "id"),
            ApplicationVersion = ReadRequiredString(application, "version"),
            ConfigurationSchemaVersion = ReadRequiredInt(configuration, "schemaVersion"),
            Port = ReadRequiredInt(localApplication, "port"),
        };

        if (result.Port < 1 || result.Port > 65535 || result.ConfigurationSchemaVersion < 1)
        {
            throw new InvalidDataException("O manifest contém valores locais inválidos.");
        }

        if (!Regex.IsMatch(result.ApplicationId, @"^[A-Za-z0-9._-]+$"))
        {
            throw new InvalidDataException("O identificador da aplicação no manifest é inválido.");
        }

        if (!Regex.IsMatch(result.InstallationId, @"^[A-Za-z0-9._-]{8,128}$"))
        {
            throw new InvalidDataException("O identificador da instalação no manifest é inválido.");
        }

        return result;
    }

    private static Dictionary<string, object> DeserializeObject(string json)
    {
        JavaScriptSerializer serializer = new JavaScriptSerializer();
        Dictionary<string, object> result = serializer.DeserializeObject(json) as Dictionary<string, object>;
        if (result == null)
        {
            throw new InvalidDataException("O manifest da instalação não é um objeto JSON.");
        }
        return result;
    }

    private static Dictionary<string, object> ReadObject(Dictionary<string, object> source, string key)
    {
        object value;
        if (source.TryGetValue(key, out value) && value is Dictionary<string, object>)
        {
            return (Dictionary<string, object>)value;
        }
        return new Dictionary<string, object>();
    }

    private static string ReadString(Dictionary<string, object> source, string key, string fallback)
    {
        object value;
        if (source.TryGetValue(key, out value) && value is string && !String.IsNullOrWhiteSpace((string)value))
        {
            return (string)value;
        }
        return fallback;
    }

    private static int ReadInt(Dictionary<string, object> source, string key, int fallback)
    {
        object value;
        if (!source.TryGetValue(key, out value)) return fallback;
        try { return Convert.ToInt32(value); }
        catch { return fallback; }
    }

    private static string ReadRequiredString(Dictionary<string, object> source, string key)
    {
        string value = ReadString(source, key, String.Empty);
        if (String.IsNullOrWhiteSpace(value))
        {
            throw new InvalidDataException("Campo obrigatório ausente no manifest: " + key + ".");
        }
        return value;
    }

    private static int ReadRequiredInt(Dictionary<string, object> source, string key)
    {
        object value;
        int parsed;
        if (!source.TryGetValue(key, out value) || !Int32.TryParse(Convert.ToString(value), out parsed))
        {
            throw new InvalidDataException("Campo inteiro obrigatório ausente no manifest: " + key + ".");
        }
        return parsed;
    }

    private static void ValidateFiles(LauncherConfiguration configuration)
    {
        string[] requiredFiles =
        {
            configuration.NodeExecutable,
            configuration.ServerScript,
            Path.Combine(configuration.ApplicationRoot, "index.html"),
            configuration.RuntimeConfigurationPath,
        };

        foreach (string requiredFile in requiredFiles)
        {
            if (!File.Exists(requiredFile))
            {
                throw new FileNotFoundException("Componente obrigatório ausente.", requiredFile);
            }
        }
    }

    private static Process StartServer(LauncherConfiguration configuration)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(configuration.ReadyFile));

        string arguments = String.Join(" ", new[]
        {
            Quote(configuration.ServerScript),
            "--app-root", Quote(configuration.ApplicationRoot),
            "--config", Quote(configuration.RuntimeConfigurationPath),
            "--configuration-schema-version", configuration.ConfigurationSchemaVersion.ToString(),
            "--install-id", Quote(configuration.InstallationId),
            "--port", configuration.Port.ToString(),
            "--ready-file", Quote(configuration.ReadyFile),
            "--version", Quote(configuration.ApplicationVersion),
        });

        StringBuilder commandLine = new StringBuilder(Quote(configuration.NodeExecutable) + " " + arguments);
        StartupInfo startupInfo = new StartupInfo();
        startupInfo.cb = Marshal.SizeOf(startupInfo);
        ProcessInformation processInformation;
        const uint CreateSuspended = 0x00000004;
        const uint CreateNoWindow = 0x08000000;
        const uint CreateUnicodeEnvironment = 0x00000400;

        bool started = CreateProcess(
            configuration.NodeExecutable,
            commandLine,
            IntPtr.Zero,
            IntPtr.Zero,
            false,
            CreateSuspended | CreateNoWindow | CreateUnicodeEnvironment,
            IntPtr.Zero,
            configuration.InstallationRoot,
            ref startupInfo,
            out processInformation);

        if (!started)
        {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }

        try
        {
            AttachServerToJob(processInformation.processHandle);
            if (ResumeThread(processInformation.threadHandle) == UInt32.MaxValue)
            {
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            }
            Log("INFO Servidor local iniciado com PID " + processInformation.processId + ".");
            return Process.GetProcessById(processInformation.processId);
        }
        catch
        {
            ReleaseServerJob();
            try { Process.GetProcessById(processInformation.processId).Kill(); } catch { }
            throw;
        }
        finally
        {
            CloseHandle(processInformation.threadHandle);
            CloseHandle(processInformation.processHandle);
        }
    }

    private static IntPtr serverJob = IntPtr.Zero;

    private static void AttachServerToJob(IntPtr processHandle)
    {
        const uint JobObjectLimitKillOnJobClose = 0x00002000;
        const int JobObjectExtendedLimitInformationClass = 9;

        serverJob = CreateJobObject(IntPtr.Zero, null);
        if (serverJob == IntPtr.Zero)
        {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }

        JobObjectExtendedLimitInformation limits = new JobObjectExtendedLimitInformation();
        limits.basicLimitInformation.limitFlags = JobObjectLimitKillOnJobClose;
        uint size = (uint)Marshal.SizeOf(typeof(JobObjectExtendedLimitInformation));
        if (!SetInformationJobObject(serverJob, JobObjectExtendedLimitInformationClass, ref limits, size) ||
            !AssignProcessToJobObject(serverJob, processHandle))
        {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
    }

    private static void ReleaseServerJob()
    {
        if (serverJob != IntPtr.Zero)
        {
            CloseHandle(serverJob);
            serverJob = IntPtr.Zero;
        }
    }

    private static int WaitForServerOrShutdown(Process serverProcess, EventWaitHandle shutdownEvent)
    {
        try
        {
            while (!serverProcess.WaitForExit(200))
            {
                if (!shutdownEvent.WaitOne(0)) continue;

                Log("INFO Encerramento solicitado para esta instalação.");
                ReleaseServerJob();
                if (!serverProcess.WaitForExit(ShutdownTimeoutMilliseconds))
                {
                    Log("ERROR O servidor Node pertencente à instalação não encerrou no prazo.");
                    return 12;
                }

                Log("INFO Servidor Node da instalação encerrado.");
                return 0;
            }

            return serverProcess.ExitCode;
        }
        finally
        {
            ReleaseServerJob();
        }
    }

    private static int RequestShutdown(LauncherConfiguration configuration)
    {
        EventWaitHandle shutdownEvent = null;
        Stopwatch eventWait = Stopwatch.StartNew();

        while (eventWait.ElapsedMilliseconds < 2000 && shutdownEvent == null)
        {
            try
            {
                shutdownEvent = EventWaitHandle.OpenExisting(ShutdownEventName(configuration));
            }
            catch (WaitHandleCannotBeOpenedException)
            {
                if (!LauncherMutexIsOwned(configuration))
                {
                    if (ServerBelongsToThisInstallation(configuration))
                    {
                        Log("ERROR Servidor local identificado sem um launcher proprietário ativo.");
                        return 20;
                    }

                    Log("INFO Nenhuma instância desta instalação precisa ser encerrada.");
                    return 0;
                }

                Thread.Sleep(100);
            }
        }

        if (shutdownEvent == null)
        {
            Log("ERROR O launcher está ativo, mas seu evento de encerramento não foi encontrado.");
            return 21;
        }

        using (shutdownEvent)
        {
            if (!shutdownEvent.Set())
            {
                Log("ERROR Não foi possível sinalizar o evento de encerramento.");
                return 22;
            }
        }

        Log("INFO Sinal de encerramento enviado à instalação " + configuration.InstallationId + ".");
        if (!WaitForLauncherToStop(configuration, ShutdownTimeoutMilliseconds))
        {
            Log("ERROR O launcher da instalação não encerrou no prazo.");
            return 23;
        }

        if (ServerBelongsToThisInstallation(configuration))
        {
            Log("ERROR O servidor da instalação continua respondendo após o encerramento.");
            return 24;
        }

        Log("INFO Encerramento da instalação confirmado.");
        return 0;
    }

    private static bool LauncherMutexIsOwned(LauncherConfiguration configuration)
    {
        try
        {
            using (Mutex mutex = Mutex.OpenExisting(LauncherMutexName(configuration)))
            {
                bool acquired = false;
                try
                {
                    acquired = mutex.WaitOne(0);
                    return !acquired;
                }
                catch (AbandonedMutexException)
                {
                    acquired = true;
                    return false;
                }
                finally
                {
                    if (acquired) mutex.ReleaseMutex();
                }
            }
        }
        catch (WaitHandleCannotBeOpenedException)
        {
            return false;
        }
    }

    private static bool WaitForLauncherToStop(
        LauncherConfiguration configuration,
        int timeoutMilliseconds)
    {
        try
        {
            using (Mutex mutex = Mutex.OpenExisting(LauncherMutexName(configuration)))
            {
                bool acquired = false;
                try
                {
                    acquired = mutex.WaitOne(timeoutMilliseconds);
                    return acquired;
                }
                catch (AbandonedMutexException)
                {
                    acquired = true;
                    return true;
                }
                finally
                {
                    if (acquired) mutex.ReleaseMutex();
                }
            }
        }
        catch (WaitHandleCannotBeOpenedException)
        {
            return true;
        }
    }

    private static string LauncherMutexName(LauncherConfiguration configuration)
    {
        return "Local\\" + configuration.ApplicationId + ".launcher";
    }

    private static string ShutdownEventName(LauncherConfiguration configuration)
    {
        return "Local\\" + configuration.ApplicationId + "." +
            configuration.InstallationId + ".shutdown";
    }

    private static bool WaitForServer(LauncherConfiguration configuration, int timeoutMilliseconds)
    {
        Stopwatch stopwatch = Stopwatch.StartNew();
        while (stopwatch.ElapsedMilliseconds < timeoutMilliseconds)
        {
            if (ServerBelongsToThisInstallation(configuration)) return true;
            Thread.Sleep(200);
        }
        return false;
    }

    private static bool ServerBelongsToThisInstallation(LauncherConfiguration configuration)
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(
                "http://127.0.0.1:" + configuration.Port + HealthPath);
            request.Method = "GET";
            request.Timeout = 750;
            request.ReadWriteTimeout = 750;
            request.Proxy = null;

            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
            {
                if (response.StatusCode != HttpStatusCode.OK) return false;
                Dictionary<string, object> health = DeserializeObject(reader.ReadToEnd());
                return String.Equals(
                    ReadString(health, "installId", String.Empty),
                    configuration.InstallationId,
                    StringComparison.Ordinal);
            }
        }
        catch
        {
            return false;
        }
    }

    private static void OpenBrowser(int port)
    {
        string url = "http://127.0.0.1:" + port + "/";
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }

    private static void WarnIfFastApiIsUnavailable(LauncherConfiguration configuration)
    {
        try
        {
            Dictionary<string, object> runtime = DeserializeObject(
                File.ReadAllText(configuration.RuntimeConfigurationPath, Encoding.UTF8));
            Dictionary<string, object> server = ReadObject(runtime, "server");
            string address = ReadString(server, "address", String.Empty);
            int port = ReadInt(server, "port", 0);
            IPAddress parsedAddress;
            if (!IPAddress.TryParse(address, out parsedAddress) ||
                parsedAddress.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork ||
                port < 1 || port > 65535)
            {
                throw new InvalidDataException("Configuração do servidor inválida.");
            }

            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(
                "https://" + address + ":" + port + "/health");
            request.Method = "GET";
            request.Timeout = 2000;
            request.ReadWriteTimeout = 2000;
            request.Proxy = null;
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            {
                if ((int)response.StatusCode < 200 || (int)response.StatusCode >= 300)
                {
                    throw new WebException("O servidor respondeu com " + (int)response.StatusCode + ".");
                }
            }
        }
        catch (Exception error)
        {
            Log("WARN FastAPI indisponível: " + error.GetType().Name + " - " + error.Message);
            MessageBox.Show(
                "Servidor não encontrado.\n\nA aplicação será aberta normalmente, mas alguns recursos poderão ficar indisponíveis.",
                "Megadoor",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }

    private static void TryStopOwnedServer(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill();
                process.WaitForExit(3000);
            }
        }
        catch (Exception error)
        {
            Log("WARN Não foi possível encerrar o servidor que falhou: " + error.Message);
        }
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private static string LogPath()
    {
        string directory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Megadoor",
            "logs");
        Directory.CreateDirectory(directory);
        return Path.Combine(directory, "launcher-" + DateTime.Now.ToString("yyyy-MM-dd") + ".log");
    }

    private static void Log(string message)
    {
        try
        {
            File.AppendAllText(
                LogPath(),
                DateTimeOffset.Now.ToString("o") + " " + message + Environment.NewLine,
                new UTF8Encoding(false));
        }
        catch { }
    }

    private static void ShowError(string message)
    {
        MessageBox.Show(message, "Megadoor", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
