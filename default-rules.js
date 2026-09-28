/**
 * default-rules.js
 * Базовый словарь правил автоопределения категорий.
 * Все слова автоматически нормализуются: совпадения находят и русский, и транслит.
 */

const DEFAULT_CATEGORY_RULES = [
  // 1. ПРОДУКТЫ И СУПЕРМАРКЕТЫ
  { pattern: "перекресток", category: "Продукты" },
  { pattern: "perek", category: "Продукты" },
  { pattern: "пятерочка", category: "Продукты" },
  { pattern: "окей", category: "Продукты" },
  { pattern: "лента", category: "Продукты" },
  { pattern: "магнит", category: "Продукты" },
  { pattern: "красное и белое", category: "Продукты" },
  { pattern: "фикс прайс", category: "Продукты" },
  { pattern: "дикси", category: "Продукты" },
  { pattern: "вкусвилл", category: "Продукты" },
  { pattern: "избенка", category: "Продукты" },
  { pattern: "самокат", category: "Продукты" },
  { pattern: "умный ритейл", category: "Продукты" },
  { pattern: "яндекс лавка", category: "Продукты" },
  { pattern: "купер", category: "Продукты" },
  { pattern: "сбермаркет", category: "Продукты" },
  { pattern: "ашан", category: "Продукты" },
  { pattern: "атак", category: "Продукты" },
  { pattern: "метро", category: "Продукты" },
  { pattern: "чижик", category: "Продукты" },
  { pattern: "спар", category: "Продукты" },
  { pattern: "азбука вкуса", category: "Продукты" },
  { pattern: "верный", category: "Продукты" },
  { pattern: "пекарня", category: "Продукты" },

  // 2. КАФЕ И РЕСТОРАНЫ
  { pattern: "vlavashe", category: "Кафе и рестораны" },
  { pattern: "ростикс", category: "Кафе и рестораны" },
  { pattern: "kfc", category: "Кафе и рестораны" },
  { pattern: "kimchi to go", category: "Кафе и рестораны" },
  { pattern: "му му", category: "Кафе и рестораны" },
  { pattern: "bros burritos", category: "Кафе и рестораны" },
  { pattern: "достаевский", category: "Кафе и рестораны" },
  { pattern: "нессельбек", category: "Кафе и рестораны" },
  { pattern: "dom lunda", category: "Кафе и рестораны" },
  { pattern: "крем", category: "Кафе и рестораны" },
  { pattern: "кожура", category: "Кафе и рестораны" },
  { pattern: "булочная", category: "Кафе и рестораны" },
  { pattern: "ресторан", category: "Кафе и рестораны" },
  { pattern: "варочная", category: "Кафе и рестораны" },
  { pattern: "пицца", category: "Кафе и рестораны" },
  { pattern: "бургер", category: "Кафе и рестораны" },
  { pattern: "токио сити", category: "Кафе и рестораны" },
  { pattern: "1st food factory", category: "Кафе и рестораны" },
  { pattern: "вкусно и точка", category: "Кафе и рестораны" },
  { pattern: "додо", category: "Кафе и рестораны" },
  { pattern: "бургер кинг", category: "Кафе и рестораны" },
  { pattern: "теремок", category: "Кафе и рестораны" },
  { pattern: "шоколадница", category: "Кафе и рестораны" },
  { pattern: "старбакс", category: "Кафе и рестораны" },
  { pattern: "stars coffee", category: "Кафе и рестораны" },
  { pattern: "кофикс", category: "Кафе и рестораны" },
  { pattern: "one price", category: "Кафе и рестораны" },
  { pattern: "дринкит", category: "Кафе и рестораны" },
  { pattern: "яндекс еда", category: "Кафе и рестораны" },
  { pattern: "деливери", category: "Кафе и рестораны" },
  { pattern: "кулинария", category: "Кафе и рестораны" },
  { pattern: "столовая", category: "Кафе и рестораны" },
  { pattern: "суши", category: "Кафе и рестораны" },
  { pattern: "шаурма", category: "Кафе и рестораны" },
  { pattern: "шаверма", category: "Кафе и рестораны" },
  { pattern: "кофейня", category: "Кафе и рестораны" },
  { pattern: "кофе", category: "Кафе и рестораны" },
  { pattern: "бар", category: "Кафе и рестораны" },
  { pattern: "паб", category: "Кафе и рестораны" },

  // 3. МАРКЕТПЛЕЙСЫ
  { pattern: "wb", category: "Маркетплейсы" },
  { pattern: "вайлдберриз", category: "Маркетплейсы" },
  { pattern: "озон", category: "Маркетплейсы" },
  { pattern: "яндекс маркет", category: "Маркетплейсы" },
  { pattern: "мегамаркет", category: "Маркетплейсы" },
  { pattern: "сбермегамаркет", category: "Маркетплейсы" },
  { pattern: "алиэкспресс", category: "Маркетплейсы" },
  { pattern: "авито", category: "Маркетплейсы" },
  { pattern: "казаньэкспресс", category: "Маркетплейсы" },
  { pattern: "магнит маркет", category: "Маркетплейсы" },

  // 4. ТРАНСПОРТ, АЗС И ПОЕЗДКИ
  { pattern: "ржд", category: "Транспорт" },
  { pattern: "сзппк", category: "Транспорт" },
  { pattern: "транском", category: "Транспорт" },
  { pattern: "такси", category: "Транспорт" },
  { pattern: "яндекс го", category: "Транспорт" },
  { pattern: "ситидрайв", category: "Транспорт" },
  { pattern: "делимобиль", category: "Транспорт" },
  { pattern: "каршеринг", category: "Транспорт" },
  { pattern: "яндекс драйв", category: "Транспорт" },
  { pattern: "лукойл", category: "Транспорт" },
  { pattern: "газпромнефть", category: "Транспорт" },
  { pattern: "роснефть", category: "Транспорт" },
  { pattern: "татнефть", category: "Транспорт" },
  { pattern: "тебойл", category: "Транспорт" },
  { pattern: "азс", category: "Транспорт" },
  { pattern: "бензин", category: "Транспорт" },
  { pattern: "заправка", category: "Транспорт" },
  { pattern: "метрополитен", category: "Транспорт" },
  { pattern: "мосметро", category: "Транспорт" },
  { pattern: "метро спб", category: "Транспорт" },
  { pattern: "тройка", category: "Транспорт" },
  { pattern: "подорожник", category: "Транспорт" },
  { pattern: "парковка", category: "Транспорт" },
  { pattern: "паркинг", category: "Транспорт" },
  { pattern: "моспаркинг", category: "Транспорт" },
  { pattern: "аэрофлот", category: "Транспорт" },
  { pattern: "победа", category: "Транспорт" },
  { pattern: "s7", category: "Транспорт" },
  { pattern: "авиабилеты", category: "Транспорт" },
  { pattern: "международная", category: "Транспорт" },
  { pattern: "балтийская", category: "Транспорт" },
  { pattern: "пионерская", category: "Транспорт" },
  { pattern: "технологический", category: "Транспорт" },
  { pattern: "площадь ленина", category: "Транспорт" },

  // 5. ЖИЛЬЕ, СВЯЗЬ И РЕМОНТ
  { pattern: "жкх", category: "Жилье" },
  { pattern: "квартплата", category: "Жилье" },
  { pattern: "еирц", category: "Жилье" },
  { pattern: "мособлеирц", category: "Жилье" },
  { pattern: "жкт", category: "Жилье" },
  { pattern: "коммунал", category: "Жилье" },
  { pattern: "мосэнергосбыт", category: "Жилье" },
  { pattern: "петроэлектросбыт", category: "Жилье" },
  { pattern: "энергосбыт", category: "Жилье" },
  { pattern: "водоканал", category: "Жилье" },
  { pattern: "ростелеком", category: "Жилье" },
  { pattern: "дом ру", category: "Жилье" },
  { pattern: "мтс", category: "Жилье" },
  { pattern: "билайн", category: "Жилье" },
  { pattern: "мегафон", category: "Жилье" },
  { pattern: "tele2", category: "Жилье" },
  { pattern: "t2", category: "Жилье" },
  { pattern: "йота", category: "Жилье" },
  { pattern: "леруа", category: "Жилье" },
  { pattern: "лемана", category: "Жилье" },
  { pattern: "петрович", category: "Жилье" },
  { pattern: "максидом", category: "Жилье" },
  { pattern: "всеинструменты", category: "Жилье" },

  // 6. ОДЕЖДА И ОБУВЬ
  { pattern: "zara", category: "Одежда" },
  { pattern: "befree", category: "Одежда" },
  { pattern: "лайм", category: "Одежда" },
  { pattern: "зарина", category: "Одежда" },
  { pattern: "глория", category: "Одежда" },
  { pattern: "остин", category: "Одежда" },
  { pattern: "рандеву", category: "Одежда" },
  { pattern: "спортмастер", category: "Одежда" },
  { pattern: "экко", category: "Одежда" },
  { pattern: "кари", category: "Одежда" },
  { pattern: "ламода", category: "Одежда" },
  { pattern: "колинс", category: "Одежда" },
  { pattern: "кальцедония", category: "Одежда" },
  { pattern: "интимиссими", category: "Одежда" },
  { pattern: "love republic", category: "Одежда" },
  { pattern: "sinsay", category: "Одежда" },
  { pattern: "reserved", category: "Одежда" },
  { pattern: "фамилия", category: "Одежда" },
  { pattern: "фандей", category: "Одежда" },
  { pattern: "хендерсон", category: "Одежда" },
  { pattern: "снежная королева", category: "Одежда" },
  { pattern: "tezenis", category: "Одежда" },
  { pattern: "incanto", category: "Одежда" },
  { pattern: "фин флэр", category: "Одежда" },
  { pattern: "джеокс", category: "Одежда" },
  { pattern: "стрит бит", category: "Одежда" },
  { pattern: "шоурум", category: "Одежда" },
  { pattern: "ателье", category: "Одежда" },
  { pattern: "трикотаж", category: "Одежда" },
  { pattern: "одежда", category: "Одежда" },
  { pattern: "обувь", category: "Одежда" },

  // 7. ЗДОРОВЬЕ И МЕДИЦИНА
  { pattern: "аптека", category: "Здоровье" },
  { pattern: "ригла", category: "Здоровье" },
  { pattern: "еаптека", category: "Здоровье" },
  { pattern: "горздрав", category: "Здоровье" },
  { pattern: "вита", category: "Здоровье" },
  { pattern: "планета здоровья", category: "Здоровье" },
  { pattern: "столички", category: "Здоровье" },
  { pattern: "озерки", category: "Здоровье" },
  { pattern: "невис", category: "Здоровье" },
  { pattern: "хеликс", category: "Здоровье" },
  { pattern: "инвитро", category: "Здоровье" },
  { pattern: "гемотест", category: "Здоровье" },
  { pattern: "клиника", category: "Здоровье" },
  { pattern: "стоматолог", category: "Здоровье" },
  { pattern: "стоматология", category: "Здоровье" },
  { pattern: "медси", category: "Здоровье" },
  { pattern: "скандинавия", category: "Здоровье" },
  { pattern: "евромед", category: "Здоровье" },
  { pattern: "сберздоровье", category: "Здоровье" },
  { pattern: "айкрафт", category: "Здоровье" },
  { pattern: "линзмастер", category: "Здоровье" },
  { pattern: "линзы", category: "Здоровье" },
  { pattern: "оптика", category: "Здоровье" },
  { pattern: "анализы", category: "Здоровье" },
  { pattern: "лаборатория", category: "Здоровье" },
  { pattern: "мрт", category: "Здоровье" },
  { pattern: "рентген", category: "Здоровье" },
  { pattern: "медицин", category: "Здоровье" },
  { pattern: "фитнес", category: "Здоровье" },
  { pattern: "world class", category: "Здоровье" },
  { pattern: "ddx", category: "Здоровье" },
  { pattern: "бассейн", category: "Здоровье" },

  // 8. РАЗВЛЕЧЕНИЯ И ПОДПИСКИ
  { pattern: "музей", category: "Развлечения" },
  { pattern: "хомлины", category: "Развлечения" },
  { pattern: "афиша", category: "Развлечения" },
  { pattern: "театр", category: "Развлечения" },
  { pattern: "кино", category: "Развлечения" },
  { pattern: "кинотеатр", category: "Развлечения" },
  { pattern: "синема парк", category: "Развлечения" },
  { pattern: "формула кино", category: "Развлечения" },
  { pattern: "киномакс", category: "Развлечения" },
  { pattern: "мираж", category: "Развлечения" },
  { pattern: "яндекс плюс", category: "Развлечения" },
  { pattern: "кинопоиск", category: "Развлечения" },
  { pattern: "иви", category: "Развлечения" },
  { pattern: "окко", category: "Развлечения" },
  { pattern: "премьер", category: "Развлечения" },
  { pattern: "кион", category: "Развлечения" },
  { pattern: "кассир", category: "Развлечения" },
  { pattern: "тикетлэнд", category: "Развлечения" },
  { pattern: "steam", category: "Развлечения" },
  { pattern: "playstation", category: "Развлечения" },
  { pattern: "vk play", category: "Развлечения" },

  // 9. ДОХОДЫ
  { pattern: "заработная плата", category: "Зарплата" },
  { pattern: "зарплата", category: "Зарплата" },
  { pattern: "аванс", category: "Зарплата" },
  { pattern: "отпускные", category: "Зарплата" },
  { pattern: "премия", category: "Зарплата" },
  { pattern: "материальная помощь", category: "Зарплата" },
  { pattern: "расчет при увольнении", category: "Зарплата" },
  { pattern: "компенсация", category: "Зарплата" },
  { pattern: "дивиденды", category: "Зарплата" },
  { pattern: "кешбек", category: "Кэшбек" },
  { pattern: "баллами плюса", category: "Кэшбек" },
  { pattern: "возврат", category: "Возврат" }
];

