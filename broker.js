/**
 * broker.js
 * Broker portfolio, MOEX securities, cash, trade records, and equity curve chart.
 * True OLED Obsidian Minimalist design system.
 */

let brokerChartObj = null;
let currentBrokerTimeframe = 'ALL';
let _lastMoexAutoUpdateTimestamp = 0;

// ==========================================
// 1. Broker Data Processing & Trade Detection
// ==========================================
function processBroker(ops) {
  const allOps = [];

  // Известные тикеры БПИФ и ETF
  const KNOWN_FUNDS = new Set([
    'EQMX',
    'LQDT',
    'TMOS',
    'SBMM',
    'AKME',
    'TRUR',
    'TGLD',
    'SBMX',
    'DIVD',
    'INFL',
    'RSHU',
    'GOLD',
  ]);

  (ops || []).forEach(o => {
    if (o.type === 'Цель') return; // Игнорируем устаревшие связки с целями

    const rawDate = o.date || new Date().toISOString().split('T')[0];
    const ds = typeof formatDateStr === 'function' ? formatDateStr(rawDate, 'd MMM') : rawDate;
    const fullDate =
      typeof formatDateStr === 'function' ? formatDateStr(rawDate, 'd MMMM yyyy') : rawDate;
    const parsedDate =
      typeof parseAnyDate === 'function' ? parseAnyDate(rawDate) : new Date(rawDate);
    const timestamp = parsedDate ? parsedDate.getTime() : new Date(rawDate).getTime();

    const bal =
      o.balance !== undefined
        ? parseFloat(o.balance) || 0
        : typeof parseAmount === 'function'
          ? parseAmount(o.amount)
          : parseFloat(o.amount) || 0;

    let tradeType = null;
    const rawType = (o.type || '').trim();

    if (rawType === 'Покупка' || rawType === 'Пополнение' || o.tradeType === 'buy') {
      tradeType = 'buy';
    } else if (rawType === 'Продажа' || rawType === 'Вывод' || o.tradeType === 'sell') {
      tradeType = 'sell';
    }

    const item = {
      id: o.id,
      rawDate,
      date: rawDate,
      x: ds,
      fullDate,
      timestamp,
      y: bal,
      balance: bal,
      type: rawType || 'Баланс',
      tradeType,
      ticker: o.ticker || '',
      name: o.name || '',
      quantity: parseFloat(o.quantity) || 0,
      price: parseFloat(o.price) || 0,
      amount: parseFloat(o.amount) || 0,
    };

    allOps.push(item);
  });

  // Сортировка по времени (от старых к новым)
  allOps.sort((a, b) => a.timestamp - b.timestamp);

  // Сворачивание точек по датам (одна дата = одна точка на линии)
  // Если в один день было несколько сделок или срезов, берем финальный баланс дня,
  // сохраняя информацию о сделке, если она была.
  const pointsByDate = new Map();

  allOps.forEach(op => {
    const existing = pointsByDate.get(op.rawDate);
    if (!existing) {
      pointsByDate.set(op.rawDate, { ...op });
    } else {
      // Обновляем финальный баланс на конец дня
      existing.y = op.y;
      existing.balance = op.balance;
      existing.timestamp = Math.max(existing.timestamp, op.timestamp);
      // Если хотя бы одна операция была сделкой, фиксируем маркер сделки
      if (op.tradeType) {
        existing.tradeType = op.tradeType;
        existing.type = op.type;
        existing.ticker = op.ticker || existing.ticker;
        existing.name = op.name || existing.name;
        existing.quantity = (existing.quantity || 0) + (op.quantity || 0);
        existing.price = op.price || existing.price;
        existing.amount = (existing.amount || 0) + (op.amount || 0);
      }
    }
  });

  const chartPoints = Array.from(pointsByDate.values()).sort((a, b) => a.timestamp - b.timestamp);

  const currentBalance = chartPoints.length > 0 ? chartPoints[chartPoints.length - 1].y : 0;

  return {
    balance: currentBalance,
    chartData: chartPoints,
    history: allOps,
    knownFunds: KNOWN_FUNDS,
  };
}

