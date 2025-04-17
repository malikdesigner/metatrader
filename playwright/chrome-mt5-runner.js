const { runMultipleProcesses, shutdown } = require('./shared-chrome-mt5.js');

// Configuration
const ACCOUNT = '22054594';
const PASSWORD = 'Demodemo8#';
const DEFAULT_SERVER = 'forex';
const NUM_PROCESSES = 25;
const MAX_CONCURRENT = 25;

// Build the array of account configurations
const buildAccountConfigs = (count, baseAccount, basePassword, baseServer) => {
  const accounts = [];
  
  for (let i = 0; i < count; i++) {
    accounts.push({
      username: baseAccount,
      password: basePassword,
      server: baseServer,
      interval: 30000 + (Math.random() * 10000), // Randomize intervals slightly to prevent synchronized requests
    });
  }
  
  return accounts;
};

// Main function
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════╗
║ MT5 Monitoring - Shared Chrome Browser Edition     ║
║ Running ${NUM_PROCESSES} processes with max ${MAX_CONCURRENT} concurrent ║
╚═══════════════════════════════════════════════════╝
  `);

  try {
    const accounts = buildAccountConfigs(NUM_PROCESSES, ACCOUNT, PASSWORD, DEFAULT_SERVER);
    
    console.log(`Starting ${accounts.length} monitoring processes...`);
    const activeProcesses = await runMultipleProcesses(accounts, MAX_CONCURRENT);
    
    // Setup health reporting
    const healthInterval = setInterval(() => {
      console.log(`
Health Report [${new Date().toISOString()}]
Active Processes: ${activeProcesses.size}/${MAX_CONCURRENT}
Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
      `);
    }, 60000); // Report every minute
    
    // Cleanup for graceful shutdown
    const cleanup = async () => {
      clearInterval(healthInterval);
      await shutdown();
    };
    
    process.on('SIGINT', async () => {
      console.log('\nReceived SIGINT. Cleaning up...');
      await cleanup();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('\nReceived SIGTERM. Cleaning up...');
      await cleanup();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Fatal error:', error);
    await shutdown();
    process.exit(1);
  }
}

// Run the main function
main().catch(err => {
  console.error('Unhandled error in main:', err);
  shutdown().then(() => process.exit(1));
});