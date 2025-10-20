const { spawn } = require("child_process");

const USERNAME = "40055040";
const PASSWORD = "_kZh0lXf";
const TOTAL_INSTANCES = 10; // number of parallel instances

for (let i = 0; i < TOTAL_INSTANCES; i++) {
    const child = spawn("node", ["switch_market_live.js", USERNAME, PASSWORD, '-c'], {
        stdio: ["inherit", "pipe", "pipe"] // optional: you can log outputs
    });

    child.stdout.on("data", (data) => {
        console.log(`[Instance ${i + 1}]`, data.toString());
    });

    child.stderr.on("data", (data) => {
        console.error(`[Instance ${i + 1} ERROR]`, data.toString());
    });

    child.on("close", (code) => {
        console.log(`[Instance ${i + 1}] exited with code ${code}`);
    });
}