// ==========================================
// 2. Broker Main View
// ==========================================
function renderBroker() {
  const assets = window.Cache?.brokerAssets || [];
  const mainCard = document.getElementById('broker-main-card');
  const emptyState = document.getElementById('broker-empty-state');

  // Отрисовка списка активов (кэш + бумаги)
  if (typeof renderMoexPortfolio === 'function') {
    renderMoexPortfolio();
  }

  if (assets.length === 0) {
    if (mainCard) mainCard.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    if (brokerChartObj) {
      brokerChartObj.destroy();
      brokerChartObj = null;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  if (mainCard) mainCard.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');

  let cashSum = 0;
  let securitiesSum = 0;

  assets.forEach(asset => {
    const qty = parseFloat(asset.quantity) || 0;
    const isCash = asset.type === 'cash';
    const price = isCash ? 1 : parseFloat(asset.currentPrice) || parseFloat(asset.price) || 0;
    const val = qty * price;

    if (isCash) {
      cashSum += val;
    } else {
      securitiesSum += val;
    }
  });

  const totalPortfolioValue = Math.round(cashSum + securitiesSum);
  cashSum = Math.round(cashSum);
  securitiesSum = Math.round(securitiesSum);

  // Скрытые поля для совместимости
  const balEl = document.getElementById('broker-balance');
  if (balEl) balEl.innerText = formatMoney(totalPortfolioValue);

  const assetsSumEl = document.getElementById('broker-assets-sum');
  if (assetsSumEl) assetsSumEl.innerText = formatMoney(securitiesSum);

  const cashSumEl = document.getElementById('broker-cash-sum');
  if (cashSumEl) cashSumEl.innerText = formatMoney(cashSum);

  // Отрисовка графика
  drawBrokerChart();

  // Фоновая актуализация котировок при открытии вкладки (с троттлингом)
  autoUpdateBrokerQuotesAndSnapshot();
}

// ==========================================
// 3. Smooth Spline Chart (Trade Markers Only)
// ==========================================
function drawBrokerChart() {
  const canvas = document.getElementById('brokerChart');
  if (!canvas) return;

  const br = window.Cache?.broker;
  let rawData = br?.chartData || [];

  // Если данных еще нет, но есть активы — добавим точку на сегодня
  if (rawData.length === 0 && (window.Cache?.brokerAssets || []).length > 0) {
    let sum = 0;
    (window.Cache.brokerAssets || []).forEach(a => {
      const q = parseFloat(a.quantity) || 0;
      const p = a.type === 'cash' ? 1 : parseFloat(a.currentPrice) || parseFloat(a.price) || 0;
      sum += q * p;
    });
    const todayStr = new Date().toISOString().split('T')[0];
    rawData = [
      {
        id: 'temp_today',
        rawDate: todayStr,
        date: todayStr,
        x: formatDateStr(todayStr, 'd MMM'),
        fullDate: formatDateStr(todayStr, 'd MMMM yyyy'),
        timestamp: Date.now(),
        y: Math.round(sum),
        balance: Math.round(sum),
        type: 'Баланс',
        tradeType: null,
      },
    ];
  }

  const ctx = canvas.getContext('2d');

  if (brokerChartObj) {
    brokerChartObj.destroy();
    brokerChartObj = null;
  }

  if (rawData.length === 0) return;

  const now = new Date();
  let filteredData = rawData;

  if (currentBrokerTimeframe === '1M') {
    const cut = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).getTime();
    filteredData = rawData.filter(p => p.timestamp >= cut);
  } else if (currentBrokerTimeframe === '3M') {
    const cut = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()).getTime();
    filteredData = rawData.filter(p => p.timestamp >= cut);
  } else if (currentBrokerTimeframe === '6M') {
    const cut = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()).getTime();
    filteredData = rawData.filter(p => p.timestamp >= cut);
  } else if (currentBrokerTimeframe === '1Y') {
    const cut = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).getTime();
    filteredData = rawData.filter(p => p.timestamp >= cut);
  }

  if (filteredData.length === 0) filteredData = rawData;

  const labels = filteredData.map(p => p.x);
  const data = filteredData.map(p => p.y);

  // Цвет кривой: спокойный благородный изумрудный при росте или нейтральный белый
  const startVal = data[0];
  const endVal = data[data.length - 1];
  const isPositive = endVal >= startVal;

  const lineColor = isPositive ? '#10B981' : '#F43F5E';
  const grad = ctx.createLinearGradient(0, 0, 0, 180);
  if (isPositive) {
    grad.addColorStop(0, 'rgba(16, 185, 129, 0.22)');
    grad.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
  } else {
    grad.addColorStop(0, 'rgba(244, 63, 94, 0.22)');
    grad.addColorStop(1, 'rgba(244, 63, 94, 0.0)');
  }

  // Настройка точек: видимые маркеры ТОЛЬКО на сделках (покупка / продажа)
  const pointRadii = [];
  const pointHoverRadii = [];
  const pointHitRadii = [];
  const pointBgColors = [];
  const pointBorderColors = [];
  const pointBorderWidths = [];

  for (let i = 0; i < filteredData.length; i++) {
    const pt = filteredData[i];

    if (pt.tradeType === 'buy') {
      // Покупка (buy) / довнесение кэша
      pointRadii.push(4.5);
      pointHoverRadii.push(7.5);
      pointHitRadii.push(20);
      pointBgColors.push('#10B981');
      pointBorderColors.push('#000000');
      pointBorderWidths.push(2);
    } else if (pt.tradeType === 'sell') {
      // Продажа (sell) / вывод кэша
      pointRadii.push(4.5);
      pointHoverRadii.push(7.5);
      pointHitRadii.push(20);
      pointBgColors.push('#F43F5E');
      pointBorderColors.push('#000000');
      pointBorderWidths.push(2);
    } else {
      // Обычный срез — нулевой радиус, тултип не вызывается
      pointRadii.push(0);
      pointHoverRadii.push(0);
      pointHitRadii.push(0);
      pointBgColors.push('transparent');
      pointBorderColors.push('transparent');
      pointBorderWidths.push(0);
    }
  }

  brokerChartObj = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          data: data,
          borderColor: lineColor,
          borderWidth: 2,
          backgroundColor: grad,
          fill: true,
          tension: 0.35,
          pointRadius: pointRadii,
          pointHoverRadius: pointHoverRadii,
          pointHitRadius: pointHitRadii,
          pointBackgroundColor: pointBgColors,
          pointBorderColor: pointBorderColors,
          pointBorderWidth: pointBorderWidths,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: 'nearest',
        intersect: true,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          // Тултип появляется ИСКЛЮЧИТЕЛЬНО на сделках
          filter: function (tooltipItem) {
            const pt = filteredData[tooltipItem.dataIndex];
            return Boolean(pt && pt.tradeType);
          },
          backgroundColor: '#0E1016',
          titleColor: '#A1A1AA',
          titleFont: { size: 11, weight: 'normal' },
          bodyColor: '#FFFFFF',
          bodyFont: { size: 12, weight: 'bold' },
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 12,
          displayColors: false,
          callbacks: {
            title: function (items) {
              if (!items || !items.length) return '';
              const idx = items[0].dataIndex;
              const pt = filteredData[idx];
              return pt ? pt.fullDate || pt.x : items[0].label;
            },
            label: function (item) {
              const idx = item.dataIndex;
              const pt = filteredData[idx];
              if (!pt || !pt.tradeType) return '';

              const lines = [];
              if (pt.tradeType === 'buy') {
                if (pt.ticker === 'RUB' || pt.type === 'Пополнение') {
                  lines.push(`Пополнение: +${formatMoney(pt.amount || pt.quantity)}`);
                } else {
                  lines.push(`Покупка ${pt.ticker}: +${pt.quantity} шт.`);
                }
              } else if (pt.tradeType === 'sell') {
                if (pt.ticker === 'RUB' || pt.type === 'Вывод') {
                  lines.push(`Списание: -${formatMoney(pt.amount || pt.quantity)}`);
                } else {
                  lines.push(`Продажа ${pt.ticker}: -${pt.quantity} шт.`);
                }
              }
              lines.push(`Портфель: ${formatMoney(pt.y)}`);
              return lines;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#71717A',
            font: { size: 10 },
            maxRotation: 0,
            minRotation: 0,
            maxTicksLimit: 5,
          },
          border: { display: false },
        },
        y: {
          display: false,
        },
      },
    },
  });

  window.brokerChartObj = brokerChartObj;
}

