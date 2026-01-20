import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function findPidForPort(port) {
    try {
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
            // Parse line: TCP    0.0.0.0:4723           0.0.0.0:0              LISTENING       12345
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && /^\d+$/.test(pid) && pid !== '0') {
                return pid;
            }
        }
    } catch (e) {
        // Port not in use or command failed
    }
    return null;
}

async function killProcess(pid, name) {
    try {
        console.log(`Killing ${name} (PID: ${pid})...`);
        await execAsync(`taskkill /F /PID ${pid}`);
        console.log(`Killed ${name}`);
    } catch (e) {
        console.log(`Could not kill ${name} (PID: ${pid}): ${e.message.split('\n')[0]}`);
    }
}

async function killByName(name) {
    try {
        await execAsync(`taskkill /F /IM ${name}`);
        console.log(`Killed all instances of ${name}`);
    } catch (e) {
        if (!e.message.includes('not found')) {
            console.log(`No running instances of ${name} found`);
        }
    }
}

async function main() {
    console.log("=== MOBILE AUTOMATION CLEANUP ===");

    // 1. Kill Appium on port 4723
    console.log("\nChecking port 4723 (Appium)...");
    const appiumPid = await findPidForPort(4723);
    if (appiumPid) {
        await killProcess(appiumPid, "Appium/Node");
    } else {
        console.log("Port 4723 is free.");
    }

    // 2. Kill Agent on port 3001
    console.log("\nChecking port 3001 (Agent)...");
    const agentPid = await findPidForPort(3001);
    if (agentPid) {
        await killProcess(agentPid, "Agent/Node");
    } else {
        console.log("Port 3001 is free.");
    }

    // 3. Kill Emulator processes
    console.log("\nCleaning up emulators...");
    await killByName("emulator.exe");
    await killByName("qemu-system-x86_64.exe");

    console.log("\n=== CLEANUP COMPLETE ===");
    console.log("You can now run 'npm start' again!");
}

main();
