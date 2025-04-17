const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

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

// Function to ensure directory exists
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
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
  const financialPattern = /(Balance|Equity|Margin|Free margin|Level):\s*([\d\s]+\.?\d*%?)/g;
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
      result.account_info[standardKey] = parseFloat(value.replace(/\s+/g, "").replace("%", ""));
    } else {
      result.account_info[standardKey] = parseFloat(value.replace(/\s+/g, "").replace(/\s/g, ""));
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
            rowData[header] = cell.getAttribute("title") || cell.textContent.trim();
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
          rowData[header] = cell.getAttribute("title") || cell.textContent.trim();
        }
      }
    });

    return rowData;
  }, selector);
};

async function getAccountInfoFromJournal(page) {
  const isJournalActive = await page.evaluate(() => {
    const journalTab = document.querySelector('[title="Journal"]');
    return (
      journalTab &&
      (journalTab.classList.contains("active") ||
        journalTab.getAttribute("aria-selected") === "true" ||
        document.querySelector(".journal") !== null)
    );
  });

  if (!isJournalActive) {
    console.log("Journal tab not active, clicking...");
    await page.evaluate(() => {
      const journalTab = document.querySelector('[title="Journal"]');
      if (journalTab) {
        journalTab.click();
      } else {
        console.log("Journal tab button not found");
      }
    });
    await delay(2000);
  } else {
    console.log("Journal tab already active");
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

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

// Main function with login credentials as parameters
async function run(username, password, server) {
  let browser;
  let context;
  let page;
  console.log(username, password, server);
  const config = SERVER_CONFIGS[server] || SERVER_CONFIGS["forex"];
  let url = typeof config.url === "function" ? config.url(username) : config.url;
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
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    });

    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: "networkidle" });
    await randomDelay(5000, 10000);

    // Take screenshot after URL load
    const screenshotDir = path.join(process.cwd(), "screenshots");
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir);
    }
    await page.screenshot({ path: path.join(screenshotDir, `${server}_after_url_load.png`), fullPage: true });
    console.log("Screenshot taken after URL load");
    if(server !== "avatrade") {
    // Handle cookie consent
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
    await page.screenshot({ path: path.join(screenshotDir, `${server}_before_login.png`), fullPage: true });
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

      const successIndicators = document.querySelectorAll(config.successIndicators);
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

    // Take screenshot after login
    await page.screenshot({ path: path.join(screenshotDir, `${server}_after_login.png`), fullPage: true });
    console.log("Screenshot taken after login");
    await randomDelay(1000, 3000);
    await page.waitForSelector(config.balanceElement, { timeout: 10000 });
    // Extract balance data
    const balanceText = await page.evaluate((balanceSelector) => {
      const balanceElement = document.querySelector(balanceSelector);
      return balanceElement ? balanceElement.textContent : "";
    }, config.balanceElement);

    console.log("Balance text extracted:", balanceText);
    const balanceData = convertTradingTextToJson(balanceText);

    // Check and click Trade button if needed
    const isTradeDataVisible = await page.evaluate(() => {
      const tradeRows = document.querySelectorAll(".tbody > .tr[data-id]");
      return tradeRows.length > 0;
    });

    if (!isTradeDataVisible) {
      console.log("Trade data not visible, clicking Trade button...");
      await page.click('[title="Trade"]');
      await delay(2000);
    } else {
      console.log("Trade data already visible, skipping Trade button click");
    }
    await page.waitForSelector(".tbody > .tr[data-id]", { timeout: 10000 });

    const tradeData = await extractLatestTradeData(page, ".tbody > .tr[data-id]");
    const accountInfo = await getAccountInfoFromJournal(page);
    const mergedData = mergeAllData(balanceData, tradeData, accountInfo);

    await browser.close();
    console.log("Browser closed");

    return mergedData;
  } catch (error) {
    console.error("Error occurred:", error);
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

// Export the run function
module.exports = { run };

// If running this script directly, use these default credentials
if (require.main === module) {
  const username = process.argv[2] || "default_username";
  const password = process.argv[3] || "default_password";
  const server = process.argv[4] || "forex";
  run(username, password, server)
    .then((result) => {
      console.log("Final result:", result);
    })
    .catch((error) => {
      console.error("Script execution failed:", error);
    });
}
