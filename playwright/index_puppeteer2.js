import puppeteer from "puppeteer";
import axios from "axios";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

// Global variables
let pool = null;
const API_ENDPOINT = "http://localhost/forex/index.php";
let peakEquityRecord = {};

// Database configuration
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

// Server-specific configurations
const SERVER_CONFIGS = {
  forex: {
    url: "https://mt5531-row.forex.com/terminal",
    server: "forex",
    cookiesPath: "forex_cookies.json",
    usernameField: 'input[name="login"]',
    passwordField: 'input[name="password"]',
    submitButton: 'button[type="submit"]',
    acceptAllButton: 'button[id="onetrust-accept-btn-handler"]',
    acceptButtonText: "ACCEPT ALL",
    acceptRegularButton: "button",
    acceptRegularButtonText: "Accept",
    iframeSelector: "iframe.meta",
    balanceElement: ".bot-panel",
    errorMessages: ".error-message, .alert-danger, .login-error",
    successIndicators: ".user-profile, .dashboard, .account-info, .logged-in",
    cloudflareSelectors: [
      "#challenge-running",
      ".cf-browser-verification",
      ".cf-error-code",
    ],
    tradeTabSelector: '[title="Trade"]',
    journalTabSelector: '[title="Journal"]',
  },
  // Additional server configurations can be added if necessary…
};

// Utility functions
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

async function waitForDesktopReady(page, maxWaitTime = 120000) {
  if (!page) {
    throw new Error("Invalid page object; page is undefined.");
  }
  
  console.log("Waiting for desktop to be ready (loader to disappear)...");
  const startTime = Date.now();
  
  try {
    // Wait for the <body> tag to exist (timeout 30 sec)
    await page.waitForSelector('body', { timeout: 30000 });
    
    // Then wait until the body tag has the classes indicating desktop is ready
    await page.waitForFunction(
      () => {
        const body = document.querySelector('body');
        return body &&
               
               !body.classList.contains('loader');
      },
      { polling: 1000, timeout: maxWaitTime }
    );
    
    console.log(`Desktop ready! Waited ${((Date.now() - startTime) / 1000).toFixed(1)} seconds`);
    return true;
  } catch (error) {
    console.error(`Error waiting for desktop: ${error.message}`);
    
    // Try to log the body classes for debugging
    try {
      const bodyClasses = await page.evaluate(() => {
        const body = document.querySelector('body');
        return body ? body.className : 'no body found';
      });
      console.log(`Current body classes: ${bodyClasses}`);
    } catch (e) {
      console.error(`Could not check body classes: ${e.message}`);
    }
    
    if (Date.now() - startTime >= maxWaitTime) {
      console.log("Timeout reached, continuing anyway...");
      return false;
    }
    console.log("Retrying...");
    await delay(5000);
    return waitForDesktopReady(page, maxWaitTime - (Date.now() - startTime));
  }
}
async function waitForLoginLoader(page, maxTime = 120000) {
    if (!page) {
      throw new Error("Invalid page object; page is undefined.");
    }
    
    console.log("Waiting for login loader to disappear...");
    try {
      // Wait until the element is hidden or absent; if it doesn't disappear within maxTime, an error is thrown.
      await page.waitForSelector('.login-content .loading', { hidden: true, timeout: maxTime });
      console.log("Login loader has disappeared.");
      return true;
    } catch (error) {
      console.error("Error waiting for login loader: ", error.message);
      return false;
    }
  }
function initializeDatabase() {
  if (!pool) {
    try {
      pool = mysql.createPool(dbConfig);
      console.log("Database connection pool initialized");
      pool
        .query("SELECT 1")
        .then(() => console.log("Database connection successful"))
        .catch((err) =>
          console.error("Database connection test failed:", err.message)
        );
    } catch (error) {
      console.error("Error initializing database:", error.message);
      throw error;
    }
  }
  return pool;
}

async function handleCloudflare(page, config, maxWaitTime = 60000) {
  console.log("Checking for CloudFlare challenge...");
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitTime) {
    const isCloudflarePresent = await page.evaluate((selectors) => {
      return Array.from(selectors).some(selector => document.querySelector(selector));
    }, config.cloudflareSelectors);
    if (!isCloudflarePresent) {
      console.log("No CloudFlare challenge detected, proceeding...");
      return false;
    }
    console.log("CloudFlare challenge detected, waiting...");
    await delay(5000);
  }
  console.log("CloudFlare challenge persisted beyond timeout, continuing anyway...");
  return true;
}

