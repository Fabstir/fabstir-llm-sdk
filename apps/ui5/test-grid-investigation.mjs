import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'http://localhost:3001';
const SCREENSHOTS_DIR = join(__dirname, 'test-screenshots-grid');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function investigateGrid() {
  console.log('🔍 Investigating Grid Layout Behavior');
  console.log('=' + '='.repeat(60));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  try {
    // Connect wallet first
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const connectBtn = buttons.find(btn => btn.textContent.includes('Connect Wallet'));
      if (connectBtn) connectBtn.click();
    });
    await wait(1000);

    // Test at different viewport sizes
    const viewports = [
      { name: 'Mobile', width: 375, height: 667 },
      { name: 'Mobile Large', width: 480, height: 800 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Desktop Small', width: 1024, height: 768 },
      { name: 'Desktop', width: 1280, height: 800 },
    ];

    for (const viewport of viewports) {
      console.log(`\n📱 Testing ${viewport.name} (${viewport.width}x${viewport.height})`);
      console.log('-'.repeat(60));

      await page.setViewport({ width: viewport.width, height: viewport.height });
      await wait(500);

      // Get dashboard stats grid info
      const gridInfo = await page.evaluate(() => {
        // Find the stats grid
        const grids = Array.from(document.querySelectorAll('[class*="grid"]'));

        for (const grid of grids) {
          // Check if this grid contains stat cards
          const hasStats = grid.querySelector('[class*="cursor-pointer"]');
          if (hasStats) {
            const classes = grid.className;
            const style = window.getComputedStyle(grid);
            const gridTemplateColumns = style.gridTemplateColumns;
            const display = style.display;

            // Count visible children
            const children = Array.from(grid.children);
            const visibleChildren = children.filter(child => {
              const childStyle = window.getComputedStyle(child);
              return childStyle.display !== 'none' && childStyle.visibility !== 'hidden';
            });

            // Count columns
            let columnCount = 0;
            if (gridTemplateColumns && gridTemplateColumns !== 'none') {
              columnCount = gridTemplateColumns.split(' ').length;
            }

            return {
              found: true,
              classes,
              display,
              gridTemplateColumns,
              columnCount,
              childCount: children.length,
              visibleChildCount: visibleChildren.length,
            };
          }
        }

        return { found: false };
      });

      if (gridInfo.found) {
        console.log(`✅ Stats Grid Found:`);
        console.log(`   Classes: ${gridInfo.classes}`);
        console.log(`   Display: ${gridInfo.display}`);
        console.log(`   Grid Template Columns: ${gridInfo.gridTemplateColumns}`);
        console.log(`   Computed Column Count: ${gridInfo.columnCount}`);
        console.log(`   Child Elements: ${gridInfo.childCount}`);
        console.log(`   Visible Children: ${gridInfo.visibleChildCount}`);
      } else {
        console.log('❌ Stats grid not found');
      }

      // Check if Tailwind is loading
      const tailwindCheck = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
        const styles = Array.from(document.querySelectorAll('style'));

        // Check for Tailwind-specific classes
        const hasGridClasses = document.querySelector('[class*="grid-cols"]');
        const hasSmClasses = document.querySelector('[class*="sm:"]');
        const hasLgClasses = document.querySelector('[class*="lg:"]');

        // Check computed styles
        const testDiv = document.createElement('div');
        testDiv.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';
        document.body.appendChild(testDiv);
        const testStyle = window.getComputedStyle(testDiv);
        const testDisplay = testStyle.display;
        const testGrid = testStyle.gridTemplateColumns;
        document.body.removeChild(testDiv);

        return {
          cssLinks: links.length,
          styleBlocks: styles.length,
          hasGridClasses: !!hasGridClasses,
          hasSmClasses: !!hasSmClasses,
          hasLgClasses: !!hasLgClasses,
          testDisplay,
          testGrid,
        };
      });

      console.log(`\n🎨 Tailwind CSS Check:`);
      console.log(`   CSS Links: ${tailwindCheck.cssLinks}`);
      console.log(`   Style Blocks: ${tailwindCheck.styleBlocks}`);
      console.log(`   Has grid-cols classes: ${tailwindCheck.hasGridClasses}`);
      console.log(`   Has sm: classes: ${tailwindCheck.hasSmClasses}`);
      console.log(`   Has lg: classes: ${tailwindCheck.hasLgClasses}`);
      console.log(`   Test div display: ${tailwindCheck.testDisplay}`);
      console.log(`   Test div grid: ${tailwindCheck.testGrid}`);

      // Take screenshot
      const filename = `dashboard-${viewport.name.toLowerCase().replace(' ', '-')}.png`;
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, filename),
        fullPage: true
      });
      console.log(`📸 Screenshot: ${filename}`);
    }

    // Check the actual HTML classes on the stats grid
    console.log(`\n📝 HTML Class Analysis:`);
    console.log('-'.repeat(60));

    const htmlClasses = await page.evaluate(() => {
      const grids = Array.from(document.querySelectorAll('[class*="grid"]'));

      for (const grid of grids) {
        const hasStats = grid.querySelector('[class*="cursor-pointer"]');
        if (hasStats) {
          const classes = grid.className.split(' ');
          const gridClasses = classes.filter(c =>
            c.includes('grid') || c.includes('col') || c.includes('gap')
          );

          return {
            allClasses: classes,
            gridClasses,
            rawClassName: grid.className,
          };
        }
      }

      return null;
    });

    if (htmlClasses) {
      console.log('Grid-related classes:', htmlClasses.gridClasses.join(', '));
      console.log('All classes:', htmlClasses.allClasses.join(' '));
      console.log('Raw className:', htmlClasses.rawClassName);
    }

    // Check if CSS is being applied
    console.log(`\n🔧 CSS Application Check:`);
    console.log('-'.repeat(60));

    const cssCheck = await page.evaluate(() => {
      // Get all stylesheets
      const sheets = Array.from(document.styleSheets);
      let tailwindFound = false;
      let gridRulesFound = 0;

      try {
        for (const sheet of sheets) {
          try {
            const rules = Array.from(sheet.cssRules || sheet.rules || []);
            for (const rule of rules) {
              if (rule.cssText) {
                if (rule.cssText.includes('grid-cols') || rule.cssText.includes('sm:grid-cols')) {
                  gridRulesFound++;
                }
                if (rule.cssText.includes('tailwind') || rule.cssText.includes('@layer')) {
                  tailwindFound = true;
                }
              }
            }
          } catch (e) {
            // CORS or other access issue
          }
        }
      } catch (e) {
        // Stylesheet access error
      }

      return {
        stylesheetCount: sheets.length,
        tailwindFound,
        gridRulesFound,
      };
    });

    console.log(`Stylesheets: ${cssCheck.stylesheetCount}`);
    console.log(`Tailwind detected: ${cssCheck.tailwindFound}`);
    console.log(`Grid rules found: ${cssCheck.gridRulesFound}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ Investigation complete!');
  console.log(`📁 Screenshots saved to: ${SCREENSHOTS_DIR}`);
}

investigateGrid()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('💥 Error:', error);
    process.exit(1);
  });
