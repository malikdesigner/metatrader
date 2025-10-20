const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// Configuration for Switch Markets
const SWITCHMARKETS_CONFIG = {
    url: "https://webtrader.switchmarkets.com/terminal?mode=connect&marketwatch=EURUSD%2CGBPUSD%2CUSDJPY%2CUSDCHF%2CAUDUSD%2CUSDCAD%2CNZDUSD&theme=greenRed&lang=en&utm_campaign=webterminal5&utm_source=SwitchMarkets&themeMode=0",
    cookiesPath: "switchmarkets_cookies.json",
    usernameField: 'input[name="login"]',
    passwordField: 'input[name="password"]',
    submitButtonText: "Connect to account",
    balanceElement: ".bot-panel",
    errorMessages: ".error-message, .alert-danger, .login-error",
    successIndicators: ".user-profile, .dashboard, .account-info, .logged-in",
};
async function clickAcceptAllButtons(page) {
    const clicked = await page.evaluate(() => {
        const clickedButtons = [];

        // Common text variations for accept buttons
        const acceptTexts = [
            'accept all',
            'accept all cookies',
            'accept cookies',
            'allow all',
            'agree',
            'agree and continue',
            'i agree',
            'continue',
            'got it',
            'ok',
            'consent'
        ];

        // Find all clickable elements
        const elements = document.querySelectorAll('button, a, div[role="button"], span[role="button"]');

        for (const element of elements) {
            const text = element.textContent.toLowerCase().trim();
            const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
            const title = (element.getAttribute('title') || '').toLowerCase();
            const id = (element.getAttribute('id') || '').toLowerCase();
            const className = (element.getAttribute('class') || '').toLowerCase();

            // Check if element text/attributes match accept patterns
            const matchesAccept = acceptTexts.some(acceptText =>
                text.includes(acceptText) ||
                ariaLabel.includes(acceptText) ||
                title.includes(acceptText) ||
                id.includes(acceptText.replace(/\s+/g, '')) ||
                className.includes(acceptText.replace(/\s+/g, ''))
            );

            // Only click if element is visible and matches
            if (matchesAccept) {
                const rect = element.getBoundingClientRect();
                const isVisible = rect.width > 0 &&
                    rect.height > 0 &&
                    window.getComputedStyle(element).visibility !== 'hidden' &&
                    window.getComputedStyle(element).display !== 'none';

                if (isVisible) {
                    element.click();
                    clickedButtons.push({
                        text: text,
                        tag: element.tagName,
                        id: element.id,
                        class: element.className
                    });
                }
            }
        }

        return {
            success: clickedButtons.length > 0,
            clickedButtons: clickedButtons,
            message: clickedButtons.length > 0
                ? `Clicked ${clickedButtons.length} accept button(s)`
                : 'No accept buttons found'
        };
    });

    return clicked;
}
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

const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

const getRandomUserAgent = () =>
    userAgents[Math.floor(Math.random() * userAgents.length)];

/**
 * Extract all trading data from the positions table
 */
/**
 * Extract all trading data from the positions table
 */