// ------------------- Updated loginToAccount -------------------
// This version uses page.browserContext() when needed and calls waitForDesktopReady with the page.
async function loginToAccount(page, username, password, config, screenshotDir) {
  try {
    console.log(`[${username}] Starting login process...`);
    
    // Check if already logged in
    const alreadyLoggedIn = await page.$(config.successIndicators);
    if (alreadyLoggedIn) {
      console.log(`[${username}] Already logged in, skipping login process.`);
      return { success: true, message: "Already logged in" };
    }
    
    // OPTIONAL cookie consent handling is commented out;
    // Uncomment and adjust as needed.
    /*
    try {
      const acceptAllButton = await page.waitForSelector(config.acceptAllButton, { timeout: 5000 });
      if (acceptAllButton) {
        await acceptAllButton.click();
        console.log("Clicked accept all cookies button");
      }
    } catch (error) {
      console.log("No accept all cookies button found or already accepted");
    }
    await randomDelay(2000, 3000);
    try {
      const acceptButton = await page.waitForSelector(config.acceptRegularButton, { timeout: 5000 });
      if (acceptButton) {
        await acceptButton.click();
        console.log("Clicked regular accept button");
      }
    } catch (error) {
      console.log("No regular accept button found or already accepted");
    }
    const browserContext = page.browserContext();
    const cookies = await browserContext.cookies();
    const serverCookiesPath = config.cookiesPath || "cookies.json";
    fs.writeFileSync(serverCookiesPath, JSON.stringify(cookies, null, 2));
    console.log("Cookies have been saved to", serverCookiesPath);
    */
    
    await randomDelay(3000, 4000);
    console.log(`[${username}] Entering credentials...`);
    try {
      await page.type(config.usernameField, username, { delay: Math.floor(Math.random() * 50) + 30 });
    } catch (e) {
      console.error(`[${username}] Error typing username: ${e.message}`);
    }
    await randomDelay(300, 600);
    await page.type(config.passwordField, password, { delay: Math.floor(Math.random() * 50) + 30 });
    
    if (screenshotDir) {
      await page.screenshot({
        path: path.join(screenshotDir, `${username}_${Date.now()}_before_login.png`),
        fullPage: true,
      });
    }
    
    console.log(`[${username}] Submitting login form...`);
    await page.click(config.submitButton);
    
    // Wait for the desktop (loader) to be ready if applicable:
    await waitForLoginLoader(page);
    
    // Check if an element that indicates login success exists;
    // In this example, we check for the Trade tab.
    const loggedIn = await page.$(config.journalTabSelector);
    if (loggedIn) {
      console.log(`[${username}] Login successful`);
      if (screenshotDir) {
        await page.screenshot({
          path: path.join(screenshotDir, `${username}_${Date.now()}_after_login.png`),
          fullPage: true,
        });
      }
      return { success: true, message: "Login successful" };
    } else {
      console.error(`[${username}] Login failed - success indicators not found`);
      return { success: false, message: "Login failed" };
    }
  } catch (error) {
    console.error(`[${username}] Login error: ${error.message}`);
    return { success: false, message: error.message };
  }
}
// ------------------- End Updated loginToAccount -------------------

