const { app, Tray, Menu } = require("electron");
const { spawn, exec } = require("child_process");
const path = require("path");
const http = require("http");

let tray = null;
let serverProcess = null;
let statusTimer = null;

/* =====================================================
   ICON PATHS
===================================================== */

const ICONS = {
  green: path.join(__dirname, "tray-green.png"),
  red: path.join(__dirname, "tray-red.png"),
  yellow: path.join(__dirname, "tray-yellow.png"),
};

/* =====================================================
   SERVER CONTROL
===================================================== */

function startServer() {
  if (serverProcess) return;

  serverProcess = spawn("node", ["server.js"], {
    cwd: __dirname,
    detached: true,
    stdio: "ignore",
  });

  serverProcess.unref();
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

/* =====================================================
   HTTP HELPERS
===================================================== */

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject();
          }
        });
      })
      .on("error", reject);
  });
}

/* =====================================================
   STATUS CHECK
===================================================== */

async function checkStatus() {
  try {
    const health = await getJSON("http://localhost:3001/health");
    const device = await getJSON("http://localhost:3001/device/check");

    if (health?.status && device?.connected) {
      tray.setImage(ICONS.green);
      tray.setToolTip("Mobile Automation Agent • Ready");
      return;
    }

    tray.setImage(ICONS.red);
    tray.setToolTip("Mobile Automation Agent • No Device Connected");
  } catch {
    tray.setImage(ICONS.yellow);
    tray.setToolTip("Mobile Automation Agent • Starting...");
  }
}

/* =====================================================
   APP INIT
===================================================== */

app.whenReady().then(() => {
  tray = new Tray(ICONS.yellow);

  startServer();

  const menu = Menu.buildFromTemplate([
    { label: "Mobile Automation Agent", enabled: false },
    { type: "separator" },
    {
      label: "Restart Agent",
      click: () => {
        stopServer();
        startServer();
        checkStatus();
      },
    },
    {
      label: "Stop Agent",
      click: () => {
        stopServer();
        tray.setImage(ICONS.red);
      },
    },
    { type: "separator" },
    {
      label: "Exit",
      click: () => {
        clearInterval(statusTimer);
        stopServer();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);

  // Initial check
  setTimeout(checkStatus, 10000);

  // Re-check every 5 seconds
  statusTimer = setInterval(checkStatus, 50000);
});
