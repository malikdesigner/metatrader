const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const mysql = require('mysql2/promise');

// Import your existing database and utility functions from the original file
// This keeps all your existing utility functions intact
const {
  initializeDatabase,
  sendToAPI,
  convertTradingTextToJson,
  extractLatestTradeData,
  getAccountInfoFromJournal,
  mergeAllData,
  checkPeakEquityDrawdown,
  shouldSendToAPI,
  updateDataResponse,
  compareTradeInfo,
  compareAccountInfo,
  extractTradeData,
  randomDelay,
  delay,
  sanitize,
  ensureDirectoryExists
} = require('./utils'); // You'd need to move these functions to a utils.js file

// Keep your server configs from the original file
const SERVER_CONFIGS = {
  forex: {
    url: "https://www.forex.com/en/account-login/metatrader-5-demo-web/",
    cookiesPath: "forex_cookies.json",
    // Login selectors
    usernameField: 'input[name="login"]',
    passwordField: 'input[name="password"]',
    submitButton: 'button[type="submit"]',
    // Cookie consent selectors
    acceptAllButton: 'a[role="button"]',
    acceptButtonText: "ACCEPT ALL",
    acceptRegularButton: "button",
    acceptRegularButtonText: "Accept",
    // Iframe selector
    iframeSelector: "iframe.meta",
    // Balance selector
    balanceElement: ".bot-panel",
    // Success/error indicators
    errorMessages: ".error-message, .alert-danger, .login-error",
    successIndicators: ".user-profile, .dashboard, .account-info, .logged-in",
  },
  // ...other server configs from original code
};

// User agent rotation
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
];

const getRandomUserAgent = () =>
  userAgents[Math.floor(Math.random() * userAgents.length)];

// Default API endpoint
const API_ENDPOINT = "http://localhost/forex/index.php";

/**
 * Main function that launches a single browser instance and manages multiple accounts
 * @param {Array} accounts - Array of account objects with username, password, server
 * @param {string} apiEndpoint - API endpoint URL
 * @param {number} interval - Monitoring interval in milliseconds
 */
