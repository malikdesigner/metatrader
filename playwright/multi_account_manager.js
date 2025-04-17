// multi_account_runner.js
const { chromium } = require('playwright');
const { run } = require('./index_session');

// 🔐 Add your account list here
const accounts = [
  { username: '22054594', password: 'Demodemo8#', server: 'forex' },
  { username: '22054595', password: 'Demodemo8#', server: 'forex' },
  { username: '22054596', password: 'Demodemo8#', server: 'forex' },
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
  // Add up to 25 accounts as needed
];

// Configuration
const API_ENDPOINT = 'http://localhost/forex/index.php';
const INTERVAL = 30000; // 30 seconds

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-blink-features=AutomationControlled',
    ]
  });

  console.log(`🚀 Browser launched. Starting ${accounts.length} sessions...`);

  const tasks = accounts.map(async (account, i) => {
    const context = await browser.newContext({
      viewport: {
        width: 1280,
        height: 720
      },
      userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.${i} Safari/537.36`,
    });

    const page = await context.newPage();

    try {
      console.log(`🧑‍💼 Starting session for ${account.username} (${account.server})`);
      await run(account.username, account.password, account.server, API_ENDPOINT, INTERVAL, browser, context, page);
    } catch (err) {
      console.error(`❌ Error in session for ${account.username}: ${err.message}`);
    }
  });

  await Promise.all(tasks);
})();
