const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Inspects an APK using aapt.exe and returns structured metadata
 * @param {string} apkPath - Absolute path to the APK file
 * @returns {Promise<object>}
 */
function parseApk(apkPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(apkPath)) {
      return reject(new Error(`APK file not found: ${apkPath}`));
    }

    const stats = fs.statSync(apkPath);
    const result = {
      filePath: apkPath,
      fileName: path.basename(apkPath),
      fileSize: formatBytes(stats.size),
      sizeBytes: stats.size,
      packageName: '',
      versionCode: '',
      versionName: '',
      label: path.basename(apkPath, '.apk'),
      launchableActivity: '',
      minSdk: '',
      targetSdk: '',
      permissions: []
    };

    if (!config.hasAapt) {
      return resolve(result);
    }

    execFile(config.aaptPath, ['dump', 'badging', apkPath], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        // Fallback to basic file info
        return resolve(result);
      }

      const output = stdout || stderr || '';

      // 1. Package name, versionCode, versionName
      const packageMatch = output.match(/package:\s*name='([^']+)'(?:\s*versionCode='([^']+)')?(?:\s*versionName='([^']+)')?/);
      if (packageMatch) {
        result.packageName = packageMatch[1] || '';
        result.versionCode = packageMatch[2] || '';
        result.versionName = packageMatch[3] || '';
      }

      // 2. Application label
      const labelMatch = output.match(/application-label(?:-[a-zA-Z]+)?:'([^']+)'/);
      if (labelMatch) {
        result.label = labelMatch[1];
      }

      // 3. Launchable activity
      const activityMatch = output.match(/launchable-activity:\s*name='([^']+)'/);
      if (activityMatch) {
        result.launchableActivity = activityMatch[1];
      }

      // 4. SDK versions
      const minSdkMatch = output.match(/sdkVersion:'([^']+)'/);
      if (minSdkMatch) result.minSdk = minSdkMatch[1];

      const targetSdkMatch = output.match(/targetSdkVersion:'([^']+)'/);
      if (targetSdkMatch) result.targetSdk = targetSdkMatch[1];

      // 5. Permissions
      const permMatches = output.matchAll(/uses-permission:\s*name='([^']+)'/g);
      for (const m of permMatches) {
        const cleanPerm = m[1].replace('android.permission.', '');
        if (!result.permissions.includes(cleanPerm)) {
          result.permissions.push(cleanPerm);
        }
      }

      resolve(result);
    });
  });
}

module.exports = { parseApk };
