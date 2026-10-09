const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { WebSocketServer } = require('ws');
const { exec } = require('child_process');

const config = require('./config');
const adb = require('./adb');
const emulator = require('./emulator');
const { parseApk } = require('./apkParser');
const { LogcatSession } = require('./logcatStreamer');

// Log startup to file for background monitoring
const logFile = path.join(__dirname, '..', 'server.log');
fs.writeFileSync(logFile, `[${new Date().toISOString()}] Server process initialized (PID: ${process.pid})\n`);

process.on('uncaughtException', (err) => {
  fs.appendFileSync(logFile, `[ERROR] Uncaught: ${err.stack || err}\n`);
});
process.on('unhandledRejection', (reason) => {
  fs.appendFileSync(logFile, `[ERROR] Rejection: ${reason}\n`);
});
process.on('exit', (code) => {
  fs.appendFileSync(logFile, `[INFO] Process exited with code ${code}\n`);
});

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 4567;

// Configure uploads directory
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage for APK files
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${cleanName}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // Up to 500MB APK
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------- API ROUTES ----------------

// System and Device Status
app.get('/api/status', async (req, res) => {
  try {
    const [devices, avds] = await Promise.all([
      adb.getDevices(),
      emulator.listAvds()
    ]);

    res.json({
      success: true,
      config,
      devices,
      avds
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Emulator
app.post('/api/emulator/start', async (req, res) => {
  try {
    const { avdName, gpuHost, noSnapshot, noBootAnim } = req.body;
    if (!avdName) {
      return res.status(400).json({ success: false, error: 'AVD name is required.' });
    }

    const result = await emulator.startEmulator(avdName, {
      gpuHost: gpuHost !== false,
      noSnapshot: Boolean(noSnapshot),
      noBootAnim: Boolean(noBootAnim)
    });

    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Stop Emulator
app.post('/api/emulator/stop', async (req, res) => {
  try {
    const { serial } = req.body;
    const result = await emulator.stopEmulator(serial);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Restart ADB Server
app.post('/api/adb/restart', async (req, res) => {
  try {
    const result = await adb.restartAdbServer();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Upload and Parse APK
app.post('/api/upload-apk', upload.single('apk'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No APK file uploaded.' });
    }

    const apkPath = req.file.path;
    const metadata = await parseApk(apkPath);

    res.json({
      success: true,
      file: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: apkPath,
        size: req.file.size
      },
      metadata
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Inspect Local Existing APK Path (e.g. from file picker or drag)
app.post('/api/inspect-local-apk', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ success: false, error: 'File path does not exist.' });
    }
    const metadata = await parseApk(filePath);
    res.json({ success: true, metadata });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Install and Launch APK
app.post('/api/install-apk', async (req, res) => {
  try {
    const { serial, apkPath, autoLaunch, packageName, activityName } = req.body;
    if (!apkPath || !fs.existsSync(apkPath)) {
      return res.status(400).json({ success: false, error: 'Valid APK path is required.' });
    }

    const installResult = await adb.installApk(serial, apkPath);

    let launchResult = null;
    if (installResult.success && autoLaunch && packageName) {
      launchResult = await adb.launchApp(serial, packageName, activityName);
    }

    res.json({
      success: installResult.success,
      installResult,
      launchResult
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// App Management
app.post('/api/app/launch', async (req, res) => {
  try {
    const { serial, packageName, activityName } = req.body;
    const result = await adb.launchApp(serial, packageName, activityName);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/app/stop', async (req, res) => {
  try {
    const { serial, packageName } = req.body;
    const result = await adb.forceStop(serial, packageName);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/app/clear', async (req, res) => {
  try {
    const { serial, packageName } = req.body;
    const result = await adb.clearAppData(serial, packageName);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/app/uninstall', async (req, res) => {
  try {
    const { serial, packageName } = req.body;
    const result = await adb.uninstallApp(serial, packageName);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Device Control
app.post('/api/device/key', async (req, res) => {
  try {
    const { serial, keyCode } = req.body;
    const result = await adb.sendKey(serial, keyCode);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/device/text', async (req, res) => {
  try {
    const { serial, text } = req.body;
    const result = await adb.sendText(serial, text || '');
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Take Screenshot
app.post('/api/device/screenshot', async (req, res) => {
  try {
    const { serial } = req.body;
    const screenshotsDir = path.join(__dirname, '..', 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    const fileName = `screenshot_${Date.now()}.png`;
    const fullPath = path.join(screenshotsDir, fileName);

    const result = await adb.takeScreenshot(serial, fullPath);
    res.json({
      success: result.success,
      fileName,
      url: `/screenshots/${fileName}`,
      fullPath
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Shutdown Server Endpoint
app.post('/api/server/quit', (req, res) => {
  res.json({ success: true, message: 'Shutting down server...' });
  setTimeout(() => {
    process.exit(0);
  }, 500);
});

// Serve screenshots folder
app.use('/screenshots', express.static(path.join(__dirname, '..', 'screenshots')));

// ---------------- WEBSOCKET HANDLING ----------------
wss.on('connection', (ws) => {
  let logcatSession = null;

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);

      if (msg.type === 'start_logcat') {
        if (logcatSession) logcatSession.destroy();
        logcatSession = new LogcatSession(msg.serial || '', ws, {
          filter: msg.filter || '',
          minLevel: msg.minLevel || ''
        });
      } else if (msg.type === 'update_filter') {
        if (logcatSession) {
          logcatSession.updateFilter(msg.filter, msg.minLevel);
        }
      } else if (msg.type === 'stop_logcat') {
        if (logcatSession) {
          logcatSession.destroy();
          logcatSession = null;
        }
      }
    } catch (_) {}
  });

  ws.on('close', () => {
    if (logcatSession) logcatSession.destroy();
  });
});

// ---------------- LAUNCH LOGIC ----------------
server.on('error', (err) => {
  fs.appendFileSync(logFile, `[ERROR] Server error: ${err.stack || err}\n`);
});

server.listen(PORT, () => {
  fs.appendFileSync(logFile, `[INFO] Server successfully listening on port ${PORT}\n`);
  const url = `http://localhost:${PORT}`;
  console.log(`\n======================================================`);
  console.log(`  🚀 Android Emulator & APK Test Studio is running!  `);
  console.log(`  📍 Local URL: ${url}`);
  console.log(`======================================================\n`);

  // Launch Desktop Window in native App Mode if not running in dev / headless mode
  const isNoWindow = process.argv.includes('--no-window') || process.env.HEADLESS === 'true';
  if (!isNoWindow) {
    openDesktopWindow(url);
  }
});

/**
 * Opens the URL in a standalone, frameless desktop window using Microsoft Edge or Chrome
 */
function openDesktopWindow(url) {
  const windowFlags = `--app="${url}" --window-size=1280,860`;

  // Try Edge first (guaranteed on Windows 10/11)
  exec(`start msedge ${windowFlags}`, (err) => {
    if (err) {
      // Fallback to Chrome
      exec(`start chrome ${windowFlags}`, (chromeErr) => {
        if (chromeErr) {
          // Fallback to default browser
          exec(`start ${url}`);
        }
      });
    }
  });
}
