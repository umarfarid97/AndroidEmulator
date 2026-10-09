#!/usr/bin/env node
const path = require('path');
const config = require('./config');
const adb = require('./adb');
const emulator = require('./emulator');
const { parseApk } = require('./apkParser');

const [,, cmd, ...args] = process.argv;

async function main() {
  switch (cmd) {
    case 'status':
    case 'devices': {
      console.log('\n📱 Connected Devices & Emulators:');
      const devices = await adb.getDevices();
      if (devices.length === 0) {
        console.log('  No devices found. Run "start" to launch an emulator.');
      } else {
        devices.forEach(d => {
          console.log(`  • [${d.status.toUpperCase()}] ${d.serial} (${d.model}) - Android ${d.androidVersion || 'N/A'}`);
        });
      }

      console.log('\n🖥️ Available AVDs:');
      const avds = await emulator.listAvds();
      if (avds.length === 0) {
        console.log('  No AVDs found.');
      } else {
        avds.forEach(a => console.log(`  • ${a}`));
      }
      break;
    }

    case 'start': {
      const avds = await emulator.listAvds();
      const targetAvd = args[0] || avds[0];
      if (!targetAvd) {
        console.error('Error: No AVD specified and none found.');
        process.exit(1);
      }
      console.log(`🚀 Starting emulator: ${targetAvd}...`);
      await emulator.startEmulator(targetAvd, { gpuHost: true });
      console.log('Emulator started in background.');
      break;
    }

    case 'stop': {
      console.log('⏹ Stopping emulator...');
      const res = await emulator.stopEmulator(args[0] || '');
      console.log(res.output || 'Stopped.');
      break;
    }

    case 'inspect': {
      const apkPath = args[0];
      if (!apkPath) {
        console.error('Usage: node src/cli.js inspect <path-to-apk>');
        process.exit(1);
      }
      const meta = await parseApk(path.resolve(apkPath));
      console.log('\n📦 APK Metadata:');
      console.log(`  App Name:     ${meta.label}`);
      console.log(`  Package:      ${meta.packageName}`);
      console.log(`  Version:      ${meta.versionName} (Code: ${meta.versionCode})`);
      console.log(`  Main Activity:${meta.launchableActivity}`);
      console.log(`  Min SDK:      ${meta.minSdk}`);
      console.log(`  Target SDK:   ${meta.targetSdk}`);
      console.log(`  File Size:    ${meta.fileSize}`);
      console.log(`  Permissions:  ${meta.permissions.length} found`);
      break;
    }

    case 'install': {
      const apkPath = args[0];
      if (!apkPath) {
        console.error('Usage: node src/cli.js install <path-to-apk> [--launch]');
        process.exit(1);
      }
      const fullPath = path.resolve(apkPath);
      const meta = await parseApk(fullPath);

      console.log(`📦 Installing ${meta.label || path.basename(apkPath)}...`);
      const res = await adb.installApk('', fullPath);
      console.log(res.message);

      if (res.success && (args.includes('--launch') || args.includes('-l'))) {
        console.log(`🚀 Launching ${meta.packageName}...`);
        await adb.launchApp('', meta.packageName, meta.launchableActivity);
      }
      break;
    }

    case 'screenshot': {
      const savePath = args[0] || path.join(process.cwd(), `screenshot_${Date.now()}.png`);
      console.log(`📸 Taking screenshot...`);
      const res = await adb.takeScreenshot('', savePath);
      if (res.success) {
        console.log(`Saved screenshot to: ${savePath}`);
      } else {
        console.error('Failed to take screenshot.');
      }
      break;
    }

    default:
      console.log(`
Android Emulator & APK Tester CLI
---------------------------------
Usage: node src/cli.js <command> [options]

Commands:
  devices / status       List connected devices and available AVDs
  start [avdName]        Launch an emulator instance
  stop [serial]          Kill running emulator
  inspect <apkPath>      Parse and display APK package details
  install <apkPath> [-l] Install APK onto device (-l to auto-launch)
  screenshot [savePath]  Capture and save a screenshot
      `);
      break;
  }
}

main().catch(console.error);
