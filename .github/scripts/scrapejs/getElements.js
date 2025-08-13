const puppeteer = require('puppeteer'); 
const { getId, getModel, getPrice, getLink } = require('./utils');

const DEBUG_SCREENSHOT = process.env.DEBUG_SCREENSHOT === 'true' ? true : false;
const CUSTOM_USER_AGENT = process.env.USER_AGENT || '';

const BrowserOption = {
  ARGS: [
    '--no-sandbox', // Обязательно для Linux (GitHub Actions использует Ubuntu)
    '--disable-setuid-sandbox', // Для избежания проблем с правами
    '--disable-dev-shm-usage', // Помогает избежать проблем с памятью в Docker/CI
    '--disable-accelerated-2d-canvas', // Уменьшает использование ресурсов
    '--disable-gpu', // Отключает GPU (не нужен в headless)
    '--single-process', // Может помочь на слабых серверах (но не всегда стабильно)
    '--no-zygote', // Уменьшает использование памяти
  ],
  PATHS: {
    WIN: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    MAC: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    LINUX: '/usr/bin/google-chrome'
  },
  TIMEOUT: 120000,
};

const Viewport = {
  WIDTH: 1980,
  HEIGHT: 1080
};

const Platform = {
  WIN: 'win32',
  MAC: 'darwin',
  LINUX: 'linux',
};

const ResponseOption = {
  TIMEOUT: 120000,
};

const WaitForSelectorOption = {
  TIMEOUT: 120000,
};

const WaitUntil = {
  FULL: 'load', // Полная загрузка страницы (включая CSS, изображения, скрипты).
  DOM: 'domcontentloaded', // Быстрое завершение (DOM готов, но ресурсы могут догружаться).
  NETWORK_IDLE_0: 'networkidle0', // Нет активных запросов (хорош для SPA и AJAX-сайтов).
  NETWORK_IDLE_2: 'networkidle2' // Почти нет запросов (подходит для фоновых процессов).
};

const Config = {
  URL: process.env.URL,
  BRAND: process.env.BRAND,
  CLICK_SELECTOR: process.env.CLICK_SELECTOR || null,
  WAIT_SELECTOR: process.env.WAIT_SELECTOR || null,
  ITEM: process.env.ITEM_CSS,
  PRICE: process.env.PRICE_CSS,
  MODEL: process.env.MODEL_CSS,
  LINK: process.env.LINK_CSS || null
};

const browserOptions = {
  args: BrowserOption.ARGS,
  executablePath: process.env.CHROME_BIN || (
    process.platform === Platform.WIN ? BrowserOption.PATHS.WIN : 
    process.platform === Platform.MAC ? BrowserOption.PATHS.MAC : 
    BrowserOption.PATHS.LINUX
  ),
  timeout: BrowserOption.TIMEOUT,
  headless: true,
  ignoreHTTPSErrors: true
};

const getElements = async () => {
  let browser;
  try {
    browser = await puppeteer.launch(browserOptions);
    const page = await browser.newPage();
    if (CUSTOM_USER_AGENT) {
      await page.setUserAgent(CUSTOM_USER_AGENT);
    }
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    page.on('console', msg => {
      try { console.log(`[page:${msg.type()}]`, msg.text()); } catch {}
    });
    page.on('pageerror', err => {
      try { console.log('[pageerror]', err.message); } catch {}
    });
    page.on('requestfailed', req => {
      try { console.log('[requestfailed]', req.url(), req.failure() && req.failure().errorText); } catch {}
    });
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);
    const data = [];
    const timestamp = new Date().toISOString().substring(0, 19).replace('T', '-');
    let screenshotCount = 0;

    await page.setViewport({width: Viewport.WIDTH, height: Viewport.HEIGHT});

    const response = await page.goto(Config.URL, {
      waitUntil: Config.CLICK_SELECTOR ? WaitUntil.DOM : WaitUntil.FULL,
      timeout: ResponseOption.TIMEOUT,
    });
  
    if (!response.ok()) {
      throw new Error(`${Config.BRAND.toUpperCase()}: Статус загрузки страницы: ${response.status()}`);
    }

    if (Config.CLICK_SELECTOR) {
      await page.waitForSelector(Config.CLICK_SELECTOR, { visible: true, timeout: WaitForSelectorOption.TIMEOUT });
    } else if (Config.WAIT_SELECTOR) {
      await page.waitForSelector(Config.WAIT_SELECTOR, { timeout: WaitForSelectorOption.TIMEOUT });
    }

    if (DEBUG_SCREENSHOT) {
      await page.screenshot({ path: `${timestamp}-${Config.BRAND.toUpperCase()}-${screenshotCount}-after-wait.png` });
      screenshotCount++;
    }  

    if (Config.CLICK_SELECTOR) {
      const modelsLink = await page.waitForSelector(Config.CLICK_SELECTOR, { visible: true, timeout: WaitForSelectorOption.TIMEOUT });
      
      if (DEBUG_SCREENSHOT) {
        await page.screenshot({ path: `${timestamp}-${Config.BRAND.toUpperCase()}-${screenshotCount}-before-click.png` });
        screenshotCount++;
      }
      
      await modelsLink.click();
      
      if (Config.WAIT_SELECTOR) {
        await page.waitForSelector(Config.WAIT_SELECTOR, { timeout: WaitForSelectorOption.TIMEOUT });
      }
     
      if (DEBUG_SCREENSHOT) {
        await page.screenshot({ path: `${timestamp}-${Config.BRAND.toUpperCase()}-${screenshotCount}-after-click.png` });
        screenshotCount++;
      }
    }

    const elements = await page.$$(Config.ITEM);
    if (!elements.length) throw new Error(`${Config.BRAND.toUpperCase()}: Не найдено ни одного элемента.`);
    
    for (const element of elements) {
      const price = await getPrice(element, Config.PRICE, Config.BRAND);
      const link = Config.LINK ? await getLink(element, Config.LINK, Config.BRAND) : null;
      const model = await getModel(element, Config.MODEL, Config.BRAND, link);
      const id = getId(Config.BRAND, link);
      data.push({
        id,
        brand: Config.BRAND,
        model,
        price,
        benefit: '',
        link,
      });
    }
    return data;
  } finally {
    if (browser) await browser.close();
  }
};

module.exports = {
  getElements
};