async function runSharedBrowser(accounts, apiEndpoint = API_ENDPOINT, interval = 30000) {
  // Launch a single browser instance
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  });
  
  console.log(`🌐 Browser launched successfully. Starting ${accounts.length} sessions...`);
  
  try {
    // Process accounts sequentially to avoid race conditions
    for (const account of accounts) {
      const { username, password, server } = account;
      
      console.log(`👤 Starting session for ${username} on ${server}`);
      
      // Create a unique context for each account
      const context = await browser.newContext({
        viewport: {
          width: 1280 + Math.floor(Math.random() * 100),
          height: 720 + Math.floor(Math.random() * 100),
        },
        userAgent: getRandomUserAgent(),
      });
      
      const config = SERVER_CONFIGS[server] || SERVER_CONFIGS["forex"];
      let url = typeof config.url === "function" ? config.url(username) : config.url;
      const serverCookiesPath = config.cookiesPath;
      
      // Load cookies if they exist
      if (fs.existsSync(serverCookiesPath)) {
        try {
          const cookiesString = fs.readFileSync(serverCookiesPath);
          const cookies = JSON.parse(cookiesString);
          if (cookies.length !== 0) {
            await context.addCookies(cookies);
            console.log(`📝 Session cookies loaded for ${username}`);
          }
        } catch (err) {
          console.error(`⚠️ Error loading cookies for ${username}:`, err.message);
        }
      }
      
      // Create a new page in this context
      const page = await context.newPage();
      
      // Set additional headers
      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      });
      
      try {
        // Navigate to the login page
        console.log(`🔗 Navigating to ${url} for account ${username}`);
        await page.goto(url, { waitUntil: "networkidle" });
        await randomDelay(5000, 10000);
        
        // Take screenshot after URL load
        const screenshotDir = path.join(process.cwd(), "screenshots");
        ensureDirectoryExists(screenshotDir);
        await page.screenshot({
          path: path.join(screenshotDir, `${server}_${username}_after_url_load.png`),
          fullPage: true,
        });
        
        // Handle cookie consent
        if (server !== "avatrade") {
          try {
            const acceptAllButton = await page.waitForSelector(
              config.acceptAllButton,
              { timeout: 5000 }
            );
            if (acceptAllButton) {
              await acceptAllButton.click();
              console.log(`🍪 Clicked accept all cookies button for ${username}`);
            }
          } catch (error) {
            console.log(`No accept cookies button found for ${username} or already accepted`);
          }
          
          await randomDelay(2000, 3000);
          
          try {
            const acceptButton = await page.waitForSelector(
              config.acceptRegularButton,
              { timeout: 5000 }
            );
            if (acceptButton) {
              await acceptButton.click();
              console.log(`🍪 Clicked regular accept button for ${username}`);
            }
          } catch (error) {
            console.log(`No regular accept button found for ${username} or already accepted`);
          }
          
          // Save cookies after accepting consent
          const cookies = await context.cookies();
          fs.writeFileSync(serverCookiesPath, JSON.stringify(cookies, null, 2));
          
          // Handle iframe if present
          const iframeElement = await page.$(config.iframeSelector);
          if (iframeElement) {
            const iframeUrl = await iframeElement.getAttribute("src");
            if (iframeUrl) {
              await page.goto(iframeUrl, { waitUntil: "networkidle" });
              await randomDelay(3000, 5000);
            }
          }
          
          // Try clicking any additional Accept buttons
          try {
            await page.evaluate(() => {
              const buttonElements = document.querySelectorAll("button");
              for (const button of buttonElements) {
                const buttonText = button.textContent.trim();
                if (buttonText.includes("Accept")) {
                  button.click();
                  return true;
                }
              }
              return false;
            });
            await randomDelay(1000, 2000);
          } catch (error) {
            console.log(`Error checking additional buttons for ${username}:`, error.message);
          }
        }
        
        // Login process
        console.log(`🔑 Attempting to log in for ${username}...`);
        await page.fill(config.usernameField, username);
        await randomDelay(500, 1000);
        await page.fill(config.passwordField, password);
        
        // Screenshot before login
        await page.screenshot({
          path: path.join(screenshotDir, `${server}_${username}_before_login.png`),
          fullPage: true,
        });
        
        await page.click(config.submitButton);
        console.log(`🔐 Login form submitted for ${username}`);
        
        await randomDelay(3000, 5000);
        
        // Check login status
        const loginStatus = await page.evaluate((config) => {
          const errorMessages = document.querySelectorAll(config.errorMessages);
          if (errorMessages.length > 0) {
            return {
              success: false,
              message: errorMessages[0].textContent.trim(),
            };
          }
          
          const successIndicators = document.querySelectorAll(
            config.successIndicators
          );
          if (successIndicators.length > 0) {
            return {
              success: true,
              message: "Login successful",
            };
          }
          
          return {
            success: null,
            message: "Could not determine login status",
          };
        }, config);
        
        console.log(`🔐 Login status for ${username}:`, loginStatus);
        
        if (loginStatus.success === false) {
          console.error(`❌ Login failed for ${username}: ${loginStatus.message}`);
          continue; // Skip to next account
        }
        
        // Screenshot after login
        await page.screenshot({
          path: path.join(screenshotDir, `${server}_${username}_after_login.png`),
          fullPage: true,
        });
        
        await randomDelay(1000, 3000);
        await page.waitForSelector(config.balanceElement, { timeout: 10000 });
        
        // Initial data extraction and sending
        console.log(`📊 Extracting initial trading data for ${username}...`);
        const initialData = await extractAndSendData(
          page,
          config,
          username,
          server,
          apiEndpoint
        );
        console.log(`✅ Initial data sent successfully for ${username}:`, initialData);
        
        // Start monitoring this account in a separate thread
        monitorAccount(page, config, username, server, apiEndpoint, interval);
        
      } catch (error) {
        console.error(`❌ Error processing account ${username}:`, error.message);
        // Continue with next account even if this one fails
      }
    }
    
    // Keep the browser running
    console.log("🏃 All accounts initialized. Monitoring sessions...");
    
    // Set up a simple interval to keep the process alive
    const keepAlive = setInterval(() => {
      console.log(`[${new Date().toISOString()}] Browser monitoring ${accounts.length} accounts...`);
    }, 60000);
    
    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("⛔ Received SIGINT. Gracefully shutting down...");
      clearInterval(keepAlive);
      await browser.close();
      process.exit(0);
    });
    
    process.on("SIGTERM", async () => {
      console.log("⛔ Received SIGTERM. Gracefully shutting down...");
      clearInterval(keepAlive);
      await browser.close();
      process.exit(0);
    });
    
  } catch (error) {
    console.error("❌ Fatal error:", error.message);
    await browser.close();
    process.exit(1);
  }
}

