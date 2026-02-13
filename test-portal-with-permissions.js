const puppeteer = require('puppeteer');

(async () => {
  console.log('🚀 Launching browser with permissions granted...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process']
  });

  const page = await browser.newPage();

  // Grant geolocation permission
  const context = browser.defaultBrowserContext();
  await context.overridePermissions('https://www.shipsarthi.com', ['geolocation']);

  // Set a fake geolocation (Mumbai coordinates)
  await page.setGeolocation({ latitude: 19.0760, longitude: 72.8777 });

  console.log('✅ Permissions granted');

  console.log('📡 Navigating to https://shipsarthi.com/login...');
  await page.goto('https://shipsarthi.com/login', { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));

  console.log('🔐 Logging in...');
  await page.waitForSelector('input[name="email"]', { timeout: 10000 });
  await page.type('input[name="email"]', 'udditalerts247@gmail.com', { delay: 50 });
  await page.type('input[name="password"]', 'jpmcA123', { delay: 50 });

  await page.click('button[type="submit"]');
  console.log('⏳ Waiting for navigation...');
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });

  console.log('✅ Logged in successfully!');
  console.log(`📍 Current URL: ${page.url()}`);

  await new Promise(r => setTimeout(r, 5000));

  // Wait for sidebar to load
  console.log('⏳ Waiting for sidebar...');
  const sidebarLoaded = await page.waitForSelector('.layout-sidebar', { timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  if (!sidebarLoaded) {
    console.log('⚠️  Sidebar still not loading. Taking screenshot...');
    await page.screenshot({ path: 'no-sidebar.png', fullPage: true });
    console.log('📸 Saved no-sidebar.png');

    await new Promise(r => setTimeout(r, 10000));
    await browser.close();
    return;
  }

  console.log('✅ Sidebar loaded!');
  await new Promise(r => setTimeout(r, 2000));

  console.log('\n🔍 INSPECTING PORTAL EXTENSION...\n');

  // Check for portal-rendered extension
  const portalInfo = await page.evaluate(() => {
    // Find portal divs (fixed-position with cream background)
    const bodyChildren = Array.from(document.body.children);
    const portalDivs = bodyChildren.filter(el => {
      const styles = window.getComputedStyle(el);
      return styles.position === 'fixed' &&
             styles.backgroundColor === 'rgb(252, 225, 200)'; // #FCE1C8
    });

    // Get active sidebar item
    const activeItem = document.querySelector('.sidebar-item.active');
    const activeRect = activeItem?.getBoundingClientRect();

    // Get sidebar position
    const sidebar = document.querySelector('.layout-sidebar');
    const sidebarRect = sidebar?.getBoundingClientRect();

    return {
      portalFound: portalDivs.length > 0,
      portalCount: portalDivs.length,
      portals: portalDivs.map(div => {
        const styles = window.getComputedStyle(div);
        const rect = div.getBoundingClientRect();
        return {
          left: styles.left,
          top: styles.top,
          width: styles.width,
          height: styles.height,
          backgroundColor: styles.backgroundColor,
          zIndex: styles.zIndex,
          visible: rect.width > 0 && rect.height > 0
        };
      }),
      activeItem: activeItem ? {
        text: activeItem.textContent.trim(),
        position: {
          left: activeRect.left,
          top: activeRect.top,
          width: activeRect.width,
          height: activeRect.height
        }
      } : null,
      sidebar: sidebarRect ? {
        left: sidebarRect.left,
        width: sidebarRect.width
      } : null
    };
  });

  console.log('Portal Extension Info:');
  console.log(JSON.stringify(portalInfo, null, 2));

  if (portalInfo.portalFound) {
    console.log('\n✅ SUCCESS! React Portal extension found!');
    console.log(`📊 Extension Details:`);
    portalInfo.portals.forEach((portal, i) => {
      console.log(`  Portal ${i + 1}:`);
      console.log(`    - Position: left=${portal.left}, top=${portal.top}`);
      console.log(`    - Size: ${portal.width} × ${portal.height}`);
      console.log(`    - Background: ${portal.backgroundColor}`);
      console.log(`    - Visible: ${portal.visible}`);
    });
  } else {
    console.log('\n⚠️  No portal extension found');
  }

  // Take screenshots
  console.log('\n📸 Taking screenshots...');
  await page.screenshot({ path: 'portal-success-full.png', fullPage: false });
  console.log('✅ Saved portal-success-full.png');

  // Capture sidebar area
  if (portalInfo.sidebar) {
    const clipRect = {
      x: Math.max(0, portalInfo.sidebar.left - 10),
      y: 0,
      width: portalInfo.sidebar.width + 250,
      height: 1080
    };
    await page.screenshot({
      path: 'portal-sidebar-extension.png',
      clip: clipRect
    });
    console.log('✅ Saved portal-sidebar-extension.png');
  }

  // Test navigation to different pages
  console.log('\n🖱️  Testing navigation to Orders page...');
  const ordersLink = await page.$('a[href="/orders"]');
  if (ordersLink) {
    await ordersLink.click();
    await new Promise(r => setTimeout(r, 2000));

    const portalAfterNav = await page.evaluate(() => {
      const bodyChildren = Array.from(document.body.children);
      const portalDivs = bodyChildren.filter(el => {
        const styles = window.getComputedStyle(el);
        return styles.position === 'fixed' &&
               styles.backgroundColor === 'rgb(252, 225, 200)';
      });
      return {
        found: portalDivs.length > 0,
        count: portalDivs.length
      };
    });

    console.log('Portal after navigation:', portalAfterNav);
    await page.screenshot({ path: 'portal-orders-page.png' });
    console.log('✅ Saved portal-orders-page.png');
  }

  console.log('\n⏳ Keeping browser open for 20 seconds...');
  await new Promise(r => setTimeout(r, 20000));

  await browser.close();
  console.log('✅ Test complete!');
})();