function setBrokerTimeframe(tf) {
  currentBrokerTimeframe = tf;
  document.querySelectorAll('.broker-tf-btn').forEach(btn => {
    const isAct = btn.dataset.tf === tf;
    if (isAct) {
      btn.className =
        'broker-tf-btn flex-1 py-1 text-center rounded-lg bg-white text-zinc-950 font-semibold transition-all cursor-pointer shadow-sm';
    } else {
      btn.className =
        'broker-tf-btn flex-1 py-1 text-center rounded-lg text-zinc-400 hover:text-white transition-all cursor-pointer';
    }
  });

  drawBrokerChart();
}

// ==========================================
// 4. MOEX Portfolio Securities & Cash
// ==========================================
function renderMoexPortfolio() {
  const container = document.getElementById('moex-portfolio-container');
  if (!container) return;

  const assets = window.Cache?.brokerAssets || [];
  if (assets.length === 0) {
    container.innerHTML = '';
    return;
  }

  let totalValue = 0;
  assets.forEach(asset => {
    const qty = parseFloat(asset.quantity) || 0;
    const price =
      asset.type === 'cash' ? 1 : parseFloat(asset.currentPrice) || parseFloat(asset.price) || 0;
    totalValue += qty * price;
  });

  const cashAssets = assets.filter(a => a.type === 'cash');
  const securities = assets.filter(a => a.type !== 'cash');

  const KNOWN_FUNDS = new Set([
    'EQMX',
    'LQDT',
    'TMOS',
    'SBMM',
    'AKME',
    'TRUR',
    'TGLD',
    'SBMX',
    'DIVD',
    'INFL',
    'RSHU',
    'GOLD',
  ]);

  let html = '';

  // СЕКЦИЯ: СВОБОДНЫЕ ДЕНЬГИ (КЭШ)
  if (cashAssets.length > 0) {
    html += `
      <div class="space-y-2">
        <div class="flex items-center justify-between px-1">
          <span class="text-[11px] uppercase font-semibold tracking-wider text-zinc-400">Свободные деньги (RUB)</span>
        </div>
        <div class="space-y-2">
    `;
    cashAssets.forEach(asset => {
      const amount = Math.round(parseFloat(asset.quantity) || 0);
      const sharePct = totalValue > 0 ? ((amount / totalValue) * 100).toFixed(1) : 0;
      html += `
        <div class="card bg-[#0E1016] hover:bg-[#12151C] border border-white/[0.06] hover:border-white/15 p-3.5 rounded-2xl flex items-center justify-between gap-3 transition-all cursor-pointer active:scale-[0.99]"
             onclick="openEditMoexAssetModal('${asset.id}')">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-xl bg-white/[0.06] text-white flex items-center justify-center flex-shrink-0">
              <i data-lucide="banknote" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-white truncate">${escapeHtml(asset.name || 'Свободные рубли')}</span>
                <span class="text-[10px] text-zinc-500 font-mono">${sharePct}%</span>
              </div>
              <p class="text-[11px] text-zinc-400 mt-0.5 font-mono">RUB • Рубли</p>
            </div>
          </div>
          <div class="text-right flex-shrink-0">
            <p class="text-[15px] font-bold text-white font-mono leading-tight">${formatMoney(amount)}</p>
          </div>
        </div>
      `;
    });
    html += `</div></div>`;
  }

  // СЕКЦИЯ: ЦЕННЫЕ БУМАГИ
  if (securities.length > 0) {
    html += `
      <div class="space-y-2 ${cashAssets.length > 0 ? 'mt-3.5' : ''}">
        <div class="flex items-center justify-between px-1">
          <span class="text-[11px] uppercase font-semibold tracking-wider text-zinc-400">Ценные бумаги (${securities.length})</span>
        </div>
        <div class="space-y-2">
    `;
    securities.forEach(asset => {
      const qty = parseFloat(asset.quantity) || 0;
      const price = parseFloat(asset.currentPrice) || parseFloat(asset.price) || 0;
      const posValue = Math.round(qty * price);
      const sharePct = totalValue > 0 ? ((posValue / totalValue) * 100).toFixed(1) : 0;

      // Честное определение фонда
      const tickerUpper = (asset.ticker || '').toUpperCase();
      const isFund = asset.type === 'fund' || !!asset.isFund || KNOWN_FUNDS.has(tickerUpper);

      html += `
        <div class="card bg-[#0E1016] hover:bg-[#12151C] border border-white/[0.06] hover:border-white/15 p-3.5 rounded-2xl flex items-center justify-between gap-3 transition-all cursor-pointer active:scale-[0.99]"
             onclick="openEditMoexAssetModal('${asset.id}')">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-xl bg-white/[0.06] text-white flex items-center justify-center flex-shrink-0">
              <i data-lucide="${isFund ? 'pie-chart' : 'building-2'}" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-bold text-white font-mono tracking-tight">${escapeHtml(asset.ticker)}</span>
                <span class="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-white/10 text-zinc-300">
                  ${isFund ? 'БПИФ' : 'Акция'}
                </span>
                <span class="text-[10px] text-zinc-500 font-mono">${sharePct}%</span>
              </div>
              <p class="text-xs text-zinc-400 truncate mt-0.5">${escapeHtml(asset.name || asset.shortName || asset.ticker)} • ${qty} шт.</p>
            </div>
          </div>

          <div class="text-right flex-shrink-0">
            <p class="text-[15px] font-bold text-white font-mono leading-tight">${formatMoney(posValue)}</p>
            <p class="text-[11px] text-zinc-500 font-mono mt-0.5">${formatMoney(price)}/шт.</p>
          </div>
        </div>
      `;
    });
    html += `</div></div>`;
  }

  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: container });
}

