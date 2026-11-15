const fs = require('fs');
const path = require('path');

const p1 = path.join(__dirname, 'main.js');
const p2 = path.join(__dirname, 'preload.js');
const p3 = path.join(__dirname, 'app.html');

let c1 = fs.readFileSync(p1, 'utf-8');
if (!c1.includes('resize-window')) {
  c1 = c1.replace(
    "ipcMain.handle('toggle-expand'",
    `ipcMain.handle('resize-window', (event, mode) => {
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

ipcMain.handle('toggle-expand'`
  );
  fs.writeFileSync(p1, c1);
  console.log('✅ main.js 已更新');
}

let c2 = fs.readFileSync(p2, 'utf-8');
if (!c2.includes('resizeWindow')) {
  c2 = c2.replace(
    "onViewChange:",
    "resizeWindow: (mode) => ipcRenderer.invoke('resize-window', mode),\n  onViewChange:"
  );
  fs.writeFileSync(p2, c2);
  console.log('✅ preload.js 已更新');
}

let c3 = fs.readFileSync(p3, 'utf-8');
if (!c3.includes('resizeWindow')) {
  c3 = c3.replace(
    "await window.electronAPI.startBackend();\n        document.body.className = 'ball-mode';",
    "await window.electronAPI.startBackend();\n        document.body.className = 'ball-mode';\n        window.electronAPI.resizeWindow('ball');"
  );
  c3 = c3.replace(
    "document.getElementById('setupView').style.display = 'flex';",
    "document.getElementById('setupView').style.display = 'flex';\n        window.electronAPI.resizeWindow('setup');"
  );
  c3 = c3.replace(
    "document.getElementById('ballView').style.display = 'flex';\n           await window.electronAPI.toggleExpand(true);",
    "document.getElementById('ballView').style.display = 'flex';\n           window.electronAPI.resizeWindow('ball');\n           await window.electronAPI.toggleExpand(true);"
  );
  fs.writeFileSync(p3, c3);
  console.log('✅ app.html 已更新');
}

console.log('🎉 所有补丁应用完毕！');