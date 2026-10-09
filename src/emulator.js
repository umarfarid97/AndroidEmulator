const { spawn, execFile } = require('child_process');
const config = require('./config');

let runningEmulatorProcess = null;

/**
 * List all available installed AVDs
 * @returns {Promise<string[]>}
 */
function listAvds() {
  return new Promise((resolve) => {
    if (!config.hasEmulator) return resolve([]);
    execFile(config.emulatorPath, ['-list-avds'], { encoding: 'utf-8' }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      const avds = stdout
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
      resolve(avds);
    });
  });
}

/**
 * Launch an AVD
 * @param {string} avdName
 * @param {object} options
 */
function startEmulator(avdName, options = {}) {
  return new Promise((resolve, reject) => {
    if (!config.hasEmulator) {
      return reject(new Error('Android emulator binary not found.'));
    }

    const args = ['-avd', avdName];

    // Hardware acceleration & performance flags
    if (options.gpuHost !== false) {
      args.push('-gpu', 'host');
    }
    if (options.noSnapshot) {
      args.push('-no-snapshot-load');
    }
    if (options.noBootAnim) {
      args.push('-no-boot-anim');
    }
    if (options.noAudio) {
      args.push('-no-audio');
    }

    try {
      const child = spawn(config.emulatorPath, args, {
        detached: true,
        stdio: 'ignore'
      });

      child.unref();
      runningEmulatorProcess = child;

      resolve({
        success: true,
        pid: child.pid,
        avd: avdName,
        message: `Emulator ${avdName} process started.`
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Stop running emulator
 */
function stopEmulator(serial = '') {
  return new Promise((resolve) => {
    const target = serial ? ['-s', serial, 'emu', 'kill'] : ['emu', 'kill'];
    execFile(config.adbPath, target, (err, stdout, stderr) => {
      resolve({
        success: !err,
        output: stdout || stderr || 'Kill signal sent.'
      });
    });
  });
}

module.exports = {
  listAvds,
  startEmulator,
  stopEmulator
};
