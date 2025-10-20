// switch_market_tabs.js
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// Import the original functions
const {
    extractSwitchMarketsData,
    sendDataToAPI,
    SWITCHMARKETS_CONFIG,
} = require("./switch_market_live.js");

// Utility functions
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const randomDelay = async (min = 500, max = 2000) => {
    const randomTime = Math.floor(Math.random() * (max - min + 1)) + min;
    await delay(randomTime);
};

const getRandomUserAgent = () => {
    const userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
};

/**
 * Login to a single account in a tab
 */
async function loginToAccount(page, username, password, tabIndex) {
    const logPrefix = `[Tab ${tabIndex + 1}]`;

    try {
        console.log(`${logPrefix} Navigating to Switch Markets...`);
        await page.goto(SWITCHMARKETS_CONFIG.url, {
            waitUntil: "networkidle",
            timeout: 60000
        });
        await randomDelay(3000, 5000);

        // Check if already logged in
        const isAlreadyLoggedIn = await page.evaluate((balanceSelector) => {
            const balanceElement = document.querySelector(balanceSelector);
            const loginForm = document.querySelector('input[name="login"]');
            return balanceElement !== null && loginForm === null;
        }, SWITCHMARKETS_CONFIG.balanceElement);

        if (isAlreadyLoggedIn) {
            console.log(`${logPrefix} ✓ Already logged in!`);
            return true;
        }

        console.log(`${logPrefix} Logging in as ${username}...`);

        // Handle cookie consent
        try {
            await page.evaluate(() => {
                document.querySelector('.js-cookie-consent-accept')?.click();
            });
        } catch (err) {
            // Ignore if no cookie consent
        }

        await randomDelay(1000, 2000);

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

        if (!connectClicked) {
            throw new Error("Could not find 'Connect to account' button");
        }

        console.log(`${logPrefix} ✓ Login submitted, waiting...`);
        await randomDelay(7000, 9000);

        // Wait for trading interface
        await page.waitForSelector(SWITCHMARKETS_CONFIG.balanceElement, {
            timeout: 15000,
        });

        console.log(`${logPrefix} ✓ Login successful!`);
        return true;

    } catch (error) {
        console.error(`${logPrefix} ✗ Login failed: ${error.message}`);
        return false;
    }
}

/**
 * Monitor a single account tab
 */
async function monitorAccountTab(page, username, password, tabIndex) {
    const logPrefix = `[Tab ${tabIndex + 1} - ${username}]`;
    let lastData = null;
    let updateCount = 0;
    let errorCount = 0;

    const monitorLoop = async () => {
        try {
            // Check if session is still valid
            const isLoggedIn = await page.evaluate((balanceSelector) => {
                const balanceElement = document.querySelector(balanceSelector);
                const loginForm = document.querySelector('input[name="login"]');
                return balanceElement !== null && loginForm === null;
            }, SWITCHMARKETS_CONFIG.balanceElement);

            if (!isLoggedIn) {
                console.log(`${logPrefix} ⚠ Session expired! Re-logging in...`);
                await loginToAccount(page, username, password, tabIndex);
            }

            // Extract current data
            const currentData = await extractSwitchMarketsData(page);

            // Always send data (you can add change detection if needed)
            updateCount++;
            console.log(`${logPrefix} Update #${updateCount} at ${new Date().toLocaleTimeString()}`);

            // Send to API
            const apiResult = await sendDataToAPI(currentData);

            if (apiResult.success) {
                console.log(`${logPrefix} ✓ Data sent - Balance: ${currentData.account_info.balance}, Trades: ${currentData.tradeCount}`);
            } else {
                console.log(`${logPrefix} ⚠ API failed: ${apiResult.error}`);
            }

            lastData = currentData;
            errorCount = 0;

        } catch (error) {
            errorCount++;
            console.error(`${logPrefix} ✗ Error (${errorCount}): ${error.message}`);

            if (errorCount > 10) {
                console.error(`${logPrefix} Too many errors. Will retry in next cycle...`);
                errorCount = 0; // Reset to keep trying
            }
        }

        // Schedule next check
        setTimeout(monitorLoop, SWITCHMARKETS_CONFIG.monitoringInterval);
    };

    // Start monitoring
    monitorLoop();
}

/**
 * Main function to run multiple accounts in one browser
 */
async function runMultipleAccounts(accounts) {
    console.log('\n========================================');
    console.log('MULTI-ACCOUNT BROWSER MANAGER');
    console.log('========================================');
    console.log(`Total Accounts: ${accounts.length}`);
    console.log(`Started: ${new Date().toLocaleString()}`);
    console.log('========================================\n');

    let browser;

    try {
        // Launch single browser instance
        browser = await chromium.launch({
            headless: true,
            args: [
                "--disable-web-security",
                "--disable-features=IsolateOrigins,site-per-process",
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--start-maximized",
            ],
        });

        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: getRandomUserAgent(),
        });

        // Open tabs and login to all accounts
        const pages = [];
        for (let i = 0; i < accounts.length; i++) {
            const { username, password } = accounts[i];
            const page = await context.newPage();
            pages.push({ page, username, password, index: i });

            console.log(`\n[Tab ${i + 1}/${accounts.length}] Opening account ${username}...`);

            // Login to this account
            const loginSuccess = await loginToAccount(page, username, password, i);

            if (loginSuccess) {
                console.log(`[Tab ${i + 1}] ✓ Ready for monitoring`);
            } else {
                console.log(`[Tab ${i + 1}] ⚠ Login failed, will retry during monitoring`);
            }

            // Small delay between opening tabs
            await delay(2000);
        }

        console.log('\n========================================');
        console.log('ALL TABS OPENED - STARTING MONITORING');
        console.log('========================================\n');

        // Start monitoring all tabs in parallel
        for (const { page, username, password, index } of pages) {
            monitorAccountTab(page, username, password, index);
        }

        console.log('✓ All monitoring loops started');
        console.log('Press Ctrl+C to stop all monitoring\n');

        // Keep process alive
        return new Promise(() => { });

    } catch (error) {
        console.error('\n========================================');
        console.error('ERROR OCCURRED');
        console.error('========================================');
        console.error(`Error: ${error.message}`);
        console.error('========================================\n');

        if (browser) {
            await browser.close();
        }
        throw error;
    }
}

// Command line execution
if (require.main === module) {
    // Read accounts from command line or config file
    const accountsFile = process.argv[2];

    if (!accountsFile) {
        console.error('\n========================================');
        console.error('ERROR: Missing Arguments');
        console.error('========================================');
        console.error('Usage: node multi_account_manager.js <accounts_file.json>');
        console.error('');
        console.error('accounts_file.json format:');
        console.error('[');
        console.error('  {"username": "account1", "password": "pass1"},');
        console.error('  {"username": "account2", "password": "pass2"}');
        console.error(']');
        console.error('========================================\n');
        process.exit(1);
    }

    // Read accounts from JSON file
    try {
        const accountsData = fs.readFileSync(accountsFile, 'utf8');
        const accounts = JSON.parse(accountsData);

        if (!Array.isArray(accounts) || accounts.length === 0) {
            throw new Error('Accounts file must contain an array of account objects');
        }

        console.log(`✓ Loaded ${accounts.length} accounts from ${accountsFile}`);

        runMultipleAccounts(accounts)
            .then(() => {
                console.log('Process running...');
            })
            .catch((error) => {
                console.error('Execution failed:', error);
                process.exit(1);
            });

    } catch (error) {
        console.error(`Failed to read accounts file: ${error.message}`);
        process.exit(1);
    }
}

module.exports = {
    runMultipleAccounts,
    loginToAccount,
    monitorAccountTab,
};