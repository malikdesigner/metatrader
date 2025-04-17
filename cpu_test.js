// cpu-test.js
const { spawn } = require('child_process');

// Config
const BASE_COMMAND = 'node';
const SCRIPT_PATH = 'index_session.js';
const ACCOUNT = '22054594';
const PASSWORD = 'Demodemo8#';
const PARAMETER = 'forex';
const NUM_PROCESSES = 25;
const MAX_CONCURRENT = 25; 
const DELAY_BETWEEN_STARTS = 60000; // 60 seconds delay between process starts

let activeProcesses = 0;
let currentIndex = 0;

const processes = [];

function runScript(processId) {
  console.log(`▶️ Starting process ${processId}...`);
  activeProcesses++;

  const proc = spawn(BASE_COMMAND, [
    SCRIPT_PATH,
    ACCOUNT,
    PASSWORD,
    PARAMETER
  ]);

  processes.push(proc);

  proc.stdout.on('data', (data) => {
    console.log(`[Process ${processId}] ${data.toString().trim()}`);
  });

  proc.stderr.on('data', (data) => {
    console.error(`[Process ${processId} ERROR] ${data.toString().trim()}`);
  });

  proc.on('close', (code) => {
    console.log(`❌ Process ${processId} exited with code ${code}`);
    activeProcesses--;
    // Don't automatically start next process on close
    // We're using the timed approach instead
  });
}

// Run next if available with delay
function startNextProcess() {
  if (currentIndex >= NUM_PROCESSES) {
    console.log('✅ All processes have been started.');
    return;
  }

  if (activeProcesses < MAX_CONCURRENT) {
    currentIndex++;
    runScript(currentIndex);
    
    // Schedule the next process start after delay
    setTimeout(() => {
      startNextProcess();
    }, DELAY_BETWEEN_STARTS);
  } else {
    // If we've hit the concurrent limit, check again after delay
    setTimeout(() => {
      startNextProcess();
    }, DELAY_BETWEEN_STARTS);
  }
}

console.log(`💡 Queue started: Running up to ${MAX_CONCURRENT} processes with ${DELAY_BETWEEN_STARTS/1000} second delay between starts.`);

// Start the first process
startNextProcess();

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('🛑 Terminating all processes...');
  processes.forEach(proc => {
    proc.kill();
  });
  process.exit(0);
});