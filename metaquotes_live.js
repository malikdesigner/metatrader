// switch_market_live.js
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const LOCAL_DATA_DIR = path.join(process.cwd(), 'mt5Data_test');
let peakEquity = 0
// Configuration for Switch Markets
const SWITCHMARKETS_CONFIG = {
    url: "https://web.metatrader.app/terminal?mode=demo&lang=en",
    cookiesPath: "switchmarkets_cookies.json",
    usernameField: 'input[name="login"]',
    passwordField: 'input[name="password"]',
    submitButtonText: "Connect to account",
    balanceElement: ".bot-panel",
    errorMessages: ".error-message, .alert-danger, .login-error",
    successIndicators: ".user-profile, .dashboard, .account-info, .logged-in",
    monitoringInterval: 5000, // 5 seconds
};

// API Configuration
const API_CONFIG = {
    endpoint: 'https://clarityfunding-ltd.com/updateJson.php',
    timeout: 30000 // 30 seconds timeout
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

const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

const getRandomUserAgent = () =>
    userAgents[Math.floor(Math.random() * userAgents.length)];

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
 * Convert trading text to JSON
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

    return accountInfo;
}
async function getTodayTotalTrades(accountNumber) {
    const today = new Date().toISOString().slice(0, 10);

    const tradesFile = path.join(process.cwd(), 'trades', `${accountNumber}_trades.json`);
    if (!fs.existsSync(tradesFile)) {
        return 0;
    }

    const tradesData = JSON.parse(fs.readFileSync(tradesFile, 'utf8'));
    const todayTrades = tradesData.filter((trade) => trade.tradeTime.startsWith(today));

    return todayTrades.length;
}
/**
 * Extract Switch Markets trading data
 */
