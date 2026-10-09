// State
let state = {
  devices: [],
  avds: [],
  selectedSerial: '',
  selectedAvd: '',
  currentApk: null,
  activePackage: '',
  activeActivity: '',
  logs: [],
  logCount: 0,
  maxLogs: 1500,
  autoScroll: true,
  filterLevel: '',
  filterText: '',
  filterAppOnly: true,
  ws: null
};

// DOM Elements
const deviceSelect = document.getElementById('deviceSelect');
const deviceStatusDot = document.getElementById('deviceStatusDot');
const deviceBadge = document.getElementById('deviceBadge');
const specModel = document.getElementById('specModel');
const specVersion = document.getElementById('specVersion');
const specSerial = document.getElementById('specSerial');
const specBattery = document.getElementById('specBattery');

const btnLaunchEmulator = document.getElementById('btnLaunchEmulator');
const btnStopEmulator = document.getElementById('btnStopEmulator');
const btnRefresh = document.getElementById('btnRefresh');

const apkDropzone = document.getElementById('apkDropzone');
const apkFileInput = document.getElementById('apkFileInput');
const btnBrowseApk = document.getElementById('btnBrowseApk');
const uploadProgressContainer = document.getElementById('uploadProgressContainer');
const uploadProgressFill = document.getElementById('uploadProgressFill');
const uploadProgressText = document.getElementById('uploadProgressText');

const apkDetailsPanel = document.getElementById('apkDetailsPanel');
const apkAppName = document.getElementById('apkAppName');
const apkPackageName = document.getElementById('apkPackageName');
const apkVersion = document.getElementById('apkVersion');
const apkSize = document.getElementById('apkSize');
const apkSdk = document.getElementById('apkSdk');
const apkActivity = document.getElementById('apkActivity');

const btnInstallLaunch = document.getElementById('btnInstallLaunch');
const btnRestartApp = document.getElementById('btnRestartApp');
const btnClearData = document.getElementById('btnClearData');
const btnForceStop = document.getElementById('btnForceStop');
const btnUninstall = document.getElementById('btnUninstall');

const btnTakeScreenshot = document.getElementById('btnTakeScreenshot');
const inputSendText = document.getElementById('inputSendText');
const btnSendText = document.getElementById('btnSendText');

const logcatConsole = document.getElementById('logcatConsole');
const logLevelSelect = document.getElementById('logLevelSelect');
const toggleAppOnlyFilter = document.getElementById('toggleAppOnlyFilter');
const logSearchInput = document.getElementById('logSearchInput');
const btnClearLogs = document.getElementById('btnClearLogs');
const btnExportLogs = document.getElementById('btnExportLogs');
const toggleAutoScroll = document.getElementById('toggleAutoScroll');
const logCountText = document.getElementById('logCountText');
const crashAlertBanner = document.getElementById('crashAlertBanner');
const crashSummary = document.getElementById('crashSummary');
const btnDismissCrash = document.getElementById('btnDismissCrash');

// Toast Notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ---------------- INITIALIZATION & STATUS ----------------
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (!data.success) return;

    state.devices = data.devices || [];
    state.avds = data.avds || [];

    updateDeviceDropdown();
    updateDeviceSpecs();
  } catch (err) {
    console.error('Failed to fetch status:', err);
  }
}

function updateDeviceDropdown() {
  deviceSelect.innerHTML = '';

  if (state.devices.length === 0) {
    deviceStatusDot.className = 'status-indicator offline';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = state.avds.length > 0 
      ? `No device online (${state.avds.length} AVD available)` 
      : 'No devices or emulators found';
    deviceSelect.appendChild(opt);
    state.selectedSerial = '';
    deviceBadge.textContent = 'Offline';
    deviceBadge.className = 'badge';
    return;
  }

  state.devices.forEach((dev) => {
    const opt = document.createElement('option');
    opt.value = dev.serial;
    const typeLabel = dev.isEmulator ? 'AVD' : 'Physical';
    opt.textContent = `[${dev.status.toUpperCase()}] ${dev.model} (${dev.serial}) - ${typeLabel}`;
    deviceSelect.appendChild(opt);
  });

  // Keep selection or pick first ready device
  const currentExists = state.devices.find(d => d.serial === state.selectedSerial);
  if (!currentExists) {
    const readyDev = state.devices.find(d => d.isReady) || state.devices[0];
    state.selectedSerial = readyDev.serial;
  }
  deviceSelect.value = state.selectedSerial;

  const currentDev = state.devices.find(d => d.serial === state.selectedSerial);
  if (currentDev && currentDev.isReady) {
    deviceStatusDot.className = 'status-indicator online';
    deviceBadge.textContent = 'Online';
    deviceBadge.className = 'badge badge-accent';
  } else {
    deviceStatusDot.className = 'status-indicator offline';
    deviceBadge.textContent = currentDev ? currentDev.status : 'Offline';
    deviceBadge.className = 'badge';
  }
}

