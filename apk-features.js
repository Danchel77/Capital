/**
 * apk-features.js - Модуль нативных возможностей и виджетов для Android APK
 *
 * Включает:
 * 1. Определение нативной платформы (APK Capacitor vs PWA vs Browser).
 * 2. Расчет и фоновую синхронизацию данных для виджетов домашнего экрана смартфона.
 * 3. Два переработанных варианта виджета:
 *    - Полный (4x2): единая бесшовная карточка, недельный и месячный остаток без обрезания цифр + быстрый расход.
 *    - Компактный (2x2): крупный остаток месяца с круговым прогрессом.
 * 4. Окно добавления виджетов (без лишних кнопок и инструкций) с прямым системным закреплением.
 * 5. Всплывающая шторка-предложение (только для нативного APK).
 * 6. Фоновый перехват push-уведомлений банков (Сбер, Т-Банк, Яндекс Пэй, Альфа и др.) и авто-внесение трат.
 */

// 1. Проверка окружения (APK / Native vs PWA vs Браузер)
function isNativeAppPlatform() {
  if (typeof window === 'undefined') return false;
  if (window._forceNativeApp === true) return true;
  if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function') {
    try {
      return window.Capacitor.isNativePlatform() === true;
    } catch (_) {
      return false;
    }
  }
  if (
    typeof location !== 'undefined' &&
    (location.protocol === 'capacitor:' || location.protocol === 'ionic:')
  ) {
    return true;
  }
  return false;
}

function isPwaStandalone() {
  if (typeof window === 'undefined') return false;
  try {
    return !!(
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.matchMedia?.('(display-mode: fullscreen)')?.matches ||
      window.navigator.standalone === true ||
      (document.referrer && document.referrer.includes('android-app://'))
    );
  } catch (_) {
    return false;
  }
}

function syncWidgetData() {}

