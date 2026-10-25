/**
 * banks/ozon.js
 * Ozon Bank statement parser adapter.
 */

(function () {
  const ozonAdapter = {
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
        'Скачайте сформированный PDF-документ',
      ],
    },
    getScore: p => {
      let score = 0;
      if (/лицензи[яи][^\d]*3542\b/i.test(p) || p.includes('3542')) score += 10;
      if (
        p.includes('озон банк') ||
        p.includes('ozon банк') ||
        p.includes('ozon bank') ||
        p.includes('еком банк') ||
        p.includes('ecom bank')
      ) {
        score += 8;
      }
      if (p.includes('finance.ozon.ru') || p.includes('ozon.ru')) score += 5;
      if (
        p.includes('справка о движении денежных средств') ||
        p.includes('справка о движении средств') ||
        p.includes('движении средств')
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
      return /^\s*\d{2}\.\d{2}\.\d{4}/.test(l.trim());
    },
    isServiceLine: l => {
      const lower = l.toLowerCase();
      return (
        lower.includes('озон банк') ||
        lower.includes('еком банк') ||
        lower.includes('справка о движении') ||
        lower.includes('исходящий остаток') ||
        lower.includes('итого по операциям')
      );
    },
    customMerchantFilter: (lines, _fullText, _amount, _dateStr, type) => {
      const full = lines.join(' ');
      const pos = full.match(/(?:сумма\s*[\d.]+\s*в|\bв)\s+([\s\S]+?)\s+дата\s*\d{4}/i);
      if (pos && pos[1].trim()) {
        const m = pos[1]
          .replace(/\s+(RU|RUS)$/i, '')
          .replace(/\s+/g, ' ')
          .trim();
        const cleaned =
          typeof window.cleanMerchantTitle === 'function' ? window.cleanMerchantTitle(m) : m;
        const stripped =
          typeof window.stripCardTokens === 'function' ? window.stripCardTokens(cleaned) : cleaned;
        const titleCase =
          typeof window.toCleanTitleCase === 'function'
            ? window.toCleanTitleCase(stripped)
            : stripped;
        return { merchant: titleCase };
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
          merchant: s
            ? `Перевод СБП (${s[1].trim()})`
            : type === 'Доход'
              ? 'Входящий перевод СБП'
              : 'Перевод через СБП',
          bankCategory: 'Перевод',
        };
      }
      return null;
    },
  };

  if (typeof window.registerBankAdapter === 'function') {
    window.registerBankAdapter(ozonAdapter);
  } else {
    window.BANK_REGISTRY = window.BANK_REGISTRY || [];
    window.BANK_REGISTRY.push(ozonAdapter);
  }
})();
