"""Test the signup-to-checkout funnel: Landing → Pro click → Register → Verify → Checkout redirect"""
import time
import json
import requests
from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = "d:/My AI Projects/cc-content-builder/.gstack/qa-reports/screenshots"
BASE_URL = "http://localhost:5173"
API_URL = "http://localhost:3003/api"
TEST_EMAIL = f"qatest_stripe_{int(time.time())}@protonmail.com"
TEST_PASSWORD = "TestPass123!"
TEST_NAME = "QA Stripe Test"

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 720})

        # Step 1: Landing page
        print("STEP 1: Navigate to landing page")
        page.goto(BASE_URL)
        page.wait_for_load_state("load")
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{SCREENSHOT_DIR}/01-landing.png", full_page=False)
        print("  OK - Landing page loaded")

        # Step 2: Scroll to pricing section and screenshot
        print("STEP 2: Scroll to pricing section")
        # Scroll down to find pricing cards
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.7)")
        page.wait_for_timeout(1000)
        page.screenshot(path=f"{SCREENSHOT_DIR}/02-pricing-section.png", full_page=False)

        # Find the Pro plan "Get Started" button
        pro_buttons = page.locator("button:has-text('Get Started')").all()
        print(f"  Found {len(pro_buttons)} 'Get Started' buttons")

        if len(pro_buttons) < 2:
            # Try scrolling more
            page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.8)")
            page.wait_for_timeout(1000)
            pro_buttons = page.locator("button:has-text('Get Started')").all()
            print(f"  After more scroll: {len(pro_buttons)} buttons")

        # The Pro plan should be the second button (Free=first, Pro=second, Ultra=third)
        if len(pro_buttons) >= 2:
            print("  Clicking Pro plan 'Get Started' button (2nd button)")
            pro_buttons[1].click()
        else:
            print("  ERROR: Could not find Pro plan button")
            page.screenshot(path=f"{SCREENSHOT_DIR}/02-error-no-pro-button.png", full_page=True)
            browser.close()
            return

        # Step 3: Auth slide-over should open with register form
        print("STEP 3: Fill registration form")
        page.wait_for_timeout(500)
        page.screenshot(path=f"{SCREENSHOT_DIR}/03-auth-slideover.png", full_page=False)

        # Check localStorage for pendingPlanId
        pending = page.evaluate("localStorage.getItem('pendingPlanId')")
        print(f"  pendingPlanId in localStorage: {pending}")
        if not pending:
            print("  WARNING: pendingPlanId not set in localStorage!")

        # Fill the registration form
        # Look for name, email, password fields
        name_input = page.locator("input[autocomplete='name']").first
        email_input = page.locator("input[type='email']").first
        password_input = page.locator("input[autocomplete='new-password']").first

        if name_input.is_visible():
            name_input.fill(TEST_NAME)
            print("  Filled name")
        else:
            print("  WARNING: Name field not visible - might be in login mode")
            # Check if we need to switch to register tab
            register_tab = page.locator("button:has-text('Create account')")
            if register_tab.is_visible():
                register_tab.click()
                page.wait_for_timeout(300)
                name_input = page.locator("input[autocomplete='name']").first
                name_input.fill(TEST_NAME)
                print("  Switched to register tab and filled name")

        email_input.fill(TEST_EMAIL)
        print(f"  Filled email: {TEST_EMAIL}")
        password_input.fill(TEST_PASSWORD)
        print("  Filled password")

        page.screenshot(path=f"{SCREENSHOT_DIR}/04-form-filled.png", full_page=False)

        # Step 4: Submit registration
        print("STEP 4: Submit registration")
        submit_btn = page.locator("button[type='submit']:has-text('Create account')").first
        submit_btn.click()

        # Wait for navigation to verify-email page
        page.wait_for_timeout(3000)
        page.screenshot(path=f"{SCREENSHOT_DIR}/05-after-register.png", full_page=False)

        current_url = page.url
        print(f"  Current URL: {current_url}")

        if "/verify-email" in current_url:
            print("  OK - Redirected to verify-email page")
        else:
            print(f"  WARNING: Expected /verify-email, got {current_url}")

        # Step 5: Check the DB for pendingPlanId on the user
        print("STEP 5: Verify pendingPlanId saved in DB")
        try:
            # Login via API to check
            login_resp = requests.post(f"{API_URL}/auth/login", json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD
            })
            if login_resp.status_code == 200:
                token = login_resp.json()["data"]["accessToken"]
                # Check verification status which includes pendingPlanId
                status_resp = requests.get(f"{API_URL}/auth/verification-status",
                    headers={"Authorization": f"Bearer {token}"})
                if status_resp.status_code == 200:
                    status_data = status_resp.json()["data"]
                    pending_plan = status_data.get("pendingPlanId")
                    is_verified = status_data.get("isEmailVerified")
                    print(f"  pendingPlanId from DB: {pending_plan}")
                    print(f"  isEmailVerified: {is_verified}")
                    if pending_plan:
                        print("  OK - pendingPlanId persisted to DB!")
                    else:
                        print("  FAIL - pendingPlanId NOT saved to DB")
                else:
                    print(f"  Verification status check failed: {status_resp.status_code}")
            else:
                print(f"  Login failed: {login_resp.status_code} - {login_resp.text[:200]}")
        except Exception as e:
            print(f"  Error checking DB: {e}")

        # Step 6: Simulate email verification via API
        print("STEP 6: Simulate email verification")
        try:
            # Use the token we already have to check verification
            # We need the verification token from the DB
            # For testing, let's verify via the API if possible
            verify_resp = requests.post(f"{API_URL}/auth/resend-verification",
                headers={"Authorization": f"Bearer {token}"})
            print(f"  Resend verification: {verify_resp.status_code}")
        except Exception as e:
            print(f"  Error: {e}")

        page.screenshot(path=f"{SCREENSHOT_DIR}/06-verify-email-page.png", full_page=False)

        print("\n=== SUMMARY ===")
        print(f"Email: {TEST_EMAIL}")
        print(f"pendingPlanId in localStorage: {pending}")
        print(f"pendingPlanId in DB: {pending_plan if 'pending_plan' in dir() else 'UNKNOWN'}")
        print(f"Current URL: {page.url}")
        print("Next: User clicks verify link in email → VerifyEmailPage polls → detects verification → auto-redirects to Stripe Checkout")

        browser.close()

if __name__ == "__main__":
    run()