// Data parsing function
function convertTradingTextToJson(text) {
  const result = {
    account_info: { balance: "", equity: "", margin: "", free_margin: "", level: "", currency: "" },
    positions: [],
    status: "",
  };
  if (!text) {
    result.status = "No data provided";
    return result;
  }
  const cleanText = text.replace(/\s+/g, " ").trim();
  const financialPattern = /(Balance|Equity|Margin|Free margin|Level):\s*([\d\s]+\.?\d*%?)/g;
  let matches;
  while ((matches = financialPattern.exec(cleanText)) !== null) {
    let key = matches[1].trim();
    let value = matches[2].trim();
    const standardKey = key.toLowerCase().replace(/\s+/g, "_");
    result.account_info[standardKey] = value.includes("%")
      ? parseFloat(value.replace(/\s+/g, "").replace("%", ""))
      : parseFloat(value.replace(/\s+/g, "").replace(/\s/g, ""));
  }
  const currencyMatch = cleanText.match(/(\d+\.\d+)\s+([A-Z]{3})/);
  if (currencyMatch && currencyMatch[2]) {
    result.account_info.currency = currencyMatch[2];
  }
  result.status = cleanText.includes("don't have any positions")
    ? "No open positions"
    : cleanText.includes("positions")
    ? "Has open positions"
    : "Unknown position status";
  if (cleanText.includes("Symbol") || cleanText.includes("Ticket")) {
    const headerPattern = /(Symbol|Ticket|Time|Type|Volume|Price|S \/ L|T \/ P|Swap|Profit|Comment)/g;
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

async function extractLatestTradeData(page, selector) {
  await page.evaluate(async () => {
    const isTimeDescending = () => {
      const timeHeader = document.querySelector('div[title="Time"] .content');
      return timeHeader && timeHeader.classList.contains("desc");
    };
    let attempts = 0;
    const maxAttempts = 3;
    while (!isTimeDescending() && attempts < maxAttempts) {
      const timeButton = document.querySelector('div[title="Time"] button.sort');
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
    const rowData = { id: latestRow.getAttribute("data-id") };
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
          rowData[header] = cell.getAttribute("title") || cell.textContent.trim();
        }
      }
    });
    return rowData;
  }, selector);
}

