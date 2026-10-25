/**
 * banks/sber.js
 * Sberbank statement parser adapter.
 */

(function () {
  function escapeRegExp(str) {
    return (str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  const sberAdapter = {
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
        'Скачайте сформированный PDF-документ',
      ],
    },
    getScore: p => {
      let score = 0;
      if (/лицензи[яи][^\d]*1481\b/i.test(p) || p.includes('1481')) score += 10;
      if (
        p.includes('пао сбербанк') ||
        p.includes('сбербанк россии') ||
        p.includes('сбербанк онлайн') ||
        p.includes('sberbank online')
      ) {
        score += 8;
      } else if (p.includes('сбербанк') || p.includes('сбер')) {
        score += 5;
      }
      if (p.includes('sberbank.ru') || p.includes('sber.ru')) score += 5;
      if (
        p.includes('отчет по счету') ||
        p.includes('выписка по счету дебетовой карты') ||
        p.includes('выписка по счету карты') ||
        p.includes('выписка по счёту')
      ) {
        score += 4;
      }
      return score;
    },
    detect: function (p) {
      return this.getScore(p) >= 5;
    },
    isTxStart: (l, _nextLine, currentBlock) => {
      if (!l) return false;
      if (currentBlock && currentBlock.length > 0) {
        const isProcessingLine =
          /^\s*\d{2}\.\d{2}\.\d{4}\s+(?:\d{5,8}|[A-Za-z0-9_-]{5,10})\b/i.test(l);
        if (isProcessingLine) return false;
      }
      return /^\s*\d{2}\.\d{2}\.\d{4}(?:\s+\d{2}:\d{2})?\s+[А-Яа-яЁёA-Za-z]/.test(l);
    },
    isServiceLine: l => {
      const lower = l.toLowerCase();
      return (
        lower.includes('пао сбербанк') ||
        lower.includes('генеральная лицензия') ||
        lower.includes('отчет по счету') ||
        lower.includes('входящий остаток') ||
        lower.includes('исходящий остаток') ||
        lower.includes('всего зачислений') ||
        lower.includes('всего списаний')
      );
    },
    customMerchantFilter: (lines, _fullText, _amount, _dateStr, type) => {
      const full = lines.join(' ');
      let bankCategory = null;
      let merchant = '';

      // 1. Extract bank category
      const catSplit =
        typeof window.splitBankCategoryAndMerchant === 'function'
          ? window.splitBankCategoryAndMerchant(full)
          : null;
      if (catSplit && catSplit.bankCategory) {
        bankCategory = catSplit.bankCategory;
      }

      // 2. Authorization code and operation description
      const sberAuthMatch = full.match(
        /(?:\d{2}\.\d{2}\.\d{4}\s+)?\b\d{5,8}\b\s+([^]+?)(?=(?:\.?\s*операци[яиею]|\bпо\s+карте|\bс\s+карты|\bсо\s+счета|\bна\s+карту|\bкарта\b|\*\*\*\*|\b\d{4}\b)|$)/i
      );

      if (sberAuthMatch && sberAuthMatch[1].trim().length >= 2) {
        merchant = sberAuthMatch[1].trim();
      } else if (lines.length >= 2) {
        const second = lines
          .slice(1)
          .join(' ')
          .replace(/^\s*\d{2}\.\d{2}\.\d{4}\s*/g, ' ')
          .replace(/(?:^|\s+)\d{5,8}(?=\s+|$)/g, ' ')
          .replace(/(?:^|\s+)(?:0t0|ot0|oto|ko|t01|pos)[*_\s]\s*/gi, ' ')
          .replace(/([+−–—\u2012\u2013\u2014\u2212-]?\s*[\d\s\xa0]+[.,]\d{2})/g, ' ')
          .trim();
        merchant = second;
      }

      if (!merchant || merchant.length < 2) {
        let cleanFirst = lines[0]
          .replace(/^\s*\d{2}\.\d{2}\.\d{4}\s*(?:\d{2}:\d{2})?\s*/, '')
          .replace(/([+−–—\u2012\u2013\u2014\u2212-]?\s*[\d\s\xa0]+[.,]\d{2})/g, '')
          .trim();
        if (bankCategory) {
          cleanFirst = cleanFirst
            .replace(new RegExp('^' + escapeRegExp(bankCategory), 'i'), '')
            .trim();
        }
        merchant = cleanFirst;
      }

      // Strip card tokens and clean merchant title
      if (typeof window.stripCardTokens === 'function') {
        merchant = window.stripCardTokens(merchant);
      }
      if (typeof window.cleanMerchantTitle === 'function') {
        merchant = window.cleanMerchantTitle(merchant);
      }

      // Remove city and terminal suffixes
      merchant = merchant
        .replace(
          /(?:^|[^\wа-яёА-ЯЁ])(?:moscow|moskva|sankt-?peterbur[g]?|spb|chelyabinsk|kazan|rostov|samara|ufa|perm|novosibirsk|ekaterinburg|krasnodar|vladivostok|rus|ru)(?=[^\wа-яёА-ЯЁ]|$)/gi,
          ' '
        )
        .replace(/\b\d{3,6}\b/g, ' ')
        .replace(/\b(?:pp\s+card|card)\b.*$/gi, ' ')
        .replace(/(?:^|[^\wа-яёА-ЯЁ])\.?\s*операци[яиею](?=[^\wа-яёА-ЯЁ]|$)/gi, ' ')
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
      if (
        cleanM &&
        cleanM.length >= 2 &&
        !/^(?:операция|операция сбербанк|банковская операция)$/i.test(cleanM)
      ) {
        return {
          merchant: cleanM,
          bankCategory: bankCategory,
        };
      }
      return {
        merchant: type === 'Доход' ? 'Поступление средств' : 'Операция Сбербанк',
        bankCategory: bankCategory,
      };
    },
  };

  if (typeof window.registerBankAdapter === 'function') {
    window.registerBankAdapter(sberAdapter);
  } else {
    window.BANK_REGISTRY = window.BANK_REGISTRY || [];
    window.BANK_REGISTRY.push(sberAdapter);
  }
})();
