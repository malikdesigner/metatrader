const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const mysql = require('mysql2/promise');

// Global browser instance that will be shared across all sessions
let sharedBrowser;
let pool;

// Database configuration - using your existing config
const dbConfig = {
  host: process.env.DB_HOST || '77.37.35.6',
  user: process.env.DB_USER || 'u799514067_account',
  password: process.env.DB_PASSWORD || '6/Djb/]yY[JM',
  database: process.env.DB_NAME || 'u799514067_account',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Initialize database - same as your existing function
function initializeDatabase() {
  if (!pool) {
    try {
      pool = mysql.createPool(dbConfig);
      console.log("Database connection pool initialized");
      
      pool.query("SELECT 1").then(() => {
        console.log("Database connection successful");
      }).catch(err => {
        console.error("Database connection test failed:", err.message);
      });
    } catch (error) {
      console.error("Error initializing database:", error.message);
      throw error;
    }
  }
  return pool;
}

// Default API endpoint
const API_ENDPOINT = "http://localhost/forex/index.php";
let peakEquityRecord = {}

// Server configurations - using your existing configs
const SERVER_CONFIGS = {
  forex: {
    url: "https://www.forex.com/en/account-login/metatrader-5-demo-web/",
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

// Utility functions - keeping your existing utilities
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDelay = async (min = 500, max = 2000) => {
  const randomTime = Math.floor(Math.random() * (max - min + 1)) + min;
  await delay(randomTime);
};
const sanitize = (value) => {
  if (value === "" || value === null || value === undefined || isNaN(value))
    return 0;
  return value;
};
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

// User agent rotation - same as yours
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
];
const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

// Initialization function for the shared browser
async function initializeSharedBrowser() {
  if (!sharedBrowser) {
    console.log("Initializing shared browser instance...");
    sharedBrowser = await chromium.launch({
      headless: false, // We want to see the browser
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
        "--start-maximized", // Start with maximized window
      ],
    });
    console.log("Shared browser instance created successfully");
  }
  return sharedBrowser;
}

// Function to convert trading text to JSON - keeping your implementation
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

// Extract trade data functions - keeping your implementations
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

// Data comparison functions (keeping yours)
function compareTradeInfo(stored, current) {
  if ((!stored && current) || (stored && !current)) return true;
  if (!stored && !current) return false;

  if (stored.id !== current.id) {
    console.log(`Trade ID changed: ${stored.id} -> ${current.id}`);
    return true;
  }
  
  if (stored.Profit && current.Profit) {
    const storedProfit = parseFloat(stored.Profit.replace(/[^\d.-]/g, ''));
    const currentProfit = parseFloat(current.Profit.replace(/[^\d.-]/g, ''));
    
    if (!isNaN(storedProfit) && !isNaN(currentProfit)) {
      const absoluteChange = Math.abs(currentProfit - storedProfit);
      const percentChange = storedProfit !== 0 ? 
        Math.abs((currentProfit - storedProfit) / storedProfit) * 100 : 0;
      
      if (absoluteChange > 1000 || percentChange > 10) {
        console.log(`Significant profit change: ${storedProfit} -> ${currentProfit} (${absoluteChange.toFixed(2)} / ${percentChange.toFixed(2)}%)`);
        return true;
      } else {
        console.log(`Minor profit fluctuation: ${absoluteChange.toFixed(2)} / ${percentChange.toFixed(2)}% - ignoring`);
      }
    }
  }
  
  console.log(`Trade ID unchanged and no significant profit change: ${stored.id}`);
  return false;
}

function compareAccountInfo(stored, current) {
  if (!stored || !current) return true;

  if (stored.balance !== current.balance) {
    console.log(`Balance changed: ${stored.balance} -> ${current.balance}`);
    return true;
  }
  
  if (stored.equity && current.equity) {
    const equityChangePercent = Math.abs((current.equity - stored.equity) / stored.equity) * 100;
    if (equityChangePercent > 5) {
      console.log(`Significant equity change: ${stored.equity} -> ${current.equity} (${equityChangePercent.toFixed(2)}%)`);
      return true;
    } else {
      console.log(`Minor equity fluctuation: ${equityChangePercent.toFixed(2)}% - ignoring`);
    }
  }
  
  console.log("No significant account changes detected");
  return false;
}

// Data processing and API functions
async function checkPeakEquityDrawdown(mergedData, username, server, apiEndpoint) {
  if (mergedData.account_info && typeof mergedData.account_info.equity === 'number') {
    const accountKey = `${mergedData.account_info.account_number}_${server}`;
    
    if (!peakEquityRecord[accountKey]) {
      peakEquityRecord[accountKey] = {
        peakEquity: mergedData.account_info.equity,
        alerted025: false,
        alerted050: false
      };
    }
    
    const currentEquity = mergedData.account_info.equity;
    
    if (currentEquity > peakEquityRecord[accountKey].peakEquity) {
      peakEquityRecord[accountKey].peakEquity = currentEquity;
      peakEquityRecord[accountKey].alerted025 = false;
      peakEquityRecord[accountKey].alerted050 = false;
      console.log(`New peak equity for account ${mergedData.account_info.account_number}: ${currentEquity}`);
      return false;
    } else {
      const drawdownPercent = ((peakEquityRecord[accountKey].peakEquity - currentEquity) / peakEquityRecord[accountKey].peakEquity) * 100;
      let alertTriggered = false;
      
      if (!peakEquityRecord[accountKey].alerted025 && drawdownPercent >= 0.25) {
        const alertData = {
          alert: "Peak equity drawdown threshold 0.25% breached",
          account_number: mergedData.account_info.account_number,
          peakEquity: peakEquityRecord[accountKey].peakEquity,
          currentEquity: currentEquity,
          drawdownPercent: drawdownPercent.toFixed(2)
        };
        console.log(`Alert Triggered: ${JSON.stringify(alertData)}`);
        await sendToAPI(alertData, username, server, apiEndpoint);
        peakEquityRecord[accountKey].alerted025 = true;
        alertTriggered = true;
      }
      
      if (!peakEquityRecord[accountKey].alerted050 && drawdownPercent >= 0.50) {
        const alertData = {
          alert: "Peak equity drawdown threshold 0.50% breached",
          account_number: mergedData.account_info.account_number,
          peakEquity: peakEquityRecord[accountKey].peakEquity,
          currentEquity: currentEquity,
          drawdownPercent: drawdownPercent.toFixed(2)
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

async function updateDataResponse(mergedData, username, server, apiEndpoint, noOfTrades) {
  try {
    const db = await initializeDatabase();

    const apiResponseData = {
      success: true,
      data: mergedData
    };

    const apiResponseJson = JSON.stringify(apiResponseData);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const account_info = mergedData.account_info || {};
    const latest_trade = mergedData.latest_trade || {};

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
        server
      ]
    );

    if (result.affectedRows === 0) {
      console.warn(`No rows updated for account ${mergedData.account_info.account_number} on ${server}`);
      return {
        success: false,
        message: 'No matching record found in database'
      };
    }

    console.log(`✅ Updated database record for account ${mergedData.account_info.account_number} on ${server} (${result.affectedRows} rows)`);
    return {
      success: true,
      message: 'Database updated successfully',
      affectedRows: result.affectedRows
    };
  } catch (error) {
    console.error(`❌ Error updating database: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

async function sendToAPI(data, username, server, apiEndpoint = API_ENDPOINT) {
  try {
    const payload = {
      ...data,
      meta: {
        username,
        server,
        timestamp: new Date().toISOString(),
      },
    };

    // Note: Using axios in your original code, we're importing it locally for readability
    const axios = require("axios");
    const response = await axios.post(apiEndpoint, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    console.log(`[${username}] API response:`, response.status);
    return response.status >= 200 && response.status < 300;
  } catch (error) {
    console.error(`[${username}] API error:`, error.message);
    return false;
  }
}

async function shouldSendToAPI(mergedData, username, server) {
  try {
    const db = await initializeDatabase();

    const [rows] = await db.execute(
      'SELECT api_response FROM user_proc_demo_accounts WHERE account_number = ? AND server = ? ORDER BY updated_at DESC LIMIT 1',
      [mergedData.account_info.account_number, server]
    );

    if (!rows || rows.length === 0 || !rows[0].api_response) {
      return {
        shouldSend: true,
        reason: 'No previous data found in database'
      };
    }

    let storedData;
    try {
      storedData = JSON.parse(rows[0].api_response);
      if (storedData.success && storedData.data) {
        storedData = storedData.data;
      }
    } catch (error) {
      console.error(`Error parsing stored API response: ${error.message}`);
      return {
        shouldSend: true,
        reason: 'Stored data is not valid JSON'
      };
    }

    console.log("Comparing current data with stored data from database");
    
    const accountChanged = compareAccountInfo(
      storedData.account_info,
      mergedData.account_info
    );

    const tradeChanged = compareTradeInfo(
      storedData.latest_trade,
      mergedData.latest_trade
    );

    if (accountChanged || tradeChanged) {
      return {
        shouldSend: true,
        reason: `Data changed: ${accountChanged ? 'Account info changed' : ''} ${
          tradeChanged ? 'Trade info changed' : ''
        }`.trim(),
        changes: {
          accountChanged,
          tradeChanged
        }
      };
    }

    return {
      shouldSend: false,
      reason: 'No significant changes detected'
    };
  } catch (error) {
    console.error(`Error comparing data: ${error.message}`);
    return {
      shouldSend: true,
      reason: `Error during comparison: ${error.message}`
    };
  }
}

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
      const items = document.querySelectorAll('.bot-panel [data-id]');
      console.log('🎯 Found items:', items.length);
      return items.length;
    });
    console.log('📦 noOfTrades:', noOfTrades);
    
    const accountInfo = await getAccountInfoFromJournal(page);
    const mergedData = mergeAllData(balanceData, tradeData, accountInfo);
    
    const alertTriggered = await checkPeakEquityDrawdown(mergedData, username, server, apiEndpoint);
    
    await randomDelay(3000, 4000);
    const { shouldSend, reason } = await shouldSendToAPI(mergedData, username, server);
    
    if (shouldSend || alertTriggered) {
      console.log(`Sending data to API. Reason: ${reason}`);
      await updateDataResponse(mergedData, username, server, apiEndpoint, noOfTrades);
    } else {
      console.log(`Skipping API send. Reason: ${reason}`);
    }
    
    return mergedData;
  } catch (error) {
    console.error(`Error extracting data: ${error.message}`);
    throw error;
  }
}

// Global shared browser context - we'll use just one for all sessions
let sharedContext;

// New function to run in a shared browser context
async function runSharedSession(username, password, server, apiEndpoint = API_ENDPOINT, interval = 30000, processId) {
  let page;

  console.log(`[Process ${processId}] Starting session for ${username} on ${server}`);
  
  // Initialize the shared browser if it doesn't exist
  const browser = await initializeSharedBrowser();
  
  // Initialize shared context if it doesn't exist
  if (!sharedContext) {
    console.log(`Creating shared browser context for all tabs...`);
    sharedContext = await browser.newContext({
      viewport: {
        width: 1280 + Math.floor(Math.random() * 100),
        height: 720 + Math.floor(Math.random() * 100),
      },
      userAgent: getRandomUserAgent(),
    });
  }
  
  const config = SERVER_CONFIGS[server] || SERVER_CONFIGS["forex"];
  let url = typeof config.url === "function" ? config.url(username) : config.url;
  const serverCookiesPath = config.cookiesPath;

    // Load cookies if they exist
    if (fs.existsSync(serverCookiesPath)) {
      const cookiesString = fs.readFileSync(serverCookiesPath);
      const cookies = JSON.parse(cookiesString);
      if (cookies.length !== 0) {
        await context.addCookies(cookies);
        console.log(`[Process ${processId}] Session has been loaded from cookies`);
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

    console.log(`[Process ${processId}] Navigating to ${url}`);
    await page.goto(url, { waitUntil: "networkidle" });
    await randomDelay(5000, 10000);

    // Handle cookie consent
    if (server !== "avatrade") {
      // Handle cookie consent
      try {
        const acceptAllButton = await page.waitForSelector(
          config.acceptAllButton,
          { timeout: 5000 }
        );
        if (acceptAllButton) {
          await acceptAllButton.click();
          console.log(`[Process ${processId}] Clicked accept all cookies button`);
        }
      } catch (error) {
        console.log(`[Process ${processId}] No accept all cookies button found or already accepted`);
      }

      await randomDelay(2000, 3000);

      try {
        const acceptButton = await page.waitForSelector(
          config.acceptRegularButton,
          { timeout: 5000 }
        );
        if (acceptButton) {
          await acceptButton.click();
          console.log(`[Process ${processId}] Clicked regular accept button`);
        }
      } catch (error) {
        console.log(`[Process ${processId}] No regular accept button found or already accepted`);
      }

      // Save cookies after accepting consent
      const cookies = await sharedContext.cookies();
      fs.writeFileSync(serverCookiesPath, JSON.stringify(cookies, null, 2));
      console.log(`[Process ${processId}] Cookies have been saved to ${serverCookiesPath}`);

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
        console.log(`[Process ${processId}] Looking for button elements with specific text...`);

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

        console.log(`[Process ${processId}] Second button check result:`, clickResult);
        await randomDelay(1000, 2000);
      } catch (error) {
        console.log(`[Process ${processId}] Error while checking button elements:`, error.message);
      }
    }

    console.log(`[Process ${processId}] Attempting to log in...`);
    await page.fill(config.usernameField, username);
    await randomDelay(500, 1000);
    await page.fill(config.passwordField, password);
    await page.click(config.submitButton);
    console.log(`[Process ${processId}] Login form submitted`);

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

    console.log(`[Process ${processId}] Login status:`, loginStatus);

    if (loginStatus.success === false) {
      throw new Error(`Login failed: ${loginStatus.message}`);
    }

    await randomDelay(1000, 3000);
    await page.waitForSelector(config.balanceElement, { timeout: 10000 });

    // Initial data extraction and sending
    console.log(`[Process ${processId}] Extracting initial trading data...`);
    const initialData = await extractAndSendData(
      page,
      config,
      username,
      server,
      apiEndpoint
    );
    console.log(`[Process ${processId}] Initial data sent successfully:`, initialData);

    // Set up continuous monitoring
    console.log(`[Process ${processId}] Starting continuous monitoring with interval: ${interval}ms`);

    let isRunning = true;

    // Handle tab-specific shutdown
    const cleanupFunction = () => {
      console.log(`[Process ${processId}] Closing tab...`);
      isRunning = false;
    };

    // Continuous monitoring loop
    while (isRunning) {
      try {
        // Wait for the specified interval
        console.log(
          `[Process ${processId}] Waiting ${interval / 1000} seconds before next data fetch...`
        );
        await delay(interval);

        console.log(
          `[Process ${processId}] [${new Date().toISOString()}] Fetching latest trading data...`
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
            `[Process ${processId}] Session appears to be expired or invalid. Stopping monitoring.`
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
          `[Process ${processId}] Successfully sent data to API at ${new Date().toISOString()}`
        );
      } catch (error) {
        console.error(`[Process ${processId}] Error during monitoring loop: ${error.message}`);
        // Exit the loop on error
        break;
      }
    }

    console.log(`[Process ${processId}] Monitoring loop ended. Closing tab...`);
    await page.close();
    console.log(`[Process ${processId}] Tab closed`);

    return { status: "monitoring_completed", processId };
  } catch (error) {
    console.error(`[Process ${processId}] Error occurred:`, error.message);
    if (page) {
      try {
        await page.close();
        console.log(`[Process ${processId}] Tab closed after error`);
      } catch (closeError) {
        console.error(`[Process ${processId}] Error closing tab:`, closeError);
      }
    }
    return { error: error.message, processId };
  }
}

// Clean up resources
async function shutdown() {
  console.log("Shutting down all browser instances...");
  if (sharedContext) {
    try {
      await sharedContext.close();
      console.log("Shared browser context closed");
    } catch (error) {
      console.error("Error closing shared context:", error.message);
    }
  }
  
  if (sharedBrowser) {
    try {
      await sharedBrowser.close();
      console.log("Shared browser closed");
    } catch (error) {
      console.error("Error closing shared browser:", error.message);
    }
  }
  
  if (pool) {
    try {
      await pool.end();
      console.log("Database connection pool closed");
    } catch (error) {
      console.error("Error closing database pool:", error.message);
    }
  }
}

// Main runner function that creates processes with concurrency control
async function runMultipleProcesses(accounts, maxConcurrent = 5) {
  try {
    // Initialize the shared browser
    await initializeSharedBrowser();
    
    // Queue of processes to run
    const queue = [...accounts];
    const activeProcesses = new Map();
    let processCounter = 0;
    
    console.log(`Starting with ${queue.length} accounts, maximum ${maxConcurrent} concurrent processes`);
    
    // Function to start a new process if available
    const startNextProcess = async () => {
      if (queue.length === 0) return;
      if (activeProcesses.size >= maxConcurrent) return;
      
      const account = queue.shift();
      processCounter++;
      const processId = processCounter;
      
      console.log(`Starting process ${processId} for account ${account.username}`);
      
      // Add to active processes
      activeProcesses.set(processId, account);
      
      // Start the process
      runSharedSession(
        account.username,
        account.password,
        account.server, 
        account.apiEndpoint || API_ENDPOINT,
        account.interval || 30000,
        processId
      ).then(result => {
        console.log(`Process ${processId} completed:`, result);
        // Remove from active processes
        activeProcesses.delete(processId);
        // Try to start next process
        startNextProcess();
      }).catch(err => {
        console.error(`Process ${processId} failed:`, err);
        // Remove from active processes
        activeProcesses.delete(processId);
        // Try to start next process
        startNextProcess();
      });
    };
    
    // Start initial batch of processes up to maxConcurrent
    for (let i = 0; i < Math.min(maxConcurrent, queue.length); i++) {
      await startNextProcess();
    }
    
    // Setup cleanup for graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Received SIGINT. Gracefully shutting down...');
      await shutdown();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM. Gracefully shutting down...');
      await shutdown();
      process.exit(0);
    });
    
    // Return the active processes map for external monitoring
    return activeProcesses;
  } catch (error) {
    console.error("Failed to run processes:", error);
    await shutdown();
    throw error;
  }
}

module.exports = { 
  runSharedSession,
  runMultipleProcesses,
  initializeSharedBrowser,
  shutdown
};