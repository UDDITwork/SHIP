const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();

  console.log('📡 Navigating...');
  await page.goto('https://shipsarthi.com', { waitUntil: 'networkidle2', timeout: 60000 });

  await new Promise(r => setTimeout(r, 3000));

  // Get all input elements
  const inputs = await page.evaluate(() => {
    const allInputs = Array.from(document.querySelectorAll('input'));
    return allInputs.map((input, i) => ({
      index: i,
      type: input.type,
      name: input.name,
      id: input.id,
      placeholder: input.placeholder,
      className: input.className
    }));
  });

  console.log('\n📋 ALL INPUT ELEMENTS ON PAGE:\n');
  console.log(JSON.stringify(inputs, null, 2));

  // Get all buttons
  const buttons = await page.evaluate(() => {
    const allButtons = Array.from(document.querySelectorAll('button'));
    return allButtons.map((btn, i) => ({
      index: i,
      type: btn.type,
      text: btn.textContent.trim().substring(0, 50),
      className: btn.className
    }));
  });

  console.log('\n🔘 ALL BUTTONS:\n');
  console.log(JSON.stringify(buttons, null, 2));

  await page.screenshot({ path: 'page-structure.png', fullPage: true });
  console.log('\n📸 Screenshot saved');

  console.log('\n⏳ Keeping open for 10 seconds...');
  await new Promise(r => setTimeout(r, 10000));

  await browser.close();
})();
