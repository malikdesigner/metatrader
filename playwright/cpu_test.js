const { spawn } = require('child_process');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Config
const BASE_COMMAND = 'node';
const SCRIPT_PATH = 'index_puppeteer2.js'; // Using the updated Puppeteer script

// Define your accounts here
const ACCOUNTS = [
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  // Add as many account objects as needed.
];

console.log(`Prepared ${ACCOUNTS.length} accounts for single browser instance`);

// Create required directories
const screenshotDir = path.join(process.cwd(), "screenshots");
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
  console.log(`Created directory: ${screenshotDir}`);
}

// Save accounts to a temporary file for the Puppeteer script
const accountsFileName = `accounts_${ACCOUNTS.length}tabs.json`;
fs.writeFileSync(accountsFileName, JSON.stringify(ACCOUNTS));

// Set environment variables to be used by index_puppeteer2.js
// NUM_TABS is now set to the exact number of accounts
const env = {
  ...process.env,
  PORT: "9222", // Fixed remote debugging port
  NUM_TABS: String(ACCOUNTS.length),
  ALL_ACCOUNTS: JSON.stringify(ACCOUNTS),
  ACCOUNTS_FILE: accountsFileName,
  PARALLEL_MODE: "true",
  NODE_OPTIONS: "--no-warnings",
};

// Function to launch Chrome with remote debugging enabled
function launchChrome(callback) {
  // Update the Chrome executable path if necessary
  const chromePath = '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"';
  const remoteDebuggingPort = "9222";
  // Use a dedicated user data directory so that existing windows are not affected
  const profileDir = "account_profile";
  const userDataDir = `"C:\\Users\\Malik\\AppData\\Local\\Google\\Chrome\\User Data\\${profileDir}"`;
  // Removed the --new-window flag so that all tabs open in one window
  const chromeLaunchCommand = `${chromePath} --remote-debugging-port=${remoteDebuggingPort} --user-data-dir=${userDataDir} --start-maximized --no-first-run --disable-background-timer-throttling --disable-blink-features=AutomationControlled`;
  
  console.log(`Launching Chrome with command: ${chromeLaunchCommand}`);
  
  exec(chromeLaunchCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error launching Chrome: ${error.message}`);
    } else {
      console.log("Chrome launched successfully!");
    }
    // Wait a bit to let Chrome finish starting on port 9222
    setTimeout(callback, 5000);
  });
}

// Launch Chrome and then start the Puppeteer script
launchChrome(() => {
  console.log(`Launching ${BASE_COMMAND} ${SCRIPT_PATH}`);
  const proc = spawn(BASE_COMMAND, [SCRIPT_PATH], { env, shell: true });
  let runningProcess = proc;
  
  proc.stdout.on('data', (data) => {
    console.log(`[STDOUT] ${data.toString().trim()}`);
  });
  
  proc.stderr.on('data', (data) => {
    const errorOutput = data.toString().trim();
    if (!errorOutput.includes("[MODULE_TYPELESS_PACKAGE_JSON]")) {
      console.error(`[STDERR] ${errorOutput}`);
    }
  });
  
  proc.on('close', (code) => {
    console.log(`❌ Process exited with code ${code}`);
    try {
      fs.unlinkSync(accountsFileName);
    } catch (err) {
      console.error(`Could not delete temporary file: ${err.message}`);
    }
    
    if (code !== 0 && code !== null) {
      console.log(`🔄 Restarting in 5 seconds...`);
      setTimeout(() => {
        launchChrome(() => {
          const restartProc = spawn(BASE_COMMAND, [SCRIPT_PATH], { env, shell: true });
          runningProcess = restartProc;
        });
      }, 5000);
    } else {
      runningProcess = null;
    }
  });
});

console.log(`💡 Started process with ${ACCOUNTS.length} tabs in a single window`);