const DEFAULT_SYSTEM_CATEGORIES = [
  'Продукты', 'Кафе и рестораны', 'Маркетплейсы', 'Транспорт', 'Жилье',
  'Одежда', 'Здоровье', 'Развлечения', 'Другое', 'Зарплата', 'Возврат', 'Кэшбек'
];

if (typeof window !== 'undefined') {
  window.DEFAULT_CATEGORY_RULES = DEFAULT_CATEGORY_RULES;
  window.DEFAULT_SYSTEM_CATEGORIES = DEFAULT_SYSTEM_CATEGORIES;
}

/**
 * Интеллектуальный многофакторный движок категоризации (Weighted Multi-Tier Categorizer)
 * Поддерживает:
 * 1. Фонетическую транслитерацию и нормализацию
 * 2. Стемминг корней слов русского и английского языков (отсечение падежей и окончаний)
 * 3. Безопасный нечеткий поиск (Fuzzy Levenshtein) для защиты от опечаток (для слов >= 5 букв)
 * 4. Распознавание банковских MCC-кодов
 * 5. Взвешенный скоринг специфичности (длинные фразы побеждают короткие корни)
 * 6. Защиту от стоп-слов («магазин», «оплата», «ип», «маркет»)
 */
class StatementCategorizer {
  // Банковские MCC-коды
  static MCC_MAP = {
    '5411': 'Продукты', '5422': 'Продукты', '5441': 'Продукты', '5451': 'Продукты', '5462': 'Продукты', '5499': 'Продукты',
    '5811': 'Кафе и рестораны', '5812': 'Кафе и рестораны', '5813': 'Кафе и рестораны', '5814': 'Кафе и рестораны',
    '5300': 'Маркетплейсы', '5311': 'Маркетплейсы', '5331': 'Маркетплейсы', '5399': 'Маркетплейсы', '5999': 'Маркетплейсы',
    '4111': 'Транспорт', '4121': 'Транспорт', '4131': 'Транспорт', '4511': 'Транспорт', '4789': 'Транспорт', '5541': 'Транспорт', '5542': 'Транспорт',
    '4812': 'Жилье', '4814': 'Жилье', '4900': 'Жилье', '5200': 'Жилье', '5211': 'Жилье', '5712': 'Жилье',
    '5611': 'Одежда', '5621': 'Одежда', '5651': 'Одежда', '5661': 'Одежда', '5691': 'Одежда',
    '5912': 'Здоровье', '8011': 'Здоровье', '8021': 'Здоровье', '8049': 'Здоровье', '8062': 'Здоровье', '8071': 'Здоровье', '8099': 'Здоровье', '7997': 'Здоровье',
    '7832': 'Развлечения', '7922': 'Развлечения', '7991': 'Развлечения', '7996': 'Развлечения', '5815': 'Развлечения', '5816': 'Развлечения'
  };

