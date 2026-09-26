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
  const cats = window.Cache?.categories;
  if (cats) {
    const all = [...(cats.expense || []), ...(cats.income || [])];
    const found = all.find(c => c.name === catName);
    if (found && found.icon && found.icon !== '📦') return found.icon;
  }
  return 'tag'; // Глобальный вектор-дефолт, вместо эмодзи коробки
}

// -------------------------------------------------------------
// 3. УНИВЕРСАЛЬНЫЙ ОПРЕДЕЛИТЕЛЬ (И ДОХОДЫ, И РАСХОДЫ ИЗ FIREBASE)
// -------------------------------------------------------------
class StatementCategorizer {
  static normalize(str) {
    if (!str) return '';

    // 1. Приведение к нижнему регистру и нормализация буквы ё
    let s = String(str).toLowerCase().replace(/ё/g, 'е');

    // 2. Транслитерация кириллицы в латиницу по стандарту банковских терминалов
    const ruToEn = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e',
      'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l',
      'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's',
      'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch',
      'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e',
      'ю': 'yu', 'я': 'ya'
    };

    s = s.replace(/[а-я]/g, char => ruToEn[char] !== undefined ? ruToEn[char] : char);

    // 3. Фонетическая гармонизация латиницы и англо-русских брендов
    s = s
      .replace(/ck/g, 'k')
      .replace(/c([eiy])/g, 's$1')     // cinema -> sinema, city -> siti
      .replace(/c/g, 'k')              // rostics -> rostiks, cafe -> kafe, cofix -> kofiks
      .replace(/q/g, 'k')
      .replace(/x/g, 'ks')             // taxi -> taksi, yandex -> yandeks
      .replace(/w/g, 'v')             // wildberries -> vildberries
      .replace(/ph/g, 'f')            // pharmacy -> farmacy
      .replace(/ia/g, 'ya')           // piaterochka -> pyaterochka
      .replace(/iu/g, 'yu')
      .replace(/shch/g, 'sh')
      .replace(/sch/g, 'sh')
      .replace(/tc/g, 'ts')
      .replace(/tz/g, 'ts')
      .replace(/ee/g, 'i')            // befree -> befri
      .replace(/oo/g, 'u')
      .replace(/y(?![aeiou])/g, 'i'); // dixy -> diksi, city -> siti

    // 4. Схлопывание двойных согласных (coffee -> kofi, fitness -> fitnes, vkusvill -> vkusvil)
    s = s.replace(/([b-df-hj-np-tv-z])\1+/g, '$1');

    // 5. Очистка спецсимволов и дублирующихся пробелов
    s = s.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

