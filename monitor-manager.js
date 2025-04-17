const { spawn } = require('child_process');
const mysql = require('mysql2/promise'); // Changed from pg to mysql2
const fs = require('fs');
const path = require('path');

// Configure database connection for MySQL instead of PostgreSQL
const dbConfig = {
  // user: process.env.DB_USER || 'u799514067_account',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'u799514067_account',
  // password: process.env.DB_PASSWORD || '6/Djb/]yY[JM',
  user: process.env.DB_USER || 'root',

  password: process.env.DB_PASSWORD || '',

  port: process.env.DB_PORT || 3306,
};

// Create MySQL connection pool
let pool;

async function initializeConnectionPool() {
  try {
    pool = await mysql.createPool(dbConfig);
    console.log('MySQL connection pool initialized');
  } catch (err) {
    console.error('Error initializing MySQL connection pool:', err);
    process.exit(1);
  }
}

// Track running processes
const processes = new Map();

// Cache data for each account
const accountDataCache = new Map();

// Directory for logs
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Function to fetch accounts from database
async function fetchAccounts() {
  try {
    // Using MySQL instead of PostgreSQL syntax
    const [rows] = await pool.query('SELECT id, username, password, server, last_data FROM trading_accounts WHERE active = true');
    
    const accounts = rows.map(row => {
      // Parse last_data if it exists
      if (row.last_data && typeof row.last_data === 'string') {
        try {
          row.last_data = JSON.parse(row.last_data);
        } catch (e) {
          console.error(`Error parsing last_data for account ${row.id}:`, e.message);
          row.last_data = null;
        }
      }
      return row;
    });
    
    return accounts;
  } catch (err) {
    console.error('Error fetching accounts from database:', err);
    return [];
  }
}

// Function to compare trade data before updating
async function shouldUpdateAccount(accountId, newData) {
  try {
    // Get current data from database
    const [rows] = await pool.query('SELECT last_data FROM trading_accounts WHERE id = ?', [accountId]);
    
    if (rows.length === 0) {
      console.log(`[Account ${accountId}] No existing record found, update required`);
      return true;
    }
    
    const currentData = rows[0].last_data ? JSON.parse(rows[0].last_data) : null;
    
    // If no current data exists, update is required
    if (!currentData) {
      console.log(`[Account ${accountId}] No existing data found, update required`);
      return true;
    }
    
    // Compare account info values
    if (JSON.stringify(newData.data.account_info) !== JSON.stringify(currentData.data.account_info)) {
      console.log(`[Account ${accountId}] Account info changed, update required`);
      return true;
    }

    // Compare latest trade info
    if (newData.data.latest_trade && currentData.data.latest_trade) {
      // Check if trade ID has changed (new trade)
      if (newData.data.latest_trade.id !== currentData.data.latest_trade.id) {
        console.log(`[Account ${accountId}] New trade detected (ID changed), update required`);
        return true;
      }
      
      // Check if profit has changed for the same trade
      if (newData.data.latest_trade.Profit !== currentData.data.latest_trade.Profit) {
        console.log(`[Account ${accountId}] Profit changed for trade ${newData.data.latest_trade.id}, update required`);
        return true;
      }
    } else if (newData.data.latest_trade && !currentData.data.latest_trade) {
      // New trade appeared when there was none before
      console.log(`[Account ${accountId}] New trade detected (first trade), update required`);
      return true;
    }

    console.log(`[Account ${accountId}] No significant changes detected, skipping update`);
    return false;
  } catch (err) {
    console.error(`[Account ${accountId}] Error comparing trade data:`, err);
    // In case of error, default to updating to be safe
    return true;
  }
}

// Function to update last_data in database
async function updateAccountData(accountId, data) {
  try {
    // Only update if data has actually changed
    const shouldUpdate = await shouldUpdateAccount(accountId, data);
    
    if (!shouldUpdate) {
      console.log(`[Account ${accountId}] Data unchanged, skipping database update`);
      return false;
    }
    
    // Using MySQL syntax instead of PostgreSQL
    await pool.query(
      'UPDATE trading_accounts SET last_data = ?, last_update = NOW() WHERE id = ?', 
      [JSON.stringify(data), accountId]
    );
    
    console.log(`[Account ${accountId}] Updated last_data in database`);
    return true;
  } catch (err) {
    console.error(`[Account ${accountId}] Error updating last_data in database:`, err);
    return false;
  }
}