// ==========================================
// 5. Automatic Daily Snapshot & Background Quotes
// ==========================================
async function autoRecordBrokerDailySnapshot(totalValue) {
  if (totalValue <= 0) return;
  const todayStr = new Date().toISOString().split('T')[0];
  try {
    const col = getUserCol('Broker');
    const snap = await col.where('date', '==', todayStr).limit(1).get();
    if (!snap.empty) {
      await snap.docs[0].ref.update({
        balance: totalValue,
        amount: totalValue,
        timestamp: Date.now(),
      });
    } else {
      await col.add({
        type: 'Баланс',
        date: todayStr,
        amount: totalValue,
        balance: totalValue,
        timestamp: Date.now(),
      });
    }
  } catch (err) {
    console.warn('Auto snapshot warning:', err);
  }
}

async function autoUpdateBrokerQuotesAndSnapshot(force = false) {
  const assets = window.Cache?.brokerAssets || [];
  if (assets.length === 0) return;

  const now = Date.now();
  // Троттлинг фонового автообновления: не чаще одного раза в 2 минуты (если не принудительно)
  if (!force && now - _lastMoexAutoUpdateTimestamp < 120000) {
    return;
  }
  _lastMoexAutoUpdateTimestamp = now;

  const securities = assets.filter(a => a.type !== 'cash');
  if (securities.length === 0) {
    let cashSum = 0;
    assets.forEach(a => (cashSum += parseFloat(a.quantity) || 0));
    await autoRecordBrokerDailySnapshot(Math.round(cashSum));
    return;
  }

  try {
    const tickers = securities.map(a => a.ticker);
    if (!window.MoexService) return;
    const quotes = await window.MoexService.fetchBatchPrices(tickers);

    const updatePromises = [];
    let newTotalValue = 0;

    assets.forEach(asset => {
      if (asset.type === 'cash') {
        newTotalValue += parseFloat(asset.quantity) || 0;
        return;
      }
      const q = quotes[asset.ticker];
      if (q && q.price > 0) {
        asset.currentPrice = q.price;
        asset.changePct24h = q.changePct;
        asset.updatedAt = Date.now();

        const ref = getUserCol('BrokerAssets').doc(asset.id);
        updatePromises.push(
          ref.update({
            currentPrice: q.price,
            changePct24h: q.changePct,
            updatedAt: Date.now(),
          })
        );
      }
      const p = asset.currentPrice || asset.price || 0;
      newTotalValue += (parseFloat(asset.quantity) || 0) * p;
    });

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }
    const roundedTotal = Math.round(newTotalValue);
    await autoRecordBrokerDailySnapshot(roundedTotal);

    const balEl = document.getElementById('broker-balance');
    if (balEl) balEl.innerText = formatMoney(roundedTotal);
  } catch (err) {
    console.warn('Фоновое обновление котировок MOEX:', err);
  }
}

