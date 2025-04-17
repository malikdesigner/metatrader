// chrome_profile_testing.js
import puppeteer from 'puppeteer';
import axios from 'axios';
import { exec } from 'child_process';
import fs from 'fs';

const SERVER_CONFIGS = {
  forex: {
    url: "https://www.forex.com/en/account-login/metatrader-5-demo-web/",
    cookiesPath: "forex_cookies.json",
    // Login selectors
    usernameField: 'input[name="login"]',
    passwordField: 'input[name="password"]',
    submitButton: 'button[type="submit"]',
    // Cookie consent selectors
    acceptAllButton: 'button[id="onetrust-accept-btn-handler"]', 
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
  avatrade: {
    url: "https://mt5web-demo.avatrade.com/terminal",
    cookiesPath: "forex_cookies.json",
    usernameField: 'input[name="login"]',
    passwordField: 'input[name="password"]',
    submitButton: 'button[type="submit"]',
    acceptAllButton: 'a[role="button"]',
    acceptButtonText: "ACCEPT ALL",
    acceptRegularButton: "button",
    acceptRegularButtonText: "Accept",
    iframeSelector: "iframe.meta",
    balanceElement: ".bot-panel",
    errorMessages: ".error-message, .alert-danger, .login-error",
    successIndicators: ".user-profile, .dashboard, .account-info, .logged-in",
  },
  j2ttech: {
    url: (username) => `https://mt5web.j2t.com/terminal`,
    cookiesPath: "j2ttech_cookies.json",
    usernameField: 'input[name="login"]',
    passwordField: 'input[name="password"]',
    submitButton: 'button[type="submit"]',
    acceptAllButton: 'a[role="button"]',
    acceptButtonText: "ACCEPT ALL",
    acceptRegularButton: "button",
    acceptRegularButtonText: "Accept",
    iframeSelector: "iframe.meta",
    balanceElement: ".bot-panel",
    errorMessages: ".error-message, .alert-danger, .login-error",
    successIndicators: ".user-profile, .dashboard, .account-info, .logged-in",
  },
  forexus: {
    url: "https://www.forex.com/en-us/account-login/metatrader-5-demo-web/",
    cookiesPath: "forex_cookies.json",
    usernameField: 'input[name="login"]',
    passwordField: 'input[name="password"]',
    submitButton: 'button[type="submit"]',
    acceptAllButton: 'a[role="button"]',
    acceptButtonText: "ACCEPT ALL",
    acceptRegularButton: "button",
    acceptRegularButtonText: "Accept",
    iframeSelector: "iframe.meta",
    balanceElement: ".bot-panel",
    errorMessages: ".error-message, .alert-danger, .login-error",
    successIndicators: ".user-profile, .dashboard, .account-info, .logged-in",
  },
};

async function run() {
  console.log(`Starting all 25 accounts in same Chrome window`);

  // Load accounts from file or environment
  let accounts = [];
  
  // Try to load from accounts file first
  if (process.env.ACCOUNTS_FILE && fs.existsSync(process.env.ACCOUNTS_FILE)) {
    try {
      const fileData = fs.readFileSync(process.env.ACCOUNTS_FILE, 'utf8');
      accounts = JSON.parse(fileData);
      console.log(`Loaded ${accounts.length} accounts from file ${process.env.ACCOUNTS_FILE}`);
    } catch (error) {
      console.error(`Error reading accounts file: ${error.message}`);
    }
  }
  // Then try environment variable
  else if (process.env.ALL_ACCOUNTS) {
    try {
      accounts = JSON.parse(process.env.ALL_ACCOUNTS);
      console.log(`Loaded ${accounts.length} accounts from environment variables`);
    } catch (error) {
      console.error("Error parsing accounts from environment:", error);
    }
  }

  // If no accounts loaded yet, use command line arguments
  if (accounts.length === 0) {
    const args = process.argv.slice(2);
    const username = args[0] || '22054594';
    const password = args[1] || 'Demodemo8#';
    const server = args[2] || 'forex';
    
    // Create 25 identical accounts if none provided
    for (let i = 0; i < 25; i++) {
      accounts.push({ username, password, server });
    }
    console.log(`Created 25 identical accounts using command line arguments`);
  }

  // Limit to 25 accounts max
  if (accounts.length > 25) {
    console.log(`Limiting to first 25 accounts out of ${accounts.length}`);
    accounts = accounts.slice(0, 25);
  }

  // CRITICAL FIX: Launch Chrome with proper window and profile settings
  // Use regular Chrome instead of launching a custom instance
  const chromePath = '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"';
  const remoteDebuggingPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 9222;
  
  // Use a consistent user data directory for the profile
  const profileDir = "25tabs_profile";
  const userDataDir = `"C:\\Users\\Malik\\AppData\\Local\\Google\\Chrome\\User Data\\${profileDir}"`;

  // Launch Chrome with a single window that will contain all tabs
  // The key parameters are:
  // --new-window: ensures we get a single window
  // --user-data-dir: ensures we use the same profile
  const chromeLaunchCommand = `${chromePath} --remote-debugging-port=${remoteDebuggingPort} --user-data-dir=${userDataDir} --new-window --start-maximized --no-first-run --disable-extensions`;
  
  console.log(`Launching Chrome with command: ${chromeLaunchCommand}`);

  exec(chromeLaunchCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error launching Chrome: ${error.message}`);
      return;
    }
    console.log("Chrome launched successfully!");
  });

  // Wait for Chrome to start before connecting
  console.log("Waiting for Chrome to start...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Connect to Chrome with retries
  let browser;
  let retries = 5;
  const delayTime = 2000;

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Connecting to Chrome, attempt ${i + 1} of ${retries}...`);
      const response = await axios.get(`http://127.0.0.1:${remoteDebuggingPort}/json/version`);
      const { webSocketDebuggerUrl } = response.data;

      browser = await puppeteer.connect({
        browserWSEndpoint: webSocketDebuggerUrl,
        ignoreHTTPSErrors: true,
        defaultViewport: null,
      });

      console.log("Connected to Chrome successfully!");
      break;
    } catch (error) {
      console.log(`Connection attempt ${i + 1} failed: ${error.message}, retrying...`);
      await new Promise((resolve) => setTimeout(resolve, delayTime));
    }
  }

  if (!browser) {
    console.error("Failed to connect to Chrome after multiple attempts.");
    return;
  }

  try {
    // Get existing tabs/pages
    const existingPages = await browser.pages();
    console.log(`Found ${existingPages.length} existing tabs`);
    
    // Start with the first existing tab to ensure we're reusing an existing tab
    let pages = [];
    
    if (existingPages.length > 0) {
      // Use the first tab as our starting point
      const firstPage = existingPages[0];
      pages.push(firstPage);
      console.log("Using first existing tab as the starting point");
      
      // Ensure it's navigated to about:blank first
      try {
        await firstPage.goto('about:blank');
      } catch (error) {
        console.log("Could not navigate first tab to about:blank, continuing anyway");
      }
    } else {
      console.log("No existing tabs found, creating a new one");
      const newPage = await browser.newPage();
      pages.push(newPage);
    }
    
    // Create additional tabs one at a time in the same window
    console.log(`Creating ${accounts.length - 1} additional tabs in the same window...`);
    
    for (let i = 1; i < accounts.length; i++) {
      // Use specific method to create tab in same window
      try {
        // Create new tab in same window using keyboard shortcut or browser API
        const newPage = await browser.newPage();
        pages.push(newPage);
        console.log(`Created tab ${i+1} of ${accounts.length}`);
      } catch (error) {
        console.error(`Error creating tab ${i+1}:`, error.message);
      }
    }
    
    console.log(`Successfully opened ${pages.length} tabs in same window`);
    
    // Process accounts in parallel
    const loginPromises = [];
    
    // Process all accounts at once
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const account = accounts[i];
      if (!account) continue;
      
      const config = SERVER_CONFIGS[account.server] || SERVER_CONFIGS["forex"];
      
      // Start the login process for this tab
      loginPromises.push(
        (async () => {
          try {
            console.log(`Starting login for account ${account.username} in tab ${i+1}`);
            await loginToAccount(page, account.username, account.password, config);
            monitorTab(page, account.username, account.password, config);
            return { success: true, username: account.username, tabIndex: i+1 };
          } catch (error) {
            console.error(`Error with account ${account.username} in tab ${i+1}:`, error.message);
            return { success: false, username: account.username, tabIndex: i+1, error };
          }
        })()
      );
    }
    
    // Wait for all login processes to complete
    const results = await Promise.allSettled(loginPromises);
    
    const successful = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    const failed = results.filter(r => r.status !== 'fulfilled' || !r.value?.success).length;
    
    console.log(`Login attempts completed: ${successful} successful, ${failed} failed`);
    console.log(`All ${pages.length} accounts are now running in tabs in the same window.`);
    
  } catch (error) {
    console.error("Error while opening tabs:", error);
  }

  // Keep the script running
  return new Promise((resolve) => {
    console.log("Script is now monitoring all tabs...");
    
    // Report status periodically
    setInterval(() => {
      console.log(`Still monitoring tabs...`);
    }, 30 * 60 * 1000); // Log every 30 minutes
  });
}