async function extractAllTradingData(page) {
    return await page.evaluate(() => {
        // IMPORTANT: Check if Trade tab is selected
        const tradeTab = document.querySelector('[title="Trade"]');
        const isTradeSelected = tradeTab && tradeTab.classList.contains("checked");

        if (!isTradeSelected) {
            return {
                error: "Trade tab not selected",
                headers: [],
                positions: [],
                totalPositions: 0,
                tradeCount: 0,
                latestTrade: null
            };
        }

        // Get headers from the header row
        const headerRow = document.querySelector(".tr:has(.th)");
        const headers = [];

        if (headerRow) {
            const headerCells = headerRow.querySelectorAll(".th");
            headerCells.forEach((cell) => {
                const buttonText = cell.querySelector('.content')?.textContent.trim();
                const title = cell.getAttribute("title");
                headers.push(title || buttonText || "");
            });
        }

        // Get all data rows - they have data-id attribute and are direct children of tbody
        const dataRows = document.querySelectorAll('.tbody > .tr[data-id]');
        const positions = [];

        dataRows.forEach((row) => {
            const rowData = {};
            rowData.id = row.getAttribute("data-id");
            const cells = row.querySelectorAll(".td");

            cells.forEach((cell, index) => {
                if (index < headers.length) {
                    const header = headers[index];

                    // Skip empty headers (like the close button column)
                    if (!header) return;

                    if (header === "Type") {
                        // Look for buy/sell in the nested div
                        const typeDiv = cell.querySelector(".svelte-b5o4g9");
                        rowData[header] = typeDiv ? typeDiv.textContent.trim() : "";
                    } else if (header === "Profit") {
                        // Look for profit value in the nested div (could be red or blue)
                        const profitDiv = cell.querySelector(".svelte-b5o4g9");
                        rowData[header] = profitDiv ? profitDiv.textContent.trim() : cell.textContent.trim();
                    } else {
                        // Get value from title attribute first, fallback to textContent
                        const titleValue = cell.getAttribute("title");
                        const textValue = cell.textContent.trim();
                        rowData[header] = titleValue || textValue;
                    }
                }
            });

            positions.push(rowData);
        });

        // Get trade count - count all rows with data-id
        const tradeCount = dataRows.length;

        // Get latest trade info from the last row
        let latestTradeInfo = null;
        if (dataRows.length > 0) {
            const lastRow = dataRows[dataRows.length - 1];
            const cells = lastRow.querySelectorAll('.td');

            // Based on the header order: Symbol, Ticket, Time, Type, Volume, ...
            latestTradeInfo = {
                ticket: cells[1]?.getAttribute('title') || cells[1]?.textContent.trim() || "",
                type: cells[3]?.querySelector('.svelte-b5o4g9')?.textContent.trim() || "",
                volume: cells[4]?.getAttribute('title') || cells[4]?.textContent.trim() || "",
                symbol: cells[0]?.getAttribute('title') || cells[0]?.textContent.trim() || "",
                time: cells[2]?.getAttribute('title') || cells[2]?.textContent.trim() || ""
            };
        }

        return {
            headers: headers.filter(h => h), // Remove empty headers
            positions: positions,
            totalPositions: positions.length,
            tradeCount: tradeCount,
            latestTrade: latestTradeInfo
        };
    });
}

/**
 * Extract account balance information
 */
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
                value.replace(/\s+/g, "")
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

    return result;
}

/**
 * Extract account info from Journal tab
 */