async function refreshMoexQuotes() {
  const assets = window.Cache?.brokerAssets || [];
  if (assets.length === 0) {
    showToast('Нет активов для обновления');
    return;
  }

  const btn = document.getElementById('btn-refresh-moex-quotes');
  if (btn) {
    const icon = btn.querySelector('svg, i');
    if (icon) icon.classList.add('animate-spin');
  }

  showToast('Обновление котировок с Мосбиржи...', false, true);

  try {
    await autoUpdateBrokerQuotesAndSnapshot(true);
    renderBroker();
    showToast('Котировки и оценка портфеля обновлены');
  } catch (err) {
    console.warn('Ошибка ручного обновления котировок MOEX:', err);
    showToast('Не удалось обновить котировки Мосбиржи', true);
  } finally {
    if (btn) {
      const icon = btn.querySelector('svg, i');
      if (icon) icon.classList.remove('animate-spin');
    }
  }
}

// ==========================================
// 6. MOEX Asset Modal & Trade Recording
// ==========================================
let _moexSearchTimeout = null;
let _currentSelectedMoexSecurity = null;
let _currentMoexModalMode = 'security';

function setMoexModalMode(mode) {
  _currentMoexModalMode = mode;
  const secTab = document.getElementById('tab-moex-security');
  const cashTab = document.getElementById('tab-moex-cash');
  const secFields = document.getElementById('moex-security-fields');
  const cashFields = document.getElementById('moex-cash-fields');

  if (mode === 'cash') {
    if (cashTab) {
      cashTab.className =
        'py-1.5 px-2 rounded-lg text-xs font-semibold bg-white text-zinc-950 transition-all cursor-pointer shadow-sm';
    }
    if (secTab) {
      secTab.className =
        'py-1.5 px-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white transition-all cursor-pointer';
    }
    if (secFields) secFields.classList.add('hidden');
    if (cashFields) cashFields.classList.remove('hidden');
    document.getElementById('moex-asset-type').value = 'cash';
  } else {
    if (secTab) {
      secTab.className =
        'py-1.5 px-2 rounded-lg text-xs font-semibold bg-white text-zinc-950 transition-all cursor-pointer shadow-sm';
    }
    if (cashTab) {
      cashTab.className =
        'py-1.5 px-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white transition-all cursor-pointer';
    }
    if (secFields) secFields.classList.remove('hidden');
    if (cashFields) cashFields.classList.add('hidden');
    document.getElementById('moex-asset-type').value = 'stock';
  }
  updateMoexAssetCalculations();
}

function openAddMoexAssetModal() {
  _currentSelectedMoexSecurity = null;
  const modal = document.getElementById('moex-asset-modal');
  const form = document.getElementById('moex-asset-form');
  const title = document.getElementById('moex-modal-title');
  const deleteBtn = document.getElementById('moex-asset-delete-btn');
  const searchInput = document.getElementById('moex-asset-search');
  const preview = document.getElementById('moex-selected-preview');

  if (form) form.reset();
  document.getElementById('moex-asset-id').value = '';
  if (title) title.textContent = 'Добавить в портфель';
  if (deleteBtn) deleteBtn.classList.add('hidden');
  if (preview) preview.classList.add('hidden');
  if (searchInput) searchInput.disabled = false;

  setMoexModalMode('security');
  document.getElementById('moex-asset-total-value').textContent = '0 ₽';

  if (modal) {
    modal.classList.remove('hidden');
    if (searchInput) searchInput.focus();
  }
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: modal });
}

