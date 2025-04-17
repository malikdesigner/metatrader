const { spawn } = require('child_process');

// Define your account list
const accounts = [
  { username: '101496969', password: 'llaW3Cu!', server: 'avatrade' },
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '101488416', password: 'Z2zqB_3v', server: 'avatrade' }
];

// Track running processes
const processes = new Map();

// Function to start a script for an account
function runScript(account) {
  const { username, password, server } = account;

  if (processes.has(username)) {
    console.log(`[${username}] already running. Skipping...`);
    return;
  }

  console.log(`[${username}] Starting script...`);

  const child = spawn('node', ['index_session.js', username, password, server], {
    stdio: 'inherit',
  });

  processes.set(username, child);

  // Watch for script exit
  child.on('exit', (code) => {
    console.log(`[${username}] Script exited with code ${code}`);
    processes.delete(username);

    // Restart script after 3 seconds
    setTimeout(() => runScript(account), 3000);
  });
}

// Start all scripts
accounts.forEach(runScript);

// Optionally monitor periodically (in case something dies silently)
setInterval(() => {
  accounts.forEach(account => {
    if (!processes.has(account.username)) {
      runScript(account);
    }
  });
}, 10000); // every 10 seconds check again
