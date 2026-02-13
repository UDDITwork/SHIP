const puppeteer = require('puppeteer');

(async () => {
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();

  console.log('📡 Navigating to https://shipsarthi.com/login...');
  await page.goto('https://shipsarthi.com/login', { waitUntil: 'networkidle0', timeout: 60000 });

  console.log('⏳ Waiting 3 seconds for page to fully load...');
  await new Promise(r => setTimeout(r, 3000));

  // Get current URL
  const url = page.url();
  console.log(`\n📍 Current URL: ${url}`);

  // Take screenshot
  await page.screenshot({ path: 'login-page.png', fullPage: true });
  console.log('📸 Screenshot saved as login-page.png');

  // Check all inputs
  const inputs = await page.evaluate(() => {
    const allInputs = Array.from(document.querySelectorAll('input'));
    return allInputs.map((input, i) => ({
      index: i,
      type: input.type,
      name: input.name,
      id: input.id,
      placeholder: input.placeholder,
      value: input.value
    }));
  });

  console.log('\n📋 ALL INPUTS ON PAGE:');
  console.log(JSON.stringify(inputs, null, 2));

  // Check for buttons
  const buttons = await page.evaluate(() => {
    const allButtons = Array.from(document.querySelectorAll('button'));
    return allButtons.map((btn, i) => ({
      index: i,
      type: btn.type,
      text: btn.textContent.trim().substring(0, 50)
    }));
  });

  console.log('\n🔘 ALL BUTTONS:');
  console.log(JSON.stringify(buttons, null, 2));

  console.log('\n⏳ Keeping browser open for 10 seconds...');
  await new Promise(r => setTimeout(r, 10000));

  await browser.close();
  console.log('✅ Done!');
})();
