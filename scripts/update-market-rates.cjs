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

// 3. Парсер карточек Banki.ru
function parseCardsFromHtml(html, defaultType = 'deposit', defaultMonths = 3) {
  const offers = [];
  const rawCards = html.split('data-test="card-offer"').slice(1);

  for (const card of rawCards) {
    const lines = card
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]+>/g, '\n')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    if (lines.length < 5) continue;

    const bankName = lines[1].replace(/^(ПАО|АО|ООО|АКБ)\s+/i, '').trim();
    const productName = lines[2]
      .replace(/^Вклад\s*•\s*/i, '')
      .replace(/^Накопительный счет\s*•\s*/i, '')
      .trim();

    // Извлечение ставки
    let rate = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === '%' && i > 0) {
        const val = parseFloat(lines[i - 1].replace(',', '.'));
        if (!isNaN(val) && val >= 5 && val <= 30) {
          rate = val;
          break;
        }
      }
    }

    if (!rate) continue;

    // Определение типа: вклад или счет
    const isAccount =
      defaultType === 'account' ||
      card.includes('Накопительный счет') ||
      card.includes('накопительный') ||
      card.includes('минимальный остаток') ||
      card.includes('ежедневный остаток');

    const type = isAccount ? 'account' : 'deposit';

    // Определение срока
    let termDays = 0;
    let termMonths = defaultMonths;

    const daysMatch = card.match(/(\d+)\s*(дн\.|дней|дня|день)/i);
    if (daysMatch) {
      termDays = parseInt(daysMatch[1], 10);
      termMonths = Math.round(termDays / 30);
    } else {
      const monthMatch = card.match(/(\d+)\s*(мес\.|месяцев|месяца|месяц)/i);
      if (monthMatch) {
        termMonths = parseInt(monthMatch[1], 10);
        termDays = termMonths * 30;
      }
    }

    if (type === 'account') {
      termDays = 0;
      termMonths = 0;
    }

    // Извлечение бейджей/тегов
    const tags = [];
    if (card.includes('Новый клиент') || card.includes('для новых клиентов')) {
      tags.push('Новый клиент');
    }
    if (card.includes('новые деньги') || card.includes('Новые деньги')) {
      tags.push('Новые деньги');
    }
    if (card.includes('капитализацией') || card.includes('С капитализацией')) {
      tags.push('С капитализацией');
    }
    if (card.includes('пополнением') || card.includes('С пополнением')) {
      tags.push('С пополнением');
    }
    if (card.includes('минимальный остаток')) {
      tags.push('На минимальный остаток');
    }
    if (card.includes('ежедневный остаток')) {
      tags.push('На ежедневный остаток');
    }

    // Сумма
    let minAmount = 0;
    const amountMatch = card.match(/Сумма\s*(от\s*)?([\d\s]+)/i);
    if (amountMatch) {
      const rawNum = amountMatch[2].replace(/\s+/g, '');
      const parsed = parseInt(rawNum, 10);
      if (!isNaN(parsed)) minAmount = parsed;
    }

    offers.push({
      bankName,
      productName,
      rate,
      type,
      termMonths,
      termDays,
      minAmount,
      tags,
    });
  }

  return offers;
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
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
      const parsed = parseCardsFromHtml(html, c.type, c.months);
      console.log(`  - ${c.url}: found ${parsed.length} offers`);
      allOffers.push(...parsed);
    }
  }

  // 3. Банк-специфичные каталоги для популярных банков (в т.ч. Яндекс, Ozon, Т-Банк, Сбер, ВТБ, ДОМ.РФ и др.)
  const bankAliases = [
    'sberbank',
    'vtb',
    'gazprombank',
    'alfabank',
    'tcs',
    'ecombank',
    'yandexbank',
    'domrfbank',
    'sovcombank',
    'promsvyazbank',
    'mkb',
    'rshb',
    'bspb',
    'uralsib',
    'mts-bank',
    'locko-bank',
  ];

  console.log('Fetching bank-specific deposit catalogues...');
  for (const alias of bankAliases) {
    const depUrl = `https://www.banki.ru/products/deposits/catalogue/vkladyi_v_rublyah/bank/${alias}/`;
    const accUrl = `https://www.banki.ru/products/deposits/catalogue/nakopitelnyie_scheta/bank/${alias}/`;

    const [depHtml, accHtml] = await Promise.all([fetchPage(depUrl), fetchPage(accUrl)]);
    if (depHtml) {
      const parsed = parseCardsFromHtml(depHtml, 'deposit', 6);
      if (parsed.length) allOffers.push(...parsed);
    }
    if (accHtml) {
      const parsed = parseCardsFromHtml(accHtml, 'account', 0);
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