/**
 * Function to monitor an account in the background
 * @param {Page} page - Playwright page object
 * @param {Object} config - Server configuration
 * @param {string} username - MT5 username
 * @param {string} server - Server identifier
 * @param {string} apiEndpoint - API endpoint URL
 * @param {number} interval - Monitoring interval in milliseconds
 */
async function monitorAccount(page, config, username, server, apiEndpoint, interval) {
  let isRunning = true;
  
  // Create a separate monitoring loop for each account
  (async () => {
    while (isRunning) {
      try {
        // Wait for the specified interval
        await delay(interval);
        
        console.log(`[${new Date().toISOString()}] Fetching latest data for ${username}...`);
        
        // Check if session is still valid
        const isLoggedIn = await page.evaluate(() => {
          const loginForm = document.querySelector(
            'input[name="login"], input[name="password"]'
          );
          const errorMessages = document.querySelectorAll(
            ".error-message, .alert-danger, .login-error"
          );
          
          return !loginForm && errorMessages.length === 0;
        }).catch(() => false);
        
        if (!isLoggedIn) {
          console.error(`⚠️ [${username}] Session appears to be expired or invalid. Stopping monitoring.`);
          isRunning = false;
          return;
        }
        
        // Extract and send the latest data
        const latestData = await extractAndSendData(
          page,
          config,
          username,
          server,
          apiEndpoint
        );
        console.log(
          `✅ [${username}] Successfully sent data to API at ${new Date().toISOString()}`
        );
      } catch (error) {
        console.error(`❌ Error monitoring ${username}: ${error.message}`);
        isRunning = false;
      }
    }
  })();
}

// Example usage
if (require.main === module) {
  const accounts = [
    // Add your accounts here
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
    // Add more accounts as needed...
  ];
  
  // For demonstration, you can automatically generate multiple test accounts
  if (process.argv.includes("--demo-accounts")) {
    const numAccounts = process.argv[3] ? parseInt(process.argv[3]) : 25;
    accounts.length = 0; // Clear existing accounts
    for (let i = 0; i < numAccounts; i++) {
      accounts.push({ 
        username: "22054594", 
        password: "Demodemo8#", 
        server: "forex" 
      });
    }
  }
  
  const apiEndpoint = process.env.API_ENDPOINT || API_ENDPOINT;
  const interval = process.env.MONITOR_INTERVAL ? parseInt(process.env.MONITOR_INTERVAL, 10) * 1000 : 30000;
  
  console.log(`🚀 Starting shared browser for ${accounts.length} accounts`);
  console.log(`📡 Data will be sent to ${apiEndpoint} every ${interval / 1000} seconds`);
  
  runSharedBrowser(accounts, apiEndpoint, interval)
    .catch(error => {
      console.error("❌ Fatal error:", error);
      process.exit(1);
    });
}

module.exports = { runSharedBrowser };