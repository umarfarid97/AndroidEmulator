const { execFile, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');

function execAdb(args) {
  return new Promise((resolve, reject) => {
    execFile(config.adbPath, args, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return resolve({ success: false, error: stderr || err.message, stdout });
      }
      resolve({ success: true, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

/**
 * List connected devices and emulators with detailed info
 */
async function getDevices() {
  const result = await execAdb(['devices', '-l']);
  if (!result.success) return [];

  const lines = result.stdout.split(/\r?\n/).slice(1);
  const devices = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/\s+/);
    const serial = parts[0];
    const status = parts[1];

    if (!serial) continue;

    const isEmulator = serial.startsWith('emulator-');

    // Extract product/model metadata from line if available
    let model = 'Android Device';
    const modelMatch = trimmed.match(/model:(\S+)/);
    if (modelMatch) model = modelMatch[1].replace(/_/g, ' ');

    let deviceName = model;
    const deviceMatch = trimmed.match(/device:(\S+)/);
    if (deviceMatch) deviceName = deviceMatch[1];

    devices.push({
      serial,
      status, // 'device', 'offline', 'unauthorized'
      isEmulator,
      model,
      deviceName,
      isReady: status === 'device'
    });
  }

  // Fetch extra properties for online devices in parallel
  await Promise.all(devices.map(async (dev) => {
    if (dev.isReady) {
      try {
        const [androidVer, battery, density] = await Promise.all([
          execAdb(['-s', dev.serial, 'shell', 'getprop', 'ro.build.version.release']),
          execAdb(['-s', dev.serial, 'shell', 'dumpsys', 'battery']),
          execAdb(['-s', dev.serial, 'shell', 'wm', 'density'])
        ]);

        if (androidVer.success && androidVer.stdout) {
          dev.androidVersion = androidVer.stdout.trim();
        }

        if (battery.success) {
          const levelMatch = battery.stdout.match(/level:\s*(\d+)/);
          if (levelMatch) dev.batteryLevel = parseInt(levelMatch[1], 10);
        }

        if (density.success) {
          const densMatch = density.stdout.match(/(\d+)/);
          if (densMatch) dev.density = densMatch[1];
        }
      } catch (_) {}
    }
  }));

  return devices;
}

/**
 * Install an APK on the specified device
 */
async function installApk(serial, apkPath) {
  const args = serial ? ['-s', serial] : [];
  // -r: replace existing application
  // -d: allow version code downgrade
  // -t: allow test packages
  // -g: grant all runtime permissions
  args.push('install', '-r', '-d', '-t', '-g', apkPath);

  const res = await execAdb(args);
  const output = (res.stdout || '') + ' ' + (res.error || '');
  const success = output.includes('Success');

  return {
    success,
    message: output.trim(),
    details: res
  };
}

/**
 * Launch an app by package name and activity or monkey launcher
 */
async function launchApp(serial, packageName, activityName = '') {
  const prefix = serial ? ['-s', serial] : [];
  
  if (activityName) {
    // If activity starts with dot or package name
    let target = activityName;
    if (target.startsWith('.')) {
      target = packageName + target;
    } else if (!target.includes('/')) {
      target = `${packageName}/${target}`;
    }
    const res = await execAdb([...prefix, 'shell', 'am', 'start', '-n', target]);
    return res;
  } else {
    // Fallback: Launch via monkey intent launcher
    const res = await execAdb([...prefix, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
    return res;
  }
}

/**
 * Force stop an app
 */
async function forceStop(serial, packageName) {
  const prefix = serial ? ['-s', serial] : [];
  return await execAdb([...prefix, 'shell', 'am', 'force-stop', packageName]);
}

/**
 * Clear app data & cache
 */
async function clearAppData(serial, packageName) {
  const prefix = serial ? ['-s', serial] : [];
  return await execAdb([...prefix, 'shell', 'pm', 'clear', packageName]);
}

/**
 * Uninstall an app
 */
async function uninstallApp(serial, packageName) {
  const prefix = serial ? ['-s', serial] : [];
  return await execAdb([...prefix, 'uninstall', packageName]);
}

/**
 * Send Android Keyevent (e.g. 3 = Home, 4 = Back, 187 = Recents, 26 = Power)
 */
async function sendKey(serial, keyCode) {
  const prefix = serial ? ['-s', serial] : [];
  return await execAdb([...prefix, 'shell', 'input', 'keyevent', String(keyCode)]);
}

/**
 * Injects text typing into the active focused field
 */
async function sendText(serial, text) {
  const prefix = serial ? ['-s', serial] : [];
  // Escape spaces with %s
  const formatted = text.replace(/ /g, '%s').replace(/[&|;<>]/g, '');
  return await execAdb([...prefix, 'shell', 'input', 'text', formatted]);
}

/**
 * Take screenshot and return base64
 */
async function takeScreenshot(serial, savePath = '') {
  const prefix = serial ? ['-s', serial] : [];
  const tempDevicePath = '/data/local/tmp/screenshot.png';

  // 1. Capture on device
  await execAdb([...prefix, 'shell', 'screencap', '-p', tempDevicePath]);

  // 2. Pull or read
  if (savePath) {
    const res = await execAdb([...prefix, 'pull', tempDevicePath, savePath]);
    await execAdb([...prefix, 'shell', 'rm', tempDevicePath]);
    return { success: res.success, filePath: savePath };
  } else {
    // Return buffer/base64
    const res = await execAdb([...prefix, 'exec-out', 'screencap', '-p']);
    return res;
  }
}

/**
 * Restart ADB server
 */
async function restartAdbServer() {
  await execAdb(['kill-server']);
  return await execAdb(['start-server']);
}

module.exports = {
  getDevices,
  installApk,
  launchApp,
  forceStop,
  clearAppData,
  uninstallApp,
  sendKey,
  sendText,
  takeScreenshot,
  restartAdbServer
};