function updateDeviceSpecs() {
  const currentDev = state.devices.find(d => d.serial === state.selectedSerial);
  if (!currentDev || !currentDev.isReady) {
    specModel.textContent = '-';
    specVersion.textContent = '-';
    specSerial.textContent = currentDev ? currentDev.serial : '-';
    specBattery.textContent = '-';
    return;
  }

  specModel.textContent = currentDev.model || 'Pixel';
  specVersion.textContent = currentDev.androidVersion ? `Android ${currentDev.androidVersion}` : 'Ready';
  specSerial.textContent = currentDev.serial;
  specBattery.textContent = currentDev.batteryLevel !== undefined ? `${currentDev.batteryLevel}%` : 'AC Powered';
}

deviceSelect.addEventListener('change', () => {
  state.selectedSerial = deviceSelect.value;
  updateDeviceSpecs();
  restartLogcat();
});

// ---------------- EMULATOR CONTROLS ----------------
btnLaunchEmulator.addEventListener('click', async () => {
  const avdToLaunch = state.avds[0] || 'Pixel_8';
  btnLaunchEmulator.disabled = true;
  btnLaunchEmulator.innerHTML = `<span class="spinner">⏳</span> Launching...`;

  try {
    const res = await fetch('/api/emulator/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avdName: avdToLaunch, gpuHost: true })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Starting emulator "${avdToLaunch}"...`, 'info');
      setTimeout(fetchStatus, 3000);
      setTimeout(fetchStatus, 8000);
      setTimeout(fetchStatus, 15000);
    } else {
      showToast(data.error || 'Failed to start emulator', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnLaunchEmulator.disabled = false;
    btnLaunchEmulator.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Launch AVD`;
  }
});

btnStopEmulator.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to stop the running Android emulator?')) return;
  try {
    const res = await fetch('/api/emulator/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial: state.selectedSerial })
    });
    const data = await res.json();
    showToast('Emulator shutdown signal sent.', 'info');
    setTimeout(fetchStatus, 2000);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

btnRefresh.addEventListener('click', async () => {
  showToast('Refreshing devices and restarting ADB...', 'info');
  await fetch('/api/adb/restart', { method: 'POST' });
  await fetchStatus();
});

// ---------------- APK UPLOAD & DRAG & DROP ----------------
btnBrowseApk.addEventListener('click', (e) => {
  e.stopPropagation();
  apkFileInput.click();
});

apkDropzone.addEventListener('click', () => {
  apkFileInput.click();
});

apkDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  apkDropzone.classList.add('dragover');
});

apkDropzone.addEventListener('dragleave', () => {
  apkDropzone.classList.remove('dragover');
});

apkDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  apkDropzone.classList.remove('dragover');

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleApkFile(files[0]);
  }
});

apkFileInput.addEventListener('change', (e) => {
  if (apkFileInput.files.length > 0) {
    handleApkFile(apkFileInput.files[0]);
  }
});

function handleApkFile(file) {
  if (!file.name.toLowerCase().endsWith('.apk')) {
    showToast('Please select a valid .apk file!', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('apk', file);

  uploadProgressContainer.style.display = 'block';
  uploadProgressFill.style.width = '0%';
  uploadProgressText.textContent = `Uploading ${file.name} (0%)...`;

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload-apk', true);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const pct = Math.round((e.loaded / e.total) * 100);
      uploadProgressFill.style.width = `${pct}%`;
      uploadProgressText.textContent = `Uploading ${pct}% (${(e.loaded / (1024 * 1024)).toFixed(1)} MB)`;
    }
  };

  xhr.onload = () => {
    uploadProgressContainer.style.display = 'none';
    if (xhr.status === 200) {
      const res = JSON.parse(xhr.responseText);
      if (res.success) {
        displayApkDetails(res.file, res.metadata);
        showToast(`APK parsed successfully: ${res.metadata.label || file.name}`, 'success');
      } else {
        showToast(res.error || 'Failed to inspect APK', 'error');
      }
    } else {
      showToast('Error uploading APK to server', 'error');
    }
  };

  xhr.onerror = () => {
    uploadProgressContainer.style.display = 'none';
    showToast('Network error during upload', 'error');
  };

  xhr.send(formData);
}

function displayApkDetails(fileInfo, meta) {
  state.currentApk = {
    filePath: fileInfo.path,
    ...meta
  };
  state.activePackage = meta.packageName || '';
  state.activeActivity = meta.launchableActivity || '';

  apkAppName.textContent = meta.label || fileInfo.originalName;
  apkPackageName.textContent = meta.packageName || 'Unknown package';
  apkVersion.textContent = `${meta.versionName || '1.0'} (Build ${meta.versionCode || '1'})`;
  apkSize.textContent = meta.fileSize || 'N/A';
  apkSdk.textContent = `Min ${meta.minSdk || '21'} / Target ${meta.targetSdk || '34'}`;
  apkActivity.textContent = meta.launchableActivity || 'Default Launcher';

  apkDetailsPanel.style.display = 'block';

  // Update logcat filter if app only is checked
  if (state.filterAppOnly && state.activePackage) {
    updateLogcatFilter();
  }
}

// ---------------- APP ACTIONS ----------------
btnInstallLaunch.addEventListener('click', async () => {
  if (!state.currentApk) return;

  btnInstallLaunch.disabled = true;
  btnInstallLaunch.innerHTML = `<span class="spinner">⏳</span> Installing on device...`;

  try {
    const res = await fetch('/api/install-apk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serial: state.selectedSerial,
        apkPath: state.currentApk.filePath,
        autoLaunch: true,
        packageName: state.activePackage,
        activityName: state.activeActivity
      })
    });
    const data = await res.json();

    if (data.success) {
      showToast(`Installed & launched ${state.currentApk.label}!`, 'success');
    } else {
      showToast(`Install failed: ${data.installResult ? data.installResult.message : data.error}`, 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnInstallLaunch.disabled = false;
    btnInstallLaunch.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Install & Auto-Launch`;
  }
});

btnRestartApp.addEventListener('click', async () => {
  if (!state.activePackage) return;
  await fetch('/api/app/launch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serial: state.selectedSerial,
      packageName: state.activePackage,
      activityName: state.activeActivity
    })
  });
  showToast(`Relaunched ${state.activePackage}`, 'info');
});