    return s;
  }

  static categorize(merchant, rawDetails, type) {
    const rawText = `${merchant} ${rawDetails}`;
    const normText = this.normalize(rawText);
    const normTextNoSpaces = normText.replace(/\s+/g, '');

    const rules = window.Cache?.categoryRules?.length
      ? window.Cache.categoryRules
      : (window.DEFAULT_CATEGORY_RULES || []);

    const allowedCategories = getActiveCategories(type);

    for (const rule of rules) {
      if (!rule.pattern || !rule.category) continue;
      if (!allowedCategories.includes(rule.category)) continue;

      if (this._matches(normText, normTextNoSpaces, rule.pattern)) {
        return rule.category;
      }
    }

    return allowedCategories.includes('Другое') ? 'Другое' : (allowedCategories[0] || 'Другое');
  }

  static _matches(normText, normTextNoSpaces, rawPattern) {
    const normPat = this.normalize(rawPattern);
    if (!normPat) return false;

    // Для коротких паттернов (<= 4 символов) строго проверяем границы слов
    if (normPat.length <= 4) {
      const escaped = normPat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);
      return regex.test(normText);
    }

    // 1. Прямой поиск в нормализованном тексте
    if (normText.includes(normPat)) return true;

    // 2. Поиск без пробелов (например: "vkus vill" находит "vkusvill", "burger king" находит "burgerking")
    const normPatNoSpaces = normPat.replace(/\s+/g, '');
    if (normPatNoSpaces.length >= 5 && normTextNoSpaces.includes(normPatNoSpaces)) {
      return true;
    }

    return false;
  }
}
window.StatementCategorizer = StatementCategorizer;

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
    .replace(/продолжение\s*(на\s*)?(след(ующей|ующем|ующих|\.))?\s*(страниц[еаы]|листе|стр\.?|таблицы|выписки)?(\.{3})?/gi, '')
    .replace(/окончание\s+таблицы/gi, '')
    .replace(/(страница|стр\.?|лист)\s*\d+(\s*из\s*\d+)?/gi, '')
    .replace(/\b(с уважением|начальник отдела|руководитель|главный бухгалтер|исходящий остаток|итого списаний|итого зачислений|яндекс банк|ао «яндекс банк»|ул\.\s*садовническая|yabank\.yandex\.ru).*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
window.cleanMerchantTitle = cleanMerchantTitle;

/**
 * ЕДИНЫЙ ДВИЖОК: собирает строки в блоки, проверяет переводы и нормализует данные
 */
class UniversalStatementParser {
  static parse(rawLines, config) {
    const rawBlocks = [];
    let currentBlock = null;

    for (let line of rawLines) {
      line = line.trim();
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

      if (config.isTxStart(line)) {
        if (currentBlock) rawBlocks.push(currentBlock);
        currentBlock = [line];
      } else if (currentBlock) {
        currentBlock.push(line);
      }
    }
    if (currentBlock) rawBlocks.push(currentBlock);

    return rawBlocks.map(block => this._processBlock(block, config)).filter(Boolean);
  }

  static _processBlock(lines, config) {
    // Извлекаем поля через правила конкретного банка
    const data = config.extract(lines);
    if (!data || !data.date || !data.amount) return null;

    const fullText = lines.join(' ');
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
    const category = StatementCategorizer.categorize(merchant, `${data.hint || ''} ${fullText}`, data.type);

    return {
      date: isoDate,
      displayDate: data.date,
      type: data.type,
      amount: data.amount,
      merchant: merchant,
      category: category,
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

  static _isTableEndOrFooter(line, config) {
    if (!line) return false;
    const l = line.toLowerCase();
    const markers = [
      'исходящий остаток',
      'входящий остаток',
      'итого списаний',
      'итого зачислений',
      'итого операций',
      'итого оборотов',
      'всего списано',
      'всего зачислено',
      'всего поступлений',
      'всего операций',
      'остаток на конец',
      'остаток на начало',
      'обороты за период',
      'с уважением',
      'начальник отдела',
      'начальник управления',
      'руководитель',
      'главный бухгалтер',
      'генеральный директор',
      'е.в. самохвалова',
      'самохвалова',
      'сопровождения кредитов',
      'акционерное общество «яндекс банк»',
      'ао «яндекс банк»',
      'ул. садовническая',
      'yabank.yandex.ru',
      'welcome@bank.yandex.ru',
      'лицензия банка россии',
      'генеральная лицензия',
      'оттиск печати',
      'подпись'
    ];
    return markers.some(m => l.includes(m));
  }

  static _isServiceLine(line, config) {
    const l = line.toLowerCase();
    const isCommon = Array.isArray(COMMON_SERVICE_LINES) && COMMON_SERVICE_LINES.some(kw => l.includes(kw));
    const isCustom = (config && typeof config.isServiceLine === 'function') ? config.isServiceLine(l) : false;
    return isCommon || isCustom;
  }
}

// =============================================================
// 2. РЕЕСТР БАНКОВ (КАЖДЫЙ БАНК — ПРОСТОЙ ОБЪЕКТ НАСТРОЕК)
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
    isTxStart: (l) => /\d{2}\.\d{2}\.\d{4}/.test(l) && /[\d\s\xa0]+[.,]\d{2}\s*₽/.test(l),
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
    extract: (lines) => {
      const first = lines[0];
      const dMatch = first.match(/\d{2}\.\d{2}\.\d{4}/);
      const amounts = first.match(/([+−–—\-\u2012\u2013\u2014\u2212]?\s*[\d\s\xa0]+[.,]\d{2})\s*₽/g) || [];
      const raw = amounts[0] || '0';
      const type = raw.includes('+') ? 'Доход' : 'Расход';

      let part1 = first.split(/\d{2}\.\d{2}\.\d{4}/)[0].replace(/^Оплата товаров и услуг\s*/i, '').trim();
      let part2 = lines.slice(1)
        .filter(l => !UniversalStatementParser._isTableEndOrFooter(l, null))
        .map(l => l.replace(/в\s+\d{2}:\d{2}/i, '').replace(/\d{2}\.\d{2}\.\d{4}/g, '').replace(/\*\d{4}/g, '').replace(/[\d\s\xa0]+[.,]\d{2}\s*₽/g, '').trim())
        .filter(Boolean)
        .join(' ');
      let merchant = `${part1} ${part2}`.replace(/^Оплата товаров и услуг\s*/i, '').replace(/\b(операции|обработки|договора|мск|карты|валюте)\b/gi, '').replace(/\s+/g, ' ').trim() || 'Операция Яндекс Банк';

      return { date: dMatch[0], amount: cleanAmount(raw), type, merchant };
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
    isTxStart: (l) => /^(\d{2}\.\d{2}\.\d{4})\s+(\d{2}\.\d{2}\.\d{4})/.test(l),
    extract: (lines) => {
      const first = lines[0];
      const dMatch = first.match(/^(\d{2}\.\d{2}\.\d{4})/);
      const amounts = first.match(/([+-]?\s*[\d\s]+[.,]\d{2})/g) || [];
      let inc = 0, exp = 0;
      if (amounts.length >= 2) {
        inc = cleanAmount(amounts[amounts.length - 2]);
        exp = cleanAmount(amounts[amounts.length - 1]);
      } else if (amounts.length === 1) {
        exp = cleanAmount(amounts[0]);
      }
      const type = (exp === 0 && inc > 0) ? 'Доход' : 'Расход';
      const amount = type === 'Доход' ? inc : exp;

      const full = lines.join(' ');
      const dev = full.match(/Устройство:\s*([^.]+?)(?:\.\s*Город|\.\s*Сумма|\.|$)/i);
      const sbp = full.match(/Перевод\s+(?:по\s+СБП|клиенту|от)\s+([^.]+?)(?:\.|$)/i);
      let merchant = dev ? dev[1].trim() : (sbp ? sbp[0].trim() : first.replace(/^(\d{2}\.\d{2}\.\d{4}\s*){1,2}/, '').replace(/([+-]?\s*[\d\s]+[.,]\d{2})/g, '').replace(/Операция:\s*/i, '').trim());

      return { date: dMatch[1], amount, type, merchant };
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
      else if (p.includes('сбербанк')) score += 5;
      if (p.includes('sberbank.ru') || p.includes('sber.ru')) score += 5;
      if (p.includes('отчет по счету') || p.includes('выписка по счету дебетовой карты') || p.includes('выписка по счету карты')) score += 4;
      return score;
    },
    detect: function(p) { return this.getScore(p) >= 5; },
    isTxStart: (l) => /^(\d{2}\.\d{2}\.\d{4})\s+\d{2}:\d{2}/.test(l) && !/^\d{2}\.\d{2}\.\d{4}\s+\d{6}/.test(l),
    extract: (lines) => {
      const first = lines[0];
      const dMatch = first.match(/^(\d{2}\.\d{2}\.\d{4})/);
      const after = first.replace(/^(\d{2}\.\d{2}\.\d{4})\s+\d{2}:\d{2}\s+/, '');
      const amounts = after.match(/([+-]?\s*[\d\s]+[.,]\d{2})/g) || [];
      const rawAmount = amounts[0] || '0';
      const type = rawAmount.includes('+') ? 'Доход' : 'Расход';

      let sberCat = after;
      amounts.forEach(a => sberCat = sberCat.replace(a, ''));
      sberCat = sberCat.trim();

      let merchant = sberCat;
      if (lines.length > 1) {
        let desc = lines[1].replace(/^\d{2}\.\d{2}\.\d{4}\s+\d+\s*/, '')
                           .replace(/\.?\s*(Операция|Перевод)\s+по.*$/i, '')
                           .trim();
        if (desc) merchant = desc;
      }
      return { date: dMatch[1], amount: cleanAmount(rawAmount), type, merchant, hint: sberCat };
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
    isTxStart: (l) => /^\d{2}\.\d{2}\.\d{4}/.test(l),
    extract: (lines) => {
      const first = lines[0];
      const dMatch = first.match(/(\d{2}\.\d{2}\.\d{4})/);
      const full = lines.join(' ');
      const amounts = full.match(/([+−–—\-\u2012\u2013\u2014\u2212]\s*[\d\s\xa0]+[.,]\d{2})/g) || [];
      const raw = amounts[0] || '0';
      const type = raw.includes('+') ? 'Доход' : 'Расход';

      let merchant = 'Операция Озон Банк';
      const pos = full.match(/(?:сумма\s*[\d.]+\s*в|\bв)\s+([\s\S]+?)\s+дата\s*\d{4}/i);
      if (pos && pos[1].trim()) {
        merchant = pos[1].replace(/\s+(RU|RUS)$/i, '').replace(/\s+/g, ' ').trim();
      } else if (/выплата\s+к[еэ]шб[еэ]ка/i.test(full)) {
        merchant = 'Кэшбек Ozon';
      } else if (/возврат/i.test(full)) {
        const o = full.match(/заказ\s*№?\s*([0-9a-zA-Z-]+)/i);
        merchant = o ? `Возврат Ozon (${o[0]})` : 'Возврат покупки';
      } else if (/ozon\s*travel/i.test(full)) {
        const o = full.match(/заказ\s*№?\s*([0-9a-zA-Z-]+)/i);
        merchant = o ? `Ozon Travel (${o[0]})` : 'Ozon Travel';
      } else if (/платформе\s+ozon|оплата.*ozon/i.test(full)) {
        const o = full.match(/заказ\s*№?\s*([0-9a-zA-Z-]+)/i);
        merchant = o ? `Ozon (${o[0]})` : 'Ozon';
      } else if (/перевод.*сбп/i.test(full)) {
        const s = full.match(/(?:Отправитель|Получатель):\s*([^.]*?)(?:Без НДС|$)/i);
        merchant = s ? `Перевод СБП (${s[1].trim()})` : 'Перевод через СБП';
      }

      return { date: dMatch[1], amount: cleanAmount(raw), type, merchant };
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
        (/\d{2}\.\d{2}\.\d{4}/.test(line) && /[\d\s\xa0]+[.,]\d{2}/.test(line))
      ) {
        cutoffIndex = Math.max(i, 8);
        break;
      }
    }

    return rawLines.slice(0, cutoffIndex).join(' ').toLowerCase();
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

    if (!bestBank || maxScore < 5) {
      const supported = BANK_REGISTRY.map(b => b.name).join(', ');
      throw new Error(`Не удалось определить банк выписки. Поддерживаются: ${supported}.`);
    }

    const transactions = UniversalStatementParser.parse(rawLines, bestBank);
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
      parsedResults.push({
        file,
        fileName: file.name,
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

  // 1. Проверка на дубликат внутри текущего пакета импортируемых файлов (например, повторные или пересекающиеся выписки)
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
      if (prevIsoDate && txIsoDate && prevIsoDate === txIsoDate) {
        const prevNormMerchant = cleanMerchantForCompare(prevTx.merchant || prevTx.comment || prevTx.description || '');
        if (!normTxMerchant || !prevNormMerchant || normTxMerchant === prevNormMerchant || normTxMerchant.includes(prevNormMerchant) || prevNormMerchant.includes(normTxMerchant)) {
          return { isDuplicate: true, reason: 'Повтор в файле' };
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
    const amountColor = isInactive ? 'text-gray-500 font-medium' : (isExp ? 'text-white font-bold' : 'text-[#30D158] font-bold');
    const cats = isExp ? expenseCategories : incomeCategories;
    const currentIcon = getDynamicCategoryIcon(tx.category);
    const bankIconKey = tx.bankIconKey || 'generic';

    html += `
      <!-- Просторная 2-уровневая строка (мерчант на всю строку, дата, банк и чипс снизу) -->
      <div class="card-parsed-row bg-[#181B24] border border-[rgba(255,255,255,0.06)] px-3.5 py-2.5 rounded-2xl flex flex-col gap-1.5 transition-all relative cursor-pointer ${isInactive ? 'bg-[#12151C]' : 'hover:border-[rgba(255,255,255,0.12)]'}" 
           id="card-tx-${tx._id}" 
           data-is-inactive="${isInactive}"
           onclick="handleCardRowClick(event, '${tx._id}')"
           style="${isInactive ? 'opacity: 0.55;' : ''}">
        
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
              <span class="text-[13px] ${isInactive ? 'text-gray-400 font-normal' : 'text-gray-100 font-semibold'} truncate leading-tight" title="${escapeHtml(tx.merchant)}">
                ${escapeHtml(tx.merchant)}
              </span>
              ${tx.isTransfer ? '<span class="text-[9px] font-bold text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/40 flex-shrink-0 whitespace-nowrap ml-auto">Перевод</span>' : ''}
              ${tx.isDuplicate ? `<span class="text-[9px] font-bold text-gray-400 bg-gray-800/80 px-1.5 py-0.5 rounded border border-gray-700/60 flex-shrink-0 whitespace-nowrap ml-auto" title="${escapeHtml(tx.duplicateReason || 'В базе')}">${escapeHtml(tx.duplicateReason || 'В базе')}</span>` : ''}
            </div>
          </div>

          <span class="text-[14px] ${amountColor} font-mono font-semibold flex-shrink-0 ml-2 whitespace-nowrap">
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
            <div class="relative custom-dropdown-wrap" id="cat-wrap-${tx._id}">
              <button type="button" 
                      onclick="toggleImportCatMenu('${tx._id}')" 
                      id="cat-btn-${tx._id}"
                      class="w-[130px] bg-[#212430] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.15)] text-[#F2F4F7] text-[11px] font-medium rounded-full px-2.5 py-1 flex items-center justify-between outline-none transition-colors cursor-pointer flex-shrink-0">
                <span id="cat-label-${tx._id}" class="truncate flex items-center gap-1.5 min-w-0 pr-1">
                  <i data-lucide="${currentIcon}" class="w-3.5 h-3.5 text-[#848D99] flex-shrink-0"></i> 
                  <span class="truncate">${escapeHtml(tx.category)}</span>
                </span>
                <i data-lucide="chevron-down" class="w-3 h-3 text-gray-500 flex-shrink-0"></i>
              </button> 
              
              <div id="cat-menu-${tx._id}" 
                   class="custom-dropdown-menu hidden absolute right-0 bottom-full mb-1.5 w-52 max-h-60 overflow-y-auto bg-[#181B24] border border-[rgba(255,255,255,0.08)] rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.85)] z-50 p-1.5 space-y-0.5">
                ${cats.map(cat => {
                  const isCustom = !DEFAULT_SYSTEM_CATEGORIES.includes(cat);
                  const loopIcon = getDynamicCategoryIcon(cat);
                  return `
                    <div class="flex items-center justify-between hover:bg-[#2A2D3C] rounded-xl px-2.5 py-1.5 transition-colors group">
                      <button type="button" 
                              onclick="selectImportCat('${tx._id}', '${escapeHtml(cat)}', '${loopIcon}')" 
                              class="flex-1 text-left text-[12px] font-medium text-gray-200 flex items-center gap-2 cursor-pointer truncate min-w-0">
                        <i data-lucide="${loopIcon}" class="w-3.5 h-3.5 text-[#848D99]"></i>
                        <span class="truncate">${escapeHtml(cat)}</span>
                      </button>
                      ${isCustom ? `
                        <button type="button" onclick="event.stopPropagation(); deleteCategoryFromImport('${escapeHtml(cat)}', '${tx.type}')" class="text-gray-500 hover:text-[#FF453A] p-1 flex-shrink-0 cursor-pointer"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                      ` : ''}
                    </div>
                  `;
                }).join('')}

                <div class="border-t border-[rgba(255,255,255,0.06)] pt-1 mt-1">
                  <button type="button" onclick="event.stopPropagation(); addCategoryFromImport('${tx.type}', '${tx._id}')" class="w-full text-left px-2 py-1.5 text-[12px] text-[#8C7DFF] hover:text-white hover:bg-[#6C5DD3]/15 rounded-lg flex items-center gap-1.5 font-semibold cursor-pointer transition-colors">
                    <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                    <span>Добавить категорию</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Кнопка булавка закрепления правила с тактильным эффектом -->
            <button type="button" 
                    onclick="openRememberRuleModal('${tx._id}')" 
                    class="w-7 h-7 rounded-xl bg-[#6C5DD3]/15 hover:bg-[#6C5DD3]/25 active:scale-90 text-[#8C7DFF] hover:text-white border border-[#6C5DD3]/25 flex items-center justify-center flex-shrink-0 cursor-pointer transition-all shadow-sm group" 
                    title="Запомнить в словарь категорий">
              <i data-lucide="pin" class="w-3.5 h-3.5 transition-transform group-hover:scale-110"></i>
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
  if (typeof renderBankIcons === 'function') renderBankIcons();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleImportCatMenu(txId) {
  const menu = document.getElementById(`cat-menu-${txId}`);
  const btn = document.getElementById(`cat-btn-${txId}`);
  const card = document.getElementById(`card-tx-${txId}`);
  if (!menu || !btn) return;

  const isClosed = menu.classList.contains('hidden');
  
  // Закрываем все открытые меню и возвращаем исходную прозрачность карточкам
  document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
  document.querySelectorAll('.card-parsed-row').forEach(c => {
    c.style.zIndex = '';
    if (c.dataset.isInactive === 'true') {
      c.style.opacity = '0.55';
    }
  });

  if (isClosed) {
    // Поднимаем z-index и убираем полупрозрачность на время работы с меню
    if (card) {
      card.style.zIndex = '60';
      card.style.opacity = '1';
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
  if (tx) {
    tx.category = newCat;
    const labelEl = document.getElementById(`cat-label-${txId}`);
    if (labelEl) {
      labelEl.innerHTML = `<i data-lucide="${icon}" class="w-[14px] h-[14px]"></i> ${escapeHtml(newCat)}`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }
  const menu = document.getElementById(`cat-menu-${txId}`);
  if (menu) menu.classList.add('hidden');
  const card = document.getElementById(`card-tx-${txId}`);
  if (card) card.style.zIndex = '';
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

/**
 * Клик по карточке транзакции (переключает выбор, игнорируя клики по кнопкам, чипсу категории и меню)
 */
function handleCardRowClick(event, txId) {
  const target = (event?.target?.nodeType === 3) ? event.target.parentElement : event?.target;
  if (!target) return;

  // Игнорируем клики по интерактивным элементам внутри карточки:
  // кнопкам, ссылкам, инпутам, дропдаунам и кнопке пина
  if (target.closest('button') || target.closest('input') || target.closest('.custom-dropdown-wrap') || target.closest('.custom-dropdown-menu')) {
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
  const threshold = (typeof getLargeExpenseThreshold === 'function') ? getLargeExpenseThreshold() : Infinity;
  if (!isFinite(threshold) || threshold <= 0) return [];

  return (transactions || []).filter(tx => {
    // Только расходы
    const isExp = (tx.type === 'expense' || tx.type === 'Расход' || (tx.type !== 'income' && tx.type !== 'Доход' && tx.amount < 0));
    if (!isExp) return false;

    const amt = Math.abs(parseFloat(tx.amount) || 0);
    if (amt < threshold) return false;

    // Исключаем транзакции за уже закрытые месяца
    const pDate = (typeof parseAnyDate === 'function') ? parseAnyDate(tx.date) : new Date(tx.date);
    if (pDate && typeof isBudgetMonthClosed === 'function') {
      if (isBudgetMonthClosed(pDate.getFullYear(), pDate.getMonth())) {
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

  let targetCats = [];
  if (tx.type === 'Доход') {
    targetCats = window.Cache?.categories?.income?.map(c => c.name) || ['Зарплата', 'Кэшбек', 'Возврат', 'Другое'];
  } else {
    targetCats = [
      'Продукты', 'Кафе и рестораны', 'Маркетплейсы', 'Транспорт', 'Жилье', 'Одежда', 'Здоровье', 'Развлечения', 'Другое'
    ];
    if (window.Cache?.categories?.expense) {
      window.Cache.categories.expense.forEach(c => {
        if (!targetCats.includes(c.name)) targetCats.push(c.name);
      });
    }
  }

  populateModalCatMenu('rule', targetCats, tx.category || 'Другое');

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

  let targetCats = [];
  const isIncome = type === 'Доход' || String(type || '').toLowerCase() === 'доход';
  if (isIncome) {
    targetCats = window.Cache?.categories?.income?.map(c => c.name) || ['Зарплата', 'Кэшбек', 'Возврат', 'Другое'];
  } else {
    targetCats = [
      'Продукты', 'Кафе и рестораны', 'Маркетплейсы', 'Транспорт', 'Жилье', 'Одежда', 'Здоровье', 'Развлечения', 'Другое'
    ];
    if (window.Cache?.categories?.expense) {
      window.Cache.categories.expense.forEach(c => {
        if (!targetCats.includes(c.name)) targetCats.push(c.name);
      });
    }
  }

  const selectedCat = (category && category !== 'Категория...' && targetCats.includes(category)) ? category : (targetCats[0] || 'Продукты');
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

    if (window._lastParsedTransactions) {
      window._lastParsedTransactions.forEach(t => {
        const full = `${t.merchant || ''} ${t.rawDetails || ''}`.toLowerCase();
        if (full.includes(keyword.toLowerCase())) {
          t.category = category;
          const sel = document.getElementById(`cat-select-${t._id}`);
          if (sel) sel.value = category;
        }
      });
    }

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
  if (!window._lastParsedTransactions) return;
  window._lastParsedTransactions.forEach(t => {
    const full = `${t.merchant} ${t.rawDetails}`.toLowerCase();
    if (full.includes(keyword.toLowerCase())) {
      t.category = category;
      const sel = document.getElementById(`cat-select-${t._id}`);
      if (sel) sel.value = category;
    }
  });
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
  if (target && typeof target.closest === 'function' && !target.closest('.custom-dropdown-wrap')) {
    document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
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

