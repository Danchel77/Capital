/**
 * scripts/update-market-rates.cjs
 * Automated updater for CBR key rate, MOEX deposit indices, and live bank deposit/account offers.
 * Executed via GitHub Actions daily or manually via npm run update:rates.
 */

const fs = require('fs');
const path = require('path');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 1. Ключевая ставка ЦБ РФ
async function fetchCbrKeyRate() {
  try {
    const now = new Date();
    const fromDate = new Date(now.getTime() - 14 * 86400000).toISOString().split('T')[0];
    const toDate = now.toISOString().split('T')[0];

    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <KeyRateXML xmlns="http://web.cbr.ru/">
      <fromDate>${fromDate}</fromDate>
      <ToDate>${toDate}</ToDate>
    </KeyRateXML>
  </soap:Body>
</soap:Envelope>`;

    const res = await fetch('https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '"http://web.cbr.ru/KeyRateXML"',
      },
      body: soapBody,
    });

    if (res.ok) {
      const xml = await res.text();
      const m = xml.match(/<Rate>([\d.,]+)<\/Rate>/);
      if (m) {
        const val = parseFloat(m[1].replace(',', '.'));
        if (!isNaN(val) && val > 0) return val;
      }
    }
  } catch (err) {
    console.warn('[UpdateRates] CBR fetch error:', err.message);
  }
  return 14.0;
}

// 2. Индексы Мосбиржи
async function fetchMoexIndices() {
  const tickers = ['FIND3M10', 'FIND6M10', 'FIND12M10', 'FINSAMAX', 'FINSABASE'];
  const indices = { '3m': 13.8, '6m': 13.05, '12m': 12.52, accountMax: 13.81, accountAvg: 8.26 };

  for (const t of tickers) {
    try {
      const res = await fetch(
        `https://iss.moex.com/iss/engines/stock/markets/index/securities/${t}.json`
      );
      if (!res.ok) continue;
      const json = await res.json();
      const md = json?.marketdata;
      if (!md || !md.data || md.data.length === 0) continue;
      const curCol = md.columns.indexOf('CURRENTVALUE');
      const lastCol = md.columns.indexOf('LASTVALUE');
      const val = parseFloat(md.data[0][curCol] || md.data[0][lastCol]);
      if (!isNaN(val) && val > 0) {
        if (t === 'FIND3M10') indices['3m'] = val;
        if (t === 'FIND6M10') indices['6m'] = val;
        if (t === 'FIND12M10') indices['12m'] = val;
        if (t === 'FINSAMAX') indices.accountMax = val;
        if (t === 'FINSABASE') indices.accountAvg = val;
      }
    } catch (_e) {
      // ignore
    }
  }
  return indices;
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function extractConditionsNote(r) {
  const parts = [];
  if (r.rate_comment_html) parts.push(r.rate_comment_html);
  if (r.new_money_comment) parts.push(r.new_money_comment);
  if (r.rate_increase_comment_html) parts.push(r.rate_increase_comment_html);
  if (r.special_restrictions) parts.push(r.special_restrictions);

  const raw = parts.join(' ');
  const clean = raw
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return clean.length > 5 ? clean : '';
}

