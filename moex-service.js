/**
 * moex-service.js
 * Moscow Exchange (MOEX ISS) integration service.
 * Provides security search and live market price fetching for stocks and mutual funds.
 */

class MoexService {
  constructor() {
    this.searchBaseUrl = 'https://iss.moex.com/iss/securities.json';
    this.marketDataBaseUrl = 'https://iss.moex.com/iss/engines/stock/markets/shares/securities';
  }

  /**
   * Searches MOEX securities by ticker or name.
   * Filters to stocks (stock_shares) and mutual funds/ETFs (stock_ppif).
   */
  async searchSecurities(query) {
    if (!query || typeof query !== 'string' || query.trim().length < 2) return [];

    const cleanQuery = encodeURIComponent(query.trim());
    const url = `${this.searchBaseUrl}?q=${cleanQuery}&iss.meta=off&securities.columns=secid,shortname,name,group`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`MOEX search error: ${resp.status}`);

      const json = await resp.json();
      const rows = json?.securities?.data || [];

      // Filter to stocks (stock_shares) and mutual funds (stock_ppif)
      const allowedGroups = new Set(['stock_shares', 'stock_ppif']);
      const results = [];
      const seenTickers = new Set();

      for (const row of rows) {
        const [secId, shortName, fullName, group] = row;
        if (!secId || seenTickers.has(secId)) continue;
        if (allowedGroups.has(group)) {
          seenTickers.add(secId);
          results.push({
            ticker: secId,
            shortName: shortName || secId,
            fullName: fullName || shortName || secId,
            isFund: group === 'stock_ppif',
            group,
          });
        }
      }

      return results.slice(0, 15);
    } catch (err) {
      console.warn('MOEX searchSecurities failed:', err);
      return [];
    }
  }

  /**
   * Fetches latest market price and daily change for a single security.
   */
  async fetchSecurityPrice(ticker) {
    if (!ticker) return null;

    const url = `${this.marketDataBaseUrl}/${encodeURIComponent(ticker)}.json?iss.meta=off&iss.only=marketdata,securities&marketdata.columns=SECID,LAST,PREVPRICE,LASTTOPREVPRICE&securities.columns=SECID,SHORTNAME,PREVPRICE,LOTSIZE`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`MOEX price error: ${resp.status}`);

      const json = await resp.json();
      const marketRows = json?.marketdata?.data || [];
      const secRows = json?.securities?.data || [];

      // Prioritize row with valid LAST price (usually TQBR board)
      let price = null;
      let changePct = 0;

      for (const row of marketRows) {
        const [_, lastPrice, change] = row;
        if (typeof lastPrice === 'number' && lastPrice > 0) {
          price = lastPrice;
          changePct = typeof change === 'number' ? change : 0;
          break;
        }
      }

      // If LAST is null (market closed or weekend), use PREVPRICE from securities block
      if (price === null) {
        for (const row of secRows) {
          const [_, __, prevPrice] = row;
          if (typeof prevPrice === 'number' && prevPrice > 0) {
            price = prevPrice;
            break;
          }
        }
      }

      const shortName = secRows?.[0]?.[1] || ticker;
      const lotSize = secRows?.[0]?.[3] || 1;

      return {
        ticker,
        shortName,
        price: price || 0,
        changePct: changePct || 0,
        lotSize: lotSize || 1,
        timestamp: Date.now(),
      };
    } catch (err) {
      console.warn(`MOEX fetchSecurityPrice failed for ${ticker}:`, err);
      return null;
    }
  }

  /**
   * Batch fetches quotes for an array of asset items.
   */
  async fetchBatchPrices(tickers) {
    if (!Array.isArray(tickers) || tickers.length === 0) return {};

    const uniqueTickers = [...new Set(tickers.map(t => String(t).toUpperCase().trim()))];
    const results = {};

    const promises = uniqueTickers.map(async ticker => {
      const quote = await this.fetchSecurityPrice(ticker);
      if (quote) {
        results[ticker] = quote;
      }
    });

    await Promise.all(promises);
    return results;
  }
}

window.MoexService = new MoexService();
