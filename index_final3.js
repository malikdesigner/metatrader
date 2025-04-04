const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");

// Apply stealth plugin
puppeteer.use(StealthPlugin());

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

const cookiesPath = "forex_cookies.json";

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

function convertBalanceTextToJson_bk(balanceText) {
  // Clean up any extra spaces and ensure consistent format
  const cleanText = balanceText.replace(/\s+/g, " ").trim();
  const pattern = /([^:]+):\s*([\d\s]+\.?\d*%?)/g;
  const result = {};
  // Find all matches
  let matches;
  while ((matches = pattern.exec(cleanText)) !== null) {
    let label = matches[1].trim();
    let value = matches[2].trim();

    if (value.includes("%")) {
      result[label] = parseFloat(value.replace(/\s+/g, "").replace("%", ""));
    } else {
      result[label] = parseFloat(value.replace(/\s+/g, ""));
    }
  }

  return result;
}
function convertTradingTextToJson(text) {
  // Create the result object structure with default empty values
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

  // Handle empty or undefined input
  if (!text) {
    result.status = "No data provided";
    return result;
  }

  // Clean up the text - normalize spaces and line breaks
  const cleanText = text.replace(/\s+/g, " ").trim();

  // Extract account information using regex
  const financialPattern =
    /(Balance|Equity|Margin|Free margin|Level):\s*([\d\s]+\.?\d*%?)/g;
  let matches;

  while ((matches = financialPattern.exec(cleanText)) !== null) {
    let key = matches[1].trim();
    let value = matches[2].trim();

    // Create standardized key name (lowercase with underscores)
    const standardKey = key.toLowerCase().replace(/\s+/g, "_");

    // Check if value is empty
    if (!value) {
      result.account_info[standardKey] = "";
      continue;
    }

    // Convert to proper number format
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

  // Extract currency if present
  const currencyMatch = cleanText.match(/(\d+\.\d+)\s+([A-Z]{3})/);
  if (currencyMatch && currencyMatch[2]) {
    result.account_info.currency = currencyMatch[2];
  }

  // Check for positions status
  if (cleanText.includes("don't have any positions")) {
    result.status = "No open positions";
  } else if (cleanText.includes("positions")) {
    result.status = "Has open positions";

    // If there were positions, we would parse them here
    // This would require additional code to handle the table structure
  } else {
    result.status = "Unknown position status";
  }

  // Extract column headers if present
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
    // First get the header row to extract column names
    const headerRow = document.querySelector(".tr:has(.th)");
    const headers = [];

    // Extract header titles from title attributes
    if (headerRow) {
      const headerCells = headerRow.querySelectorAll(".th");
      headerCells.forEach((cell) => {
        const title = cell.getAttribute("title");
        if (title) {
          headers.push(title);
        }
      });
    }

    // Find the data row(s) - using the string selector directly
    const dataRows = document.querySelectorAll(sel);
    const result = [];

    // Process each row
    dataRows.forEach((row) => {
      const rowData = {};
      rowData.id = row.getAttribute("data-id");

      // Get all data cells in the row
      const cells = row.querySelectorAll(".td");

      // Map each cell to the corresponding header
      cells.forEach((cell, index) => {
        if (index < headers.length) {
          const header = headers[index];

          // Handle special cases
          if (header === "Type") {
            const typeElement = cell.querySelector(".blue, .red");
            rowData[header] = typeElement ? typeElement.textContent : "";
          } else if (header === "Profit") {
            const profitElement = cell.querySelector(".red, .green");
            rowData[header] = profitElement ? profitElement.textContent : "";
          } else {
            // For regular cells, just get the text content
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
  // First check if the Time column is sorted in descending order
  // If not, click it to sort properly
  await page.evaluate(async () => {
    // Function to check if Time column is in desc order
    const isTimeDescending = () => {
      const timeHeader = document.querySelector('div[title="Time"] .content');
      return timeHeader && timeHeader.classList.contains("desc");
    };

    // Click Time header until it's in descending order
    // Use a maximum number of attempts to avoid infinite loop
    let attempts = 0;
    const maxAttempts = 3;

    while (!isTimeDescending() && attempts < maxAttempts) {
      const timeButton = document.querySelector(
        'div[title="Time"] button.sort'
      );
      if (timeButton) {
        timeButton.click();
        // Give it a brief moment to update the UI
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else {
        break; // Exit if button not found
      }
      attempts++;
    }

    return isTimeDescending(); // Return whether we succeeded
  });

  // Give a moment for sorting to complete
  await delay(1000);

  // Now extract the latest trade data (first row)
  return await page.evaluate((sel) => {
    // First get the header row to extract column names
    const headerRow = document.querySelector(".tr:has(.th)");
    const headers = [];

    // Extract header titles from title attributes
    if (headerRow) {
      const headerCells = headerRow.querySelectorAll(".th");
      headerCells.forEach((cell) => {
        const title = cell.getAttribute("title");
        if (title) {
          headers.push(title);
        }
      });
    }

    // Find all data rows
    const dataRows = document.querySelectorAll(sel);

    // If no rows found, return null or empty object
    if (!dataRows || dataRows.length === 0) {
      return null;
    }

    // Take only the first row (latest trade)
    const latestRow = dataRows[0];
    const rowData = {};
    rowData.id = latestRow.getAttribute("data-id");

    // Get all data cells in the row
    const cells = latestRow.querySelectorAll(".td");

    // Map each cell to the corresponding header
    cells.forEach((cell, index) => {
      if (index < headers.length) {
        const header = headers[index];

        // Handle special cases
        if (header === "Type") {
          const typeElement = cell.querySelector(".blue, .red");
          rowData[header] = typeElement ? typeElement.textContent : "";
        } else if (header === "Profit") {
          const profitElement = cell.querySelector(".red, .green");
          rowData[header] = profitElement ? profitElement.textContent : "";
        } else {
          // For regular cells, just get the text content
          rowData[header] =
            cell.getAttribute("title") || cell.textContent.trim();
        }
      }
    });

    return rowData; // Return just the single row object, not an array
  }, selector);
};

async function getAccountInfoFromJournal(page) {
  // First check if the Journal tab is already active
  const isJournalActive = await page.evaluate(() => {
    const journalTab = document.querySelector('[title="Journal"]');
    // Check if the tab has an active class or similar indicator
    return (
      journalTab &&
      (journalTab.classList.contains("active") ||
        journalTab.getAttribute("aria-selected") === "true" ||
        document.querySelector(".journal") !== null)
    );
  });

  // Click on Journal tab if it's not already active
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
    // Wait for journal data to load
    await delay(2000);
  } else {
    console.log("Journal tab already active");
  }

  // Extract account information from the journal entries
  const accountInfo = await page.evaluate(() => {
    const journalRows = document.querySelectorAll(".journal tbody tr.content");

    // If no journal entries found
    if (!journalRows || journalRows.length < 2) {
      return { error: "Not enough journal entries found" };
    }

    // Get the authorization entry (typically the second row)
    const authRow = journalRows[1]; // Index 1 is the second row

    if (!authRow) {
      return { error: "Authorization entry not found" };
    }

    // Extract the time, source, and message from the row
    const time = authRow.querySelector("td:nth-child(1)").textContent.trim();
    const source = authRow.querySelector("td:nth-child(2)").textContent.trim();
    const message = authRow.querySelector("td:nth-child(3)").textContent.trim();

    // Parse the account number and server from the message
    // Example message: "22740900 authorized on FOREX.comGlobal-Demo 531"
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
  // Create the base object with account info from all sources
  const mergedData = {
    account_info: {
      // First add account identification from journal
      account_number: accountInfo?.account_number || "",
      server: accountInfo?.server || "",
      accountOpeningDate: accountInfo?.login_time || "",

      // Then add balance info
      ...(balanceData?.account_info || {}),
    },
  };

  // Add latest position data if available
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

// Main function with login credentials as parameters
async function run(username, password, server) {
  let browser;

  // Get server configuration, defaulting to forex if not specified
  const config = SERVER_CONFIGS[server] || SERVER_CONFIGS["forex"];
  let url;

  // Handle dynamic URLs that need the username
  if (typeof config.url === "function") {
    url = config.url(username);
  } else {
    url = config.url;
  }

  // Get cookies path for this server
  const serverCookiesPath = config.cookiesPath;

  try {
    browser = await puppeteer.launch({
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
      ignoreHTTPSErrors: true,
      headless: true,
      timeout: 30000,
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    });

    const page = await browser.newPage();

    // Log the credentials being used (remove in production)
    console.log(
      `Using credentials - Username: ${username}, Password: ${password.substring(
        0,
        2
      )}****`
    );

    // Randomize viewport dimensions slightly
    const width = 1280 + Math.floor(Math.random() * 100);
    const height = 720 + Math.floor(Math.random() * 100);
    await page.setViewport({ width, height });

    // Set a random user agent
    await page.setUserAgent(getRandomUserAgent());

    // Set additional headers to appear more like a real browser
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    });

    // Load cookies if they exist
    if (fs.existsSync(serverCookiesPath)) {
      const cookiesString = fs.readFileSync(serverCookiesPath);
      const cookies = JSON.parse(cookiesString);
      if (cookies.length !== 0) {
        await page.setCookie(...cookies);
        console.log("Session has been loaded from cookies");
      }
    }

    // Modify the WebDriver property to avoid detection
    await page.evaluateOnNewDocument(() => {
      // Overwrite the navigator properties
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });

      // Create a false plugins array
      Object.defineProperty(navigator, "plugins", {
        get: () => [
          {
            0: { type: "application/x-google-chrome-pdf" },
            description: "Portable Document Format",
            filename: "internal-pdf-viewer",
            length: 1,
            name: "Chrome PDF Plugin",
          },
        ],
      });

      // Add language props
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });

      // Add a fake notification API
      if (!window.Notification) {
        window.Notification = {
          permission: "default",
        };
      }

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);

      // Spoof web GL rendering
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) {
          return "Intel Inc.";
        }
        if (parameter === 37446) {
          return "Intel Iris OpenGL Engine";
        }
        return getParameter.apply(this, [parameter]);
      };
    });

    // Navigate to the page with extended timeout
    console.log(`Navigating to ${url}`);
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 120000,
    });

    // Wait for any potential Cloudflare challenge to resolve
    await randomDelay(5000, 10000);

    // Check if we need to solve a Cloudflare challenge
    if ((await page.$("div.cf-browser-verification")) !== null) {
      console.log(
        "Cloudflare challenge detected. Waiting for it to resolve..."
      );

      // Wait for Cloudflare verification to complete
      await page.waitForFunction(
        () => {
          return document.querySelector("div.cf-browser-verification") === null;
        },
        { timeout: 60000 }
      );

      console.log("Cloudflare challenge appears to be solved");
    } else {
      console.log("No Cloudflare challenge detected");
    }

    // Check if we've successfully navigated past Cloudflare
    const pageTitle = await page.title();
    console.log("Current page title:", pageTitle);
    await page.reload({ waitUntil: ["networkidle0", "domcontentloaded"] });
    await randomDelay(3000, 5000);

    // Handle cookie consent buttons using server-specific selectors
    try {
      console.log("Looking for cookie consent buttons...");

      const clickResult = await page.evaluate((config) => {
        // Find all elements matching the acceptAllButton selector
        const buttonElements = document.querySelectorAll(
          config.acceptAllButton
        );
        console.log(`Found ${buttonElements.length} cookie consent buttons`);

        // Check each button for accept text
        for (const button of buttonElements) {
          const buttonText = button.textContent.trim();
          console.log(`Button text: "${buttonText}"`);

          if (buttonText.includes(config.acceptButtonText)) {
            button.click();
            return `Clicked cookie consent button with "${config.acceptButtonText}" text`;
          }
        }

        return "No matching cookie consent buttons found";
      }, config);

      console.log("First button check result:", clickResult);
    } catch (error) {
      console.log("Error when checking cookie consent buttons:", error.message);
    }

    await randomDelay(2000, 3000);

    // Try regular accept buttons
    try {
      console.log("Looking for regular accept buttons...");

      const clickResult = await page.evaluate((config) => {
        // Find all button elements
        const buttonElements = document.querySelectorAll(
          config.acceptRegularButton
        );
        console.log(`Found ${buttonElements.length} regular buttons`);

        // Check each button for accept text
        for (const button of buttonElements) {
          const buttonText = button.textContent.trim();
          console.log(`Button text: "${buttonText}"`);

          if (buttonText.includes(config.acceptRegularButtonText)) {
            button.click();
            return `Clicked regular button with "${config.acceptRegularButtonText}" text`;
          }
        }

        return "No regular buttons with accept text found";
      }, config);

      console.log("Second button check result:", clickResult);
    } catch (error) {
      console.log("Error when checking regular buttons:", error.message);
    }

    await randomDelay(3000, 5000);

    // Save the cookies after accepting any consent dialogs
    const cookies = await page.cookies();
    fs.writeFileSync(serverCookiesPath, JSON.stringify(cookies, null, 2));
    console.log("Cookies have been saved to", serverCookiesPath);

    // Handle iframe navigation if needed
    const iframeUrl = await page.evaluate((iframeSelector) => {
      const iframe = document.querySelector(iframeSelector);
      if (iframe && iframe.src) {
        return iframe.src;
      }
      return null;
    }, config.iframeSelector);

    if (iframeUrl) {
      await page.goto(iframeUrl, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      // Wait for the page to load
      await randomDelay(3000, 5000);
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

    // Login function
    async function performLogin(page, username, password, config) {
      try {
        console.log("Attempting to log in...");

        // Check if login form elements exist
        const formElementsExist = await page.evaluate((config) => {
          const usernameField = document.querySelector(config.usernameField);
          const passwordField = document.querySelector(config.passwordField);
          const submitButton = document.querySelector(config.submitButton);

          return {
            hasUsernameField: !!usernameField,
            hasPasswordField: !!passwordField,
            hasSubmitButton: !!submitButton,
          };
        }, config);

        console.log("Form elements check:", formElementsExist);

        if (
          !formElementsExist.hasUsernameField ||
          !formElementsExist.hasPasswordField ||
          !formElementsExist.hasSubmitButton
        ) {
          console.log("Login form not fully loaded or not found");
          return false;
        }

        // Clear and type username with random delays
        await page.click(config.usernameField, { clickCount: 3 }); // Triple click to select all text
        await randomDelay(300, 500);
        await page.type(config.usernameField, username, {
          delay: Math.floor(Math.random() * 100) + 30,
        });

        await randomDelay(500, 1000);

        // Clear and type password with random delays
        await page.click(config.passwordField, { clickCount: 3 }); // Triple click to select all text
        await randomDelay(300, 500);
        await page.type(config.passwordField, password, {
          delay: Math.floor(Math.random() * 100) + 30,
        });

        await randomDelay(800, 1500);

        // Click the submit button
        await page.click(config.submitButton);

        console.log("Login form submitted");

        // Wait for navigation or response after login
        await randomDelay(3000, 5000);

        // Check if login was successful
        const loginStatus = await page.evaluate((config) => {
          // Check for error messages (this is site-specific and may need adjustment)
          const errorMessages = document.querySelectorAll(config.errorMessages);
          if (errorMessages.length > 0) {
            return {
              success: false,
              message: errorMessages[0].textContent.trim(),
            };
          }

          // Check for success indicators (this is site-specific and may need adjustment)
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

        // Save cookies after login attempt
        const cookies = await page.cookies();
        fs.writeFileSync(serverCookiesPath, JSON.stringify(cookies, null, 2));
        console.log("Updated cookies have been saved");

        return loginStatus.success;
      } catch (error) {
        console.error("Error during login process:", error);
        return false;
      }
    }

    // Perform login with provided credentials
    const loginSuccess = await performLogin(page, username, password, config);
    console.log("Login process completed with result:", loginSuccess);
    await randomDelay(5000, 9000);

    // Create screenshots directory if it doesn't exist
    const screenshotDir = path.join(process.cwd(), "screenshots");
    ensureDirectoryExists(screenshotDir);

    // Take a screenshot and save it
    const screenshotPath = path.join(screenshotDir, `${server}_login.png`);
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });
    console.log(`Screenshot saved to: ${screenshotPath}`);

    // Extract the balance text from the page
    const balanceText = await page.evaluate((balanceSelector) => {
      const balanceElement = document.querySelector(balanceSelector);
      if (balanceElement) {
        return balanceElement.textContent || "";
      }
      return "";
    }, config.balanceElement);

    console.log("Balance text extracted:", balanceText);

    // Convert the balance text to JSON (this happens in Node.js context, not browser)
    const balanceData = convertTradingTextToJson(balanceText);

    // console.log("Balance data:", balanceData);
    const isTradeDataVisible = await page.evaluate(() => {
      // Check for the presence of trade rows
      const tradeRows = document.querySelectorAll(".tbody > .tr[data-id]");
      return tradeRows.length > 0;
    });
    if (!isTradeDataVisible) {
      console.log("Trade data not visible, clicking Trade button...");
      await page.evaluate(() => {
        const tradeButton = document.querySelector('[title="Trade"]');
        if (tradeButton) {
          tradeButton.click();
        } else {
          console.log("Trade button not found");
        }
      });
      await delay(2000); // Give time for the data to load after clicking
    } else {
      console.log("Trade data already visible, skipping Trade button click");
    }
    const tradeData = await extractLatestTradeData(
      page,
      ".tbody > .tr[data-id]"
    );

    // console.log("tradeData data:", tradeData);
    const accountInfo = await getAccountInfoFromJournal(page);

    // console.log("accountInfo data:", accountInfo);
    // Close the browser before returning

    const mergedData = mergeAllData(balanceData, tradeData, accountInfo);
    // await browser.close();
    console.log("Browser closed");

    // Return the balance data
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
// In production, you would pass credentials as arguments
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
