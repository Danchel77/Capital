/**
 * statement-parser.js
 * Парсер банковских PDF-выписок (Шаг 1: извлечение текста, Шаг 2: формирование таблицы)
 */

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// -------------------------------------------------------------
// 1. ИЗВЛЕЧЕНИЕ СЫРОГО ТЕКСТА
// -------------------------------------------------------------
class StatementExtractor {
  static async extractLinesFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const allLines = [];

    const Y_TOLERANCE = 3.5;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      const sortedItems = textContent.items.filter(it => it.str && it.str.trim().length > 0);
      sortedItems.sort((a, b) => {
        if (Math.abs(a.transform[5] - b.transform[5]) > Y_TOLERANCE) {
          return b.transform[5] - a.transform[5];
        }
        return a.transform[4] - b.transform[4];
      });

      let currentLine = [];
      let currentY = null;

      for (const item of sortedItems) {
        const text = item.str.trim();
        const y = item.transform[5];

        if (currentY === null || Math.abs(y - currentY) <= Y_TOLERANCE) {
          currentLine.push(text);
          if (currentY === null) currentY = y;
        } else {
          if (currentLine.length > 0) {
            allLines.push(currentLine.join(' '));
          }
          currentLine = [text];
          currentY = y;
        }
      }
      if (currentLine.length > 0) {
        allLines.push(currentLine.join(' '));
      }
    }

    return allLines;
  }
}

// -------------------------------------------------------------
// ДИНАМИЧЕСКИЕ КАТЕГОРИИ И ИКОНКИ ИЗ FIREBASE
// -------------------------------------------------------------

/**
 * Возвращает массив названий категорий нужного типа из Firebase
 */
function getActiveCategories(type = 'Расход') {
  const cats = window.Cache?.categories;
  if (!cats) {
    return type === 'Доход' ? ['Зарплата', 'Другое'] : ['Продукты', 'Другое'];
  }
  const list = type === 'Доход' ? (cats.income || []) : (cats.expense || []);
  const names = list.map(c => (typeof c === 'string' ? c : c?.name)).filter(Boolean);
  return [...new Set(names)];
}

/**
 * Находит актуальную иконку для любой категории из базы (включая созданные пользователем)
 */
function getDynamicCategoryIcon(catName) {
  if (!catName) return 'tag';
  const cats = window.Cache?.categories;
  if (cats) {
    const all = [...(cats.expense || []), ...(cats.income || [])];
    const found = all.find(c => (typeof c === 'string' ? c === catName : c?.name === catName));
    if (found) {
      const rawIcon = typeof found === 'object' ? found.icon : null;
      if (rawIcon && rawIcon !== '📦' && rawIcon !== 'package') return rawIcon;
    }
  }
  const defaultIcons = {
    'Продукты': 'shopping-cart',
    'Кафе и рестораны': 'utensils',
    'Маркетплейсы': 'shopping-bag',
    'Транспорт': 'car',
    'Жилье': 'home',
    'ЖКХ': 'home',
    'Одежда': 'shirt',
    'Здоровье': 'heart-pulse',
    'Развлечения': 'film',
    'Другое': 'tag',
    'Зарплата': 'wallet',
    'Возврат': 'rotate-ccw',
    'Кэшбек': 'sparkles',
    'Начисление процентов': 'percent',
    'Проценты': 'percent',
    'Капитализация': 'percent',
    'Капитализация процентов': 'percent',
    'Вклады': 'landmark',
    'Дивиденды': 'trending-up',
    'Инвестиции': 'line-chart',
    'Подписки': 'credit-card',
    'Связь': 'phone',
    'Образование': 'graduation-cap',
    'Подарки': 'gift',
    'Семья': 'users',
    'Дети': 'baby',
    'Красота': 'sparkles',
    'Спорт': 'dumbbell',
    'Авто': 'car',
    'Путешествия': 'plane',
    'Ремонт': 'hammer',
    'Техника': 'smartphone',
    'Перевод': 'arrow-left-right'
  };
  if (defaultIcons[catName]) return defaultIcons[catName];
  const lower = String(catName).toLowerCase();
  for (const [k, v] of Object.entries(defaultIcons)) {
    if (k.toLowerCase() === lower || lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) {
      return v;
    }
  }
  return 'tag';
}

// -------------------------------------------------------------
// 3. УНИВЕРСАЛЬНЫЙ ОПРЕДЕЛИТЕЛЬ (И ДОХОДЫ, И РАСХОДЫ ИЗ FIREBASE)
// -------------------------------------------------------------
// StatementCategorizer определен в default-rules.js с поддержкой взвешенного скоринга, стемминга и MCC

// =============================================================
// 1. УНИВЕРСАЛЬНЫЙ ДВИЖОК ПАРСИНГА ВЫПИСОК
// =============================================================

// Единый список признаков переводов и движения наличных для всех банков
const UNIVERSAL_TRANSFER_KEYWORDS = [
  'перевод', 'сбп', 'между счетами', 'снятие наличных', 'внесение наличных',
  'взнос наличными', 'зачисление наличных', 'пополнение наличными', 'наличными',
  'vklad-karta', 'karta-vklad', 'bpwww', 'брокер', 'vb24'
];

// Общие служебные строки (шапки, подвалы документов)
const COMMON_SERVICE_LINES = [
  'страница', 'выписка по', 'справка о движении', 'входящий остаток',
  'исходящий остаток', 'итого зачислений', 'итого списаний', 'итого оборотов',
  'с уважением', 'руководитель департамента', 'начальник отдела', 'сопровождения кредитов',
  'кредитов и депозитов', 'е.в. самохвалова', 'самохвалова',
  'лицензия банка россии', 'генеральная лицензия', 'номер лицевого счёта',
  'продолжение на', 'продолжение следующей', 'продолжение выписки', 'продолжение таблицы',
  'продолжение на следующей', 'окончание таблицы', 'ао «яндекс банк»', 'яндекс банк',
  'ул. садовническая', 'yabank.yandex.ru', 'welcome@bank.yandex.ru'
];

// Утилита очистки суммы из строки в число
function cleanAmount(str) {
  if (!str) return 0;
  const clean = str.replace(/[+−–—\-\u2012\u2013\u2014\u2212]/g, '')
                   .replace(/[^\d.,]/g, '')
                   .replace(',', '.');
  return Math.abs(parseFloat(clean)) || 0;
}

/**
 * Очищает название операции/магазина от служебных фраз разбиения страниц и подписей в PDF
 */