async function extractSwitchMarketsData(page) {
    try {
        // Make sure we're on the Trade tab
        const isTradeSelected = await page.evaluate(() => {
            const tradeTab = document.querySelector('[title="Trade"]');
            return tradeTab && tradeTab.classList.contains("checked");
        });

        if (!isTradeSelected) {
            await page.click('[title="Trade"]');
            await delay(2000);
        }

        // Extract balance data
        const balanceText = await page.evaluate((balanceSelector) => {
            const balanceElement = document.querySelector(balanceSelector);
            return balanceElement ? balanceElement.textContent : "";
        }, SWITCHMARKETS_CONFIG.balanceElement);

        const balanceData = convertTradingTextToJson(balanceText);

        // Extract all trading positions
        const tradingData = await extractAllTradingData(page);

        // Check if Trade tab validation failed
        if (tradingData.error) {
            await page.click('[title="Trade"]');
            await delay(3000);

            const retryData = await extractAllTradingData(page);
            if (retryData.error) {
                throw new Error("Trade tab could not be selected after retry");
            }
            Object.assign(tradingData, retryData);
        }

        // Get account info from journal
        const accountInfo = await getAccountInfoFromJournal(page);
        const tradeData = await page.evaluate(() => {
            const tradeRows = document.querySelectorAll('.tbody > .tr[data-id]');
            const trades = Array.from(tradeRows).map((row) => {
                const id = row.getAttribute('data-id');
                const timeCell = row.querySelector('.td:nth-child(3)');
                const tradeTime = timeCell.getAttribute('title') || timeCell.textContent.trim();
                return { id, tradeTime };
            });
            return trades;
        });

        saveTradesToFile(accountInfo?.account_number || "", tradingData.positions);
        // Save trade data to file
        // const totalTrades = await getTodayTotalTrades(accountInfo?.account_number || "");
        // const now = new Date();
        // const todayFormatted = `${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;

        // // Filter only today's trades
        // const todayTrades = tradingData.positions.filter(pos => {
        //     const tradeTime = pos.Time || "";
        //     console.log("tradeTime")
        //     console.log(tradeTime)
        //     if (tradeTime == "") {
        //         return []
        //     }
        //     return tradeTime.startsWith(todayFormatted);
        // });
        const equity = balanceData.account_info.equity;
        if (equity > peakEquity) {
            peakEquity = equity;
        }
        // await delay(300000)
        let totalTrades = getTotalTrades(accountInfo?.account_number)
        // Merge all data
        const mergedData = {
            account_info: {
                account_number: accountInfo?.account_number || "",
                server: accountInfo?.server || "",
                accountOpeningDate: accountInfo?.login_time || "",
                ...balanceData.account_info,
            },
            peak_equity: peakEquity,

            maxOpenTrades: tradingData.positions ? tradingData.positions.length : 0,
            maxTrade: totalTrades,
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
async function getTotalTrades(accountNumber) {
    const tradesFile = path.join(process.cwd(), 'trades', `${accountNumber}_trades.json`);
    if (!fs.existsSync(tradesFile)) {
        return 0;
    }

    try {
        const tradesData = JSON.parse(fs.readFileSync(tradesFile, 'utf8'));
        return tradesData.length;
    } catch (error) {
        console.error(`Error reading trades file: ${error.message}`);
        return 0;
    }
}
/**
 * Send trading data to API endpoint
 */
async function sendDataToAPI(tradingData) {
    try {
        console.log('\n[API] Sending data update...');

        const response = await axios.post(
            API_CONFIG.endpoint,
            tradingData,
            {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: API_CONFIG.timeout
            }
        );
        console.log(tradingData)
        if (response.data.success) {
            console.log(`[API] ✓ Data uploaded - Positions: ${response.data.positions_count}, Trades: ${response.data.trade_count}`);
            return {
                success: true,
                response: response.data
            };
        } else {
            console.error(`[API] ✗ Error: ${response.data.error}`);
            return {
                success: false,
                error: response.data.error
            };
        }

    } catch (error) {
        console.error(`[API] ✗ Failed: ${error.message}`);
        return {
            success: false,
            error: error.message,
            details: error.response?.data || null
        };
    }
}

/*  for local saving  */
// async function sendDataToAPI(tradingData) {
//     try {
//         console.log('\n[LOCAL API] Saving data locally...');

//         // Extract account number
//         const accountNumber =
//             tradingData?.account_info?.account_number ||
//             tradingData?.account_number ||
//             'unknown_account';

//         if (!accountNumber) {
//             throw new Error('Account number missing in tradingData');
//         }

//         // Create base and account directory
//         const accountDir = path.join(LOCAL_DATA_DIR, accountNumber.toString());
//         if (!fs.existsSync(LOCAL_DATA_DIR)) fs.mkdirSync(LOCAL_DATA_DIR);
//         if (!fs.existsSync(accountDir)) fs.mkdirSync(accountDir);

//         // Format file paths
//         const singleTradeFile = path.join(accountDir, 'singleTrade.json');
//         const allTradeFile = path.join(accountDir, 'allTrade.json');

//         // Save singleTrade.json (overwrite latest)
//         fs.writeFileSync(singleTradeFile, JSON.stringify(tradingData, null, 2));

//         // Append to allTrade.json (historical)
//         let allTrades = [];
//         if (fs.existsSync(allTradeFile)) {
//             const existing = fs.readFileSync(allTradeFile, 'utf8');
//             try {
//                 allTrades = JSON.parse(existing);
//                 if (!Array.isArray(allTrades)) allTrades = [];
//             } catch {
//                 allTrades = [];
//             }
//         }
//         allTrades.push({
//             ...tradingData,
//             saved_at: new Date().toISOString()
//         });
//         fs.writeFileSync(allTradeFile, JSON.stringify(allTrades, null, 2));

//         console.log(`[LOCAL API] ✓ Saved data for account ${accountNumber}`);
//         console.log(`[LOCAL API]   singleTrade.json: ${singleTradeFile}`);
//         console.log(`[LOCAL API]   allTrade.json: ${allTradeFile}`);

//         return {
//             success: true,
//             message: 'Data saved locally',
//             account_number: accountNumber,
//             singleTrade_path: singleTradeFile,
//             allTrade_path: allTradeFile,
//             total_records: allTrades.length
//         };
//     } catch (error) {
//         console.error(`[LOCAL API] ✗ Failed to save locally: ${error.message}`);
//         return {
//             success: false,
//             error: error.message
//         };
//     }
// }
/**
 * Compare trading data to detect changes
 */
function hasDataChanged(oldData, newData) {
    if (!oldData) return true;

    // Check if trade count changed
    if (oldData.tradeCount !== newData.tradeCount) {
        console.log(`[Monitor] Trade count changed: ${oldData.tradeCount} → ${newData.tradeCount}`);
        return true;
    }

    // Check if latest trade changed
    const oldLatest = oldData.latestTrade;
    const newLatest = newData.latestTrade;

    if (!oldLatest && newLatest) return true;
    if (oldLatest && !newLatest) return true;

    if (oldLatest && newLatest) {
        if (oldLatest.ticket !== newLatest.ticket) {
            console.log(`[Monitor] New trade detected: ${newLatest.ticket}`);
            return true;
        }
    }

    // Check if balance changed significantly
    if (Math.abs(oldData.account_info.balance - newData.account_info.balance) > 0.01) {
        console.log(`[Monitor] Balance changed: ${oldData.account_info.balance} → ${newData.account_info.balance}`);
        return true;
    }

    return false;
}
function saveTradesToFile(accountNumber, trades) {
    const tradesDir = path.join(process.cwd(), 'trades');
    if (!fs.existsSync(tradesDir)) {
        fs.mkdirSync(tradesDir);
    }

    const tradesFile = path.join(tradesDir, `${accountNumber}_trades.json`);

    let existingTrades = [];
    if (fs.existsSync(tradesFile)) {
        try {
            existingTrades = JSON.parse(fs.readFileSync(tradesFile, 'utf8'));
        } catch (error) {
            console.error(`Error reading existing trades file: ${error.message}`);
            existingTrades = [];
        }
    }

    const today = new Date().toISOString().slice(0, 10);
    const lastSavedDate = existingTrades.length > 0 && existingTrades[0].tradeTime
        ? existingTrades[0].tradeTime.slice(0, 10)
        : null;

    if (lastSavedDate && lastSavedDate !== today) {
        // If the last saved date is different from today, overwrite the file
        try {
            fs.writeFileSync(tradesFile, JSON.stringify(trades, null, 2));
        } catch (error) {
            console.error(`Error overwriting trades file: ${error.message}`);
        }
    } else {
        // Otherwise, append only new unique trades
        const newTrades = trades.filter(newTrade =>
            !existingTrades.some(existingTrade => existingTrade.id === newTrade.id)
        );
        const allTrades = [...existingTrades, ...newTrades];
        try {
            fs.writeFileSync(tradesFile, JSON.stringify(allTrades, null, 2));
        } catch (error) {
            console.error(`Error appending to trades file: ${error.message}`);
        }
    }
}
/**
 * Start continuous monitoring
 */
async function startContinuousMonitoring(page, initialData, username, password, context) {
    console.log('\n========================================');
    console.log('STARTING CONTINUOUS MONITORING');
    console.log('========================================');
    console.log(`Interval: ${SWITCHMARKETS_CONFIG.monitoringInterval}ms (${SWITCHMARKETS_CONFIG.monitoringInterval / 1000}s)`);
    console.log(`Account: ${initialData.account_info.account_number}`);
    console.log('Press Ctrl+C to stop monitoring');
    console.log('========================================\n');

    let lastData = initialData;
    let updateCount = 0;
    let errorCount = 0;

    const monitoringLoop = async () => {
        try {
            // Check if session is still valid
            const isLoggedIn = await page.evaluate((balanceSelector) => {
                const balanceElement = document.querySelector(balanceSelector);
                const loginForm = document.querySelector('input[name="login"]');
                return balanceElement !== null && loginForm === null;
            }, SWITCHMARKETS_CONFIG.balanceElement);

            if (!isLoggedIn) {
                console.log('\n[Monitor] ⚠ Session expired! Re-logging in...');

                // Fill login form
                await page.fill(SWITCHMARKETS_CONFIG.usernameField, username);
                await randomDelay(500, 1000);
                await page.fill(SWITCHMARKETS_CONFIG.passwordField, password);
                await randomDelay(500, 1000);

                // Click connect button
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

                if (connectClicked) {
                    console.log('[Monitor] ✓ Re-login submitted, waiting...');
                    await randomDelay(7000, 9000);

                    // Save new cookies
                    const cookies = await context.cookies();
                    fs.writeFileSync(
                        SWITCHMARKETS_CONFIG.cookiesPath,
                        JSON.stringify(cookies, null, 2)
                    );
                    console.log('[Monitor] ✓ Session restored and cookies saved');
                } else {
                    throw new Error('Could not find login button during re-authentication');
                }
            }

            // Extract current data
            const currentData = await extractSwitchMarketsData(page);

            // Check if data has changed
            // if (hasDataChanged(lastData, currentData)) {
            updateCount++;
            console.log(`\n[Update #${updateCount}] Changes detected at ${new Date().toLocaleTimeString()}`);

            // Send updated data to API
            const apiResult = await sendDataToAPI(currentData);

            if (apiResult.success) {
                console.log(`[Monitor] ✓ Update successful`);
            } else {
                console.log(`[Monitor] ⚠ API update failed: ${apiResult.error}`);
            }

            lastData = currentData;
            // } else {
            //     process.stdout.write('.');
            // }

            errorCount = 0; // Reset error count on success

        } catch (error) {
            errorCount++;
            console.error(`\n[Monitor] ✗ Error (${errorCount}): ${error.message}`);

            if (errorCount > 10) {
                console.error('[Monitor] Too many consecutive errors. Stopping monitoring.');
                throw error;
            }
        }

        // Schedule next check
        setTimeout(monitoringLoop, SWITCHMARKETS_CONFIG.monitoringInterval);
    };

    // Start the monitoring loop
    monitoringLoop();
}

/**
 * Main login and extraction function with continuous monitoring
 */
async function runSwitchMarkets(username, password, continuousMode = false) {
    let browser;
    let context;
    let page;

    console.log('\n========================================');
    console.log('SWITCH MARKETS DATA EXTRACTION');
    console.log('========================================');
    console.log(`Account: ${username}`);
    console.log(`Mode: ${continuousMode ? 'Continuous Monitoring' : 'Single Extraction'}`);
    console.log(`Started: ${new Date().toLocaleString()}`);
    console.log('========================================\n');

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
                console.log("✓ Session loaded from cookies");
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

        console.log(`Navigating to Switch Markets...`);
        await page.goto(SWITCHMARKETS_CONFIG.url, { waitUntil: "networkidle" });
        await randomDelay(3000, 5000);

        // Take screenshot
        const screenshotDir = path.join(process.cwd(), "/opt/webtrader/");
        ensureDirectoryExists(screenshotDir);
        await page.screenshot({
            path: path.join(screenshotDir, "switchmarkets_after_load.png"),
            fullPage: true,
        });
        await page.evaluate(() => {
            try {

                document.querySelector('.login-nav .title ').click()
            } catch (e) { }
        })
        // Check if already logged in
        console.log("\nChecking login status...");
        const isAlreadyLoggedIn = await page.evaluate((balanceSelector) => {
            const balanceElement = document.querySelector(balanceSelector);
            const loginForm = document.querySelector('input[name="login"]');

            // If balance panel exists and login form doesn't, we're logged in
            return balanceElement !== null && loginForm === null;
        }, SWITCHMARKETS_CONFIG.balanceElement);

        if (isAlreadyLoggedIn) {
            console.log("✓ Already logged in! Using existing session.");
            console.log("  Session restored from cookies successfully");
        } else {
            console.log("Session not found or expired. Logging in...");

            // Handle cookie consent
            try {
                await page.evaluate(() => {
                    document.querySelector('.js-cookie-consent-accept')?.click()
                })
                console.log("✓ Cookie consent handled");
            } catch (err) {
                console.log("No cookie consent popup found");
            }

            await randomDelay(1000, 2000);

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

            console.log("✓ Login submitted");
            await randomDelay(7000, 9000);

            // Take screenshot after login
            await page.screenshot({
                path: path.join(screenshotDir, "switchmarkets_after_login.png"),
                fullPage: true,
            });

            // Save cookies after successful login
            const cookies = await context.cookies();
            fs.writeFileSync(
                SWITCHMARKETS_CONFIG.cookiesPath,
                JSON.stringify(cookies, null, 2)
            );
            console.log("✓ Cookies saved for future sessions");
        }

        // Wait for trading interface to load
        await page.waitForSelector(SWITCHMARKETS_CONFIG.balanceElement, {
            timeout: 15000,
        });

        // Extract initial trading data
        console.log("\n========================================");
        console.log("EXTRACTING INITIAL TRADING DATA");
        console.log("========================================\n");

        const tradingData = await extractSwitchMarketsData(page);
        console.log(tradingData)
        console.log("✓ Initial extraction completed");
        console.log(`  Account: ${tradingData.account_info.account_number}`);
        console.log(`  Total Positions: ${tradingData.totalPositions}`);
        console.log(`  Trade Count: ${tradingData.tradeCount}`);

        // Send initial data to API
        const apiResult = await sendDataToAPI(tradingData);

        if (continuousMode) {
            // Start continuous monitoring - browser stays open
            await startContinuousMonitoring(page, tradingData, username, password, context);

            // Keep the process alive
            return new Promise(() => { }); // Never resolves, keeps running
        } else {
            // Single extraction mode - close browser
            await browser.close();

            console.log('\n========================================');
            console.log('PROCESS COMPLETED');
            console.log('========================================');
            console.log(`Finished: ${new Date().toLocaleString()}`);
            console.log('========================================\n');

            return {
                success: true,
                data: tradingData,
                api_upload: apiResult
            };
        }

    } catch (error) {
        console.error('\n========================================');
        console.error('ERROR OCCURRED');
        console.error('========================================');
        console.error(`Error: ${error.message}`);
        console.error(`Stack: ${error.stack}`);
        console.error('========================================\n');

        if (browser && !continuousMode) {
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
    sendDataToAPI,
    SWITCHMARKETS_CONFIG,
};

// Command line execution
if (require.main === module) {
    const username = process.argv[2];
    const password = process.argv[3];
    const continuous = process.argv[4] === '--continuous' || process.argv[4] === '-c';

    if (!username || !password) {
        console.error('\n========================================');
        console.error('ERROR: Missing Arguments');
        console.error('========================================');
        console.error('Usage: node switchmarkets.js <username> <password> [--continuous]');
        console.error('');
        console.error('Options:');
        console.error('  --continuous, -c    Enable continuous monitoring mode');
        console.error('');
        console.error('Examples:');
        console.error('  node switchmarkets.js myuser mypass123');
        console.error('  node switchmarkets.js myuser mypass123 --continuous');
        console.error('========================================\n');
        process.exit(1);
    }

    runSwitchMarkets(username, password, continuous)
        .then((result) => {
            if (!continuous) {
                console.log("\n========================================");
                console.log("FINAL RESULT");
                console.log("========================================");
                console.log(JSON.stringify(result, null, 2));
                console.log("========================================\n");

                if (result.success && result.api_upload && result.api_upload.success) {
                    console.log("✓ All operations completed successfully!");
                    process.exit(0);
                } else {
                    console.log("⚠ Process completed with warnings/errors");
                    process.exit(1);
                }
            }
        })
        .catch((error) => {
            console.error('\n========================================');
            console.error("EXECUTION FAILED");
            console.error('========================================');
            console.error(error);
            console.error('========================================\n');
            process.exit(1);
        });
}