function openEditMoexAssetModal(assetId) {
  const asset = (window.Cache?.brokerAssets || []).find(a => a.id === assetId);
  if (!asset) return;

  const modal = document.getElementById('moex-asset-modal');
  const title = document.getElementById('moex-modal-title');
  const deleteBtn = document.getElementById('moex-asset-delete-btn');
  const searchInput = document.getElementById('moex-asset-search');
  const preview = document.getElementById('moex-selected-preview');

  document.getElementById('moex-asset-id').value = asset.id;

  const KNOWN_FUNDS = new Set([
    'EQMX',
    'LQDT',
    'TMOS',
    'SBMM',
    'AKME',
    'TRUR',
    'TGLD',
    'SBMX',
    'DIVD',
    'INFL',
    'RSHU',
    'GOLD',
  ]);
  const isFund =
    asset.type === 'fund' ||
    !!asset.isFund ||
    (asset.ticker && KNOWN_FUNDS.has(asset.ticker.toUpperCase()));

  if (asset.type === 'cash') {
    setMoexModalMode('cash');
    document.getElementById('moex-cash-amount').value = formatMoney(asset.quantity || 0);
    document.getElementById('moex-cash-name').value = asset.name || 'Свободные рубли';
    if (title) title.textContent = 'Редактировать рубли';
  } else {
    setMoexModalMode('security');
    _currentSelectedMoexSecurity = {
      ticker: asset.ticker,
      shortName: asset.name || asset.ticker,
      fullName: asset.fullName || asset.name,
      isFund: isFund,
      currentPrice: asset.currentPrice || asset.price || 0,
      changePct: asset.changePct24h || 0,
    };

    if (searchInput) {
      searchInput.value = asset.ticker;
      searchInput.disabled = true;
    }

    if (preview) {
      preview.classList.remove('hidden');
      document.getElementById('moex-preview-ticker').textContent = asset.ticker;
      document.getElementById('moex-preview-name').textContent = asset.name || asset.ticker;
      document.getElementById('moex-preview-badge').textContent = isFund ? 'БПИФ' : 'Акция';
      document.getElementById('moex-preview-price').textContent =
        `${formatMoney(asset.currentPrice || asset.price || 0)}/шт.`;
    }

    document.getElementById('moex-asset-qty').value = asset.quantity || 1;
    const buyInput = document.getElementById('moex-asset-buy-price');
    if (buyInput) {
      buyInput.value = asset.buyPrice ? `${formatMoney(asset.buyPrice)}` : '';
    }
    if (title) title.textContent = `Редактировать ${asset.ticker}`;
  }

  if (deleteBtn) deleteBtn.classList.remove('hidden');
  updateMoexAssetCalculations();

  if (modal) modal.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: modal });
}

function closeMoexAssetModal() {
  const modal = document.getElementById('moex-asset-modal');
  if (modal) modal.classList.add('hidden');
  const results = document.getElementById('moex-search-results');
  if (results) results.classList.add('hidden');
}

function handleMoexSearchInput(value) {
  clearTimeout(_moexSearchTimeout);
  const resultsDiv = document.getElementById('moex-search-results');
  const spinner = document.getElementById('moex-search-spinner');

  if (!value || value.trim().length < 2) {
    if (resultsDiv) resultsDiv.classList.add('hidden');
    if (spinner) spinner.classList.add('hidden');
    return;
  }

  if (spinner) spinner.classList.remove('hidden');

  _moexSearchTimeout = setTimeout(async () => {
    try {
      if (!window.MoexService) return;
      const items = await window.MoexService.searchSecurities(value);
      if (spinner) spinner.classList.add('hidden');

      if (!resultsDiv) return;
      if (items.length === 0) {
        resultsDiv.innerHTML =
          '<div class="p-3 text-center text-xs text-zinc-400">Ничего не найдено</div>';
        resultsDiv.classList.remove('hidden');
        return;
      }

      resultsDiv.innerHTML = items
        .map(
          item => `
          <div class="p-2.5 hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer flex items-center justify-between"
               onclick="selectMoexSearchResult('${escapeHtml(item.ticker)}', '${escapeHtml(item.shortName)}', ${item.isFund})">
            <div>
              <div class="flex items-center gap-1.5">
                <b class="text-xs text-white font-mono">${escapeHtml(item.ticker)}</b>
                <span class="text-[9px] px-1 py-0.2 rounded font-semibold bg-white/10 text-zinc-300">
                  ${item.isFund ? 'БПИФ' : 'Акция'}
                </span>
              </div>
              <p class="text-[11px] text-zinc-400 truncate max-w-[240px]">${escapeHtml(item.fullName || item.shortName)}</p>
            </div>
            <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-zinc-500"></i>
          </div>
        `
        )
        .join('');

      resultsDiv.classList.remove('hidden');
      if (typeof lucide !== 'undefined') lucide.createIcons({ root: resultsDiv });
    } catch (_e) {
      if (spinner) spinner.classList.add('hidden');
    }
  }, 250);
}

