const mysql = require('mysql2/promise');
const { fork } = require('child_process');
const path = require('path');
const cron = require('node-cron');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');

// Configuration
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'your_database',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const API_ENDPOINT = process.env.API_ENDPOINT || 'http://localhost:3000/api/update-trade';
const POLLING_INTERVAL_SECONDS = parseInt(process.env.POLLING_INTERVAL_SECONDS) || 60;
const ACCOUNT_CHECK_INTERVAL_MINUTES = parseInt(process.env.ACCOUNT_CHECK_INTERVAL_MINUTES) || 5;

// Express app for API endpoints
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Class to manage all account monitors
class AccountManager {
  constructor() {
    this.dbPool = null;
    this.activeProcesses = new Map(); // Map of accountId -> child process
    this.accountStatus = new Map(); // Map of accountId -> status object
  }

  async initialize() {
    console.log('Initializing Account Manager...');
    
    try {
      // Create database connection pool
      this.dbPool = mysql.createPool(DB_CONFIG);
      
      // Test database connection
      const connection = await this.dbPool.getConnection();
      console.log('Database connection established');
      connection.release();
      
      // Create logs directory
      if (!fs.existsSync('logs')) {
        fs.mkdirSync('logs');
      }
      
      // Set up scheduled account check
      this.setupScheduledChecks();
      
      // Initial check for accounts
      await this.checkForNewAccounts();
      
      return true;
    } catch (error) {
      console.error('Failed to initialize Account Manager:', error);
      return false;
    }
  }
  
  setupScheduledChecks() {
    // Schedule regular checks for new accounts
    cron.schedule(`*/${ACCOUNT_CHECK_INTERVAL_MINUTES} * * * *`, () => {
      console.log('Running scheduled check for new accounts...');
      this.checkForNewAccounts().catch(err => {
        console.error('Error during scheduled account check:', err);
      });
    });
  }
  
