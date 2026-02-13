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

  console.log('🔐 Attempting login...');
  try {
    // Wait for login form
    await page.waitForSelector('input[type="email"], input[type="text"]', { timeout: 10000 });

    // Fill in credentials
    await page.type('input[type="email"], input[type="text"]', 'udditalerts247@gmail.com');
    await page.type('input[type="password"]', 'jpmcA123');

    // Click login button
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")');

    console.log('⏳ Waiting for navigation after login...');
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
    console.log('✅ Logged in successfully!');
  } catch (e) {
    console.log('⚠️  Login might not be required or already logged in');
  }

  // Wait for sidebar to load
  await page.waitForSelector('.sidebar-item.active', { timeout: 10000 });

  console.log('\n📊 INSPECTING ACTIVE SIDEBAR ITEM...\n');

  // Get computed styles and dimensions
  const sidebarInfo = await page.evaluate(() => {
    const activeItem = document.querySelector('.sidebar-item.active');
    if (!activeItem) return { error: 'Active item not found' };

    const styles = window.getComputedStyle(activeItem);
    const rect = activeItem.getBoundingClientRect();

    // Check for ::after pseudo-element
    const afterStyles = window.getComputedStyle(activeItem, '::after');

    return {
      element: {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom
      },
      styles: {
        backgroundColor: styles.backgroundColor,
        position: styles.position,
        zIndex: styles.zIndex,
        width: styles.width,
        overflow: styles.overflow
      },
      afterPseudo: {
        content: afterStyles.content,
        width: afterStyles.width,
        height: afterStyles.height,
        backgroundColor: afterStyles.backgroundColor,
        position: afterStyles.position,
        right: afterStyles.right,
        top: afterStyles.top,
        zIndex: afterStyles.zIndex,
        display: afterStyles.display
      }
    };
  });

  console.log('Active Item Element:', JSON.stringify(sidebarInfo.element, null, 2));
  console.log('\nActive Item Styles:', JSON.stringify(sidebarInfo.styles, null, 2));
  console.log('\n::after Pseudo-element:', JSON.stringify(sidebarInfo.afterPseudo, null, 2));

  // Check layout containers
  const layoutInfo = await page.evaluate(() => {
    const container = document.querySelector('.layout-container');
    const body = document.querySelector('.layout-body');
    const sidebar = document.querySelector('.layout-sidebar');
    const main = document.querySelector('.layout-main');

    return {
      container: container ? {
        overflow: window.getComputedStyle(container).overflow,
        overflowX: window.getComputedStyle(container).overflowX
      } : null,
      body: body ? {
        overflow: window.getComputedStyle(body).overflow
      } : null,
      sidebar: sidebar ? {
        width: window.getComputedStyle(sidebar).width,
        overflow: window.getComputedStyle(sidebar).overflow,
        overflowX: window.getComputedStyle(sidebar).overflowX
      } : null,
      main: main ? {
        marginLeft: window.getComputedStyle(main).marginLeft,
        paddingLeft: window.getComputedStyle(main).paddingLeft,
        backgroundColor: window.getComputedStyle(main).backgroundColor
      } : null
    };
  });

  console.log('\n📐 LAYOUT CONTAINERS:\n');
  console.log(JSON.stringify(layoutInfo, null, 2));

  // Take screenshot
  console.log('\n📸 Taking screenshot...');
  await page.screenshot({
    path: 'sidebar-inspection.png',
    fullPage: false
  });

  console.log('✅ Screenshot saved as sidebar-inspection.png');

  // Close browser after 5 seconds so you can see it
  console.log('\n⏳ Keeping browser open for 5 seconds...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  await browser.close();
  console.log('✅ Done!');
})();