// Function to login to an account in a specific tab
async function loginToAccount(page, username, password, config) {
  try {
    console.log(`Navigating to ${config.url} for ${username}`);
    
    // Navigate to the login page with increased timeout
    await page.goto(config.url, { 
      waitUntil: 'networkidle2',
      timeout: 90000 // 90 second timeout - increased for simultaneous load
    });
    
    console.log(`Page loaded for ${username}`);

    // Handle cookie consent if it appears
    try {
      console.log(`Checking for cookie consent dialog for ${username}...`);
      const consentButton = await page.$(config.acceptAllButton);
      if (consentButton) {
        console.log(`Cookie consent dialog found for ${username}, accepting...`);
        await consentButton.click();
        await page.waitForTimeout(2000); // Wait for dialog to disappear
      }
    } catch (error) {
      console.log(`No cookie consent dialog found for ${username} or error handling it: ${error.message}`);
    }

    // Wait for the login form to appear
    await page.waitForSelector(config.usernameField, { visible: true, timeout: 60000 });
    
    // Fill in the login details
    console.log(`Entering credentials for ${username}`);
    await page.type(config.usernameField, username);
    await page.type(config.passwordField, password);
    
    // Submit the login form
    console.log(`Submitting login form for ${username}...`);
    await page.click(config.submitButton);
    
    // Wait for login to complete
    console.log(`Waiting for successful login for ${username}...`);
    
    // Wait for a successful indicator or error message
    const loginResult = await Promise.race([
      page.waitForSelector(config.successIndicators, { visible: true, timeout: 60000 })
        .then(() => "success"),
      page.waitForSelector(config.errorMessages, { visible: true, timeout: 60000 })
        .then(() => "error")
    ]).catch(() => "timeout");
    
    if (loginResult === "success") {
      console.log(`Successfully logged in as ${username}`);
    } else if (loginResult === "error") {
      console.error(`Login failed for ${username} - error message displayed`);
    } else {
      console.log(`Login status unknown for ${username} - no clear indicators`);
    }
    
  } catch (error) {
    console.error(`Error during login for ${username}:`, error.message);
    throw error; // Propagate error for handling
  }
}

