const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const mysql = require("mysql2/promise");
let pool;

//localhost db config
// const dbConfig = {
//     host: process.env.DB_HOST || 'localhost',
//     user: process.env.DB_USER || 'root',
//     password: process.env.DB_PASSWORD || '',
//     database: process.env.DB_NAME || 'u799514067_account',
//     port: process.env.DB_PORT || 3306,
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0
//   };

//hostinger db config
const dbConfig = {
  host: process.env.DB_HOST || "77.37.35.6",
  user: process.env.DB_USER || "u799514067_account",
  password: process.env.DB_PASSWORD || "6/Djb/]yY[JM",
  database: process.env.DB_NAME || "u799514067_account",
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};
function initializeDatabase() {
  if (!pool) {
    try {
      // Create the connection pool
      pool = mysql.createPool(dbConfig);
      console.log("Database connection pool initialized");

      // Test the connection
      pool
        .query("SELECT 1")
        .then(() => {
          console.log("Database connection successful");
        })
        .catch((err) => {
          console.error("Database connection test failed:", err.message);
        });
    } catch (error) {
      console.error("Error initializing database:", error.message);
      throw error;
    }
  }
  return pool;
}

// Default API endpoint (update this to your actual endpoint)
const API_ENDPOINT = "http://localhost/forex/index.php";
let peakEquityRecord = {};
// Server-specific configurations
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
  avatrade: {
    url: "https://mt5web-demo.avatrade.com/terminal",
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
  j2ttech: {
    url: (username) => `https://mt5web.j2t.com/terminal`,
    cookiesPath: "j2ttech_cookies.json",
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
  forexus: {
    url: "https://www.forex.com/en-us/account-login/metatrader-5-demo-web/",
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
};

// Delay function
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Random delay to mimic human behavior
const randomDelay = async (min = 500, max = 2000) => {
  const randomTime = Math.floor(Math.random() * (max - min + 1)) + min;
  await delay(randomTime);
};
const sanitize = (value) => {
  if (value === "" || value === null || value === undefined || isNaN(value))
    return 0;
  return value;
};
// Function to ensure directory exists
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

/**
 * Sends data to API endpoint
 * @param {Object} data - Data to send
 * @param {string} username - MT5 username
 * @param {string} server - Server identifier
 * @param {string} apiEndpoint - API endpoint URL
 * @returns {Promise<boolean>} - Success status
 */
async function checkPeakEquityDrawdown(
  mergedData,
  username,
  server,
  apiEndpoint
) {
  // Ensure we have an equity value to work with
  if (
    mergedData.account_info &&
    typeof mergedData.account_info.equity === "number"
  ) {
    // Create a unique key for this account+server
    const accountKey = `${mergedData.account_info.account_number}_${server}`;

    // Initialize record if not present
    if (!peakEquityRecord[accountKey]) {
      peakEquityRecord[accountKey] = {
        peakEquity: mergedData.account_info.equity,
        alerted025: false,
        alerted050: false,
      };
    }

    const currentEquity = mergedData.account_info.equity;

    // If a new peak is reached, update and reset alerts
    if (currentEquity > peakEquityRecord[accountKey].peakEquity) {
      peakEquityRecord[accountKey].peakEquity = currentEquity;
      peakEquityRecord[accountKey].alerted025 = false;
      peakEquityRecord[accountKey].alerted050 = false;
      console.log(
        `New peak equity for account ${mergedData.account_info.account_number}: ${currentEquity}`
      );
      return false;
    } else {
      // Calculate the drawdown percentage relative to the peak
      const drawdownPercent =
        ((peakEquityRecord[accountKey].peakEquity - currentEquity) /
          peakEquityRecord[accountKey].peakEquity) *
        100;
      let alertTriggered = false;

      if (!peakEquityRecord[accountKey].alerted025 && drawdownPercent >= 0.25) {
        const alertData = {
          alert: "Peak equity drawdown threshold 0.25% breached",
          account_number: mergedData.account_info.account_number,
          peakEquity: peakEquityRecord[accountKey].peakEquity,
          currentEquity: currentEquity,
          drawdownPercent: drawdownPercent.toFixed(2),
        };
        console.log(`Alert Triggered: ${JSON.stringify(alertData)}`);
        await sendToAPI(alertData, username, server, apiEndpoint);
        peakEquityRecord[accountKey].alerted025 = true;
        alertTriggered = true;
      }

      if (!peakEquityRecord[accountKey].alerted050 && drawdownPercent >= 0.5) {
        const alertData = {
          alert: "Peak equity drawdown threshold 0.50% breached",
          account_number: mergedData.account_info.account_number,
          peakEquity: peakEquityRecord[accountKey].peakEquity,
          currentEquity: currentEquity,
          drawdownPercent: drawdownPercent.toFixed(2),
        };
        console.log(`Alert Triggered: ${JSON.stringify(alertData)}`);
        await sendToAPI(alertData, username, server, apiEndpoint);
        peakEquityRecord[accountKey].alerted050 = true;
        alertTriggered = true;
      }

      return alertTriggered;
    }
  }
  return false;
}

async function hideAllSymbolsExceptUSDSGD(page) {
  try {
    console.log("Starting to hide all symbols except USDSGD (with fallbacks)...");
    
    // Make sure screenshots directory exists
    const screenshotDir = path.join(process.cwd(), "screenshots");
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    
    // Wait for the market watch to load completely
    await page.waitForSelector('.market-watch table tbody tr', { timeout: 15000 });
    await delay(3000); // Additional delay to ensure everything is loaded
    
    // Take initial screenshot
    await page.screenshot({
      path: path.join(screenshotDir, `before_search_symbols.png`),
      fullPage: true
    });
    
    // ---- PHASE 1: Find and select USDSGD ----
    
    // Search for USDSGD
    console.log("Searching for USDSGD...");
    await page.waitForSelector('label.search input', { timeout: 10000 });
    await page.click('label.search input');
    await randomDelay(500, 1000);
    await page.fill('label.search input', 'USDSGD');
    await randomDelay(2000, 3000);
    
    // Take screenshot after search
    await page.screenshot({
      path: path.join(screenshotDir, `after_search_usdsgd.png`),
      fullPage: true
    });
    
    // Check search results
    const searchResults = await page.evaluate(() => {
      const rows = document.querySelectorAll('.market-watch table tbody tr');
      return Array.from(rows).map(row => {
        const symbolText = row.querySelector('.text')?.textContent?.trim();
        const id = row.getAttribute('title');
        return { symbol: symbolText, id };
      });
    });
    
    console.log(`Search returned ${searchResults.length} results:`, 
                searchResults.map(r => r.symbol).join(', '));
    
    // Check if USDSGD was found
    let usdsgdInfo = searchResults.find(r => r.symbol === 'USDSGD');
    
    if (!usdsgdInfo) {
      console.log("USDSGD not found in search results, clearing search...");
      await page.click('button.close');
      await randomDelay(1000, 2000);
      
      // Get all visible symbols after clearing search
      const allSymbols = await page.evaluate(() => {
        const rows = document.querySelectorAll('.market-watch table tbody tr');
        return Array.from(rows).map(row => {
          const symbolText = row.querySelector('.text')?.textContent?.trim();
          const id = row.getAttribute('title');
          return { symbol: symbolText, id };
        });
      });
      
      console.log(`Visible symbols: ${allSymbols.map(s => s.symbol).join(', ')}`);
      
      // Check if USDSGD is visible after clearing search
      usdsgdInfo = allSymbols.find(s => s.symbol === 'USDSGD');
    }
    
    // If USDSGD found, select it
    if (usdsgdInfo) {
      console.log(`USDSGD found with ID: ${usdsgdInfo.id}`);
      
      // Try to select USDSGD using click
      await page.evaluate((symbolId) => {
        const row = document.querySelector(`tr[title="${symbolId}"]`);
        if (row) {
          row.click();
        }
      }, usdsgdInfo.id);
      
      console.log("USDSGD selected");
    } else {
      console.warn("WARNING: USDSGD not found in available symbols");
    }
    
    // ---- PHASE 2: Hide other symbols using multiple methods ----
    
    // Get current visible symbols
    const visibleSymbols = await page.evaluate(() => {
      const rows = document.querySelectorAll('.market-watch table tbody tr');
      return Array.from(rows).map(row => {
        const symbolText = row.querySelector('.text')?.textContent?.trim();
        const id = row.getAttribute('title');
        return { symbol: symbolText, id };
      });
    });
    
    console.log(`Found ${visibleSymbols.length} visible symbols to process`);
    
    // Symbols to hide (all except USDSGD)
    const symbolsToHide = visibleSymbols.filter(s => s.symbol !== 'USDSGD');
    console.log(`Will attempt to hide ${symbolsToHide.length} symbols`);
    
    // Take screenshot before hiding starts
    await page.screenshot({
      path: path.join(screenshotDir, `before_hiding_process.png`),
      fullPage: true
    });
    
    // Method 1: Try using context menu via mouse right-click
    let successCount = 0;
    const failedSymbols = [];
    
    for (const symbol of symbolsToHide) {
      try {
        console.log(`Attempting to hide symbol: ${symbol.symbol}`);
        
        // Get the bounding box of the symbol row
        const boundingBox = await page.evaluate((symbolId) => {
          const row = document.querySelector(`tr[title="${symbolId}"]`);
          if (row) {
            const rect = row.getBoundingClientRect();
            return {
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
              width: rect.width,
              height: rect.height
            };
          }
          return null;
        }, symbol.id);
        
        if (!boundingBox) {
          console.warn(`Could not find bounding box for ${symbol.symbol}, skipping`);
          failedSymbols.push(symbol);
          continue;
        }
        
        // Right-click on the symbol row
        await page.mouse.move(boundingBox.x, boundingBox.y);
        await randomDelay(100, 200);
        await page.mouse.down({ button: 'right' });
        await randomDelay(100, 200);
        await page.mouse.up({ button: 'right' });
        
        // Wait for context menu to appear
        await randomDelay(800, 1200);
        
        // Take screenshot with context menu open
        await page.screenshot({
          path: path.join(screenshotDir, `context_menu_${symbol.symbol}.png`),
          fullPage: true
        });
        
        // Click the "Hide" option in the context menu
        const hideClicked = await page.evaluate(() => {
          const menuItems = document.querySelectorAll('.menu button.item');
          for (const item of menuItems) {
            if (item.textContent.trim() === 'Hide') {
              item.click();
              return true;
            }
          }
          return false;
        });
        
        if (hideClicked) {
          successCount++;
          console.log(`Successfully hidden symbol: ${symbol.symbol}`);
        } else {
          console.warn(`Could not find Hide button for ${symbol.symbol}`);
          failedSymbols.push(symbol);
          
          // Click somewhere else to dismiss the menu
          await page.mouse.click(10, 10);
        }
        
        // Short delay between symbols
        await randomDelay(500, 800);
      } catch (err) {
        console.error(`Error hiding symbol ${symbol.symbol}: ${err.message}`);
        failedSymbols.push(symbol);
        
        // Click somewhere neutral to reset any stuck state
        await page.mouse.click(10, 10);
        await randomDelay(500, 1000);
      }
    }
    
    console.log(`Method 1: Successfully hidden ${successCount} out of ${symbolsToHide.length} symbols`);
    
    // Take screenshot after first method
    await page.screenshot({
      path: path.join(screenshotDir, `after_method_1.png`),
      fullPage: true
    });
    
    // Method 2: Try simulating the contextMenuActive class for failed symbols
    if (failedSymbols.length > 0) {
      console.log(`Trying Method 2 for ${failedSymbols.length} remaining symbols...`);
      
      let method2SuccessCount = 0;
      
      for (const symbol of failedSymbols) {
        try {
          // Add contextMenuActive class to the row
          await page.evaluate((symbolId) => {
            const row = document.querySelector(`tr[title="${symbolId}"]`);
            if (row) {
              // Use classList.add to trigger any listeners
              row.classList.add('contextMenuActive');
            }
          }, symbol.id);
          
          // Wait for menu to appear
          await randomDelay(800, 1200);
          
          // Take screenshot with context menu
          await page.screenshot({
            path: path.join(screenshotDir, `method2_menu_${symbol.symbol}.png`),
            fullPage: true
          });
          
          // Click Hide button
          const hideClicked = await page.evaluate(() => {
            const menuItems = document.querySelectorAll('.menu button.item');
            for (const item of menuItems) {
              if (item.textContent.trim() === 'Hide') {
                item.click();
                return true;
              }
            }
            return false;
          });
          
          if (hideClicked) {
            method2SuccessCount++;
            console.log(`Method 2: Successfully hidden symbol: ${symbol.symbol}`);
          } else {
            console.warn(`Method 2: Could not find Hide button for ${symbol.symbol}`);
            
            // Remove the context menu active class
            await page.evaluate((symbolId) => {
              const row = document.querySelector(`tr[title="${symbolId}"]`);
              if (row) {
                row.classList.remove('contextMenuActive');
              }
            }, symbol.id);
            
            // Click somewhere else to dismiss any menu
            await page.mouse.click(10, 10);
          }
          
          await randomDelay(500, 800);
        } catch (err) {
          console.error(`Method 2: Error hiding symbol ${symbol.symbol}: ${err.message}`);
          
          // Click somewhere neutral to reset any stuck state
          await page.mouse.click(10, 10);
          await randomDelay(500, 1000);
        }
      }
      
      console.log(`Method 2: Successfully hidden ${method2SuccessCount} additional symbols`);
      successCount += method2SuccessCount;
    }
    
    // Take final screenshot
    await page.screenshot({
      path: path.join(screenshotDir, `final_result.png`),
      fullPage: true
    });
    
    // Final check to see what's visible
    const finalCheck = await page.evaluate(() => {
      const visibleSymbols = document.querySelectorAll('.market-watch table tbody tr');
      const symbols = Array.from(visibleSymbols).map(row => 
        row.querySelector('.text')?.textContent?.trim()
      );
      
      return {
        totalVisible: visibleSymbols.length,
        symbols: symbols,
        usdsgdVisible: symbols.includes('USDSGD')
      };
    });
    
    console.log(`Final result: ${finalCheck.totalVisible} symbols visible`);
    console.log(`Visible symbols: ${finalCheck.symbols.join(', ')}`);
    console.log(`USDSGD visible: ${finalCheck.usdsgdVisible ? 'YES' : 'NO'}`);
    
    return {
      success: true,
      totalHidden: successCount,
      totalAttempted: symbolsToHide.length,
      finalVisibleSymbols: finalCheck.symbols,
      usdsgdVisible: finalCheck.usdsgdVisible
    };
  } catch (error) {
    console.error(`Major error in hideAllSymbolsExceptUSDSGD: ${error.message}`);
    
    // Take error screenshot
    try {
      await page.screenshot({
        path: path.join(process.cwd(), "screenshots", `critical_error.png`),
        fullPage: true
      });
    } catch (err) {
      console.error("Failed to take error screenshot:", err.message);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}
async function showOnlyUSDSGD(page) {
  try {
    console.log("Starting process to show only USDSGD in market watch...");
    
    // Set up screenshots directory
    const screenshotDir = path.join(process.cwd(), "screenshots");
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    
    // Take initial screenshot
    await page.screenshot({
      path: path.join(screenshotDir, `market_watch_initial.png`),
      fullPage: true
    });
    
    // ---- PHASE 1: Check if USDSGD is already in the market watch ----
    console.log("Checking if USDSGD is already in market watch...");
    
    const usdsgdInWatchlist = await page.evaluate(() => {
      const rows = document.querySelectorAll('.market-watch table tbody tr');
      for (const row of rows) {
        const symbolText = row.querySelector('.text')?.textContent?.trim();
        if (symbolText === 'USDSGD') {
          return {
            found: true,
            id: row.getAttribute('title')
          };
        }
      }
      return { found: false };
    });
    
    console.log(`USDSGD in watchlist: ${usdsgdInWatchlist.found ? 'Yes' : 'No'}`);
    
    // ---- PHASE 2: Add USDSGD if not already in market watch ----
    if (!usdsgdInWatchlist.found) {
      console.log("USDSGD not found in market watch, searching for it...");
      
      // Click on search box
      await page.waitForSelector('label.search input', { timeout: 10000 });
      await page.click('label.search input');
      await randomDelay(500, 1000);
      
      // Enter USDSGD in search
      await page.fill('label.search input', 'USDSGD');
      await randomDelay(2000, 3000);
      
      // Take screenshot of search results
      await page.screenshot({
        path: path.join(screenshotDir, `search_results_usdsgd.png`),
        fullPage: true
      });
      
      // Check if USDSGD appears in search results and click the "+" button
      const addedFromSearch = await page.evaluate(() => {
        // First look for exact USDSGD in search results
        const searchRows = document.querySelectorAll('.list .row button.item');
        
        for (const row of searchRows) {
          const symbolElement = row.querySelector('.symbol');
          if (symbolElement && symbolElement.textContent.trim() === 'USDSGD') {
            // Found USDSGD in search results, click the "+" button
            const addButton = row.querySelector('button.icon[title="Add Symbol"]');
            if (addButton) {
              addButton.click();
              return { clicked: true, symbol: 'USDSGD' };
            }
            return { clicked: false, reason: 'Add button not found', symbol: 'USDSGD' };
          }
        }
        
        // If exact match not found, try to find closest match
        for (const row of searchRows) {
          const symbolElement = row.querySelector('.symbol');
          if (symbolElement && symbolElement.textContent.trim().includes('USD')) {
            const symbol = symbolElement.textContent.trim();
            console.log(`Found USD pair: ${symbol}`);
            const addButton = row.querySelector('button.icon[title="Add Symbol"]');
            if (addButton) {
              addButton.click();
              return { clicked: true, symbol: symbol };
            }
            return { clicked: false, reason: 'Add button not found', symbol: symbol };
          }
        }
        
        return { clicked: false, reason: 'USDSGD not found in search results' };
      });
      
      console.log("Search result action:", addedFromSearch);
      
      // Close search if needed
      if (addedFromSearch.clicked) {
        await randomDelay(1000, 2000);
        await page.click('button.close');
        console.log(`Added ${addedFromSearch.symbol} from search results`);
      } else {
        console.warn(`Failed to add USDSGD: ${addedFromSearch.reason}`);
        // Close search anyway
        await page.click('button.close');
      }
      
      await randomDelay(2000, 3000);
      
      // Take screenshot after adding
      await page.screenshot({
        path: path.join(screenshotDir, `after_adding_usdsgd.png`),
        fullPage: true
      });
    }
    
    // ---- PHASE 3: Make USDSGD active and traded ----
    console.log("Setting USDSGD as active...");
    
    // Find USDSGD in the market watch and make it active
    const setActive = await page.evaluate(() => {
      const allRows = document.querySelectorAll('.market-watch table tbody tr');
      
      // First, remove 'traded' and 'active' classes from all rows
      allRows.forEach(row => {
        row.classList.remove('traded');
        row.classList.remove('active');
      });
      
      // Find USDSGD and add the classes
      for (const row of allRows) {
        const symbolText = row.querySelector('.text')?.textContent?.trim();
        if (symbolText === 'USDSGD') {
          row.classList.add('traded');
          row.classList.add('active');
          
          // Also click on it to ensure it's selected
          row.click();
          
          return {
            success: true,
            id: row.getAttribute('title')
          };
        }
      }
      
      // If added from search, it might have a different name than exact USDSGD
      for (const row of allRows) {
        const symbolText = row.querySelector('.text')?.textContent?.trim();
        if (symbolText && symbolText.includes('USD')) {
          row.classList.add('traded');
          row.classList.add('active');
          
          // Also click on it to ensure it's selected
          row.click();
          
          return {
            success: true,
            symbol: symbolText,
            id: row.getAttribute('title')
          };
        }
      }
      
      return { success: false, reason: 'USDSGD not found in market watch' };
    });
    
    console.log("Set active result:", setActive);
    
    // Take screenshot after setting active
    await page.screenshot({
      path: path.join(screenshotDir, `after_setting_active.png`),
      fullPage: true
    });
    
    // ---- PHASE 4: Hide all other symbols ----
    console.log("Hiding all symbols except USDSGD...");
    
    // Get all visible symbols
    const visibleSymbols = await page.evaluate(() => {
      const rows = document.querySelectorAll('.market-watch table tbody tr');
      return Array.from(rows).map(row => {
        const symbolText = row.querySelector('.text')?.textContent?.trim();
        const id = row.getAttribute('title');
        const isActive = row.classList.contains('active');
        return { symbol: symbolText, id, isActive };
      });
    });
    
    console.log(`Found ${visibleSymbols.length} symbols in market watch:`);
    console.log(visibleSymbols.map(s => `${s.symbol} ${s.isActive ? '(active)' : ''}`).join(', '));
    
    // Find the active symbol (should be USDSGD or a USD pair)
    const activeSymbol = visibleSymbols.find(s => s.isActive) || 
                        visibleSymbols.find(s => s.symbol === 'USDSGD') ||
                        visibleSymbols.find(s => s.symbol && s.symbol.includes('USD'));
    
    if (!activeSymbol) {
      console.warn("No active symbol found and no USD pair found!");
    } else {
      console.log(`Active symbol: ${activeSymbol.symbol}`);
    }
    
    // Symbols to hide (all except active one)
    const symbolsToHide = visibleSymbols.filter(s => 
      activeSymbol ? s.id !== activeSymbol.id : false
    );
    
    console.log(`Will hide ${symbolsToHide.length} symbols`);
    
    // Hide each symbol
    let hiddenCount = 0;
    
    for (const symbol of symbolsToHide) {
      try {
        console.log(`Trying to hide: ${symbol.symbol}`);
        
        // Get bounding box of the row
        const boundingBox = await page.evaluate((symbolId) => {
          const row = document.querySelector(`tr[title="${symbolId}"]`);
          if (row) {
            const rect = row.getBoundingClientRect();
            return {
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
              width: rect.width,
              height: rect.height
            };
          }
          return null;
        }, symbol.id);
        
        if (!boundingBox) {
          console.warn(`Could not find ${symbol.symbol} in DOM anymore, skipping`);
          continue;
        }
        
        // Right-click on the row
        await page.mouse.move(boundingBox.x, boundingBox.y);
        await randomDelay(100, 200);
        await page.mouse.down({ button: 'right' });
        await randomDelay(100, 200);
        await page.mouse.up({ button: 'right' });
        
        // Wait for context menu
        await randomDelay(800, 1200);
        
        // Click "Hide" option
        const hideClicked = await page.evaluate(() => {
          const menuItems = document.querySelectorAll('.menu button.item');
          for (const item of menuItems) {
            if (item.textContent.trim() === 'Hide') {
              item.click();
              return true;
            }
          }
          return false;
        });
        
        if (hideClicked) {
          hiddenCount++;
          console.log(`Hidden: ${symbol.symbol}`);
        } else {
          console.warn(`Could not find Hide button for ${symbol.symbol}`);
          // Click somewhere else to dismiss menu
          await page.mouse.click(10, 10);
        }
        
        await randomDelay(500, 800);
      } catch (err) {
        console.error(`Error hiding ${symbol.symbol}: ${err.message}`);
        // Reset state
        await page.mouse.click(10, 10);
        await randomDelay(500, 1000);
      }
    }
    
    console.log(`Successfully hidden ${hiddenCount} out of ${symbolsToHide.length} symbols`);
    
    // ---- PHASE 5: Verify final state ----
    // Take final screenshot
    await page.screenshot({
      path: path.join(screenshotDir, `final_market_watch.png`),
      fullPage: true
    });
    
    const finalState = await page.evaluate(() => {
      const rows = document.querySelectorAll('.market-watch table tbody tr');
      const visibleSymbols = Array.from(rows).map(row => {
        return {
          symbol: row.querySelector('.text')?.textContent?.trim(),
          isActive: row.classList.contains('active'),
          isTraded: row.classList.contains('traded')
        };
      });
      
      return {
        totalVisible: rows.length,
        symbols: visibleSymbols
      };
    });
    
    console.log("Final market watch state:");
    console.log(`Total visible symbols: ${finalState.totalVisible}`);
    console.log("Visible symbols:", finalState.symbols);
    
    return {
      success: true,
      activeSymbol: activeSymbol?.symbol || 'None',
      totalHidden: hiddenCount,
      finalState: finalState
    };
  } catch (error) {
    console.error(`Error in showOnlyUSDSGD: ${error.message}`);
    
    // Try to take an error screenshot
    try {
      await page.screenshot({
        path: path.join(process.cwd(), "screenshots", `error_state.png`),
        fullPage: true
      });
    } catch (err) {
      console.error("Failed to take error screenshot:", err.message);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

async function updateDataResponse(
  mergedData,
  username,
  server,
  apiEndpoint,
  noOfTrades
) {
  try {
    const db = await initializeDatabase();

    const apiResponseData = {
      success: true,
      data: mergedData,
    };

    const apiResponseJson = JSON.stringify(apiResponseData);
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    // const { account_info, latest_trade } = mergedData;
    const account_info = mergedData.account_info || {};
    const latest_trade = mergedData.latest_trade || {};

    // Preview of query for debugging (optional)

    const [result] = await db.execute(
      `UPDATE user_proc_demo_accounts 
   SET 
     accountOpeningDate = ?,
     balance = ?,
     equity = ?,
     margin = ?,
     free_margin = ?,
     level = ?,
     currency = ?,
     Symbol = ?,
     Ticket = ?,
     Latest_Time = ?,
     Latest_Type = ?,
     Volume = ?,
     Open_Price = ?,
     Stop_Loss = ?,
     Take_Profit = ?,
     Close_Price = ?,
     Swap = ?,
     Profit = ?,
     trade_count = ?,
     api_response = ?,
     updated_at = ?
   WHERE account_number = ? AND server = ?`,
      [
        account_info.accountOpeningDate || now,
        sanitize(account_info.balance),
        sanitize(account_info.equity),
        sanitize(account_info.margin),
        sanitize(account_info.free_margin),
        sanitize(account_info.level),
        account_info.currency || "USD",
        latest_trade.Symbol || "",
        latest_trade.Ticket || "",
        latest_trade.Time || "",
        latest_trade.Type || "",
        sanitize(latest_trade.Volume),
        sanitize(latest_trade["Open Price"]),
        sanitize(latest_trade["Stop Loss"]),
        sanitize(latest_trade["Take Profit"]),
        sanitize(latest_trade["Close Price"]),
        sanitize(latest_trade.Swap),
        sanitize(latest_trade.Profit),
        sanitize(noOfTrades),
        apiResponseJson,
        now,
        username,
        server,
      ]
    );
    const queryParams = [
      account_info.accountOpeningDate || now,
      sanitize(account_info.balance),
      sanitize(account_info.equity),
      sanitize(account_info.margin),
      sanitize(account_info.free_margin),
      sanitize(account_info.level),
      account_info.currency || "USD",
      latest_trade.Symbol || "",
      latest_trade.Ticket || "",
      latest_trade.Time || "",
      latest_trade.Type || "",
      sanitize(latest_trade.Volume),
      sanitize(latest_trade["Open Price"]),
      sanitize(latest_trade["Stop Loss"]),
      sanitize(latest_trade["Take Profit"]),
      sanitize(latest_trade["Close Price"]),
      sanitize(latest_trade.Swap),
      sanitize(latest_trade.Profit),
      sanitize(noOfTrades),
      apiResponseJson,
      now,
      username,
      server,
    ];

    // Reconstruct query for logging (not for execution!)
    const queryString = `
  UPDATE user_proc_demo_accounts 
  SET 
    accountOpeningDate = '${queryParams[0]}',
    balance = ${queryParams[1]},
    equity = ${queryParams[2]},
    margin = ${queryParams[3]},
    free_margin = ${queryParams[4]},
    level = ${queryParams[5]},
    currency = '${queryParams[6]}',
    Symbol = '${queryParams[7]}',
    Ticket = '${queryParams[8]}',
    Latest_Time = '${queryParams[9]}',
    Latest_Type = '${queryParams[10]}',
    Volume = ${queryParams[11]},
    Open_Price = ${queryParams[12]},
    Stop_Loss = ${queryParams[13]},
    Take_Profit = ${queryParams[14]},
    Close_Price = ${queryParams[15]},
    Swap = ${queryParams[16]},
    Profit = ${queryParams[17]},
    trade_count = ${queryParams[18]},
    api_response = '${queryParams[19].substring(0, 100)}...(truncated)',
    updated_at = '${queryParams[20]}'
  WHERE account_number = '${queryParams[22]}' AND server = '${queryParams[23]}';
`;

    console.log("📦 SQL Preview:\n", queryString);

    if (result.affectedRows === 0) {
      console.warn(
        `No rows updated for account ${mergedData.account_info.account_number} on ${server}`
      );
      return {
        success: false,
        message: "No matching record found in database",
      };
    }

    console.log(
      `✅ Updated database record for account ${mergedData.account_info.account_number} on ${server} (${result.affectedRows} rows)`
    );
    return {
      success: true,
      message: "Database updated successfully",
      affectedRows: result.affectedRows,
    };
  } catch (error) {
    console.error(`❌ Error updating database: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function sendToAPI(data, username, server, apiEndpoint = API_ENDPOINT) {
  try {
    // Add metadata to the payload
    const payload = {
      ...data,
      meta: {
        username,
        server,
        timestamp: new Date().toISOString(),
      },
    };

    const response = await axios.post(apiEndpoint, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    console.log(data);
    console.log(`[${username}] API response:`, response.status);
    return response.status >= 200 && response.status < 300;
  } catch (error) {
    console.error(`[${username}] API error:`, error.message);
    return false;
  }
}
function compareTradeInfo(stored, current) {
  // If one exists and the other doesn't, they're different
  if ((!stored && current) || (stored && !current)) return true;

  // If both don't exist, no change
  if (!stored && !current) return false;

  // If trade ID is different, it's a new trade
  if (stored.id !== current.id) {
    console.log(`Trade ID changed: ${stored.id} -> ${current.id}`);
    return true;
  }

  // Check if profit changed significantly (more than $1000 or 10% change)
  if (stored.Profit && current.Profit) {
    // Clean up the profit values (remove currency and commas)
    const storedProfit = parseFloat(stored.Profit.replace(/[^\d.-]/g, ""));
    const currentProfit = parseFloat(current.Profit.replace(/[^\d.-]/g, ""));

    if (!isNaN(storedProfit) && !isNaN(currentProfit)) {
      const absoluteChange = Math.abs(currentProfit - storedProfit);
      const percentChange =
        storedProfit !== 0
          ? Math.abs((currentProfit - storedProfit) / storedProfit) * 100
          : 0;

      if (absoluteChange > 1000 || percentChange > 10) {
        console.log(
          `Significant profit change: ${storedProfit} -> ${currentProfit} (${absoluteChange.toFixed(
            2
          )} / ${percentChange.toFixed(2)}%)`
        );
        return true;
      } else {
        console.log(
          `Minor profit fluctuation: ${absoluteChange.toFixed(
            2
          )} / ${percentChange.toFixed(2)}% - ignoring`
        );
      }
    }
  }

  console.log(
    `Trade ID unchanged and no significant profit change: ${stored.id}`
  );
  return false;
}
function compareAccountInfo(stored, current) {
  if (!stored || !current) return true;

  // Only compare balance by default (not affected by market fluctuations)
  // For equity, margin, free_margin - only report changes if they exceed a threshold

  // Check if balance changed (this would indicate deposits/withdrawals or closed trades)
  if (stored.balance !== current.balance) {
    console.log(`Balance changed: ${stored.balance} -> ${current.balance}`);
    return true;
  }

  // Check for significant equity changes (more than 5% change)
  if (stored.equity && current.equity) {
    const equityChangePercent =
      Math.abs((current.equity - stored.equity) / stored.equity) * 100;
    if (equityChangePercent > 5) {
      console.log(
        `Significant equity change: ${stored.equity} -> ${
          current.equity
        } (${equityChangePercent.toFixed(2)}%)`
      );
      return true;
    } else {
      console.log(
        `Minor equity fluctuation: ${equityChangePercent.toFixed(
          2
        )}% - ignoring`
      );
    }
  }

  console.log("No significant account changes detected");
  return false;
}
async function shouldSendToAPI(mergedData, username, server) {
  try {
    const db = await initializeDatabase();

    // Query the database for the latest data for this user and server
    const [rows] = await db.execute(
      "SELECT api_response FROM user_proc_demo_accounts WHERE account_number = ? AND server = ? ORDER BY updated_at DESC LIMIT 1",
      [mergedData.account_info.account_number, server]
    );

    // If no previous data exists, we should definitely send
    if (!rows || rows.length === 0 || !rows[0].api_response) {
      return {
        shouldSend: true,
        reason: "No previous data found in database",
      };
    }

    // Parse the stored API response
    let storedData;
    try {
      storedData = JSON.parse(rows[0].api_response);
      // Make sure we're accessing the actual data if it's nested
      if (storedData.success && storedData.data) {
        storedData = storedData.data;
      }
    } catch (error) {
      console.error(`Error parsing stored API response: ${error.message}`);
      return {
        shouldSend: true,
        reason: "Stored data is not valid JSON",
      };
    }

    console.log("Comparing current data with stored data from database");

    // Compare account information
    const accountChanged = compareAccountInfo(
      storedData.account_info,
      mergedData.account_info
    );

    // Compare trade information
    const tradeChanged = compareTradeInfo(
      storedData.latest_trade,
      mergedData.latest_trade
    );

    // Determine if we should send based on changes
    if (accountChanged || tradeChanged) {
      return {
        shouldSend: true,
        reason: `Data changed: ${
          accountChanged ? "Account info changed" : ""
        } ${tradeChanged ? "Trade info changed" : ""}`.trim(),
        changes: {
          accountChanged,
          tradeChanged,
        },
      };
    }

    return {
      shouldSend: false,
      reason: "No significant changes detected",
    };
  } catch (error) {
    console.error(`Error comparing data: ${error.message}`);
    // Default to sending if there's an error in comparison
    return {
      shouldSend: true,
      reason: `Error during comparison: ${error.message}`,
    };
  }
}

function convertTradingTextToJson(text) {
  const result = {
    account_info: {
      balance: "",
      equity: "",
      margin: "",
      free_margin: "",
      level: "",
      currency: "",
    },
    positions: [],
    status: "",
  };

  if (!text) {
    result.status = "No data provided";
    return result;
  }

  const cleanText = text.replace(/\s+/g, " ").trim();
  const financialPattern =
    /(Balance|Equity|Margin|Free margin|Level):\s*([\d\s]+\.?\d*%?)/g;
  let matches;

  while ((matches = financialPattern.exec(cleanText)) !== null) {
    let key = matches[1].trim();
    let value = matches[2].trim();
    const standardKey = key.toLowerCase().replace(/\s+/g, "_");

    if (!value) {
      result.account_info[standardKey] = "";
      continue;
    }

    if (value.includes("%")) {
      result.account_info[standardKey] = parseFloat(
        value.replace(/\s+/g, "").replace("%", "")
      );
    } else {
      result.account_info[standardKey] = parseFloat(
        value.replace(/\s+/g, "").replace(/\s/g, "")
      );
    }
  }

  const currencyMatch = cleanText.match(/(\d+\.\d+)\s+([A-Z]{3})/);
  if (currencyMatch && currencyMatch[2]) {
    result.account_info.currency = currencyMatch[2];
  }

  if (cleanText.includes("don't have any positions")) {
    result.status = "No open positions";
  } else if (cleanText.includes("positions")) {
    result.status = "Has open positions";
  } else {
    result.status = "Unknown position status";
  }

  if (cleanText.includes("Symbol") || cleanText.includes("Ticket")) {
    const headerPattern =
      /(Symbol|Ticket|Time|Type|Volume|Price|S \/ L|T \/ P|Swap|Profit|Comment)/g;
    const headers = [];
    let headerMatch;

    while ((headerMatch = headerPattern.exec(cleanText)) !== null) {
      headers.push(headerMatch[1]);
    }

    if (headers.length > 0) {
      result.headers = headers;
    }
  }

  return result;
}

const extractTradeData = async (page, selector) => {
  return await page.evaluate((sel) => {
    const headerRow = document.querySelector(".tr:has(.th)");
    const headers = [];

    if (headerRow) {
      const headerCells = headerRow.querySelectorAll(".th");
      headerCells.forEach((cell) => {
        const title = cell.getAttribute("title");
        if (title) {
          headers.push(title);
        }
      });
    }

    const dataRows = document.querySelectorAll(sel);
    const result = [];

    dataRows.forEach((row) => {
      const rowData = {};
      rowData.id = row.getAttribute("data-id");
      const cells = row.querySelectorAll(".td");

      cells.forEach((cell, index) => {
        if (index < headers.length) {
          const header = headers[index];
          if (header === "Type") {
            const typeElement = cell.querySelector(".blue, .red");
            rowData[header] = typeElement ? typeElement.textContent : "";
          } else if (header === "Profit") {
            const profitElement = cell.querySelector(".red, .green");
            rowData[header] = profitElement ? profitElement.textContent : "";
          } else {
            rowData[header] =
              cell.getAttribute("title") || cell.textContent.trim();
          }
        }
      });

      result.push(rowData);
    });

    return result;
  }, selector);
};

const extractLatestTradeData = async (page, selector) => {
  await page.evaluate(async () => {
    const isTimeDescending = () => {
      const timeHeader = document.querySelector('div[title="Time"] .content');
      return timeHeader && timeHeader.classList.contains("desc");
    };

    let attempts = 0;
    const maxAttempts = 3;

    while (!isTimeDescending() && attempts < maxAttempts) {
      const timeButton = document.querySelector(
        'div[title="Time"] button.sort'
      );
      if (timeButton) {
        timeButton.click();
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else {
        break;
      }
      attempts++;
    }

    return isTimeDescending();
  });

  await delay(1000);

  return await page.evaluate((sel) => {
    const headerRow = document.querySelector(".tr:has(.th)");
    const headers = [];

    if (headerRow) {
      const headerCells = headerRow.querySelectorAll(".th");
      headerCells.forEach((cell) => {
        const title = cell.getAttribute("title");
        if (title) {
          headers.push(title);
        }
      });
    }

    const dataRows = document.querySelectorAll(sel);

    if (!dataRows || dataRows.length === 0) {
      return null;
    }

    const latestRow = dataRows[0];
    const rowData = {};
    rowData.id = latestRow.getAttribute("data-id");
    const cells = latestRow.querySelectorAll(".td");

    cells.forEach((cell, index) => {
      if (index < headers.length) {
        const header = headers[index];
        if (header === "Type") {
          const typeElement = cell.querySelector(".blue, .red");
          rowData[header] = typeElement ? typeElement.textContent : "";
        } else if (header === "Profit") {
          const profitElement = cell.querySelector(".red, .green");
          rowData[header] = profitElement ? profitElement.textContent : "";
        } else {
          rowData[header] =
            cell.getAttribute("title") || cell.textContent.trim();
        }
      }
    });

    return rowData;
  }, selector);
};

async function getAccountInfoFromJournal(page) {
  // Check if Journal tab is selected
  const isJournalSelected = await page.evaluate(() => {
    const journalTab = document.querySelector('[title="Journal"]');
    return journalTab && journalTab.classList.contains("checked");
  });

  if (!isJournalSelected) {
    console.log("Journal tab not selected, clicking...");
    await page.click('[title="Journal"]');
    await delay(2000);
  } else {
    console.log("Journal tab already selected");
  }

  const accountInfo = await page.evaluate(() => {
    const journalRows = document.querySelectorAll(".journal tbody tr.content");

    if (!journalRows || journalRows.length < 2) {
      return { error: "Not enough journal entries found" };
    }

    const authRow = journalRows[1];

    if (!authRow) {
      return { error: "Authorization entry not found" };
    }

    const time = authRow.querySelector("td:nth-child(1)").textContent.trim();
    const source = authRow.querySelector("td:nth-child(2)").textContent.trim();
    const message = authRow.querySelector("td:nth-child(3)").textContent.trim();

    let accountNumber = "";
    let server = "";

    const authMatch = message.match(/(\d+)\s+authorized\s+on\s+(.+)/i);
    if (authMatch && authMatch.length >= 3) {
      accountNumber = authMatch[1];
      server = authMatch[2].trim();
    }

    return {
      account_number: accountNumber,
      server: server,
      login_time: time,
      source: source,
      raw_message: message,
    };
  });

  console.log("Account info from journal:", accountInfo);
  return accountInfo;
}

function mergeAllData(balanceData, tradeData, accountInfo) {
  const mergedData = {
    account_info: {
      account_number: accountInfo?.account_number || "",
      server: accountInfo?.server || "",
      accountOpeningDate: accountInfo?.login_time || "",
      ...(balanceData?.account_info || {}),
    },
  };

  if (tradeData) {
    mergedData.latest_trade = tradeData;
  }

  return mergedData;
}

// User agent rotation
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
];

const getRandomUserAgent = () =>
  userAgents[Math.floor(Math.random() * userAgents.length)];

/**
 * Extracts the latest trading data and sends it to the API endpoint
 * @param {Object} page - Playwright page object
 * @param {Object} config - Server configuration
 * @param {string} username - MT5 username
 * @param {string} server - Server identifier
 * @param {string} apiEndpoint - API endpoint URL
 * @returns {Promise<Object>} - The extracted and merged data
 */
async function extractAndSendData(page, config, username, server, apiEndpoint) {
  try {
    // Check if Trade tab is selected
    const isTradeSelected = await page.evaluate(() => {
      const tradeTab = document.querySelector('[title="Trade"]');
      return tradeTab && tradeTab.classList.contains("checked");
    });

    if (!isTradeSelected) {
      console.log("Trade tab not selected, clicking Trade button...");
      await page.click('[title="Trade"]');
      await delay(2000);
    } else {
      console.log("Trade tab already selected");
    }

    // Extract balance data
    const balanceText = await page.evaluate((balanceSelector) => {
      const balanceElement = document.querySelector(balanceSelector);
      return balanceElement ? balanceElement.textContent : "";
    }, config.balanceElement);

    console.log("Balance text extracted:", balanceText);
    const balanceData = convertTradingTextToJson(balanceText);
    console.log("Balance data converted:", balanceData);
    const tradeData = await extractLatestTradeData(
      page,
      ".tbody > .tr[data-id]"
    );
    let noOfTrades = await page.evaluate(() => {
      const items = document.querySelectorAll(".bot-panel [data-id]");
      console.log("🎯 Found items:", items.length);
      return items.length;
    });
    console.log("📦 noOfTrades:", noOfTrades);
    const accountInfo = await getAccountInfoFromJournal(page);
    const mergedData = mergeAllData(balanceData, tradeData, accountInfo);

    const alertTriggered = await checkPeakEquityDrawdown(
      mergedData,
      username,
      server,
      apiEndpoint
    );

    randomDelay(3000, 4000);
    const { shouldSend, reason } = await shouldSendToAPI(
      mergedData,
      username,
      server
    );
    console.log(shouldSend, reason);
    console.log(` Extracted data: ${mergedData}`);
    // Send data to API
    // await sendToAPI(mergedData, username, server, apiEndpoint);

    if (shouldSend || alertTriggered) {
      console.log(`Sending data to API. Reason: ${reason}`);
      //   await sendToAPI(mergedData, username, server, apiEndpoint);
      await updateDataResponse(
        mergedData,
        username,
        server,
        apiEndpoint,
        noOfTrades
      );
    } else {
      console.log(`Skipping API send. Reason: ${reason}`);
    }
    return mergedData;
  } catch (error) {
    console.error(`Error extracting data: ${error.message}`);
    throw error;
  }
}
/**
 * Main function with login credentials as parameters
 * This function will log in and then continuously monitor for changes
 * @param {string} username - MT5 username
 * @param {string} password - MT5 password
 * @param {string} server - Server identifier
 * @param {string} apiEndpoint - API endpoint URL
 * @param {number} interval - Monitoring interval in milliseconds
 * @returns {Promise<Object>} - The final result or error
 */
async function run(
  username,
  password,
  server,
  apiEndpoint = API_ENDPOINT,
  interval = 30000
) {
  let browser;
  let context;
  let page;

  console.log(`Starting run for ${username} on ${server}`);
  console.log(
    `Data will be sent to ${apiEndpoint} every ${interval / 1000} seconds`
  );

  const config = SERVER_CONFIGS[server] || SERVER_CONFIGS["forex"];
  let url =
    typeof config.url === "function" ? config.url(username) : config.url;
  const serverCookiesPath = config.cookiesPath;

  try {
    browser = await chromium.launch({
      headless: true,
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

    context = await browser.newContext({
      viewport: {
        width: 1280 + Math.floor(Math.random() * 100),
        height: 720 + Math.floor(Math.random() * 100),
      },
      userAgent: getRandomUserAgent(),
    });

    // Load cookies if they exist
    if (fs.existsSync(serverCookiesPath)) {
      const cookiesString = fs.readFileSync(serverCookiesPath);
      const cookies = JSON.parse(cookiesString);
      if (cookies.length !== 0) {
        await context.addCookies(cookies);
        console.log("Session has been loaded from cookies");
      }
    }

    page = await context.newPage();

    // Set additional headers
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    });

    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "networkidle" });
    await randomDelay(5000, 10000);

    // Take screenshot after URL load
    const screenshotDir = path.join(process.cwd(), "screenshots");
    ensureDirectoryExists(screenshotDir);
    await page.screenshot({
      path: path.join(screenshotDir, `${server}_after_url_load.png`),
      fullPage: true,
    });
    console.log("Screenshot taken after URL load");

    if (server !== "avatrade") {
      // Handle cookie consent
      try {
        const acceptAllButton = await page.waitForSelector(
          config.acceptAllButton,
          { timeout: 5000 }
        );
        if (acceptAllButton) {
          await acceptAllButton.click();
          console.log("Clicked accept all cookies button");
        }
      } catch (error) {
        console.log("No accept all cookies button found or already accepted");
      }

      await randomDelay(2000, 3000);

      try {
        const acceptButton = await page.waitForSelector(
          config.acceptRegularButton,
          { timeout: 5000 }
        );
        if (acceptButton) {
          await acceptButton.click();
          console.log("Clicked regular accept button");
        }
      } catch (error) {
        console.log("No regular accept button found or already accepted");
      }

      // Save cookies after accepting consent
      const cookies = await context.cookies();
      fs.writeFileSync(serverCookiesPath, JSON.stringify(cookies, null, 2));
      console.log("Cookies have been saved to", serverCookiesPath);

      // Handle iframe if present
      const iframeElement = await page.$(config.iframeSelector);
      if (iframeElement) {
        const iframeUrl = await iframeElement.getAttribute("src");
        if (iframeUrl) {
          await page.goto(iframeUrl, { waitUntil: "networkidle" });
          await randomDelay(3000, 5000);
        }
      }

      try {
        console.log("Looking for button elements with specific text...");

        const clickResult = await page.evaluate(() => {
          // Find all button elements
          const buttonElements = document.querySelectorAll("button");
          console.log(`Found ${buttonElements.length} button elements`);

          // Check each button for "Accept" text
          for (const button of buttonElements) {
            const buttonText = button.textContent.trim();
            console.log(`Button text: "${buttonText}"`);

            if (buttonText.includes("Accept")) {
              button.click();
              return `Clicked button with "Accept" text: "${buttonText}"`;
            }
          }

          return 'No button elements with "Accept" text found';
        });

        console.log("Second button check result:", clickResult);

        // Wait a bit for any transitions/animations to complete
        await randomDelay(1000, 2000);
      } catch (error) {
        console.log("Error while checking button elements:", error.message);
      }
    }

    console.log("Attempting to log in...");
    await page.fill(config.usernameField, username);
    await randomDelay(500, 1000);
    await page.fill(config.passwordField, password);

    // Take screenshot before login
    await page.screenshot({
      path: path.join(screenshotDir, `${server}_before_login.png`),
      fullPage: true,
    });
    console.log("Screenshot taken before login");

    await page.click(config.submitButton);
    console.log("Login form submitted");

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

    console.log("Login status:", loginStatus);

    if (loginStatus.success === false) {
      throw new Error(`Login failed: ${loginStatus.message}`);
    }

    // Take screenshot after login
    await page.screenshot({
      path: path.join(screenshotDir, `${server}_after_login.png`),
      fullPage: true,
    });
    console.log("Screenshot taken after login");
    await randomDelay(1000, 3000);

    try {
      await showOnlyUSDSGD(page);
      console.log("Symbol hiding process completed");
    } catch (err) {
      console.error("Error during symbol hiding:", err.message);
      // Continue with the script even if hiding fails
    }
    await randomDelay(1000, 3000);
    await page.waitForSelector(config.balanceElement, { timeout: 10000 });
    randomDelay(2000000, 400000);
    // Initial data extraction and sending
    console.log("Extracting initial trading data...");
    const initialData = await extractAndSendData(
      page,
      config,
      username,
      server,
      apiEndpoint
    );
    console.log("Initial data sent successfully:", initialData);

    // Set up continuous monitoring
    console.log(`Starting continuous monitoring with interval: ${interval}ms`);

    let isRunning = true;

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("Received SIGINT. Gracefully shutting down...");
      isRunning = false;
    });

    process.on("SIGTERM", () => {
      console.log("Received SIGTERM. Gracefully shutting down...");
      isRunning = false;
    });

    // Continuous monitoring loop
    while (isRunning) {
      try {
        // Wait for the specified interval
        console.log(
          `Waiting ${interval / 1000} seconds before next data fetch...`
        );
        await delay(interval);

        console.log(
          `[${new Date().toISOString()}] Fetching latest trading data...`
        );

        // Check if session is still valid
        const isLoggedIn = await page.evaluate(() => {
          // Check for login form or error messages that would indicate session expired
          const loginForm = document.querySelector(
            'input[name="login"], input[name="password"]'
          );
          const errorMessages = document.querySelectorAll(
            ".error-message, .alert-danger, .login-error"
          );

          return !loginForm && errorMessages.length === 0;
        });

        if (!isLoggedIn) {
          console.error(
            `[${username}] Session appears to be expired or invalid. Stopping monitoring.`
          );
          break;
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
          `[${username}] Successfully sent data to API at ${new Date().toISOString()}`
        );
      } catch (error) {
        console.error(`Error during monitoring loop: ${error.message}`);
        // Exit the loop on error
        break;
      }
    }

    console.log("Monitoring loop ended. Closing browser...");
    await browser.close();
    console.log("Browser closed");

    return { status: "monitoring_completed" };
  } catch (error) {
    console.error("Error occurred:", error.message);
    if (browser) {
      try {
        await browser.close();
        console.log("Browser closed after error");
      } catch (closeError) {
        console.error("Error closing browser:", closeError);
      }
    }
    return { error: error.message };
  }
}

// If running this script directly
if (require.main === module) {
  const username = process.argv[2] || "default_username";
  const password = process.argv[3] || "default_password";
  const server = process.argv[4] || "forex";
  const apiEndpoint = process.argv[5] || API_ENDPOINT;
  const interval = process.argv[6]
    ? parseInt(process.argv[6], 10) * 1000
    : 30000; // Convert to milliseconds

  console.log(`Starting monitoring for ${username} on ${server}`);
  console.log(
    `Data will be sent to ${apiEndpoint} every ${interval / 1000} seconds`
  );

  run(username, password, server, apiEndpoint, interval)
    .then((result) => {
      console.log("Script completed with result:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Script execution failed:", error);
      process.exit(1);
    });
}

// Export functions for use in other scripts
module.exports = { run, sendToAPI, extractAndSendData };