  async checkForNewAccounts() {
    console.log('Checking for new or changed accounts...');
    
    try {
      // Get all accounts marked as "connected" or "pending" from the database
      const [rows] = await this.dbPool.query(
        "SELECT * FROM user_proc_demo_accounts WHERE status IN ('connected', 'pending')"
      );
      
      console.log(`Found ${rows.length} active accounts in database`);
      
      // Process each account
      for (const account of rows) {
        const accountId = account.id;
        const username = account.username;
        const password = account.password;
        const server = account.broker_type || 'forex';
        
        // If account is already being monitored
        if (this.activeProcesses.has(accountId)) {
          console.log(`Account ${accountId} (${username}) is already being monitored`);
          
          // Update status if account was pending and is now marked as connected
          if (account.status === 'connected' && this.accountStatus.get(accountId)?.status === 'pending') {
            console.log(`Account ${accountId} status changed from pending to connected`);
            this.accountStatus.set(accountId, {
              status: 'connected',
              lastUpdate: new Date(),
              username,
              server
            });
          }
          
          continue;
        }
        
        // Start monitoring for new account
        console.log(`Starting monitor for account ${accountId} (${username})`);
        await this.startAccountMonitor(accountId, username, password, server);
      }
      
      // Check for accounts that are no longer in the database or have been disconnected
      for (const [accountId, process] of this.activeProcesses.entries()) {
        const account = rows.find(a => a.id === accountId);
        
        if (!account) {
          console.log(`Account ${accountId} no longer active in database, stopping monitor`);
          await this.stopAccountMonitor(accountId);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error checking for new accounts:', error);
      return false;
    }
  }
  
  async startAccountMonitor(accountId, username, password, server) {
    try {
      console.log(`Starting monitor process for account ${accountId} (${username})`);
      
      // Create log files
      const logPath = path.join('logs', `account_${accountId}.log`);
      const logStream = fs.createWriteStream(logPath, { flags: 'a' });
      
      // Create child process
      const child = fork(path.join(__dirname, 'account-manager.js'), [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        detached: false
      });
      
      // Pipe stdout and stderr to log file
      child.stdout.pipe(logStream);
      child.stderr.pipe(logStream);
      
      // Send initial configuration to the child process
      child.send({
        type: 'config',
        accountId,
        username,
        password,
        server,
        apiEndpoint: API_ENDPOINT,
        pollingInterval: POLLING_INTERVAL_SECONDS * 1000
      });
      
      // Set up event handlers
      child.on('message', (message) => {
        console.log(`Message from account ${accountId} monitor:`, message);
        
        // Update account status based on messages from child process
        if (message.type === 'status') {
          this.accountStatus.set(accountId, {
            status: message.status,
            lastUpdate: new Date(),
            lastError: message.error || null,
            username,
            server
          });
          
          // Update database status if login failed
          if (message.status === 'error' && message.error && message.error.includes('login')) {
            this.updateAccountStatus(accountId, 'error', message.error);
          }
        }
        
        // Handle trade data updates
        if (message.type === 'data') {
          console.log(`Received trade data from account ${accountId}`);
        }
      });
      
      child.on('error', (error) => {
        console.error(`Error in account ${accountId} monitor:`, error);
        this.accountStatus.set(accountId, {
          status: 'error',
          lastUpdate: new Date(),
          lastError: error.message,
          username,
          server
        });
      });
      
      child.on('exit', (code, signal) => {
        console.log(`Account ${accountId} monitor exited with code ${code} and signal ${signal}`);
        
        // Remove from active processes
        this.activeProcesses.delete(accountId);
        this.accountStatus.set(accountId, {
          status: 'stopped',
          lastUpdate: new Date(),
          lastError: `Process exited with code ${code}`,
          username,
          server
        });
        
        // Close log stream
        logStream.end();
        
        // Restart if exit was unexpected
        if (code !== 0 && !this.isShuttingDown) {
          console.log(`Restarting monitor for account ${accountId}...`);
          setTimeout(() => {
            this.startAccountMonitor(accountId, username, password, server);
          }, 10000); // Wait 10 seconds before restarting
        }
      });
      
      // Store in active processes map
      this.activeProcesses.set(accountId, child);
      
      // Store initial status
      this.accountStatus.set(accountId, {
        status: 'starting',
        lastUpdate: new Date(),
        username,
        server
      });
      
      return true;
    } catch (error) {
      console.error(`Error starting monitor for account ${accountId}:`, error);
      return false;
    }
  }
  
  async stopAccountMonitor(accountId) {
    if (!this.activeProcesses.has(accountId)) {
      console.log(`No active process found for account ${accountId}`);
      return false;
    }
    
    console.log(`Stopping monitor for account ${accountId}`);
    
    const child = this.activeProcesses.get(accountId);
    
    // Send graceful shutdown signal
    child.send({ type: 'shutdown' });
    
    // Give it some time to shut down gracefully
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Force kill if still running
    if (!child.killed) {
      console.log(`Killing process for account ${accountId}`);
      child.kill('SIGTERM');
    }
    
    // Remove from maps
    this.activeProcesses.delete(accountId);
    
    // Update status
    this.accountStatus.set(accountId, {
      status: 'stopped',
      lastUpdate: new Date(),
      ...this.accountStatus.get(accountId)
    });
    
    return true;
  }
  
  async updateAccountStatus(accountId, status, error = null) {
    try {
      let query = 'UPDATE user_proc_demo_accounts SET status = ? WHERE id = ?';
      let params = [status, accountId];
      
      if (error) {
        // Store error in the trade_data column as JSON
        const errorData = JSON.stringify({ success: false, error });
        query = 'UPDATE user_proc_demo_accounts SET status = ?, trade_data = ? WHERE id = ?';
        params = [status, errorData, accountId];
      }
      
      await this.dbPool.query(query, params);
      console.log(`Updated account ${accountId} status to ${status}`);
      return true;
    } catch (error) {
      console.error(`Error updating account ${accountId} status:`, error);
      return false;
    }
  }
  
  getStatus() {
    return {
      activeMonitors: this.activeProcesses.size,
      accounts: Array.from(this.accountStatus.entries()).map(([id, status]) => ({
        id,
        username: status.username,
        server: status.server,
        status: status.status,
        lastUpdate: status.lastUpdate,
        lastError: status.lastError
      }))
    };
  }
  
  async shutdown() {
    console.log('Shutting down Account Manager...');
    this.isShuttingDown = true;
    
    // Stop all monitors
    const shutdownPromises = [];
    for (const accountId of this.activeProcesses.keys()) {
      shutdownPromises.push(this.stopAccountMonitor(accountId));
    }
    
    await Promise.all(shutdownPromises);
    
    // Close database connection
    if (this.dbPool) {
      await this.dbPool.end();
    }
    
    console.log('Account Manager shutdown complete');
  }
}

// Create account manager instance
const accountManager = new AccountManager();

// Set up API routes
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    ...accountManager.getStatus()
  });
});

app.get('/api/accounts', (req, res) => {
  res.json({
    accounts: Array.from(accountManager.accountStatus.entries()).map(([id, status]) => ({
      id,
      username: status.username,
      server: status.server,
      status: status.status,
      lastUpdate: status.lastUpdate,
      lastError: status.lastError
    }))
  });
});

app.post('/api/accounts/:id/restart', async (req, res) => {
  const accountId = parseInt(req.params.id);
  
  try {
    // Get account details from DB
    const [rows] = await accountManager.dbPool.query(
      'SELECT * FROM user_proc_demo_accounts WHERE id = ?',
      [accountId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    
    const account = rows[0];
    
    // Stop existing monitor if running
    if (accountManager.activeProcesses.has(accountId)) {
      await accountManager.stopAccountMonitor(accountId);
    }
    
    // Start new monitor
    const success = await accountManager.startAccountMonitor(
      accountId,
      account.username,
      account.password,
      account.broker_type || 'forex'
    );
    
    res.json({ success, message: success ? 'Monitor restarted' : 'Failed to restart monitor' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/check-accounts', async (req, res) => {
  try {
    const result = await accountManager.checkForNewAccounts();
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('Received shutdown signal');
  await accountManager.shutdown();
  process.exit(0);
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the application
(async function main() {
  try {
    // Initialize account manager
    const initialized = await accountManager.initialize();
    
    if (!initialized) {
      console.error('Failed to initialize. Exiting...');
      process.exit(1);
    }
    
    // Start the API server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Account Manager API server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Critical error:', error);
    process.exit(1);
  }
})();