// 8. Быстрый переход к добавлению расхода из виджета или ярлыка
function triggerQuickNewExpense() {
  if (typeof closeWidgetHubModal === 'function') closeWidgetHubModal();
  if (typeof closeProfileModal === 'function') closeProfileModal();
  if (typeof closeCustomDatePicker === 'function') closeCustomDatePicker();

  if (typeof window.switchTab === 'function') {
    window.switchTab('transactions');
  }

  const openExpenseForm = () => {
    const formContainer = document.getElementById('tx-form-container');
    if (formContainer && formContainer.classList.contains('hidden')) {
      if (typeof window.toggleForm === 'function') {
        window.toggleForm('tx-form-container', 'tx-submit-btn', 'Сохранить', 'tx-form', 'tx');
      } else {
        formContainer.classList.remove('hidden');
      }
    }

    const typeSelect = document.getElementById('tx-type');
    if (typeSelect) {
      typeSelect.value = 'Расход';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const amountInput = document.getElementById('tx-amount');
    if (amountInput) {
      amountInput.focus();
      amountInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  openExpenseForm();
  setTimeout(openExpenseForm, 180);
  setTimeout(openExpenseForm, 350);
}

// 11. Автоматический учет расходов по банковским пуш-уведомлениям (Bank Push Automation)

const BANK_PACKAGE_NAMES = {
  'com.idamob.tinkoff.android': 'Т-Банк',
  'ru.tinkoff.mobile': 'Т-Банк',
  'ru.sberbankmobile': 'СберБанк',
  'ru.alfabank.mobile.android': 'Альфа-Банк',
  'ru.vtb24.mobilebanking': 'ВТБ',
  'ru.raiffeisennews': 'Райффайзенбанк',
  'com.yandex.bank': 'Яндекс Банк',
  'ru.yandex.pay': 'Яндекс Пэй',
  'ru.gazprombank.android.mobilebank.app': 'Газпромбанк',
  'ru.ozon.fintech.bank': 'Озон Банк',
  'ru.mts.money': 'МТС Банк',
  'ru.rosbank.android': 'Росбанк',
  'ru.sovcomcard.halva.v1': 'Совкомбанк',
  'ru.psbank.mobile.individual': 'ПСБ',
};

function getBankNameByPackage(pkgName) {
  if (!pkgName) return 'Банк';
  return BANK_PACKAGE_NAMES[pkgName] || 'Банк';
}

// Буфер недавних пушей для моментального отсечения парных встречных операций (+X и -X)
const recentBankPushesBuffer = [];

function checkAndCancelPairPush(parsedData) {
  const now = Date.now();
  // Очищаем события старше 60 секунд
  while (recentBankPushesBuffer.length > 0 && now - recentBankPushesBuffer[0].time > 60000) {
    recentBankPushesBuffer.shift();
  }

  // Ищем встречную операцию с такой же суммой и противоположным типом (от того же банка или в пределах 60 сек)
  const pairIdx = recentBankPushesBuffer.findIndex(
    p => Math.abs(p.amount - parsedData.amount) < 0.01 && p.type !== parsedData.type
  );

  if (pairIdx !== -1) {
    const pair = recentBankPushesBuffer.splice(pairIdx, 1)[0];
    console.warn(
      '[BankPush] Обнаружена встречная парная операция (+-), отменяем обе:',
      pair,
      parsedData
    );

    // Если первая операция успела сохраниться как pending transfer, тихо удаляем её
    if (pair.txId && typeof window.dismissPendingTransferSilent === 'function') {
      window.dismissPendingTransferSilent(pair.txId);
    }
    return true; // Парная операция компенсирована
  }

  return false;
}

/**
 * Скоринговая модель классификации push-уведомлений банков (Financial Push Scoring Engine)
 * Оценивает достоверность того, что входящее уведомление является реальной финансовой транзакцией,
 * а не рекламой, кредитным предложением, акцией, кэшбэк-промокодом или кодом подтверждения.
 */
function scoreBankPushNotification(title = '', text = '', packageName = '') {
  const fullText = `${title} ${text}`.trim();
  if (!fullText) return { score: 0, isFinancial: false, reason: 'empty_text', factors: [] };

  // 1. АБСОЛЮТНЫЕ СТОП-ФАКТОРЫ (Hard Gate -> Score = -999, мгновенный отброс)
  // 1.1. Одноразовые коды и данные авторизации / безопасности
  if (
    /(?:код\s+подтверждения|пароль\s+для\s+входа|никому\s+не\s+(?:сообщайте|передавайте)|вход\s+в\s+(?:приложение|банк)|одноразовый\s+пароль|для\s+входа\s+в\s+лк|push[- ]?код|код\s+авторизации|sms[- ]?код)/i.test(
      fullText
    )
  ) {
    return { score: -999, isFinancial: false, reason: 'auth_otp_code', factors: ['auth_otp_code'] };
  }
  // 1.2. Сервисные/технические уведомления банков
  if (
    /(?:обновление\s+условий|изменение\s+тарифов|график\s+работы|технические\s+работы|безопасность\s+аккаунта|новая\s+версия\s+приложения|оцените\s+приложение|опрос\s+о\s+качестве)/i.test(
      fullText
    )
  ) {
    return {
      score: -999,
      isFinancial: false,
      reason: 'system_service_alert',
      factors: ['system_service_alert'],
    };
  }

  let score = 0;
  const factors = [];

  // 2. ПОЛОЖИТЕЛЬНЫЕ СИГНАЛЫ (ФАКТ СОВЕРШЕННОЙ ФИНАНСОВОЙ ОПЕРАЦИИ)

  // 2.1. Глаголы совершенного действия / прошедшее время (+40)
  if (
    /(?:покупка|оплата|оплачено|списано|списание|снятие|зачисление|зачислено|пополнение|пополнено|выдача\s+наличных|чек\b)/i.test(
      fullText
    )
  ) {
    score += 40;
    factors.push('action_verb_match (+40)');
  }

  // 2.2. Наличие статуса счета / карты / баланса (+35)
  if (
    /(?:баланс|остаток|доступно|лимит\s+карты|карта\s+\*?\d+|сч[её]т\s+\*?\d+|mir-\d+|ecmc\d+|visa\d+|authcode|mcc\b)/i.test(
      fullText
    )
  ) {
    score += 35;
    factors.push('balance_or_card_state (+35)');
  }

  // 2.3. Переводы (+30)
  if (
    /(?:перевод\s+от|перевод\s+клиенту|перевод\s+на|входящий\s+перевод|исходящий\s+перевод|перевод\s+по\s+сбп|сбп\b)/i.test(
      fullText
    )
  ) {
    score += 30;
    factors.push('transfer_marker (+30)');
  }

  // 2.4. Пакет известного банковского приложения (+15)
  if (packageName && BANK_PACKAGE_NAMES[packageName]) {
    score += 15;
    factors.push('known_bank_package (+15)');
  }

  // 2.5. Сумма в жесткой связке с операцией (+20)
  if (
    /(?:покупка|оплата|списание|списано|зачисление|пополнение|перевод)\s*[:=]?\s*[-+]?\s*\d+[\s\d]*[.,]?\d*\s*(?:₽|руб|rur|rub|р\b)/i.test(
      fullText
    )
  ) {
    score += 20;
    factors.push('amount_bound_to_action (+20)');
  }

  // 3. ОТРИЦАТЕЛЬНЫЕ СИГНАЛЫ (МАРКЕТИНГ, СПАМ, БУДУЩИЕ ПРЕДЛОЖЕНИЯ)

  // 3.1. Предлоги диапазонов и условий перед суммами (-50)
  // Примеры: "до 10 000 ₽", "от 500 ₽", "кешбэк до 5 000", "скидка до 30%"
  if (
    /(?:до|от)\s+\d+[\s\d]*\s*(?:₽|руб|рубл|rur|rub|р\b|%)/i.test(fullText) ||
    /(?:лимит(?:\s+до|\s+на)?|кешбэк(?:\s+до)?|кэшбэк(?:\s+до)?|ставка(?:\s+от)?|скидк[аи](?:\s+до)?|рассрочк[аи](?:\s+на)?|кредит(?:\s+до|\s+на)?|одобрен[ао]?\s+на)\s+\d+/i.test(
      fullText
    )
  ) {
    score -= 50;
    factors.push('range_or_future_offer_penalty (-50)');
  }

  // 3.2. Повелительное наклонение и рекламные глаголы (-40)
  if (
    /\b(?:оформите|получите|попробуйте|откройте|возьмите|узнайте|дарим|выиграйте|успейте|инвестируйте|подключите|заберите|выбирайте|закажите|увеличьте|подайте\s+заявку|активируйте|пригласите|копите)\b/i.test(
      fullText
    )
  ) {
    score -= 40;
    factors.push('imperative_marketing_verb (-40)');
  }

  // 3.3. Рекламные ключевые слова и акции (-35)
  if (
    /\b(?:промокод|специальное\s+предложение|персональное\s+предложение|акция|выгода|партнеры\s+банка|рассрочка|кредитные\s+каникулы|бонусы\s+спасибо|кэшбэк|кешбэк|выгодн[а-я]+|шанс\s+выиграть|розыгрыш|дополнительный\s+доход|начните\s+инвестировать)\b/i.test(
      fullText
    )
  ) {
    score -= 35;
    factors.push('marketing_buzzwords (-35)');
  }

  const isFinancial = score >= 50;
  return {
    score,
    isFinancial,
    factors,
    reason: isFinancial ? 'valid_transaction' : 'low_confidence_or_marketing',
  };
}

function cleanBankPushMerchant(text = '', title = '') {
  const combined = `${title} ${text}`.trim();
  let clean = text || combined;

  // 1. Отрезаем всё после точки, двоеточия или перевода строки, если там начинается баланс/доступно/остаток/счет/карта/кэшбэк
  clean = clean.split(
    /(?:\.|\n|\r)\s*(?:баланс|доступно|остаток|лимит|карта\b|карты\b|кэшб|authcode|mcc\b|сч[её]т\b|счета\b|сч[её]та\b|накопительн)/i
  )[0];

  // 2. Если слово баланс встретилось без точки перед ним
  clean = clean.split(/\s+(?:баланс|доступно|остаток|лимит)[\s:]+/i)[0];

  // 3. Срезаем префиксы банков
  clean = clean.replace(
    /^(?:сбербанк|тинькофф|т-банк|альфа-банк|втб|банк|яндекс\s*пэй|пэй|озон\s*банк|райффайзенбанк|газпромбанк)[:\s]+/i,
    ''
  );

  // 4. Срезаем тип операции и сумму в начале
  clean = clean.replace(
    /^(?:покупка|оплата|списание|списано|зачисление|пополнение|снятие|перевод)(?:\s*(?:на\s+сумму|в\s+размере))?[:\s]+[-+]?\s*[\d\s.,]+(?:₽|руб|rur|rub|р)?\s*[,.]?\s*(?:в\s+|за\s+|от\s+|клиенту\s+|на\s+карту\s+|с\s+карты\s+)?/i,
    ''
  );

  // 5. Срезаем хвосты «карта Пэй», «карта *1234», «кэшбэк ...»
  clean = clean.replace(/\s+(?:карта\s+пэй|карта\s+\*?\d+|кэшбэк.*)$/i, '');

  // 6. Срезаем знаки препинания и пробелы на концах
  clean = clean.replace(/^[,\s.—–:;]+|[,\s.—–:;]+$/g, '').trim();

  // 7. Если строка пустая, пробуем взять заголовок
  if (!clean || clean.length < 2) {
    const titleClean = (title || '')
      .replace(/^[-+]?\s*[\d\s.,]+(?:₽|руб|rur|rub|р)?\s*/i, '')
      .replace(/^[,\s.—–:;]+|[,\s.—–:;]+$/g, '')
      .trim();
    if (titleClean.length >= 2) clean = titleClean;
  }

  return clean || 'Операция';
}

function parseBankPushText(title = '', text = '', packageName = '') {
  const fullText = `${title} ${text}`.trim();
  if (!fullText) return null;

  // 1. Прогон через скоринговую модель оценки доверия к транзакции
  const scoring = scoreBankPushNotification(title, text, packageName);
  if (!scoring.isFinancial) {
    console.warn(
      `[BankPush] Пуш отфильтрован скорингом (Score: ${scoring.score}, Причина: ${scoring.reason}):`,
      fullText,
      scoring.factors
    );
    return null;
  }

  // 2. Определение банка
  let bankName = getBankNameByPackage(packageName);
  const lowerFull = fullText.toLowerCase();
  if (bankName === 'Банк') {
    if (
      lowerFull.includes('тинькофф') ||
      lowerFull.includes('т-банк') ||
      lowerFull.includes('tinkoff') ||
      lowerFull.includes('t-bank')
    )
      bankName = 'Т-Банк';
    else if (lowerFull.includes('сбер') || lowerFull.includes('sber')) bankName = 'СберБанк';
    else if (lowerFull.includes('альфа') || lowerFull.includes('alfa')) bankName = 'Альфа-Банк';
    else if (lowerFull.includes('втб') || lowerFull.includes('vtb')) bankName = 'ВТБ';
    else if (lowerFull.includes('райф') || lowerFull.includes('raiff')) bankName = 'Райффайзенбанк';
    else if (lowerFull.includes('яндекс') || lowerFull.includes('yandex')) bankName = 'Яндекс Пэй';
    else if (lowerFull.includes('газпром') || lowerFull.includes('gpb')) bankName = 'Газпромбанк';
    else if (lowerFull.includes('озон') || lowerFull.includes('ozon')) bankName = 'Озон Банк';
  }

  // 3. Распознавание внутреннего перевода между счетами / в накопительные счета
  const isInternalAccountTransfer =
    /(?:на\s+сч[её]т\s+в\s+сейвах|в\s+сейвы|пополнение\s+с\s+карты.*на\s+сч[её]т|перевод.*между\s+(?:своими|счетами)|в\s+инвесткопилку|перевод\s+на\s+сч[её]т\s+в\s+сейв)/i.test(
      fullText
    );

  // 4. Определение типа операции (Расход vs Доход)
  const isIncome =
    /(?:зачисление|пополнение|перевод от|возврат|зарплата|входящий перевод|\+[\d\s]+)/i.test(
      fullText
    ) && !/(?:списание|покупка|оплата)/i.test(fullText);

  // 5. Определение обычного перевода и пополнений с сейва/накопительных счетов (требует подтверждения)
  const isTransferOperation =
    !isInternalAccountTransfer &&
    /(?:пополнение\s+(?:с|из)\s+сейва|с\s+сейва|из\s+сейва|сейв|сейва|пополнение\s+(?:с|из)\s+накопительн|с\s+накопительн|из\s+накопительн|накопительного\s+сч[её]та|копилк|перевод|сбп|по\s+номеру|клиенту|зачисление\s+перевода|входящий\s+перевод|исходящий\s+перевод)/i.test(
      fullText
    );

  // 6. Извлечение суммы операции
  let amount = 0;
  const amountRegexes = [
    /(?:покупка|оплата|списание|списано|снятие|зачисление|пополнение|сумма|чек|на сумму|расход|перевод)\s*(?::)?\s*([-+]?\s*[\d\s]+(?:[.,]\d{1,2})?)\s*(?:₽|руб|рубл|rur|rub|р\b)/i,
    /([-+]?\s*[\d\s]+(?:[.,]\d{1,2})?)\s*(?:₽|руб|рубл|rur|rub|р\b)/i,
    /(?:сумма|итог)\s*[:=]\s*([-+]?\s*[\d\s]+(?:[.,]\d{1,2})?)/i,
  ];

  for (const reg of amountRegexes) {
    const match = fullText.match(reg);
    if (match && match[1]) {
      const cleanNumStr = match[1].replace(/\s/g, '').replace(/\+/g, '').replace(/,/g, '.');
      const parsed = parseFloat(cleanNumStr);
      if (!isNaN(parsed) && parsed > 0 && parsed < 10000000) {
        amount = Math.round(parsed * 100) / 100;
        break;
      }
    }
  }

  if (amount <= 0) return null;

  // 7. Извлечение чистого названия магазина / назначения
  const finalMerchant = cleanBankPushMerchant(text, title);

  // 8. Автокатегоризация через StatementCategorizer
  let category = isIncome ? 'Зарплата' : 'Продукты';
  if (isTransferOperation || isInternalAccountTransfer) {
    category = isIncome ? 'Входящий перевод' : 'Перевод';
  } else if (typeof window.StatementCategorizer?.categorize === 'function') {
    category = window.StatementCategorizer.categorize(
      finalMerchant,
      fullText,
      isIncome ? 'Доход' : 'Расход'
    );
  } else {
    const rules = window.Cache?.categoryRules || window.DEFAULT_CATEGORY_RULES || [];
    const lowerNorm = (finalMerchant + ' ' + fullText).toLowerCase();
    for (const r of rules) {
      if (r.pattern && lowerNorm.includes(r.pattern.toLowerCase())) {
        category = r.category;
        break;
      }
    }
  }

  return {
    bank: bankName,
    amount,
    type: isIncome ? 'Доход' : 'Расход',
    merchant: finalMerchant,
    category: category || (isIncome ? 'Другое' : 'Прочее'),
    rawText: fullText,
    score: scoring.score,
    isInternalTransfer: isInternalAccountTransfer,
    isPendingTransfer: isTransferOperation,
    timestamp: Date.now(),
  };
}

// Автоматическое сохранение распознанной операции
async function saveAutoExpenseTransaction(parsedData) {
  if (!parsedData || !parsedData.amount || parsedData.amount <= 0) return null;
  if (!window.auth?.currentUser) return null;

  // 1. Если это явный внутренний перевод между своими счетами — пропускаем учет в тратах
  if (parsedData.isInternalTransfer) {
    console.warn('[BankPush] Внутренний перевод между своими счетами пропущен:', parsedData);
    return null;
  }

  // 2. Проверка и отсечение встречных парных операций (+- на одинаковую сумму)
  const isPairCancelled = checkAndCancelPairPush(parsedData);
  if (isPairCancelled) {
    return null;
  }

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const formattedDateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;

  const tempTxId = `auto_push_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  // Проверка на дубликат
  const allFlat =
    typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
  const isDuplicate = allFlat.some(t => {
    if (t.date !== dateStr) return false;
    const diff = Math.abs(parseFloat(t.amount) - parsedData.amount);
    if (diff < 0.01) {
      const timeDiff = Math.abs((t.timestamp || t.createdAt || 0) - parsedData.timestamp);
      if (timeDiff < 10 * 60 * 1000) return true; // 10 минут
    }
    return false;
  });

  if (isDuplicate) {
    console.warn('[BankPush] Операция пропущена (обнаружен дубликат):', parsedData);
    return null;
  }

  const isPending = !!parsedData.isPendingTransfer;
  const userProfile =
    typeof getCurrentUserProfile === 'function'
      ? getCurrentUserProfile()
      : { displayName: 'Пользователь', avatarId: 'user' };
  const authorInfo = {
    uid: window.auth.currentUser.uid || '',
    name: userProfile.displayName || 'Пользователь',
    avatarId: userProfile.avatarId || 'user',
  };

  const txObj = {
    id: tempTxId,
    type: parsedData.type || 'Расход',
    amount: parsedData.amount,
    category: parsedData.category || 'Прочее',
    date: dateStr,
    formattedDate: formattedDateStr,
    rawDate: dateStr,
    comment: parsedData.merchant || '',
    excludeFromBudget: isPending ? true : false, // Неподтвержденные переводы не влияют на бюджет
    isPendingTransfer: isPending,
    transferStatus: isPending ? 'pending' : 'confirmed',
    spreadMonths: 1,
    isBillPayment: false,
    billId: null,
    billName: '',
    billType: '',
    source: 'bank_push_auto',
    bank: parsedData.bank || '',
    timestamp: parsedData.timestamp || Date.now(),
    createdAt: Date.now(),
    author: authorInfo,
  };

  // Добавляем в буфер недавних пушей для проверки встречных парных списаний/пополнений
  recentBankPushesBuffer.push({
    txId: tempTxId,
    amount: parsedData.amount,
    type: parsedData.type,
    bank: parsedData.bank,
    time: Date.now(),
  });

  // Мгновенное добавление в кэш
  allFlat.unshift(txObj);
  window.lastAddedTxIds = [tempTxId];
  window.lastAddedTxTime = Date.now();

  if (typeof processTransactions === 'function') {
    window.Cache.transactions = processTransactions(allFlat);
  }

  // Анимация и обновление интерфейса (только если операция подтвержденная и влияет на бюджет)
  if (!isPending) {
    if (typeof triggerBudgetExpenseAnimation === 'function') {
      triggerBudgetExpenseAnimation();
    } else {
      window._budgetNeedsExpenseAnimation = true;
      window._budgetTabDirty = true;
    }
    syncWidgetData();
  }

  if (typeof markTabsDirty === 'function') markTabsDirty();
  if (typeof renderBudgetTab === 'function') renderBudgetTab();
  if (typeof renderTransactions === 'function') renderTransactions();

  // Локальный тост и push-уведомление
  const format =
    typeof window.formatMoney === 'function'
      ? window.formatMoney
      : n => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

  if (isPending) {
    if (typeof showToast === 'function') {
      showToast(`Перевод: ${format(parsedData.amount)} • Требует подтверждения`);
    }
    sendAppLocalNotification(
      `Перевод: ${format(parsedData.amount)}`,
      `${parsedData.merchant} • Подтвердите в приложении`
    );
  } else {
    if (typeof showToast === 'function') {
      showToast(
        `Авто-расход: ${format(parsedData.amount)} • ${parsedData.merchant} (${parsedData.category})`
      );
    }
    sendAppLocalNotification(
      `Расход внесен: ${format(parsedData.amount)}`,
      `${parsedData.merchant} • ${parsedData.category}`
    );
  }

  // Фоновая запись в Firestore
  try {
    if (typeof getUserCol === 'function') {
      await getUserCol('Transactions').doc(tempTxId).set(txObj);
    }
  } catch (err) {
    console.warn('[BankPush] Ошибка сохранения транзакции в Firestore:', err);
  }

  return txObj;
}

// Отправка нативного push-уведомления пользователю и настройки
function isBankPushNotifyOnSaveEnabled() {
  return localStorage.getItem('bank_push_notify_on_save_enabled') !== 'false';
}

function toggleBankPushNotifyOnSave(enabled) {
  localStorage.setItem('bank_push_notify_on_save_enabled', enabled ? 'true' : 'false');
  if (enabled) {
    requestPostNotificationPermission();
  }
  renderBankPushModalContent();
}

// Отправка нативного push-уведомления пользователю
function sendAppLocalNotification(title, body) {
  if (!isBankPushNotifyOnSaveEnabled()) return;
  try {
    // 1. Через нативный плагин Capacitor BankPush
    if (window.Capacitor?.Plugins?.BankPush?.notifyExpenseSaved) {
      window.Capacitor.Plugins.BankPush.notifyExpenseSaved({ title, body }).catch(() => {});
      return;
    }

    // 2. Через браузерный Notification API (если доступен и разрешен)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: 'icon-pwa.svg?v=3',
        badge: 'icon-pwa.svg?v=3',
      });
    }
  } catch (_e) {
    /* ignore */
  }
}

// Проверка и запрос разрешений нативного сервиса пушей
async function checkBankPushPermissions() {
  if (window.Capacitor?.Plugins?.BankPush?.checkPermission) {
    try {
      const res = await window.Capacitor.Plugins.BankPush.checkPermission();
      return !!(res && res.granted);
    } catch (_) {
      return false;
    }
  }
  return false;
}

async function checkPostNotificationPermission() {
  if (window.Capacitor?.Plugins?.BankPush?.checkPostNotificationPermission) {
    try {
      const res = await window.Capacitor.Plugins.BankPush.checkPostNotificationPermission();
      return !!(res && res.granted);
    } catch (_) {
      return false;
    }
  }
  if (typeof Notification !== 'undefined') {
    return Notification.permission === 'granted';
  }
  return true;
}

async function requestPostNotificationPermission() {
  if (window.Capacitor?.Plugins?.BankPush?.requestPostNotificationPermission) {
    try {
      await window.Capacitor.Plugins.BankPush.requestPostNotificationPermission();
    } catch (_e) {
      /* ignore */
    }
  } else if (typeof Notification !== 'undefined' && Notification.requestPermission) {
    try {
      await Notification.requestPermission();
    } catch (_e) {
      /* ignore */
    }
  }
}

function openBankPushPermissionSettings() {
  if (window.Capacitor?.Plugins?.BankPush?.openPermissionSettings) {
    window.Capacitor.Plugins.BankPush.openPermissionSettings().catch(() => {});
  } else {
    if (typeof showToast === 'function') {
      showToast('Откройте: Настройки телефона → Приложения → Доступ к уведомлениям');
    }
  }
}

function isBankPushAutoExpenseEnabled() {
  return localStorage.getItem('bank_push_auto_expense_enabled') !== 'false';
}

function toggleBankPushAutoExpense(enabled) {
  localStorage.setItem('bank_push_auto_expense_enabled', enabled ? 'true' : 'false');
  if (window.Capacitor?.Plugins?.BankPush?.setAutoExpenseEnabled) {
    window.Capacitor.Plugins.BankPush.setAutoExpenseEnabled({ enabled: !!enabled }).catch(() => {});
  }
  renderBankPushModalContent();
}

async function syncAuthCredentialsToBankPush() {
  if (!window.Capacitor?.Plugins?.BankPush?.setAuthCredentials) return;
  if (!window.auth?.currentUser) return;
  try {
    const user = window.auth.currentUser;
    const idToken = await user.getIdToken();
    const refreshToken = user.refreshToken || '';
    const profile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : {};
    const familyId = window.Cache?.family?.id || '';
    const geminiApiKey =
      typeof window.GeminiService?.getAuthCredential === 'function'
        ? window.GeminiService.getAuthCredential()?.value || ''
        : '';

    const categories = [
      ...(window.Cache?.categories?.expense || []).map(c => (typeof c === 'string' ? c : c?.name)),
      ...(window.Cache?.categories?.income || []).map(c => (typeof c === 'string' ? c : c?.name)),
    ].filter(Boolean);

    const categoryRules = window.Cache?.categoryRules || window.DEFAULT_CATEGORY_RULES || [];

    await window.Capacitor.Plugins.BankPush.setAuthCredentials({
      userId: user.uid,
      familyId: familyId,
      idToken: idToken,
      refreshToken: refreshToken,
      apiKey: window.firebaseConfig?.apiKey || '',
      projectId: 'familybudget-4245a',
      geminiApiKey: geminiApiKey,
      authorName: profile.displayName || user.displayName || 'Пользователь',
      authorAvatarId: profile.avatarId || 'user',
      categoriesJson: JSON.stringify(categories),
      categoryRulesJson: JSON.stringify(categoryRules),
    });
  } catch (err) {
    console.warn('[BankPush] Error syncing credentials to native layer:', err);
  }
}
window.syncAuthCredentialsToBankPush = syncAuthCredentialsToBankPush;

// Инициализация фонового слушателя входящих банковских пушей
function initBankPushListener() {
  if (window._bankPushListenerInitialized) return;
  window._bankPushListenerInitialized = true;

  if (window.Capacitor?.Plugins?.BankPush) {
    // Подписка на событие прихода пуша в реальном времени
    window.Capacitor.Plugins.BankPush.addListener('bankPushReceived', async eventData => {
      if (!isBankPushAutoExpenseEnabled()) return;
      if (eventData && eventData.alreadySynced) {
        if (typeof fetchAllData === 'function') fetchAllData();
        return;
      }
      const parsed = parseBankPushText(
        eventData.title,
        eventData.text || eventData.body,
        eventData.packageName
      );
      if (parsed && parsed.amount > 0) {
        await saveAutoExpenseTransaction(parsed);
      }
    }).catch(() => {});

    // Получение пушей, накопившихся пока приложение было закрыто
    window.Capacitor.Plugins.BankPush.getPendingBankPushes?.()
      .then(async res => {
        if (res && Array.isArray(res.pushes) && isBankPushAutoExpenseEnabled()) {
          let hasSynced = false;
          for (const p of res.pushes) {
            if (p.alreadySynced) {
              hasSynced = true;
              continue;
            }
            const parsed = parseBankPushText(p.title, p.text || p.body, p.packageName);
            if (parsed && parsed.amount > 0) {
              await saveAutoExpenseTransaction(parsed);
            }
          }
          if (hasSynced && typeof fetchAllData === 'function') {
            fetchAllData();
          }
        }
      })
      .catch(() => {});
  }
}

// 12. Модальное окно настроек авто-учета по пушам (Bank Push Hub)
let _bankPushCheckInterval = null;

async function checkAndUpdatePushPermissionsUI() {
  const modal = document.getElementById('bank-push-modal');
  const isModalOpen = modal && !modal.classList.contains('hidden');
  const warnEl = document.getElementById('bank-push-permission-warning');
  if (!warnEl && !isModalOpen) return;

  const isNative = typeof isNativeAppPlatform === 'function' ? isNativeAppPlatform() : false;
  if (!isNative) {
    if (warnEl) warnEl.classList.add('hidden');
    return;
  }

  try {
    const isGranted =
      typeof checkBankPushPermissions === 'function' ? await checkBankPushPermissions() : true;
    if (warnEl) {
      if (isGranted) {
        if (!warnEl.classList.contains('hidden')) {
          warnEl.style.transition =
            'opacity 0.25s ease, max-height 0.3s ease, margin 0.3s ease, padding 0.3s ease';
          warnEl.style.overflow = 'hidden';
          warnEl.style.opacity = '0';
          warnEl.style.maxHeight = '0px';
          warnEl.style.paddingTop = '0px';
          warnEl.style.paddingBottom = '0px';
          warnEl.style.marginTop = '0px';
          warnEl.style.marginBottom = '0px';
          setTimeout(() => {
            warnEl.classList.add('hidden');
            warnEl.style.cssText = '';
          }, 300);
        }
      } else if (isModalOpen) {
        warnEl.classList.remove('hidden');
      }
    }
  } catch (_e) {
    /* ignore */
  }
}

function openBankPushModal(options = {}) {
  let modal = document.getElementById('bank-push-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'bank-push-modal';
    modal.className =
      'fixed inset-0 z-[1400] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in custom-scrollbar';
    modal.onclick = e => {
      if (e.target === modal) closeBankPushModal();
    };
    document.body.appendChild(modal);
  }

  renderBankPushModalContent();
  modal.classList.remove('hidden');

  if (typeof lockBodyScroll === 'function') lockBodyScroll();

  // Запуск периодической проверки прав для мгновенного скрытия плашки при возврате из настроек
  if (_bankPushCheckInterval) clearInterval(_bankPushCheckInterval);
  _bankPushCheckInterval = setInterval(checkAndUpdatePushPermissionsUI, 900);
}

function closeBankPushModal() {
  const modal = document.getElementById('bank-push-modal');
  if (modal) modal.classList.add('hidden');

  if (_bankPushCheckInterval) {
    clearInterval(_bankPushCheckInterval);
    _bankPushCheckInterval = null;
  }

  // Если под модалкой пушей нет открытого профиля, разблокируем скролл страницы
  const profileDialog = document.getElementById('profile-dialog');
  const isProfileOpen = profileDialog && !profileDialog.classList.contains('hidden');
  if (!isProfileOpen && typeof unlockBodyScroll === 'function') {
    unlockBodyScroll();
  }
}

async function renderBankPushModalContent() {
  const modal = document.getElementById('bank-push-modal');
  if (!modal) return;

  const isAutoEnabled = isBankPushAutoExpenseEnabled();
  const isNotifyEnabled = isBankPushNotifyOnSaveEnabled();
  const isNative = isNativeAppPlatform();
  let isGranted = true;

  if (isNative) {
    isGranted = await checkBankPushPermissions();
  }

  modal.innerHTML = `
    <div class="relative bg-[#161822] border border-white/10 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 my-auto animate-in fade-in zoom-in duration-200">
      
      <!-- Шапка модального окна -->
      <div class="flex items-start justify-between pb-3 border-b border-white/5 gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#6C5DD3] to-[#8C7DFF] flex items-center justify-center text-white shadow-lg shadow-[#6C5DD3]/30 flex-shrink-0">
            <i data-lucide="bell-ring" class="w-5 h-5"></i>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <h3 class="text-base font-bold text-white leading-tight">Авто-учет по пушам</h3>
              <span class="text-[9px] font-bold bg-[#6C5DD3]/25 text-[#A594FD] border border-[#6C5DD3]/40 px-1.5 py-0.5 rounded-full">Авто</span>
            </div>
            <p class="text-xs text-gray-400 leading-tight mt-1">Мгновенное внесение трат сразу после покупки</p>
          </div>
        </div>
        <button type="button" onclick="closeBankPushModal()" class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all cursor-pointer flex-shrink-0">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>

      <!-- Предупреждение об отсутствии разрешений (текст на всю ширину, кнопка в правом нижнем углу) -->
      <div id="bank-push-permission-warning" class="${isNative && !isGranted ? 'flex' : 'hidden'} bg-amber-500/10 border border-amber-500/25 rounded-2xl p-3.5 flex-col gap-2.5 transition-all duration-300">
        <div class="flex items-start gap-2.5 w-full">
          <i data-lucide="alert-circle" class="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5"></i>
          <span class="text-xs text-amber-200/90 leading-snug flex-1">Для работы авто-учета требуется доступ к уведомлениям в Android</span>
        </div>
        <div class="flex justify-end pt-0.5">
          <button type="button" onclick="openBankPushPermissionSettings()" class="px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 text-amber-200 border border-amber-500/30 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm">
            <i data-lucide="settings" class="w-3.5 h-3.5"></i>
            <span>Настройки</span>
          </button>
        </div>
      </div>

      <!-- Настройки: Тумблеры управления -->
      <div class="space-y-2">
        <!-- Тумблер 1: Автоматический учет -->
        <div class="bg-[#0F1118] border border-white/5 rounded-2xl p-3.5 flex items-center justify-between">
          <div class="pr-3">
            <span class="text-xs font-bold text-white block">Автоматически вносить траты</span>
            <span class="text-[11px] text-gray-400 block mt-0.5 leading-snug">Вносить покупку в базу сразу при получении пуша</span>
          </div>
          <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input type="checkbox" ${isAutoEnabled ? 'checked' : ''} onchange="toggleBankPushAutoExpense(this.checked)" class="sr-only peer">
            <div class="w-11 h-6 bg-[#2A2D3C] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-[#30D158] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>

        <!-- Тумблер 2: Подтверждающий пуш от приложения -->
        <div class="bg-[#0F1118] border border-white/5 rounded-2xl p-3.5 flex items-center justify-between">
          <div class="pr-3">
            <span class="text-xs font-bold text-white block">Пуш-подтверждение о записи</span>
            <span class="text-[11px] text-gray-400 block mt-0.5 leading-snug">Присылать уведомление после успешного внесения расхода</span>
          </div>
          <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input type="checkbox" ${isNotifyEnabled ? 'checked' : ''} onchange="toggleBankPushNotifyOnSave(this.checked)" class="sr-only peer">
            <div class="w-11 h-6 bg-[#2A2D3C] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-[#30D158] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>
      </div>

      <!-- Разъяснение о безопасности данных -->
      <div class="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3.5 space-y-1.5">
        <div class="flex items-center gap-1.5 text-xs font-bold text-blue-200">
          <i data-lucide="shield-check" class="w-4 h-4 text-[#8C7DFF]"></i>
          <span>Безопасность и приватность</span>
        </div>
        <p class="text-[11px] text-blue-200/80 leading-relaxed">
          Наше приложение обрабатывает исключительно push-уведомления о покупках от банков — звонки и личные сообщения (Telegram, WhatsApp, SMS) никогда не читаются и не передаются.
        </p>
      </div>

      <!-- Кнопка закрытия -->
      <div class="pt-1">
        <button type="button" onclick="closeBankPushModal()" class="w-full py-3.5 px-4 rounded-2xl bg-[#212430] hover:bg-[#2A2D3C] active:scale-98 text-white text-xs font-bold transition-all cursor-pointer shadow-sm">
          Закрыть
        </button>
      </div>
    </div>
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons({ root: modal });
}

// 12.1. Диалог запроса разрешений Android при первом старте приложения
function openBankPushPermissionPrompt() {
  window._isBankPushPromptOpen = true;

  let modal = document.getElementById('bank-push-permission-prompt-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'bank-push-permission-prompt-modal';
    modal.className =
      'fixed inset-0 z-[1500] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';
    modal.onclick = e => {
      if (e.target === modal) closeBankPushPermissionPrompt();
    };
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="relative bg-[#161822] border border-white/10 rounded-3xl p-4 sm:p-5 max-w-md w-full shadow-2xl space-y-3.5 my-auto animate-in fade-in zoom-in duration-200 select-none">
      
      <div class="text-center space-y-1.5">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-[#6C5DD3] to-[#8C7DFF] flex items-center justify-center text-white shadow-xl shadow-[#6C5DD3]/30">
          <i data-lucide="bell-ring" class="w-6 h-6"></i>
        </div>
        <h3 class="text-base font-bold text-white leading-tight">Авто-учет расходов по пушам</h3>
        <p class="text-xs text-gray-300 leading-relaxed px-1">
          Приложение автоматически вносит траты в фоне сразу после оплаты картой или телефоном.
        </p>
      </div>

      <div class="bg-[#0F1118] border border-white/5 rounded-2xl p-3 space-y-2.5">
        <div class="text-xs font-bold text-white flex items-center gap-1.5">
          <i data-lucide="shield-alert" class="w-4 h-4 text-[#A594FD]"></i>
          <span>Что нужно включить для работы в фоне:</span>
        </div>
        <ul class="text-[11px] text-gray-300 space-y-2 leading-snug">
          <li class="flex items-start gap-2">
            <span class="w-4 h-4 rounded-full bg-[#6C5DD3]/30 text-[#A594FD] flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
            <div><b>Доступ к уведомлениям:</b> Разрешите приложению считывать пуши от банков.</div>
          </li>
          <li class="flex items-start gap-2">
            <span class="w-4 h-4 rounded-full bg-[#6C5DD3]/30 text-[#A594FD] flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
            <div><b>Показ уведомлений:</b> Для отправки подтверждающих пушей о занесении покупки.</div>
          </li>
          <li class="flex items-start gap-2">
            <span class="w-4 h-4 rounded-full bg-[#6C5DD3]/30 text-[#A594FD] flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
            <div><b>Работа в фоне и Автозапуск:</b> Выберите <i>«Без ограничений»</i> в экономии батареи (Xiaomi, Samsung, Realme), чтобы Android не усыплял службу в фоне.</div>
          </li>
        </ul>
      </div>

      <!-- Пояснение о безопасности -->
      <div class="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-2.5 flex items-start gap-2 text-xs text-blue-200/90 leading-snug">
        <i data-lucide="shield-check" class="w-4 h-4 text-[#8C7DFF] flex-shrink-0 mt-0.5"></i>
        <div class="text-[10.5px] leading-relaxed">
          Наше приложение обрабатывает исключительно push-уведомления о покупках от банков — личные сообщения, SMS и звонки никогда не читаются.
        </div>
      </div>

      <div class="space-y-1.5 pt-0.5">
        <button type="button" onclick="handleAcceptBankPushPrompt()" class="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#6C5DD3] to-[#8C7DFF] hover:opacity-90 active:scale-98 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#6C5DD3]/30">
          <i data-lucide="check" class="w-4 h-4"></i>
          <span>Включить доступ к пушам</span>
        </button>
        <button type="button" onclick="openBatteryOptimizationSettings()" class="w-full py-2.5 px-4 rounded-2xl bg-[#212430] hover:bg-[#2A2D3C] active:scale-98 text-amber-300 text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer">
          <i data-lucide="battery-charging" class="w-3.5 h-3.5"></i>
          <span>Настроить работу в фоне (Батарея / Автозапуск)</span>
        </button>
        <button type="button" onclick="closeBankPushPermissionPrompt()" class="w-full py-2 px-4 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-98 text-gray-400 hover:text-white text-xs font-semibold transition-all cursor-pointer">
          Настроить позже
        </button>
      </div>
    </div>
  `;

  if (typeof lucide !== 'undefined') lucide.createIcons({ root: modal });
  modal.classList.remove('hidden');
}

function openBatteryOptimizationSettings() {
  if (window.Capacitor?.Plugins?.BankPush?.openBatterySettings) {
    window.Capacitor.Plugins.BankPush.openBatterySettings().catch(() => {
      openBankPushPermissionSettings();
    });
  } else {
    openBankPushPermissionSettings();
  }
}
window.openBatteryOptimizationSettings = openBatteryOptimizationSettings;

function closeBankPushPermissionPrompt() {
  window._isBankPushPromptOpen = false;
  const modal = document.getElementById('bank-push-permission-prompt-modal');
  if (modal) modal.classList.add('hidden');
  localStorage.setItem('bank_push_permission_prompt_dismissed_at', Date.now().toString());
}

function handleAcceptBankPushPrompt() {
  closeBankPushPermissionPrompt();
  requestPostNotificationPermission();
  openBankPushPermissionSettings();
}

async function checkAndPromptBankPushPermission(delayMs = 2500) {
  // 1. Если сейчас открыто окно обновления приложения — откладываем проверку
  if (window._isAppUpdateModalOpen) return;

  // 2. Если запущено не в APK или пользователь выключил авто-учет
  if (!isNativeAppPlatform() || !isBankPushAutoExpenseEnabled()) {
    return;
  }

  const dismissedAt = parseInt(
    localStorage.getItem('bank_push_permission_prompt_dismissed_at') || '0',
    10
  );
  // Не показываем чаще, чем раз в 24 часа, если пользователь уже закрывал окно
  if (Date.now() - dismissedAt < 24 * 60 * 60 * 1000) {
    return;
  }

  setTimeout(async () => {
    if (window._isAppUpdateModalOpen) return;
    try {
      // Если пользователь отключил в процессе ожидания
      if (!isBankPushAutoExpenseEnabled()) {
        return;
      }
      const isGranted = await checkBankPushPermissions();
      if (!isGranted) {
        if (window._isAppUpdateModalOpen) return;
        openBankPushPermissionPrompt();
      }
    } catch (_e) {
      /* ignore */
    }
  }, delayMs);
}

// 13. Глобальный экспорт функций
window.isNativeAppPlatform = isNativeAppPlatform;
window.isPwaStandalone = isPwaStandalone;
window.openWidgetHubModal = () => {};
window.closeWidgetHubModal = () => {};
window.checkAndShowWidgetPrompt = () => {};
window.triggerQuickNewExpense = triggerQuickNewExpense;

// Экспорты модуля автоматического учета по банковским пушам
window.scoreBankPushNotification = scoreBankPushNotification;
window.parseBankPushText = parseBankPushText;
window.saveAutoExpenseTransaction = saveAutoExpenseTransaction;
window.sendAppLocalNotification = sendAppLocalNotification;
window.isBankPushNotifyOnSaveEnabled = isBankPushNotifyOnSaveEnabled;
window.toggleBankPushNotifyOnSave = toggleBankPushNotifyOnSave;
window.checkBankPushPermissions = checkBankPushPermissions;
window.checkPostNotificationPermission = checkPostNotificationPermission;
window.requestPostNotificationPermission = requestPostNotificationPermission;
window.openBankPushPermissionSettings = openBankPushPermissionSettings;
window.isBankPushAutoExpenseEnabled = isBankPushAutoExpenseEnabled;
window.toggleBankPushAutoExpense = toggleBankPushAutoExpense;
window.initBankPushListener = initBankPushListener;
window.openBankPushModal = openBankPushModal;
window.closeBankPushModal = closeBankPushModal;
window.openBankPushPermissionPrompt = openBankPushPermissionPrompt;
window.closeBankPushPermissionPrompt = closeBankPushPermissionPrompt;
window.checkAndUpdatePushPermissionsUI = checkAndUpdatePushPermissionsUI;
window.handleAcceptBankPushPrompt = handleAcceptBankPushPrompt;
window.checkAndPromptBankPushPermission = checkAndPromptBankPushPermission;

// Автоматическая инициализация слушателя при загрузке скрипта и отслеживание возврата в приложение
if (typeof window !== 'undefined') {
  setTimeout(() => {
    initBankPushListener();
    syncAuthCredentialsToBankPush();
  }, 1000);

  window.addEventListener('focus', () => {
    checkAndUpdatePushPermissionsUI();
    syncAuthCredentialsToBankPush();
  });

  if (window.auth?.onIdTokenChanged) {
    window.auth.onIdTokenChanged(() => {
      syncAuthCredentialsToBankPush();
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkAndUpdatePushPermissionsUI();
    }
  });

  if (window.Capacitor?.Plugins?.App?.addListener) {
    try {
      window.Capacitor.Plugins.App.addListener('appStateChange', state => {
        if (state && state.isActive) {
          checkAndUpdatePushPermissionsUI();
        }
      }).catch(() => {});
    } catch (_e) {
      /* ignore */
    }
  }
}
