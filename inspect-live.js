const puppeteer = require('puppeteer');

(async () => {
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();

  console.log('📡 Navigating to https://shipsarthi.com...');
  await page.goto('https://shipsarthi.com', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait a bit
  await new Promise(r => setTimeout(r, 3000));

  // Take screenshot of current page
  console.log('\n📸 Taking screenshot of current page...');
  await page.screenshot({
    path: 'page-current.png',
    fullPage: true
  });
  console.log('✅ Screenshot saved as page-current.png');

  // Get page URL and title
  const url = page.url();
  const title = await page.title();
  console.log(`\n📍 Current URL: ${url}`);
  console.log(`📄 Page Title: ${title}`);

  // Check for login form
  const hasLoginForm = await page.evaluate(() => {
    const emailInput = document.querySelector('input[type="email"]');
    const passwordInput = document.querySelector('input[type="password"]');
    return emailInput && passwordInput ? true : false;
  });

  if (hasLoginForm) {
    console.log('\n🔐 Login form detected. Attempting to log in...');
    try {
      await page.type('input[type="email"]', 'udditalerts247@gmail.com', { delay: 50 });
      await page.type('input[type="password"]', 'jpmcA123', { delay: 50 });

      await page.screenshot({ path: 'before-login.png' });
      console.log('📸 Saved before-login.png');

      await page.click('button[type="submit"]');
      console.log('⏳ Waiting for navigation...');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

      await new Promise(r => setTimeout(r, 2000));

      const newUrl = page.url();
      console.log(`✅ Navigated to: ${newUrl}`);

      await page.screenshot({ path: 'after-login.png', fullPage: true });
      console.log('📸 Saved after-login.png');
    } catch (e) {
      console.error('❌ Login error:', e.message);
    }
  }

  // Check for sidebar
  const sidebarExists = await page.evaluate(() => {
    const items = document.querySelectorAll('.sidebar-item');
    const active = document.querySelector('.sidebar-item.active');
    return {
      totalItems: items.length,
      hasActive: active ? true : false,
      firstItemText: items[0] ? items[0].textContent.trim() : null
    };
  });

  console.log('\n📊 Sidebar Status:', JSON.stringify(sidebarExists, null, 2));

  if (sidebarExists.hasActive) {
    console.log('\n✅ Active sidebar item found! Inspecting...\n');

    const sidebarInfo = await page.evaluate(() => {
      const activeItem = document.querySelector('.sidebar-item.active');
      const styles = window.getComputedStyle(activeItem);
      const rect = activeItem.getBoundingClientRect();
      const afterStyles = window.getComputedStyle(activeItem, '::after');

      return {
        element: {
          width: rect.width,
          height: rect.height,
          left: rect.left,
          right: rect.right
        },
        styles: {
          backgroundColor: styles.backgroundColor,
          zIndex: styles.zIndex,
          width: styles.width
        },
        afterPseudo: {
          content: afterStyles.content,
          width: afterStyles.width,
          height: afterStyles.height,
          backgroundColor: afterStyles.backgroundColor,
          right: afterStyles.right,
          zIndex: afterStyles.zIndex,
          display: afterStyles.display
        }
      };
    });

    console.log(JSON.stringify(sidebarInfo, null, 2));

    await page.screenshot({ path: 'sidebar-active.png' });
    console.log('\n📸 Saved sidebar-active.png');
  }

  // Keep browser open for 10 seconds
  console.log('\n⏳ Keeping browser open for 10 seconds...');
  await new Promise(r => setTimeout(r, 10000));

  await browser.close();
  console.log('✅ Done!');
})();
