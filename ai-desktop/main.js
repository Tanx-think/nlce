const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { exec } = require('child_process');
const path = require('path');

const EDA_PROCESS_NAME = 'lceda-pro.exe';
const POLL_INTERVAL = 2000;

let mainWindow = null;
let isExpanded = false;
let edaWasRunning = false;

// 拖动状态
let dragging = false;
let dragInterval = null;
let lastCursor = { x: 0, y: 0 };

function createWindow() {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 64,
    height: 64,
    x: screenWidth - 100,
    y: 200,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('app.html');

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function checkEdaRunning() {
  return new Promise((resolve) => {
    const cmd = `tasklist /FI "IMAGENAME eq ${EDA_PROCESS_NAME}"`;
    exec(cmd, (err, stdout) => {
      if (err) return resolve(false);
      resolve(stdout.toLowerCase().includes(EDA_PROCESS_NAME.toLowerCase()));
    });
  });
}

function startPolling() {
  setInterval(async () => {
    const isRunning = await checkEdaRunning();

    if (isRunning && !edaWasRunning) {
      console.log('检测到 EDA 启动，显示悬浮球');
      edaWasRunning = true;
      if (mainWindow && !isExpanded) mainWindow.show();
    } else if (!isRunning && edaWasRunning) {
      console.log('检测到 EDA 关闭，隐藏悬浮球');
      edaWasRunning = false;
      if (mainWindow) mainWindow.hide();
    }
  }, POLL_INTERVAL);
}

// 切换展开/收起
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

// ⭐ 开始拖动
ipcMain.handle('drag-start', () => {
  console.log('drag-start');
  if (!mainWindow) return;
  dragging = true;
  lastCursor = screen.getCursorScreenPoint();

  if (dragInterval) clearInterval(dragInterval);
  dragInterval = setInterval(() => {
    if (!dragging || !mainWindow) return;

    const cursor = screen.getCursorScreenPoint();
    const dx = cursor.x - lastCursor.x;
    const dy = cursor.y - lastCursor.y;

    if (dx !== 0 || dy !== 0) {
      const [x, y] = mainWindow.getPosition();
      mainWindow.setPosition(x + dx, y + dy);
      lastCursor = cursor;
    }
  }, 10);
});

// ⭐ 结束拖动
ipcMain.handle('drag-end', () => {
  console.log('drag-end');
  dragging = false;
  if (dragInterval) {
    clearInterval(dragInterval);
    dragInterval = null;
  }
});

ipcMain.handle('quit-app', () => {
  app.isQuitting = true;
  app.quit();
});

app.whenReady().then(() => {
  createWindow();
  startPolling();

  checkEdaRunning().then((running) => {
    if (running) {
      edaWasRunning = true;
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});