btnClearData.addEventListener('click', async () => {
  if (!state.activePackage) return;
  await fetch('/api/app/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serial: state.selectedSerial, packageName: state.activePackage })
  });
  showToast(`Data cleared for ${state.activePackage}`, 'info');
});

btnForceStop.addEventListener('click', async () => {
  if (!state.activePackage) return;
  await fetch('/api/app/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serial: state.selectedSerial, packageName: state.activePackage })
  });
  showToast(`Force stopped ${state.activePackage}`, 'info');
});

btnUninstall.addEventListener('click', async () => {
  if (!state.activePackage) return;
  if (!confirm(`Uninstall ${state.activePackage} from device?`)) return;
  const res = await fetch('/api/app/uninstall', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serial: state.selectedSerial, packageName: state.activePackage })
  });
  const data = await res.json();
  showToast(`Uninstalled ${state.activePackage}`, 'info');
});

// ---------------- DEVICE NAVIGATION & KEYS ----------------
document.querySelectorAll('.nav-btn[data-key]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const keyCode = btn.getAttribute('data-key');
    await fetch('/api/device/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial: state.selectedSerial, keyCode })
    });
  });
});

btnTakeScreenshot.addEventListener('click', async () => {
  btnTakeScreenshot.disabled = true;
  btnTakeScreenshot.textContent = 'Capturing...';
  try {
    const res = await fetch('/api/device/screenshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial: state.selectedSerial })
    });
    const data = await res.json();
    if (data.success && data.url) {
      showToast('Screenshot saved! Opening in new tab...', 'success');
      window.open(data.url, '_blank');
    } else {
      showToast('Failed to take screenshot', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btnTakeScreenshot.disabled = false;
    btnTakeScreenshot.textContent = '📸 Screenshot';
  }
});

btnSendText.addEventListener('click', sendKeyboardText);
inputSendText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendKeyboardText();
});