async function getAccountInfoFromJournal(page, config) {
  const isJournalSelected = await page.evaluate((selector) => {
    const journalTab = document.querySelector(selector);
    return journalTab && journalTab.classList.contains("checked");
  }, config.journalTabSelector);
  if (!isJournalSelected) {
    console.log("Journal tab not selected, clicking...");
    await page.click(config.journalTabSelector);
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

function compareTradeInfo(stored, current) {
  if ((!stored && current) || (stored && !current)) return true;
  if (!stored && !current) return false;
  if (stored.id !== current.id) {
    console.log(`Trade ID changed: ${stored.id} -> ${current.id}`);
    return true;
  }
  if (stored.Profit && current.Profit) {
    const storedProfit = parseFloat(stored.Profit.replace(/[^\d.-]/g, ""));
    const currentProfit = parseFloat(current.Profit.replace(/[^\d.-]/g, ""));
    if (!isNaN(storedProfit) && !isNaN(currentProfit)) {
      const absoluteChange = Math.abs(currentProfit - storedProfit);
      const percentChange = storedProfit !== 0 ? Math.abs((currentProfit - storedProfit) / storedProfit) * 100 : 0;
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

async function checkPeakEquityDrawdown(mergedData, username, server, apiEndpoint) {
  if (mergedData.account_info && typeof mergedData.account_info.equity === "number") {
    const accountKey = `${mergedData.account_info.account_number}_${server}`;
    if (!peakEquityRecord[accountKey]) {
      peakEquityRecord[accountKey] = {
        peakEquity: mergedData.account_info.equity,
        alerted025: false,
        alerted050: false,
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

async function sendToAPI(data, username, server, apiEndpoint = API_ENDPOINT) {
  try {
    const payload = {
      ...data,
      meta: { username, server, timestamp: new Date().toISOString() },
    };
    const response = await axios.post(apiEndpoint, payload, {
      headers: { "Content-Type": "application/json" },
    });
    console.log(`[${username}] API response:`, response.status);
    return response.status >= 200 && response.status < 300;
  } catch (error) {
    console.error(`[${username}] API error:`, error.message);
    return false;
  }
}

async function updateDataResponse(mergedData, username, server, apiEndpoint, noOfTrades) {
  try {
    const db = await initializeDatabase();
    const apiResponseData = { success: true, data: mergedData };
    const apiResponseJson = JSON.stringify(apiResponseData);
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
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
        server,
      ]
    );
    if (result.affectedRows === 0) {
      console.warn(`No rows updated for account ${username} on ${server}`);
      return { success: false, message: "No matching record found in database" };
    }
    console.log(`✅ Updated database record for account ${username} on ${server} (${result.affectedRows} rows)`);
    return { success: true, message: "Database updated successfully", affectedRows: result.affectedRows };
  } catch (error) {
    console.error(`❌ Error updating database: ${error.message}`);
    return { success: false, error: error.message };
  }
}

function monitorTab(page, username, password, config, screenshotDir) {
  page.on("error", async (err) => {
    console.error(`[${username}] Error occurred in tab:`, err);
    console.log(`[${username}] Attempting to reload and recover tab...`);
    try {
      await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
      console.log(`[${username}] Tab reloaded successfully`);
      const loggedIn = await page.evaluate(
        (selector) => !!document.querySelector(selector),
        config.balanceElement
      );
      if (!loggedIn) {
        console.log(`[${username}] Session lost after reload, logging in again...`);
        await loginToAccount(page, username, password, config, screenshotDir);
      } else {
        console.log(`[${username}] Session maintained after reload`);
      }
    } catch (reloadError) {
      console.error(`[${username}] Failed to recover tab:`, reloadError.message);
    }
  });

  page.on("pageerror", async (err) => {
    console.error(`[${username}] Page error occurred:`, err);
  });

  const checkInterval = setInterval(async () => {
    try {
      await page.evaluate(() => true);
      const isLoggedIn = await page.evaluate(
        (selector) => !!document.querySelector(selector),
        config.balanceElement
      );
      if (!isLoggedIn) {
        console.log(`[${username}] Session appears expired, logging in again...`);
        await loginToAccount(page, username, password, config, screenshotDir);
      }
    } catch (error) {
      console.error(`[${username}] Health check failed:`, error.message);
      try {
        console.log(`[${username}] Attempting recovery...`);
        await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
        await loginToAccount(page, username, password, config, screenshotDir);
      } catch (recoveryError) {
        console.error(`[${username}] Recovery failed:`, recoveryError.message);
      }
    }
  }, 10 * 60 * 1000);

  return () => clearInterval(checkInterval);
}

async function extractAndSendData(page, config, username, server, apiEndpoint) {
  try {
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
    
    const balanceText = await page.evaluate((balanceSelector) => {
      const balanceElement = document.querySelector(balanceSelector);
      return balanceElement ? balanceElement.textContent : "";
    }, config.balanceElement);
    console.log("Balance text extracted:", balanceText);
    const balanceData = convertTradingTextToJson(balanceText);
    console.log("Balance data converted:", balanceData);
    
    const tradeData = await extractLatestTradeData(page, ".tbody > .tr[data-id]");
    let noOfTrades = await page.evaluate(() => {
      const items = document.querySelectorAll(".bot-panel [data-id]");
      console.log("🎯 Found items:", items.length);
      return items.length;
    });
    console.log("📦 noOfTrades:", noOfTrades);
    
    const accountInfo = await getAccountInfoFromJournal(page, config);
    const mergedData = mergeAllData(balanceData, tradeData, accountInfo);
    
    const alertTriggered = await checkPeakEquityDrawdown(mergedData, username, server, apiEndpoint);
    const { shouldSend, reason } = await shouldSendToAPI(mergedData, username, server);
    console.log(shouldSend, reason);
    console.log(`Extracted data: ${JSON.stringify(mergedData)}`);
    
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

async function shouldSendToAPI(mergedData, username, server) {
  try {
    const db = await initializeDatabase();
    const [rows] = await db.execute(
      "SELECT api_response FROM user_proc_demo_accounts WHERE account_number = ? AND server = ? ORDER BY updated_at DESC LIMIT 1",
      [mergedData.account_info.account_number, server]
    );
    if (!rows || rows.length === 0 || !rows[0].api_response) {
      return { shouldSend: true, reason: "No previous data found in database" };
    }
    let storedData;
    try {
      storedData = JSON.parse(rows[0].api_response);
      if (storedData.success && storedData.data) {
        storedData = storedData.data;
      }
    } catch (error) {
      console.error(`Error parsing stored API response: ${error.message}`);
      return { shouldSend: true, reason: "Stored data is not valid JSON" };
    }
    console.log("Comparing current data with stored data from database");
    const accountChanged = compareAccountInfo(storedData.account_info, mergedData.account_info);
    const tradeChanged = compareTradeInfo(storedData.latest_trade, mergedData.latest_trade);
    if (accountChanged || tradeChanged) {
      return {
        shouldSend: true,
        reason: `Data changed: ${accountChanged ? "Account info changed" : ""} ${tradeChanged ? "Trade info changed" : ""}`.trim(),
        changes: { accountChanged, tradeChanged },
      };
    }
    return { shouldSend: false, reason: "No significant changes detected" };
  } catch (error) {
    console.error(`Error comparing data: ${error.message}`);
    return { shouldSend: true, reason: `Error during comparison: ${error.message}` };
  }
}

// --- MAIN FUNCTION: Process accounts concurrently ---
async function run() {
  console.log("Starting multiple accounts in a single browser window (Parallel Mode)");

  let accounts = [];
  if (process.env.ACCOUNTS_FILE && fs.existsSync(process.env.ACCOUNTS_FILE)) {
    try {
      const fileData = fs.readFileSync(process.env.ACCOUNTS_FILE, "utf8");
      accounts = JSON.parse(fileData);
      console.log(`Loaded ${accounts.length} accounts from file ${process.env.ACCOUNTS_FILE}`);
    } catch (error) {
      console.error(`Error reading accounts file: ${error.message}`);
    }
  } else if (process.env.ALL_ACCOUNTS) {
    try {
      accounts = JSON.parse(process.env.ALL_ACCOUNTS);
      console.log(`Loaded ${accounts.length} accounts from environment variables`);
    } catch (error) {
      console.error("Error parsing accounts from environment:", error);
    }
  }

  if (accounts.length === 0) {
    const args = process.argv.slice(2);
    const username = args[0] || "22054594";
    const password = args[1] || "Demodemo8#";
    const server = args[2] || "forex";
    accounts.push({ username, password, server });
    console.log(`Created ${accounts.length} account using command line arguments`);
  }

  console.log(`Total accounts: ${accounts.length}`);

  const screenshotDir = path.join(process.cwd(), "screenshots");
  ensureDirectoryExists(screenshotDir);
  initializeDatabase();

  const remoteDebuggingPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 9222;
  let browser;
  const retries = 10;
  const delayTime = 3000;
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
      await delay(delayTime);
    }
  }
  if (!browser) {
    console.error("Failed to connect to Chrome after multiple attempts.");
    return;
  }

  console.log(`Creating tabs concurrently for ${accounts.length} accounts...`);
  const pagesWithMeta = await Promise.all(
    accounts.map(async (account, index) => {
      let context;
      try {
        context = await browser.createIncognitoBrowserContext();
      } catch (err) {
        console.error("Incognito context not available, using default context");
        context = browser;
      }
      const page = await context.newPage();
      console.log(`[${account.username}] Created new tab concurrently (Tab ${index + 1})`);
      return { page, account, index };
    })
  );

  await Promise.all(
    pagesWithMeta.map(async ({ page, account, index }) => {
      await delay(index * 500);
      const config = SERVER_CONFIGS[account.server] || SERVER_CONFIGS["forex"];
      const url = typeof config.url === "function" ? config.url(account.username) : config.url;
      try {
        console.log(`[${account.username}] Processing account in Tab ${index + 1}`);
        await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
        await page.screenshot({
          path: path.join(screenshotDir, `${account.username}_${index + 1}_initial.png`),
          fullPage: true,
        });
        await handleCloudflare(page, config);
        const loginResult = await loginToAccount(page, account.username, account.password, config, screenshotDir);
        if (!loginResult.success) {
          console.error(`[${account.username}] Login failed in Tab ${index + 1}: ${loginResult.message}`);
          return;
        }
        console.log(`[${account.username}] Performing initial data extraction...`);
        await extractAndSendData(page, config, account.username, account.server, API_ENDPOINT);
        
        // Start continuous extraction loop (every 30 seconds)
        (async function continuouslyExtract() {
          while (true) {
            try {
              console.log(`[${account.username}] Extracting data...`);
              await extractAndSendData(page, config, account.username, account.server, API_ENDPOINT);
            } catch (error) {
              console.error(`[${account.username}] Error during continuous extraction:`, error.message);
            }
            await delay(30000);
          }
        })();
        
        monitorTab(page, account.username, account.password, config, screenshotDir);
        console.log(`[${account.username}] Monitoring set up for Tab ${index + 1}`);
      } catch (error) {
        console.error(`[${account.username}] Error processing Tab ${index + 1}:`, error.message);
      }
    })
  );

  console.log(`All ${accounts.length} accounts are now set up concurrently.`);
  process.on("SIGINT", async () => {
    console.log("Terminating...");
    try {
      await browser.close();
    } catch (error) {
      console.error("Error closing browser:", error.message);
    }
    console.log("Cleanup complete, exiting.");
    process.exit(0);
  });
}

run()
  .then(() => console.log("Script running and monitoring tabs..."))
  .catch((err) => console.error("Main error:", err));

export {
  initializeDatabase,
  extractAndSendData,
  loginToAccount,
  updateDataResponse,
  run,
};
