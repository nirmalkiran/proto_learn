import express from "express";
import cors from "cors";
import { exec } from "child_process";
import path from "path";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

/**
 * =====================================================
 * 🔹 DYNAMIC ANDROID SDK DETECTION (NO HARD CODING)
 * =====================================================
 */
const ANDROID_SDK =
  process.env.ANDROID_SDK_ROOT ||
  process.env.ANDROID_HOME ||
  null;

if (!ANDROID_SDK) {
  console.error("ANDROID_SDK_ROOT or ANDROID_HOME not set");
}

const PLATFORM_TOOLS  = ANDROID_SDK
  ? `"${path.join(ANDROID_SDK, "platform-tools", "adb.exe")}"`
  : null;

const EMULATOR_PATH = ANDROID_SDK
  ? `"${path.join(ANDROID_SDK, "emulator", "emulator.exe")}"`
  : null;
function run(command, res) {
  exec(
    command,
    {
      shell: true,
      env: {
        ...process.env,
        PATH: PLATFORM_TOOLS
          ? `${PLATFORM_TOOLS};${process.env.PATH}`
          : process.env.PATH,
      },
    },
    (error, stdout, stderr) => {
      if (error) {
        return res.json({
          success: false,
          error: stderr || error.message,
        });
      }

      return res.json({
        success: true,
        output: stdout.trim(),
      });
    }
  );
}

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    androidSdkDetected: Boolean(ANDROID_SDK),
  });
});


app.post("/terminal", (req, res) => {
  const { command } = req.body;

  if (!command) {
    return res.json({ success: false, error: "No command provided" });
  }


  if (command.startsWith("appium:")) {
    const action = command.split(":")[1];

    if (action === "status") {
      exec("appium --version", (err, stdout) => {
        if (err) {
          return res.json({
            success: false,
            error: "Appium not found in PATH",
          });
        }
        return res.json({
          success: true,
          output: `Appium installed \n Version: ${stdout.trim()}`,
        });
      });
      return;
    }

    if (action === "start") {
      exec(
        "appium --address 127.0.0.1 --port 4723 --base-path /wd/hub",
        () => {
          return res.json({
            success: true,
            output:
              "Appium server started at http://127.0.0.1:4723/wd/hub",
          });
        }
      );
      return;
    }
  }


  if (command.startsWith("adb")) {
    if (!ADB_PATH) {
      return res.json({
        success: false,
        error:
          "ANDROID_SDK_ROOT / ANDROID_HOME not set. Cannot find adb.",
      });
    }

    const adbCommand = command.replace("adb", PLATFORM_TOOLS || "adb");
    exec(adbCommand, (err, stdout, stderr) => {
      if (err) {
        return res.json({
          success: false,
          error: stderr || err.message,
        });
      }
      return res.json({ success: true, output: stdout });
    });
    return;
  }
  if (command === "adb shell pm list packages") {
    return run("adb shell pm list packages", res);
  }

  if (command === "adb shell dumpsys window") {
    return run("adb shell dumpsys window", res);
  }

  if (command.startsWith("emulator")) {
    if (!EMULATOR_PATH) {
      return res.json({
        success: false,
        error:
          "ANDROID_SDK_ROOT / ANDROID_HOME not set. Cannot start emulator.",
      });
    }

    const avdName = command.split(" ")[1];
    if (!avdName) {
      return res.json({
        success: false,
        error: "AVD name missing. Use: emulator <avd_name>",
      });
    }

    exec(`${EMULATOR_PATH} -avd ${avdName}`, () => {
      return res.json({
        success: true,
        output: `Emulator ${avdName} starting...`,
      });
    });
    return;
  }

  
  exec(command, (err, stdout, stderr) => {
    if (err) {
      return res.json({ success: false, error: stderr || err.message });
    }
    return res.json({ success: true, output: stdout });
  });
});

app.listen(PORT, () => {
  console.log(
    `Mobile Automation Helper running at http://localhost:${PORT}`
  );
});
