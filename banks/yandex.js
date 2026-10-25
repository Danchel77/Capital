/**
 * banks/yandex.js
 * Yandex Bank statement parser adapter.
 */

(function () {
  const yandexAdapter = {
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
        'Скачайте сформированный PDF-документ',
      ],
    },
    getScore: p => {
      let score = 0;
      if (/лицензи[яи][^\d]*3027\b/i.test(p) || p.includes('3027')) score += 10;
      if (
        p.includes('яндекс банк') ||
        p.includes('кб яндекс') ||
        p.includes('yandex bank') ||
        p.includes('ао яндекс')
      ) {
        score += 8;
      }
      if (
        p.includes('yabank.yandex.ru') ||
        p.includes('yandex.ru/bank') ||
        p.includes('yandex pay') ||
        p.includes('яндекс пэй')
      ) {
        score += 5;
      }
      if (p.includes('договору сейва') || p.includes('сейв') || p.includes('справка об остатке')) {
        score += 4;
      }
      return score;
    },
    detect: function (p) {
      return this.getScore(p) >= 5;
    },
    isTxStart: l =>
      /^(?:оплата(?:\s+товаров(?:\s+и\s+услуг|\/услуг)?|\s+услуг)?|покупка|перевод|снятие|пополнение|зачисление|возврат|списание|выплата)(?:\s+|$|[.,:;])/iu.test(
        l.trim()
      ) ||
      /^\s*\d{2}\.\d{2}\.\d{4}\s+(?:оплата|покупка|перевод|пополнение|зачисление|возврат|списание)/iu.test(
        l.trim()
      ),
    isServiceLine: l => {
      const lower = l.toLowerCase();
      return (
        (lower.includes('операции') && lower.includes('мск')) ||
        (lower.includes('обработки') && lower.includes('договора')) ||
        lower.includes('исходящий остаток') ||
        lower.includes('итого списаний') ||
        lower.includes('итого зачислений') ||
        lower.includes('с уважением') ||
        lower.includes('начальник отдела') ||
        lower.includes('самохвалова') ||
        lower.includes('садовническая') ||
        lower.includes('yabank.yandex.ru')
      );
    },
    customMerchantFilter: (lines, _fullText, _amount, _dateStr, type) => {
      const full = lines.join(' ');
      if (/перевод.*сбп/i.test(full)) {
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
      let merchant = full
        .replace(/^Оплата(?:\s+товаров(?:\s+и\s+услуг|\/услуг)?|\s+услуг)?\s*/iu, '')
        .replace(
          /^(?:покупка|перевод|снятие|пополнение|зачисление|возврат|списание|выплата)\s*/iu,
          ''
        )
        .replace(/\b\d{2}\.\d{2}\.\d{4}\b/g, ' ')
        .replace(/\*\d{4}/g, ' ')
        .replace(/([+−–—\u2012\u2013\u2014\u2212-]?\s*[\d\s\xa0]+[.,]\d{2})\s*₽?/g, ' ')
        .replace(
          /(?:^|[^\wа-яёА-ЯЁ])(?:в\s+)?\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:мск|utc|gmt))?(?=[^\wа-яёА-ЯЁ]|$)/gi,
          ' '
        )
        .replace(
          /(?:^|[^\wа-яёА-ЯЁ])(?:операции\s+обработки|операции\s+договора|договора\s+мск|операции|обработки|договора|мск|карты|валюте)(?=[^\wа-яёА-ЯЁ]|$)/gi,
          ' '
        )
        .replace(/(?:^|\s+)[вv]$/i, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (typeof window.stripCardTokens === 'function') {
        merchant = window.stripCardTokens(merchant);
      }
      if (typeof window.cleanMerchantTitle === 'function') {
        merchant = window.cleanMerchantTitle(merchant);
      }

      if (merchant.length >= 2 && !/^\d+$/.test(merchant)) {
        return {
          merchant:
            typeof window.toCleanTitleCase === 'function'
              ? window.toCleanTitleCase(merchant)
              : merchant,
        };
      }
      return null;
    },
  };

  if (typeof window.registerBankAdapter === 'function') {
    window.registerBankAdapter(yandexAdapter);
  } else {
    window.BANK_REGISTRY = window.BANK_REGISTRY || [];
    window.BANK_REGISTRY.push(yandexAdapter);
  }
})();
