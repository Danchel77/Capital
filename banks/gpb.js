/**
 * banks/gpb.js
 * Gazprombank statement parser adapter.
 */

(function () {
  const gpbAdapter = {
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
        'Скачайте сформированный PDF-документ',
      ],
    },
    getScore: p => {
      let score = 0;
      if (/лицензи[яи][^\d]*354\b/i.test(p)) score += 10;
      if (
        p.includes('банк гпб') ||
        p.includes('газпромбанк') ||
        p.includes('гпб (ао)') ||
        p.includes('гпб (акционерное')
      ) {
        score += 8;
      }
      if (p.includes('gazprombank.ru')) score += 5;
      if (p.includes('дата отражения') || p.includes('номер банковского счета')) score += 4;
      return score;
    },
    detect: function (p) {
      return this.getScore(p) >= 5;
    },
    isTxStart: l => /^(\d{2}\.\d{2}\.\d{4})\s+(\d{2}\.\d{2}\.\d{4})/.test(l.trim()),
    isServiceLine: l => {
      const lower = l.toLowerCase();
      return (
        lower.includes('газпромбанк (акционерное общество)') ||
        lower.includes('генеральная лицензия банка россии') ||
        lower.includes('исходящий остаток') ||
        lower.includes('итого оборотов') ||
        lower.includes('дата отражения')
      );
    },
    customMerchantFilter: (lines, _fullText, _amount, _dateStr, _type) => {
      const full = lines.join(' ');
      const dev =
        typeof window.extractDeviceField === 'function' ? window.extractDeviceField(full) : null;
      const sbp = full.match(/Перевод\s+(?:по\s+СБП|клиенту|от)\s+([^.]+?)(?:\.|$)/i);
      const merchant = dev ? dev : sbp ? sbp[0].trim() : null;
      if (!merchant) return null;

      if (/sbp\s+c2c\s+spisanie/i.test(merchant)) {
        return { merchant: 'Перевод через СБП', bankCategory: 'Перевод' };
      } else if (/sbp\s+c2c\s+zachislenie/i.test(merchant)) {
        return { merchant: 'Входящий перевод СБП', bankCategory: 'Перевод' };
      } else if (/sbp\s+pl\s+qr/i.test(merchant)) {
        return { merchant: 'Оплата через СБП QR', bankCategory: 'Платежи' };
      } else {
        const link =
          typeof window.extractWebsiteLink === 'function'
            ? window.extractWebsiteLink(merchant)
            : null;
        if (link) {
          return { merchant: /sbp/i.test(merchant) ? `SBP ${link}` : link };
        }
        const stripped =
          typeof window.stripCardTokens === 'function'
            ? window.stripCardTokens(merchant)
            : merchant;
        const cleanTitle =
          typeof window.toCleanTitleCase === 'function'
            ? window.toCleanTitleCase(stripped)
            : stripped;
        return { merchant: cleanTitle };
      }
    },
  };

  if (typeof window.registerBankAdapter === 'function') {
    window.registerBankAdapter(gpbAdapter);
  } else {
    window.BANK_REGISTRY = window.BANK_REGISTRY || [];
    window.BANK_REGISTRY.push(gpbAdapter);
  }
})();