async function getAccountInfoFromJournal(page) {
    const isJournalSelected = await page.evaluate(() => {
        const journalTab = document.querySelector('[title="Journal"]');
        return journalTab && journalTab.classList.contains("checked");
    });

    if (!isJournalSelected) {
        console.log("Journal tab not selected, clicking...");
        await page.click('[title="Journal"]');
        await delay(2000);
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

async function extractSwitchMarketsData(page) {
    try {
        // Make sure we're on the Trade tab
        const isTradeSelected = await page.evaluate(() => {
            const tradeTab = document.querySelector('[title="Trade"]');
            return tradeTab && tradeTab.classList.contains("checked");
        });

        if (!isTradeSelected) {
            console.log("Trade tab not selected, clicking Trade button...");
            await page.click('[title="Trade"]');
            await delay(2000); // Wait for Trade tab to load
        }

        // Extract balance data
        const balanceText = await page.evaluate((balanceSelector) => {
            const balanceElement = document.querySelector(balanceSelector);
            return balanceElement ? balanceElement.textContent : "";
        }, SWITCHMARKETS_CONFIG.balanceElement);

        console.log("Balance text extracted:", balanceText);
        const balanceData = convertTradingTextToJson(balanceText);

        // Extract all trading positions
        const tradingData = await extractAllTradingData(page);

        // Check if Trade tab validation failed
        if (tradingData.error) {
            console.error("Failed to extract trading data:", tradingData.error);
            // Retry clicking Trade tab
            console.log("Retrying Trade tab click...");
            await page.click('[title="Trade"]');
            await delay(3000);

            // Try extraction again
            const retryData = await extractAllTradingData(page);
            if (retryData.error) {
                throw new Error("Trade tab could not be selected after retry");
            }
            Object.assign(tradingData, retryData);
        }

        console.log(`Extracted ${tradingData.totalPositions} positions`);
        console.log(`Total trade count: ${tradingData.tradeCount}`);
        console.log(`Latest trade:`, tradingData.latestTrade);

        // Get account info from journal
        const accountInfo = await getAccountInfoFromJournal(page);

        // Merge all data
        const mergedData = {
            account_info: {
                account_number: accountInfo?.account_number || "",
                server: accountInfo?.server || "",
                accountOpeningDate: accountInfo?.login_time || "",
                ...balanceData.account_info,
            },
            positions: tradingData.positions,
            totalPositions: tradingData.totalPositions,
            tradeCount: tradingData.tradeCount,
            latestTrade: tradingData.latestTrade,
            headers: tradingData.headers,
            timestamp: new Date().toISOString(),
        };

        return mergedData;
    } catch (error) {
        console.error(`Error extracting data: ${error.message}`);
        throw error;
    }
}

/**
 * Main login and extraction function
 */
async function runSwitchMarkets(username, password) {
    let browser;
    let context;
    let page;

    console.log(`Starting Switch Markets extraction for account: ${username}`);

    try {
        browser = await chromium.launch({
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

        context = await browser.newContext({
            viewport: {
                width: 1280 + Math.floor(Math.random() * 100),
                height: 720 + Math.floor(Math.random() * 100),
            },
            userAgent: getRandomUserAgent(),
        });

        // Load cookies if they exist
        if (fs.existsSync(SWITCHMARKETS_CONFIG.cookiesPath)) {
            const cookiesString = fs.readFileSync(SWITCHMARKETS_CONFIG.cookiesPath);
            const cookies = JSON.parse(cookiesString);
            if (cookies.length !== 0) {
                await context.addCookies(cookies);
                console.log("Session loaded from cookies");
            }
        }

        page = await context.newPage();

        await page.setExtraHTTPHeaders({
            "Accept-Language": "en-US,en;q=0.9",
            Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            Connection: "keep-alive",
        });

        console.log(`Navigating to ${SWITCHMARKETS_CONFIG.url}`);
        await page.goto(SWITCHMARKETS_CONFIG.url, { waitUntil: "networkidle" });
        await randomDelay(3000, 5000);

        // Take screenshot
        const screenshotDir = path.join(process.cwd(), "/opt/webtrader/");
        ensureDirectoryExists(screenshotDir);
        await page.screenshot({
            path: path.join(screenshotDir, "switchmarkets_after_load.png"),
            fullPage: true,
        });
        try {

            await page.evaluate(() => {
                document.querySelector('.js-cookie-consent-accept')?.click()
            })
        } catch (err) { }
        // const acceptResult = await clickAcceptAllButtons(page);
        await randomDelay(1000, 2000); // Wait for consent to process

        // Fill login form
        console.log("Filling login credentials...");

        await page.fill(SWITCHMARKETS_CONFIG.usernameField, username);
        await randomDelay(500, 1000);
        await page.fill(SWITCHMARKETS_CONFIG.passwordField, password);
        await randomDelay(500, 1000);

        // Click the "Connect to account" button
        console.log("Looking for Connect button...");
        const connectClicked = await page.evaluate((buttonText) => {
            const buttons = document.querySelectorAll("button");
            for (const button of buttons) {
                if (button.textContent.trim().includes(buttonText)) {
                    button.click();
                    return true;
                }
            }
            return false;
        }, SWITCHMARKETS_CONFIG.submitButtonText);

        if (!connectClicked) {
            throw new Error("Could not find 'Connect to account' button");
        }

        console.log("Login submitted");
        await randomDelay(7000, 9000);

        // Take screenshot after login
        await page.screenshot({
            path: path.join(screenshotDir, "switchmarkets_after_login.png"),
            fullPage: true,
        });

        // Save cookies
        const cookies = await context.cookies();
        fs.writeFileSync(
            SWITCHMARKETS_CONFIG.cookiesPath,
            JSON.stringify(cookies, null, 2)
        );

        // Wait for trading interface to load
        await page.waitForSelector(SWITCHMARKETS_CONFIG.balanceElement, {
            timeout: 15000,
        });

        // Extract all trading data
        console.log("Extracting trading data...");
        const tradingData = await extractSwitchMarketsData(page);

        console.log("Extraction completed successfully");
        console.log(`Total positions: ${tradingData.totalPositions}`);
        // await delay(1000000000)
        await browser.close();

        return {
            success: true,
            data: tradingData,
        };
    } catch (error) {
        console.error(`Error: ${error.message}`);
        if (browser) {
            await browser.close();
        }
        return {
            success: false,
            error: error.message,
        };
    }
}

// Export for use in other scripts
module.exports = {
    runSwitchMarkets,
    extractSwitchMarketsData,
    SWITCHMARKETS_CONFIG,
};

// Command line execution
if (require.main === module) {
    const username = process.argv[2];
    const password = process.argv[3];

    if (!username || !password) {
        console.error("Usage: node switchmarkets.js <username> <password>");
        process.exit(1);
    }

    runSwitchMarkets(username, password)
        .then((result) => {
            console.log("\n=== RESULT ===");
            console.log(JSON.stringify(result, null, 2));
            process.exit(0);
        })
        .catch((error) => {
            console.error("Execution failed:", error);
            process.exit(1);
        });
}