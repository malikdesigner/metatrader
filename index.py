import json
import asyncio
import os
from playwright.async_api import async_playwright
import time
import csv

# Base file name and starting number
json_file_path='dropdown_values.json'
base_file_name = 'website'
file_extension = '.csv'
entry_counter = 1

# Check if a file with the current number exists and increment the number
def get_next_file_name():
    number = 1  # Starting from website7.csv
    while os.path.exists(f"{base_file_name}{number}{file_extension}"):
        number += 1
    return f"{base_file_name}{number}{file_extension}"

# File path for the new file
csv_file_path = get_next_file_name()
if not os.path.exists(json_file_path):
    # Create a placeholder JSON file if it doesn't exist
    with open(json_file_path, 'w') as f:
        json.dump([], f)  # Write an empty JSON list
        print(f"Created JSON file: {json_file_path}")
# Create a new CSV file if it doesn't exist
if not os.path.exists(csv_file_path):
    # Create a placeholder CSV file
    with open(csv_file_path, 'w') as f:
        json.dump([], f)  # Write an empty JSON list (adjust if you want CSV format)
        print(f"Created CSV file: {csv_file_path}")
# Async function to iterate through all combinations
async def iterate_combinations(page, dropdown_values):
    """
    Iterates through all combinations of chapterName, chapterCity, and chapterArea,
    navigates to the member list, extracts data, and navigates to individual member pages.
    """
    chapter_names = dropdown_values.get("chapterName", [])
    chapter_cities = dropdown_values.get("chapterCity", [])
    chapter_areas = dropdown_values.get("chapterArea", [])
    
    base_url = "https://bnicentraldubai.ae/en-AE/memberlist"

    for chapter_name in chapter_names:
        for chapter_city in chapter_cities:
            for chapter_area in chapter_areas:
                # Construct the URL with current combination
                url = (f"{base_url}?chapterName={chapter_name}"
                       f"&chapterCity={chapter_city}"
                       f"&chapterArea={chapter_area}"
                       f"&memberFirstName=&memberKeywords=&memberLastName=&memberCompany=&regionIds=22241")

                print(f"Navigating to URL: {url}")
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=60000)
                    await asyncio.sleep(2)  # Allow time for the page to load

                    # Extract table rows and hrefs from the first column
                    rows_with_links = await page.evaluate('''
                        () => Array.from(document.querySelectorAll("#memberListTable tr"))
                            .slice(1)  // Skip the header row
                            .map(row => {
                                const cells = Array.from(row.querySelectorAll("td"));
                                const link = cells[0]?.querySelector("a")?.href || null;
                                return {
                                    data: cells.map(cell => cell.innerText.trim()),
                                    link
                                };
                            })
                    ''')
                    
                    print(f"Extracted rows with links: {rows_with_links}")

                    detailed_rows = []
                    for row in rows_with_links:
                        if not row['link']:
                            continue

                        # Navigate to the member details page
                        await page.goto(row['link'], wait_until="domcontentloaded")
                        await asyncio.sleep(2)

                        details = await page.evaluate('''
                                    () => {
                                        // Extract phone numbers
                                        const contactElements = Array.from(document.querySelectorAll(".memberContactDetails li a"));
                                        const phones = contactElements.map(el => el.innerText.trim());

                                        // Extract social media links
                                        const socialLinks = Array.from(
                                            document.querySelectorAll(".memberContactDetails .smUrls a")
                                        ).map(a => a.href);

                                        // Extract profile photo links
                                        const profilePhotoLinks = Array.from(document.querySelectorAll(".profilephoto a"))
                                            .map(a => a.href);

                                        // Extract and clean address or company detail
                                        const detailElement = document.querySelector(".widgetMemberCompanyDetail h6");
                                        let address = " "; // Default to empty space if no detail found
                                        if (detailElement) {
                                            address = detailElement.innerHTML
                                                .replace(/<br\\s*\\/?>/g, ", ") // Replace <br> tags with commas
                                                .replace(/<\\/h6>/g, "")        // Remove closing <h6> tags
                                                .replace(/<h6>/g, "")           // Remove opening <h6> tags
                                                .trim();                       // Remove any leading/trailing spaces
                                        }

                                        // Extract company website
                                        let companyWebsite = " ";
                                        const websiteElement = document.querySelector(".memberProfileInfo p a");
                                        if (websiteElement) {
                                            companyWebsite = websiteElement.href.trim();
                                        }

                                        // Extract company logo
                                        let companyLogo = " ";
                                        const logoElement = document.querySelector(".companyLogo img");
                                        if (logoElement) {
                                            companyLogo = logoElement.src.trim();
                                        }

                                        return { phones, socialLinks, profilePhotoLinks, address, companyWebsite, companyLogo };
                                    }
                                ''')


                        # Append extracted details to the row data
                        detailed_row = row['data'] + [
                            details.get("phones", [])[0] if len(details.get("phones", [])) > 0 else "",
                            details.get("phones", [])[1] if len(details.get("phones", [])) > 1 else "",
                            details.get("phones", [])[2] if len(details.get("phones", [])) > 2 else "",
                            details.get("socialLinks", [])[0] if len(details.get("socialLinks", [])) > 0 else "",
                            details.get("socialLinks", [])[1] if len(details.get("socialLinks", [])) > 1 else "",
                            details.get("socialLinks", [])[2] if len(details.get("socialLinks", [])) > 2 else "",
                            details.get("profilePhotoLinks", [])[0] if len(details.get("profilePhotoLinks", [])) > 0 else "",
                            details.get("address", ""),
                            details.get("companyWebsite", ""),
                            details.get("companyLogo", "")
                        ]

                        detailed_rows.append(detailed_row)
                        print(f"Detailed Rows: {detailed_rows}")
                    if not os.path.exists(csv_file_path) or os.path.getsize(csv_file_path) == 0:
                        # Write the header only if the file doesn't exist or is empty
                        with open(csv_file_path, 'w', newline='', encoding='utf-8') as f:
                            writer = csv.writer(f)
                            writer.writerow([
                                "MemberName", "Region", "City", "Street", "Profession", "Company",
                                "Phone1", "Phone2", "Phone3", "SocialMedia1", "SocialMedia2", "SocialMedia3",
                                "ProfilePhotoLink", "Address", "CompanyWebsite", "CompanyLogo"
                            ])

                    # Save detailed rows to CSV
                    with open(csv_file_path, 'a', newline='', encoding='utf-8') as f:
                        writer = csv.writer(f)
                        for detailed_row in detailed_rows:
                            writer.writerow(detailed_row)

                except Exception as e:
                    print(f"Error navigating to {url} or extracting data: {e}")

