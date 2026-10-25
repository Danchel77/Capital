/**
 * banks/alfa.js
 * Alfa-Bank statement parser adapter.
 */

(function () {
  const alfaAdapter = {
    id: 'ALFA',
    name: 'Альфа-Банк',
    slug: 'alfabank',
    iconKey: 'alfa',
    badgeColor: 'bg-red-900/60 text-red-300 border-red-700/60',
    guide: {
      doc: 'Выписка по счёту или карте (PDF)',
      steps: [
        'Откройте приложение «Альфа-Банк»',
        'Выберите нужный счет или карту',
        'Перейдите в «Выписка по счёту» или нажмите «Справки и выписки»',
        'Укажите период формирования выписки',
        'Выберите формат PDF и скачайте сформированный файл',
      ],
    },
    getScore: p => {
      let score = 0;
      if (/лицензи[яи][^\d]*1326\b/i.test(p) || p.includes('1326')) score += 10;
      if (
        p.includes('альфа-банк') ||
        p.includes('альфа банк') ||
        p.includes('alfa-bank') ||
        p.includes('alfabank') ||
        p.includes('ао «альфа-банк»')
      ) {
        score += 8;
      }
      if (p.includes('alfabank.ru')) score += 5;
      if (
        p.includes('выписка по текущему счету') ||
        p.includes('выписка по счёту') ||
        p.includes('выписка по счету')
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
      return /^\s*\d{2}\.\d{2}\.\d{2,4}\s+/.test(l.trim());
    },
    isServiceLine: l => {
      const lower = l.toLowerCase();
      return (
        lower.includes('альфа-банк') ||
        lower.includes('ао «альфа-банк»') ||
        lower.includes('генеральная лицензия') ||
        lower.includes('входящий остаток') ||
        lower.includes('исходящий остаток') ||
        lower.includes('доступный остаток') ||
        lower.includes('обороты за период') ||
        lower.includes('alfabank.ru')
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

      // 2. Extract bank category
      const catSplit =
        typeof window.splitBankCategoryAndMerchant === 'function'
          ? window.splitBankCategoryAndMerchant(full)
          : null;
      if (catSplit && catSplit.bankCategory) {
        bankCategory = catSplit.bankCategory;
      }

      let merchant = full
        .replace(/^\s*\d{2}\.\d{2}\.\d{2,4}(?:\s+\d{2}:\d{2})?\s*/g, ' ')
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
        merchant: type === 'Доход' ? 'Поступление средств' : 'Операция Альфа-Банк',
        bankCategory: bankCategory,
      };
    },
  };

  if (typeof window.registerBankAdapter === 'function') {
    window.registerBankAdapter(alfaAdapter);
  } else {
    window.BANK_REGISTRY = window.BANK_REGISTRY || [];
    window.BANK_REGISTRY.push(alfaAdapter);
  }
})();
