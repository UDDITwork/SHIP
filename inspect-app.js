const puppeteer = require('puppeteer');

(async () => {
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--start-maximized']
  });

  const page = await browser.newPage();

  console.log('📡 Navigating to https://shipsarthi.com...');
  await page.goto('https://shipsarthi.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));

  console.log('🔐 Logging in...');

  // Wait for login form
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
  await page.waitForSelector('input[type="password"], input[name="password"]', { timeout: 10000 });

  // Fill login form
  const emailInput = await page.$('input[type="email"], input[name="email"]');
  const passwordInput = await page.$('input[type="password"], input[name="password"]');

  await emailInput.type('udditalerts247@gmail.com', { delay: 50 });
  await passwordInput.type('jpmcA123', { delay: 50 });

  // Submit form
  console.log('⏳ Submitting login...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
    page.click('button[type="submit"]')
  ]);

  await new Promise(r => setTimeout(r, 3000));

  const currentUrl = page.url();
  console.log(`✅ Logged in! Current URL: ${currentUrl}`);

  // Take screenshot of logged-in page
  await page.screenshot({ path: 'app-logged-in.png', fullPage: true });
  console.log('📸 Saved app-logged-in.png');

  // Check for sidebar
  const hasSidebar = await page.evaluate(() => {
    const sidebar = document.querySelector('.layout-sidebar');
    const items = document.querySelectorAll('.sidebar-item');
    const active = document.querySelector('.sidebar-item.active');

    return {
      hasSidebar: sidebar ? true : false,
      sidebarText: sidebar ? sidebar.textContent.substring(0, 100) : null,
      itemCount: items.length,
      hasActive: active ? true : false,
      activeText: active ? active.textContent.trim() : null
    };
  });

  console.log('\n📊 SIDEBAR STATUS:');
  console.log(JSON.stringify(hasSidebar, null, 2));

  if (!hasSidebar.hasActive && hasSidebar.itemCount > 0) {
    console.log('\n📍 Clicking first sidebar item to activate it...');
    await page.click('.sidebar-item');
    await new Promise(r => setTimeout(r, 1000));
  }

  // Now inspect the active sidebar item
  console.log('\n🔍 INSPECTING ACTIVE SIDEBAR ITEM:\n');

  const inspection = await page.evaluate(() => {
    const activeItem = document.querySelector('.sidebar-item.active');
    if (!activeItem) return { error: 'No active item found' };

    const styles = window.getComputedStyle(activeItem);
    const rect = activeItem.getBoundingClientRect();
    const afterStyles = window.getComputedStyle(activeItem, '::after');

    // Also check parent containers
    const container = document.querySelector('.layout-container');
    const body = document.querySelector('.layout-body');
    const sidebar = document.querySelector('.layout-sidebar');
    const main = document.querySelector('.layout-main');

    return {
      activeItem: {
        text: activeItem.textContent.trim(),
        position: {
          width: rect.width,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top
        },
        computedStyles: {
          backgroundColor: styles.backgroundColor,
          width: styles.width,
          position: styles.position,
          zIndex: styles.zIndex,
          borderRadius: styles.borderRadius,
          overflow: styles.overflow
        }
      },
      afterElement: {
        content: afterStyles.content,
        display: afterStyles.display,
        position: afterStyles.position,
        width: afterStyles.width,
        height: afterStyles.height,
        right: afterStyles.right,
        top: afterStyles.top,
        backgroundColor: afterStyles.backgroundColor,
        zIndex: afterStyles.zIndex
      },
      containers: {
        layoutContainer: container ? {
          overflow: window.getComputedStyle(container).overflow,
          overflowX: window.getComputedStyle(container).overflowX,
          overflowY: window.getComputedStyle(container).overflowY
        } : null,
        layoutBody: body ? {
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
          backgroundColor: window.getComputedStyle(main).backgroundColor,
          position: {
            left: main.getBoundingClientRect().left
          }
        } : null
      }
    };
  });

  console.log(JSON.stringify(inspection, null, 2));

  // Take close-up screenshot of sidebar
  const sidebarRect = await page.evaluate(() => {
    const sidebar = document.querySelector('.layout-sidebar');
    if (!sidebar) return null;
    const rect = sidebar.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width + 100, // Include some extra space to see extension
      height: rect.height
    };
  });

  if (sidebarRect) {
    await page.screenshot({
      path: 'sidebar-closeup.png',
      clip: sidebarRect
    });
    console.log('\n📸 Saved sidebar-closeup.png');
  }

  // Full page screenshot
  await page.screenshot({ path: 'app-full-page.png', fullPage: true });
  console.log('📸 Saved app-full-page.png');

  console.log('\n⏳ Keeping browser open for 15 seconds so you can see it...');
  await new Promise(r => setTimeout(r, 15000));

  await browser.close();
  console.log('✅ Inspection complete!');
})();
