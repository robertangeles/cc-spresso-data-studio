import sys, io, json, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from playwright.sync_api import sync_playwright

start_time = time.time()
console_errors = []
screenshot_count = 0
issues = []

def take_ss(page, name):
    global screenshot_count
    path = f'.gstack/qa-reports/screenshots/{name}.png'
    page.screenshot(path=path, full_page='full' in name)
    screenshot_count += 1
    return path

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})
    page.on('console', lambda msg: console_errors.append({'type': msg.type, 'text': msg.text[:200]}) if msg.type == 'error' else None)

    # LOGIN
    print('=== Login ===')
    page.goto('http://localhost:5174/login', timeout=15000)
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(1000)
    page.fill('input[type="email"]', 'trebor.selegna@outlook.com')
    page.fill('input[type="password"]', 'm3l4nMYL0V301!')
    page.click('button[type="submit"]')
    page.wait_for_timeout(3000)
    page.wait_for_load_state('networkidle')
    print(f'URL: {page.url}')

    # CONTENT LIBRARY
    print('\n=== Content Library ===')
    page.goto('http://localhost:5174/content/library', timeout=15000)
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2500)
    take_ss(page, 'qa-01-library-full')

    cards = page.query_selector_all('[class*="animate-slide-up"]')
    print(f'Cards: {len(cards)}')

    # CARD HOVER
    print('\n=== Card Hover ===')
    if len(cards) > 0:
        cards[0].hover()
        page.wait_for_timeout(500)
        take_ss(page, 'qa-02-hover')
        copy_btn = page.query_selector('[title="Copy to clipboard"]')
        remix_act = page.query_selector('[title="Remix"]')
        del_act = page.query_selector('[title="Delete"]')
        print(f'Copy: {"Y" if copy_btn else "N"}, Remix: {"Y" if remix_act else "N"}, Delete: {"Y" if del_act else "N"}')

    # SELECT 2 ITEMS
    print('\n=== Selection ===')
    checkboxes = page.query_selector_all('input[type="checkbox"]')
    if len(checkboxes) >= 2:
        checkboxes[0].click(force=True)
        page.wait_for_timeout(200)
        checkboxes[1].click(force=True)
        page.wait_for_timeout(500)
        take_ss(page, 'qa-03-selected')
        bulk_remix = page.query_selector('button:has-text("Remix")')
        bulk_del = page.query_selector('button:has-text("Delete")')
        print(f'Bulk Remix: {"Y" if bulk_remix else "N"}, Bulk Delete: {"Y" if bulk_del else "N"}')

    # REMIX MODAL
    print('\n=== Remix Modal ===')
    remix_btn = page.query_selector('button:has-text("Remix")')
    if remix_btn:
        remix_btn.click()
        page.wait_for_timeout(1000)
        take_ss(page, 'qa-04-remix-modal')

        modal_title = page.query_selector('h2:has-text("Remix Content")')
        quick_btn = page.query_selector('button:has-text("Quick Remix")')
        studio_btn = page.query_selector('button:has-text("Open in Studio")')
        print(f'Title: {"Y" if modal_title else "N"}, Quick: {"Y" if quick_btn else "N"}, Studio: {"Y" if studio_btn else "N"}')

        # Quick Remix should be disabled (no platforms)
        if quick_btn:
            dis = quick_btn.is_disabled()
            print(f'Quick disabled (no platforms): {"Y" if dis else "BUG"}')

        # Select a platform then check enabled
        plat_btns = page.query_selector_all('button:has-text("Blog"), button:has-text("LinkedIn"), button:has-text("Facebook")')
        if len(plat_btns) > 0:
            plat_btns[0].click()
            page.wait_for_timeout(300)
            if quick_btn:
                dis2 = quick_btn.is_disabled()
                print(f'Quick enabled (1 platform): {"Y" if not dis2 else "BUG"}')

        take_ss(page, 'qa-05-remix-configured')

        # Close via Escape (tests our fix)
        page.keyboard.press('Escape')
        page.wait_for_timeout(800)

        # Verify modal closed
        modal_still = page.query_selector('h2:has-text("Remix Content")')
        print(f'Modal closed via Escape: {"Y" if not modal_still else "N - BUG"}')

    # Clear selection
    print('\n=== Repurpose Modal ===')
    page.keyboard.press('Escape')  # clear selection
    page.wait_for_timeout(500)

    import_btn = page.query_selector('button:has-text("Import")')
    if import_btn:
        import_btn.click()
        page.wait_for_timeout(1000)
        take_ss(page, 'qa-06-repurpose-paste')

        paste_tab = page.query_selector('button:has-text("Paste Text")')
        url_tab = page.query_selector('button:has-text("From URL")')
        textarea = page.query_selector('textarea')
        print(f'Paste: {"Y" if paste_tab else "N"}, URL tab: {"Y" if url_tab else "N"}, Textarea: {"Y" if textarea else "N"}')

        # Switch to URL tab
        if url_tab:
            url_tab.click()
            page.wait_for_timeout(500)
            take_ss(page, 'qa-07-repurpose-url')
            url_input = page.query_selector('input[type="url"]')
            extract_btn = page.query_selector('button:has-text("Extract")')
            print(f'URL input: {"Y" if url_input else "N"}, Extract: {"Y" if extract_btn else "N"}')

            # Extract should be disabled with no URL
            if extract_btn:
                dis3 = extract_btn.is_disabled()
                print(f'Extract disabled (empty): {"Y" if dis3 else "BUG"}')

        page.keyboard.press('Escape')
        page.wait_for_timeout(500)

    # KEYBOARD SHORTCUTS
    print('\n=== Keyboard Shortcuts ===')
    page.keyboard.press('?')
    page.wait_for_timeout(500)
    kbd_el = page.query_selector('kbd')
    take_ss(page, 'qa-08-shortcuts')
    print(f'Shortcuts panel: {"visible" if kbd_el else "NOT VISIBLE"}')
    page.keyboard.press('?')
    page.wait_for_timeout(300)

    # / focuses search
    page.keyboard.press('/')
    page.wait_for_timeout(300)
    focused = page.evaluate('document.activeElement?.getAttribute("data-search-input")')
    print(f'/ focuses search: {"Y" if focused is not None else "N"}')
    page.keyboard.press('Escape')

    # STATUS FILTER
    print('\n=== Status Filter ===')
    pub_pill = page.query_selector('button:has-text("published")')
    if pub_pill:
        pub_pill.click()
        page.wait_for_timeout(1500)
        cards_filtered = page.query_selector_all('[class*="animate-slide-up"]')
        take_ss(page, 'qa-09-filtered')
        print(f'Published filter: {len(cards_filtered)} cards (was {len(cards)})')
        pub_pill.click()
        page.wait_for_timeout(1000)

    # SEARCH
    print('\n=== Search ===')
    search = page.query_selector('[data-search-input]')
    if search:
        search.fill('record')
        page.wait_for_timeout(1500)
        cards_search = page.query_selector_all('[class*="animate-slide-up"]')
        take_ss(page, 'qa-10-search')
        print(f'Search "record": {len(cards_search)} results')
        search.fill('')
        page.wait_for_timeout(1000)

    # MOBILE
    print('\n=== Mobile Responsive ===')
    page.set_viewport_size({'width': 375, 'height': 812})
    page.wait_for_timeout(1000)
    take_ss(page, 'qa-11-mobile')
    page.set_viewport_size({'width': 768, 'height': 1024})
    page.wait_for_timeout(500)
    take_ss(page, 'qa-12-tablet')
    page.set_viewport_size({'width': 1920, 'height': 1080})

    # DELETE MODAL
    print('\n=== Delete Flow ===')
    page.goto('http://localhost:5174/content/library', timeout=15000)
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)
    cards2 = page.query_selector_all('[class*="animate-slide-up"]')
    if len(cards2) > 0:
        cards2[0].hover()
        page.wait_for_timeout(300)
        del_btn = page.query_selector('[title="Delete"]')
        if del_btn:
            del_btn.click()
            page.wait_for_timeout(500)
            take_ss(page, 'qa-13-delete-modal')
            cancel = page.query_selector('button:has-text("Cancel")')
            print(f'Delete modal: {"Y" if cancel else "N"}')
            if cancel:
                cancel.click()
                page.wait_for_timeout(500)

    # SUMMARY
    duration = round(time.time() - start_time, 1)
    unique = {}
    for e in console_errors:
        k = e['text'][:80]
        if k not in unique:
            unique[k] = e

    print(f'\n{"="*50}')
    print(f'QA SUMMARY')
    print(f'{"="*50}')
    print(f'Duration: {duration}s')
    print(f'Screenshots: {screenshot_count}')
    print(f'Console errors (unique): {len(unique)}')
    for k, e in unique.items():
        print(f'  [{e["type"]}] {e["text"][:120]}')

    browser.close()
    print('\nQA Complete')