async function selectMoexSearchResult(ticker, shortName, isFund) {
  _currentSelectedMoexSecurity = { ticker, shortName, isFund };

  const resultsDiv = document.getElementById('moex-search-results');
  if (resultsDiv) resultsDiv.classList.add('hidden');

  const searchInput = document.getElementById('moex-asset-search');
  if (searchInput) searchInput.value = ticker;

  document.getElementById('moex-asset-type').value = isFund ? 'fund' : 'stock';

  const preview = document.getElementById('moex-selected-preview');
  if (preview) {
    preview.classList.remove('hidden');
    document.getElementById('moex-preview-ticker').textContent = ticker;
    document.getElementById('moex-preview-name').textContent = shortName;
    document.getElementById('moex-preview-badge').textContent = isFund ? 'БПИФ' : 'Акция';
    document.getElementById('moex-preview-price').textContent = 'Загрузка...';
  }

  const quote = window.MoexService ? await window.MoexService.fetchSecurityPrice(ticker) : null;
  if (quote && quote.price > 0) {
    _currentSelectedMoexSecurity.currentPrice = quote.price;
    _currentSelectedMoexSecurity.changePct = quote.changePct;
    document.getElementById('moex-preview-price').textContent = `${formatMoney(quote.price)}/шт.`;
  } else {
    document.getElementById('moex-preview-price').textContent = '—';
  }

  updateMoexAssetCalculations();
}

function updateMoexAssetCalculations() {
  const totalEl = document.getElementById('moex-asset-total-value');
  if (!totalEl) return;

  if (_currentMoexModalMode === 'cash') {
    const rawCash = document.getElementById('moex-cash-amount')?.value;
    const cashVal =
      typeof parseAmount === 'function' ? parseAmount(rawCash) : parseFloat(rawCash) || 0;
    totalEl.textContent = formatMoney(Math.round(cashVal));
  } else {
    const qtyInput = document.getElementById('moex-asset-qty');
    const qty = parseFloat(qtyInput?.value) || 0;
    const price = _currentSelectedMoexSecurity?.currentPrice || 0;
    totalEl.textContent = formatMoney(Math.round(qty * price));
  }
}

