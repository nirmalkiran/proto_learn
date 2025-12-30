import { execSync } from "child_process";

function check(cmd, name) {
  try {
    execSync(cmd, { stdio: "ignore" });
    console.log(`${name} available`);
    return true;
  } catch {
    console.error(`${name} NOT available`);
    return false;
  }
}

console.log("Checking Mobile Automation prerequisites...\n");

const results = [
  check("node -v", "Node.js"),
  check("adb version", "ADB"),
  check("emulator -version", "Android Emulator"),
  check("appium --version", "Appium"),
];

if (results.includes(false)) {
  console.error("\nFix the above issues before running agent");
  process.exit(1);
}

console.log("\nAll prerequisites satisfied\n");
