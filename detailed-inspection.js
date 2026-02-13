const puppeteer = require('puppeteer');

(async () => {
  console.log('🚀 Launching browser for detailed inspection...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();

  // Capture console logs
  page.on('console', msg => {
    console.log('BROWSER CONSOLE:', msg.text());
  });

  // Capture errors
  page.on('pageerror', error => {
    console.error('BROWSER ERROR:', error.message);
  });

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

  console.log('✅ Logged in!');
  console.log(`📍 Current URL: ${page.url()}`);

  await new Promise(r => setTimeout(r, 5000));

  // Detailed inspection
  const pageInfo = await page.evaluate(() => {
    return {
      // React root
      hasRoot: !!document.getElementById('root'),
      rootChildren: document.getElementById('root')?.children.length,
      rootHTML: document.getElementById('root')?.innerHTML.substring(0, 500),

      // Look for layout elements
      hasLayoutContainer: !!document.querySelector('.layout-container'),
      hasLayoutSidebar: !!document.querySelector('.layout-sidebar'),
      hasLayoutMain: !!document.querySelector('.layout-main'),

      // Check for any sidebar-related elements
      sidebarItems: document.querySelectorAll('[class*="sidebar"]').length,
      allClassNames: Array.from(document.querySelectorAll('[class]'))
        .map(el => el.className)
        .filter(cls => cls && typeof cls === 'string')
        .slice(0, 20),

      // Body children
      bodyChildrenCount: document.body.children.length,
      bodyChildrenTags: Array.from(document.body.children).map(el => ({
        tag: el.tagName,
        id: el.id,
        className: el.className
      })),

      // Document title
      title: document.title
    };
  });

  console.log('\n📊 DETAILED PAGE INFO:\n');
  console.log(JSON.stringify(pageInfo, null, 2));

  await page.screenshot({ path: 'dashboard-detailed.png', fullPage: true });
  console.log('\n📸 Saved dashboard-detailed.png');

  console.log('\n⏳ Keeping browser open for 20 seconds...');
  await new Promise(r => setTimeout(r, 20000));

  await browser.close();
  console.log('✅ Done!');
})();