async function sendKeyboardText() {
  const text = inputSendText.value;
  if (!text) return;
  await fetch('/api/device/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serial: state.selectedSerial, text })
  });
  inputSendText.value = '';
  showToast('Text injected into Android field', 'info');
}

// ---------------- REAL-TIME LOGCAT & CRASH MONITOR ----------------
function initLogcatWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    restartLogcat();
  };

  state.ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'logcat' && msg.data) {
        appendLog(msg.data);
      }
    } catch (_) {}
  };

  state.ws.onclose = () => {
    setTimeout(initLogcatWebSocket, 3000);
  };
}

function restartLogcat() {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;

  const filter = (state.filterAppOnly && state.activePackage) ? state.activePackage : state.filterText;
  state.ws.send(JSON.stringify({
    type: 'start_logcat',
    serial: state.selectedSerial,
    filter,
    minLevel: state.filterLevel
  }));
}

function updateLogcatFilter() {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  const filter = (state.filterAppOnly && state.activePackage) ? state.activePackage : state.filterText;
  state.ws.send(JSON.stringify({
    type: 'update_filter',
    filter,
    minLevel: state.filterLevel
  }));
}

function appendLog(log) {
  // Check crash condition
  if (log.isCrash) {
    showCrashAlert(log);
  }

  // Remove placeholder if present
  const placeholder = logcatConsole.querySelector('.log-placeholder');
  if (placeholder) placeholder.remove();

  const entry = document.createElement('div');
  entry.className = `log-entry ${log.isCrash ? 'crash-highlight' : ''}`;
  entry.innerHTML = `
    <span class="log-time">${log.timestamp}</span>
    <span class="log-level level-${log.level}">${log.level[0]}</span>
    <span class="log-tag">[${escapeHtml(log.tag)}]</span>
    <span class="log-msg">${escapeHtml(log.message)}</span>
  `;

  logcatConsole.appendChild(entry);
  state.logCount++;
  logCountText.textContent = `${state.logCount} lines`;

  // Trim old logs to maintain performance
  if (logcatConsole.children.length > state.maxLogs) {
    logcatConsole.removeChild(logcatConsole.firstElementChild);
  }

  if (state.autoScroll) {
    logcatConsole.scrollTop = logcatConsole.scrollHeight;
  }
}

function showCrashAlert(log) {
  crashAlertBanner.style.display = 'flex';
  crashSummary.textContent = `${log.tag}: ${log.message.slice(0, 100)}...`;
}

btnDismissCrash.addEventListener('click', () => {
  crashAlertBanner.style.display = 'none';
});

btnClearLogs.addEventListener('click', () => {
  logcatConsole.innerHTML = '<div class="log-placeholder">Console logs cleared.</div>';
  state.logCount = 0;
  logCountText.textContent = '0 lines';
});

btnExportLogs.addEventListener('click', () => {
  const text = Array.from(logcatConsole.querySelectorAll('.log-entry'))
    .map(el => el.innerText)
    .join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `logcat_${state.activePackage || 'dump'}_${Date.now()}.txt`;
  a.click();
});

logLevelSelect.addEventListener('change', () => {
  state.filterLevel = logLevelSelect.value;
  updateLogcatFilter();
});

toggleAppOnlyFilter.addEventListener('change', () => {
  state.filterAppOnly = toggleAppOnlyFilter.checked;
  updateLogcatFilter();
});

logSearchInput.addEventListener('input', (e) => {
  state.filterText = e.target.value.trim();
  updateLogcatFilter();
});

toggleAutoScroll.addEventListener('change', () => {
  state.autoScroll = toggleAutoScroll.checked;
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------- AUTO POLLING & STARTUP ----------------
fetchStatus();
initLogcatWebSocket();
setInterval(fetchStatus, 5000);