// 3. Структурированный парсер Banki.ru (чтение data-module-options -> defaultOffersResults)
function parseOffersFromBankiHtml(html, defaultType = 'deposit', defaultMonths = 3) {
  const offers = [];

  // Стратегия А: структурированный JSON defaultOffersResults (официальные данные Banki.ru)
  const matches = [...html.matchAll(/data-module-options="([^"]*defaultOffersResults[^"]*)"/g)];
  if (matches.length > 0) {
    for (const m of matches) {
      try {
        const decoded = decodeHtmlEntities(m[1]);
        const parsed = JSON.parse(decoded);
        const results = parsed.defaultOffersResults?.results || [];
        const rows = results.flatMap(r =>
          r.deposit_result_rows && r.deposit_result_rows.length > 0 ? r.deposit_result_rows : [r]
        );

        for (const r of rows) {
          if (!r.product_name || !r.bank_name) continue;

          const bankName = (r.bank_name || '').replace(/^(ПАО|АО|ООО|АКБ)\s+/i, '').trim();
          const productName = r.product_name.trim();

          // Однозначное определение типа продукта
          const isAccount =
            r.is_saving_account === true ||
            (defaultType === 'account' && r.is_saving_account !== false);
          const type = isAccount ? 'account' : 'deposit';

          const minAmount = parseInt(r.amount_from || r.rates_extremum?.min_amount || 0, 10);
          const conditionsNote = extractConditionsNote(r);

          // Объективные флаги условий
          const baseTags = [];
          if (r.is_new_client === true) baseTags.push('Новый клиент');
          if (r.is_new_money === true) baseTags.push('Новые деньги');
          if (r.capitalization && r.capitalization.name && r.capitalization.name !== 'нет') {
            baseTags.push('С капитализацией');
          }
          if (r.is_replenishment_possible === true) baseTags.push('С пополнением');

          if (type === 'account') {
            const lowerInfo = (
              productName +
              ' ' +
              (r.special_restrictions || '') +
              ' ' +
              (r.rate_comment_html || '')
            ).toLowerCase();
            const accTags = [...baseTags];
            if (lowerInfo.includes('минимальн')) {
              accTags.push('На минимальный остаток');
            } else {
              accTags.push('На ежедневный остаток');
            }
            const rate = parseFloat(r.rate_max || r.rate || r.rates_extremum?.max_rate || 0);
            if (rate >= 4 && rate <= 35) {
              offers.push({
                bankName,
                productName,
                rate,
                type: 'account',
                termMonths: 0,
                termDays: 0,
                minAmount,
                tags: accTags,
                conditionsNote,
              });
            }
          } else {
            // Вклады
            const ratesTable = r.rates_extremum?.rates_table;
            let addedFromTable = false;

            if (Array.isArray(ratesTable) && ratesTable.length > 1) {
              // Поиск стандартных периодов размещения (3 мес, 6 мес, 12 мес)
              const periodsMap = [
                { months: 3, days: 91, matchRegex: /^(3m|9[0-5]d|3мес)/i },
                { months: 6, days: 181, matchRegex: /^(6m|18[0-5]d|6мес)/i },
                { months: 12, days: 365, matchRegex: /^(1y|12m|36[0-7]d|1год|12мес)/i },
              ];

              for (const p of periodsMap) {
                const row = ratesTable.find(
                  t =>
                    p.matchRegex.test(t.from_notation || '') ||
                    p.matchRegex.test(t.to_notation || '')
                );
                if (row && row.rate >= 4 && row.rate <= 35) {
                  offers.push({
                    bankName,
                    productName,
                    rate: parseFloat(row.rate),
                    type: 'deposit',
                    termMonths: p.months,
                    termDays: p.days,
                    minAmount,
                    tags: [...baseTags],
                    conditionsNote,
                  });
                  addedFromTable = true;
                }
              }
            }

            if (!addedFromTable) {
              const rate = parseFloat(r.rate_max || r.rate || r.rates_extremum?.max_rate || 0);
              const days = parseInt(
                r.period_from || r.rates_extremum?.min_period || defaultMonths * 30,
                10
              );
              const months = Math.max(1, Math.round(days / 30));
              if (rate >= 4 && rate <= 35) {
                offers.push({
                  bankName,
                  productName,
                  rate,
                  type: 'deposit',
                  termMonths: months,
                  termDays: days,
                  minAmount,
                  tags: [...baseTags],
                  conditionsNote,
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn('[UpdateRates] JSON parse error in defaultOffersResults:', err.message);
      }
    }
  }

  // Стратегия Б: Fallback на Schema.org application/ld+json если defaultOffersResults отсутствует
  if (offers.length === 0) {
    const ldJsonMatches = [
      ...html.matchAll(
        /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
      ),
    ];
    for (const m of ldJsonMatches) {
      try {
        const data = JSON.parse(m[1]);
        if (data['@type'] === 'Product' && data.offers?.offers?.itemListElement) {
          const items = data.offers.offers.itemListElement;
          for (const it of items) {
            const bankName = (it.provider?.name || '').replace(/^(ПАО|АО|ООО|АКБ)\s+/i, '').trim();
            const productName = (it.name || '').trim();
            const rate = parseFloat(
              it.interestRate?.maxValue || it.annualPercentageRate?.maxValue || 0
            );
            if (!bankName || !productName || !rate || rate < 4 || rate > 35) continue;

            const isAccount = defaultType === 'account';
            const type = isAccount ? 'account' : 'deposit';
            const minAmount = parseInt(it.amount?.minValue || 0, 10);
            const termsStr = (it.description || it.termsOfService || '').toLowerCase();

            const tags = [];
            if (termsStr.includes('нов')) tags.push('Новый клиент');
            if (isAccount) tags.push('На ежедневный остаток');

            offers.push({
              bankName,
              productName,
              rate,
              type,
              termMonths: isAccount ? 0 : defaultMonths,
              termDays: isAccount ? 0 : defaultMonths * 30,
              minAmount,
              tags,
            });
          }
        }
      } catch (_e) {
        // ignore
      }
    }
  }

  return offers;
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      console.warn(`[UpdateRates] HTTP ${res.status} ${res.statusText} for ${url}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.warn(`[UpdateRates] Error fetching ${url}:`, err.message);
    return null;
  }
}

async function main() {
  console.log('=== Starting Market Rates Live Update ===');

  // 1. ЦБ РФ и Индексы Мосбиржи
  const [cbrRate, moexIndices] = await Promise.all([fetchCbrKeyRate(), fetchMoexIndices()]);
  console.log(`CBR Key Rate: ${cbrRate}%`);
  console.log('MOEX Indices:', moexIndices);

  const allOffers = [];

  // 2. Общие каталоги по срокам
  const catalogueUrls = [
    {
      url: 'https://www.banki.ru/products/deposits/catalogue/vkladyi_na_3_mesyatsa/',
      type: 'deposit',
      months: 3,
    },
    {
      url: 'https://www.banki.ru/products/deposits/catalogue/vkladyi_na_6_mesyatsev/',
      type: 'deposit',
      months: 6,
    },
    {
      url: 'https://www.banki.ru/products/deposits/catalogue/vkladyi_na_god/',
      type: 'deposit',
      months: 12,
    },
    {
      url: 'https://www.banki.ru/products/deposits/catalogue/nakopitelnyie_scheta/',
      type: 'account',
      months: 0,
    },
    {
      url: 'https://www.banki.ru/products/deposits/catalogue/top_10_vkladov/',
      type: 'deposit',
      months: 3,
    },
  ];

  console.log('Fetching general catalogues...');
  for (const c of catalogueUrls) {
    const html = await fetchPage(c.url);
    if (html) {
      const parsed = parseOffersFromBankiHtml(html, c.type, c.months);
      console.log(`  - ${c.url}: found ${parsed.length} offers`);
      allOffers.push(...parsed);
    }
  }

  // 3. Банк-специфичные каталоги для ведущих банков
  const bankAliases = [
    'sberbank',
    'vtb',
    'gazprombank',
    'alfabank',
    'tcs',
    'ecombank', // Ozon
    'yandexbank', // Яндекс
    'domrfbank',
    'sovcombank',
    'promsvyazbank',
    'mkb',
    'rshb',
    'bspb',
    'uralsib',
    'mts-bank',
    'locko-bank',
    'akbars',
    'zenit',
    'absolutbank',
    'rencredit',
  ];

  console.log('Fetching bank-specific deposit catalogues...');
  for (const alias of bankAliases) {
    const depUrl = `https://www.banki.ru/products/deposits/catalogue/vkladyi_v_rublyah/bank/${alias}/`;
    const accUrl = `https://www.banki.ru/products/deposits/catalogue/nakopitelnyie_scheta/bank/${alias}/`;

    const [depHtml, accHtml] = await Promise.all([fetchPage(depUrl), fetchPage(accUrl)]);
    if (depHtml) {
      const parsed = parseOffersFromBankiHtml(depHtml, 'deposit', 6);
      if (parsed.length) allOffers.push(...parsed);
    }
    if (accHtml) {
      const parsed = parseOffersFromBankiHtml(accHtml, 'account', 0);
      if (parsed.length) allOffers.push(...parsed);
    }
  }

  // 4. Дедупликация предложений
  const seen = new Set();
  const uniqueOffers = [];

  for (const o of allOffers) {
    // Нормализация названий банков
    let bName = o.bankName;
    if (bName.includes('Сбер')) bName = 'Сбербанк';
    else if (bName.includes('ВТБ')) bName = 'ВТБ';
    else if (bName.includes('Газпром')) bName = 'Газпромбанк';
    else if (bName.includes('Альфа')) bName = 'Альфа-Банк';
    else if (bName.includes('Т-Банк') || bName.includes('Тинькофф')) bName = 'Т-Банк';
    else if (bName.includes('ДОМ.РФ')) bName = 'Банк ДОМ.РФ';
    else if (bName.includes('Совком')) bName = 'Совкомбанк';
    else if (bName.includes('ПСБ') || bName.includes('Промсвязь')) bName = 'Промсвязьбанк';
    else if (bName.includes('МКБ') || bName.includes('Московский кредитный'))
      bName = 'Московский кредитный банк';
    else if (bName.includes('Россельхоз') || bName.includes('РСХБ')) bName = 'Россельхозбанк';
    else if (bName.includes('Яндекс')) bName = 'Яндекс Банк';
    else if (bName.includes('Ozon') || bName.includes('Озон')) bName = 'Ozon Банк';
    else if (bName.includes('Уралсиб')) bName = 'Банк Уралсиб';
    else if (bName.includes('МТС')) bName = 'МТС Банк';
    else if (bName.includes('Локо')) bName = 'Локо-Банк';
    else if (bName.includes('БСПБ') || bName.includes('Санкт-Петербург'))
      bName = 'Банк Санкт-Петербург';
    else if (bName.includes('Ак Барс')) bName = 'Ак Барс';
    else if (bName.includes('Зенит')) bName = 'Банк Зенит';
    else if (bName.includes('Абсолют')) bName = 'Абсолют Банк';
    else if (bName.includes('Ренессанс')) bName = 'Ренессанс Банк';

    o.bankName = bName;

    const key = `${o.bankName}|${o.productName}|${o.type}|${o.termMonths}|${o.rate}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueOffers.push(o);
    }
  }

  // Сортировка по ставке
  uniqueOffers.sort((a, b) => b.rate - a.rate);

  console.log(`Total unique offers collected: ${uniqueOffers.length}`);

  // Защитный предохранитель: если парсер вернул мало офферов (геоблок, Cloudflare, капча в CI),
  // НЕ перезаписываем базу нулями, а прерываем выполнение с ошибкой
  if (uniqueOffers.length < 50) {
    console.error(
      `[UpdateRates] CRITICAL: Only ${uniqueOffers.length} offers collected (minimum required: 50).`
    );
    console.error(
      '[UpdateRates] Aborting update to protect existing dataset from being overwritten with empty data.'
    );
    process.exit(1);
  }

  const outputData = {
    updatedAt: new Date().toISOString(),
    cbrRate,
    moexIndices,
    totalOffers: uniqueOffers.length,
    offers: uniqueOffers,
  };

  // 5. Запись в data/market-rates.json и www/data/market-rates.json
  const dataDir = path.resolve(__dirname, '../data');
  const wwwDataDir = path.resolve(__dirname, '../www/data');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(wwwDataDir, { recursive: true });

  const targetPath = path.join(dataDir, 'market-rates.json');
  const wwwTargetPath = path.join(wwwDataDir, 'market-rates.json');

  fs.writeFileSync(targetPath, JSON.stringify(outputData, null, 2), 'utf8');
  fs.writeFileSync(wwwTargetPath, JSON.stringify(outputData, null, 2), 'utf8');

  console.log(`Saved live market rates to: ${targetPath}`);
  console.log(`Saved live market rates to: ${wwwTargetPath}`);
}

main().catch(err => {
  console.error('[UpdateRates] Fatal error:', err);
  process.exit(1);
});