  // Стоп-слова: общие слова, которые не должны перевешивать специфические бренды
  static STOP_WORDS = new Set([
    'magazin', 'oplata', 'pokupka', 'ip', 'ooo', 'market', 'kafe', 'servis',
    'tsentr', 'klub', 'onlayn', 'gorod', 'dostavka', 'retail', 'store', 'shop',
    'platezh', 'terminal', 'card', 'karta', 'schet', 'sber', 'bank'
  ]);

  /**
   * 1. Нормализация и фонетическая гармонизация
   */
  static normalize(str) {
    if (!str) return '';

    let s = String(str).toLowerCase().replace(/ё/g, 'е');

    const ruToEn = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e',
      'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l',
      'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's',
      'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch',
      'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e',
      'ю': 'yu', 'я': 'ya'
    };

    s = s.replace(/[а-я]/g, char => ruToEn[char] !== undefined ? ruToEn[char] : char);

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

    // Схлопывание двойных согласных
    s = s.replace(/([b-df-hj-np-tv-z])\1+/g, '$1');

    // Очистка спецсимволов и пробелов
    s = s.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

    return s;
  }

  /**
   * 2. Легкий эвристический стеммер (отсечение окончаний падежей и форм)
   */
  static stem(token) {
    if (!token || token.length <= 3) return token;
    let t = token;
    // Отсекаем суффиксы и окончания
    t = t.replace(/(?:ochka|echka|ochki|echki|ochke|echke|ochku|echku)$/, 'ochk');
    t = t.replace(/(?:ami|yami|akh|yakh|om|em|oy|ey|uyu|yuyu|aya|yaya|oye|eye|yie|ie|iy|yy|ov|ev|am|yam|ka|ki|ku|ke|akh|yah)$/, '');
    t = t.replace(/(?:a|e|i|o|u|y)$/, '');
    return t.length >= 3 ? t : token;
  }

  /**
   * 3. Быстрое ограниченное расстояние Левенштейна (Bounded Levenshtein)
   * Возвращает минимальное количество замен/вставок/удалений между двумя словами
   */
  static boundedLevenshtein(a, b, maxDist = 1) {
    if (a === b) return 0;
    const la = a.length;
    const lb = b.length;
    if (Math.abs(la - lb) > maxDist) return maxDist + 1;

    let prev = new Array(lb + 1);
    let curr = new Array(lb + 1);

    for (let j = 0; j <= lb; j++) prev[j] = j;

    for (let i = 1; i <= la; i++) {
      curr[0] = i;
      let minInRow = curr[0];
      const ca = a.charCodeAt(i - 1);

      for (let j = 1; j <= lb; j++) {
        const cost = (ca === b.charCodeAt(j - 1)) ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1,      // deletion
          curr[j - 1] + 1,  // insertion
          prev[j - 1] + cost // substitution
        );
        if (curr[j] < minInRow) minInRow = curr[j];
      }

      if (minInRow > maxDist) return maxDist + 1;
      const tmp = prev;
      prev = curr;
      curr = tmp;
    }

    return prev[lb];
  }

  /**
   * 4. Главный метод классификации с многофакторным скорингом
   */
  static categorize(merchant = '', rawDetails = '', type = 'Расход') {
    const rawText = `${merchant} ${rawDetails}`.trim();
    if (!rawText) {
      return type === 'Доход' ? 'Зарплата' : 'Другое';
    }

    // Получаем разрешенные категории для текущего типа (Расход или Доход)
    let allowedCategories = [];
    if (typeof getActiveCategories === 'function') {
      allowedCategories = getActiveCategories(type);
    } else {
      const cats = window.Cache?.categories;
      const list = type === 'Доход' ? (cats?.income || []) : (cats?.expense || []);
      allowedCategories = list.map(c => (typeof c === 'string' ? c : c?.name)).filter(Boolean);
    }
    if (!allowedCategories.length) {
      allowedCategories = (type === 'Доход') ? ['Зарплата', 'Другое'] : ['Продукты', 'Другое'];
    }

    const normText = this.normalize(rawText);
    const textTokens = normText.split(' ').filter(Boolean);
    const textStems = textTokens.map(t => this.stem(t));
    const normTextNoSpaces = normText.replace(/\s+/g, '');

    // Карта накопленных баллов для каждой категории
    const categoryScores = new Map();
    function addScore(cat, points) {
      if (!cat || !allowedCategories.includes(cat)) return;
      categoryScores.set(cat, (categoryScores.get(cat) || 0) + points);
    }

    // 1. Проверка банковских MCC-кодов (если есть в выписке или тексте)
    const mccMatch = rawText.match(/\b(?:mcc|мсс)[:\s]*(\d{4})\b/i) || rawText.match(/\b(\d{4})\b/);
    if (mccMatch && mccMatch[1] && this.MCC_MAP[mccMatch[1]]) {
      const mccCategory = this.MCC_MAP[mccMatch[1]];
      addScore(mccCategory, 80);
    }

    // 2. Загрузка правил (пользовательские + системные)
    const rules = (window.Cache?.categoryRules?.length)
      ? window.Cache.categoryRules
      : (window.DEFAULT_CATEGORY_RULES || []);

    // 3. Скоринг каждого правила
    for (const rule of rules) {
      if (!rule.pattern || !rule.category) continue;
      if (!allowedCategories.includes(rule.category)) continue;

      const normPat = this.normalize(rule.pattern);
      if (!normPat) continue;

      const patTokens = normPat.split(' ').filter(Boolean);
      const patStems = patTokens.map(t => this.stem(t));
      const patLength = normPat.length;
      const isUserRule = !rule.isSystem;
      const userBonus = isUserRule ? 25 : 0;

      // Проверка на стоп-слово
      const isStopWord = patTokens.length === 1 && this.STOP_WORDS.has(patTokens[0]);
      const stopWordPenalty = isStopWord ? -40 : 0;

      // 3.1. Точное совпадение многословной фразы (например "яндекс лавка", "додо пицца")
      if (patTokens.length > 1) {
        if (normText.includes(normPat)) {
          addScore(rule.category, 70 + (patLength * 4) + userBonus + stopWordPenalty);
          continue;
        }
        const normPatNoSpaces = normPat.replace(/\s+/g, '');
        if (normPatNoSpaces.length >= 6 && normTextNoSpaces.includes(normPatNoSpaces)) {
          addScore(rule.category, 60 + (patLength * 3) + userBonus + stopWordPenalty);
          continue;
        }
      }

      // 3.2. Точное совпадение отдельного слова / токена
      let matchedToken = false;
      for (const t of textTokens) {
        if (t === normPat) {
          addScore(rule.category, 50 + (patLength * 2) + userBonus + stopWordPenalty);
          matchedToken = true;
          break;
        }
      }
      if (matchedToken) continue;

      // 3.3. Совпадение по основе слова (Стемминг - защита от падежей "в пятерочке", "самокатом")
      let matchedStem = false;
      const mainPatStem = patStems[0];
      if (mainPatStem && mainPatStem.length >= 3) {
        for (const st of textStems) {
          if (st === mainPatStem) {
            addScore(rule.category, 35 + (mainPatStem.length * 2) + userBonus + stopWordPenalty);
            matchedStem = true;
            break;
          }
        }
      }
      if (matchedStem) continue;

      // 3.4. Нечеткое совпадение (Fuzzy Levenshtein - защита от опечаток "петерочка" -> "пятерочка")
      // Применяется ТОЛЬКО для слов длиной >= 5 символов и при условии, что слово не является стоп-словом
      if (patLength >= 5 && !isStopWord) {
        const maxDist = patLength >= 8 ? 2 : 1;
        for (const t of textTokens) {
          if (t.length >= 5 && Math.abs(t.length - patLength) <= maxDist) {
            const dist = this.boundedLevenshtein(t, normPat, maxDist);
            if (dist <= maxDist) {
              addScore(rule.category, 15 + userBonus); // Минимальный балл fallback
              break;
            }
          }
        }
      }
    }

    // 4. Поиск категории с максимальным количеством баллов
    let bestCategory = null;
    let maxScore = 0;

    for (const [cat, score] of categoryScores.entries()) {
      if (score > maxScore) {
        maxScore = score;
        bestCategory = cat;
      }
    }

    if (bestCategory && maxScore > 0) {
      return bestCategory;
    }

    // Fallback по умолчанию
    return allowedCategories.includes('Другое') ? 'Другое' : (allowedCategories[0] || 'Другое');
  }
}

if (typeof window !== 'undefined') {
  window.StatementCategorizer = StatementCategorizer;
}
