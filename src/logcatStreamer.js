const { spawn } = require('child_process');
const config = require('./config');

class LogcatSession {
  constructor(serial, ws, options = {}) {
    this.serial = serial;
    this.ws = ws;
    this.options = options;
    this.process = null;
    this.isAlive = true;
    this.start();
  }

  start() {
    const args = this.serial ? ['-s', this.serial] : [];
    args.push('logcat', '-v', 'time');

    // Filter by level if specified (V, D, I, W, E, F)
    if (this.options.minLevel) {
      args.push(`*:${this.options.minLevel}`);
    }

    try {
      this.process = spawn(config.adbPath, args);

      this.process.stdout.on('data', (chunk) => {
        if (!this.isAlive || this.ws.readyState !== 1) return;
        const text = chunk.toString('utf-8');
        const lines = text.split(/\r?\n/).filter(Boolean);

        for (const line of lines) {
          const parsed = this.parseLine(line);
          if (parsed) {
            // Apply optional keyword or package filter
            if (this.options.filter) {
              const lowerFilter = this.options.filter.toLowerCase();
              if (!line.toLowerCase().includes(lowerFilter)) {
                continue;
              }
            }
            this.ws.send(JSON.stringify({ type: 'logcat', data: parsed }));
          }
        }
      });

      this.process.stderr.on('data', () => {});

      this.process.on('close', () => {
        this.destroy();
      });
    } catch (_) {}
  }

  parseLine(raw) {
    // Android logcat format: MM-DD HH:MM:SS.ms L/Tag(PID): message
    const match = raw.match(/^(\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\s+([VDIWEF])\/([^(]+)\(\s*(\d+)\):\s*(.*)$/);
    if (match) {
      const levelMap = {
        V: 'VERBOSE',
        D: 'DEBUG',
        I: 'INFO',
        W: 'WARN',
        E: 'ERROR',
        F: 'FATAL'
      };
      const level = levelMap[match[2]] || 'INFO';
      const isCrash = raw.includes('FATAL EXCEPTION') || raw.includes('AndroidRuntime') || level === 'FATAL';

      return {
        timestamp: match[1],
        level,
        tag: match[3].trim(),
        pid: match[4],
        message: match[5],
        isCrash,
        raw
      };
    }
    return {
      timestamp: new Date().toLocaleTimeString(),
      level: raw.includes('FATAL') ? 'FATAL' : 'INFO',
      tag: 'System',
      pid: '',
      message: raw,
      isCrash: raw.includes('FATAL') || raw.includes('AndroidRuntime'),
      raw
    };
  }

  updateFilter(filter, minLevel) {
    this.options.filter = filter || '';
    if (minLevel && minLevel !== this.options.minLevel) {
      this.options.minLevel = minLevel;
      this.destroy();
      this.start();
    }
  }

  destroy() {
    this.isAlive = false;
    if (this.process) {
      try {
        this.process.kill();
      } catch (_) {}
      this.process = null;
    }
  }
}

module.exports = { LogcatSession };
