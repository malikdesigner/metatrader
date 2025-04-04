const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');


// Apply stealth plugin
puppeteer.use(StealthPlugin());

const cookiesPath = "forex_cookies.json";

// Delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Random delay to mimic human behavior
const randomDelay = async (min = 500, max = 2000) => {
    const randomTime = Math.floor(Math.random() * (max - min + 1)) + min;
    await delay(randomTime);
};
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created directory: ${dirPath}`);
    }
  }
function convertBalanceTextToJson(balanceText) {
    // Clean up any extra spaces and ensure consistent format
    const cleanText = balanceText.replace(/\s+/g, ' ').trim();
    const pattern = /([^:]+):\s*([\d\s]+\.?\d*%?)/g;
    const result = {};
    // Find all matches
    let matches;
    while ((matches = pattern.exec(cleanText)) !== null) {
        let label = matches[1].trim();
        let value = matches[2].trim();

        if (value.includes('%')) {
            result[label] = parseFloat(value.replace(/\s+/g, '').replace('%', ''));
        } else {

            result[label] = parseFloat(value.replace(/\s+/g, ''));
        }
    }

    return result;
}

// User agent rotation
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

// Main function with login credentials as parameters
async function run(username, password) {
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
        executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    });

    try {
        const page = await browser.newPage();

        // Log the credentials being used (remove in production)
        console.log(`Using credentials - Username: ${username}, Password: ${password.substring(0, 2)}****`);

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
            // Overwrite the navigator properties
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });

            // Create a false plugins array
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

            // Add language props
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });

            // Add a fake notification API
            if (!window.Notification) {
                window.Notification = {
                    permission: 'default'
                };
            }

            // Override permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );

            // Spoof web GL rendering
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

        // Navigate to the page with extended timeout
        console.log('Navigating to Forex.com...');
        await page.goto('https://www.forex.com/en/account-login/metatrader-5-demo-web/', {
            waitUntil: 'networkidle2',
            timeout: 120000
        });

        // Wait for any potential Cloudflare challenge to resolve
        await randomDelay(5000, 10000);

        // Check if we need to solve a Cloudflare challenge
        if (await page.$('div.cf-browser-verification') !== null) {
            console.log('Cloudflare challenge detected. Waiting for it to resolve...');

            // Wait for Cloudflare verification to complete
            await page.waitForFunction(() => {
                return document.querySelector('div.cf-browser-verification') === null;
            }, { timeout: 60000 });

            console.log('Cloudflare challenge appears to be solved');
        } else {
            console.log('No Cloudflare challenge detected');
        }

        // Check if we've successfully navigated past Cloudflare
        const pageTitle = await page.title();
        console.log('Current page title:', pageTitle);
        await page.reload({ waitUntil: ["networkidle0", "domcontentloaded"] });
        await randomDelay(3000, 5000);
        try {
            console.log('Looking for a[role="button"] elements with specific text...');

            const clickResult = await page.evaluate(() => {
                // Find all elements with a[role="button"]
                const buttonElements = document.querySelectorAll('a[role="button"]');
                console.log(`Found ${buttonElements.length} a[role="button"] elements`);

                // Check each button for "ACCEPT ALL" text
                for (const button of buttonElements) {
                    const buttonText = button.textContent.trim();
                    console.log(`Button text: "${buttonText}"`);

                    if (buttonText.includes("ACCEPT ALL")) {
                        button.click();
                        return `Clicked a[role="button"] with "ACCEPT ALL" text: "${buttonText}"`;
                    }
                }

                return 'No a[role="button"] elements with "ACCEPT ALL" text found';
            });

            console.log('First button check result:', clickResult);

            // Wait a bit between attempts

        } catch (error) {
            // console.log('Error while checking a[role="button"] elements:', error.message);
        }
        await randomDelay(2000, 3000);
        const iframeUrl = await page.evaluate(() => {
            const iframe = document.querySelector('iframe.meta');
            if (iframe && iframe.src) {
                return iframe.src;
            }
            return null;
        });

        if (iframeUrl) {
            await page.goto(iframeUrl, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });

            // Wait for the page to load
            await randomDelay(3000, 5000);
        }

        // Then check regular button elements
        try {
            console.log('Looking for button elements with specific text...');

            const clickResult = await page.evaluate(() => {
                // Find all button elements
                const buttonElements = document.querySelectorAll('button');
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

            console.log('Second button check result:', clickResult);

            // Wait a bit for any transitions/animations to complete
            await randomDelay(1000, 2000);

        } catch (error) {
            console.log('Error while checking button elements:', error.message);
        }
        await randomDelay(3000, 5000);

        // Save the cookies after accepting any consent dialogs
        const cookies = await page.cookies();
        fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
        console.log('Cookies have been saved to', cookiesPath);

        // Login function
        async function performLogin(page, username, password) {
            try {
                console.log('Attempting to log in...');

                // Check if login form elements exist
                const formElementsExist = await page.evaluate(() => {
                    const usernameField = document.querySelector('input[name="login"]');
                    const passwordField = document.querySelector('input[name="password"]');
                    const submitButton = document.querySelector('button[type="submit"]');

                    return {
                        hasUsernameField: !!usernameField,
                        hasPasswordField: !!passwordField,
                        hasSubmitButton: !!submitButton
                    };
                });

                console.log('Form elements check:', formElementsExist);

                if (!formElementsExist.hasUsernameField || !formElementsExist.hasPasswordField || !formElementsExist.hasSubmitButton) {
                    console.log('Login form not fully loaded or not found');
                    return false;
                }

                // Clear and type username with random delays
                await page.click('input[name="login"]', { clickCount: 3 }); // Triple click to select all text
                await randomDelay(300, 500);
                await page.type('input[name="login"]', username, { delay: Math.floor(Math.random() * 100) + 30 });

                await randomDelay(500, 1000);

                // Clear and type password with random delays
                await page.click('input[name="password"]', { clickCount: 3 }); // Triple click to select all text
                await randomDelay(300, 500);
                await page.type('input[name="password"]', password, { delay: Math.floor(Math.random() * 100) + 30 });

                await randomDelay(800, 1500);

                // Click the submit button
                await page.click('button[type="submit"]');

                console.log('Login form submitted');

                // Wait for navigation or response after login
                await randomDelay(3000, 5000);

                // Check if login was successful
                const loginStatus = await page.evaluate(() => {
                    // Check for error messages (this is site-specific and may need adjustment)
                    const errorMessages = document.querySelectorAll('.error-message, .alert-danger, .login-error');
                    if (errorMessages.length > 0) {
                        return {
                            success: false,
                            message: errorMessages[0].textContent.trim()
                        };
                    }

                    // Check for success indicators (this is site-specific and may need adjustment)
                    const successIndicators = document.querySelectorAll('.user-profile, .dashboard, .account-info, .logged-in');
                    if (successIndicators.length > 0) {
                        return {
                            success: true,
                            message: 'Login successful'
                        };
                    }

                    return {
                        success: null,
                        message: 'Could not determine login status'
                    };
                });

                console.log('Login status:', loginStatus);

                // Save cookies after login attempt
                const cookies = await page.cookies();
                fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
                console.log('Updated cookies have been saved');

                return loginStatus.success;

            } catch (error) {
                console.error('Error during login process:', error);
                return false;
            }
        }

        // Perform login with provided credentials
        const loginSuccess = await performLogin(page, username, password);
        console.log('Login process completed with result:', loginSuccess);
        await randomDelay(3000, 5000);

        const screenshotDir = path.join(process.cwd(), 'screenshots');
        ensureDirectoryExists(screenshotDir);
        
        // Take a screenshot and save it
        const screenshotPath = path.join(screenshotDir, 'login.png');
        await page.screenshot({
          path: screenshotPath,
          fullPage: true
        });

        // Extract the balance text from the page
        const balanceText = await page.evaluate(() => {
            const balanceElement = document.querySelector('.tbody .layout');
            if (balanceElement) {
                return balanceElement.textContent || '';
            }
            return '';
        });

        console.log('Balance text extracted:', balanceText);

        // Convert the balance text to JSON (this happens in Node.js context, not browser)
        const balanceData = convertBalanceTextToJson(balanceText);
        console.log('Balance data:', balanceData);

        // Keep the browser open for inspection
        console.log('Script completed. Browser remains open for inspection.');

        // Return the balance data
        return balanceData;

        // Keep the browser open for inspection
        console.log('Script completed. Browser remains open for inspection.');

    } catch (error) {
        console.error('Error occurred:', error);
    }
}

// Export the run function
module.exports = { run };

// If running this script directly, use these default credentials
// In production, you would pass credentials as arguments
if (require.main === module) {
    const username = process.argv[2] || "default_username";
    const password = process.argv[3] || "default_password";
    run(username, password);
}