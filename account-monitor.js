const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'u799514067_account',
  port: process.env.DB_PORT || 3306
};

// Track running processes and retry counts
const processes = new Map();
const retryCount = new Map();

// Retry limit before skipping restart temporarily
const MAX_RETRIES = 5;

// Create database connection pool
let pool;

// Initialize database connection
async function initDb() {
  pool = mysql.createPool(dbConfig);
  try {
    await pool.query('SELECT 1');
    console.log('✅ Database connection successful');
    return true;
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    return false;
  }
}

// Load connected accounts from DB
async function loadAccountsFromDB() {
  try {
    const [rows] = await pool.execute(
      `SELECT account_number as username, password, server 
       FROM user_proc_demo_accounts 
       WHERE account_status IN ('connected')`
    );
    console.log(`🔍 Found ${rows.length} accounts: ${rows.map(a => a.username).join(', ')}`);
    return rows;
  } catch (error) {
    console.error('❌ Error loading accounts:', error.message);
    return [];
  }
}

// Start script for an account
function runScript(account) {
  const { username, password, server } = account;

  // Prevent duplicate
  if (processes.has(username)) {
    return;
  }

  // Retry limit check
  const retries = retryCount.get(username) || 0;
  if (retries >= MAX_RETRIES) {
    console.warn(`⚠️ [${username}] Max retries reached. Skipping for now.`);
    return;
  }

  console.log(`🚀 [${username}] Starting script...`);

  // Setup log stream
  const logStream = fs.createWriteStream(path.join(logDir, `${username}.log`), { flags: 'a' });

  const child = spawn('node', ['index_session.js', username, password, server], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  processes.set(username, child);

  child.on('exit', (code) => {
    console.log(`❌ [${username}] Exited with code ${code}`);
    processes.delete(username);

    const currentRetries = (retryCount.get(username) || 0) + 1;
    retryCount.set(username, currentRetries);
    console.log(`🔁 [${username}] Retrying in 3 seconds (Attempt ${currentRetries}/${MAX_RETRIES})...`);
    setTimeout(() => runScript(account), 3000);
  });

  child.on('error', (err) => {
    console.error(`❌ [${username}] Spawn error: ${err.message}`);
    processes.delete(username);

    const currentRetries = (retryCount.get(username) || 0) + 1;
    retryCount.set(username, currentRetries);
    console.log(`🔁 [${username}] Retry in 10 seconds (Attempt ${currentRetries}/${MAX_RETRIES})...`);
    setTimeout(() => runScript(account), 10000);
  });
}

// Start initial processes
async function startAllScripts() {
  const accounts = await loadAccountsFromDB();
  accounts.forEach(runScript);
  return accounts.length;
}

// Check for new/removed accounts and handle accordingly
async function checkForNewAccounts() {
  const accounts = await loadAccountsFromDB();
  let newProcesses = 0;

  const dbUsernames = accounts.map(a => a.username);

  // Start new accounts
  accounts.forEach(account => {
    if (!processes.has(account.username)) {
      console.log(`🆕 [${account.username}] New account detected. Launching...`);
      runScript(account);
      newProcesses++;
    }
  });

  // Stop removed accounts
  for (const username of processes.keys()) {
    if (!dbUsernames.includes(username)) {
      console.log(`🛑 [${username}] Account removed. Stopping process...`);
      const child = processes.get(username);
      if (child) {
        child.kill();
        processes.delete(username);
        retryCount.delete(username);
      }
    }
  }

  return newProcesses;
}

// Main function
async function main() {
  console.log('🟢 Account monitor starting...');

  if (!await initDb()) {
    console.error('❌ Exiting due to DB failure.');
    process.exit(1);
  }

  const initialCount = await startAllScripts();
  console.log(`✅ Started ${initialCount} scripts initially.`);

  // Check for new/removed accounts every 30 seconds
  setInterval(async () => {
    console.log('🔄 Checking for new/removed accounts...');
    const count = await checkForNewAccounts();
    if (count > 0) {
      console.log(`✅ Started ${count} new processes`);
    } else {
      console.log('✅ No new accounts found');
    }
  }, 30000);

  // Ensure all required processes are running every 10s
  setInterval(async () => {
    const accounts = await loadAccountsFromDB();
    accounts.forEach(account => {
      if (!processes.has(account.username)) {
        console.log(`🔁 [${account.username}] Restarting stopped process...`);
        runScript(account);
      }
    });
  }, 10000);

  // Status report every 5 minutes
  setInterval(() => {
    console.log(`📊 Status: ${processes.size} active processes`);
    for (const [username, process] of processes) {
      console.log(`- ${username} (PID: ${process.pid})`);
    }
  }, 5 * 60 * 1000);

  console.log('✅ Monitor is running. Press Ctrl+C to stop.');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');

  for (const [username, child] of processes) {
    console.log(`Terminating ${username}...`);
    child.kill();
  }

  if (pool) {
    await pool.end();
    console.log('🔒 DB connection closed.');
  }

  console.log('👋 Shutdown complete.');
  process.exit(0);
});

// Run the monitor
main().catch(err => {
  console.error('🔥 Fatal error:', err);
  if (pool) pool.end();
  process.exit(1);
});