// Monitor a tab for crashes
function monitorTab(page, username, password, config) {
  page.on('error', async (err) => {
    console.error(`Error occurred in tab for ${username}:`, err);
    console.log(`Reopening tab for ${username}...`);
    try {
      await page.reload({ waitUntil: 'networkidle2' });
      await loginToAccount(page, username, password, config); // Re-login after reload
    } catch (reloadError) {
      console.error(`Failed to reload tab for ${username}:`, reloadError);
    }
  });

  page.on('pageerror', async (err) => {
    console.error(`Page error occurred in tab for ${username}:`, err);
    console.log(`Reopening tab for ${username}...`);
    try {
      await page.reload({ waitUntil: 'networkidle2' });
      await loginToAccount(page, username, password, config); // Re-login after reload
    } catch (reloadError) {
      console.error(`Failed to reload tab for ${username}:`, reloadError);
    }
  });

  // Add a periodic check to ensure the page is still responsive
  setInterval(async () => {
    try {
      // Try to evaluate a simple expression to check if the page is responsive
      await page.evaluate(() => true);
      // Only log errors to reduce console spam
    } catch (error) {
      console.error(`Tab for ${username} is not responsive, reloading...`);
      try {
        await page.reload({ waitUntil: 'networkidle2' });
        await loginToAccount(page, username, password, config);
      } catch (reloadError) {
        console.error(`Failed to reload tab for ${username}:`, reloadError);
      }
    }
  }, 5 * 60 * 1000); // Check every 5 minutes
}

// Start the run
run()
  .then(() => console.log("Script running and monitoring tabs..."))
  .catch(err => console.error("Main error:", err));