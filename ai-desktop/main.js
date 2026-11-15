const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const { exec, execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 🌟 暂时移除单例锁，确保每次双击都能启动
// const gotTheLock = app.requestSingleInstanceLock();
// if (!gotTheLock) { app.quit(); }

const exeDir = app.isPackaged ? path.dirname(app.getPath('exe')) : __dirname;
const baseDir = app.isPackaged ? path.join(exeDir, '..') : path.join(__dirname, '..');
const configPath = path.join(baseDir, 'ai-test', 'config.json');
const serverExePath = app.isPackaged ? path.join(baseDir, 'ai-test', 'bridge-server.exe') : 'node';
const serverJsPath = app.isPackaged ? '' : path.join(baseDir, 'ai-test', 'bridge-server.js');

let mainWindow = null;
let isExpanded = false;
let backendProcess = null;
let edaWasRunning = false;
let dragging = false, dragInterval = null, lastCursor = { x: 0, y: 0 };

function createWindow() {
  // 强制窗口显示在屏幕正中间
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width: 400, height: 600, // 先强制大小
    x: Math.round(sw/2 - 200), y: Math.round(sh/2 - 300), // 居中
    frame: false, transparent: true, resizable: false,
    alwaysOnTop: true, skipTaskbar: false, hasShadow: false, show: true, // 强制显示
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  
  mainWindow.loadFile('app.html');
  
  // 🌟 强制打开 F12 开发者工具，如果有报错你能直接看到
  mainWindow.webContents.openDevTools({ mode: 'detach' });
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });
  
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });
}

function checkEdaRunning() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq lceda-pro.exe"', (err, stdout) => {
      if (err) return resolve(false);
      resolve(stdout.toLowerCase().includes('lceda-pro.exe'));
    });
  });
}

function startPolling() {
  setInterval(async () => {
    const isRunning = await checkEdaRunning();
    if (isRunning && !edaWasRunning) {
      edaWasRunning = true;
      if (mainWindow && !isExpanded) mainWindow.show();
    } else if (!isRunning && edaWasRunning) {
      edaWasRunning = false;
      if (mainWindow) {
        const choice = dialog.showMessageBoxSync(mainWindow, {
          type: 'question', buttons: ['是，退出软件', '否，后台运行'],
          title: 'EDA 已关闭', message: '检测到嘉立创 EDA 已关闭，是否需要退出 NLCE 并清理后台进程？'
        });
        if (choice === 0) { app.isQuitting = true; app.quit(); }
      }
    }
  }, 3000);
}

function startBackend() {
  if (backendProcess) {
    try { execSync(`taskkill /pid ${backendProcess.pid} /T /F`); } catch (e) {}
    backendProcess = null;
  }
  const cwd = app.isPackaged ? path.dirname(serverExePath) : path.dirname(serverJsPath);
  const logPath = path.join(cwd, 'server.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  logStream.write(`\n--- 启动 AI 引擎: ${new Date().toLocaleString()} ---\n`);

  if (app.isPackaged) {
    backendProcess = spawn(serverExePath, [], { cwd, windowsHide: true });
  } else {
    backendProcess = spawn(serverExePath, [serverJsPath], { cwd, windowsHide: true });
  }

  backendProcess.stdout.on('data', (data) => logStream.write(`[Log] ${data.toString()}`));
  backendProcess.stderr.on('data', (data) => logStream.write(`[Err] ${data.toString()}`));
  backendProcess.on('error', (err) => logStream.write(`[Spawn Error] ${err.message}\n`));
  backendProcess.on('close', (code) => logStream.write(`[Exit] 进程退出，代码: ${code}\n`));
}

ipcMain.handle('check-config', async () => {
  if (!fs.existsSync(configPath)) return { ready: false, reason: 'missing' };
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!config.apiKey || !config.apiKey.startsWith('sk-')) return { ready: false, reason: 'empty' };
    return { ready: true, config };
  } catch (e) { return { ready: false, reason: 'error' }; }
});

ipcMain.handle('check-eda', async () => await checkEdaRunning());

ipcMain.handle('save-and-test-config', async (event, configData) => {
  try {
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');
    const res = await fetch(`${configData.baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${configData.apiKey}` },
      body: JSON.stringify({ model: configData.model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 })
    });
    if (res.ok) return { success: true };
    const err = await res.json();
    return { success: false, error: err.error?.message || 'API Key 错误' };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('start-backend', () => { startBackend(); return true; });

ipcMain.handle('resize-window', (event, mode) => {
  if (!mainWindow) return;
  if (mode === 'setup') {
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    mainWindow.setBounds({ x: Math.round(sw/2 - 200), y: Math.round(sh/2 - 300), width: 400, height: 600 });
    mainWindow.show();
  } else if (mode === 'ball') {
    const [x, y] = mainWindow.getPosition();
    mainWindow.setBounds({ x: x + 336, y: y + 536, width: 64, height: 64 });
  }
});

ipcMain.handle('toggle-expand', async (event, expand) => {
  if (!mainWindow) return;
  isExpanded = expand;
  const [x, y] = mainWindow.getPosition();
  if (expand) {
    mainWindow.setBounds({ x: x - 336, y, width: 400, height: 600 });
    mainWindow.webContents.send('view-change', 'chat');
  } else {
    mainWindow.setBounds({ x: x + 336, y, width: 64, height: 64 });
    mainWindow.webContents.send('view-change', 'ball');
  }
});

ipcMain.handle('drag-start', () => {
  if (!mainWindow) return;
  dragging = true;
  lastCursor = screen.getCursorScreenPoint();
  if (dragInterval) clearInterval(dragInterval);
  dragInterval = setInterval(() => {
    if (!dragging || !mainWindow) return;
    const cursor = screen.getCursorScreenPoint();
    const dx = cursor.x - lastCursor.x, dy = cursor.y - lastCursor.y;
    if (dx !== 0 || dy !== 0) {
      const [x, y] = mainWindow.getPosition();
      mainWindow.setPosition(x + dx, y + dy);
      lastCursor = cursor;
    }
  }, 10);
});
ipcMain.handle('drag-end', () => {
  dragging = false;
  if (dragInterval) { clearInterval(dragInterval); dragInterval = null; }
});

ipcMain.handle('quit-app', () => { app.isQuitting = true; app.quit(); });

app.whenReady().then(() => {
  createWindow();
  startPolling();
  checkEdaRunning().then(running => {
    if (running) {
      edaWasRunning = true;
      if (mainWindow && !isExpanded) mainWindow.show();
    }
  });
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('before-quit', () => { 
  app.isQuitting = true; 
  try { execSync(`taskkill /F /IM bridge-server.exe /T`); } catch (e) {}
  try { execSync(`taskkill /F /IM node.exe /T`); } catch (e) {}
});