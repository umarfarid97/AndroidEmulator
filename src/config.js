const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findSdkPaths() {
  const possibleSdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
    'C:\\Android\\Sdk',
    'C:\\Android\\android-sdk',
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Android', 'Sdk')
  ].filter(Boolean);

  let sdkRoot = '';
  for (const p of possibleSdkRoots) {
    if (fs.existsSync(p)) {
      sdkRoot = p;
      break;
    }
  }

  // 1. ADB path
  let adbPath = 'adb';
  if (sdkRoot && fs.existsSync(path.join(sdkRoot, 'platform-tools', 'adb.exe'))) {
    adbPath = path.join(sdkRoot, 'platform-tools', 'adb.exe');
  } else {
    try {
      const which = execSync('where adb', { encoding: 'utf-8' }).trim().split('\n')[0].trim();
      if (which && fs.existsSync(which)) adbPath = which;
    } catch (_) {}
  }

  // 2. Emulator path
  let emulatorPath = 'emulator';
  if (sdkRoot && fs.existsSync(path.join(sdkRoot, 'emulator', 'emulator.exe'))) {
    emulatorPath = path.join(sdkRoot, 'emulator', 'emulator.exe');
  } else {
    try {
      const which = execSync('where emulator', { encoding: 'utf-8' }).trim().split('\n')[0].trim();
      if (which && fs.existsSync(which)) emulatorPath = which;
    } catch (_) {}
  }

  // 3. Aapt path (inspect build-tools)
  let aaptPath = '';
  if (sdkRoot) {
    const buildToolsDir = path.join(sdkRoot, 'build-tools');
    if (fs.existsSync(buildToolsDir)) {
      const versions = fs.readdirSync(buildToolsDir).sort().reverse();
      for (const ver of versions) {
        const candidate = path.join(buildToolsDir, ver, 'aapt.exe');
        if (fs.existsSync(candidate)) {
          aaptPath = candidate;
          break;
        }
      }
    }
  }
  if (!aaptPath) {
    try {
      const which = execSync('where aapt', { encoding: 'utf-8' }).trim().split('\n')[0].trim();
      if (which && fs.existsSync(which)) aaptPath = which;
    } catch (_) {}
  }

  return {
    sdkRoot,
    adbPath,
    emulatorPath,
    aaptPath,
    hasAdb: fs.existsSync(adbPath) || adbPath === 'adb',
    hasEmulator: fs.existsSync(emulatorPath) || emulatorPath === 'emulator',
    hasAapt: Boolean(aaptPath && fs.existsSync(aaptPath))
  };
}

module.exports = findSdkPaths();
