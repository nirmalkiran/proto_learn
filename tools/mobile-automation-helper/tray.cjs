const { app, Tray, Menu } = require("electron");
const { spawn, exec } = require("child_process");
const path = require("path");
const http = require("http");

let tray = null;
let serverProcess = null;
let statusTimer = null;

// Prevent multiple instances and hide dock icon
app.setActivationPolicy('accessory');
app.dock?.hide();

// Prevent window creation and focus
app.on('window-all-closed', () => {
  // Don't quit when all windows are closed - keep running in tray
});

app.on('activate', () => {
  // Don't create windows on activation
});

   ICON PATHS
===================================================== */

const ICONS = {
  green: path.join(__dirname, "tray-icon.png"),
  red: path.join(__dirname, "tray-icon.png"),
  yellow: path.join(__dirname, "tray-icon.png"),
};

/* =====================================================
   SERVER CONTROL
===================================================== */

function startServer() {
  if (serverProcess) {
    console.log("Server already running");
    return;
  }

  console.log("Starting server in background...");
  serverProcess = spawn("node", ["server.js"], {
    cwd: __dirname,
    detached: true,
    stdio: "ignore",
    windowsHide: true, // Hide console window on Windows
  });

  serverProcess.on('error', (err) => {
    console.error("Server start error:", err);
    serverProcess = null;
  });

  serverProcess.on('exit', (code) => {
    console.log("Server exited with code:", code);
    serverProcess = null;
  });

  serverProcess.unref();
}

function stopServer() {
  if (serverProcess) {
    console.log("Stopping server...");
    try {
      serverProcess.kill();
      serverProcess = null;
      console.log("Server stopped");
    } catch (error) {
      console.error("Error stopping server:", error);
      serverProcess = null;
    }
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
      if (tray) {
        tray.setImage(ICONS.green);
        tray.setToolTip("Mobile Automation Agent • Ready");
      }
      return;
    }

    if (health?.status) {
      if (tray) {
        tray.setImage(ICONS.red);
        tray.setToolTip("Mobile Automation Agent • No Device Connected");
      }
      return;
    }

    if (tray) {
      tray.setImage(ICONS.yellow);
      tray.setToolTip("Mobile Automation Agent • Agent Offline");
    }
  } catch (error) {
    console.log("Status check failed:", error.message);
    if (tray) {
      tray.setImage(ICONS.yellow);
      tray.setToolTip("Mobile Automation Agent • Starting...");
    }
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
  setTimeout(checkStatus, 2000);

  // Re-check every 5 seconds
  statusTimer = setInterval(checkStatus, 5000);
});
