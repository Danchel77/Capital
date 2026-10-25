/**
 * banks/tbank.js
 * T-Bank (Tinkoff) statement parser adapter.
 */

(function () {
  const tbankAdapter = {
    id: 'TBANK',
    name: 'Т-Банк',
    slug: 'tbank',
    iconKey: 'tbank',
    badgeColor: 'bg-yellow-900/60 text-yellow-300 border-yellow-700/60',
    guide: {
      doc: 'Выписка по карте или счёту (PDF)',
      steps: [
        'Откройте приложение Т-Банка (Тинькофф)',
        'Выберите нужную карту или платёжный счёт',
        'Пролистайте вниз до «Выписка» или нажмите «Справки»',
        'Выберите «Выписка по карте», укажите период',
        'Скачайте сформированный PDF-документ',
      ],
    },
    getScore: p => {
      let score = 0;
      if (/лицензи[яи][^\d]*2673\b/i.test(p) || p.includes('2673')) score += 10;
      if (
        p.includes('тинькофф') ||
        p.includes('т-банк') ||
        p.includes('т банк') ||
        p.includes('tinkoff') ||
        p.includes('t-bank') ||
        p.includes('тбанк') ||
        p.includes('tcs bank')
      ) {
        score += 8;
      }
      if (p.includes('tbank.ru') || p.includes('tinkoff.ru')) score += 5;
      if (
        p.includes('выписка по счету') ||
        p.includes('выписка по карте') ||
        p.includes('справка о движении')
      ) {
        score += 4;
      }
      return score;
    },
    detect: function (p) {
      return this.getScore(p) >= 5;
    },
    isTxStart: l => {
      if (!l) return false;
      return /^\s*\d{2}\.\d{2}\.\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?\s+/.test(l.trim());
    },
    isServiceLine: l => {
      const lower = l.toLowerCase();
      return (
        lower.includes('тинькофф банк') ||
        lower.includes('ао «тбанк»') ||
        lower.includes('ао «т-банк»') ||
        lower.includes('tinkoff bank') ||
        lower.includes('tbank') ||
        lower.includes('исходящий остаток') ||
        lower.includes('входящий остаток') ||
        lower.includes('итого по выписке') ||
        lower.includes('ставка по кредиту') ||
        lower.includes('лимит задолженности') ||
        lower.includes('плата за обслуживание')
      );
    },
    customMerchantFilter: (lines, _fullText, _amount, _dateStr, type) => {
      const full = lines.join(' ');
      let bankCategory = null;

      // 1. Check for SBP transfers
      if (/перевод.*сбп|сбп.*перевод|пополнение.*сбп/i.test(full)) {
        const sbp = full.match(/(?:Отправитель|Получатель|От|Кому):\s*([^.]*?)(?:Без НДС|\.|$)/i);
        return {
          merchant: sbp
            ? `Перевод СБП (${sbp[1].trim()})`
            : type === 'Доход'
              ? 'Входящий перевод СБП'
              : 'Перевод через СБП',
          bankCategory: 'Перевод',
        };
      }

      // 2. Check for cashback and interest
      if (/вознаграждение\s+за\s+операции|кэшбэк|cashback/i.test(full)) {
        return {
          merchant: 'Кэшбэк Т-Банк',
          bankCategory: 'Кэшбек',
        };
      }
      if (/проценты\s+на\s+остаток/i.test(full)) {
        return {
          merchant: 'Проценты на остаток',
          bankCategory: 'Проценты',
        };
      }

      // 3. Extract category
      const catSplit =
        typeof window.splitBankCategoryAndMerchant === 'function'
          ? window.splitBankCategoryAndMerchant(full)
          : null;
      if (catSplit && catSplit.bankCategory) {
        bankCategory = catSplit.bankCategory;
      }

      let merchant = full
        .replace(/^\s*\d{2}\.\d{2}\.\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?\s*/g, ' ')
        .replace(/\bMCC\s*\d{4}\b/gi, ' ')
        .replace(/([+−–—\u2012\u2013\u2014\u2212-]?\s*[\d\s\xa0]+[.,]\d{2})\s*₽?/g, ' ')
        .replace(/(?:^|[^\wа-яёА-ЯЁ])(?:moscow|moskva|spb|rus|ru)(?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (typeof window.stripCardTokens === 'function') {
        merchant = window.stripCardTokens(merchant);
      }
      if (typeof window.cleanMerchantTitle === 'function') {
        merchant = window.cleanMerchantTitle(merchant);
      }

      const cleanM =
        typeof window.toCleanTitleCase === 'function'
          ? window.toCleanTitleCase(merchant)
          : merchant;
      if (cleanM && cleanM.length >= 2 && !/^(?:операция|банковская операция)$/i.test(cleanM)) {
        return {
          merchant: cleanM,
          bankCategory: bankCategory,
        };
      }

      return {
        merchant: type === 'Доход' ? 'Поступление средств' : 'Операция Т-Банк',
        bankCategory: bankCategory,
      };
    },
  };

  if (typeof window.registerBankAdapter === 'function') {
    window.registerBankAdapter(tbankAdapter);
  } else {
    window.BANK_REGISTRY = window.BANK_REGISTRY || [];
    window.BANK_REGISTRY.push(tbankAdapter);
  }
})();
