/**
 * tx-analytics.js
 * Analytics, Chart.js visualizations (bar & doughnut charts), monthly dynamics and category distribution.
 */

// Analytics chart state
let monthlyChartObj = null;
let categoryChartObj = null;
let currentStructureType = 'Расход';
let currentDonutEntries = [];
let currentDonutTotal = 0;
let currentDonutColors = [];

function switchTransactionView(view) {
  const isChart = view === 'chart';
  const list =
    document.getElementById('transactions-list-wrap') ||
    document.getElementById('transactions-list');
  const chart = document.getElementById('transactions-chart');
  const listBtn = document.getElementById('view-list-btn');
  const chartBtn = document.getElementById('view-chart-btn');

  if (list) list.classList.toggle('hidden', isChart);
  if (chart) chart.classList.toggle('hidden', !isChart);
  if (listBtn) {
    listBtn.classList.toggle('is-active', !isChart);
    listBtn.setAttribute('aria-selected', String(!isChart));
  }
  if (chartBtn) {
    chartBtn.classList.toggle('is-active', isChart);
    chartBtn.setAttribute('aria-selected', String(isChart));
  }

  if (isChart) {
    requestAnimationFrame(() => buildCharts());
  }
}
window.switchTransactionView = switchTransactionView;

function getActiveFilterMonth() {
  const currentTab =
    typeof window.getCurrentActiveTab === 'function' ? window.getCurrentActiveTab() : 'budget';
  if (currentTab === 'budget' && typeof window.getSelectedBudgetDate === 'function') {
    const d = window.getSelectedBudgetDate();
    if (d instanceof Date && !isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }
  }
  if (typeof window.getCurrentFilterMonth === 'function') {
    const m = window.getCurrentFilterMonth();
    if (m) return m;
  }
  if (window.currentFilterMonth) return window.currentFilterMonth;
  const data = window.Cache?.transactions || [];
  if (data.length > 0) {
    const today = new Date();
    const curKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const found = data.find(item => item.id === curKey);
    return found ? curKey : data[0].id;
  }
  return null;
}
window.getActiveFilterMonth = getActiveFilterMonth;

