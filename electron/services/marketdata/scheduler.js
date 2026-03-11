// electron/services/marketdata/scheduler.js
// Daily scheduler that automatically fetches market prices for all portfolio assets.
// Runs at 18:00 every day (after European/US market close).
// Uses node-cron for scheduling.

import cron from 'node-cron';
import { fetchPrice } from './dispatcher.js';
import { getDb } from '../../database/db.js';

let schedulerTask = null;

/**
 * Runs a full price update for all books.
 * Updates currentPrice and related fields on each asset,
 * saves books back to SQLite, and notifies the renderer.
 *
 * @param {Function} getMainWindow Returns the current BrowserWindow (or null if closed)
 */
async function runPriceUpdate(getMainWindow) {
  console.log('[scheduler] Starting daily price update...');

  const db = getDb();
  let books;

  try {
    books = db.getBooks();
  } catch (err) {
    console.error('[scheduler] Failed to load books:', err.message);
    return;
  }

  if (!Array.isArray(books) || books.length === 0) {
    console.log('[scheduler] No books found, skipping update.');
    return;
  }

  let updatedCount = 0;
  let errorCount = 0;

  const updatedBooks = await Promise.all(
    books.map(async (book) => {
      const baseCurrency = book.baseCurrency || 'CHF';
      const portfolios = book.investmentPortfolios || [];

      const updatedPortfolios = await Promise.all(
        portfolios.map(async (portfolio) => {
          const updatedAssets = await Promise.all(
            (portfolio.assets || []).map(async (asset) => {
              // Skip assets without market configuration
              if (!asset.marketSymbol || !asset.marketAssetType) {
                return asset;
              }

              try {
                const result = await fetchPrice(asset, baseCurrency);
                updatedCount++;
                return {
                  ...asset,
                  currentPrice: result.price,
                  originalPrice: result.originalPrice,
                  originalCurrency: result.originalCurrency,
                  fxRate: result.fxRate,
                  priceSource: result.source,
                  lastUpdated: new Date().toISOString(),
                  priceError: null,
                };
              } catch (err) {
                errorCount++;
                console.warn(`[scheduler] Failed to update ${asset.marketSymbol}: ${err.message}`);
                return {
                  ...asset,
                  priceError: err.message,
                  lastUpdated: new Date().toISOString(),
                };
              }
            })
          );

          return { ...portfolio, assets: updatedAssets };
        })
      );

      return { ...book, investmentPortfolios: updatedPortfolios };
    })
  );

  // Save updated books back to DB
  try {
    db.saveBooks(updatedBooks);
    // Clean up old cache entries (older than 7 days)
    db.clearOldPriceCache(7);
  } catch (err) {
    console.error('[scheduler] Failed to save updated books:', err.message);
    return;
  }

  console.log(`[scheduler] Price update complete: ${updatedCount} updated, ${errorCount} errors.`);

  // Notify renderer process to reload books
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('marketdata:update-complete', {
      updatedCount,
      errorCount,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Starts the daily price update scheduler.
 * Runs at 18:00 every day.
 *
 * @param {Function} getMainWindow Returns the current BrowserWindow
 */
export function startScheduler(getMainWindow) {
  if (schedulerTask) {
    schedulerTask.stop();
  }

  // Run daily at 18:00
  schedulerTask = cron.schedule('0 18 * * *', () => {
    runPriceUpdate(getMainWindow).catch((err) => {
      console.error('[scheduler] Unhandled error in price update:', err.message);
    });
  }, {
    timezone: 'Europe/Zurich',
  });

  console.log('[scheduler] Daily price update scheduled at 18:00 Europe/Zurich.');
}

/**
 * Stops the scheduler (e.g. on app quit).
 */
export function stopScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
  }
}

/**
 * Triggers a manual price update immediately (for testing or on-demand use).
 */
export async function triggerManualUpdate(getMainWindow) {
  return runPriceUpdate(getMainWindow);
}
