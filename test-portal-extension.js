const puppeteer = require('puppeteer');

(async () => {
  console.log('🚀 Launching browser to test React Portal extension...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();

  console.log('📡 Navigating to https://shipsarthi.com/login...');
  await page.goto('https://shipsarthi.com/login', { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));

  console.log('🔐 Logging in...');
  // Fill login form
  await page.waitForSelector('input[name="email"]', { timeout: 10000 });
  await page.type('input[name="email"]', 'udditalerts247@gmail.com', { delay: 50 });
  await page.type('input[name="password"]', 'jpmcA123', { delay: 50 });

  // Click submit and wait for navigation
  await page.click('button[type="submit"]');
  console.log('⏳ Waiting for navigation...');
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });

  console.log('✅ Logged in successfully!');

  // Get current URL after login
  const currentUrl = page.url();
  console.log(`📍 Current URL after login: ${currentUrl}`);

  await new Promise(r => setTimeout(r, 3000));

  // Wait for sidebar to load (or continue if not found)
  const sidebarLoaded = await page.waitForSelector('.layout-sidebar', { timeout: 10000 })
    .then(() => true)
    .catch(() => false);

  if (sidebarLoaded) {
    console.log('✅ Sidebar loaded!');
  } else {
    console.log('⚠️  Sidebar not found - might be on different page');
    await page.screenshot({ path: 'after-login.png', fullPage: true });
    console.log('📸 Saved after-login.png');
  }

  console.log('\n🔍 INSPECTING PORTAL EXTENSION...\n');

  // Check for portal-rendered extension in document.body
  const portalInfo = await page.evaluate(() => {
    // Find all direct children of body
    const bodyChildren = Array.from(document.body.children);

    // Find portal div (should be a fixed-position div with cream background)
    const portalDivs = bodyChildren.filter(el => {
      const styles = window.getComputedStyle(el);
      return styles.position === 'fixed' &&
             styles.backgroundColor === 'rgb(252, 225, 200)'; // #FCE1C8
    });

    // Get active sidebar item
    const activeItem = document.querySelector('.sidebar-item.active');

    return {
      portalFound: portalDivs.length > 0,
      portalCount: portalDivs.length,
      portals: portalDivs.map(div => {
        const styles = window.getComputedStyle(div);
        const rect = div.getBoundingClientRect();
        return {
          position: styles.position,
          left: styles.left,
          top: styles.top,
          width: styles.width,
          height: styles.height,
          backgroundColor: styles.backgroundColor,
          zIndex: styles.zIndex,
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
          }
        };
      }),
      activeItem: activeItem ? {
        text: activeItem.textContent.trim(),
        rect: activeItem.getBoundingClientRect()
      } : null,
      totalBodyChildren: bodyChildren.length
    };
  });

  console.log('Portal Extension Info:');
  console.log(JSON.stringify(portalInfo, null, 2));

  if (portalInfo.portalFound) {
    console.log('\n✅ SUCCESS! React Portal extension found in DOM!');
  } else {
    console.log('\n❌ WARNING: No portal extension found. Checking for issues...');

    // Debug: Check if activeTabRef is working
    const debugInfo = await page.evaluate(() => {
      const sidebar = document.querySelector('.layout-sidebar');
      const sidebarRect = sidebar?.getBoundingClientRect();
      const activeItem = document.querySelector('.sidebar-item.active');
      const activeRect = activeItem?.getBoundingClientRect();

      return {
        hasSidebar: !!sidebar,
        sidebarWidth: sidebarRect?.width,
        sidebarLeft: sidebarRect?.left,
        hasActiveItem: !!activeItem,
        activeItemRect: activeRect
      };
    });

    console.log('\nDebug Info:');
    console.log(JSON.stringify(debugInfo, null, 2));
  }

  // Take screenshots
  console.log('\n📸 Taking screenshots...');
  await page.screenshot({ path: 'portal-test-full.png', fullPage: false });
  console.log('✅ Saved portal-test-full.png');

  // Capture sidebar area with extension
  const sidebarRect = await page.evaluate(() => {
    const sidebar = document.querySelector('.layout-sidebar');
    if (!sidebar) return null;
    const rect = sidebar.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width + 200, // Include extension area
      height: rect.height
    };
  });

  if (sidebarRect) {
    await page.screenshot({
      path: 'portal-sidebar-closeup.png',
      clip: sidebarRect
    });
    console.log('✅ Saved portal-sidebar-closeup.png');
  }

  // Test clicking different sidebar items
  console.log('\n🖱️  Testing different sidebar items...');

  const sidebarItems = await page.$$('.sidebar-item');
  if (sidebarItems.length > 1) {
    console.log(`Found ${sidebarItems.length} sidebar items`);

    // Click second item
    await sidebarItems[1].click();
    await new Promise(r => setTimeout(r, 1000));

    await page.screenshot({ path: 'portal-second-item.png' });
    console.log('✅ Saved portal-second-item.png (second item)');

    // Check portal after route change
    const portalAfterClick = await page.evaluate(() => {
      const portalDivs = Array.from(document.body.children).filter(el => {
        const styles = window.getComputedStyle(el);
        return styles.position === 'fixed' &&
               styles.backgroundColor === 'rgb(252, 225, 200)';
      });
      return {
        found: portalDivs.length > 0,
        count: portalDivs.length
      };
    });

    console.log('\nPortal after route change:', portalAfterClick);
  }

  console.log('\n⏳ Keeping browser open for 15 seconds...');
  await new Promise(r => setTimeout(r, 15000));

  await browser.close();
  console.log('✅ Test complete!');
})();