function buildCharts() {
  const chartEmptyEl = document.getElementById('transactions-chart-empty');
  const chartContentEl = document.getElementById('transactions-chart-content');

  const months = Cache && Cache.transactions ? Cache.transactions : [];
  if (chartEmptyEl) chartEmptyEl.classList.toggle('hidden', months.length > 0);
  if (chartContentEl) chartContentEl.classList.toggle('hidden', months.length === 0);
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

  // 1. СТРУКТУРА (DONUT): отображаем данные за период, выбранный в активном экране
  const targetMonthId = getActiveFilterMonth() || months[0]?.id;
  updateAnalyticsForMonth(targetMonthId);

  // 2. ДИНАМИКА САЛЬДО (NET FLOW SPLINE CURVE): за весь текущий год (12 месяцев)
  const targetYear =
    (typeof window.getCurrentDropdownYear === 'function'
      ? window.getCurrentDropdownYear()
      : window.currentDropdownYear) || new Date().getFullYear();
  const yearEl = document.getElementById('trend-kpi-year');
  if (yearEl) yearEl.textContent = `${targetYear} год`;

  const monthShorts = [
    'Янв',
    'Фев',
    'Мар',
    'Апр',
    'Май',
    'Июн',
    'Июл',
    'Авг',
    'Сен',
    'Окт',
    'Ноя',
    'Дек',
  ];
  const monthFullNames = [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ];
  const netFlowData = [];
  const incomeData = [];
  const expenseData = [];
  const pointRadii = [];
  const pointHoverRadii = [];
  const pointHitRadii = [];
  const pointBgColors = [];
  const pointBorderColors = [];
  const hasTxArray = [];
  let totalNet = 0;
  let activeMonthCount = 0;

  for (let m = 1; m <= 12; m++) {
    const key = `${targetYear}-${String(m).padStart(2, '0')}`;
    const found = months.find(item => item.id === key);
    const inc = found ? Number(found.income) || 0 : 0;
    const exp = found ? Number(found.expense) || 0 : 0;
    const net = inc - exp;
    const hasTx = !!(found && (found.items?.length > 0 || inc > 0 || exp > 0));

    incomeData.push(inc);
    expenseData.push(exp);
    netFlowData.push(net);
    hasTxArray.push(hasTx);

    if (hasTx) {
      totalNet += net;
      activeMonthCount++;
      pointRadii.push(4);
      pointHoverRadii.push(7);
      pointHitRadii.push(16); // Комфортный радиус клика на точку
      pointBgColors.push(net >= 0 ? '#10B981' : '#F43F5E');
      pointBorderColors.push('#ffffff');
    } else {
      // Месяц без операций: точка полностью скрывается и не триггерит тултип
      pointRadii.push(0);
      pointHoverRadii.push(0);
      pointHitRadii.push(0);
      pointBgColors.push('transparent');
      pointBorderColors.push('transparent');
    }
  }

  const avgNet = activeMonthCount > 0 ? Math.round(totalNet / activeMonthCount) : 0;
  const avgEl = document.getElementById('trend-kpi-avg');
  if (avgEl) {
    avgEl.textContent = `${avgNet >= 0 ? '+' : ''}${formatMoney(avgNet)}`;
    avgEl.className = `text-xs sm:text-sm font-bold font-mono ${avgNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
  }

  const canvas = document.getElementById('monthlyExpensesChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (monthlyChartObj) monthlyChartObj.destroy();

  // Удаляем старый HTML тултип, если остался от предыдущего инстанса
  const oldTooltip = canvas.parentNode?.querySelector('#chart-spline-tooltip');
  if (oldTooltip) oldTooltip.remove();

  monthlyChartObj = new Chart(ctx, {
    type: 'line',
    data: {
      labels: monthShorts,
      datasets: [
        {
          label: 'Сальдо',
          data: netFlowData,
          borderColor: '#10B981',
          borderWidth: 2,
          tension: 0.35,
          pointRadius: pointRadii,
          pointHoverRadius: pointHoverRadii,
          pointHitRadius: pointHitRadii,
          pointBackgroundColor: pointBgColors,
          pointBorderColor: pointBorderColors,
          pointBorderWidth: 1.5,
          fill: {
            target: 'origin',
            above: 'rgba(16, 185, 129, 0.12)',
            below: 'rgba(244, 63, 94, 0.12)',
          },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        intersect: true, // Клик вне радиуса точки не активирует точку и скрывает тултип
      },
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          enabled: false, // Отключаем стандартный холстовый тултип, используем аккуратный HTML
          external(context) {
            const { chart, tooltip } = context;
            let tooltipEl = chart.canvas.parentNode.querySelector('#chart-spline-tooltip');

            if (!tooltipEl) {
              tooltipEl = document.createElement('div');
              tooltipEl.id = 'chart-spline-tooltip';
              tooltipEl.className =
                'pointer-events-none absolute z-30 bg-[#0E1016] border border-white/10 rounded-2xl p-2.5 shadow-[0_12px_36px_rgba(0,0,0,0.85)] transition-opacity duration-150 backdrop-blur-md min-w-[160px]';
              chart.canvas.parentNode.appendChild(tooltipEl);
            }

            if (tooltip.opacity === 0 || !tooltip.dataPoints || !tooltip.dataPoints.length) {
              tooltipEl.style.opacity = '0';
              return;
            }

            const idx = tooltip.dataPoints[0].dataIndex;
            if (!hasTxArray[idx]) {
              tooltipEl.style.opacity = '0';
              return;
            }

            const monthName = monthFullNames[idx];
            const net = netFlowData[idx];
            const inc = incomeData[idx];
            const exp = expenseData[idx];

            const netColor = net >= 0 ? 'text-emerald-400' : 'text-rose-400';
            const netSign = net >= 0 ? '+' : '';

            tooltipEl.innerHTML = `
              <div class="text-[11px] font-bold text-white mb-2 pb-1.5 border-b border-white/[0.08] flex items-center justify-between">
                <span>${escapeHtml(monthName)} ${targetYear}</span>
              </div>
              <div class="space-y-1.5 text-xs">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-zinc-400 text-[11px]">Сальдо</span>
                  <span class="font-mono font-bold ${netColor}">${netSign}${formatMoney(net)}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span class="text-zinc-400 text-[11px]">Доходы</span>
                  <span class="font-mono font-semibold text-emerald-400">+${formatMoney(inc)}</span>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span class="text-zinc-400 text-[11px]">Расходы</span>
                  <span class="font-mono font-semibold text-white">-${formatMoney(exp)}</span>
                </div>
              </div>
            `;

            const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;
            const canvasWidth = chart.canvas.offsetWidth;

            const tooltipWidth = tooltipEl.offsetWidth || 170;
            let left = positionX + tooltip.caretX - tooltipWidth / 2;
            if (left < 6) left = 6;
            if (left + tooltipWidth > canvasWidth - 6) left = canvasWidth - tooltipWidth - 6;

            let top = positionY + tooltip.caretY - tooltipEl.offsetHeight - 12;
            if (top < positionY) {
              top = positionY + tooltip.caretY + 12;
            }

            tooltipEl.style.opacity = '1';
            tooltipEl.style.left = `${left}px`;
            tooltipEl.style.top = `${top}px`;
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#71717A',
            font: { size: 10, weight: '500' },
            padding: 4,
          },
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
            lineWidth: 1,
          },
          border: { display: false },
          ticks: {
            color: '#71717A',
            font: { size: 9 },
            callback: value => formatCompactChartMoney(value),
            maxTicksLimit: 5,
            padding: 6,
          },
        },
      },
    },
  });

  window.monthlyChartObj = monthlyChartObj;
}
window.buildCharts = buildCharts;

function updateAnalyticsMonthView() {
  if (typeof buildCharts === 'function') buildCharts();
}
window.updateAnalyticsMonthView = updateAnalyticsMonthView;

function changeAnalyticsMonth(_direction) {
  // Навигация теперь полностью синхронизирована с единым верхним селектором месяцев
}
window.changeAnalyticsMonth = changeAnalyticsMonth;

function formatCompactChartMoney(value) {
  if (Math.abs(value) >= 1000000)
    return (value / 1000000).toFixed(value % 1000000 ? 1 : 0) + ' млн';
  if (Math.abs(value) >= 1000) return Math.round(value / 1000) + 'k';
  return value;
}
window.formatCompactChartMoney = formatCompactChartMoney;

function switchStructureType(type) {
  currentStructureType = type;

  const expBtn = document.getElementById('struct-type-expense');
  const incBtn = document.getElementById('struct-type-income');
  if (expBtn && incBtn) {
    if (type === 'Расход') {
      expBtn.className =
        'px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-white/10 text-white transition-all cursor-pointer';
      incBtn.className =
        'px-2.5 py-1 text-[11px] font-semibold rounded-lg text-zinc-400 hover:text-white border border-transparent transition-all cursor-pointer';
    } else {
      incBtn.className =
        'px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 transition-all cursor-pointer';
      expBtn.className =
        'px-2.5 py-1 text-[11px] font-semibold rounded-lg text-zinc-400 hover:text-white border border-transparent transition-all cursor-pointer';
    }
  }

  const targetMonthId =
    (typeof window.getCurrentFilterMonth === 'function'
      ? window.getCurrentFilterMonth()
      : window.currentFilterMonth) || (Cache?.transactions || [])[0]?.id;
  if (targetMonthId) {
    updateAnalyticsForMonth(targetMonthId);
  }
}
window.switchStructureType = switchStructureType;

function resetCategoryDonutCenter() {
  const centerLabelEl = document.getElementById('donut-center-label');
  const totalEl = document.getElementById('category-total');
  const percentEl = document.getElementById('donut-center-percent');
  const defaultLabel = currentStructureType === 'Расход' ? 'Расходы' : 'Доходы';

  if (centerLabelEl) {
    centerLabelEl.textContent = defaultLabel;
    centerLabelEl.style.color = '';
    centerLabelEl.removeAttribute('title');
  }
  if (totalEl) {
    totalEl.textContent = formatMoney(currentDonutTotal);
  }
  if (percentEl) {
    percentEl.textContent = '';
    percentEl.classList.add('hidden');
  }
  document
    .querySelectorAll('.category-legend__item')
    .forEach(el => el.classList.remove('is-selected'));
  if (categoryChartObj) {
    categoryChartObj._activeSliceIdx = -1;
    categoryChartObj.setActiveElements([]);
    categoryChartObj.update();
  }
}
window.resetCategoryDonutCenter = resetCategoryDonutCenter;

function selectCategorySlice(idx) {
  if (!categoryChartObj || !currentDonutEntries[idx]) return;

  if (categoryChartObj._activeSliceIdx === idx) {
    resetCategoryDonutCenter();
    return;
  }

  categoryChartObj._activeSliceIdx = idx;
  categoryChartObj.setActiveElements([{ datasetIndex: 0, index: idx }]);
  categoryChartObj.update();

  const [catLabel, catVal] = currentDonutEntries[idx];
  const pct = currentDonutTotal ? Math.round((catVal / currentDonutTotal) * 100) : 0;
  const col = currentDonutColors[idx % currentDonutColors.length];

  const centerLabelEl = document.getElementById('donut-center-label');
  const totalEl = document.getElementById('category-total');
  const percentEl = document.getElementById('donut-center-percent');

  if (centerLabelEl) {
    centerLabelEl.textContent = catLabel;
    centerLabelEl.style.color = col;
    centerLabelEl.title = catLabel;
  }
  if (totalEl) {
    totalEl.textContent = formatMoney(catVal);
  }
  if (percentEl) {
    percentEl.textContent = `${pct}%`;
    percentEl.style.color = col;
    percentEl.classList.remove('hidden');
  }

  document.querySelectorAll('.category-legend__item').forEach((item, i) => {
    item.classList.toggle('is-selected', i === idx);
  });
}
window.selectCategorySlice = selectCategorySlice;

let currentOtherEntries = [];
let isOthersPopoverOpen = false;
let othersPopoverCleanup = null;

function closeCategoryOthersPopover() {
  const popover = document.getElementById('category-others-popover');
  if (popover) {
    popover.classList.add('hidden');
  }
  isOthersPopoverOpen = false;
  if (typeof othersPopoverCleanup === 'function') {
    othersPopoverCleanup();
    othersPopoverCleanup = null;
  }
}
window.closeCategoryOthersPopover = closeCategoryOthersPopover;

function showCategoryOthersPopover(btnEl, event) {
  if (event && event.stopPropagation) event.stopPropagation();

  const popover = document.getElementById('category-others-popover');
  const listEl = document.getElementById('cop-list');
  const titleEl = document.getElementById('cop-title');
  if (!popover || !listEl) return;

  if (isOthersPopoverOpen) {
    closeCategoryOthersPopover();
    return;
  }

  if (titleEl) {
    titleEl.textContent = `Остальные категории (${currentOtherEntries.length})`;
  }

  const total = currentDonutTotal || 1;
  const safeEscape = typeof window.escapeHtml === 'function' ? window.escapeHtml : s => s;

  listEl.innerHTML = currentOtherEntries
    .map(([label, val]) => {
      const pct = Math.round((val / total) * 100);
      return `
        <div class="flex items-center justify-between py-1 border-b border-white/[0.04] last:border-0 text-xs">
          <span class="text-zinc-300 truncate pr-2">${safeEscape(label)}</span>
          <div class="flex items-center gap-2 flex-shrink-0 font-mono">
            <span class="text-white font-semibold">${formatMoney(val)}</span>
            <span class="text-[10px] text-zinc-500 w-6 text-right">${pct}%</span>
          </div>
        </div>
      `;
    })
    .join('');

  popover.classList.remove('hidden');
  isOthersPopoverOpen = true;

  if (btnEl && typeof btnEl.getBoundingClientRect === 'function') {
    const rect = btnEl.getBoundingClientRect();
    const popoverHeight = popover.offsetHeight || 200;
    const windowHeight = window.innerHeight;

    if (rect.bottom + popoverHeight + 10 < windowHeight) {
      popover.style.top = `${rect.bottom + 8}px`;
      popover.style.bottom = 'auto';
    } else {
      popover.style.bottom = `${windowHeight - rect.top + 8}px`;
      popover.style.top = 'auto';
    }
  }

  const onScroll = () => closeCategoryOthersPopover();
  const onPointerDown = e => {
    if (!popover.contains(e.target) && (!btnEl || !btnEl.contains(e.target))) {
      closeCategoryOthersPopover();
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true, capture: true });
  document.addEventListener('pointerdown', onPointerDown, { capture: true });

  othersPopoverCleanup = () => {
    window.removeEventListener('scroll', onScroll, { capture: true });
    document.removeEventListener('pointerdown', onPointerDown, { capture: true });
  };
}
window.showCategoryOthersPopover = showCategoryOthersPopover;

function updateAnalyticsForMonth(monthId) {
  const allMonths = Cache.transactions || [];
  let txItems = [];
  let titlePeriod = '';

  const activeId =
    monthId ||
    (typeof getActiveFilterMonth === 'function' ? getActiveFilterMonth() : null) ||
    allMonths[0]?.id;

  if (activeId && activeId.startsWith('year-')) {
    const y = activeId.replace('year-', '');
    titlePeriod = `за ${y} год`;
    const yearMonths = allMonths.filter(m => m.id && m.id.startsWith(y));
    yearMonths.forEach(m => {
      txItems.push(...(m.items || []));
    });
  } else if (activeId === 'all') {
    titlePeriod = 'за все время';
    allMonths.forEach(m => {
      txItems.push(...(m.items || []));
    });
  } else if (activeId) {
    const month = allMonths.find(m => m.id === activeId);
    if (month) {
      titlePeriod = month.label ? `• ${month.label}` : '';
      txItems = month.items || [];
    } else {
      const parts = activeId.split('-');
      if (parts.length === 2) {
        const y = parts[0];
        const m = parseInt(parts[1], 10) - 1;
        const monthNames = [
          'Январь',
          'Февраль',
          'Март',
          'Апрель',
          'Май',
          'Июнь',
          'Июль',
          'Август',
          'Сентябрь',
          'Октябрь',
          'Ноябрь',
          'Декабрь',
        ];
        titlePeriod = monthNames[m] ? `• ${monthNames[m]} ${y}` : `• ${activeId}`;
      } else {
        titlePeriod = `• ${activeId}`;
      }
      txItems = [];
    }
  } else {
    txItems = [];
  }

  const titleEl = document.getElementById('structure-title');
  if (titleEl) {
    const baseTitle =
      currentStructureType === 'Расход' ? 'Структура расходов' : 'Структура доходов';
    titleEl.textContent = titlePeriod ? `${baseTitle} ${titlePeriod}` : baseTitle;
  }

  const catMap = {};
  txItems
    .filter(tx => tx.type === currentStructureType)
    .forEach(tx => {
      catMap[tx.category] = (catMap[tx.category] || 0) + (Number(tx.amount) || 0);
    });

  const entries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const baseColors =
    currentStructureType === 'Расход'
      ? ['#38BDF8', '#F59E0B', '#F43F5E', '#A855F7', '#10B981', '#EC4899', '#6366F1']
      : ['#10B981', '#06B6D4', '#F59E0B', '#38BDF8', '#8B5CF6'];

  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  let chartLabels = [];
  let chartData = [];
  let chartColors = [];
  let displayEntries = [];
  currentOtherEntries = [];

  if (entries.length <= 5) {
    chartLabels = entries.map(([l]) => l);
    chartData = entries.map(([, v]) => v);
    chartColors = entries.map((_, i) => baseColors[i % baseColors.length]);
    displayEntries = entries.map(([l, v], i) => ({
      label: l,
      value: v,
      color: chartColors[i],
      isOthers: false,
    }));
  } else {
    const top4 = entries.slice(0, 4);
    currentOtherEntries = entries.slice(4);
    const othersTotal = currentOtherEntries.reduce((s, [, v]) => s + v, 0);

    chartLabels = [...top4.map(([l]) => l), 'Остальные'];
    chartData = [...top4.map(([, v]) => v), othersTotal];
    chartColors = [...top4.map((_, i) => baseColors[i % baseColors.length]), '#71717A'];

    displayEntries = top4.map(([l, v], i) => ({
      label: l,
      value: v,
      color: chartColors[i],
      isOthers: false,
    }));
    displayEntries.push({
      label: `Остальные (${currentOtherEntries.length}) ›`,
      value: othersTotal,
      color: '#71717A',
      isOthers: true,
    });
  }

  currentDonutEntries = chartLabels.map((l, i) => [l, chartData[i]]);
  currentDonutTotal = total;
  currentDonutColors = chartColors;

  const totalEl = document.getElementById('category-total');
  const centerLabelEl = document.getElementById('donut-center-label');
  const percentEl = document.getElementById('donut-center-percent');
  const legendEl = document.getElementById('category-legend');

  const defaultLabel = currentStructureType === 'Расход' ? 'Расходы' : 'Доходы';
  if (totalEl) totalEl.textContent = formatMoney(total);
  if (centerLabelEl) {
    centerLabelEl.textContent = defaultLabel;
    centerLabelEl.style.color = '';
    centerLabelEl.removeAttribute('title');
  }
  if (percentEl) {
    percentEl.textContent = '';
    percentEl.classList.add('hidden');
  }

  const safeEscape = typeof window.escapeHtml === 'function' ? window.escapeHtml : s => s;

  if (legendEl) {
    legendEl.innerHTML = displayEntries.length
      ? displayEntries
          .map((item, i) => {
            const pct = total ? Math.round((item.value / total) * 100) : 0;
            if (item.isOthers) {
              return `
      <div class="category-legend__item flex items-center justify-between p-1.5 rounded-lg bg-[#12151C] border border-white/[0.04] hover:bg-white/[0.08] transition-colors cursor-pointer select-none" onclick="showCategoryOthersPopover(this, event)">
        <div class="flex items-center gap-1.5 min-w-0 pr-1">
          <span class="category-legend__dot w-2 h-2 rounded-full flex-shrink-0 bg-[#71717A]"></span>
          <span class="category-legend__name text-xs font-medium text-zinc-300 truncate">${safeEscape(item.label)}</span>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="category-legend__value font-mono font-semibold text-xs text-white">${formatMoney(item.value)}</span>
          <span class="category-legend__percent font-mono text-[11px] text-zinc-400 w-7 text-right">${pct}%</span>
        </div>
      </div>`;
            }
            return `
      <div class="category-legend__item flex items-center justify-between p-1.5 rounded-lg bg-[#12151C] border border-white/[0.04] hover:bg-white/[0.06] transition-colors cursor-pointer select-none" onclick="selectCategorySlice(${i})">
        <div class="flex items-center gap-1.5 min-w-0 pr-1">
          <span class="category-legend__dot w-2 h-2 rounded-full flex-shrink-0" style="background:${item.color}"></span>
          <span class="category-legend__name text-xs font-medium text-zinc-200 truncate">${safeEscape(item.label)}</span>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="category-legend__value font-mono font-semibold text-xs text-white">${formatMoney(item.value)}</span>
          <span class="category-legend__percent font-mono text-[11px] text-zinc-500 w-7 text-right">${pct}%</span>
        </div>
      </div>`;
          })
          .join('')
      : `<div class="p-3 text-center text-xs text-zinc-500">Нет ${currentStructureType === 'Расход' ? 'расходов' : 'доходов'}</div>`;
  }

  const canvas = document.getElementById('categoryExpensesChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  if (categoryChartObj && categoryChartObj.ctx && categoryChartObj.ctx.canvas === canvas) {
    categoryChartObj._activeSliceIdx = -1;
    categoryChartObj.setActiveElements([]);
    categoryChartObj.data.labels = chartData.length ? chartLabels : ['Нет данных'];
    categoryChartObj.data.datasets[0].data = chartData.length ? chartData : [1];
    categoryChartObj.data.datasets[0].backgroundColor = chartData.length
      ? chartColors
      : ['#1C202A'];
    categoryChartObj.options.cutout = '74%';
    categoryChartObj.update();
  } else {
    if (categoryChartObj) categoryChartObj.destroy();

    categoryChartObj = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: chartData.length ? chartLabels : ['Нет данных'],
        datasets: [
          {
            data: chartData.length ? chartData : [1],
            backgroundColor: chartData.length ? chartColors : ['#1C202A'],
            borderColor: '#0E1016',
            borderWidth: 2,
            hoverOffset: 4,
            hoverBorderColor: 'rgba(255,255,255,0.92)',
            hoverBorderWidth: 1.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: 4 },
        cutout: '74%',
        animation: {
          duration: 400,
          animateRotate: true,
        },
        interaction: {
          mode: 'nearest',
          intersect: true,
        },
        onClick: (e, elements, chart) => {
          let clickedElements = elements;
          if (!clickedElements || !clickedElements.length) {
            clickedElements = chart.getElementsAtEventForMode(
              e.native || e,
              'nearest',
              { intersect: true },
              false
            );
          }
          if (!clickedElements || !clickedElements.length) {
            window.resetCategoryDonutCenter();
            return;
          }
          const clickedIdx = clickedElements[0].index;
          if (clickedIdx === 4 && currentOtherEntries.length > 0) {
            const othersBtn = document.querySelector('.category-legend__item:last-child');
            window.showCategoryOthersPopover(othersBtn, e);
          }
          window.selectCategorySlice(clickedIdx);
        },
        plugins: {
          legend: { display: false },
          datalabels: { display: false },
          tooltip: { enabled: false },
        },
      },
    });
  }

  window.categoryChartObj = categoryChartObj;
}
window.updateAnalyticsForMonth = updateAnalyticsForMonth;
