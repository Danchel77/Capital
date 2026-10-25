/**
 * banks/vtb.js
 * VTB statement parser adapter.
 */

(function () {
  const vtbAdapter = {
    id: 'VTB',
    name: 'ВТБ',
    slug: 'vtb',
    iconKey: 'vtb',
    badgeColor: 'bg-blue-950 text-blue-200 border-blue-600/60',
    guide: {
      doc: 'Выписка по счёту или карте (PDF)',
      steps: [
        'Откройте приложение «ВТБ Онлайн»',
        'Выберите нужную карту или мастер-счёт',
        'Перейдите в раздел «Услуги» или «Выписки и справки»',
        'Нажмите «Выписка по счёту», задайте необходимый период',
        'Сформируйте и скачайте PDF-файл',
      ],
    },
    getScore: p => {
      let score = 0;
      if (/лицензи[яи][^\d]*1000\b/i.test(p) || p.includes('1000')) score += 10;
      if (
        p.includes('банк втб') ||
        p.includes('пао втб') ||
        p.includes('втб (пао)') ||
        p.includes('втб онлайн') ||
        p.includes('vtb')
      ) {
        score += 8;
      }
      if (p.includes('vtb.ru')) score += 5;
      if (
        p.includes('выписка по мастер-счету') ||
        p.includes('выписка по счёту') ||
        p.includes('выписка по счету') ||
        p.includes('справка по карте')
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
      return (
        /^\s*\d{2}\.\d{2}\.\d{4}\s+\d{2}\.\d{2}\.\d{4}/.test(l.trim()) ||
        /^\s*\d{2}\.\d{2}\.\d{4}(?:\s+\d{2}:\d{2})?\s+/.test(l.trim())
      );
    },
    isServiceLine: l => {
      const lower = l.toLowerCase();
      return (
        lower.includes('банк втб (пао)') ||
        lower.includes('генеральная лицензия банка россии № 1000') ||
        lower.includes('исходящий остаток') ||
        lower.includes('входящий остаток') ||
        lower.includes('итого оборотов') ||
        lower.includes('мастер-счет') ||
        lower.includes('vtb.ru')
      );
    },
    customMerchantFilter: (lines, _fullText, _amount, _dateStr, type) => {
      const full = lines.join(' ');
      let bankCategory = null;

      // 1. SBP Transfers
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

      // 2. Extract category
      const catSplit =
        typeof window.splitBankCategoryAndMerchant === 'function'
          ? window.splitBankCategoryAndMerchant(full)
          : null;
      if (catSplit && catSplit.bankCategory) {
        bankCategory = catSplit.bankCategory;
      }

      let merchant = full
        .replace(/^\s*\d{2}\.\d{2}\.\d{4}(?:\s+\d{2}\.\d{2}\.\d{4})?\s*/g, ' ')
        .replace(/\b\d{2}:\d{2}(?::\d{2})?\b/g, ' ')
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
        merchant: type === 'Доход' ? 'Поступление средств' : 'Операция ВТБ',
        bankCategory: bankCategory,
      };
    },
  };

  if (typeof window.registerBankAdapter === 'function') {
    window.registerBankAdapter(vtbAdapter);
  } else {
    window.BANK_REGISTRY = window.BANK_REGISTRY || [];
    window.BANK_REGISTRY.push(vtbAdapter);
  }
})();