async function submitMoexAsset(e) {
  e.preventDefault();
  const idInput = document.getElementById('moex-asset-id');
  const existingId = idInput?.value || null;

  const existingAsset = existingId
    ? (window.Cache?.brokerAssets || []).find(a => a.id === existingId)
    : null;
  const oldQty = existingAsset ? parseFloat(existingAsset.quantity) || 0 : 0;

  let assetData = {};
  let deltaQty = 0;
  let isCash = false;

  if (_currentMoexModalMode === 'cash') {
    isCash = true;
    const rawCash = document.getElementById('moex-cash-amount')?.value;
    const amount =
      typeof parseAmount === 'function' ? parseAmount(rawCash) : parseFloat(rawCash) || 0;
    if (amount <= 0) {
      showToast('Укажите сумму в рублях больше 0', true);
      return;
    }
    const name =
      (document.getElementById('moex-cash-name')?.value || '').trim() || 'Свободные рубли';
    deltaQty = amount - oldQty;
    assetData = {
      ticker: 'RUB',
      name: name,
      type: 'cash',
      quantity: amount,
      buyPrice: 1,
      currentPrice: 1,
      changePct24h: 0,
      updatedAt: Date.now(),
    };
  } else {
    if (!_currentSelectedMoexSecurity?.ticker) {
      showToast('Выберите ценную бумагу из списка поиска', true);
      return;
    }

    const qty = parseFloat(document.getElementById('moex-asset-qty')?.value) || 0;
    if (qty <= 0) {
      showToast('Укажите количество бумаг больше 0', true);
      return;
    }

    const buyPriceRaw = document.getElementById('moex-asset-buy-price')?.value;
    const buyPrice =
      typeof parseAmount === 'function' ? parseAmount(buyPriceRaw) : parseFloat(buyPriceRaw) || 0;

    deltaQty = qty - oldQty;
    assetData = {
      ticker: _currentSelectedMoexSecurity.ticker,
      name: _currentSelectedMoexSecurity.shortName || _currentSelectedMoexSecurity.ticker,
      type: document.getElementById('moex-asset-type')?.value || 'stock',
      quantity: qty,
      buyPrice: buyPrice || _currentSelectedMoexSecurity.currentPrice || 0,
      currentPrice: _currentSelectedMoexSecurity.currentPrice || 0,
      changePct24h: _currentSelectedMoexSecurity.changePct || 0,
      updatedAt: Date.now(),
    };
  }

  const saveBtn = document.getElementById('moex-asset-save-btn');
  if (saveBtn) saveBtn.disabled = true;

  try {
    const colAssets = getUserCol('BrokerAssets');
    const colBroker = getUserCol('Broker');
    const todayStr = new Date().toISOString().split('T')[0];

    if (existingId) {
      await colAssets.doc(existingId).update(assetData);
      showToast(`${assetData.name || assetData.ticker} обновлен`);
    } else {
      await colAssets.add(assetData);
      showToast(`${assetData.name || assetData.ticker} добавлен в портфель`);
    }

    // Рассчитываем новую суммарную оценку портфеля
    let newTotalValue = 0;
    const currentAssets = (window.Cache?.brokerAssets || []).filter(a => a.id !== existingId);
    currentAssets.push({ ...assetData, id: existingId || 'temp' });

    currentAssets.forEach(a => {
      const q = parseFloat(a.quantity) || 0;
      const p = a.type === 'cash' ? 1 : parseFloat(a.currentPrice) || parseFloat(a.price) || 0;
      newTotalValue += q * p;
    });
    newTotalValue = Math.round(newTotalValue);

    // Фиксируем сделку (покупка или продажа) в истории Broker
    if (deltaQty !== 0) {
      const isBuy = deltaQty > 0;
      const tradeType = isBuy ? 'buy' : 'sell';
      const absQty = Math.abs(deltaQty);
      const price = isCash ? 1 : assetData.currentPrice || assetData.buyPrice || 1;
      const tradeAmount = Math.round(absQty * price);

      let opTitle = '';
      if (isCash) {
        opTitle = isBuy ? 'Пополнение' : 'Вывод';
      } else {
        opTitle = isBuy ? 'Покупка' : 'Продажа';
      }

      await colBroker.add({
        type: opTitle,
        tradeType: tradeType,
        ticker: assetData.ticker,
        name: assetData.name,
        quantity: absQty,
        price: price,
        amount: tradeAmount,
        date: todayStr,
        balance: newTotalValue,
        timestamp: Date.now(),
      });
    }

    // Автоматически актуализируем дневной срез
    await autoRecordBrokerDailySnapshot(newTotalValue);

    closeMoexAssetModal();
    if (typeof fetchAllData === 'function') {
      await fetchAllData(true);
    }
  } catch (err) {
    console.warn('Ошибка сохранения актива:', err);
    showToast('Не удалось сохранить актив', true);
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function deleteCurrentMoexAsset() {
  const id = document.getElementById('moex-asset-id')?.value;
  if (!id) return;

  const asset = (window.Cache?.brokerAssets || []).find(a => a.id === id);
  const ticker = asset?.name || asset?.ticker || 'актив';

  showDialog('Удаление', `Удалить ${ticker} из портфеля?`, true, async () => {
    try {
      const qty = parseFloat(asset.quantity) || 0;
      const isCash = asset.type === 'cash';
      const price = isCash ? 1 : parseFloat(asset.currentPrice) || parseFloat(asset.price) || 1;
      const todayStr = new Date().toISOString().split('T')[0];

      await getUserCol('BrokerAssets').doc(id).delete();

      // Фиксируем продажу / вывод позиции в Broker
      if (qty > 0) {
        let remainingTotal = 0;
        (window.Cache?.brokerAssets || [])
          .filter(a => a.id !== id)
          .forEach(a => {
            const q = parseFloat(a.quantity) || 0;
            const p =
              a.type === 'cash' ? 1 : parseFloat(a.currentPrice) || parseFloat(a.price) || 0;
            remainingTotal += q * p;
          });
        remainingTotal = Math.round(remainingTotal);

        await getUserCol('Broker').add({
          type: isCash ? 'Вывод' : 'Продажа',
          tradeType: 'sell',
          ticker: asset.ticker,
          name: asset.name,
          quantity: qty,
          price: price,
          amount: Math.round(qty * price),
          date: todayStr,
          balance: remainingTotal,
          timestamp: Date.now(),
        });

        await autoRecordBrokerDailySnapshot(remainingTotal);
      }

      closeMoexAssetModal();
      showToast(`${ticker} удален`);
      if (typeof fetchAllData === 'function') {
        await fetchAllData(true);
      }
    } catch (err) {
      console.warn('Ошибка удаления актива:', err);
      showToast('Не удалось удалить актив', true);
    }
  });
}

// ==========================================
// 7. Global Window Exports
// ==========================================
window.processBroker = processBroker;
window.renderBroker = renderBroker;
window.drawBrokerChart = drawBrokerChart;
window.setBrokerTimeframe = setBrokerTimeframe;
window.autoUpdateBrokerQuotesAndSnapshot = autoUpdateBrokerQuotesAndSnapshot;
window.setMoexModalMode = setMoexModalMode;
window.renderMoexPortfolio = renderMoexPortfolio;
window.refreshMoexQuotes = refreshMoexQuotes;
window.openAddMoexAssetModal = openAddMoexAssetModal;
window.openEditMoexAssetModal = openEditMoexAssetModal;
window.closeMoexAssetModal = closeMoexAssetModal;
window.handleMoexSearchInput = handleMoexSearchInput;
window.selectMoexSearchResult = selectMoexSearchResult;
window.updateMoexAssetCalculations = updateMoexAssetCalculations;
window.submitMoexAsset = submitMoexAsset;
window.deleteCurrentMoexAsset = deleteCurrentMoexAsset;
