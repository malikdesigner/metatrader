import json
import asyncio
from playwright.async_api import async_playwright

# URL to navigate to
url = "https://www.forex.com/en/account-login/metatrader-5-demo-web/"

# Load cookies from file
def load_cookies(file_path):
    with open(file_path, 'r') as f:
        return json.load(f)

async def main():
    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(
            headless=False,  # Set to True for headless mode
            args=[
                "--disable-web-security",
                "--allow-running-insecure-content",
                "--no-sandbox",
                "--start-maximized"
            ]
        )
        
        # Create a new browser context
        context = await browser.new_context(
            ignore_https_errors=True,
            viewport={"width": 1366, "height": 768}
        )
        
        # Load cookies from file and fix the format for Playwright
        cookies = load_cookies('paste-2.txt')
        formatted_cookies = []
        
        for cookie in cookies:
            # Fix sameSite field - must be one of "Strict", "Lax", or "None"
            if "sameSite" in cookie:
                sameSite_value = cookie["sameSite"].lower()
                if sameSite_value == "unspecified" or sameSite_value == "no_restriction":
                    cookie["sameSite"] = "None"
                elif sameSite_value == "lax":
                    cookie["sameSite"] = "Lax"
                elif sameSite_value == "strict":
                    cookie["sameSite"] = "Strict"
            
            # Remove id field which isn't needed by Playwright
            if "id" in cookie:
                del cookie["id"]
                
            # Add url field if missing (required by some browsers)
            if "domain" in cookie and not cookie["domain"].startswith("."):
                protocol = "https:" if cookie.get("secure", False) else "http:"
                cookie["url"] = f"{protocol}//{cookie['domain']}"
                
            formatted_cookies.append(cookie)
            
        await context.add_cookies(formatted_cookies)
        
        # Create a new page
        page = await context.new_page()
        
        # Navigate to the URL
        print(f"Navigating to: {url}")
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=60000)
            print("Page loaded successfully")
            
            # Wait for user to interact with the page
            print("Press Enter to close the browser...")
            await asyncio.sleep(30)  # Wait for 30 seconds or adjust as needed
            
        except Exception as e:
            print(f"Error navigating to {url}: {e}")
        
        # Close the browser
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())