// Function to start a script for an account
function runScript(account) {
  const { id, username, password, server, last_data } = account;
  
  // Create log files
  const logFile = fs.createWriteStream(path.join(logsDir, `${id}_${username}.log`), { flags: 'a' });
  const errorLogFile = fs.createWriteStream(path.join(logsDir, `${id}_${username}_error.log`), { flags: 'a' });
  
  if (processes.has(id)) {
    console.log(`[Account ${id}] already running. Skipping...`);
    return;
  }

  console.log(`[Account ${id}] Starting script...`);
  
  // Load last known data into cache if available
  if (last_data) {
    accountDataCache.set(id, last_data);
    console.log(`[Account ${id}] Loaded last known data from database`);
  }

  const apiEndpoint = process.env.API_ENDPOINT || 'http://localhost:3000/api/update-trade';
  const monitorPath = path.join(__dirname, 'account-monitor.js');
  
  const child = spawn('node', [monitorPath, id, username, password, server, apiEndpoint], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']  // Use IPC for communication
  });

  // Set up logging
  child.stdout.pipe(logFile);
  child.stderr.pipe(errorLogFile);
  
  child.stdout.on('data', (data) => {
    const logMessage = data.toString().trim();
    if (logMessage.includes('API response: 200')) {
      console.log(`[Account ${id}] Successfully sent data to API`);
    }
  });

  // Handle IPC messages from child
  child.on('message', async (message) => {
    console.log(`[Account ${id}] Received message from child process:`, message.type);
    
    if (message.type === 'status') {
      console.log(`[Account ${id}] Status update: ${message.status}`);
    }
    
    // Handle data updates from the child process
    if (message.type === 'data') {
      // Use the new comparison function before updating
      const updated = await updateAccountData(id, message.data);
      
      if (updated) {
        accountDataCache.set(id, message.data);
        console.log(`[Account ${id}] Database updated with new data`);
      }
    }
  });

  processes.set(id, child);

  // Watch for script exit
  child.on('exit', (code) => {
    console.log(`[Account ${id}] Script exited with code ${code}`);
    logFile.end();
    errorLogFile.end();
    processes.delete(id);

    // Restart script after delay if not shut down intentionally
    setTimeout(() => {
      // Check if account is still active before restarting
      fetchAccounts().then(accounts => {
        const isStillActive = accounts.some(acc => acc.id === id);
        if (isStillActive) {
          console.log(`[Account ${id}] Restarting after exit...`);
          runScript(account);
        } else {
          console.log(`[Account ${id}] Account no longer active, not restarting`);
        }
      });
    }, 10000); // 10-second delay before restart
  });
}

// Function to gracefully shut down a process
async function shutdownProcess(id) {
  const process = processes.get(id);
  if (!process) return;
  
  console.log(`[Account ${id}] Sending shutdown signal...`);
  
  return new Promise((resolve) => {
    // Set a timeout in case the process doesn't respond to the signal
    const timeout = setTimeout(() => {
      console.log(`[Account ${id}] Shutdown signal timeout, forcing termination`);
      process.kill('SIGKILL');
      processes.delete(id);
      resolve();
    }, 10000);
    
    // Handle normal exit
    process.once('exit', () => {
      clearTimeout(timeout);
      processes.delete(id);
      console.log(`[Account ${id}] Process exited cleanly`);
      resolve();
    });
    
    // Send shutdown signal via IPC
    process.send({ type: 'shutdown' });
  });
}

// Main function to start all scripts
async function startAllScripts() {
  try {
    // Initialize the connection pool first
    await initializeConnectionPool();
    
    const accounts = await fetchAccounts();
    
    if (accounts.length === 0) {
      console.log('No active accounts found in database');
      return;
    }
    
    console.log(`Found ${accounts.length} active accounts`);
    for (const account of accounts) {
      runScript(account);
      // Add short delay between starting processes to avoid CPU spikes
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (err) {
    console.error('Error starting scripts:', err);
  }
}

// Graceful shutdown handler
async function gracefulShutdown() {
  console.log('Shutting down all processes...');
  
  // Shutdown all processes
  const shutdownPromises = [];
  for (const [id, _] of processes) {
    shutdownPromises.push(shutdownProcess(id));
  }
  
  // Wait for all processes to shut down (with timeout)
  await Promise.all(shutdownPromises);
  
  // Close database pool
  if (pool) {
    await pool.end();
    console.log('Database connection pool closed');
  }
  
  console.log('All processes have been shut down');
  process.exit(0);
}

// Handle termination signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start all scripts initially
startAllScripts();

// Periodically check for new/updated accounts
setInterval(async () => {
  console.log('Refreshing account list from database...');
  const accounts = await fetchAccounts();
  
  // Track account IDs for active accounts
  const activeAccountIds = new Set(accounts.map(acc => acc.id));
  
  // Stop processes for accounts that are no longer active
  for (const [id, process] of processes.entries()) {
    if (!activeAccountIds.has(id)) {
      console.log(`[Account ${id}] Account no longer active, shutting down process...`);
      await shutdownProcess(id);
    }
  }
  
  // Start processes for new accounts
  for (const account of accounts) {
    if (!processes.has(account.id)) {
      console.log(`[Account ${account.id}] New or reactivated account detected`);
      runScript(account);
      // Add short delay between starting processes
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}, 60000); // Check every minute