# Main async function to perform the task
async def main():
    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(
            headless=False,
            args=[
                "--disable-web-security", "--allow-http-screen-capture",
                "--allow-running-insecure-content", "--disable-features=site-per-process",
                "--no-sandbox", "--start-maximized"
            ]
        )
        context = await browser.new_context(ignore_https_errors=True, viewport={"width": 1366, "height": 768})
        page = await context.new_page()

        # Navigate to URL with increased timeout
        url = "https://www.forex.com/en/account-login/metatrader-5-demo-web/"
        retries = 3
        for i in range(retries):
            try:
                await page.goto(url, wait_until='domcontentloaded', timeout=60000)
                print("Page loaded successfully")
                break
            except Exception as e:
                print(f"Attempt {i + 1} failed: {e}")
                if i == retries - 1:
                    raise

        # Retrieve dropdown values
        dropdown_ids = ["chapterName", "chapterCity", "chapterArea"]
        dropdown_values = {}
        await asyncio.sleep(5)  # Initial wait for page content to load

        for dropdown_id in dropdown_ids:
            values = await page.evaluate(f'''
                () => Array.from(document.querySelectorAll("#{dropdown_id} option"))
                    .map(option => option.value)
                    .filter(value => value.trim() !== "")  // Exclude empty or whitespace-only values
            ''')
            dropdown_values[dropdown_id] = values

        print("Dropdown Values:", dropdown_values)

        # Store in JSON format
        with open("dropdown_values.json", "w") as json_file:
            json.dump(dropdown_values, json_file, indent=4)

        print("Dropdown values saved to dropdown_values.json")
        
        # Call the iteration function
        await iterate_combinations(page, dropdown_values)
        
        # Close the browser
        await browser.close()


# Run the asyncio event loop
asyncio.run(main())
