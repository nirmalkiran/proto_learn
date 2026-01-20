import { spawn } from 'child_process';
import path from 'path';

console.log("=== MOBILE AUTOMATION DIAGNOSTIC TOOL ===");
console.log(`Platform: ${process.platform}`);
console.log(`Node Version: ${process.version}`);
console.log(`CWD: ${process.cwd()}`);

const CONFIG = {
    HOST: '127.0.0.1',
    PORT: 4723
};

async function testAppium() {
    console.log("\n--- TEST: STARTING APPIUM ---");

    const command = process.platform === 'win32' ? 'cmd.exe' : 'appium';
    const args = process.platform === 'win32'
        ? ['/c', 'appium', '--address', CONFIG.HOST, '--port', CONFIG.PORT.toString(), '--log-level', 'info']
        : ['--address', CONFIG.HOST, '--port', CONFIG.PORT.toString(), '--log-level', 'info'];

    console.log(`Command: ${command} ${args.join(' ')}`);

    return new Promise((resolve) => {
        const child = spawn(command, args, {
            stdio: 'pipe',
            shell: true
        });

        let output = '';

        child.stdout.on('data', (data) => {
            const line = data.toString().trim();
            console.log(`[APPIUM STDOUT] ${line}`);
            output += line;
            if (line.includes('Appium REST http interface listener started')) {
                console.log("✅ SUCCESS: Appium started successfully!");
                child.kill();
                resolve(true);
            }
        });

        child.stderr.on('data', (data) => {
            console.log(`[APPIUM STDERR] ${data.toString().trim()}`);
        });

        child.on('error', (err) => {
            console.error(`❌ ERROR: Failed to spawn Appium: ${err.message}`);
            resolve(false);
        });

        child.on('close', (code) => {
            console.log(`Appium process exited with code ${code}`);
            resolve(false);
        });

        setTimeout(() => {
            if (!output.includes('started')) {
                console.log("⚠️ TIMEOUT: Appium did not start in 10s");
                child.kill();
                resolve(false);
            }
        }, 10000);
    });
}

async function testEmulator() {
    console.log("\n--- TEST: FINDING EMULATOR ---");
    // Simple check for emulator in path
    const checkCmd = process.platform === 'win32' ? 'where emulator' : 'which emulator';

    const child = spawn(checkCmd, [], { shell: true, stdio: 'pipe' });

    child.stdout.on('data', (data) => console.log(`Emulator path: ${data.toString().trim()}`));
    child.stderr.on('data', (data) => console.log(`Stderr: ${data.toString().trim()}`));
}

(async () => {
    await testEmulator();
    await testAppium();
    console.log("\n=== DIAGNOSTIC COMPLETE ===");
})();