function cleanMerchantTitle(str) {
  if (!str) return '';
  return String(str)
    .replace(/продолжение\s*(на\s*)?(след(ующей|ующем|ующих|\.))?\s*(страниц[еаы]|листе|стр\.?|таблицы|выписки)?(\.{3})?/gi, ' ')
    .replace(/окончание\s+таблицы/gi, ' ')
    .replace(/(?:страница|стр\.?|лист)\s*\d+(\s*из\s*\d+)?/gi, ' ')
    .replace(/(?:^|[^\wа-яёА-ЯЁ])\.?\s*операци[яиею](?:\s+(?:по\s+карте|по\s+счету|со\s+счетом|в\s+системе))?(?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
    .replace(/(?:^|[^\wа-яёА-ЯЁ])\.?\s*операци[яиею](?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
    .replace(/(?:^|[^\wа-яёА-ЯЁ])(?:операции\s+обработки|операции\s+договора|договора\s+мск|номер\s+договора|номер\s+карты|валюта\s+операции:?|валюта\s+счета:?|сумма\s+в\s+валюте|сумма\s+операции|дата\s+операции|дата\s+обработки|дата\s+проводки)(?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
    .replace(/(?:^|[^\wа-яёА-ЯЁ])(?:операции|операция|операцию|обработки|договора)(?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
    .replace(/(?:^|[^\wа-яёА-ЯЁ])(?:мск|utc|gmt)(?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
    .replace(/(?:российские\s+рубли|российский\s+рубль|выписка\s+по\s+карте|выписка\s+по\s+счету)/gi, ' ')
    .replace(/(?:с\s+уважением|вице[- ]президент|главный\s+бухгалтер|ответственный\s+исполнитель|исходящий\s+остаток|итого\s+списаний|итого\s+зачислений|дата\s+формирования(?:\s+выписки)?|должность:?)/gi, ' ')
    .replace(/^[.,:;\-_/\\«"'#*&()]|[.,:;\-_/\\»"'#*&()]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
window.cleanMerchantTitle = cleanMerchantTitle;

/**
 * Гарантированно распознает веб-ссылку (URL) или интернет-домен в строке
 * Поддерживает схемы http://, https://, префиксы www., любые уровни поддоменов (lk.ugmk-telecom.ru),
 * национальные и международные зоны (.ru, .рф, .com, .org, .net, .pro, .io, .me и др.).
 * Точки внутри адресов никогда не обрезаются.
 */
function extractWebsiteLink(text) {
  if (!text) return null;
  const str = String(text);

  // 1. Полные URL с протоколом (https://... или http://...)
  const fullUrlMatch = str.match(/\bhttps?:\/\/[^\s<>"'()[\]{}]+/i);
  if (fullUrlMatch) {
    let url = fullUrlMatch[0];
    // Обрезаем только внешнюю пунктуацию на конце (точки, многоточия ..., запятые, двоеточия)
    url = url.replace(/[.,;:!?]+$/, '').trim();
    if (url.includes('.') || url.length > 10) {
      return url;
    }
  }

  // 2. Ссылки с www.
  const wwwMatch = str.match(/\bwww\.[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+(?:\/[^\s<>"'()[\]{}]*)?/i);
  if (wwwMatch) {
    return wwwMatch[0].replace(/[.,;:!?]+$/, '').trim();
  }

  // 3. Домены без схемы (например: lk.ugmk-telecom.ru, vezaruspro.ru, sberbank.ru, dns-shop.ru)
  // Исключаем денежные суммы вроде 450.00, даты 24.09.2025 и номера счетов
  const domainMatch = str.match(/\b(?![0-9]+[.,][0-9]+)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:ru|рф|com|org|net|io|pro|me|cc|biz|info|site|online|store|shop|app|dev|su|by|kz|[a-zA-Z]{2,10})(?:\/[^\s<>"'()[\]{}]*)?\b/i);
  if (domainMatch) {
    let dom = domainMatch[0].replace(/[.,;:!?]+$/, '').trim();
    if (!/^\d{2}\.\d{2}\.\d{2,4}$/.test(dom)) {
      return dom;
    }
  }

  return null;
}
window.extractWebsiteLink = extractWebsiteLink;

/**
 * Интеллектуально извлекает значение терминала/устройства из выписки,
 * гарантируя сохранение полных веб-ссылок (URL), поддоменов и точек внутри адресов
 * (например: "Устройство: https://lk.ugmk-telecom.ru... Город: Верхняя Пышма." -> "https://lk.ugmk-telecom.ru")
 * (например: "Устройство: SBP https://lk.vezaruspro. Город: MOSKVA." -> "SBP https://lk.vezaruspro")
 */
function extractDeviceField(text) {
  if (!text) return null;
  const fullStr = String(text);

  // 1. Ищем секцию поля "Устройство:"
  const devIndex = fullStr.search(/Устройство:\s*/i);
  if (devIndex !== -1) {
    const afterDevice = fullStr.slice(devIndex).replace(/^Устройство:\s*/i, '');

    // Проверяем: есть ли в поле "Устройство" ссылка на веб-сайт / домен
    const urlInDevice = extractWebsiteLink(afterDevice.slice(0, 180));
    if (urlInDevice) {
      // Проверяем, был ли префикс перед ссылкой (например: "SBP " или "ПАО ")
      const prefixMatch = afterDevice.match(/^([A-Za-zА-Яа-яЁё0-9_\-\s]{2,12}?)\s+(https?:\/\/|[a-zA-Z0-9-]+\.[a-zA-Z0-9-.])/i);
      if (prefixMatch && prefixMatch[1] && !/^(город|сумма|валюта|карта)$/i.test(prefixMatch[1].trim())) {
        return `${prefixMatch[1].trim()} ${urlInDevice}`;
      }
      return urlInDevice;
    }

    // Если ссылки нет, стандартно извлекаем терминал устройства до следующего поля выписки
    const m = afterDevice.match(/^([\s\S]+?)(?=(?:\.\s*(?:Город|Сумма|Валюта|Карта|MCC|Код|Терминал|Дата|Банкомат|Пункт)|\b(?:Город|Сумма|Валюта|Карта|MCC|Код|Терминал|Дата):|\.\s*[А-ЯA-Z][а-яa-z]+:|\.\s*$|$))/i);
    if (m && m[1]) {
      let dev = m[1].trim().replace(/\.+$/, '').trim();
      return dev;
    }
  }

  // 2. Если отдельного ключевого слова "Устройство:" нет, но в строке есть веб-ссылка
  const standaloneUrl = extractWebsiteLink(fullStr);
  if (standaloneUrl && (fullStr.toLowerCase().includes('оплата') || fullStr.toLowerCase().includes('pos') || fullStr.toLowerCase().includes('retail'))) {
    return standaloneUrl;
  }

  return null;
}
window.extractDeviceField = extractDeviceField;

/**
 * Надежно удаляет любые маски карт, хвосты номеров и платежные префиксы без повреждения названий мерчантов
 */
function stripCardTokens(str) {
  if (!str) return '';
  return String(str)
    // 0. Фразы операций по картам и счетам (например: ". Операция по карте ****1234", "Операция по счету ****1234", "Операция по счету", "Операция по карте", ". Операция")
    .replace(/(?:^|[^\wа-яёА-ЯЁ])\.?\s*операци[яиею]\s+(?:по\s+карте|по\s+счету|со\s+счетом|с\s+карты|на\s+карту)(?:\s*[*xX.\-]*\s*\d{4})?(?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
    .replace(/(?:^|[^\wа-яёА-ЯЁ])\.?\s*(?:по\s+карте|со\s+счета|на\s+счет|по\s+счету)\s*[*xX.\-]*\s*\d{4}(?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
    // 1. Длинные маски карт (например: 2200********1234, 4276**1234, 548410******1234)
    .replace(/\b\d{4,6}[\s*xX.\-]{2,12}\d{4}\b/g, ' ')
    // 2. Системные префиксы карт (например: MC *1234, MIR *1234, ECMC 1234, VISA *1234, MIR_1234, CRD 1234, PAN 1234)
    .replace(/(?:MC|MIR|VISA|ECMC|MASTERCARD|МИР|CARD|CRD|PAN|T-PAY|MIR\s*PAY|SBERPAY)\s*[-_:]?\s*[*xX.\-]*\s*\d{4}/gi, ' ')
    // 3. Фразы с упоминанием карты (например: карта: *1234, по карте 1234, с карты *1234, на карту *1234, номер карты: *1234)
    .replace(/(?:по\s+карте|с\s+карты|на\s+карту|номер\s+карты:?|карта:?|карте:?)\s*[*xX.\-]*\s*\d{4}/gi, ' ')
    // 4. Любые маски с звездочками, крестиками или точками (например: *1234, ** 1234, ..1234, ****1234, *1234*)
    .replace(/(?:^|[^\wа-яёА-ЯЁ])[*xX.\-]{1,6}\s*\d{4}(?=[^\wа-яёА-ЯЁ]|$)/g, ' ')
    // 5. Оставшиеся изолированные маски
    .replace(/(?:^|\s)[*xX.\-]+\d{4}(?=[^\wа-яёА-ЯЁ]|$)/g, ' ')
    // 6. Хвосты слова "операция", ". операция", "операции", "операцию"
    .replace(/(?:^|[^\wа-яёА-ЯЁ])\.?\s*операци[яиею](?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
window.stripCardTokens = stripCardTokens;

/**
 * Интеллектуальная обратная транслитерация (латиница терминалов эквайринга РФ -> кириллица)
 * 4-уровневая система оценки уверенности (Confidence Scoring + English Vocabulary Shield + Russian Morphology)
 */
const PROTECTED_ENGLISH_BRANDS = new Map([
  ['wildberries', 'Wildberries'],
  ['ozon', 'Ozon'],
  ['dns', 'DNS'],
  ['kfc', 'KFC'],
  ['wb', 'WB'],
  ['burger king', 'Burger King'],
  ['burgerrus', 'Burger King'],
  ['burgerking', 'Burger King'],
  ['subway', 'Subway'],
  ['starbucks', 'Starbucks'],
  ['stars coffee', 'Stars Coffee'],
  ['fix price', 'Fix Price'],
  ['fixprice', 'Fix Price'],
  ['boosty', 'Boosty'],
  ['okey', 'Окей'],
  ['ok', 'Окей'],
  ['vkusvill', 'ВкусВилл'],
  ['apple', 'Apple'],
  ['google', 'Google'],
  ['microsoft', 'Microsoft'],
  ['sony', 'Sony'],
  ['samsung', 'Samsung'],
  ['xiaomi', 'Xiaomi'],
  ['huawei', 'Huawei'],
  ['honor', 'Honor'],
  ['steam', 'Steam'],
  ['playstation', 'PlayStation'],
  ['xbox', 'Xbox'],
  ['nintendo', 'Nintendo'],
  ['spotify', 'Spotify'],
  ['netflix', 'Netflix'],
  ['youtube', 'YouTube'],
  ['twitch', 'Twitch'],
  ['discord', 'Discord'],
  ['telegram', 'Telegram'],
  ['whatsapp', 'WhatsApp'],
  ['viber', 'Viber'],
  ['zoom', 'Zoom'],
  ['uber', 'Uber'],
  ['nike', 'Nike'],
  ['adidas', 'Adidas'],
  ['puma', 'Puma'],
  ['reebok', 'Reebok'],
  ['zara', 'Zara'],
  ['h&m', 'H&M'],
  ['mango', 'Mango'],
  ['uniqlo', 'Uniqlo'],
  ['ikea', 'IKEA'],
  ['leroy merlin', 'Leroy Merlin'],
  ['metro', 'Metro'],
  ['spar', 'Spar'],
  ['globus', 'Globus'],
  ['auchan', 'Auchan'],
  ['atak', 'Atak'],
  ['hoff', 'Hoff'],
  ['castorama', 'Castorama'],
  ['obi', 'OBI'],
  ['gloria jeans', 'Gloria Jeans'],
  ['kari', 'Kari'],
  ['rendez-vous', 'Rendez-Vous'],
  ['henderson', 'Henderson'],
  ['befree', 'Befree'],
  ['sela', 'Sela'],
  ['zarina', 'Zarina'],
  ['dodo', 'Додо'],
  ['dodo pizza', 'Додо Пицца'],
  ['papa johns', 'Papa Johns'],
  ['dominos', 'Dominos'],
  ['cinnabon', 'Cinnabon'],
  ['krispy kreme', 'Krispy Kreme'],
  ['paul', 'Paul'],
  ['coffix', 'Cofix'],
  ['cofix', 'Cofix'],
  ['one price coffee', 'One Price Coffee'],
  ['surf coffee', 'Surf Coffee'],
  ['skuratov', 'Skuratov'],
  ['prime', 'Prime'],
  ['coffeemania', 'Кофемания'],
  ['rostics', 'Rostics'],
  ['t2', 'Т2'],
  ['mts', 'МТС'],
  ['mtc', 'МТС'],
  ['vtb', 'ВТБ'],
  ['sber', 'Сбер'],
  ['sberbank', 'Сбербанк'],
  ['gpb', 'ГПБ'],
  ['alfa', 'Альфа'],
  ['alfabank', 'Альфа-Банк'],
  ['tinkoff', 'Тинькофф'],
  ['t-bank', 'Т-Банк'],
  ['tbank', 'Т-Банк'],
  ['sb-bank', 'СБ-Банк'],
  ['sbbank', 'СБ-Банк'],
  ['visa', 'Visa'],
  ['mastercard', 'MasterCard'],
  ['mir', 'МИР'],
  ['qiwi', 'QIWI'],
  ['yoomoney', 'ЮMoney'],
  ['aliexpress', 'AliExpress'],
  ['shein', 'Shein'],
  ['asos', 'ASOS'],
  ['iherb', 'iHerb'],
  ['leomax', 'Leomax'],
  ['lamoda', 'Lamoda'],
  ['avito', 'Авито'],
  ['cian', 'Циан'],
  ['amazon', 'Amazon']
]);

const COMMON_ENGLISH_WORDS = new Set([
  'to', 'go', 'at', 'for', 'by', 'with', 'from', 'of', 'and', 'or', 'the', 'a', 'an',
  'store', 'market', 'shop', 'purchase', 'payment', 'game', 'pay', 'delivery',
  'online', 'drive', 'station', 'club', 'bar', 'pub', 'coffee', 'tea', 'food', 'cafe',
  'hotel', 'service', 'services', 'center', 'media', 'digital', 'travel', 'card', 'express',
  'line', 'group', 'auto', 'petrol', 'beauty', 'fitness', 'sport', 'music',
  'play', 'plus', 'life', 'world', 'fast', 'direct', 'smart', 'gold', 'black', 'white',
  'red', 'blue', 'green', 'one', 'two', 'city', 'park', 'tour', 'air', 'aero', 'taxi', 'cinema',
  'bank', 'finance', 'holding', 'free', 'mobile', 'tech', 'soft', 'net', 'web', 'point',
  'price', 'fix', 'time', 'like', 'love', 'good', 'best', 'top', 'super', 'mini', 'max', 'pro',
  'fresh', 'clean', 'eco', 'bio', 'consulting', 'motors', 'logistics', 'development', 'global', 'international',
  'capital', 'lab', 'labs', 'studio', 'space', 'hub', 'box', 'mall', 'plaza', 'street', 'road', 'way',
  'boost', 'boosty', 'donat', 'donate', 'patreon', 'grill', 'burger', 'pizza', 'kitchen', 'sweet'
]);

const KNOWN_RETAIL_TRANSLIT = {
  'moi': 'Мои',
  'moya': 'Моя',
  'moe': 'Мое',
  'documenty': 'Документы',
  'dokumenty': 'Документы',
  'dokumenti': 'Документы',
  'documenti': 'Документы',
  'gosuslugi': 'Госуслуги',
  'pochta': 'Почта',
  'rossii': 'России',
  'rossiya': 'Россия',
  'dostavka': 'Доставка',
  'uslugi': 'Услуги',
  'platezh': 'Платеж',
  'perevod': 'Перевод',
  'perek': 'Перекресток',
  'perekrestok': 'Перекресток',
  'pyaterochka': 'Пятерочка',
  '5ka': 'Пятерочка',
  'magnit': 'Магнит',
  'vkusvill': 'ВкусВилл',
  'lenta': 'Лента',
  'diksi': 'Дикси',
  'samokat': 'Самокат',
  'kuper': 'Купер',
  'chizhik': 'Чижик',
  'krasnoe': 'Красное',
  'beloe': 'Белое',
  'apteka': 'Аптека',
  'aprel': 'Апрель',
  'stolichki': 'Столички',
  'rigla': 'Ригла',
  'gorzdrav': 'Горздрав',
  'vita': 'Вита',
  'voda': 'Вода',
  'zhivaya': 'Живая',
  'krendel': 'Крендель',
  'krendelya': 'Кренделя',
  'krendelva': 'Кренделя',
  'transkom': 'Транском',
  'mezhdunarodnyj': 'Международный',
  'lunda': 'Лунда',
  'khozyaystvennyy': 'Хозяйственный',
  'khozyaystvennye': 'Хозяйственные',
  'khozyaystvenny': 'Хозяйственный',
  'khoztovary': 'Хозтовары',
  'produkty': 'Продукты',
  'produkti': 'Продукты',
  'avtozapchasti': 'Автозапчасти',
  'zapchasti': 'Запчасти',
  'avtotovary': 'Автотовары',
  'magazin': 'Магазин',
  'tsvety': 'Цветы',
  'tsvetov': 'Цветов',
  'stomatologiya': 'Стоматология',
  'pekarnya': 'Пекарня',
  'stolovaya': 'Столовая',
  'kafe': 'Кафе',
  'restoran': 'Ресторан',
  'shkola': 'Школа',
  'sadik': 'Садик',
  'deti': 'Дети',
  'kvartira': 'Квартира',
  'leasing': 'Лизинг',
  'lizing': 'Лизинг',
  'rayona': 'Района',
  'rayon': 'Район',
  'dom': 'Дом',
  'muzei': 'Музей',
  'muzey': 'Музей',
  'krem': 'Крем',
  'hleb': 'Хлеб',
  'sever': 'Север',
  'dent': 'Дент',
  'sankt': 'Санкт',
  'peterburg': 'Петербург',
  'petrograd': 'Петроград',
  'moskva': 'Москва',
  'moscow': 'Москва',
  'rostov': 'Ростов',
  'donu': 'Дону',
  'na': 'на',
  'i': 'и',
  'krasnodar': 'Краснодар',
  'kazan': 'Казань',
  'novosibirsk': 'Новосибирск',
  'ekaterinburg': 'Екатеринбург',
  'chelyabinsk': 'Челябинск',
  'dostaevsky': 'Достаевский',
  'dostaevskiy': 'Достаевский',
  'dostaevskij': 'Достаевский',
  'teatr': 'Театр',
  'burgerrus': 'Burger King',
  'burgerking': 'Burger King',
  'kofe': 'Кофе',
  'vypechka': 'Выпечка',
  'chay': 'Чай',
  'lavka': 'Лавка',
  'eda': 'Еда',
  'okey': 'Окей',
  'vkustime': 'Вкустайм',
  'passaghiram': 'Пассажирам',
  'passazhiram': 'Пассажирам',
  'nesselbek': 'Несселбек',
  'nesselbeck': 'Несселбек',
  'varochnaya': 'Варочная',
  'gbuz': 'ГБУЗ',
  'gp': 'ГП',
  'dzm': 'ДЗМ',
  'gku': 'ГКУ',
  'is': 'ИС',
  'mbu': 'МБУ',
  'do': 'ДО',
  'dshi': 'ДШИ',
  'tszh': 'ТСЖ',
  'snt': 'СНТ',
  'fns': 'ФНС',
  'eirc': 'ЕИРЦ',
  'reu': 'РЭУ',
  'mfc': 'МФЦ',
  'mfz': 'МФЦ',
  'gibdd': 'ГИБДД',
  'mvd': 'МВД',
  'mchs': 'МЧС',
  'fok': 'ФОК',
  'nii': 'НИИ',
  'ran': 'РАН',
  'mgu': 'МГУ',
  'vshe': 'ВШЭ',
  'mai': 'МАИ',
  'mgtu': 'МГТУ',
  'mifi': 'МИФИ',
  'mfti': 'МФТИ',
  'mpgu': 'МПГУ',
  'rggu': 'РГГУ',
  'rudn': 'РУДН',
  'mgimo': 'МГИМО',
  'ranhigs': 'РАНХИГС',
  'sbp': 'СБП',
  'zhkh': 'ЖКХ',
  'azs': 'АЗС',
  'sto': 'СТО',
  'tsum': 'ЦУМ',
  'gum': 'ГУМ',
  'smu': 'СМУ',
  'chop': 'ЧОП',
  'fgup': 'ФГУП',
  'mup': 'МУП',
  'gup': 'ГУП',
  'okb': 'ОКБ',
  'kb': 'КБ',
  'tskb': 'ЦКБ',
  'dgkb': 'ДГКБ',
  'gkb': 'ГКБ',
  'kdc': 'КДЦ',
  'crb': 'ЦРБ',
  'kvd': 'КВД',
  'ses': 'СЭС',
  'rzd': 'РЖД',
  'mtppk': 'МТППК',
  'szppk': 'СЗППК',
  'cppk': 'ЦППК',
  'mcd': 'МЦД',
  'mck': 'МЦК',
  'bkad': 'БКАД',
  'omvd': 'ОМВД',
  'ufk': 'УФК',
  'ufns': 'УФНС',
  'fss': 'ФСС',
  'pfr': 'ПФР',
  'sfr': 'СФР'
};

const RUSSIAN_ABBREVIATIONS = new Set([
  'ГБУЗ', 'ГП', 'ДЗМ', 'ГКУ', 'ИС', 'МБУ', 'ДО', 'ДШИ', 'ТСЖ', 'СНТ', 'ФНС', 'УК', 'ЦАО', 'ЗАО', 'МФЦ',
  'РЭУ', 'ЕИРЦ', 'ГИБДД', 'МВД', 'МЧС', 'ФОК', 'ФОЦ', 'НИИ', 'РАН', 'МГУ', 'СПБГУ', 'ВШЭ', 'МАИ', 'МГТУ',
  'МИФИ', 'МФТИ', 'МПГУ', 'РГГУ', 'РУДН', 'МГИМО', 'РАНХИГС', 'СБП', 'ЖКХ', 'АЗС', 'СТО', 'ТЦ', 'ТРЦ', 'ТРК',
  'БЦ', 'ЦУМ', 'ГУМ', 'ДЛТ', 'СМУ', 'УПТК', 'ЧОП', 'ОАО', 'ЗАО', 'ПАО', 'ООО', 'ИП', 'НКО', 'АНО', 'ФГУП',
  'МУП', 'ГУП', 'МАУ', 'КДУ', 'ОКБ', 'КБ', 'ЦКБ', 'ДГКБ', 'ГКБ', 'КДЦ', 'ЦРБ', 'КВД', 'СЭС', 'РЖД',
  'МТППК', 'СЗППК', 'ЦППК', 'МЦД', 'МЦК', 'БКАД', 'ОМВД', 'УФК', 'УФНС', 'ФСС', 'ПФР', 'СФР', 'МТС',
  'ВТБ', 'ГПБ', 'СПБ', 'СБЕР', 'СБ', 'Т-БАНК', 'Т2', 'DNS', 'KFC', 'WB', 'RZD', 'MTC', 'MTS', 'VTB', 'GPB',
  'SPB', 'SMS', 'QR', 'POS', 'ATM', 'PRO', 'FM', 'VIP', 'ID', 'AI', 'IT', 'HR', 'PR', 'API', 'SDK', 'USB',
  'LED', 'LCD', 'OLED', 'SIM', 'VPN', 'PIN', 'P2P', 'SBP', 'C2C', 'C2B', 'B2B', 'SZP', 'SZPP', 'SZPPK',
  'ИНН', 'КПП', 'БИК', 'ОГРН', 'СНИЛС', 'РФ', 'ТВ'
]);

function isEnglishWordOrBrand(w) {
  if (!w) return false;
  const lower = w.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return PROTECTED_ENGLISH_BRANDS.has(lower) || COMMON_ENGLISH_WORDS.has(lower);
}

/**
 * Оценка уверенности (Confidence Score 0-100), является ли латинское слово транслитерированным русским
 */
function getRussianTranslitConfidence(word, context = {}) {
  if (!word || word.length < 2) return 0;
  const lower = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!lower) return 0;

  if (KNOWN_RETAIL_TRANSLIT[lower]) {
    return 100;
  }

  if (isEnglishWordOrBrand(lower)) {
    return 0;
  }

  let score = 0;

  // 1. Морфологические окончания прилагательных и существительных РФ (+40-55)
  if (/(?:naya|noe|nye|nyy|nyj|aya|oe|ye|ogo|ego|omu|emu|ykh|ikh|ym|im|ymi|imi|uyu|skoe|skaja|skaya|skiy|skij|skie|ovoe|evoe|inaya|inyy)$/i.test(lower)) {
    score += 55;
  } else if (/(?:stvo|stvie|tsiya|tsii|tsiyu|tsiey|nik|nitsa|shchik|chik|itsa|ovka|evka|ishche|yami|ami|akh|yakh|am|om|em|ey|ka|ko|ok|ik|ets|nya)$/i.test(lower)) {
    score += 40;
  } else if (/^[a-z]+(?:ov|ev|in|ova|eva|ina|skiy|sky|tsky|tskiy|itsky)$/i.test(lower) && lower.length >= 5) {
    score += 50;
  }

  // 2. Русские характерные n-граммы буквосочетаний (+25-60)
  if (/shch/i.test(lower)) score += 60;
  if (/zhiv|mezh|khoz|tsvet|tsentr|dostav|passagh|passazh/i.test(lower)) score += 50;
  if (/\b(?:zh|kh|ts|cz|tc|tz|ch|sh)/i.test(lower) || /(?:zh|kh|ts|cz|tc|tz|ch|sh)\b/i.test(lower) || /zh|kh|ch|sh/i.test(lower)) score += 35;
  if (/yu|ya|yo|ye/i.test(lower)) score += 25;
  if (/nyj|nyy|iy|yy|yj|ij|jj/i.test(lower)) score += 35;

  // 3. Характерные русские приставки и корни (+45)
  if (/^(?:avto|stroy|prom|sbyt|torg|snab|farm|med|dor|mezh|zhiv|pod|nad|pri|bez|vse|dlya|khoz|pekar|stolov|shkol|sadik|vy|pere|pro|za|ros|mos|spb)/i.test(lower)) {
    score += 45;
  }

  // 4. Контекст: наличие юр. лица РФ (ООО, ИП) или города РФ (+20-30)
  if (context.hasRussianOrg) score += 30;
  if (context.hasRussianCity) score += 20;

  // 5. Отрицательные английские сигналы (диграфы и суффиксы, чуждые русскому транслиту)
  if (/th|wh|ck|ee|oo|ight|tion|ing|ment|ness|able|ible/i.test(lower)) {
    score -= 40;
  }

  return Math.max(0, Math.min(100, score));
}

function transliterateRussianWord(word) {
  const lower = word.toLowerCase();
  if (KNOWN_RETAIL_TRANSLIT[lower]) {
    return KNOWN_RETAIL_TRANSLIT[lower];
  }

  // Словарь слов с мягким знаком
  const SOFT_SIGN_WORDS = {
    'aprel': 'апрель', 'rubl': 'рубль', 'svyaz': 'связь', 'set': 'сеть', 'neft': 'нефть',
    'stroy': 'строй', 'byt': 'быт', 'put': 'путь', 'zhizn': 'жизнь', 'sol': 'соль',
    'stal': 'сталь', 'med': 'медь', 'gost': 'гость', 'dver': 'дверь', 'tserkov': 'церковь',
    'lyubov': 'любовь', 'sibir': 'сибирь', 'tver': 'тверь', 'perm': 'пермь', 'kazan': 'казань',
    'ryazan': 'рязань', 'yaroslavl': 'ярославль', 'fevral': 'февраль', 'iyul': 'июль', 'iyun': 'июнь',
    'sentyabr': 'сентябрь', 'oktyabr': 'октябрь', 'noyabr': 'ноябрь', 'dekabr': 'декабрь',
    'otel': 'отель', 'kartofel': 'картофель', 'mebel': 'мебель', 'stil': 'стиль', 'avtomobil': 'автомобиль'
  };
  if (SOFT_SIGN_WORDS[lower]) {
    const res = SOFT_SIGN_WORDS[lower];
    return res.charAt(0).toUpperCase() + res.slice(1);
  }

  let res = lower;

  // Защита слога "yo" после гласных (например: rayona -> района)
  res = res.replace(/([aeiouyаеёиоуыэюя])yo/g, '$1йо');

  const MULTI = [
    ['passagh', 'пассаж'],
    ['shch', 'щ'],
    ['zhiv', 'жив'],
    ['mezh', 'меж'],
    ['trans', 'транс'],
    ['trevel', 'тревел'],
    ['travel', 'тревел'],
    ['sh', 'ш'],
    ['ch', 'ч'],
    ['zh', 'ж'],
    ['kh', 'х'],
    ['ts', 'ц'],
    ['tc', 'ц'],
    ['cz', 'ц'],
    ['tz', 'ц'],
    ['yu', 'ю'],
    ['ya', 'я'],
    ['yo', 'ё'],
    ['ye', 'е'],
    ['nyj', 'ный'],
    ['nyy', 'ный'],
    ['naya', 'ная'],
    ['noe', 'ное'],
    ['nye', 'ные'],
    ['iy', 'ий'],
    ['yy', 'ый'],
    ['yj', 'ый'],
    ['ij', 'ий'],
    ['jj', 'й']
  ];

  for (const [lat, cyr] of MULTI) {
    res = res.replaceAll(lat, cyr);
  }

  const SINGLE = {
    'a': 'а', 'b': 'б', 'v': 'в', 'w': 'в', 'g': 'г', 'd': 'д', 'e': 'е',
    'z': 'з', 'i': 'и', 'j': 'й', 'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н',
    'o': 'о', 'p': 'п', 'r': 'р', 's': 'с', 't': 'т', 'u': 'у', 'f': 'ф',
    'h': 'х', 'c': 'к', 'y': 'ы', 'x': 'кс', 'q': 'к'
  };

  let out = '';
  for (let i = 0; i < res.length; i++) {
    const ch = res[i];
    if (SINGLE[ch]) {
      if (ch === 'y' && (i === 0 || 'аеёиоуыэюя'.includes(out[out.length - 1]))) {
        out += 'й';
      } else if (ch === 'y' && i === res.length - 1 && out.endsWith('н') && out.length > 3) {
        out += 'ый';
      } else {
        out += SINGLE[ch];
      }
    } else {
      out += ch;
    }
  }

  if (word === word.toUpperCase() && word.length > 1) {
    return out.toUpperCase();
  }
  if (word[0] === word[0].toUpperCase()) {
    return out.charAt(0).toUpperCase() + out.slice(1);
  }
  return out;
}

function smartTransliterateMerchant(title) {
  if (!title) return '';
  // Интернет-ссылки и доменные имена никогда не транслитерируются
  if (/^(?:https?:\/\/|www\.|\S+\.(?:ru|com|org|net|pro|io|рф))/i.test(title)) return title;

  // Очистка технических префиксов эквайринга: 0T0*, OT0*, KO_, T01_, OTO
  let s = String(title)
    .replace(/(?:^|\s+)(?:0T0|OT0|OTO|KO|T01|POS)[*_\s]\s*/gi, ' ')
    .replace(/(^|[\s"«(])(?:ooo|ооо)([\s"»)–-]|$)/gi, '$1ООО$2')
    .replace(/(^|[\s"«(])(?:pao|пао|iao)([\s"»)–-]|$)/gi, '$1ПАО$2')
    .replace(/(^|[\s"«(])zao([\s"»)–-]|$)/gi, '$1ЗАО$2')
    .replace(/(^|[\s"«(])ip([\s"»)–-]|$)/gi, '$1ИП$2');

  // Сохранение защищенных многословных брендов
  const lowerS = s.toLowerCase();
  for (const [key, val] of PROTECTED_ENGLISH_BRANDS.entries()) {
    if ((key.includes(' ') || key.includes('-')) && lowerS.includes(key)) {
      const reg = new RegExp('(^|[^a-zA-Z0-9а-яёА-ЯЁ])' + key.replace(/[- ]/g, '[- ]') + '($|[^a-zA-Z0-9а-яёА-ЯЁ])', 'gi');
      s = s.replace(reg, `$1${val}$2`);
    }
  }

  const hasRussianOrg = /\b(?:ООО|ПАО|ЗАО|ИП)\b/.test(s);
  const hasRussianCity = /\b(?:MOSKVA|MOSCOW|SANKT|PETERBURG|CHELYABINSK|KAZAN|ROSTOV|SAMARA|UFA|PERM)\b/i.test(s);
  const context = { hasRussianOrg, hasRussianCity };

  // Разбиваем по пробелам, дефисам и нижним подчеркиваниям
  const words = s.split(/(\s+|[-/_])/);

  return words.map(w => {
    if (/^[\s\-/_]+$/.test(w)) {
      return w === '_' ? ' ' : w;
    }

    // Инициалы латиницей (например: "I.I." или "A." или "I.") -> кириллические заглавные инициалы
    if (/^[a-zA-Z]\.([a-zA-Z]\.?)*$/i.test(w)) {
      let outInit = '';
      for (let i = 0; i < w.length; i++) {
        const c = w[i].toLowerCase();
        if (c === '.') outInit += '.';
        else {
          const trans = transliterateRussianWord(c);
          outInit += trans.toUpperCase();
        }
      }
      return outInit;
    }

    const prefixMatch = w.match(/^[^a-zA-Z0-9а-яёА-ЯЁ]+/);
    const suffixMatch = w.match(/[^a-zA-Z0-9а-яёА-ЯЁ]+$/);
    const prefix = prefixMatch ? prefixMatch[0] : '';
    const suffix = suffixMatch ? suffixMatch[0] : '';
    const clean = w.slice(prefix.length, w.length - suffix.length);

    if (!clean || !/[a-zA-Z]/.test(clean)) return w;

    const lower = clean.toLowerCase();

    // 1. Если это защищенный бренд -> возвращаем канонический бренд
    if (PROTECTED_ENGLISH_BRANDS.has(lower)) {
      return prefix + PROTECTED_ENGLISH_BRANDS.get(lower) + suffix;
    }

    // 2. Если есть в словаре ритейла/госуслуг
    if (KNOWN_RETAIL_TRANSLIT[lower]) {
      return prefix + KNOWN_RETAIL_TRANSLIT[lower] + suffix;
    }

    // 3. Если слово в английском словаре -> НЕ трогаем, возвращаем оригинал
    if (isEnglishWordOrBrand(lower) && !hasRussianOrg) {
      return w;
    }

    // 4. Вычисляем оценку уверенности транслита (NLP Morphology Scoring)
    const confidence = getRussianTranslitConfidence(clean, context);

    // Если уверенность >= 45% -> транслитерируем в кириллицу
    if (confidence >= 45) {
      const trans = transliterateRussianWord(clean);
      return prefix + trans + suffix;
    }

    // Иначе НЕ уверены -> сохраняем оригинальное написание
    return w;
  }).join('');
}
window.smartTransliterateMerchant = smartTransliterateMerchant;

/**
 * Нормализует регистр названия (Title Case) без искажения аббревиатур, инициалов и интернет-ссылок
 */
function toCleanTitleCase(str) {
  if (!str) return '';
  let s = String(str).trim();
  
  // Удаляем ведущую пунктуацию и концевую пунктуацию (сохраняя точки инициалов)
  s = s.replace(/^[.,:;\-_/\\]+/g, '').trim();
  if (!/(?:^|\s|[«"'(])[А-ЯЁA-Zа-яёa-z]\.$/i.test(s)) {
    s = s.replace(/[,:;\-_/\\]+$/g, '').trim();
  }
  if (!s) return '';

  // 1. Умная транслитерация на основе оценки уверенности
  s = smartTransliterateMerchant(s);

  // 2. Сохранение составных брендов
  const lowerS = s.toLowerCase();
  for (const [key, val] of PROTECTED_ENGLISH_BRANDS.entries()) {
    if ((key.includes(' ') || key.includes('-')) && lowerS.includes(key)) {
      const reg = new RegExp('(^|[^a-zA-Z0-9а-яёА-ЯЁ])' + key.replace(/[- ]/g, '[- ]') + '($|[^a-zA-Z0-9а-яёА-ЯЁ])', 'gi');
      s = s.replace(reg, `$1${val}$2`);
    }
  }

  // Предлоги и союзы, которые остаются строчными внутри фразы
  const LOWER_PREPOSITIONS = new Set(['и', 'в', 'на', 'с', 'со', 'по', 'за', 'под', 'над', 'из', 'от', 'для', 'без', 'у', 'о', 'об', 'обо', 'к', 'ко', 'да', 'но', 'или']);

  // Разбиение на токены с сохранением разделителей
  const tokens = s.split(/(\s+|[-–—/\\«»"()]+)/);

  let wordIndex = 0;
  const result = tokens.map((token) => {
    if (!token || /^\s+$/.test(token)) return token;
    if (/^[-–—/\\«»"()]+$/.test(token)) return token;

    // Инициалы (например: "И.И.", "А.С.", "К.", "A.", "И.")
    if (/^[А-ЯЁA-Z]\.([А-ЯЁA-Z]\.?)*$/i.test(token)) {
      return token.toUpperCase();
    }
    if (/^[А-ЯЁA-Z]\.$/i.test(token)) {
      return token.toUpperCase();
    }

    // Смешанные коды и номера (например: "115", "A101", "36.6", "24/7", "N5058")
    if (/^\d+[A-Za-zА-Яа-яЁё]*$/.test(token) || /^[A-Za-zА-Яа-яЁё]*\d+.*$/.test(token)) {
      return token;
    }

    const cleanToken = token.replace(/^[«"'(]+|[»"')]+$/g, '');
    const upper = cleanToken.toUpperCase();

    // Общепринятые аббревиатуры
    if (RUSSIAN_ABBREVIATIONS.has(upper)) {
      wordIndex++;
      return token.replace(cleanToken, upper);
    }

    // Защищенные бренды
    const lowerClean = cleanToken.toLowerCase();
    if (PROTECTED_ENGLISH_BRANDS.has(lowerClean)) {
      wordIndex++;
      return token.replace(cleanToken, PROTECTED_ENGLISH_BRANDS.get(lowerClean));
    }

    // Строчные предлоги (если не первое слово)
    if (wordIndex > 0 && LOWER_PREPOSITIONS.has(lowerClean)) {
      wordIndex++;
      return token.replace(cleanToken, lowerClean);
    }

    wordIndex++;

    // Стандартная капитализация (первая буква заглавная, остальные строчные)
    if (cleanToken === cleanToken.toUpperCase() || cleanToken === cleanToken.toLowerCase()) {
      const cap = cleanToken.charAt(0).toUpperCase() + cleanToken.slice(1).toLowerCase();
      return token.replace(cleanToken, cap);
    }

    // Сохраняем оригинальный регистр для смешанных названий (например, ВкусВилл)
    return token;
  });

  return result.join('').replace(/\s+/g, ' ').trim();
}
window.toCleanTitleCase = toCleanTitleCase;

/**
 * Интеллектуальный динамический разделитель категории банка и названия торговой точки/операции.
 * Решает проблему, когда банк (Сбербанк, ВТБ, Т-Банк и др.) выгружает в одну ячейку/строку
 * системную категорию и название магазина (например, "Супермаркеты ПЕРЕКРЕСТОК" ->
 * { bankCategory: "Супермаркеты", merchant: "ПЕРЕКРЕСТОК" }).
 * Работает без жесткого хардкода:
 * 1. Анализирует динамические категории из базы данных пользователя и системного списка.
 * 2. Распознает общебанковские составные и однословные секторы расходов (кириллица (?:\s+|$)).
 * 3. Если после категории нет описания (в выписке была только категория), сохраняет её как мерчанта.
 */
function splitBankCategoryAndMerchant(rawText) {
  if (!rawText) return { bankCategory: null, merchant: '' };
  const text = rawText.trim();
  if (text.length < 3) return { bankCategory: null, merchant: text };

  // 1. Сначала проверяем многословные составные категории («Слово и слово», «Слово для слова» и т.д.)
  // Это предотвращает ложное отсечение только первого слова (например, «Одежда» вместо «Одежда и обувь»)
  const multiWordCategoryPatterns = [
    /^(кафе\s+и\s+рестораны|рестораны\s+и\s+кафе|бары\s+и\s+рестораны|фастфуд(?:\s+и\s+кафе)?|столовые|кофейни)(?:\s+|$)/i,
    /^(одежда\s+и\s+обувь|обувь\s+и\s+одежда|аксессуары\s+и\s+одежда)(?:\s+|$)/i,
    /^(здоровье\s+и\s+красота|красота\s+и\s+здоровье|медицина\s+и\s+аптеки|аптеки(?:\s+и\s+оптика)?|стоматология|оптика|салоны\s+красоты)(?:\s+|$)/i,
    /^(отдых\s+и\s+развлечения|развлечения\s+и\s+отдых|культура\s+и\s+искусство|спорт\s+и\s+отдых|спорт\s+и\s+фитнес)(?:\s+|$)/i,
    /^(дом\s+и\s+ремонт|ремонт\s+и\s+строительство|мебель\s+и\s+интерьер|товары\s+для\s+дома|все\s+для\s+дома|сад\s+и\s+огород)(?:\s+|$)/i,
    /^(связь[,]?\s*интернет(?:\s+и\s+тв)?|интернет(?:\s+и\s+тв)?|телеком\s+и\s+связь|мобильная\s+связь)(?:\s+|$)/i,
    /^(коммунальные\s+платежи|жкх(?:\s+и\s+квартплата)?|квартплата)(?:\s+|$)/i,
    /^(автомобиль(?:\s+и\s+мото)?|автоуслуги(?:\s+и\s+запчасти)?|азс(?:\s+и\s+топливо)?|топливо(?:\s+и\s+азс)?)(?:\s+|$)/i,
    /^(детские\s+товары|товары\s+для\s+детей)(?:\s+|$)/i,
    /^(животные\s+и\s+питомцы|зоотовары|товары\s+для\s+животных)(?:\s+|$)/i,
    /^(книги(?:\s+и\s+канцтовары)?|канцтовары)(?:\s+|$)/i,
    /^(цветы(?:\s+и\s+подарки)?|подарки\s+и\s+сувениры)(?:\s+|$)/i,
    /^(ювелирные\s+изделия(?:\s+и\s+часы)?)(?:\s+|$)/i,
    /^(госуслуги[,]?\s*штрафы|налоги(?:\s+и\s+сборы)?|штрафы\s+и\s+пошлины)(?:\s+|$)/i,
    /^(финансовые\s+услуги|услуги\s+банка|банковские\s+услуги)(?:\s+|$)/i,
    /^(перевод(?:ы)?(?:\s+частному\s+лицу|\s+клиенту\s+сбера|\s+на\s+карту|\s+физлицу|\s+по\s+номеру)?)(?:\s+|$)/i,
    /^(снятие\s+наличных|выдача\s+наличных|внесение\s+наличных)(?:\s+|$)/i,
    /^(прочие\s+операции|прочие\s+расходы|прочие\s+платежи|другие\s+расходы|другие\s+платежи)(?:\s+|$)/i
  ];

  for (const pat of multiWordCategoryPatterns) {
    const match = text.match(pat);
    if (match) {
      const detectedCat = match[1].trim();
      const after = text.slice(match[0].length).trim();
      return {
        bankCategory: detectedCat,
        merchant: after.length >= 2 ? after : text
      };
    }
  }

  // 2. Затем однословные категории банков
  const singleWordCategoryPatterns = [
    /^(супермаркеты|супермаркет|продукты|гипермаркеты|гастрономия|бакалея)(?:\s+|$)/i,
    /^(фастфуд|рестораны|кафе|столовые|бары)(?:\s+|$)/i,
    /^(аптеки|аптека|медицина|стоматология|оптика)(?:\s+|$)/i,
    /^(транспорт|такси|каршеринг|парковки|авиабилеты|жд\s+билеты|проезд)(?:\s+|$)/i,
    /^(развлечения|кино|театры|музеи|концерты)(?:\s+|$)/i,
    /^(одежда|обувь|аксессуары)(?:\s+|$)/i,
    /^(косметика|парфюмерия|красота|салоны\s+красоты|парикмахерские)(?:\s+|$)/i,
    /^(электроника(?:\s+и\s+техника)?|бытовая\s+техника|техника|гаджеты)(?:\s+|$)/i,
    /^(образование|курсы|тренинги|обучение)(?:\s+|$)/i,
    /^(путешествия|отели|гостиницы|туризм)(?:\s+|$)/i,
    /^(благотворительность|пожертвования)(?:\s+|$)/i,
    /^(переводы|перевод)(?:\s+|$)/i
  ];

  for (const pat of singleWordCategoryPatterns) {
    const match = text.match(pat);
    if (match) {
      const detectedCat = match[1].trim();
      const after = text.slice(match[0].length).trim();
      return {
        bankCategory: detectedCat,
        merchant: after.length >= 2 ? after : text
      };
    }
  }

  // 3. Динамическая проверка по пользовательским и системным категориям из Firebase / кэша (по убыванию длины)
  const activeCats = (typeof getActiveCategories === 'function')
    ? [...getActiveCategories('Расход'), ...getActiveCategories('Доход')]
    : (window.DEFAULT_SYSTEM_CATEGORIES || []);

  const sortedCats = [...new Set(activeCats)].sort((a, b) => b.length - a.length);
  for (const cat of sortedCats) {
    if (!cat || cat.length < 3) continue;
    const escaped = cat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const dynamicRegex = new RegExp(`^(${escaped})(?:\\s+|$)`, 'i');
    const dMatch = text.match(dynamicRegex);
    if (dMatch) {
      const after = text.slice(dMatch[0].length).trim();
      if (after.length >= 2) {
        return { bankCategory: dMatch[1].trim(), merchant: after };
      }
    }
  }

  return { bankCategory: null, merchant: text };
}
window.splitBankCategoryAndMerchant = splitBankCategoryAndMerchant;

/**
 * ЕДИНЫЙ УНИВЕРСАЛЬНЫЙ ДВИЖОК:
 * Содержит универсальный структурный анализатор выписок (parseUniversal)
 * и сохраняет классический метод (parse) для совместимости с классами банков.
 */
class UniversalStatementParser {
  /**
   * УНИВЕРСАЛЬНЫЙ СЕТОЧНЫЙ АЛГОРИТМ ПАРСИНГА ВЫПИСОК
   * Способен обрабатывать выписки любых банков без захардкоженных классов.
   * 1. Находит границы и семантику колонок таблицы операций (Шаг 1).
   * 2. Выделяет блоки транзакций с учетом многострочных описаний и фильтрации пагинации (Шаг 2).
   * 3. Извлекает дату, сумму, направление (доход/расход), очищает мерчанта и распознает СБП (Шаг 3).
   */
  static parseUniversal(rawLines, bankInfo = {}) {
    if (!Array.isArray(rawLines) || rawLines.length === 0) return [];

    // 1. Интеллектуальный анализ структуры и колонок таблицы
    const layout = this._detectTableLayout(rawLines);

    // 2. Сбор строк в блоки операций
    const blocks = [];
    let currentBlock = null;

    const startIdx = layout.startIndex;
    const endIdx = layout.endIndex;

    for (let i = startIdx; i <= endIdx && i < rawLines.length; i++) {
      const line = rawLines[i].trim();
      if (!line) continue;

      // Проверка на подвал или завершение таблицы
      if (this._isTableEndOrFooter(line, bankInfo)) {
        if (currentBlock) {
          blocks.push(currentBlock);
          currentBlock = null;
        }
        if (this._isFinalTableFooter(line)) {
          break;
        }
        continue;
      }

      // Пропуск колонтитулов и повторов заголовков страниц
      if (this._isPageHeaderOrPagination(line, layout)) {
        continue;
      }

      const nextLine = (i + 1 < rawLines.length) ? rawLines[i + 1].trim() : '';

      if (this._isCandidateTxStart(line, nextLine, layout, currentBlock, bankInfo)) {
        if (currentBlock) {
          blocks.push(currentBlock);
        }
        currentBlock = [line];
      } else if (currentBlock) {
        // Проверяем: не содержит ли строка приклеенный подвал выписки
        const stripped = this._stripFooterFromLine(line);
        if (stripped) {
          currentBlock.push(stripped);
          if (stripped !== line) {
            // Строка содержала начало подвала выписки — завершаем блок и останавливаем сбор
            blocks.push(currentBlock);
            currentBlock = null;
            break;
          }
        }
      }
    }

    if (currentBlock) {
      blocks.push(currentBlock);
    }

    // 3. Извлечение и нормализация данных каждой операции
    const transactions = [];
    for (const block of blocks) {
      try {
        const tx = this._processUniversalBlock(block, layout, bankInfo);
        if (tx && tx.date && tx.amount > 0) {
          transactions.push(tx);
        }
      } catch (err) {
        console.warn('[UniversalStatementParser] Ошибка разбора блока:', block, err);
      }
    }

    return transactions;
  }

  /**
   * Анализирует шапку таблицы операций: определяет начальный индекс и семантику колонок
   */
  static _detectTableLayout(rawLines) {
    let startIndex = 0;
    let endIndex = rawLines.length - 1;
    let headerFound = false;
    let headerKeywords = [];
    let hasSeparateDebitCredit = false;
    let debitColumnFirst = true;

    const candidateHeaderWords = [
      'дата операции', 'дата списания', 'дата проводки', 'дата документа', 'дата совершения',
      'дата отражения', 'дата платежа', 'дата транзакции', 'дата/время', 'дата и время',
      'описание операции', 'детали операции', 'назначение платежа', 'назначение',
      'место совершения', 'содержание операции', 'примечание', 'описание',
      'сумма операции', 'сумма в валюте', 'сумма платежа', 'сумма',
      'списание', 'зачисление', 'поступление', 'дебет', 'кредит', 'приход', 'расход',
      'остаток', 'валюта', 'категория'
    ];

    const maxScan = Math.min(rawLines.length, 120);
    for (let i = 0; i < maxScan; i++) {
      const line = rawLines[i].toLowerCase();
      const matches = candidateHeaderWords.filter(kw => line.includes(kw));

      if (matches.length >= 2 || line.includes('расшифровка операций') || (line.includes('дата операции') && line.includes('сумма'))) {
        headerFound = true;
        startIndex = i + 1;
        headerKeywords = matches;

        const hasDebit = line.includes('списание') || line.includes('дебет') || line.includes('расход');
        const hasCredit = line.includes('зачисление') || line.includes('поступление') || line.includes('кредит') || line.includes('приход');
        if (hasDebit && hasCredit) {
          hasSeparateDebitCredit = true;
          const debitPos = Math.min(
            line.indexOf('списание') !== -1 ? line.indexOf('списание') : Infinity,
            line.indexOf('дебет') !== -1 ? line.indexOf('дебет') : Infinity,
            line.indexOf('расход') !== -1 ? line.indexOf('расход') : Infinity
          );
          const creditPos = Math.min(
            line.indexOf('зачисление') !== -1 ? line.indexOf('зачисление') : Infinity,
            line.indexOf('поступление') !== -1 ? line.indexOf('поступление') : Infinity,
            line.indexOf('кредит') !== -1 ? line.indexOf('кредит') : Infinity,
            line.indexOf('приход') !== -1 ? line.indexOf('приход') : Infinity
          );
          debitColumnFirst = (debitPos < creditPos);
        }

        // Продвигаем startIndex через все последовательные строки шапки таблицы
        let scanIdx = i + 1;
        while (scanIdx < maxScan) {
          const scanL = rawLines[scanIdx].toLowerCase();
          // Если строка содержит финансовую операцию (дата + сумма), прекращаем пропуск
          if (/^\s*\d{2}[./-]\d{2}[./-]\d{2,4}\b/.test(scanL) && /[\d\s\xa0]+[.,]\d{2}/.test(scanL)) {
            break;
          }
          const scanMatches = candidateHeaderWords.filter(kw => scanL.includes(kw));
          if (scanMatches.length >= 1) {
            startIndex = scanIdx + 1;
            scanIdx++;
          } else {
            break;
          }
        }
        break;
      }
    }

    if (!headerFound) {
      for (let i = 0; i < maxScan; i++) {
        const line = rawLines[i];
        if (/\d{2}[./-]\d{2}[./-]\d{2,4}/.test(line) && /[\d\s\xa0]+[.,]\d{2}/.test(line)) {
          startIndex = i;
          break;
        }
      }
    }

    const hasCategoryColumn = headerKeywords.includes('категория') || rawLines.slice(0, Math.min(startIndex + 1, 100)).some(l => /\bкатегория\b/i.test(l));

    return {
      startIndex,
      endIndex,
      headerFound,
      headerKeywords,
      hasSeparateDebitCredit,
      debitColumnFirst,
      hasCategoryColumn
    };
  }

  /**
   * Проверяет, содержит ли строка валидную денежную сумму (с 2 знаками после запятой/точки),
   * исключая ложные совпадения с частями дат (например, "08.20" в "24.08.2026").
   */
  static _hasAnyAmount(line) {
    if (!line) return false;
    const amountRegex = /(?:^|[^\d])([+−–—\-\u2012\u2013\u2014\u2212]?\s*[\d\s\xa0]{1,10}[.,]\d{2})(?!\s*[./-]\d{2,4})(?:\s*(?:₽|руб\.?|rub|rur|usd|\$|eur|€))?/gi;
    let m;
    while ((m = amountRegex.exec(line)) !== null) {
      const rawMatch = m[1].trim();
      const index = m.index;
      const around = line.slice(Math.max(0, index - 2), index + rawMatch.length + 8);
      if (/\d{2}[./-]\d{2}[./-]\d{2,4}/.test(around)) {
        continue;
      }
      const val = cleanAmount(rawMatch);
      if (!isNaN(val) && val >= 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Проверяет, есть ли уже хотя бы в одной строке собираемого блока финансовая сумма
   */
  static _blockHasAmount(block) {
    if (!Array.isArray(block) || block.length === 0) return false;
    return block.some(l => this._hasAnyAmount(l));
  }

  /**
   * Проверяет, является ли строка началом новой транзакции
   */
  static _isCandidateTxStart(line, nextLine, layout, currentBlock = null, bankInfo = {}) {
    if (!line) return false;

    // Банк-адаптер: приоритетная проверка начала транзакции для специфических форматов
    if (bankInfo && typeof bankInfo.isTxStart === 'function') {
      try {
        const customRes = bankInfo.isTxStart(line, nextLine, currentBlock, layout);
        if (typeof customRes === 'boolean') {
          return customRes;
        }
      } catch (e) {
        console.warn('[UniversalStatementParser] Ошибка в bank.isTxStart:', bankInfo.name, e);
      }
    }

    const l = line.toLowerCase();

    // Отсекаем метаданные шапки документа
    if (
      l.includes('выписка за период') ||
      l.includes('период с ') ||
      l.includes('период:') ||
      l.includes('период :') ||
      l.includes('за период') ||
      l.includes('дата формирования') ||
      l.includes('дата выдачи') ||
      l.includes('договор от') ||
      l.includes('сформирован') ||
      l.includes('срок действия') ||
      l.includes('действительна до') ||
      l.includes('дата рождения')
    ) {
      return false;
    }

    // КРИТИЧЕСКИ ВАЖНО ДЛЯ ДВУХСТРОЧНЫХ ВЫПИСОК (СБЕРБАНК И ДР.):
    // Если уже собирается блок операции и в нем уже есть сумма:
    // Проверяем, не является ли текущая строка служебной строкой обработки (Дата обработки + Код авторизации + Описание)
    // или строкой продолжения описания без суммы.
    // В Сбербанке:
    // Строка 1: "25.07.2026 12:37 Отдых и развлечения 1,00 1 999,00" (есть сумма)
    // Строка 2: "25.07.2026 950372 KOMPANIYA AFISHA MOSCOW RUS..." (нет суммы, есть код авторизации)
    // Если ошибочно счесть Строку 2 началом новой транзакции, она отсечется и удалится как пустая,
    // а у операции останется только категория банка без наименования!
    if (currentBlock && currentBlock.length > 0 && this._blockHasAmount(currentBlock)) {
      const hasAmt = this._hasAnyAmount(line);
      const isAuthProcessingLine = /^\s*\d{2}[./-]\d{2}[./-](\d{4}|\d{2})\s+(?:\d{5,8}|[A-Za-z0-9_-]{5,10})\b/i.test(line);
      if (isAuthProcessingLine && !hasAmt) {
        return false;
      }
      if (!hasAmt) {
        return false;
      }
    }

    // 1. Строка начинается с даты (или с порядкового номера строки и даты)
    if (/^\s*(?:№?\s*\d{1,5}\s+)?\d{2}[./-]\d{2}[./-](\d{4}|\d{2})\b/.test(line)) {
      return true;
    }

    // 2. Строка начинается с даты в формате ISO YYYY-MM-DD
    if (/^\s*(?:№?\s*\d{1,5}\s+)?\d{4}-\d{2}-\d{2}\b/.test(line)) {
      return true;
    }

    // 3. Строка начинается с префикса операции и даты: "Оплата 01.05.2024", "Покупка 15.06.2024"
    if (/^(?:оплата(?:\s+товаров|\s+услуг)?|покупка|перевод|зачисление|списание|снятие|выдача|пополнение|платеж)\s+(?:\d{2}[./-]\d{2}[./-](\d{4}|\d{2})|\d{4}-\d{2}-\d{2})\b/i.test(line)) {
      return true;
    }

    // 4. Строка содержит валидную дату и финансовую сумму (с 2 десятичными знаками):
    const hasDate = /\b(?:\d{2}[./-]\d{2}[./-](\d{4}|\d{2})|\d{4}-\d{2}-\d{2})\b/.test(line);
    const hasAmount = this._hasAnyAmount(line);

    if (hasDate && hasAmount) {
      return true;
    }

    return false;
  }

  /**
   * Пропуск колонтитулов и повторов шапки таблицы на каждой странице
   */
  static _isPageHeaderOrPagination(line, layout) {
    if (!line) return false;
    const l = line.toLowerCase();

    if (/^\s*(?:страница|стр\.?|лист)\s*\d+(\s*из\s*\d+)?\s*$/i.test(line)) {
      return true;
    }

    if (l.includes('продолжение на') || l.includes('продолжение следующ') || l.includes('окончание таблицы') || l.includes('продолжение выписки')) {
      return true;
    }

    if (layout?.headerKeywords && layout.headerKeywords.length >= 2) {
      const matchCount = layout.headerKeywords.filter(kw => l.includes(kw)).length;
      if (matchCount >= 2 && !/\d{2}\.\d{2}\.\d{4}/.test(line)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Распознавание глобального конца таблицы (не прерывает парсинг при обычных колонтитулах)
   */
  static _isFinalTableFooter(line) {
    if (!line) return false;
    const l = line.toLowerCase();
    return /(?:конец\s+документа|окончание\s+выписки|документ\s+сформирован\s+автоматически|выписка\s+заверена\s+банком)/i.test(l);
  }

  /**
   * Преобразует блок строк в готовую транзакцию
   */
  static _processUniversalBlock(lines, layout, bankInfo) {
    if (!lines || lines.length === 0) return null;
    let cleanLines = lines.filter(l => !this._isTableEndOrFooter(l, bankInfo));
    cleanLines = cleanLines.map(l => this._stripFooterFromLine(l)).filter(l => l.trim().length > 0);
    if (cleanLines.length === 0) return null;

    // 1. Извлекаем дату
    const dateInfo = this._extractUniversalDate(cleanLines);
    if (!dateInfo) return null;

    // 2. Извлекаем сумму и направление
    const fullText = cleanLines.join(' ');
    const amountInfo = this._extractUniversalAmountAndType(cleanLines, fullText, layout);
    if (!amountInfo || !amountInfo.amount || amountInfo.amount <= 0) return null;

    // 3. Формируем чистое название контрагента / магазина / перевода
    const cleanRes = this._cleanUniversalMerchant(lines, fullText, amountInfo.amount, dateInfo.displayDate, amountInfo.type, layout, bankInfo);
    const rawMerchant = (typeof cleanRes === 'object' && cleanRes.merchant) ? cleanRes.merchant : cleanRes;
    const bankCategory = (typeof cleanRes === 'object') ? cleanRes.bankCategory : null;
    const merchant = cleanMerchantTitle(rawMerchant) || (amountInfo.type === 'Доход' ? 'Поступление средств' : 'Банковская операция');

    // 4. Проверяем на внутренний перевод / наличные / СБП
    const isTransfer = this._checkIfTransfer(fullText, merchant, bankInfo);

    // 5. Динамическая категоризация через базу Firebase с учетом категории банка
    const categorySearchText = bankCategory ? `${bankCategory} ${fullText}` : fullText;
    const category = (typeof StatementCategorizer !== 'undefined' && typeof StatementCategorizer.categorize === 'function')
      ? StatementCategorizer.categorize(merchant, categorySearchText, amountInfo.type)
      : (amountInfo.type === 'Доход' ? 'Другое' : 'Другое');
    const categoryIcon = getDynamicCategoryIcon(category);

    return {
      date: dateInfo.isoDate,
      displayDate: dateInfo.displayDate,
      type: amountInfo.type,
      amount: amountInfo.amount,
      merchant: merchant,
      category: category,
      bankCategory: bankCategory,
      categoryIcon: categoryIcon,
      isTransfer: isTransfer,
      bank: bankInfo.name || 'Банк',
      rawDetails: fullText
    };
  }

  /**
   * Извлекает календарную дату в форматах DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY или ISO YYYY-MM-DD
   */
  static _extractUniversalDate(lines) {
    const text = lines.join(' ');

    // 1. Формат DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
    const matches = text.matchAll(/\b(\d{2})[./-](\d{2})[./-](\d{4}|\d{2})\b/g);
    for (const match of matches) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      let year = match[3];
      if (year.length === 2) year = '20' + year;
      const yearNum = parseInt(year, 10);

      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && yearNum >= 2000 && yearNum <= 2099) {
        const dayStr = String(day).padStart(2, '0');
        const monthStr = String(month).padStart(2, '0');
        return {
          isoDate: `${yearNum}-${monthStr}-${dayStr}`,
          displayDate: `${dayStr}.${monthStr}.${yearNum}`
        };
      }
    }

    // 2. Формат ISO YYYY-MM-DD
    const isoMatches = text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g);
    for (const match of isoMatches) {
      const yearNum = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);

      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && yearNum >= 2000 && yearNum <= 2099) {
        const dayStr = String(day).padStart(2, '0');
        const monthStr = String(month).padStart(2, '0');
        return {
          isoDate: `${yearNum}-${monthStr}-${dayStr}`,
          displayDate: `${dayStr}.${monthStr}.${yearNum}`
        };
      }
    }

    return null;
  }

  /**
   * Извлекает финансовую сумму и определяет направление (Расход / Доход)
   */
  static _extractUniversalAmountAndType(lines, fullText, layout) {
    const text = lines.join(' ');
    const lText = text.toLowerCase();

    // Ищем кандидатов на сумму с 2 десятичными знаками, исключая совпадения с датами
    const amountRegex = /(?:^|[^\d])([+−–—\-\u2012\u2013\u2014\u2212]?\s*[\d\s\xa0]{1,10}[.,]\d{2})(?!\s*[./-]\d{2,4})(?:\s*(?:₽|руб\.?|rub|rur|usd|\$|eur|€))?/gi;

    const candidates = [];
    let m;
    while ((m = amountRegex.exec(text)) !== null) {
      const rawMatch = m[1].trim();
      const index = m.index;
      const around = text.slice(Math.max(0, index - 2), index + rawMatch.length + 8);
      if (/\d{2}[./-]\d{2}[./-]\d{2,4}/.test(around)) {
        continue;
      }

      const val = cleanAmount(rawMatch);
      if (!isNaN(val) && val > 0) {
        let hasPlus = rawMatch.includes('+') || /\+\s*[\d]/.test(rawMatch);
        let hasMinus = /[−–—\-\u2012\u2013\u2014\u2212]/.test(rawMatch);

        // Проверяем явные банковские кредитно-дебетовые маркеры рядом с суммой: 1250.00 DR / 500.00 CR
        const tail = text.slice(index + rawMatch.length, index + rawMatch.length + 8);
        if (/\bCR\b/i.test(tail)) hasPlus = true;
        if (/\bDR\b/i.test(tail)) hasMinus = true;

        const isRub = /₽|руб|rur|rub/i.test(around) || /₽|руб|rur|rub/i.test(tail);
        candidates.push({ raw: rawMatch, val, hasPlus, hasMinus, isRub });
      } else if (val === 0) {
        candidates.push({ raw: rawMatch, val: 0, hasPlus: false, hasMinus: false, isRub: false });
      }
    }

    if (candidates.length === 0) return null;

    // 1. Проверяем явные знаки + или - (CR / DR)
    const plusCandidate = candidates.find(c => c.hasPlus && c.val > 0);
    if (plusCandidate) {
      return { amount: plusCandidate.val, type: 'Доход' };
    }

    const minusCandidate = candidates.find(c => c.hasMinus && c.val > 0);
    if (minusCandidate) {
      return { amount: minusCandidate.val, type: 'Расход' };
    }

    // 2. Проверяем семантические маркеры в тексте
    const isIncomeKeyword = /\b(зачисление|поступление|пополнение|зарплата|аванс|кэшб[еэ]к|возврат|выплата|начисление процентов|перевод от|возмещение|доход|входящий перевод)\b/i.test(lText);
    const isExpenseKeyword = /\b(списание|оплата|покупка|перевод клиенту|перевод физлицу|снятие наличных|комиссия|выдача наличных|плата за|удержание|расход|исходящий перевод)\b/i.test(lText);

    // 3. Проверяем раздельные колонки Списание / Зачисление (Дебет / Кредит)
    if (candidates.length >= 2) {
      const nonZero = candidates.filter(c => c.val > 0);
      const hasZero = candidates.some(c => c.val === 0);
      if (nonZero.length === 1 && hasZero) {
        const target = nonZero[0];
        const zeroIdx = candidates.findIndex(c => c.val === 0);
        const targetIdx = candidates.findIndex(c => c.val === target.val);

        if (layout?.hasSeparateDebitCredit) {
          if (layout.debitColumnFirst) {
            const type = (targetIdx < zeroIdx) ? 'Расход' : 'Доход';
            return { amount: target.val, type };
          } else {
            const type = (targetIdx < zeroIdx) ? 'Доход' : 'Расход';
            return { amount: target.val, type };
          }
        }
      }
    }

    // 4. Определение по семантическим маркерам или по приоритету валюты счета (RUB)
    const nonZeroList = candidates.filter(c => c.val > 0);
    // Если в таблице есть колонка остатка («Остаток», «Остаток средств»),
    // то последнее число в строке — это остаток на счете, а сумма операции находится в первой колонке!
    let primaryCandidate;
    if (layout?.headerKeywords?.some(k => k.includes('остаток')) && nonZeroList.length >= 2) {
      primaryCandidate = nonZeroList[0];
    } else {
      const rubTarget = nonZeroList.find(c => c.isRub) || (nonZeroList.length > 0 ? nonZeroList[0] : null);
      primaryCandidate = rubTarget || candidates[0];
    }

    if (!primaryCandidate || primaryCandidate.val <= 0) return null;

    let type = 'Расход';
    if (isIncomeKeyword && !isExpenseKeyword) {
      type = 'Доход';
    } else if (isExpenseKeyword) {
      type = 'Расход';
    }

    return { amount: primaryCandidate.val, type };
  }

  /**
   * Интеллектуальный универсальный очиститель названия мерчанта:
   * 1. Поддержка международных стандартов банковского эквайринга (ISO 8583 Field 43).
   * 2. Распознавание структурных полей терминалов, POS, маркетплейсов и СБП (НСПК ЦБ РФ).
   * 3. Безопасный синтаксический конвейер (Left-Right Non-destructive Reducer) без потери данных.
   */
  static _cleanUniversalMerchant(lines, fullText, amount, dateStr, type, layout = {}, bankInfo = {}) {
    // 0. Банк-адаптер: приоритетная обработка специфических форматов банка (если задан кастомный фильтр)
    if (bankInfo && typeof bankInfo.customMerchantFilter === 'function') {
      try {
        const customRes = bankInfo.customMerchantFilter(lines, fullText, amount, dateStr, type, layout);
        if (customRes) {
          if (typeof customRes === 'string' && customRes.trim().length > 0) {
            return { merchant: customRes.trim(), bankCategory: null };
          } else if (typeof customRes === 'object' && customRes.merchant) {
            return {
              merchant: customRes.merchant,
              bankCategory: customRes.bankCategory || null
            };
          }
        }
      } catch (err) {
        console.warn('[UniversalStatementParser] Ошибка в bank.customMerchantFilter:', bankInfo.name, err);
      }
    }

    const raw = lines.join(' ');

    // -------------------------------------------------------------
    // ЭТАП 1: Выделение структурных протоколов эквайринга и операций
    // -------------------------------------------------------------

    // 1.1. ISO 8583 Field 43 / Card Acceptor Terminal Path (Альфа-Банк, ВТБ, Сбербанк, Газпромбанк и др.)
    // Примеры:
    // "11510366\RU\Gorod Moskva\AV AZBUKAVKUSA MCC5411"
    // "место совершения операции: 50148954/RU/MOSKVA G\Apteka 36 6 MCC5912"
    // "193571 /RU/CARD2CARD AMOBILE>MOSKVA MCC6538"
    // "48123456/RUS/SANKT-PETERBURG/IP SEMENOVA A.A."
    const isoTerminalMatch = raw.match(/(?:место\s+совершения(?:\s+операции)?:?\s*)?(?:[a-zA-Z0-9_-]{4,16}\s*[/\\]\s*(?:RU|RUS|[A-Za-z]{2,3})\s*[/\\]\s*[^/\\]+?[/\\]\s*)([^/\\]+?)(?:\s+MCC:?\s*\d{4}|\s*$)/i) ||
                             raw.match(/(?:[a-zA-Z0-9_-]{4,16}\s*[/\\]\s*(?:RU|RUS|[A-Za-z]{2,3})\s*[/\\]\s*)([^/\\]+?)(?:\s+MCC:?\s*\d{4}|\s*$)/i);
    if (isoTerminalMatch && isoTerminalMatch[1]) {
      let tName = isoTerminalMatch[1].trim();
      const cityArrow = tName.split('>');
      if (cityArrow.length > 1) {
        tName = cityArrow[0].trim();
      }
      tName = tName.replace(/^[\\/\s>]+|[\\/\s>]+$/g, '').trim();
      tName = tName.replace(/\b(MCC:?\s*\d{4}|город:?|ru|rus)\b.*$/gi, '').trim();

      if (/card2card|c2c/i.test(tName)) {
        return 'Перевод с карты на карту';
      }
      if (/sbp/i.test(tName)) {
        return type === 'Доход' ? 'Входящий перевод СБП' : 'Перевод через СБП';
      }

      tName = tName.replace(/^([A-Za-zА-Яа-яЁё\s&«»"'-]{4,})\s+\d{3,6}$/, '$1').trim();

      if (tName.length >= 2) {
        return toCleanTitleCase(tName);
      }
    }

    // 1.2. Стандартный эквайринг Retail / POS / E-Commerce (Alfa-Bank, Raiffeisen, VTB)
    // Пример: "Retail RUS MOSCOW RESTORAN NESSELBEK"
    // Пример: "POS RUS MOSKVA OOO VKUSVILL"
    const retailAcqMatch = raw.match(/\b(?:Retail|POS|E-COMMERCE|Unique|ATM)\s+(?:RUS|RU|[A-Z]{2,3})\s+(?:[A-Za-zА-Яа-яЁё0-9\s.-]+?\s+)?([A-Za-zА-Яа-яЁё0-9\s&№"'«»._-]{3,50}?)(?:\s+MCC:?\s*\d{4}|\s+дата\b|\s+карта\b|\s+\d{2}[./-]\d{2}|$)/i);
    if (retailAcqMatch && retailAcqMatch[1]) {
      let rName = retailAcqMatch[1].trim();
      rName = stripCardTokens(rName);
      rName = rName.replace(/^([A-Za-zА-Яа-яЁё\s&«»"'-]{4,})\s+\d{3,6}$/, '$1').trim();
      if (rName.length >= 3 && !/^(руб|рублей|валюте|карте|счете)$/i.test(rName)) {
        return toCleanTitleCase(rName);
      }
    }

    // 1.3. Именованные поля терминалов "Устройство: ..." и веб-ссылки (Газпромбанк и др.)
    // Пример: "Устройство: T2. Город: MOSCOW. Сумма операции: 665.00"
    // Пример: "Устройство: PEREK MEZHDUNARODNYJ. Город: SANKT-PETERBU"
    // Пример: "Устройство: https://lk.ugmk-telecom.ru... Город: Верхняя Пышма"
    // Пример: "Устройство: SBP https://lk.vezaruspro. Город: MOSKVA"
    const devExtracted = extractDeviceField(raw);
    if (devExtracted) {
      let dev = devExtracted.trim();
      if (/sbp\s+c2c\s+spisanie/i.test(dev)) {
        return 'Перевод через СБП';
      } else if (/sbp\s+c2c\s+zachislenie/i.test(dev)) {
        return 'Входящий перевод СБП';
      } else if (/sbp\s+pl\s+qr/i.test(dev) || /sbp\s+dnt/i.test(dev)) {
        return 'Оплата через СБП QR';
      } else if (/konvertatsiya\s+ballov/i.test(dev)) {
        return 'Конвертация баллов';
      } else if (dev.length >= 2) {
        dev = dev.replace(/^KO_/i, '');
        // Если устройство содержит интернет-ссылку (URL) — гарантированно сохраняем полный URL
        const link = extractWebsiteLink(dev);
        if (link) {
          if (/sbp/i.test(dev)) {
            return `SBP ${link}`;
          }
          return link;
        }
        dev = stripCardTokens(dev);
        dev = dev.replace(/^([A-Za-zА-Яа-яЁё\s&«»"'-]{4,})\s+\d{3,6}$/, '$1').trim();
        return toCleanTitleCase(dev);
      }
    } else {
      // Резервная проверка: есть ли веб-ссылка непосредственно в описании операции
      const fallbackUrl = extractWebsiteLink(raw);
      if (fallbackUrl && (raw.toLowerCase().includes('оплата') || raw.toLowerCase().includes('pos') || raw.toLowerCase().includes('retail'))) {
        return fallbackUrl;
      }
    }

    // 1.4. Формат POS-терминалов: "... сумма ... в [НАЗВАНИЕ ТОЧКИ] [ГОРОД] [RU] дата ..."
    // Пример: "сумма 2152.00 в APTEKA ZDOROV.RU SANKT- PETERBU RU дата 2026-09-15"
    const ozonPosMatch = raw.match(/(?:сумма\s*[\d\s.,]+\s*в|\bв)\s+([A-Za-zА-Яа-яЁё0-9_\-.\s]{3,50}?)(?:\s+(?:sankt-?\s*peterbu|moskva|moscow|ru|rus|россия)\b|\s+дата\s*\d{4}|$)/i);
    if (ozonPosMatch && ozonPosMatch[1]) {
      let posName = ozonPosMatch[1].replace(/^[«"'\s]+|[»"'\s]+$/g, '').trim();
      posName = stripCardTokens(posName);
      posName = posName.replace(/\b(sankt-?\s*peterbu|moskva|moscow|ru|rus)\b.*$/gi, '').trim();
      if (posName.length >= 3 && !/^(руб|рублей|валюте|карте|счете)$/i.test(posName)) {
        return toCleanTitleCase(posName);
      }
    }

    // 1.5. Покупки на маркетплейсах с номером заказа
    if (/платформе\s+ozon|оплата.*ozon/i.test(raw)) {
      const order = raw.match(/заказ\s*(?:№|номер)?\s*([0-9a-zA-Z-]+)/i);
      return order ? `Ozon (заказ № ${order[1]})` : 'Ozon';
    }
    if (/wildberries|вайлдберриз/i.test(raw)) {
      const order = raw.match(/заказ\s*(?:№|номер)?\s*([0-9a-zA-Z-]+)/i);
      return order ? `Wildberries (заказ № ${order[1]})` : 'Wildberries';
    }
    if (/яндекс\s+маркет|yandex\s*market/i.test(raw)) {
      const order = raw.match(/заказ\s*(?:№|номер)?\s*([0-9a-zA-Z-]+)/i);
      return order ? `Яндекс Маркет (заказ № ${order[1]})` : 'Яндекс Маркет';
    }

    // 1.6. СБП-переводы (восстановление разорванных ФИО и банка по стандарту НСПК)
    const l = raw.toLowerCase();
    if (l.includes('сбп') || l.includes('быстрых платежей') || l.includes('sbp')) {
      // Ищем ФИО контрагента
      const sbpPerson = raw.match(/(?:получатель|отправитель|клиент|плательщик|в пользу|от|кому):\s*([А-ЯЁ][а-яёA-Za-z\s.-]{2,35})/i) ||
                        raw.match(/(?:исходящий перевод сбп,?\s*|входящий перевод сбп,?\s*)([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ]\.?)?)/i) ||
                        raw.match(/(?:исходящий перевод сбп,?\s*|входящий перевод сбп,?\s*)([А-ЯЁ][а-яё]+)/i);

      // Ищем наименование банка-получателя/отправителя
      const sbpBank = raw.match(/(?:в\s+банк|банк|из\s+банка|через\s+банк|через|из|в)?\s*([«"]?[А-Яа-яA-Za-z-]+(?:\s*банк)?[»"]?)\s*(?:,|$|\.)/i);

      let personName = '';
      if (sbpPerson && sbpPerson[1]) {
        personName = sbpPerson[1].replace(/^(от|кому|получатель|отправитель|клиент|плательщик):\s*/i, '').replace(/без ндс.*$/i, '').trim();
      }

      let bankName = '';
      if (sbpBank && sbpBank[1]) {
        const candidateBank = sbpBank[1].replace(/[«"]/g, '').trim();
        if (/банк|сбер|тинькофф|т-банк|втб|газпром|альфа|озон|яндекс|райффайзен/i.test(candidateBank) && !/быстрых|платежей|сбп/i.test(candidateBank)) {
          bankName = candidateBank;
        }
      }

      if (personName && personName.length >= 3) {
        return bankName 
          ? `${type === 'Доход' ? 'Входящий перевод СБП' : 'Перевод СБП'}: ${personName} (${bankName})`
          : `${type === 'Доход' ? 'Входящий перевод СБП' : 'Перевод СБП'}: ${personName}`;
      } else if (bankName) {
        return `${type === 'Доход' ? 'Входящий перевод СБП' : 'Перевод СБП'} (${bankName})`;
      }

      if (/sbp\s+pl\s+qr|qr|оплата.*сбп/i.test(raw)) {
        return 'Оплата через СБП QR';
      }

      return type === 'Доход' ? 'Входящий перевод СБП' : 'Перевод через СБП';
    }

    // 1.7. Переводы между своими счетами
    if (/между\s+счетами\s+одного(?:\s+клиента)?|между\s+своими\s+счетами/i.test(raw)) {
      return 'Перевод между своими счетами';
    }

    // 1.8. Внутрибанковские переводы
    if (/внутрибанковский\s+перевод/i.test(raw)) {
      const person = raw.match(/(?:на|от)\s+(?:\+?\d[\d\s-]{8,15},\s*)?([А-ЯЁа-яё]+\s+[А-ЯЁ]\.?)/i) ||
                     raw.match(/([А-ЯЁа-яё]+\s+[А-ЯЁ]\.?)(?=\s+в\s+\d{2}:\d{2})/i);
      if (person && person[1]) {
        const cleanP = person[1].trim();
        return `Внутрибанковский перевод: ${cleanP}`;
      }
      return 'Внутрибанковский перевод';
    }

    // 1.8.1. Переводы конкретным лицам и сервисам (Сбер, Т-Банк, СБП и др.)
    const transferForMatch = raw.match(/перевод\s+(?:для|кому|клиенту(?:\s+сбера)?|физлицу)\s+([А-ЯЁа-яёA-Za-z\s.-]+?)(?=(?:\s*\.?\s*операция|\s*\.?\s*по\s+карте|\s*\.?\s*по\s+счету|\s*$))/i);
    if (transferForMatch && transferForMatch[1]) {
      let personName = transferForMatch[1].replace(/\b\.?\s*операция.*$/i, '').trim();
      personName = stripCardTokens(personName);
      if (personName.length >= 2) {
        return {
          merchant: `Перевод: ${toCleanTitleCase(personName)}`,
          bankCategory: 'Перевод'
        };
      }
    }

    const transferFromMatch = raw.match(/перевод\s+(?:из|от)\s+([А-ЯЁа-яёA-Za-z\s.-]+?)(?=(?:\s*\.?\s*операция|\s*\.?\s*по\s+карте|\s*\.?\s*по\s+счету|\s*$))/i);
    if (transferFromMatch && transferFromMatch[1]) {
      let sourceName = transferFromMatch[1].replace(/\b\.?\s*операция.*$/i, '').trim();
      sourceName = stripCardTokens(sourceName);
      if (sourceName.length >= 2) {
        return {
          merchant: type === 'Доход' ? `Входящий перевод: ${toCleanTitleCase(sourceName)}` : `Перевод: ${toCleanTitleCase(sourceName)}`,
          bankCategory: 'Перевод'
        };
      }
    }

    // 1.9. B2B безналичные платежи с организациями (ООО, АО, ПАО, ИП)
    const legalEntity = raw.match(/(?:^|[^\wа-яёА-ЯЁ])((?:ООО|АО|ПАО|ЗАО|ИП|ФГУП|МУП)\s+["«]?[A-Za-zА-Яа-яЁё0-9_\-\s.&]+?["»]?(?=\s+(?:ИНН|КПП|БИК|ОГРН|р\/с|л\/с|\d{10,12}|на сумму|сумма|$)))/i);
    if (legalEntity && legalEntity[1]) {
      const le = legalEntity[1].trim();
      if (le.length >= 4) {
        const purpose = raw.match(/^(?:оплата\s+по\s+договору[^\d.,\n]+|оплата\s+по\s+счету[^\d.,\n]+)/i);
        if (purpose && purpose[0].length < 35) {
          return `${toCleanTitleCase(purpose[0].trim())}: ${toCleanTitleCase(le)}`;
        }
        return toCleanTitleCase(le);
      }
    }

    // 1.10. Наличные, Зарплата, Кэшбек, Комиссии банка
    if (/снятие\s+наличных|выдача\s+наличных|снятие\s+в\s+банкомате|банкомат.*выдача/i.test(raw)) {
      return 'Снятие наличных';
    }
    if (/внесение\s+наличных|пополнение\s+наличными|взнос\s+наличными|банкомат.*пополнение/i.test(raw)) {
      return 'Внесение наличных';
    }
    if (/заработная\s+плата|зарплата|выплата\s+аванса|зачисление\s+зп/i.test(raw)) {
      return 'Зарплата';
    }
    if (/выплата\s+к[еэ]шб[еэ]ка|к[еэ]шб[еэ]к|компенсация\s+покупок.*баллами/i.test(raw)) {
      const prog = raw.match(/программе\s+лояльности/i);
      return prog ? 'Кэшбек (Программа лояльности)' : 'Кэшбек';
    }
    if (/комиссия\s+за\s+обслуживание|плата\s+за\s+обслуживание|плата\s+за\s+пакет|комиссия\s+банка/i.test(raw)) {
      return 'Комиссия банка';
    }
    if (/проценты\s+по\s+вкладу|начисление\s+процентов|капитализация\s+процентов/i.test(raw)) {
      return 'Начисление процентов';
    }

    // -------------------------------------------------------------
    // ЭТАП 2: Синтаксическая очистка и устранение разрыва колонок (Non-destructive Reducer)
    // -------------------------------------------------------------
    let detectedBankCategory = null;
    let lineText = lines.join(' ');

    // Двухстрочные / многострочные выписки банков (Сбербанк дебетовые карты, выписки со счетов и др.):
    // В таких выписках первая строка содержит категорию банка («Отдых и развлечения», «Супермаркеты» и т.д.),
    // а вторая строка — реальное описание транзакции («KOMPANIYA AFISHA MOSCOW RUS...», «Перевод для...»).
    if (lines.length >= 2) {
      let line1Clean = lines[0]
        .replace(/\b\d{2}[./-]\d{2}[./-]\d{2,4}\b/g, ' ')
        .replace(/\b(?:в\s+)?\d{2}:\d{2}(?::\d{2})?\b/g, ' ')
        .replace(/([+−–—\-\u2012\u2013\u2014\u2212]?\s*[\d\s\xa0]{1,10}[.,]\d{2})\s*(?:₽|руб\.?|rub|rur|usd|\$|eur|€)?/gi, ' ')
        .trim();

      const cat1 = splitBankCategoryAndMerchant(line1Clean);
      if (cat1 && cat1.bankCategory) {
        detectedBankCategory = cat1.bankCategory;
        // Если первая строка была исключительно категорией банка (без названия магазина):
        if (!cat1.merchant || cat1.merchant.length < 2) {
          lineText = lines.slice(1).join(' ');
        }
      }
    }

    // 1. Безопасно снимаем служебные колонтитулы (без жадного .*$)
    lineText = cleanMerchantTitle(lineText);

    // 2. Снимаем префиксы типов операций в начале строки
    lineText = lineText
      .replace(/^(?:оплата\s+(?:товаров\s+и\s+услуг|товаров\/услуг|товаров|услуг|по\s+карте)?|безналичная\s+оплата|покупка|списание\s+по\s+карте|операция\s+по\s+карте|списание|зачисление|платеж\s+по\s+карте|операция:?)\s*/i, '')
      .replace(/^(?:покупка\s+\(внешняя\s+сеть\s+рф\)|покупка\s+\(терминал\s+банка\)|покупка\s+\(филиал\s+гпб\)|возврат\s+\(терминал\s+банка\))\s*\.?\s*/i, '');

    // 3. Удаляем ВСЕ маски карт, фразы "по карте" и хвосты с помощью stripCardTokens
    lineText = stripCardTokens(lineText);

    // 4. Удаляем даты (DD.MM.YYYY, YYYY-MM-DD, DD/MM/YYYY, DD.MM)
    lineText = lineText
      .replace(/\b\d{2}[./-]\d{2}[./-]\d{2,4}\b/g, ' ')
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
      .replace(/\b\d{2}[./-]\d{2}\b/g, ' ');

    // 5. Удаляем времена (в HH:MM:SS, HH:MM) с поддержкой кириллического предлога "в" и таймзоны
    lineText = lineText
      .replace(/(?:^|[^\wа-яёА-ЯЁ])(?:в\s+)?\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:мск|utc|gmt))?(?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
      .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ');

    // 6. Удаляем финансовые суммы с знаками валют или без
    lineText = lineText
      .replace(/([+−–—\-\u2012\u2013\u2014\u2212]?\s*[\d\s\xa0]{1,10}[.,]\d{2})\s*(?:₽|руб\.?|rub|rur|usd|\$|eur|€)?/gi, ' ');

    // 7. Удаляем технические валютные и банковские термины с безопасными границами для кириллицы
    lineText = lineText
      .replace(/(?:^|[^\wа-яёА-ЯЁ])(?:валюта\s+операции:?|валюта\s+счета:?|российские\s+рубли|российский\s+рубль|рубли\s+рф|rur|rub|usd|eur)(?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
      .replace(/(?:^|[^\wа-яёА-ЯЁ])(?:операции\s+обработки|операции\s+договора|договора\s+мск|дата\s+проводки|дата\s+операции|сумма\s+в\s+валюте|сумма\s+операции)(?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
      .replace(/(?:^|[^\wа-яёА-ЯЁ])(?:выписка\s+по\s+карте|выписка\s+по\s+счету|детали\s+операции|место\s+совершения(?:\s+операции)?)(?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
      .replace(/(?:^|[^\wа-яёА-ЯЁ])(?:без\s+ндс|без\s+налога|в\s+т\.ч\.\s*ндс|мск|utc|gmt)(?=[^\wа-яёА-ЯЁ]|$)/gi, ' ');

    // 7.1. Удаляем приклеенные артефакты шапки/подвала колонок выписки (операции, обработки, договора, мск)
    lineText = lineText
      .replace(/(?:^|[^\wа-яёА-ЯЁ])(?:операции|обработки|договора)(?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
      .replace(/(?:^|[^\wа-яёА-ЯЁ])(?:мск)(?=[^\wа-яёА-ЯЁ]|$)/gi, ' ');

    // 7.2. Удаляем оставшийся изолированный предлог времени "в" или "v"
    lineText = lineText.replace(/(?:^|\s+)[вv](?=\s*[.,:;]|\s*$)/gi, ' ');

    // 8. Удаляем эквайринговые и авторизационные коды
    lineText = lineText
      .replace(/\b(mcc:?\s*\d{4}|rrn:?\s*\w+|код\s+авторизации:?\s*\w+|авторизация:?\s*\w+|станция:?\s*\w+)\b/gi, ' ')
      .replace(/\b(терминал\s+банка|внешняя\s+сеть\s+рф|филиал\s+гпб|pos|retail|e-commerce|unique)\b/gi, ' ')
      .replace(/\b(комиссия:?\s*[\d\s.,]+|остаток:?\s*[\d\s.,]+|успешно|исполнено|проведено)\b/gi, ' ');

    // 8.1. Снимаем изолированные коды авторизации (5-8 цифр в начале или после даты)
    lineText = lineText.replace(/^[.,\s]*\b\d{5,8}\b\s*/, '').trim();

    // 8.2. Интеллектуальное разделение категории банка и названия мерчанта
    let bankCategory = null;
    const catSplit = splitBankCategoryAndMerchant(lineText);
    if (catSplit && catSplit.bankCategory) {
      bankCategory = catSplit.bankCategory;
      lineText = catSplit.merchant;
    }

    // 9. Удаляем географические суффиксы на границах слов (не ломая слова вроде "Городской")
    lineText = lineText
      .replace(/\b(?:г\.\s*[а-яёa-z-]+|город:?\s*(?:москва|санкт-петербург|казань|самара|сочи|екатеринбург|краснодар|уфа|пермь))\b/gi, ' ')
      .replace(/\b(?:moskva|moscow|sankt-?peterbu(?:rg)?|spb|ekaterinburg|kazan|novosibirsk|samara|rostov|krasnodar|sochi|voronezh|ufa|perm)\b/gi, ' ')
      .replace(/\b(?:ru|rus|russia|россия|russian\s+federation)\b/gi, ' ');

    // 10. Удаляем номер терминала/магазина в самом конце строки (например, "Pyaterochka 4512" -> "Pyaterochka")
    lineText = lineText.replace(/^([A-Za-zА-Яа-яЁё\s&«»"'-]{4,})\s+\d{3,6}$/, '$1').trim();

    // 11. Очищаем мусорные спецсимволы, изолированные точки между словами и сжимаем пробелы
    lineText = lineText
      .replace(/(?<=\s)[.,:;\-_/\\]+(?=\s)/g, ' ')
      .replace(/[^\wа-яёА-ЯЁ\s&№"'«»().-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Снимаем обрамляющие знаки пунктуации
    lineText = lineText.replace(/^[.,:;\-_/\\«"'#*&()]|[.,:;\-_/\\»"'#*&()]$/g, '').trim();

    // Финальная очистка изолированного предлога "в" на конце строки
    lineText = lineText.replace(/(?:^|\s+)[вv]$/i, '').trim();

    // -------------------------------------------------------------
    // ЭТАП 3: Нормализация регистра (Title Case)
    // -------------------------------------------------------------
    let finalMerchant = (type === 'Доход' ? 'Поступление средств' : 'Банковская операция');
    if (lineText.length >= 2 && !/^\d+$/.test(lineText)) {
      finalMerchant = toCleanTitleCase(lineText);
    }

    return {
      merchant: finalMerchant,
      bankCategory: detectedBankCategory || bankCategory || null
    };
  }

  // ===========================================================
  // ИСХОДНЫЙ СПЕЦИФИЧЕСКИЙ МЕТОД (СОХРАНЕН ДЛЯ БЫСТРОГО ПЕРЕКЛЮЧЕНИЯ)
  // ===========================================================
  static parse(rawLines, config) {
    const rawBlocks = [];
    let currentBlock = null;

    for (let i = 0; i < rawLines.length; i++) {
      let line = rawLines[i].trim();
      if (!line) continue;

      // Если встретили признак завершения таблицы или подвала документа — закрываем текущий блок транзакции
      if (this._isTableEndOrFooter(line, config)) {
        if (currentBlock) {
          rawBlocks.push(currentBlock);
          currentBlock = null;
        }
        continue;
      }

      if (this._isServiceLine(line, config)) continue;

      const nextLine = (i + 1 < rawLines.length) ? rawLines[i + 1] : '';
      if (config.isTxStart(line, nextLine, currentBlock)) {
        if (currentBlock) rawBlocks.push(currentBlock);
        currentBlock = [line];
      } else if (currentBlock) {
        // Проверяем: не содержит ли строка приклеенный подвал выписки
        const stripped = this._stripFooterFromLine(line);
        if (stripped) {
          currentBlock.push(stripped);
          if (stripped !== line) {
            // Строка содержала начало подвала выписки — закрываем текущую транзакцию
            rawBlocks.push(currentBlock);
            currentBlock = null;
          }
        }
      }
    }
    if (currentBlock) rawBlocks.push(currentBlock);

    return rawBlocks.map(block => this._processBlock(block, config)).filter(Boolean);
  }

  static _processBlock(lines, config) {
    // 1. Отсекаем строки подвала выписки, если они случайно попали в блок
    let cleanLines = lines.filter(l => !this._isTableEndOrFooter(l, config));
    // 2. Отсекаем любые приклеенные фрагменты подвалов в строках
    cleanLines = cleanLines.map(l => this._stripFooterFromLine(l)).filter(l => l.trim().length > 0);
    if (cleanLines.length === 0) return null;

    // Извлекаем поля через правила конкретного банка
    const data = config.extract(cleanLines);
    if (!data || !data.date || !data.amount) return null;

    const fullText = cleanLines.join(' ');
    const rawMerchant = data.merchant || 'Банковская операция';
    const merchant = cleanMerchantTitle(rawMerchant) || 'Банковская операция';

    // Универсальная проверка на перевод / наличные
    const isTransfer = this._checkIfTransfer(fullText, merchant, config);

    // Нормализация даты в YYYY-MM-DD
    let isoDate = data.date;
    if (data.date.includes('.')) {
      const [d, m, y] = data.date.split('.');
      isoDate = `${y.length === 2 ? '20' + y : y}-${m}-${d}`;
    }

    // Динамическая категоризация через базу Firebase
    const categorySearch = `${data.bankCategory ? data.bankCategory + ' ' : ''}${data.hint ? data.hint + ' ' : ''}${fullText}`;
    const category = (typeof StatementCategorizer !== 'undefined' && typeof StatementCategorizer.categorize === 'function')
      ? StatementCategorizer.categorize(merchant, categorySearch, data.type)
      : 'Другое';
    const categoryIcon = getDynamicCategoryIcon(category);

    return {
      date: isoDate,
      displayDate: data.date,
      type: data.type,
      amount: data.amount,
      merchant: merchant,
      category: category,
      bankCategory: data.bankCategory || null,
      categoryIcon: categoryIcon,
      isTransfer: isTransfer,
      bank: config.name,
      rawDetails: fullText
    };
  }

  static _checkIfTransfer(fullText, merchant, config) {
    const text = `${fullText} ${merchant}`.toLowerCase();
    const hasUniversal = Array.isArray(UNIVERSAL_TRANSFER_KEYWORDS) && UNIVERSAL_TRANSFER_KEYWORDS.some(kw => text.includes(kw));
    const hasCustom = (config && typeof config.customTransferCheck === 'function') ? config.customTransferCheck(text) : false;
    return hasUniversal || hasCustom;
  }

  /**
   * Безопасно отсекает текст подвала выписки, если он приклеился к строке транзакции
   */
  static _stripFooterFromLine(line) {
    if (!line) return '';
    // Ищем маркеры начала подвала (служебные отметки формирования, должности, подписи, остатки)
    const footerMatch = line.match(/(?:(?<!\p{L})(?:должность|подпись|расшифровка\s+подписи|дата\s+формирования(?:\s+выписки)?|выписка\s+сформирована|исходящий\s+остаток|итого\s+оборотов)(?!\p{L}))/iu);
    if (footerMatch && footerMatch.index > 0) {
      return line.slice(0, footerMatch.index).trim();
    }
    return line;
  }

  /**
   * Универсальное семантическое распознавание подвалов выписок, должностей сотрудников,
   * подписей, печатей и итоговых сводок без жесткого хардкода
   */
  static _isTableEndOrFooter(line, config) {
    if (!line) return false;
    const l = line.toLowerCase().trim();
    if (!l) return false;

    // 1. Итоговые строки таблицы и остатки (не срабатываем на слово «остаток» в шапке колонок таблицы)
    if (/(?:исходящий\s+остаток|остаток\s+на\s+конец|обороты\s+за\s+период|итого\s+(?:списаний|зачислений|оборотов|операций)|всего\s+(?:списано|зачислено|поступлений|операций)|исходящее\s+сальдо)/iu.test(l)) {
      return true;
    }

    // 2. Служебные метаданные генерации документа / выписки
    if (/(?:дата|время)\s+(?:формирования|составления|выгрузки|выдачи|печати)(?:\s+выписки)?/iu.test(l) ||
        /(?:выписка|справка|отчет)\s+(?:сформирован[ао]|составлен[ао]|заверен[ао])/iu.test(l) ||
        /(?:сформировано|составлено)\s+(?:автоматически|в\s+системе|банком)/iu.test(l) ||
        /(?:не\s+требует\s+(?:подписи|печати))/iu.test(l)) {
      return true;
    }

    // 3. Официальные должности руководства и сотрудников банка, реквизиты подписания:
    if (/(?<!\p{L})(?:должность|подпись|расшифровка\s+подписи)(?!\p{L})/iu.test(l) ||
        /(?<!\p{L})(?:вице[- ]президент|президент\s+банка|председатель\s+правления)(?!\p{L})/iu.test(l) ||
        /(?<!\p{L})(?:начальник|директор|руководитель|заместитель|управляющий|главный\s+бухгалтер|бухгалтер|ответственный\s+исполнитель|исполнитель|специалист|операционист|кассир|контролер)(?!\p{L})/iu.test(l) ||
        /(?:с\s+уважением|искренне\s+ваш)/iu.test(l)) {
      return true;
    }

    // 4. ЭЦП, факсимиле, штампы, сертификаты и заверение документов
    if (/(?:документ\s+подписан|электронн(?:ой|ая)\s+подпис(?:ью|ь)|кэп|пэп|укэп|сертификат\s+ключа|оттиск\s+печати|м\.п\.|подпись\s+уполномоченного|подпись\s+сотрудника|выписка\s+заверена|печать\s+банка|штамп\s+банка)/iu.test(l)) {
      return true;
    }

    // 5. Юридические реквизиты, лицензии ЦБ РФ
    if (/(?:генеральная\s+лицензия|лицензия\s+банка\s+россии|лицензия\s+цб\s+рф)/iu.test(l)) {
      return true;
    }

    return false;
  }

  static _isServiceLine(line, config) {
    const l = line.toLowerCase();
    const isCommon = Array.isArray(COMMON_SERVICE_LINES) && COMMON_SERVICE_LINES.some(kw => l.includes(kw));
    const isCustom = (config && typeof config.isServiceLine === 'function') ? config.isServiceLine(l) : false;
    return isCommon || isCustom;
  }
}

/// =============================================================
// 2. РЕЕСТР БАНКОВ (КАЖДЫЙ БАНК — АДАПТЕР К УНИВЕРСАЛЬНОМУ ЯДРУ)
// =============================================================

const BANK_REGISTRY = [
  // --- ЯНДЕКС БАНК ---
  {
    id: 'YANDEX',
    name: 'Яндекс Банк',
    slug: 'yandexbank',
    iconKey: 'yandex',
    badgeColor: 'bg-amber-900/60 text-amber-300 border-amber-700/60',
    guide: {
      doc: 'Выписка по договору Сейва или карты (PDF)',
      steps: [
        'Откройте приложение «Яндекс Пэй»',
        'Нажмите на Сейв или карту Яндекс Банка',
        'Перейдите в раздел «Справки» внизу страницы',
        'Выберите «Выписка по договору» и задайте период дат',
        'Скачайте сформированный PDF-документ'
      ]
    },
    getScore: (p) => {
      let score = 0;
      if (/лицензи[яи][^\d]*3027\b/i.test(p) || p.includes('3027')) score += 10;
      if (p.includes('яндекс банк') || p.includes('кб яндекс') || p.includes('yandex bank') || p.includes('ао яндекс')) score += 8;
      if (p.includes('yabank.yandex.ru') || p.includes('yandex.ru/bank') || p.includes('yandex pay') || p.includes('яндекс пэй')) score += 5;
      if (p.includes('договору сейва') || p.includes('сейв') || p.includes('справка об остатке')) score += 4;
      return score;
    },
    detect: function(p) { return this.getScore(p) >= 5; },
    isTxStart: (l) => /^(?:оплата(?:\s+товаров(?:\s+и\s+услуг|\/услуг)?|\s+услуг)?|покупка|перевод|снятие|пополнение|зачисление|возврат|списание|выплата)(?:\s+|$|[.,:;])/iu.test(l.trim()) || /^\s*\d{2}\.\d{2}\.\d{4}\s+(?:оплата|покупка|перевод|пополнение|зачисление|возврат|списание)/iu.test(l.trim()),
    isServiceLine: (l) => {
      const lower = l.toLowerCase();
      return (lower.includes('операции') && lower.includes('мск')) ||
             (lower.includes('обработки') && lower.includes('договора')) ||
             lower.includes('исходящий остаток') ||
             lower.includes('итого списаний') ||
             lower.includes('итого зачислений') ||
             lower.includes('с уважением') ||
             lower.includes('начальник отдела') ||
             lower.includes('самохвалова') ||
             lower.includes('садовническая') ||
             lower.includes('yabank.yandex.ru');
    },
    customMerchantFilter: (lines, fullText, amount, dateStr, type) => {
      const full = lines.join(' ');
      if (/перевод.*сбп/i.test(full)) {
        const s = full.match(/(?:Отправитель|Получатель):\s*([^.]*?)(?:Без НДС|$)/i);
        return {
          merchant: s ? `Перевод СБП (${s[1].trim()})` : (type === 'Доход' ? 'Входящий перевод СБП' : 'Перевод через СБП'),
          bankCategory: 'Перевод'
        };
      }
      let merchant = full
        .replace(/^Оплата(?:\s+товаров(?:\s+и\s+услуг|\/услуг)?|\s+услуг)?\s*/iu, '')
        .replace(/^(?:покупка|перевод|снятие|пополнение|зачисление|возврат|списание|выплата)\s*/iu, '')
        .replace(/\b\d{2}\.\d{2}\.\d{4}\b/g, ' ')
        .replace(/\*\d{4}/g, ' ')
        .replace(/([+−–—\-\u2012\u2013\u2014\u2212]?\s*[\d\s\xa0]+[.,]\d{2})\s*₽?/g, ' ')
        .replace(/(?:^|[^\wа-яёА-ЯЁ])(?:в\s+)?\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:мск|utc|gmt))?(?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
        .replace(/(?:^|[^\wа-яёА-ЯЁ])(?:операции\s+обработки|операции\s+договора|договора\s+мск|операции|обработки|договора|мск|карты|валюте)(?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
        .replace(/(?:^|\s+)[вv]$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      merchant = stripCardTokens(merchant);
      merchant = cleanMerchantTitle(merchant);
      if (merchant.length >= 2 && !/^\d+$/.test(merchant)) {
        return { merchant: toCleanTitleCase(merchant) };
      }
      return null;
    }
  },

  // --- ГАЗПРОМБАНК ---
  {
    id: 'GPB',
    name: 'Газпромбанк',
    slug: 'gazprombank',
    iconKey: 'gpb',
    badgeColor: 'bg-blue-900/60 text-blue-300 border-blue-700/60',
    guide: {
      doc: 'Выписка по карте / счёту (PDF)',
      steps: [
        'Откройте мобильное приложение Газпромбанка',
        'Выберите счёт карты на главном экране',
        'Перейдите в раздел «Справки и выписки»',
        'Выберите «Выписка по карте», укажите интервал дат',
        'Скачайте сформированный PDF-документ'
      ]
    },
    getScore: (p) => {
      let score = 0;
      if (/лицензи[яи][^\d]*354\b/i.test(p)) score += 10;
      if (p.includes('банк гпб') || p.includes('газпромбанк') || p.includes('гпб (ао)') || p.includes('гпб (акционерное')) score += 8;
      if (p.includes('gazprombank.ru')) score += 5;
      if (p.includes('дата отражения') || p.includes('номер банковского счета')) score += 4;
      return score;
    },
    detect: function(p) { return this.getScore(p) >= 5; },
    isTxStart: (l) => /^(\d{2}\.\d{2}\.\d{4})\s+(\d{2}\.\d{2}\.\d{4})/.test(l.trim()),
    isServiceLine: (l) => {
      const lower = l.toLowerCase();
      return lower.includes('газпромбанк (акционерное общество)') ||
             lower.includes('генеральная лицензия банка россии') ||
             lower.includes('исходящий остаток') ||
             lower.includes('итого оборотов') ||
             lower.includes('дата отражения');
    },
    customMerchantFilter: (lines, fullText, amount, dateStr, type) => {
      const full = lines.join(' ');
      const dev = extractDeviceField(full);
      const sbp = full.match(/Перевод\s+(?:по\s+СБП|клиенту|от)\s+([^.]+?)(?:\.|$)/i);
      let merchant = dev ? dev : (sbp ? sbp[0].trim() : null);
      if (!merchant) return null;
      if (/sbp\s+c2c\s+spisanie/i.test(merchant)) {
        return { merchant: 'Перевод через СБП', bankCategory: 'Перевод' };
      } else if (/sbp\s+c2c\s+zachislenie/i.test(merchant)) {
        return { merchant: 'Входящий перевод СБП', bankCategory: 'Перевод' };
      } else if (/sbp\s+pl\s+qr/i.test(merchant)) {
        return { merchant: 'Оплата через СБП QR', bankCategory: 'Платежи' };
      } else {
        const link = extractWebsiteLink(merchant);
        if (link) {
          return { merchant: /sbp/i.test(merchant) ? `SBP ${link}` : link };
        }
        return { merchant: toCleanTitleCase(stripCardTokens(merchant)) };
      }
    }
  },

  // --- СБЕРБАНК ---
  {
    id: 'SBER',
    name: 'Сбербанк',
    slug: 'sberbank',
    iconKey: 'sber',
    badgeColor: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/60',
    guide: {
      doc: 'Выписка по счёту карты (PDF)',
      steps: [
        'Откройте приложение «СберБанк Онлайн»',
        'Выберите нужную карту или платёжный счёт',
        'Нажмите «О карте» → «Выписки и справки»',
        'Выберите «Выписка по счету карты», укажите интервал дат',
        'Скачайте сформированный PDF-документ'
      ]
    },
    getScore: (p) => {
      let score = 0;
      if (/лицензи[яи][^\d]*1481\b/i.test(p) || p.includes('1481')) score += 10;
      if (p.includes('пао сбербанк') || p.includes('сбербанк россии') || p.includes('сбербанк онлайн') || p.includes('sberbank online')) score += 8;
      else if (p.includes('сбербанк') || p.includes('сбер')) score += 5;
      if (p.includes('sberbank.ru') || p.includes('sber.ru')) score += 5;
      if (p.includes('отчет по счету') || p.includes('выписка по счету дебетовой карты') || p.includes('выписка по счету карты') || p.includes('выписка по счёту')) score += 4;
      return score;
    },
    detect: function(p) { return this.getScore(p) >= 5; },
    isTxStart: (l, nextLine, currentBlock) => {
      if (!l) return false;
      if (currentBlock && currentBlock.length > 0) {
        const isProcessingLine = /^\s*\d{2}\.\d{2}\.\d{4}\s+(?:\d{5,8}|[A-Za-z0-9_-]{5,10})\b/i.test(l);
        if (isProcessingLine) return false;
      }
      return /^\s*\d{2}\.\d{2}\.\d{4}(?:\s+\d{2}:\d{2})?\s+[А-Яа-яЁёA-Za-z]/.test(l);
    },
    isServiceLine: (l) => {
      const lower = l.toLowerCase();
      return lower.includes('пао сбербанк') ||
             lower.includes('генеральная лицензия') ||
             lower.includes('отчет по счету') ||
             lower.includes('входящий остаток') ||
             lower.includes('исходящий остаток') ||
             lower.includes('всего зачислений') ||
             lower.includes('всего списаний');
    },
    customMerchantFilter: (lines, fullText, amount, dateStr, type) => {
      const full = lines.join(' ');
      let bankCategory = null;
      let merchant = '';

      // 1. Извлекаем категорию Сбера (например: "Отдых и развлечения", "Супермаркеты", "Кафе и рестораны", "Переводы", "Транспорт" и т.д.)
      const catSplit = splitBankCategoryAndMerchant(full);
      if (catSplit && catSplit.bankCategory) {
        bankCategory = catSplit.bankCategory;
      }

      // 2. В Сбере вторая строка (или правая часть строки) содержит:
      // [Дата проводки] [Код авторизации 6 цифр] [Мерчант POS] [Город/RUS] [Операция по карте ****XXXX]
      const sberAuthMatch = full.match(/(?:\d{2}\.\d{2}\.\d{4}\s+)?\b\d{5,8}\b\s+([^]+?)(?=(?:\.?\s*операци[яиею]|\bпо\s+карте|\bс\s+карты|\bсо\s+счета|\bна\s+карту|\bкарта\b|\*\*\*\*|\b\d{4}\b)|$)/i);
      
      if (sberAuthMatch && sberAuthMatch[1].trim().length >= 2) {
        merchant = sberAuthMatch[1].trim();
      } else if (lines.length >= 2) {
        let second = lines.slice(1).join(' ')
          .replace(/^\s*\d{2}\.\d{2}\.\d{4}\s*/g, ' ')
          .replace(/(?:^|\s+)\d{5,8}(?=\s+|$)/g, ' ')
          .replace(/(?:^|\s+)(?:0t0|ot0|oto|ko|t01|pos)[*_\s]\s*/gi, ' ')
          .replace(/([+−–—\-\u2012\u2013\u2014\u2212]?\s*[\d\s\xa0]+[.,]\d{2})/g, ' ')
          .trim();
        merchant = second;
      }

      if (!merchant || merchant.length < 2) {
        let cleanFirst = lines[0]
          .replace(/^\s*\d{2}\.\d{2}\.\d{4}\s*(?:\d{2}:\d{2})?\s*/, '')
          .replace(/([+−–—\-\u2012\u2013\u2014\u2212]?\s*[\d\s\xa0]+[.,]\d{2})/g, '')
          .trim();
        if (bankCategory) {
          cleanFirst = cleanFirst.replace(new RegExp('^' + escapeRegExp(bankCategory), 'i'), '').trim();
        }
        merchant = cleanFirst;
      }

      // Очистка от масок карт, фраз операций и номеров
      merchant = stripCardTokens(merchant);
      merchant = cleanMerchantTitle(merchant);

      // Удаляем географические и терминальные суффиксы (MOSKVA RUS, 3505 MOSKVA RUS, RU, RUS, SANKT-PETERBURG и т.д.)
      merchant = merchant
        .replace(/(?:^|[^\wа-яёА-ЯЁ])(?:moscow|moskva|sankt-?peterbur[g]?|spb|chelyabinsk|kazan|rostov|samara|ufa|perm|novosibirsk|ekaterinburg|krasnodar|vladivostok|rus|ru)(?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
        .replace(/\b\d{3,6}\b/g, ' ') // убираем терминальные ID вроде 3505
        .replace(/\b(?:pp\s+card|card)\b.*$/gi, ' ')
        .replace(/(?:^|[^\wа-яёА-ЯЁ])\.?\s*операци[яиею](?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      merchant = stripCardTokens(merchant);
      merchant = cleanMerchantTitle(merchant);

      const cleanM = toCleanTitleCase(merchant);
      if (cleanM && cleanM.length >= 2 && !/^(?:операция|операция сбербанк|банковская операция)$/i.test(cleanM)) {
        return {
          merchant: cleanM,
          bankCategory: bankCategory
        };
      }
      return { merchant: type === 'Доход' ? 'Поступление средств' : 'Операция Сбербанк', bankCategory };
    }
  },

  // --- ОЗОН БАНК ---
  {
    id: 'OZON',
    name: 'Озон Банк',
    slug: 'ozonbank',
    iconKey: 'ozon',
    badgeColor: 'bg-sky-900/60 text-sky-300 border-sky-700/60',
    guide: {
      doc: 'Справка о движении средств (PDF)',
      steps: [
        'Откройте приложение Ozon Банк',
        'Выберите нужную карту или платёжный счёт',
        'Нажмите «Получить справку» → «О движении средств»',
        'Укажите интервал дат и тип операций',
        'Скачайте сформированный PDF-документ'
      ]
    },
    getScore: (p) => {
      let score = 0;
      if (/лицензи[яи][^\d]*3542\b/i.test(p) || p.includes('3542')) score += 10;
      if (p.includes('озон банк') || p.includes('ozon банк') || p.includes('ozon bank') || p.includes('еком банк') || p.includes('ecom bank')) score += 8;
      if (p.includes('finance.ozon.ru') || p.includes('ozon.ru')) score += 5;
      if (p.includes('справка о движении денежных средств') || p.includes('справка о движении средств') || p.includes('движении средств')) score += 4;
      return score;
    },
    detect: function(p) { return this.getScore(p) >= 5; },
    isTxStart: (l) => /^\s*\d{2}\.\d{2}\.\d{4}/.test(l.trim()),
    isServiceLine: (l) => {
      const lower = l.toLowerCase();
      return lower.includes('озон банк') ||
             lower.includes('еком банк') ||
             lower.includes('справка о движении') ||
             lower.includes('исходящий остаток') ||
             lower.includes('итого по операциям');
    },
    customMerchantFilter: (lines, fullText, amount, dateStr, type) => {
      const full = lines.join(' ');
      const pos = full.match(/(?:сумма\s*[\d.]+\s*в|\bв)\s+([\s\S]+?)\s+дата\s*\d{4}/i);
      if (pos && pos[1].trim()) {
        let m = pos[1].replace(/\s+(RU|RUS)$/i, '').replace(/\s+/g, ' ').trim();
        return { merchant: toCleanTitleCase(stripCardTokens(cleanMerchantTitle(m))) };
      } else if (/выплата\s+к[еэ]шб[еэ]ка/i.test(full)) {
        return { merchant: 'Кэшбек Ozon', bankCategory: 'Кэшбек' };
      } else if (/возврат/i.test(full)) {
        const o = full.match(/заказ\s*№?\s*([0-9a-zA-Z-]+)/i);
        return { merchant: o ? `Возврат Ozon (${o[0]})` : 'Возврат покупки' };
      } else if (/ozon\s*travel/i.test(full)) {
        const o = full.match(/заказ\s*№?\s*([0-9a-zA-Z-]+)/i);
        return { merchant: o ? `Ozon Travel (${o[0]})` : 'Ozon Travel' };
      } else if (/платформе\s+ozon|оплата.*ozon/i.test(full)) {
        const o = full.match(/заказ\s*№?\s*([0-9a-zA-Z-]+)/i);
        return { merchant: o ? `Ozon (${o[0]})` : 'Ozon' };
      } else if (/перевод.*сбп/i.test(full)) {
        const s = full.match(/(?:Отправитель|Получатель):\s*([^.]*?)(?:Без НДС|$)/i);
        return {
          merchant: s ? `Перевод СБП (${s[1].trim()})` : (type === 'Доход' ? 'Входящий перевод СБП' : 'Перевод через СБП'),
          bankCategory: 'Перевод'
        };
      }
      return null;
    }
  }
];
window.BANK_REGISTRY = BANK_REGISTRY;

function openBankGuide(bankIdentifier) {
  const bank = BANK_REGISTRY.find(b => b.id === bankIdentifier || b.iconKey === bankIdentifier || b.slug === bankIdentifier);
  if (!bank || !bank.guide) return;

  const dialog = document.getElementById('bank-guide-dialog');
  const titleEl = document.getElementById('bank-guide-title');
  const docEl = document.getElementById('bank-guide-doc');
  const stepsEl = document.getElementById('bank-guide-steps');
  const iconContainer = document.getElementById('bank-guide-icon');

  if (!dialog || !titleEl || !docEl || !stepsEl) return;

  titleEl.textContent = bank.name;
  docEl.textContent = bank.guide.doc;

  if (iconContainer) {
    iconContainer.setAttribute('data-bank-icon', bank.iconKey || bank.slug);
  }

  stepsEl.innerHTML = bank.guide.steps.map((step, idx) => `
    <div class="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#12151C] border border-[rgba(255,255,255,0.03)]">
      <span class="w-5 h-5 rounded-full bg-[#6C5DD3]/20 text-[#6C5DD3] text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">${idx + 1}</span>
      <span class="text-xs text-gray-300 leading-snug">${escapeHtml(step)}</span>
    </div>
  `).join('');

  dialog.classList.remove('hidden');

  if (typeof renderBankIcons === 'function') {
    renderBankIcons();
  }
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function closeBankGuide() {
  const dialog = document.getElementById('bank-guide-dialog');
  if (dialog) dialog.classList.add('hidden');
}

window.openBankGuide = openBankGuide;
window.closeBankGuide = closeBankGuide;

// =============================================================
// ФЛАГ ТЕСТИРОВАНИЯ УНИВЕРСАЛЬНОГО ПАРСЕРА
// true  = ВСЕ выписки проходят через единый универсальный сеточный парсер (для тестирования)
// false = используются специфические классы банков из BANK_REGISTRY с фоллбэком на универсальный парсер
// =============================================================
const FORCE_UNIVERSAL_PARSER = false;
window.FORCE_UNIVERSAL_PARSER = FORCE_UNIVERSAL_PARSER;

// =============================================================
// 3. ДИСПЕТЧЕР (НАХОДИТ БАНК И ЗАПУСКАЕТ ПАРСИНГ)
// =============================================================
class StatementDispatcher {
  /**
   * Интеллектуально выделяет шапку документа строго до начала таблицы операций,
   * чтобы захватить лицензии и реквизиты, исключив строки переводов СБП.
   */
  static extractPreamble(rawLines) {
    let cutoffIndex = Math.min(rawLines.length, 50);

    for (let i = 0; i < cutoffIndex; i++) {
      const line = rawLines[i].toLowerCase();
      // Остановка перед заголовком таблицы или первой транзакцией
      if (
        line.includes('дата операции') ||
        line.includes('дата списания') ||
        line.includes('дата отражения') ||
        line.includes('дата проводки') ||
        line.includes('дата документа') ||
        (/\d{2}\.\d{2}\.\d{4}/.test(line) && /[\d\s\xa0]+[.,]\d{2}/.test(line))
      ) {
        cutoffIndex = Math.max(i, 8);
        break;
      }
    }

    return rawLines.slice(0, cutoffIndex).join(' ').toLowerCase();
  }

  /**
   * Автоматически распознает банк из шапки или текста документа
   * даже если он отсутствует в основном реестре BANK_REGISTRY
   */
  static detectGenericBank(preamble, rawLines) {
    let name = 'Банк (универсальный)';
    let slug = 'generic';
    let iconKey = 'generic';

    const fullHeader = (preamble + ' ' + (rawLines.slice(0, 30).join(' '))).toLowerCase();

    if (fullHeader.includes('сбербанк') || fullHeader.includes('sberbank') || fullHeader.includes('сбер')) {
      name = 'Сбербанк';
      slug = 'sberbank';
      iconKey = 'sber';
    } else if (fullHeader.includes('тинькофф') || fullHeader.includes('т-банк') || fullHeader.includes('т банк') || fullHeader.includes('tinkoff') || fullHeader.includes('t-bank')) {
      name = 'Т-Банк';
      slug = 'tbank';
      iconKey = 'tbank';
    } else if (fullHeader.includes('альфа-банк') || fullHeader.includes('альфа банк') || fullHeader.includes('alfa-bank')) {
      name = 'Альфа-Банк';
      slug = 'alfabank';
      iconKey = 'alfa';
    } else if (fullHeader.includes('втб') || fullHeader.includes('банк втб') || fullHeader.includes('vtb')) {
      name = 'ВТБ';
      slug = 'vtb';
      iconKey = 'vtb';
    } else if (fullHeader.includes('райффайзен') || fullHeader.includes('raiffeisen')) {
      name = 'Райффайзенбанк';
      slug = 'raiffeisen';
      iconKey = 'raiffeisen';
    } else if (fullHeader.includes('совкомбанк') || fullHeader.includes('халва')) {
      name = 'Совкомбанк';
      slug = 'sovcombank';
      iconKey = 'generic';
    } else if (fullHeader.includes('росбанк')) {
      name = 'Росбанк';
      slug = 'rosbank';
      iconKey = 'generic';
    } else if (fullHeader.includes('промсвязьбанк') || fullHeader.includes('псб')) {
      name = 'ПСБ';
      slug = 'psb';
      iconKey = 'generic';
    } else if (fullHeader.includes('мтс банк') || fullHeader.includes('мтс-банк')) {
      name = 'МТС Банк';
      slug = 'mts';
      iconKey = 'generic';
    } else {
      const match = (rawLines.slice(0, 25).join(' ')).match(/(?:пао|ао|ооо|акб|кб)\s*[«"]?([^»"\n\r]{3,35}банк[а-я]*)[»"]?/i);
      if (match && match[1]) {
        name = match[1].replace(/^[«"]+|[»"]+$/g, '').trim();
      }
    }

    return {
      id: slug.toUpperCase(),
      name: name,
      slug: slug,
      iconKey: iconKey,
      badgeColor: 'bg-indigo-900/60 text-indigo-300 border-indigo-700/60'
    };
  }

  static parse(rawLines) {
    const preamble = this.extractPreamble(rawLines);

    let bestBank = null;
    let maxScore = 0;

    for (const bank of BANK_REGISTRY) {
      const score = bank.getScore ? bank.getScore(preamble) : (bank.detect(preamble) ? 10 : 0);
      if (score > maxScore) {
        maxScore = score;
        bestBank = bank;
      }
    }

    if (!bestBank || maxScore < 4) {
      bestBank = this.detectGenericBank(preamble, rawLines);
    }

    // Единый продвинутый сеточный парсер с банк-адаптером
    const transactions = UniversalStatementParser.parseUniversal(rawLines, bestBank);

    if (!transactions || transactions.length === 0) {
      throw new Error(`В документе «${bestBank.name}» не удалось обнаружить финансовые операции. Убедитесь, что загружен файл выписки с операциями.`);
    }

    return { bank: bestBank, transactions };
  }
}

// -------------------------------------------------------------
// 3. UI-ОБРАБОТЧИК И ВЫВОД РЕЗУЛЬТАТА (МУЛЬТИЗАГРУЗКА ВЫПИСОК)
// -------------------------------------------------------------
async function handleStatementUpload(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;

  const pdfFiles = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
  if (pdfFiles.length === 0) {
    showToast('Пожалуйста, выберите файлы в формате PDF', true);
    event.target.value = '';
    return;
  }

  const totalFiles = pdfFiles.length;
  const parsedResults = [];
  const errors = [];

  for (let i = 0; i < totalFiles; i++) {
    const file = pdfFiles[i];
    const progressText = totalFiles > 1 
      ? `Обработка выписки (${i + 1} из ${totalFiles}): ${file.name}...` 
      : `Обработка выписки: ${file.name}...`;
    showToast(progressText, false, true);

    try {
      const lines = await StatementExtractor.extractLinesFromPDF(file);
      if (!lines || lines.length === 0) {
        throw new Error('Файл пуст или не содержит читаемого текста');
      }

      const result = StatementDispatcher.parse(lines);
      let blobUrl = '';
      try {
        blobUrl = URL.createObjectURL(file);
      } catch (e) {
        console.warn('Could not create object URL:', e);
      }

      parsedResults.push({
        file,
        fileName: file.name,
        fileSize: file.size,
        blobUrl,
        bank: result.bank,
        transactions: result.transactions
      });
    } catch (err) {
      console.error(`Ошибка обработки PDF ${file.name}:`, err);
      errors.push(`${file.name}: ${err.message}`);
    }
  }

  if (parsedResults.length === 0) {
    showToast('Не удалось обработать выписки:\n' + errors.join('; '), true);
    event.target.value = '';
    return;
  }

  if (errors.length > 0) {
    showToast(`Загружено ${parsedResults.length} из ${totalFiles} выписок. Ошибки: ${errors.join('; ')}`, true);
  } else {
    document.getElementById('toast-container')?.classList.add('hidden');
  }

  // Объединяем операции из всех обработанных выписок
  const combinedTransactions = [];
  const loadedStatements = [];

  parsedResults.forEach((res, pIdx) => {
    loadedStatements.push({
      fileName: res.fileName,
      fileSize: res.fileSize,
      file: res.file,
      blobUrl: res.blobUrl,
      bank: res.bank,
      count: res.transactions.length
    });

    res.transactions.forEach((tx, txIdx) => {
      tx._id = `tx_p_${pIdx}_${txIdx}`;
      tx.bank = res.bank.name;
      tx.bankSlug = res.bank.slug;
      tx.bankIconKey = res.bank.iconKey || res.bank.slug || 'generic';
      tx.bankBadgeColor = res.bank.badgeColor;
      tx.sourceFile = res.fileName;
      combinedTransactions.push(tx);
    });
  });

  renderParsedTransactionsView(loadedStatements, combinedTransactions);
  event.target.value = '';
}
window.handleStatementUpload = handleStatementUpload;

// -------------------------------------------------------------
// 4. ПРОВЕРКА ДУБЛИКАТОВ И ИМПОРТ В FIREBASE
// -------------------------------------------------------------

/**
 * Надежно преобразует любое значение даты в чистую ISO-строку 'YYYY-MM-DD'
 * без искажений часовых поясов.
 */
function extractIsoDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      try { return extractIsoDate(val.toDate()); } catch (e) {}
    }
    if (typeof val.seconds === 'number') {
      return extractIsoDate(new Date(val.seconds * 1000));
    }
    if (typeof val._seconds === 'number') {
      return extractIsoDate(new Date(val._seconds * 1000));
    }
  }
  if (typeof val === 'number') {
    return extractIsoDate(new Date(val));
  }
  const str = String(val).trim();
  if (!str) return '';

  // 1. Формат DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
  const ruMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (ruMatch) {
    const day = ruMatch[1].padStart(2, '0');
    const month = ruMatch[2].padStart(2, '0');
    let year = ruMatch[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${month}-${day}`;
  }

  // 2. Формат YYYY-MM-DD, YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 3. Резерв через parseAnyDate
  const parsed = (typeof parseAnyDate === 'function') ? parseAnyDate(str) : new Date(str);
  if (parsed && !isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

/**
 * Нормализует строку описания/мерчанта для сравнения
 */
function cleanMerchantForCompare(str) {
  if (!str) return '';
  if (typeof StatementCategorizer !== 'undefined' && typeof StatementCategorizer.normalize === 'function') {
    return StatementCategorizer.normalize(str);
  }
  return String(str).toLowerCase().replace(/[^a-zа-я0-9]/gi, '').trim();
}

/**
 * Нормализует сырые строки описания операции для точной проверки идентичности
 */
function normalizeRawDetails(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGenericMerchant(normStr) {
  if (!normStr) return true;
  const generics = ['rashod', 'dohod', 'pokupka', 'trata', 'operatsiya', 'perevod', 'drugoe', 'oplatatovarov'];
  return generics.some(g => normStr.includes(g));
}

/**
 * Проверяет, является ли операция дубликатом с подробной информацией.
 * Поддерживает:
 * - проверку относительно базы данных (Cache.transactions) по строгому совпадению календарного дня, суммы и типа
 * - проверку относительно ранее встреченных операций в текущем пакете файлов (seenInBatch)
 * - учет уже сопоставленных записей (matchedDbIds), чтобы 1 запись в базе не помечала 2 разные операции
 * - сопоставление сырых описаний выписки (rawDetails), предотвращающее ложные дубли одинаковых покупок одного дня (например, две оплаты метро)
 */
function checkTransactionDuplicateWithDetails(tx, options = {}) {
  if (!tx) return { isDuplicate: false };

  const matchedDbIds = options.matchedDbIds || new Set();
  const seenInBatch = options.seenInBatch || [];
  const customList = Array.isArray(options) ? options : (options.existingList || null);

  const txAmount = (typeof parseAmount === 'function')
    ? Math.abs(parseAmount(tx.amount))
    : Math.abs(parseFloat(String(tx.amount || 0).replace(/\s/g, '').replace(/,/g, '.')) || 0);

  const rawTxType = String(tx.type || '').trim().toLowerCase();
  const txType = (rawTxType === 'доход' || rawTxType === 'income') ? 'Доход' : 'Расход';

  const txIsoDate = extractIsoDate(tx.date || tx.displayDate || tx.rawDate || tx.formattedDate);
  const txMerchant = String(tx.merchant || tx.comment || tx.description || '').trim();
  const normTxMerchant = cleanMerchantForCompare(txMerchant);
  const rawTx = normalizeRawDetails(tx.rawDetails || tx.comment || tx.description || tx.merchant || '');

  // 1. Проверка на дубликат внутри текущего пакета импортируемых файлов
  if (seenInBatch && seenInBatch.length > 0) {
    for (const prevTx of seenInBatch) {
      if (!prevTx || prevTx._id === tx._id) continue;
      const prevAmount = (typeof parseAmount === 'function')
        ? Math.abs(parseAmount(prevTx.amount))
        : Math.abs(parseFloat(String(prevTx.amount || 0).replace(/\s/g, '').replace(/,/g, '.')) || 0);
      const rawPrevType = String(prevTx.type || '').trim().toLowerCase();
      const prevType = (rawPrevType === 'доход' || rawPrevType === 'income') ? 'Доход' : 'Расход';

      if (Math.abs(prevAmount - txAmount) > 0.05 || prevType !== txType) continue;

      const prevIsoDate = extractIsoDate(prevTx.date || prevTx.displayDate || prevTx.rawDate || prevTx.formattedDate);
      if (!prevIsoDate || !txIsoDate || prevIsoDate !== txIsoDate) continue;

      const isSameFile = (tx.sourceFile && prevTx.sourceFile && tx.sourceFile === prevTx.sourceFile) ||
                         (!tx.sourceFile && !prevTx.sourceFile);

      const rawPrev = normalizeRawDetails(prevTx.rawDetails || prevTx.comment || prevTx.description || prevTx.merchant || '');

      if (isSameFile) {
        // ВНУТРИ ОДНОЙ ВЫПИСКИ / ФАЙЛА:
        // Банковская выписка содержит только реальные финансовые списания и поступления.
        // Несколько одинаковых сумм в один день (например, 2 поездки на автобусе по 38 ₽, 2 чека по 200 ₽) —
        // это раздельные реальные транзакции, и внутри одной выписки дубликатов быть не может.
        continue;
      } else {
        // МЕЖДУ РАЗНЫМИ ВЫПИСКАМИ (пользователь загрузил пересекающиеся выписки):
        if (rawTx && rawPrev && rawTx === rawPrev) {
          return { isDuplicate: true, reason: 'Повтор в выписке' };
        }
        const prevNormMerchant = cleanMerchantForCompare(prevTx.merchant || prevTx.comment || prevTx.description || '');
        if (normTxMerchant && prevNormMerchant && (normTxMerchant === prevNormMerchant || normTxMerchant.includes(prevNormMerchant) || prevNormMerchant.includes(normTxMerchant))) {
          // Если есть подробные сырые строки и они явно различаются по времени/кодам, не блокируем
          if (rawTx && rawPrev && rawTx !== rawPrev && rawTx.length > 8 && rawPrev.length > 8) {
            // Раздельные операции
          } else {
            return { isDuplicate: true, reason: 'Повтор в выписке' };
          }
        }
      }
    }
  }

  // 2. Проверка относительно базы данных (Cache.transactions)
  const allExisting = customList || (
    typeof getAllCachedTransactionsFlat === 'function'
      ? getAllCachedTransactionsFlat()
      : ((window.Cache?.transactions || []).flatMap(m => Array.isArray(m.items) ? m.items : (m.amount !== undefined ? [m] : [])))
  );

  if (!allExisting || allExisting.length === 0) {
    return { isDuplicate: false };
  }

  for (let i = 0; i < allExisting.length; i++) {
    const item = allExisting[i];
    if (!item) continue;

    const itemId = item.id || `idx_${i}`;
    if (matchedDbIds.has(itemId)) continue;

    const itemAmount = (typeof parseAmount === 'function')
      ? Math.abs(parseAmount(item.amount))
      : Math.abs(parseFloat(String(item.amount || 0).replace(/\s/g, '').replace(/,/g, '.')) || 0);

    const rawItemType = String(item.type || '').trim().toLowerCase();
    const itemType = (rawItemType === 'доход' || rawItemType === 'income') ? 'Доход' : 'Расход';

    if (Math.abs(itemAmount - txAmount) > 0.05 || itemType !== txType) {
      continue;
    }

    const itemIsoDate = extractIsoDate(item.date || item.rawDate || item.formattedDate || item.displayDate);
    const itemComment = (typeof getTxComment === 'function' ? getTxComment(item) : String(item.comment || item.description || item.merchant || '')).trim();
    const normItemComment = cleanMerchantForCompare(itemComment);

    // Строгое совпадение по точному календарному дню (ISO)
    if (itemIsoDate && txIsoDate && itemIsoDate === txIsoDate) {
      // Если у обеих записей есть мерчант, и они абсолютно разные и длинные — это могут быть разные покупки в один день
      const areBothDistinctMerchants = normTxMerchant && normItemComment &&
        normTxMerchant.length >= 4 && normItemComment.length >= 4 &&
        !normTxMerchant.includes(normItemComment) && !normItemComment.includes(normTxMerchant) &&
        !isGenericMerchant(normTxMerchant) && !isGenericMerchant(normItemComment);

      if (!areBothDistinctMerchants) {
        return { isDuplicate: true, reason: 'В базе', matchedDbId: itemId };
      }
    }
  }

  return { isDuplicate: false };
}

/**
 * Проверяет, есть ли уже такая операция в базе данных (Cache.transactions)
 * Универсальная точка входа: совместима с вызовами с 1 или 2 аргументами
 */
function isTransactionDuplicate(tx, optionsOrList) {
  const res = checkTransactionDuplicateWithDetails(tx, optionsOrList);
  return res.isDuplicate;
}

// -------------------------------------------------------------
// ОБНОВЛЕННЫЙ УПЛОТНЕННЫЙ РЕНДЕР КАРТОЧЕК ВЫПИСКИ (~52px)
// -------------------------------------------------------------
let currentImportFilter = 'new'; // 'new' | 'transfers' | 'dupes' | 'all'
let currentBankFilter = 'all';   // 'all' | bankName

function setImportFilter(filter) {
  currentImportFilter = filter;
  ['new', 'transfers', 'dupes', 'all'].forEach(f => {
    const btn = document.getElementById(`tab-import-${f}`);
    if (btn) {
      btn.className = f === filter
        ? 'py-1 px-1.5 rounded-lg font-semibold bg-[#212430] text-white text-xs transition-all cursor-pointer flex flex-col items-center justify-center leading-tight text-center'
        : 'py-1 px-1.5 rounded-lg font-medium text-[#848D99] hover:text-white text-xs transition-all cursor-pointer flex flex-col items-center justify-center leading-tight text-center';
    }
  });

  const txs = window._lastParsedTransactions || [];
  renderFilteredRows(txs);
}
window.setImportFilter = setImportFilter;

function setBankFilter(bankName) {
  currentBankFilter = bankName;

  // Обновляем визуальное состояние кнопок банков
  const container = document.getElementById('pdf-bank-filter-container');
  if (container) {
    const buttons = container.querySelectorAll('button');
    buttons.forEach(btn => {
      const isAllBtn = btn.id === 'bank-filter-btn-all';
      const isMatch = (isAllBtn && bankName === 'all') || btn.id === `bank-filter-btn-${bankName}`;
      if (isMatch) {
        btn.className = 'flex-shrink-0 flex items-center gap-1.5 py-1 px-2.5 rounded-xl font-semibold bg-[#212430] text-white border border-[rgba(255,255,255,0.12)] text-[11px] shadow-sm transition-all cursor-pointer whitespace-nowrap';
      } else {
        btn.className = 'flex-shrink-0 flex items-center gap-1.5 py-1 px-2.5 rounded-xl font-medium text-[#848D99] bg-[#12151C] hover:text-white hover:bg-[#1A1D27] border border-[rgba(255,255,255,0.04)] text-[11px] transition-all cursor-pointer whitespace-nowrap';
      }
    });
  }

  const txs = window._lastParsedTransactions || [];
  renderFilteredRows(txs);
  if (window._updateHeaderSummary) window._updateHeaderSummary();
}
window.setBankFilter = setBankFilter;

// Массовый выбор: отметить все новые транзакции (с учетом активного фильтра по банку)
function toggleSelectAllNew() {
  const txs = window._lastParsedTransactions || [];
  const targetTxs = currentBankFilter === 'all' ? txs : (Array.isArray(txs) ? txs.filter(t => t && t.bank === currentBankFilter) : []);
  const anyUnselected = (Array.isArray(targetTxs) ? targetTxs : []).some(t => t && !t.isDuplicate && !t.isTransfer && !t.selected);
  (Array.isArray(targetTxs) ? targetTxs : []).forEach(t => {
    if (t && !t.isDuplicate && !t.isTransfer) {
      t.selected = anyUnselected;
    }
  });
  renderFilteredRows(txs);
  if (window._updateHeaderSummary) window._updateHeaderSummary();
}
window.toggleSelectAllNew = toggleSelectAllNew;

function renderFilteredRows(transactions) {
  const output = document.getElementById('pdf-debug-output');
  if (!output) return;

  const expenseCategories = getActiveCategories('Расход');
  const incomeCategories = getActiveCategories('Доход');

  // 1. Фильтрация по банку
  let bankTxs = transactions;
  if (currentBankFilter !== 'all') {
    bankTxs = transactions.filter(t => t.bank === currentBankFilter);
  }

  // 2. Фильтрация по статусам
  let visibleTxs = bankTxs;
  if (currentImportFilter === 'new') {
    visibleTxs = bankTxs.filter(t => !t.isDuplicate && !t.isTransfer);
  } else if (currentImportFilter === 'transfers') {
    visibleTxs = bankTxs.filter(t => t.isTransfer);
  } else if (currentImportFilter === 'dupes') {
    visibleTxs = bankTxs.filter(t => t.isDuplicate && !t.isTransfer);
  }

  if (visibleTxs.length === 0) {
    output.innerHTML = '<div class="text-center text-[#848D99] py-12 text-xs">Нет операций в этой вкладке</div>';
    return;
  }

  let html = '';
  visibleTxs.forEach(tx => {
    const isInactive = tx.isDuplicate || tx.isTransfer;
    const isExp = tx.type === 'Расход';
    const amountSign = isExp ? '-' : '+';
    
    // Суммы всегда максимально контрастные, четкие и яркие (полная видимость)
    const amountColor = isExp ? 'text-white font-bold' : 'text-[#30D158] font-bold';

    // Стилизация фона и рамки карточки:
    // Карточки переводов и дублей НЕ затемняются (100% видимость, без opacity),
    // но имеют аккуратный отличительный оттенок фона и рамки для моментального узнавания
    let cardThemeClasses = 'bg-[#181B24] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.14)]';
    if (tx.isTransfer) {
      cardThemeClasses = 'bg-[#1C1F2B] border-amber-500/30 hover:border-amber-500/45';
    } else if (tx.isDuplicate) {
      cardThemeClasses = 'bg-[#1A1E29] border-blue-400/25 hover:border-blue-400/40';
    }

    const cats = isExp ? expenseCategories : incomeCategories;
    const currentIcon = getDynamicCategoryIcon(tx.category);
    const bankIconKey = tx.bankIconKey || 'generic';

    html += `
      <!-- Просторная 2-уровневая строка (мерчант на всю строку, дата, банк и чипс снизу) -->
      <div class="card-parsed-row ${cardThemeClasses} border px-3.5 py-2.5 rounded-2xl flex flex-col gap-1.5 transition-all relative cursor-pointer select-none" 
           id="card-tx-${tx._id}" 
           data-is-inactive="${isInactive}"
           onpointerdown="handleCardPointerDown(event, '${tx._id}')"
           onpointermove="handleCardPointerMove(event)"
           onpointerup="handleCardPointerUp(event)"
           onpointercancel="handleCardPointerCancel(event)"
           onclick="handleCardRowClick(event, '${tx._id}')">
        
        <!-- СТРОКА 1: Чекбокс, Название мерчанта, Бейджи и Сумма -->
        <div class="flex items-center justify-between gap-2.5 min-w-0">
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            <input type="checkbox" 
                   class="w-4 h-4 rounded accent-[#6C5DD3] bg-[#212430] border-gray-700 flex-shrink-0 cursor-pointer"
                   id="chk-tx-${tx._id}"
                   data-tx-id="${tx._id}"
                   ${tx.selected ? 'checked' : ''}
                   onclick="event.stopPropagation()"
                   onchange="toggleTxSelection('${tx._id}', this.checked)">

            <div class="flex items-center gap-1.5 min-w-0 flex-1">
              <span class="text-[13px] text-gray-100 font-semibold truncate leading-tight" title="${escapeHtml(tx.merchant)}">
                ${escapeHtml(tx.merchant)}
              </span>
              ${tx.isTransfer ? '<span class="text-[10px] font-bold text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-lg border border-amber-500/30 whitespace-nowrap ml-auto">Перевод</span>' : ''}
              ${tx.isDuplicate ? `<span class="text-[10px] font-bold text-sky-200 bg-sky-500/15 px-2 py-0.5 rounded-lg border border-sky-400/30 whitespace-nowrap ml-auto" title="${escapeHtml(tx.duplicateReason || 'В базе')}">${escapeHtml(tx.duplicateReason || 'В базе')}</span>` : ''}
            </div>
          </div>

          <span class="text-[14px] ${amountColor} font-mono flex-shrink-0 ml-2 whitespace-nowrap">
            ${amountSign}${formatMoney(tx.amount)}
          </span>
        </div>

        <!-- СТРОКА 2: Банк и Дата слева, Категория-чипс и Пин справа -->
        <div class="flex items-center justify-between gap-2 pt-1 border-t border-[rgba(255,255,255,0.03)]">
          <div class="flex items-center gap-1.5 text-[11px] text-[#848D99] min-w-0">
            <!-- Иконка банка (без фона, 24x24 px, размером с флажок) -->
            <span class="inline-flex items-center justify-center flex-shrink-0 cursor-default" 
                  style="width: 24px; height: 24px; padding-left: 2px; padding-right: 2px; border-style: none; background: transparent;" 
                  title="${escapeHtml(tx.bank || 'Банк')}${tx.sourceFile ? ' • ' + escapeHtml(tx.sourceFile) : ''}">
              <span data-bank-icon="${bankIconKey}" class="w-6 h-6 flex items-center justify-center flex-shrink-0" style="width: 24px; height: 24px; padding-left: 0px;"></span>
            </span>

            <span class="font-mono flex-shrink-0">${tx.displayDate}</span>
          </div>

          <div class="flex items-center gap-2 flex-shrink-0">
            <!-- Чипс категории с фиксированной шириной 130px -->
            <div class="relative custom-dropdown-wrap flex-shrink-0" id="cat-wrap-${tx._id}" data-prevent-row-click="true">
              <button type="button" 
                      onclick="event.stopPropagation(); toggleImportCatMenu('${tx._id}')" 
                      id="cat-btn-${tx._id}"
                      data-prevent-row-click="true"
                      class="w-[130px] bg-[#212430] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.15)] text-[#F2F4F7] text-[11px] font-medium rounded-full px-2.5 py-1 flex items-center justify-between outline-none transition-colors cursor-pointer flex-shrink-0 min-w-0">
                <span id="cat-label-${tx._id}" class="flex items-center gap-1.5 min-w-0 flex-1 pr-1 overflow-hidden pointer-events-none">
                  <i data-lucide="${currentIcon}" class="w-3.5 h-3.5 text-[#848D99] flex-shrink-0"></i> 
                  <span class="truncate text-left block w-full">${escapeHtml(tx.category)}</span>
                </span>
                <i data-lucide="chevron-down" class="w-3 h-3 text-gray-500 flex-shrink-0 ml-auto pointer-events-none"></i>
              </button> 
              
              <div id="cat-menu-${tx._id}" 
                   class="custom-dropdown-menu hidden absolute right-0 bottom-full mb-1.5 w-52 max-h-60 overflow-y-auto bg-[#181B24] border border-[rgba(255,255,255,0.08)] rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.85)] z-50 p-1.5 space-y-0.5"
                   data-prevent-row-click="true">
                ${cats.map(cat => {
                  const isCustom = !DEFAULT_SYSTEM_CATEGORIES.includes(cat);
                  const loopIcon = getDynamicCategoryIcon(cat);
                  return `
                    <div class="flex items-center justify-between hover:bg-[#2A2D3C] rounded-xl px-2.5 py-1.5 transition-colors group">
                      <button type="button" 
                              onclick="event.stopPropagation(); selectImportCat('${tx._id}', '${escapeHtml(cat)}', '${loopIcon}')" 
                              class="flex-1 text-left text-[12px] font-medium text-gray-200 flex items-center gap-2 cursor-pointer truncate min-w-0">
                        <i data-lucide="${loopIcon}" class="w-3.5 h-3.5 text-[#848D99] pointer-events-none"></i>
                        <span class="truncate pointer-events-none">${escapeHtml(cat)}</span>
                      </button>
                      ${isCustom ? `
                        <button type="button" onclick="event.stopPropagation(); deleteCategoryFromImport('${escapeHtml(cat)}', '${tx.type}')" class="text-gray-500 hover:text-[#FF453A] p-1 flex-shrink-0 cursor-pointer"><i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i></button>
                      ` : ''}
                    </div>
                  `;
                }).join('')}

                <div class="border-t border-[rgba(255,255,255,0.06)] pt-1 mt-1">
                  <button type="button" onclick="event.stopPropagation(); addCategoryFromImport('${tx.type}', '${tx._id}')" class="w-full text-left px-2 py-1.5 text-[12px] text-[#8C7DFF] hover:text-white hover:bg-[#6C5DD3]/15 rounded-lg flex items-center gap-1.5 font-semibold cursor-pointer transition-colors">
                    <i data-lucide="plus" class="w-3.5 h-3.5 pointer-events-none"></i>
                    <span>Добавить категорию</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Кнопка булавка закрепления правила с тактильным эффектом -->
            <button type="button" 
                    onclick="event.stopPropagation(); openRememberRuleModal('${tx._id}')" 
                    data-prevent-row-click="true"
                    class="w-7 h-7 rounded-xl bg-[#6C5DD3]/15 hover:bg-[#6C5DD3]/25 active:scale-90 text-[#8C7DFF] hover:text-white border border-[#6C5DD3]/25 flex items-center justify-center flex-shrink-0 cursor-pointer transition-all shadow-sm group" 
                    title="Запомнить в словарь категорий">
              <i data-lucide="pin" class="w-3.5 h-3.5 transition-transform group-hover:scale-110 pointer-events-none"></i>
            </button>
          </div>
        </div>

      </div>
    `;
  });

  output.innerHTML = html;
  if (typeof renderBankIcons === 'function') renderBankIcons();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderParsedTransactionsView(loadedStatementsOrFileName, transactions, bankConfig) {
  let loadedStatements = [];
  if (Array.isArray(loadedStatementsOrFileName)) {
    loadedStatements = loadedStatementsOrFileName;
  } else {
    loadedStatements = [{
      fileName: loadedStatementsOrFileName,
      bank: bankConfig || { name: 'Банк', slug: 'generic', iconKey: 'generic' },
      count: transactions.length
    }];
  }

  window._loadedStatements = loadedStatements;
  window._lastActiveBank = loadedStatements[0]?.bank || bankConfig;
  window._lastParsedFileName = loadedStatements[0]?.fileName || (typeof loadedStatementsOrFileName === 'string' ? loadedStatementsOrFileName : 'Выписка');
  window._lastParsedBankName = window._lastActiveBank;
  currentBankFilter = 'all';

  // Сортировка по убыванию даты
  transactions.sort((a, b) => b.date.localeCompare(a.date));
  
  const dialog = document.getElementById('pdf-debug-dialog');
  const info = document.getElementById('pdf-debug-info');

  const matchedDbIds = new Set();
  const seenInBatch = [];

  transactions.forEach((tx, idx) => {
    if (!tx._id) tx._id = 'tx_parsed_' + idx;
    if (!tx.category || tx.category === 'Не определено') {
      tx.category = StatementCategorizer.categorize(tx.merchant, tx.rawDetails, tx.type);
    }
    const dupCheck = checkTransactionDuplicateWithDetails(tx, { matchedDbIds, seenInBatch });
    tx.isDuplicate = dupCheck.isDuplicate;
    tx.duplicateReason = dupCheck.reason || 'В базе';
    if (dupCheck.matchedDbId) {
      matchedDbIds.add(dupCheck.matchedDbId);
    }

    if (typeof tx.selected === 'undefined') {
      tx.selected = !tx.isDuplicate && !tx.isTransfer;
    }
    if (!tx.bank && tx.bankSlug) {
      const bFound = BANK_REGISTRY.find(b => b.slug === tx.bankSlug);
      if (bFound) tx.bank = bFound.name;
    }
    if (!tx.bank) tx.bank = window._lastActiveBank?.name || 'Банк';
    if (!tx.bankIconKey) tx.bankIconKey = window._lastActiveBank?.iconKey || window._lastActiveBank?.slug || 'generic';

    seenInBatch.push(tx);
  });

  window._lastParsedTransactions = transactions;

  // Формируем фильтр по банкам
  const bankFilterContainer = document.getElementById('pdf-bank-filter-container');
  if (bankFilterContainer) {
    const bankStats = {};
    transactions.forEach(t => {
      const b = t.bank || 'Банк';
      if (!bankStats[b]) bankStats[b] = { count: 0, iconKey: t.bankIconKey || 'generic' };
      bankStats[b].count++;
    });
    const bankNames = Object.keys(bankStats);

    if (bankNames.length > 1) {
      bankFilterContainer.classList.remove('hidden');
      let filterHtml = `
        <button type="button" 
                onclick="setBankFilter('all')" 
                id="bank-filter-btn-all"
                class="flex-shrink-0 flex items-center gap-1.5 py-1 px-2.5 rounded-xl font-semibold bg-[#212430] text-white border border-[rgba(255,255,255,0.12)] text-[11px] shadow-sm transition-all cursor-pointer whitespace-nowrap">
          <i data-lucide="layers" class="w-3.5 h-3.5 opacity-80 flex-shrink-0"></i>
          <span>Все банки</span>
          <span class="opacity-75 font-mono text-[10px]">(${transactions.length})</span>
        </button>
      `;
      bankNames.forEach(bName => {
        const item = bankStats[bName];
        filterHtml += `
          <button type="button" 
                  onclick="setBankFilter('${escapeHtml(bName)}')" 
                  id="bank-filter-btn-${escapeHtml(bName)}"
                  class="flex-shrink-0 flex items-center gap-1.5 py-1 px-2.5 rounded-xl font-medium text-[#848D99] bg-[#12151C] hover:text-white hover:bg-[#1A1D27] border border-[rgba(255,255,255,0.04)] text-[11px] transition-all cursor-pointer whitespace-nowrap">
            <span data-bank-icon="${item.iconKey}" class="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0"></span>
            <span class="truncate max-w-[110px]">${escapeHtml(bName)}</span>
            <span class="opacity-75 font-mono text-[10px]">(${item.count})</span>
          </button>
        `;
      });
      bankFilterContainer.innerHTML = filterHtml;
      if (typeof renderBankIcons === 'function') renderBankIcons();
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
      bankFilterContainer.classList.add('hidden');
      bankFilterContainer.innerHTML = '';
    }
  }

  function updateHeaderSummary() {
    const allSelectedTxs = transactions.filter(t => t.selected);
    const totalExp = allSelectedTxs.filter(t => t.type === 'Расход').reduce((s, t) => s + t.amount, 0);
    const totalInc = allSelectedTxs.filter(t => t.type === 'Доход').reduce((s, t) => s + t.amount, 0);

    // Подготовка отображения шапки с информацией о выписках
    if (info) {
      if (loadedStatements.length > 1) {
        const uniqueBankNames = [...new Set(loadedStatements.map(s => s.bank?.name || 'Банк'))];
        const filesTooltip = loadedStatements.map(s => `${s.fileName} (${s.bank?.name}): ${s.count} оп.`).join('\n');
        info.innerHTML = `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border bg-[#6C5DD3]/15 text-[#8C7DFF] border-[#6C5DD3]/25 cursor-help min-w-0 max-w-[170px] sm:max-w-[280px]" title="${escapeHtml(filesTooltip)}">
            <i data-lucide="layers" class="w-3 h-3 flex-shrink-0"></i>
            <span class="truncate">${loadedStatements.length} выписок (${escapeHtml(uniqueBankNames.join(', '))})</span>
          </span>
          <span class="text-[11px] text-[#848D99] font-mono flex-shrink-0">
            ${transactions.length} оп.
          </span>
        `;
      } else {
        const single = loadedStatements[0];
        const bConfig = single.bank || bankConfig || {};
        const bankName = bConfig.name || 'Банк';
        const iconKey = bConfig.iconKey || bConfig.slug || 'generic';
        const badgeColor = bConfig.badgeColor || 'bg-blue-900/60 text-blue-300 border-blue-700/60';
        info.innerHTML = `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border ${badgeColor} min-w-0 max-w-[120px] sm:max-w-[200px]">
            <span data-bank-icon="${iconKey}" class="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0"></span>
            <span class="truncate">${escapeHtml(bankName)}</span>
          </span>
          <span class="text-[11px] text-[#848D99] truncate font-normal min-w-0 flex-1" title="${escapeHtml(single.fileName)}">
            ${escapeHtml(single.fileName)}
          </span>
        `;
      }
      if (typeof renderBankIcons === 'function') renderBankIcons();
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // Обновляем метрики в компактной горизонтальной карточке
    const cntEl = document.getElementById('pdf-stat-count');
    const expEl = document.getElementById('pdf-stat-exp');
    const incEl = document.getElementById('pdf-stat-inc');
    if (cntEl) cntEl.innerText = `${allSelectedTxs.length} из ${transactions.length}`;
    if (expEl) expEl.innerText = formatMoney(totalExp);
    if (incEl) incEl.innerText = formatMoney(totalInc);

    // Точный раздельный подсчет операций (для выбранного фильтра по банку)
    const currentScopeTxs = currentBankFilter === 'all' 
      ? transactions 
      : transactions.filter(t => t.bank === currentBankFilter);

    const newCount = currentScopeTxs.filter(t => !t.isDuplicate && !t.isTransfer).length;
    const transfersCount = currentScopeTxs.filter(t => t.isTransfer).length;
    const dupesCount = currentScopeTxs.filter(t => t.isDuplicate && !t.isTransfer).length;

    const cntNew = document.getElementById('tab-count-new');
    const cntTransfers = document.getElementById('tab-count-transfers');
    const cntDupes = document.getElementById('tab-count-dupes');
    const cntAll = document.getElementById('tab-count-all');

    if (cntNew) cntNew.innerText = newCount;
    if (cntTransfers) cntTransfers.innerText = transfersCount;
    if (cntDupes) cntDupes.innerText = dupesCount;
    if (cntAll) cntAll.innerText = currentScopeTxs.length;

    const tabTransfers = document.getElementById('tab-import-transfers');
    const tabDupes = document.getElementById('tab-import-dupes');

    // Скрываем вкладки только если в них 0 операций
    if (tabTransfers) tabTransfers.style.display = transfersCount > 0 ? 'flex' : 'none';
    if (tabDupes) tabDupes.style.display = dupesCount > 0 ? 'flex' : 'none';

    const importBtn = document.getElementById('btn-import-transactions');
    if (importBtn) {
      importBtn.innerText = `Импортировать (${allSelectedTxs.length})`;
      importBtn.disabled = allSelectedTxs.length === 0;
    }
  }

  window._updateHeaderSummary = updateHeaderSummary;
  setImportFilter('new'); // По умолчанию открываем только новые транзакции
  updateHeaderSummary();

  dialog.classList.remove('hidden');
  const scrollContainer = document.getElementById('pdf-debug-scroll-container');
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
  }
  if (typeof renderBankIcons === 'function') renderBankIcons();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleImportCatMenu(txId) {
  const menu = document.getElementById(`cat-menu-${txId}`);
  const btn = document.getElementById(`cat-btn-${txId}`);
  const card = document.getElementById(`card-tx-${txId}`);
  if (!menu || !btn) return;

  const isClosed = menu.classList.contains('hidden');
  
  // Закрываем все открытые меню
  document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
  document.querySelectorAll('.card-parsed-row').forEach(c => {
    c.style.zIndex = '';
  });

  if (isClosed) {
    // Поднимаем z-index на время работы с меню
    if (card) {
      card.style.zIndex = '60';
    }
    
    // Позиционируем вниз (или вверх, если внизу нет места)
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 240 && rect.top > 240) {
      menu.style.bottom = 'calc(100% + 4px)';
      menu.style.top = 'auto';
    } else {
      menu.style.top = 'calc(100% + 4px)';
      menu.style.bottom = 'auto';
    }

    menu.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function selectImportCat(txId, newCat, icon) {
  const tx = window._lastParsedTransactions?.find(t => t._id === txId);
  const catIcon = (icon && icon !== 'undefined' && icon !== '') ? icon : getDynamicCategoryIcon(newCat);
  if (tx) {
    tx.category = newCat;
    tx.categoryIcon = catIcon;
    const labelEl = document.getElementById(`cat-label-${txId}`);
    if (labelEl) {
      labelEl.innerHTML = `
        <i data-lucide="${catIcon}" class="w-3.5 h-3.5 text-[#848D99] flex-shrink-0"></i> 
        <span class="truncate text-left block w-full">${escapeHtml(newCat)}</span>
      `;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }
  const menu = document.getElementById(`cat-menu-${txId}`);
  if (menu) menu.classList.add('hidden');
  const card = document.getElementById(`card-tx-${txId}`);
  if (card) {
    card.style.zIndex = '';
  }
}

// Удаление категории прямо из окна импорта
async function deleteCategoryFromImport(catName, type) {
  if (typeof deleteCategory === 'function') {
    await deleteCategory(catName, type);
    // Мгновенно перерисовываем список импорта с актуальными категориями
    const txs = window._lastParsedTransactions || [];
    renderFilteredRows(txs);
    if (window._updateHeaderSummary) window._updateHeaderSummary();
  }
}

// Добавление категории прямо из окна импорта
function addCategoryFromImport(type, txId = null) {
  window._importActiveTxId = txId;
  document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
  if (typeof showAddCategoryDialog === 'function') {
    showAddCategoryDialog(type);
  }
}
window.addCategoryFromImport = addCategoryFromImport;

// Мгновенное обновление выпадающих списков категорий и выбор созданной категории
function refreshStatementImportCategories(newCategoryName, newCategoryIcon, targetTxId = null) {
  const txs = window._lastParsedTransactions || [];
  if (targetTxId && newCategoryName) {
    const tx = txs.find(t => t && t._id === targetTxId);
    if (tx) {
      tx.category = newCategoryName;
      if (newCategoryIcon) tx.categoryIcon = newCategoryIcon;
    }
  }
  renderFilteredRows(txs);
  if (window._updateHeaderSummary) window._updateHeaderSummary();
}
window.refreshStatementImportCategories = refreshStatementImportCategories;

// -------------------------------------------------------------
// ТАКТИЛЬНЫЙ ПРЕДПРОСМОТР СЫРЫХ ДАННЫХ ВЫПИСКИ (LONG TAP / PEEK)
// -------------------------------------------------------------
let _rawTooltipTimer = null;
let _rawTooltipTxId = null;
let _rawTooltipStartX = 0;
let _rawTooltipStartY = 0;
let _isShowingRawTooltip = false;
let _isPointerDownOnCard = false;
window._suppressRowClickUntil = 0;

function handleCardPointerDown(event, txId) {
  if (event.button && event.button !== 0) return;
  const target = (event?.target?.nodeType === 3) ? event.target.parentElement : event?.target;
  if (!target) return;

  if (target.closest('button, input, select, textarea, label, .custom-dropdown-wrap, .custom-dropdown-menu, [data-prevent-row-click]')) {
    return;
  }

  _isPointerDownOnCard = true;
  _rawTooltipTxId = txId;
  _rawTooltipStartX = event.clientX;
  _rawTooltipStartY = event.clientY;

  clearTimeout(_rawTooltipTimer);
  _rawTooltipTimer = setTimeout(() => {
    if (_isPointerDownOnCard && _rawTooltipTxId === txId) {
      showRawTxTooltip(txId, _rawTooltipStartX, _rawTooltipStartY);
    }
  }, 350);
}
window.handleCardPointerDown = handleCardPointerDown;

function handleCardPointerMove(event) {
  if (!_isPointerDownOnCard) return;
  const dist = Math.hypot(event.clientX - _rawTooltipStartX, event.clientY - _rawTooltipStartY);
  // Если тултип еще не показан и палец сместился более чем на 10px (пользователь скроллит):
  // отменяем таймер долгого тапа
  if (!_isShowingRawTooltip && dist > 10) {
    clearTimeout(_rawTooltipTimer);
    _isPointerDownOnCard = false;
  }
}
window.handleCardPointerMove = handleCardPointerMove;

function handleCardPointerUp(event) {
  clearTimeout(_rawTooltipTimer);
  _isPointerDownOnCard = false;
  if (_isShowingRawTooltip) {
    // Тултип остается открытым на экране (не исчезает при отпускании пальца)
    // Подавляем последующий synthetic click, чтобы не переключить чекбокс карточки
    window._suppressRowClickUntil = Date.now() + 650;
    if (event) {
      event.preventDefault?.();
      event.stopPropagation?.();
    }
  }
}
window.handleCardPointerUp = handleCardPointerUp;

function handleCardPointerCancel(event) {
  clearTimeout(_rawTooltipTimer);
  _isPointerDownOnCard = false;
}
window.handleCardPointerCancel = handleCardPointerCancel;

// Инициализация ультра-легкого горизонтального свайпа тултипа (влево/вправо — свайп, вверх/вниз — скролл)
function initTooltipSwipe() {
  const tooltip = document.getElementById('raw-tx-tooltip');
  if (!tooltip || tooltip.dataset.swipeInit === 'true') return;
  tooltip.dataset.swipeInit = 'true';

  let startX = 0, startY = 0;
  let currentDx = 0;
  let isSwiping = false;
  let directionLocked = null; // null | 'horizontal' | 'vertical'
  let startTime = 0;
  let activePointerId = null;

  tooltip.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    if (e.target.closest('button, a')) return;

    startX = e.clientX;
    startY = e.clientY;
    currentDx = 0;
    isSwiping = false;
    directionLocked = null;
    startTime = Date.now();
    activePointerId = e.pointerId;

    tooltip.style.transition = 'none';
  });

  tooltip.addEventListener('pointermove', (e) => {
    if (activePointerId === null || e.pointerId !== activePointerId) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Определяем направление жеста при начале движения
    if (!directionLocked) {
      // Если движение вертикальное (скролл содержимого) — отдаем управление естественному вертикальному скроллу
      if (absDy >= 5 && absDy > absDx) {
        directionLocked = 'vertical';
        return;
      }

      // Если движение горизонтальное (свайп) — захватываем жест для легкого скольжения
      if (absDx >= 5 && absDx >= absDy) {
        directionLocked = 'horizontal';
        isSwiping = true;
        try {
          tooltip.setPointerCapture(e.pointerId);
        } catch (err) {}
      }
    }

    if (directionLocked === 'horizontal' && isSwiping) {
      if (e.cancelable) e.preventDefault();
      currentDx = dx;

      // Мгновенный отклик 1:1 без rAF-задержки + легкая визуальная обратная связь прозрачностью
      const opacityProgress = Math.min(absDx / 240, 0.45);
      tooltip.style.transform = `translate3d(${currentDx}px, 0, 0)`;
      tooltip.style.opacity = String(1 - opacityProgress);
    }
  }, { passive: false });

  const onPointerFinish = (e) => {
    if (activePointerId === null || e.pointerId !== activePointerId) return;

    const wasHorizontal = (directionLocked === 'horizontal');
    const movedDx = currentDx;
    isSwiping = false;
    directionLocked = null;
    activePointerId = null;

    try {
      tooltip.releasePointerCapture(e.pointerId);
    } catch (err) {}

    if (!wasHorizontal) {
      tooltip.style.transform = 'translate3d(0, 0, 0)';
      tooltip.style.opacity = '1';
      return;
    }

    const absDx = Math.abs(movedDx);
    const duration = Date.now() - startTime;
    const velocity = absDx / Math.max(1, duration);

    // Легкий порог срабатывания свайпа: от 24px или легкий флик пальцем (> 0.18 px/ms)
    if (absDx > 24 || velocity > 0.18) {
      const sign = movedDx >= 0 ? 1 : -1;
      const flyX = sign * Math.max(window.innerWidth || 400, 360);
      tooltip.style.transition = 'transform 0.16s cubic-bezier(0.1, 0.9, 0.2, 1), opacity 0.14s ease-out';
      tooltip.style.transform = `translate3d(${flyX}px, 0, 0)`;
      tooltip.style.opacity = '0';
      setTimeout(() => {
        hideRawTxTooltip();
      }, 140);
    } else {
      // Быстрый и плавный возврат тултипа
      tooltip.style.transition = 'transform 0.18s cubic-bezier(0.1, 0.9, 0.2, 1), opacity 0.16s ease-out';
      tooltip.style.transform = 'translate3d(0, 0, 0)';
      tooltip.style.opacity = '1';
      setTimeout(() => {
        tooltip.style.transition = 'none';
      }, 190);
    }
  };

  tooltip.addEventListener('pointerup', onPointerFinish);
  tooltip.addEventListener('pointercancel', onPointerFinish);
}

function showRawTxTooltip(txId, clientX, clientY) {
  const tx = window._lastParsedTransactions?.find(t => t._id === txId);
  if (!tx) return;

  const tooltip = document.getElementById('raw-tx-tooltip');
  if (!tooltip) return;

  initTooltipSwipe();

  _isShowingRawTooltip = true;
  window._rawTooltipOpenedAt = Date.now();
  window._suppressRowClickUntil = Date.now() + 650;

  if (navigator.vibrate) {
    try { navigator.vibrate(20); } catch (e) {}
  }

  const dateEl = document.getElementById('raw-tooltip-date');
  const bankEl = document.getElementById('raw-tooltip-bank');
  const textEl = document.getElementById('raw-tooltip-text');

  if (dateEl) dateEl.innerText = tx.displayDate || tx.date || '';
  if (bankEl) bankEl.innerText = tx.bank ? String(tx.bank) : '';

  let rawText = tx.rawDetails || tx.comment || tx.description || tx.merchant || 'Нет исходных данных';
  if (textEl) textEl.innerText = rawText.trim();

  // Получаем точные границы карточки операции
  const card = document.getElementById('card-tx-' + txId);
  const cardRect = card ? card.getBoundingClientRect() : null;

  // Рассчитываем ширину тултипа
  const maxW = Math.min(window.innerWidth - 24, 460);
  const tooltipWidth = cardRect ? Math.min(cardRect.width, maxW) : maxW;
  tooltip.style.width = `${tooltipWidth}px`;

  // Снимаем реальную высоту содержимого тултипа для аккуратного позиционирования
  tooltip.style.visibility = 'hidden';
  tooltip.style.opacity = '1';
  tooltip.style.transition = 'none';
  tooltip.style.transform = 'translate3d(0, 0, 0)';
  tooltip.classList.remove('hidden');

  const tooltipRect = tooltip.getBoundingClientRect();
  const tooltipHeight = tooltipRect.height || 130;
  tooltip.style.visibility = 'visible';

  // Горизонтальное положение X: выравниваем с карточкой, зажимая в границы экрана
  let posX = cardRect ? cardRect.left + (cardRect.width - tooltipWidth) / 2 : (clientX - tooltipWidth / 2);
  posX = Math.max(12, Math.min(posX, window.innerWidth - tooltipWidth - 12));

  // Вертикальное положение Y:
  // "преимущественно прямо под карточкой, и только если места снизу не хватает, то прямо над карточкой, не перекрывая ее"
  const GAP = 8; // отступ между карточкой и тултипом
  let posY = 0;

  if (cardRect) {
    const spaceBelow = window.innerHeight - cardRect.bottom;
    const spaceAbove = cardRect.top;
    const neededSpace = tooltipHeight + GAP + 12;

    if (spaceBelow >= neededSpace) {
      // Преимущественно прямо ПОД карточкой (места снизу достаточно)
      posY = cardRect.bottom + GAP;
    } else if (spaceAbove >= neededSpace) {
      // Места снизу не хватает, но сверху достаточно — строго НАД карточкой (не перекрывая ее)
      posY = cardRect.top - tooltipHeight - GAP;
    } else {
      // Места в обрез — выбираем сторону с наибольшим пространством, никогда не перекрывая карточку
      if (spaceBelow >= spaceAbove) {
        posY = cardRect.bottom + GAP;
      } else {
        posY = Math.max(8, cardRect.top - tooltipHeight - GAP);
      }
    }
  } else {
    // Фоллбек
    const neededSpace = tooltipHeight + GAP + 16;
    if (window.innerHeight - clientY >= neededSpace) {
      posY = clientY + GAP;
    } else {
      posY = Math.max(8, clientY - tooltipHeight - GAP);
    }
  }

  tooltip.style.left = `${posX}px`;
  tooltip.style.top = `${posY}px`;
  tooltip.style.transform = 'translate3d(0, 0, 0)';
  tooltip.style.opacity = '1';

  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.showRawTxTooltip = showRawTxTooltip;

function hideRawTxTooltip() {
  const tooltip = document.getElementById('raw-tx-tooltip');
  if (tooltip) {
    tooltip.classList.add('hidden');
    tooltip.style.transform = 'translate3d(0, 0, 0)';
    tooltip.style.opacity = '1';
  }
  _isShowingRawTooltip = false;
  _isPointerDownOnCard = false;
}
window.hideRawTxTooltip = hideRawTxTooltip;

// Скрытие тултипа при скролле экрана/окна/списка операций
window.addEventListener('scroll', () => {
  if (_isShowingRawTooltip) hideRawTxTooltip();
}, { passive: true, capture: true });

document.addEventListener('scroll', () => {
  if (_isShowingRawTooltip) hideRawTxTooltip();
}, { passive: true, capture: true });

document.getElementById('pdf-debug-scroll-container')?.addEventListener('scroll', () => {
  if (_isShowingRawTooltip) hideRawTxTooltip();
}, { passive: true });

// Закрытие тултипа при тапе или клике мимо него (на пустую область, другую карточку или фон)
function handleOutsideTooltipEvent(e) {
  if (!_isShowingRawTooltip) return;
  // Защита от моментального закрытия событием отпускания пальца/клика после долгого тапа
  if (Date.now() < (window._suppressRowClickUntil || 0)) return;
  if (Date.now() - (window._rawTooltipOpenedAt || 0) < 500) return;
  if (_isPointerDownOnCard) return;
  if (_rawTooltipTxId && e.target && typeof e.target.closest === 'function' && e.target.closest('#card-tx-' + _rawTooltipTxId) && (Date.now() - (window._rawTooltipOpenedAt || 0) < 750)) {
    return;
  }
  const tooltip = document.getElementById('raw-tx-tooltip');
  if (tooltip && !tooltip.contains(e.target)) {
    hideRawTxTooltip();
  }
}
document.addEventListener('pointerdown', handleOutsideTooltipEvent, true);
document.addEventListener('click', handleOutsideTooltipEvent, true);

window.addEventListener('pointerup', () => {
  if (_isPointerDownOnCard) {
    handleCardPointerUp();
  }
});
window.addEventListener('pointercancel', () => {
  if (_isPointerDownOnCard) {
    handleCardPointerCancel();
  }
});

// -------------------------------------------------------------
// ПРЯМОЕ ОТКРЫТИЕ ФАЙЛА ВЫПИСКИ В БРАУЗЕРЕ (БЕЗ МОДАЛЬНОГО ОКНА)
// -------------------------------------------------------------
function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '';
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / (1024 * 1024)).toFixed(2) + ' МБ';
}
window.formatFileSize = formatFileSize;

// -------------------------------------------------------------
// ВСТРОЕННЫЙ ПРОСМОТРЩИК PDF (КАНВАС НА БАЗЕ PDF.JS ДЛЯ APK И БРАУЗЕРА)
// -------------------------------------------------------------

let _currentPdfDoc = null;
let _currentPdfPageNum = 1;
let _currentPdfTotalPages = 1;
let _currentPdfScale = 1.0;
let _currentPdfBlobUrl = null;
let _isPdfRendering = false;

/**
 * Открывает встроенный просмотрщик PDF внутри приложения
 */
async function openInAppPdfViewer(fileOrBlobUrl, fileName = 'Выписка.pdf') {
  const modal = document.getElementById('in-app-pdf-viewer-modal');
  if (!modal) return;

  const titleEl = document.getElementById('pdf-viewer-title');
  if (titleEl) titleEl.textContent = fileName || 'Выписка.pdf';

  const externalBtn = document.getElementById('pdf-viewer-external-btn');
  const isNative = typeof window.isNativeAppPlatform === 'function' ? window.isNativeAppPlatform() : false;
  if (externalBtn) {
    externalBtn.style.display = isNative ? 'none' : 'flex';
  }

  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  modal.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: modal });

  try {
    let pdfData = null;
    if (fileOrBlobUrl instanceof File || fileOrBlobUrl instanceof Blob) {
      pdfData = await fileOrBlobUrl.arrayBuffer();
      try {
        _currentPdfBlobUrl = URL.createObjectURL(fileOrBlobUrl);
      } catch (e) {}
    } else if (typeof fileOrBlobUrl === 'string') {
      _currentPdfBlobUrl = fileOrBlobUrl;
      pdfData = fileOrBlobUrl;
    }

    if (!window.pdfjsLib) {
      throw new Error('Библиотека PDF.js загружается, повторите через пару секунд...');
    }

    _currentPdfDoc = await pdfjsLib.getDocument(pdfData).promise;
    _currentPdfTotalPages = _currentPdfDoc.numPages;
    _currentPdfPageNum = 1;
    _currentPdfScale = 1.0;

    await renderCurrentPdfPage();
  } catch (err) {
    console.error('Ошибка рендеринга PDF:', err);
    if (typeof showToast === 'function') {
      showToast('Не удалось отобразить PDF: ' + err.message, true);
    }
  }
}
window.openInAppPdfViewer = openInAppPdfViewer;

async function renderCurrentPdfPage() {
  if (!_currentPdfDoc || _isPdfRendering) return;
  _isPdfRendering = true;

  try {
    const page = await _currentPdfDoc.getPage(_currentPdfPageNum);
    const canvas = document.getElementById('pdf-viewer-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const container = document.getElementById('pdf-viewer-canvas-wrap');
    const availWidth = (container ? container.clientWidth : window.innerWidth) - 24;

    const unscaledViewport = page.getViewport({ scale: 1 });
    const baseScale = Math.min(availWidth / unscaledViewport.width, 2.0);
    const finalScale = Math.max(0.4, baseScale * _currentPdfScale);

    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: finalScale });

    canvas.width = viewport.width * dpr;
    canvas.height = viewport.height * dpr;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };

    await page.render(renderContext).promise;

    // Обновляем метки и кнопки навигации
    const pageLabel = document.getElementById('pdf-viewer-pages-label');
    const pageIndicator = document.getElementById('pdf-page-indicator');
    const zoomLabel = document.getElementById('pdf-viewer-zoom-label');
    const prevBtn = document.getElementById('pdf-prev-page-btn');
    const nextBtn = document.getElementById('pdf-next-page-btn');

    if (pageLabel) pageLabel.textContent = `Страница ${_currentPdfPageNum} из ${_currentPdfTotalPages}`;
    if (pageIndicator) pageIndicator.textContent = `${_currentPdfPageNum} / ${_currentPdfTotalPages}`;
    if (zoomLabel) zoomLabel.textContent = `${Math.round(_currentPdfScale * 100)}%`;

    if (prevBtn) prevBtn.disabled = (_currentPdfPageNum <= 1);
    if (nextBtn) nextBtn.disabled = (_currentPdfPageNum >= _currentPdfTotalPages);
  } catch (err) {
    console.warn('Ошибка отрисовки страницы PDF:', err);
  } finally {
    _isPdfRendering = false;
  }
}
window.renderCurrentPdfPage = renderCurrentPdfPage;

function changePdfViewerPage(delta) {
  const newPage = _currentPdfPageNum + delta;
  if (newPage >= 1 && newPage <= _currentPdfTotalPages) {
    _currentPdfPageNum = newPage;
    renderCurrentPdfPage();
  }
}
window.changePdfViewerPage = changePdfViewerPage;

function changePdfViewerZoom(delta) {
  const newScale = Math.max(0.5, Math.min(3.0, _currentPdfScale + delta));
  if (newScale !== _currentPdfScale) {
    _currentPdfScale = newScale;
    renderCurrentPdfPage();
  }
}
window.changePdfViewerZoom = changePdfViewerZoom;

function closeInAppPdfViewer() {
  const modal = document.getElementById('in-app-pdf-viewer-modal');
  if (modal) modal.classList.add('hidden');
  if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  _currentPdfDoc = null;
}
window.closeInAppPdfViewer = closeInAppPdfViewer;

function openCurrentPdfInExternalTab() {
  if (_currentPdfBlobUrl) {
    try {
      window.open(_currentPdfBlobUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.warn('Не удалось открыть вкладку:', e);
    }
  }
}
window.openCurrentPdfInExternalTab = openCurrentPdfInExternalTab;

/**
 * Главный диспетчер открытия PDF:
 * - В APK приложении (Android WebView): всегда использует встроенный полноэкранный просмотрщик canvas
 * - В браузере (Desktop / Mobile Chrome): открывает в новой вкладке с фоллбеком на встроенный просмотрщик
 */
function openStatementFileDirectly(statement) {
  if (!statement) return;

  // Закрываем выпадающее меню выбора выписки, если оно было открыто
  document.getElementById('statement-file-picker-popup')?.classList.add('hidden');

  const isNative = typeof window.isNativeAppPlatform === 'function' ? window.isNativeAppPlatform() : false;

  // 1. В нативном APK (Android WebView): открываем встроенный просмотрщик
  if (isNative) {
    openInAppPdfViewer(statement.file || statement.blobUrl, statement.fileName);
    return;
  }

  // 2. В обычном браузере: пробуем открыть в новой вкладке
  let fileUrl = statement.blobUrl;
  if (!fileUrl && statement.file) {
    try {
      const isPdf = statement.fileName?.toLowerCase()?.endsWith('.pdf');
      const mime = isPdf ? 'application/pdf' : (statement.file.type || 'application/octet-stream');
      const blob = (statement.file.type === mime) ? statement.file : new Blob([statement.file], { type: mime });
      fileUrl = URL.createObjectURL(blob);
      statement.blobUrl = fileUrl;
    } catch (e) {
      console.warn('Could not create object URL:', e);
    }
  }

  if (!fileUrl) {
    openInAppPdfViewer(statement.file, statement.fileName);
    return;
  }

  try {
    const a = document.createElement('a');
    a.href = fileUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { a.remove(); } catch (err) {}
    }, 100);
  } catch (err) {
    openInAppPdfViewer(statement.file || fileUrl, statement.fileName);
  }
}
window.openStatementFileDirectly = openStatementFileDirectly;

function handleOpenStatementFileClick(event) {
  if (event) {
    event.preventDefault?.();
    event.stopPropagation?.();
  }
  const statements = window._loadedStatements || [];
  if (statements.length === 0) {
    if (typeof showToast === 'function') {
      showToast('Нет загруженных файлов выписки для просмотра', true);
    }
    return;
  }

  if (statements.length === 1) {
    openStatementFileDirectly(statements[0]);
    return;
  }

  // Если файлов несколько — открываем меню выбора файла
  toggleStatementFilePicker(event);
}
window.handleOpenStatementFileClick = handleOpenStatementFileClick;

function toggleStatementFilePicker(event) {
  const popup = document.getElementById('statement-file-picker-popup');
  if (!popup) return;

  const isClosed = popup.classList.contains('hidden');
  if (!isClosed) {
    popup.classList.add('hidden');
    return;
  }

  const statements = window._loadedStatements || [];
  const listEl = document.getElementById('statement-file-picker-list');
  const countEl = document.getElementById('statement-file-picker-count');
  if (countEl) countEl.innerText = `${statements.length} файлов`;

  if (listEl) {
    listEl.innerHTML = statements.map((s, idx) => {
      const bConfig = s.bank || {};
      const bankName = bConfig.name || 'Банк';
      const iconKey = bConfig.iconKey || bConfig.slug || 'generic';
      const sizeStr = s.fileSize ? formatFileSize(s.fileSize) : '';
      return `
        <div onclick="event.stopPropagation(); openStatementViewerByIndex(${idx})" 
             class="flex items-center justify-between p-2 rounded-xl hover:bg-[#212430] active:bg-[#2A2D3C] transition-colors cursor-pointer group">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <span class="inline-flex items-center justify-center flex-shrink-0" style="width: 22px; height: 22px;">
              <span data-bank-icon="${iconKey}" class="w-5 h-5 flex items-center justify-center flex-shrink-0"></span>
            </span>
            <div class="min-w-0 flex-1">
              <div class="text-[12px] font-semibold text-gray-200 group-hover:text-white truncate" title="${escapeHtml(s.fileName)}">
                ${escapeHtml(s.fileName)}
              </div>
              <div class="text-[10px] text-[#848D99] flex items-center gap-1.5 font-mono">
                <span>${escapeHtml(bankName)}</span>
                <span>•</span>
                <span>${s.count} оп.</span>
                ${sizeStr ? `<span>•</span><span>${sizeStr}</span>` : ''}
              </div>
            </div>
          </div>
          <i data-lucide="external-link" class="w-3.5 h-3.5 text-gray-500 group-hover:text-[#8C7DFF] flex-shrink-0 ml-1.5 transition-colors"></i>
        </div>
      `;
    }).join('');
  }

  popup.classList.remove('hidden');
  if (typeof renderBankIcons === 'function') renderBankIcons();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.toggleStatementFilePicker = toggleStatementFilePicker;

function openStatementViewerByIndex(index) {
  const popup = document.getElementById('statement-file-picker-popup');
  if (popup) popup.classList.add('hidden');
  const statements = window._loadedStatements || [];
  if (statements[index]) {
    openStatementFileDirectly(statements[index]);
  }
}
window.openStatementViewerByIndex = openStatementViewerByIndex;
window.openStatementViewerModal = openStatementFileDirectly;
window.closeStatementViewerModal = () => {};

/**
 * Клик по карточке транзакции (переключает выбор, игнорируя клики по кнопкам, чипсу категории, меню и при удержании)
 */
function handleCardRowClick(event, txId) {
  if (window._suppressRowClickUntil && Date.now() < window._suppressRowClickUntil) {
    return;
  }
  const target = (event?.target?.nodeType === 3) ? event.target.parentElement : event?.target;
  if (!target) return;

  // Игнорируем клики по интерактивным элементам внутри карточки:
  // кнопкам, ссылкам, инпутам, дропдаунам, меню и элементам с data-prevent-row-click
  if (target.closest('button, input, select, textarea, label, .custom-dropdown-wrap, .custom-dropdown-menu, [data-prevent-row-click]')) {
    return;
  }

  const tx = window._lastParsedTransactions?.find(t => t._id === txId);
  if (!tx) return;

  const nextState = !tx.selected;
  tx.selected = nextState;

  const chk = document.getElementById(`chk-tx-${txId}`);
  if (chk) chk.checked = nextState;

  if (window._updateHeaderSummary) window._updateHeaderSummary();
}
window.handleCardRowClick = handleCardRowClick;

/**
 * Переключение чекбокса операции
 */
function toggleTxSelection(txId, isSelected) {
  const tx = window._lastParsedTransactions.find(t => t._id === txId);
  if (tx) {
    tx.selected = isSelected;
    if (window._updateHeaderSummary) window._updateHeaderSummary();
  }
}
window.toggleTxSelection = toggleTxSelection;

/**
 * Сохранение всех выбранных операций в Firebase
 */
async function importSelectedTransactions() {
  const selected = (window._lastParsedTransactions || []).filter(t => t.selected);
  if (selected.length === 0) {
    showToast('Выберите хотя бы одну операцию', true);
    return;
  }

  const btn = document.getElementById('btn-import-transactions');
  btn.disabled = true;
  btn.innerText = 'Сохранение...';
  showToast(`Импорт ${selected.length} операций...`, false, true);

  try {
    // В Firestore батч вмещает максимум 500 операций
    const CHUNK_SIZE = 400;
    const userProfile = (typeof getCurrentUserProfile === 'function') ? getCurrentUserProfile() : { displayName: 'Пользователь', avatarId: 'user' };
    const authorInfo = {
      uid: auth?.currentUser?.uid || '',
      name: userProfile.displayName,
      avatarId: userProfile.avatarId
    };

    for (let i = 0; i < selected.length; i += CHUNK_SIZE) {
      const chunk = selected.slice(i, i + CHUNK_SIZE);
      const batch = db.batch();

      chunk.forEach(tx => {
        const docRef = (window.getUserCol ? getUserCol('Transactions') : db.collection('Transactions')).doc();
        tx.id = docRef.id;
        batch.set(docRef, {
          type: tx.type,
          amount: tx.amount,
          date: tx.date,            // YYYY-MM-DD
          category: tx.category,
          comment: tx.merchant,     // Записываем название точки в комментарий
          author: authorInfo,
          createdAt: Date.now()
        });
      });

      await batch.commit();
    }

    showToast(`Успешно добавлено ${selected.length} операций!`);
    document.getElementById('pdf-debug-dialog').classList.add('hidden');

    const hasExpensesInImport = selected.some(s => s.type === 'expense' || s.amount < 0 || (s.type !== 'income'));
    if (hasExpensesInImport) {
      if (typeof triggerBudgetExpenseAnimation === 'function') {
        triggerBudgetExpenseAnimation();
      } else {
        window._budgetNeedsExpenseAnimation = true;
        window._budgetTabDirty = true;
      }
    }

    // Обновляем список транзакций и графики
    if (typeof fetchCollection === 'function') {
      await fetchCollection('Transactions');
    }

    // Проверяем наличие крупных трат среди импортированных операций (не входящих в закрытые месяца)
    const largeTxs = getImportedLargeExpenses(selected);
    if (largeTxs.length > 0) {
      openStatementLargeExpensesModal(largeTxs);
    } else if (window._returnToWizardStep) {
      // Если импорт вызывался из мастера бюджета — возвращаем ровно на Шаг 2
      const returnStep = window._returnToWizardStep;
      window._returnToWizardStep = null;
      if (typeof switchTab === 'function') switchTab('budget');
      if (typeof goToWizardStep === 'function') goToWizardStep(returnStep);
    }
  } catch (err) {
    console.error('Ошибка импорта:', err);
    showToast('Ошибка при импорте: ' + err.message, true);
    btn.disabled = false;
    btn.innerText = 'Попробовать снова';
  }
}

// ============================================================
// МОДУЛЬ РАСПРЕДЕЛЕНИЯ КРУПНЫХ ТРАТ ИЗ ВЫПИСКИ В КАЛЕНДАРЬ
// ============================================================
function getImportedLargeExpenses(transactions) {
  const plan = window.Cache?.budgetPlan;
  const threshold = (typeof getLargeExpenseThreshold === 'function') ? getLargeExpenseThreshold() : Infinity;
  if (!isFinite(threshold) || threshold <= 0) return [];

  const today = new Date();
  const currentMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);

  let startMonthDate = null;
  const isConfigured = !!(plan && plan.isConfigured);

  if (isConfigured) {
    if (typeof window.getBudgetStartMonthDate === 'function') {
      startMonthDate = window.getBudgetStartMonthDate();
    } else if (plan.startMonth) {
      const parts = String(plan.startMonth).split('-');
      if (parts.length === 2) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (!isNaN(y) && !isNaN(m)) startMonthDate = new Date(y, m, 1);
      }
    } else if (plan.createdAt) {
      const d = new Date(plan.createdAt);
      if (!isNaN(d.getTime())) startMonthDate = new Date(d.getFullYear(), d.getMonth(), 1);
    }
  }

  return (transactions || []).filter(tx => {
    // Только расходы
    const isExp = (tx.type === 'expense' || tx.type === 'Расход' || (tx.type !== 'income' && tx.type !== 'Доход' && tx.amount < 0));
    if (!isExp) return false;

    // Уже исключенные / распределенные пропускаем
    if (tx.excludeFromBudget || tx.isExcludedFromBudget || tx.billType === 'onetime' || (parseInt(tx.spreadMonths, 10) > 1)) {
      return false;
    }

    const amt = Math.abs(parseFloat(tx.amount) || 0);
    if (amt < threshold) return false;

    const pDate = (typeof parseAnyDate === 'function') ? parseAnyDate(tx.date) : new Date(tx.date);
    if (!pDate || isNaN(pDate.getTime())) return false;

    const txMonthDate = new Date(pDate.getFullYear(), pDate.getMonth(), 1);

    if (isConfigured) {
      // 1. Если бюджет настроен: исключаем месяцы ДО начала отслеживания плана бюджета (например, бюджет создан с сентября, а операция за август или ранее)
      if (startMonthDate && txMonthDate.getTime() < startMonthDate.getTime()) {
        return false;
      }

      // 2. Исключаем уже закрытые месяцы бюджета
      if (typeof isBudgetMonthClosed === 'function') {
        if (isBudgetMonthClosed(pDate.getFullYear(), pDate.getMonth())) {
          return false;
        }
      }
    } else {
      // Если бюджет еще не настроен: показываем крупные траты только за текущий месяц
      if (txMonthDate.getTime() !== currentMonthDate.getTime()) {
        return false;
      }
    }

    return true;
  });
}

window._statementLargeTxs = [];

function openStatementLargeExpensesModal(largeTxs) {
  if (!largeTxs || largeTxs.length === 0) return;

  const threshold = (typeof getLargeExpenseThreshold === 'function') ? getLargeExpenseThreshold() : 0;
  window._statementLargeTxs = largeTxs.map(tx => ({
    ...tx,
    selectedForAmortize: true,
    spreadMonths: 3
  }));

  const dlg = document.getElementById('statement-large-expenses-modal');
  if (!dlg) return;

  const subtitleEl = document.getElementById('statement-large-subtitle');
  if (subtitleEl) {
    const count = window._statementLargeTxs.length;
    subtitleEl.innerText = `Найдено крупных трат: ${count} (порог от ${formatMoney(threshold)})`;
  }

  renderStatementLargeList();
  updateStmtLargeSummary();

  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: dlg });
}

function renderStatementLargeList() {
  const listEl = document.getElementById('statement-large-list');
  if (!listEl) return;

  const expCats = Cache?.categories?.expense || [];

  listEl.innerHTML = (window._statementLargeTxs || []).map((item, idx) => {
    const amt = Math.abs(parseFloat(item.amount) || 0);
    const pDate = (typeof parseAnyDate === 'function') ? parseAnyDate(item.date) : new Date(item.date);
    const dateFormatted = (typeof formatDateStr === 'function' && pDate) ? formatDateStr(pDate, 'dd.MM.yyyy') : item.date;
    const catObj = expCats.find(c => c.name === item.category);
    const icon = catObj?.icon && catObj.icon !== '📦' ? catObj.icon : 'tag';
    const monthlyVal = Math.round(amt / (item.spreadMonths || 3));
    const title = item.merchant || item.comment || item.category || 'Расход';

    return `
      <div id="stmt-large-card-${idx}" class="p-3 rounded-2xl bg-[#12151C] border border-[rgba(255,255,255,0.06)] flex flex-col gap-2.5 transition-all ${item.selectedForAmortize ? 'border-violet-500/30' : 'opacity-60'}">
        <div class="flex items-center justify-between gap-2.5">
          <label class="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none">
            <input type="checkbox" 
                   id="stmt-large-cb-${idx}" 
                   onchange="toggleStmtLargeItem(${idx}, this.checked)" 
                   class="w-4 h-4 rounded accent-[#6C5DD3] bg-[#212430] border-gray-700 cursor-pointer flex-shrink-0" 
                   ${item.selectedForAmortize ? 'checked' : ''}>
            <div class="w-8 h-8 rounded-xl bg-violet-500/10 text-violet-300 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
              <i data-lucide="${icon}" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0 flex-1">
              <span class="text-xs font-semibold text-gray-200 truncate block leading-snug">${escapeHtml(title)}</span>
              <div class="flex items-center gap-1.5 text-[10px] text-[#848D99] mt-0.5">
                <span class="font-mono text-gray-400">${dateFormatted}</span>
                <span>•</span>
                <span class="truncate">${escapeHtml(item.category || 'Без категории')}</span>
              </div>
            </div>
          </label>
          <div class="text-right flex-shrink-0">
            <span class="text-xs font-bold font-mono text-gray-100 block">-${formatMoney(amt)}</span>
          </div>
        </div>

        <!-- Настройка месяцев и нагрузки -->
        <div class="flex items-center justify-between pt-2 border-t border-[rgba(255,255,255,0.04)] text-[11px]">
          <div class="flex items-center gap-1.5">
            <span class="text-[#848D99]">Срок:</span>
            <div class="flex items-center bg-[#181B24] border border-[rgba(255,255,255,0.08)] rounded-lg p-0.5">
              <button type="button" onclick="changeStmtLargeMonths(${idx}, -1)" class="w-5 h-5 rounded text-gray-300 hover:text-white hover:bg-[#212430] flex items-center justify-center font-bold cursor-pointer transition-colors active:scale-90">-</button>
              <span id="stmt-large-months-${idx}" class="px-1.5 text-[11px] font-bold font-mono text-amber-300 min-w-[42px] text-center">${item.spreadMonths} мес.</span>
              <button type="button" onclick="changeStmtLargeMonths(${idx}, 1)" class="w-5 h-5 rounded text-gray-300 hover:text-white hover:bg-[#212430] flex items-center justify-center font-bold cursor-pointer transition-colors active:scale-90">+</button>
            </div>
          </div>
          <div class="text-[11px] font-mono text-amber-300 font-semibold">
            <span class="text-[10px] text-[#848D99] font-normal mr-1">В месяц:</span>
            <span id="stmt-large-calc-${idx}">+${formatMoney(monthlyVal)}/мес</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons({ root: listEl });
}

function toggleStmtLargeItem(idx, checked) {
  if (!window._statementLargeTxs || !window._statementLargeTxs[idx]) return;
  window._statementLargeTxs[idx].selectedForAmortize = checked;
  const card = document.getElementById(`stmt-large-card-${idx}`);
  if (card) {
    if (checked) {
      card.classList.remove('opacity-60');
      card.classList.add('border-violet-500/30');
    } else {
      card.classList.add('opacity-60');
      card.classList.remove('border-violet-500/30');
    }
  }
  updateStmtLargeSummary();
}

function changeStmtLargeMonths(idx, delta) {
  if (!window._statementLargeTxs || !window._statementLargeTxs[idx]) return;
  const item = window._statementLargeTxs[idx];
  let val = parseInt(item.spreadMonths, 10) || 3;
  val = Math.max(1, Math.min(12, val + delta));
  item.spreadMonths = val;

  const label = document.getElementById(`stmt-large-months-${idx}`);
  if (label) label.innerText = `${val} мес.`;

  const calc = document.getElementById(`stmt-large-calc-${idx}`);
  if (calc) {
    const amt = Math.abs(parseFloat(item.amount) || 0);
    calc.innerText = `+${formatMoney(Math.round(amt / val))}/мес`;
  }

  updateStmtLargeSummary();
}

function updateStmtLargeSummary() {
  const items = (window._statementLargeTxs || []).filter(t => t.selectedForAmortize);
  const summaryEl = document.getElementById('statement-large-summary');
  const submitBtn = document.getElementById('stmt-large-submit-btn');

  if (summaryEl) {
    const totalSelectedSum = items.reduce((s, it) => s + Math.abs(parseFloat(it.amount) || 0), 0);
    summaryEl.innerText = `Выбрано к распределению: ${items.length} из ${(window._statementLargeTxs || []).length} трат на сумму ${formatMoney(totalSelectedSum)}`;
  }

  if (submitBtn) {
    if (items.length === 0) {
      submitBtn.innerHTML = `<span>Пропустить</span>`;
    } else {
      submitBtn.innerHTML = `<i data-lucide="split" class="w-4 h-4"></i><span>Распределить (${items.length})</span>`;
      if (typeof lucide !== 'undefined') lucide.createIcons({ root: submitBtn });
    }
  }
}

function closeStatementLargeExpensesModal() {
  const dlg = document.getElementById('statement-large-expenses-modal');
  if (dlg && !dlg.classList.contains('hidden')) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
  window._statementLargeTxs = [];

  // Если импорт вызывался из мастера бюджета — возвращаем в мастер
  if (window._returnToWizardStep) {
    const returnStep = window._returnToWizardStep;
    window._returnToWizardStep = null;
    if (typeof switchTab === 'function') switchTab('budget');
    if (typeof goToWizardStep === 'function') goToWizardStep(returnStep);
  }
}

async function submitStatementLargeExpenses() {
  const items = (window._statementLargeTxs || []).filter(t => t.selectedForAmortize);
  if (items.length === 0) {
    closeStatementLargeExpensesModal();
    return;
  }

  const btn = document.getElementById('stmt-large-submit-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Сохранение...';
  }

  try {
    const billCol = getUserCol('CalendarBills');
    if (!Cache.calendarBills) Cache.calendarBills = [];

    for (const item of items) {
      const spreadMonths = parseInt(item.spreadMonths, 10) || 3;
      const amount = Math.abs(parseFloat(item.amount) || 0);
      const pDate = (typeof parseAnyDate === 'function' ? parseAnyDate(item.date) : new Date(item.date)) || new Date();
      const monthStr = (typeof formatDateStr === 'function') ? formatDateStr(pDate, 'yyyy-MM') : pDate.toISOString().slice(0, 7);

      // 1. Обновляем транзакцию в Firestore
      if (item.id) {
        await getUserCol('Transactions').doc(item.id).update({
          excludeFromBudget: true,
          spreadMonths: spreadMonths,
          updatedAt: Date.now()
        });
      }

      // 2. Создаем запись в CalendarBills
      const billData = {
        name: item.merchant || item.comment || item.category || 'Разовая трата',
        totalAmount: amount,
        spreadMonths: spreadMonths,
        amount: Math.round(amount / spreadMonths),
        day: pDate.getDate(),
        month: monthStr,
        startMonth: monthStr,
        type: 'onetime',
        linkedTxId: item.id || null,
        isPaid: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const billRef = await billCol.add(billData);
      billData.id = billRef.id;
      Cache.calendarBills.push(billData);

      // 3. Обновляем кэш транзакций в памяти
      const flat = typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
      const cachedTx = flat.find(t => t.id === item.id);
      if (cachedTx) {
        cachedTx.excludeFromBudget = true;
        cachedTx.spreadMonths = spreadMonths;
      }
    }

    // Пересчитываем структуру транзакций
    if (typeof getAllCachedTransactionsFlat === 'function' && typeof processTransactions === 'function') {
      Cache.transactions = processTransactions(getAllCachedTransactionsFlat());
    }

    closeStatementLargeExpensesModal();

    if (typeof triggerBudgetExpenseAnimation === 'function') triggerBudgetExpenseAnimation();
    if (typeof markTabsDirty === 'function') markTabsDirty();
    if (typeof renderBudgetTab === 'function') renderBudgetTab();
    if (typeof renderTransactions === 'function') renderTransactions();
    if (typeof renderBudgetCalendar === 'function') {
      const today = (typeof getSelectedBudgetDate === 'function') ? getSelectedBudgetDate() : new Date();
      const currentMonthStr = (typeof formatDateStr === 'function') ? formatDateStr(today, 'yyyy-MM') : today.toISOString().slice(0, 7);
      const monthItems = (Cache.transactions || []).find(m => m.month === currentMonthStr)?.items || [];
      renderBudgetCalendar(Cache.calendarBills || [], today, monthItems);
      if (typeof updatePlanForecast === 'function') updatePlanForecast();
      if (typeof renderBudgetMonthProgress === 'function') renderBudgetMonthProgress(Cache.budgetPlan || {}, monthItems);
      if (typeof renderWeeklyPulse === 'function') renderWeeklyPulse(Cache.budgetPlan || {}, monthItems);
    }

    showToast(`Успешно распределено ${items.length} ${items.length === 1 ? 'крупная трата' : 'крупных трат'} в календаре!`);

    // Если был возврат в мастер
    if (window._returnToWizardStep) {
      const returnStep = window._returnToWizardStep;
      window._returnToWizardStep = null;
      if (typeof switchTab === 'function') switchTab('budget');
      if (typeof goToWizardStep === 'function') goToWizardStep(returnStep);
    }
  } catch (err) {
    console.error('Error submitting statement large expenses:', err);
    showToast('Ошибка при сохранении распределения: ' + (err.message || ''), true);
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Распределить';
    }
  }
}

// Сохраняем последний результат в глобальную переменную для экспорта
window._lastParsedTransactions = [];

function downloadParsedJSON() {
  if (!window._lastParsedTransactions || window._lastParsedTransactions.length === 0) {
    showToast('Нет данных для скачивания', true);
    return;
  }

  const slug = window._lastActiveBank?.slug || 'statement';
  const today = new Date().toISOString().slice(0, 10);

  const payload = (window._lastParsedTransactions || []).map(t => {
    const comm = t.merchant || t.comment || t.description || '';
    return {
      ...t,
      comment: comm,
      description: comm
    };
  });

  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}_parsed_${today}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// -------------------------------------------------------------
// ЛОГИКА ОКНА "ЗАПОМНИТЬ ПРАВИЛО В СЛОВАРЬ"
// -------------------------------------------------------------
let currentRememberTx = null;
let currentRememberCallback = null;

function openRememberRuleModal(txId) {
  const tx = window._lastParsedTransactions?.find(t => t._id === txId);
  if (!tx) return;

  currentRememberTx = tx;
  currentRememberCallback = null;

  const keywordInput = document.getElementById('rule-keyword-input');
  if (keywordInput) keywordInput.value = tx.merchant || '';

  const targetCats = getActiveCategories(tx.type || 'Расход');
  const selectedCat = (tx.category && targetCats.includes(tx.category)) ? tx.category : (targetCats[0] || 'Другое');
  populateModalCatMenu('rule', targetCats, selectedCat);

  const dlg = document.getElementById('remember-rule-dialog');
  if (dlg) {
    dlg.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function openRememberRuleCustom(keyword, category, type = 'Расход', onSavedCallback = null) {
  currentRememberTx = null;
  currentRememberCallback = (typeof onSavedCallback === 'function') ? onSavedCallback : null;

  const keywordInput = document.getElementById('rule-keyword-input');
  if (keywordInput) keywordInput.value = keyword || '';

  const targetCats = getActiveCategories(type || 'Расход');
  const selectedCat = (category && category !== 'Категория...' && targetCats.includes(category)) ? category : (targetCats[0] || 'Другое');
  populateModalCatMenu('rule', targetCats, selectedCat);

  const dlg = document.getElementById('remember-rule-dialog');
  if (dlg) {
    dlg.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function closeRememberRuleModal() {
  const dlg = document.getElementById('remember-rule-dialog');
  if (dlg) dlg.classList.add('hidden');
  currentRememberTx = null;
  currentRememberCallback = null;
}

async function saveCategoryRuleFromModal() {
  const keyword = document.getElementById('rule-keyword-input')?.value.trim();
  const category = document.getElementById('rule-category-input')?.value;
  
  if (!keyword) {
    if (typeof showToast === 'function') showToast('Введите ключевое слово или фразу', true);
    return;
  }

  if (!category || category === 'Категория...') {
    if (typeof showToast === 'function') showToast('Выберите категорию', true);
    return;
  }

  try {
    const col = (typeof window.getUserCol === 'function') ? window.getUserCol('CategoryRules') : (typeof db !== 'undefined' ? db.collection('CategoryRules') : null);

    if (col) {
      // Если слово ранее было подавлено пользователем — удаляем маркер disabled
      const snap = await col.where('pattern', '==', keyword).get();
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));

      const newDocRef = col.doc();
      batch.set(newDocRef, { pattern: keyword, category: category, updatedAt: Date.now() });
      await batch.commit();

      const normKeyword = (typeof StatementCategorizer !== 'undefined') ? StatementCategorizer.normalize(keyword) : keyword.toLowerCase();
      if (!window.Cache) window.Cache = {};
      if (!window.Cache.categoryRules) window.Cache.categoryRules = [];
      window.Cache.categoryRules = window.Cache.categoryRules.filter(r => ((typeof StatementCategorizer !== 'undefined') ? StatementCategorizer.normalize(r.pattern) : r.pattern.toLowerCase()) !== normKeyword);
      window.Cache.categoryRules.push({ id: newDocRef.id, pattern: keyword, category: category, isSystem: false });
    }

    applyRulesToOpenedStatement(keyword, category);

    if (typeof currentRememberCallback === 'function') {
      try {
        currentRememberCallback(keyword, category);
      } catch (cbErr) {
        console.warn('Callback error:', cbErr);
      }
    }

    closeRememberRuleModal();
    if (typeof showToast === 'function') showToast(`«${keyword}» сохранено для «${category}»`);
  } catch (err) {
    console.error('Ошибка сохранения правила:', err);
    if (typeof showToast === 'function') showToast('Ошибка при сохранении: ' + err.message, true);
  }
}

// -------------------------------------------------------------
// РЕДАКТОР СЛОВАРЯ КАТЕГОРИЙ (ШЕСТЕРЕНКА ⚙️)
// -------------------------------------------------------------
function openRulesEditorModal() {
  const dialog = document.getElementById('rules-editor-dialog');

  const allCats = [...new Set([...getActiveCategories('Расход'), ...getActiveCategories('Доход')])];
  
  populateModalCatMenu('editor', allCats, 'Продукты');

  document.getElementById('editor-keyword-input').value = '';
  renderRulesList();
  dialog.classList.remove('hidden');
}

function closeRulesEditorModal() {
  const dialog = document.getElementById('rules-editor-dialog');
  if (dialog) dialog.classList.add('hidden');
  window._returnToProfile = false;
}

function renderRulesList() {
  const container = document.getElementById('editor-rules-list');
  const rules = window.Cache?.categoryRules || [];

  if (rules.length === 0) {
    container.innerHTML = `
      <div class="py-8 text-center bg-[#12151C] rounded-2xl border border-[rgba(255,255,255,0.04)]">
        <i data-lucide="book-open" class="w-8 h-8 text-[#848D99] mx-auto mb-2 opacity-50"></i>
        <p class="text-xs text-gray-400 font-medium">В словаре пока нет правил</p>
        <p class="text-[10px] text-[#848D99] mt-0.5">Добавьте ключевые слова магазинов выше</p>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: container });
    return;
  }

  const grouped = {};
  rules.forEach(r => {
    const cat = r.category || 'Другое';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(r);
  });

  let html = '';
  Object.keys(grouped).sort().forEach(cat => {
    const catIcon = getDynamicCategoryIcon(cat);
    html += `
      <div class="bg-[#12151C] border border-[rgba(255,255,255,0.04)] rounded-2xl p-3.5 space-y-2.5">
        <div class="flex items-center justify-between border-b border-[rgba(255,255,255,0.04)] pb-2">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-lg bg-[#181B24] border border-[rgba(255,255,255,0.06)] text-[#848D99] flex items-center justify-center flex-shrink-0">
              <i data-lucide="${catIcon}" class="w-3.5 h-3.5"></i>
            </div>
            <span class="text-xs font-bold text-gray-200">${escapeHtml(cat)}</span>
          </div>
          <span class="text-[10px] font-mono text-[#848D99] px-2 py-0.5 rounded-md bg-[#181B24] border border-[rgba(255,255,255,0.04)]">${grouped[cat].length} шт</span>
        </div>
        <div class="flex flex-wrap gap-1.5">
    `;

    grouped[cat].forEach(r => {
      const isCustom = !r.isSystem;
      html += `
        <span class="inline-flex items-center gap-1.5 ${isCustom ? 'bg-[#6C5DD3]/15 text-white border border-[#6C5DD3]/30' : 'bg-[#181B24] text-gray-300 border border-[rgba(255,255,255,0.06)]'} text-[11px] px-2.5 py-1 rounded-xl transition-all">
          <span class="font-medium">${escapeHtml(r.pattern)}</span>
          <button type="button" onclick="deleteRuleFromEditor('${r.id}', ${r.isSystem ? 'true' : 'false'}, '${escapeHtml(r.pattern)}')" class="text-gray-500 hover:text-[#FF453A] cursor-pointer p-0.5 transition-colors" title="Удалить фразу">
            <i data-lucide="x" class="w-3 h-3"></i>
          </button>
        </span>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: container });
}

async function addRuleFromEditor() {
  const input = document.getElementById('editor-keyword-input');
  const keyword = input.value.trim();
  const category = document.getElementById('editor-category-input').value;

  if (!keyword) {
    showToast('Введите слово или фразу', true);
    return;
  }

  try {
    const col = window.getUserCol ? getUserCol('CategoryRules') : db.collection('CategoryRules');

    // Если слово ранее было подавлено, удаляем маркер disabled
    const snap = await col.where('pattern', '==', keyword).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));

    const newDocRef = col.doc();
    batch.set(newDocRef, { pattern: keyword, category: category });
    await batch.commit();

    if (!window.Cache.categoryRules) window.Cache.categoryRules = [];
    window.Cache.categoryRules = window.Cache.categoryRules.filter(r => r.pattern.toLowerCase() !== keyword.toLowerCase());
    window.Cache.categoryRules.push({ id: newDocRef.id, pattern: keyword, category: category, isSystem: false });

    input.value = '';
    renderRulesList();
    applyRulesToOpenedStatement(keyword, category);
  } catch (e) {
    showToast('Ошибка: ' + e.message, true);
  }
}

async function deleteRuleFromEditor(ruleId, isSystem, pattern) {
  try {
    const col = window.getUserCol ? getUserCol('CategoryRules') : db.collection('CategoryRules');

    if (isSystem) {
      // Для системных правил фиксируем подавление
      await col.add({ pattern: pattern, disabled: true });
    } else {
      // Для пользовательских правил удаляем документ
      await col.doc(ruleId).delete();
    }

    const normTarget = StatementCategorizer.normalize(pattern);
    window.Cache.categoryRules = (window.Cache.categoryRules || []).filter(r => r.id !== ruleId && StatementCategorizer.normalize(r.pattern) !== normTarget);
    renderRulesList();
  } catch (e) {
    showToast('Ошибка удаления: ' + e.message, true);
  }
} 

async function restoreDefaultRules() {
  try {
    const col = window.getUserCol ? getUserCol('CategoryRules') : db.collection('CategoryRules');
    const snap = await col.where('disabled', '==', true).get();
    if (!snap.empty) {
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    if (typeof fetchAllData === 'function') {
      await fetchAllData();
    }
    renderRulesList();
    showToast('Системные правила восстановлены');
  } catch (e) {
    showToast('Ошибка восстановления: ' + e.message, true);
  }
}
window.restoreDefaultRules = restoreDefaultRules;

// Пересчитывает категории в открытой выписке при добавлении нового правила
function applyRulesToOpenedStatement(keyword, category) {
  if (!window._lastParsedTransactions || !Array.isArray(window._lastParsedTransactions) || window._lastParsedTransactions.length === 0) return;
  const kw = (keyword || '').trim().toLowerCase();
  if (!kw) return;
  const normKw = (typeof StatementCategorizer !== 'undefined') ? StatementCategorizer.normalize(kw) : kw;
  const finalIcon = getDynamicCategoryIcon(category);

  window._lastParsedTransactions.forEach(t => {
    const full = `${t.merchant || ''} ${t.rawDetails || ''} ${t.comment || ''} ${t.description || ''}`.toLowerCase();
    const normFull = (typeof StatementCategorizer !== 'undefined') ? StatementCategorizer.normalize(full) : full;
    if (full.includes(kw) || (normKw && normFull.includes(normKw)) || (normKw && full.includes(normKw))) {
      t.category = category;
      t.categoryIcon = finalIcon;
    }
  });
  renderFilteredRows(window._lastParsedTransactions);
  if (typeof window._updateHeaderSummary === 'function') window._updateHeaderSummary();
}

// Функции для кастомных меню в модальных окнах
function toggleModalCatMenu(type) {
  const menu = document.getElementById(`${type}-category-menu`);
  if (!menu) return;
  const isClosed = menu.classList.contains('hidden');
  
  // Закрываем все открытые меню
  document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
  
  if (isClosed) menu.classList.remove('hidden');
}

function selectModalCat(type, catName, catIcon) {
  const input = document.getElementById(`${type}-category-input`);
  const label = document.getElementById(`${type}-category-label`);
  const menu = document.getElementById(`${type}-category-menu`);

  if (input) input.value = catName;
  if (label) {
    label.innerHTML = `<i data-lucide="${catIcon || 'tag'}" class="w-4 h-4 inline-block mr-1 align-text-bottom"></i> ${escapeHtml(catName)}`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    label.classList.remove('text-gray-400');
    label.classList.add('text-white');
  }
  if (menu) menu.classList.add('hidden');
}

// Универсальная функция генерации списка для модального меню
function populateModalCatMenu(type, categories, selectedCat) {
  const menu = document.getElementById(`${type}-category-menu`);
  const input = document.getElementById(`${type}-category-input`);
  const label = document.getElementById(`${type}-category-label`);
  if (!menu) return;

  const defaultCat = selectedCat || categories[0] || 'Другое';
  const defaultIcon = getDynamicCategoryIcon(defaultCat);

  if (input) input.value = defaultCat;
  if (label) {
    label.innerHTML = `<i data-lucide="${defaultIcon}" class="w-4 h-4 inline-block mr-1 align-text-bottom"></i> ${escapeHtml(defaultCat)}`;
    label.classList.remove('text-gray-400');
    label.classList.add('text-white');
  }

  menu.innerHTML = categories.map(cat => {
    const icon = getDynamicCategoryIcon(cat);
    const isSelected = (cat === defaultCat);
    return `
      <button type="button" 
              onclick="selectModalCat('${type}', '${escapeHtml(cat)}', '${icon}')" 
              class="w-full text-left px-3 py-2 text-[13px] rounded-xl transition-colors flex items-center gap-2.5 cursor-pointer ${isSelected ? 'bg-[#6C5DD3]/15 text-[#6C5DD3] font-semibold' : 'text-gray-300 hover:bg-[#2A2D3C]'}">
        <i data-lucide="${icon}" class="w-4 h-4 ${isSelected ? 'text-[#6C5DD3]' : 'text-[#848D99]'}"></i>
        <span class="truncate">${escapeHtml(cat)}</span>
      </button>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Глобальное закрытие любых открытых кастомных меню при клике в любое место мимо
document.addEventListener('click', (e) => {
  const target = (e?.target?.nodeType === 3) ? e.target.parentElement : e?.target;
  if (target && typeof target.closest === 'function') {
    if (!target.closest('.custom-dropdown-wrap')) {
      document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
    }
    const filePicker = document.getElementById('statement-file-picker-popup');
    const fileBtn = document.getElementById('btn-open-statement-file');
    if (filePicker && !filePicker.classList.contains('hidden')) {
      if (!filePicker.contains(target) && !fileBtn?.contains(target)) {
        filePicker.classList.add('hidden');
      }
    }
    const rawTooltip = document.getElementById('raw-tx-tooltip');
    if (rawTooltip && !rawTooltip.classList.contains('hidden')) {
      if (!rawTooltip.contains(target) && !target.closest('.card-parsed-row')) {
        hideRawTxTooltip();
      }
    }
  }
});

window.renderParsedTransactionsView = renderParsedTransactionsView;
window.renderFilteredRows = renderFilteredRows;
window.refreshStatementImportCategories = refreshStatementImportCategories;
window.setBankFilter = setBankFilter;
window.openRememberRuleModal = openRememberRuleModal;
window.openRememberRuleCustom = openRememberRuleCustom;
window.closeRememberRuleModal = closeRememberRuleModal;
window.saveCategoryRuleFromModal = saveCategoryRuleFromModal;
window.toggleModalCatMenu = toggleModalCatMenu;
window.selectModalCat = selectModalCat;
window.isTransactionDuplicate = isTransactionDuplicate;
window.checkTransactionDuplicateWithDetails = checkTransactionDuplicateWithDetails;
window.getImportedLargeExpenses = getImportedLargeExpenses;
window.openStatementLargeExpensesModal = openStatementLargeExpensesModal;
window.closeStatementLargeExpensesModal = closeStatementLargeExpensesModal;
window.renderStatementLargeList = renderStatementLargeList;
window.toggleStmtLargeItem = toggleStmtLargeItem;
window.changeStmtLargeMonths = changeStmtLargeMonths;
window.updateStmtLargeSummary = updateStmtLargeSummary;
window.submitStatementLargeExpenses = submitStatementLargeExpenses;
window.UniversalStatementParser = UniversalStatementParser;
window.StatementDispatcher = StatementDispatcher;
window.FORCE_UNIVERSAL_PARSER = FORCE_UNIVERSAL_PARSER;
window.handleCardPointerDown = handleCardPointerDown;
window.handleCardPointerMove = handleCardPointerMove;
window.handleCardPointerUp = handleCardPointerUp;
window.handleCardPointerCancel = handleCardPointerCancel;
window.showRawTxTooltip = showRawTxTooltip;
window.hideRawTxTooltip = hideRawTxTooltip;
window.formatFileSize = formatFileSize;
window.handleOpenStatementFileClick = handleOpenStatementFileClick;
window.toggleStatementFilePicker = toggleStatementFilePicker;
window.openStatementViewerByIndex = openStatementViewerByIndex;
window.openStatementFileDirectly = openStatementFileDirectly;
window.extractDeviceField = extractDeviceField;
window.extractWebsiteLink = extractWebsiteLink;

