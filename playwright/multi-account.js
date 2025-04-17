// multi-account.js
// This script is used to run multiple MT5 accounts in a single browser instance

const { runSharedBrowser } = require('./shared-browser');

// Default configuration
const DEFAULT_CONFIG = {
  accounts: [
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" },
    { username: "22054594", password: "Demodemo8#", server: "forex" }
    // Add more accounts here as needed
  ],
  apiEndpoint: "http://localhost/forex/index.php", // Your API endpoint
  interval: 30000 // Check every 30 seconds
};

// Command line arguments
const args = process.argv.slice(2);
let numInstances = args[0] ? parseInt(args[0]) : 25;

// Create accounts array based on the number of instances requested
// For demonstration purposes, we're using the same credentials multiple times
// In production, you would use different account credentials
const accounts = [];
for (let i = 0; i < numInstances; i++) {
  accounts.push({
    username: DEFAULT_CONFIG.accounts[0].username,
    password: DEFAULT_CONFIG.accounts[0].password,
    server: DEFAULT_CONFIG.accounts[0].server
  });
}

console.log(`🚀 Starting shared browser for ${accounts.length} MT5 accounts`);

// Run the shared browser with all accounts
runSharedBrowser(accounts, DEFAULT_CONFIG.apiEndpoint, DEFAULT_CONFIG.interval)
  .catch(error => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });