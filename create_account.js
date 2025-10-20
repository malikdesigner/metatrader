const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require("path");
const urls = {
    "switchmarket": "https://webtrader.switchmarkets.com/terminal?mode=connect&marketwatch=EURUSD%2CGBPUSD%2CUSDJPY%2CUSDCHF%2CAUDUSD%2CUSDCAD%2CNZDUSD&theme=greenRed&lang=en&utm_campaign=webterminal5&utm_source=SwitchMarkets&themeMode=0",
    "metaquotes": "https://web.metatrader.app/terminal?mode=demo&lang=en"
}
// Apply stealth plugin
puppeteer.use(StealthPlugin());

const cookiesPath = "create-account-cookies.txt";

// Delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Random delay to mimic human behavior
const randomDelay = async (min = 500, max = 2000) => {
    const randomTime = Math.floor(Math.random() * (max - min + 1)) + min;
    await delay(randomTime);
};

// User agent rotation
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Created directory: ${dirPath}`);
    }
}

// Function to extract account details from the success page
async function extractAccountDetails(page) {
    try {
        console.log('Extracting account details...');

        const accountDetails = await page.evaluate(() => {
            // Find the form with account details
            const form = document.querySelector('form.form');
            if (!form) return null;

            const details = {};
            const content = form.querySelector('.content');

            if (content) {
                const labels = content.querySelectorAll('.label');

                labels.forEach(label => {
                    const labelText = label.textContent.trim();
                    const nextElement = label.nextElementSibling;

                    if (nextElement) {
                        let value = nextElement.textContent.trim();

                        // Handle private fields (Login, Password, Investor)
                        const privateElement = nextElement.querySelector('.private');
                        if (privateElement) {
                            value = privateElement.textContent.trim();
                        }

                        // Map the labels to keys
                        switch (labelText) {
                            case 'Name':
                                details.name = value;
                                break;
                            case 'Server':
                                details.server = value;
                                break;
                            case 'Account type':
                                details.accountType = value;
                                break;
                            case 'Deposit':
                                details.deposit = value;
                                break;
                            case 'Login':
                                details.login = value;
                                break;
                            case 'Password':
                                details.password = value;
                                break;
                            case 'Investor':
                                // Extract just the investor password, removing the "(Read only password)" text
                                details.investorPassword = value.split('(')[0].trim();
                                break;
                        }
                    }
                });
            }

            // Also get the title
            const title = form.querySelector('.title');
            if (title) {
                details.status = title.textContent.trim();
            }

            return details;
        });

        return accountDetails;
    } catch (error) {
        console.error('Error extracting account details:', error);
        return null;
    }
}

// Main account creation function
async function createAccount(params) {
    const {
        firstName = '',
        lastName = '',
        email = '',
        phone = '',
        country = '',
        accountType = 'switch_market',
        currency = 'USD',
        leverage = '1:100',
        password = '',
        ...additionalParams
    } = params;

    console.log('Starting account creation with params:', {
        firstName,
        lastName,
        email,
        phone,
        accountType
    });

    const browser = await puppeteer.launch({
        args: [
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
        ignoreHTTPSErrors: true,
        headless: true,
        timeout: 30000,
        executablePath: '/usr/bin/google-chrome'
        //executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    });

    try {
        const page = await browser.newPage();

        // Randomize viewport dimensions slightly
        const width = 1280 + Math.floor(Math.random() * 100);
        const height = 720 + Math.floor(Math.random() * 100);
        await page.setViewport({ width, height });

        // Set a random user agent
        await page.setUserAgent(getRandomUserAgent());

        // Set additional headers to appear more like a real browser
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        });

        // Load cookies if they exist
        if (fs.existsSync(cookiesPath)) {
            const cookiesString = fs.readFileSync(cookiesPath);
            const cookies = JSON.parse(cookiesString);
            if (cookies.length !== 0) {
                await page.setCookie(...cookies);
                console.log('Session has been loaded from cookies');
            }
        }

        // Modify the WebDriver property to avoid detection
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });

            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    {
                        0: { type: "application/x-google-chrome-pdf" },
                        description: "Portable Document Format",
                        filename: "internal-pdf-viewer",
                        length: 1,
                        name: "Chrome PDF Plugin"
                    }
                ],
            });

            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });

            if (!window.Notification) {
                window.Notification = {
                    permission: 'default'
                };
            }

            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );

            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function (parameter) {
                if (parameter === 37445) {
                    return 'Intel Inc.';
                }
                if (parameter === 37446) {
                    return 'Intel Iris OpenGL Engine';
                }
                return getParameter.apply(this, [parameter]);
            };
        });
        const url = urls[accountType];
        // Navigate to Switch Markets WebTrader5
        console.log('Navigating to Switch Markets...');
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 120000
        });

        // Wait for any potential Cloudflare challenge to resolve
        await randomDelay(5000, 10000);

        // Check if we need to solve a Cloudflare challenge
        if (await page.$('div.cf-browser-verification') !== null) {
            console.log('Cloudflare challenge detected. Waiting for it to resolve...');
            await page.waitForFunction(() => {
                return document.querySelector('div.cf-browser-verification') === null;
            }, { timeout: 60000 });
            console.log('Cloudflare challenge appears to be solved');
        }

        const pageTitle = await page.title();
        console.log('Current page title:', pageTitle);

        await randomDelay(3000, 5000);

        // Handle cookie consent if present
        try {
            const cookieClickResult = await page.evaluate(() => {
                const buttonElements = document.querySelectorAll('a[role="button"], button');

                for (const button of buttonElements) {
                    const buttonText = button.textContent.trim();

                    if (buttonText.includes("ACCEPT ALL") ||
                        buttonText.includes("Accept") ||
                        buttonText.includes("Accept All")) {
                        button.click();
                        return `Clicked cookie consent: "${buttonText}"`;
                    }
                }

                return 'No cookie consent found';
            });

            console.log('Cookie consent result:', cookieClickResult);
            await randomDelay(2000, 3000);

        } catch (error) {
            console.log('No cookie consent handling needed');
        }
        const screenshotDir = path.join(process.cwd(), "/opt/webtrader/");
        ensureDirectoryExists(screenshotDir);
        await page.screenshot({
            path: path.join(screenshotDir, "switchmarkets_after_load.png"),
            fullPage: true,
        });
        // Click on "Open Demo account" button
        console.log('Looking for "Open Demo account" button...');
        const demoButtonClicked = await page.evaluate(() => {
            const divs = document.querySelectorAll('div');
            for (const div of divs) {
                if (div.textContent.trim() === 'Open Demo account') {
                    div.click();
                    return true;
                }
            }
            return false;
        });

        if (demoButtonClicked) {
            console.log('Clicked "Open Demo account" button');
            await randomDelay(3000, 5000);
        } else {
            console.log('Could not find "Open Demo account" button');
            return {
                error: 'Could not find "Open Demo account" button',
                success: false
            };
        }

        // Wait for form to appear
        await page.waitForSelector('input[name="firstName"]', { timeout: 10000 });
        console.log('Registration form loaded');

        // Fill in the form fields
        console.log('Filling in firstName...');
        await page.click('input[name="firstName"]');
        await randomDelay(300, 500);
        await page.type('input[name="firstName"]', firstName, { delay: Math.floor(Math.random() * 100) + 30 });

        await randomDelay(500, 1000);

        console.log('Filling in lastName (secondName)...');
        await page.click('input[name="secondName"]');
        await randomDelay(300, 500);
        await page.type('input[name="secondName"]', lastName, { delay: Math.floor(Math.random() * 100) + 30 });

        await randomDelay(500, 1000);

        console.log('Filling in email...');
        await page.click('input[name="email"]');
        await randomDelay(300, 500);
        await page.type('input[name="email"]', email, { delay: Math.floor(Math.random() * 100) + 30 });

        await randomDelay(500, 1000);

        console.log('Filling in phone...');
        await page.click('input[name="phone"]');
        await randomDelay(300, 500);
        await page.type('input[name="phone"]', phone, { delay: Math.floor(Math.random() * 100) + 30 });

        await randomDelay(800, 1500);

        // Click the disclaimer checkbox
        console.log('Clicking disclaimer checkbox...');
        await page.click('input[name="disclaimer"]');
        await randomDelay(1000, 2000);

        // Submit the form
        console.log('Submitting form...');
        await page.click('button[type="submit"]');

        // Wait for the success page to load
        console.log('Waiting for account creation confirmation...');
        await page.waitForSelector('form.form .title', { timeout: 30000 });

        await randomDelay(2000, 3000);

        // Extract account details
        const accountDetails = await extractAccountDetails(page);

        if (accountDetails) {
            console.log('Account created successfully!');
            console.log('Account Details:', accountDetails);

            // Save cookies after successful account creation
            const cookies = await page.cookies();
            fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
            console.log('Cookies have been saved');

            // Keep browser open for a moment
            await randomDelay(5000, 8000);

            return {
                success: true,
                message: 'Account created successfully',
                accountDetails: accountDetails,
                inputData: {
                    firstName,
                    lastName,
                    email,
                    phone
                },
                timestamp: new Date().toISOString()
            };
        } else {
            console.log('Could not extract account details');
            return {
                success: false,
                error: 'Account may have been created but details could not be extracted',
                inputData: {
                    firstName,
                    lastName,
                    email,
                    phone
                }
            };
        }

    } catch (error) {
        console.error('Error during account creation:', error);
        return {
            error: error.message,
            success: false
        };
    } finally {
        // Uncomment to close browser automatically
        // await browser.close();
        console.log('Account creation process completed. Browser kept open for inspection.');
    }
}

// Export the function
module.exports = {
    createAccount
};

// Allow running standalone for testing
if (require.main === module) {
    const testParams = {
        firstName: 'Ted',
        lastName: 'Lasso',
        email: 'fegici2906@protonza.com',
        phone: '+1234567890'
    };

    createAccount(testParams)
        .then(result => console.log('Result:', JSON.stringify(result, null, 2)))
        .catch(error => console.error('Error:', error));
}