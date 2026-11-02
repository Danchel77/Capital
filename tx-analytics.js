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

function buildCharts() {
  const chartEmptyEl = document.getElementById('transactions-chart-empty');
  const chartContentEl = document.getElementById('transactions-chart-content');

  const months = Cache && Cache.transactions ? Cache.transactions : [];
  if (months.length === 0) {
    if (chartEmptyEl) chartEmptyEl.classList.remove('hidden');
    if (chartContentEl) chartContentEl.classList.add('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  if (chartEmptyEl) chartEmptyEl.classList.add('hidden');
  if (chartContentEl) chartContentEl.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // 1. СТРУКТУРА (DONUT): отображаем данные за выбранный в верхнем фильтре месяц
  let targetMonthId = window.currentFilterMonth;
  if (!targetMonthId || targetMonthId === 'all' || targetMonthId.startsWith('year-')) {
    const curYear = window.currentDropdownYear || new Date().getFullYear();
    const curYearMonth = months.find(m => m.id && m.id.startsWith(String(curYear)));
    targetMonthId = curYearMonth ? curYearMonth.id : months[0]?.id;
  }
  if (targetMonthId) {
    updateAnalyticsForMonth(targetMonthId);
  }

  // 2. ДИНАМИКА САЛЬДО (NET FLOW SPLINE CURVE): за весь текущий год (12 месяцев)
  const targetYear = window.currentDropdownYear || new Date().getFullYear();
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
  const netFlowData = [];
  const incomeData = [];
  const expenseData = [];
  let totalNet = 0;
  let activeMonthCount = 0;

  for (let m = 1; m <= 12; m++) {
    const key = `${targetYear}-${String(m).padStart(2, '0')}`;
    const found = months.find(item => item.id === key);
    const inc = found ? Number(found.income) || 0 : 0;
    const exp = found ? Number(found.expense) || 0 : 0;
    const net = inc - exp;
    incomeData.push(inc);
    expenseData.push(exp);
    netFlowData.push(net);
    if (found && (inc > 0 || exp > 0)) {
      totalNet += net;
      activeMonthCount++;
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
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#10B981',
          pointBorderColor: '#ffffff',
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
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          backgroundColor: '#0E1016',
          titleColor: '#FFFFFF',
          bodyColor: '#A1A1AA',
          borderColor: 'rgba(255, 255, 255, 0.12)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 12,
          callbacks: {
            label(context) {
              const idx = context.dataIndex;
              const net = netFlowData[idx];
              const inc = incomeData[idx];
              const exp = expenseData[idx];
              return [
                `  Сальдо: ${net >= 0 ? '+' : ''}${formatMoney(net)}`,
                `  Доходы: ${formatMoney(inc)}`,
                `  Расходы: ${formatMoney(exp)}`,
              ];
            },
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

  const titleEl = document.getElementById('structure-title');
  if (titleEl) {
    titleEl.textContent = type === 'Расход' ? 'Структура расходов' : 'Структура доходов';
  }

  const months = Cache?.transactions || [];
  let targetMonthId = window.currentFilterMonth;
  if (!targetMonthId || targetMonthId === 'all' || targetMonthId.startsWith('year-')) {
    const curYear = window.currentDropdownYear || new Date().getFullYear();
    const curYearMonth = months.find(m => m.id && m.id.startsWith(String(curYear)));
    targetMonthId = curYearMonth ? curYearMonth.id : months[0]?.id;
  }
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

function updateAnalyticsForMonth(monthId) {
  const month = Cache.transactions?.find(m => m.id === monthId);
  if (!month) return;

  const income = Number(month.income) || 0;
  const expense = Number(month.expense) || 0;
  const balance = income - expense;
  const rate = income > 0 ? Math.round((expense / income) * 100) : 0;

  const incomeEl = document.getElementById('analytics-income');
  const expenseEl = document.getElementById('analytics-expense');
  const balanceEl = document.getElementById('analytics-month-balance');
  const rateEl = document.getElementById('analytics-rate');
  if (incomeEl) incomeEl.textContent = formatMoney(income);
  if (expenseEl) expenseEl.textContent = formatMoney(expense);
  if (balanceEl) {
    balanceEl.textContent = `${balance >= 0 ? '+' : ''}${formatMoney(balance)}`;
    balanceEl.classList.toggle('is-negative', balance < 0);
  }
  if (rateEl) rateEl.textContent = income > 0 ? `${rate}% дохода` : 'Нет дохода';

  const catMap = {};
  (month.items || [])
    .filter(tx => tx.type === currentStructureType)
    .forEach(tx => {
      catMap[tx.category] = (catMap[tx.category] || 0) + (Number(tx.amount) || 0);
    });

  const entries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const labels = entries.map(([label]) => label);
  const data = entries.map(([, value]) => value);
  const colors =
    currentStructureType === 'Расход'
      ? ['#38BDF8', '#F59E0B', '#F43F5E', '#A855F7', '#10B981', '#EC4899', '#6366F1']
      : ['#10B981', '#06B6D4', '#F59E0B', '#38BDF8'];
  const total = data.reduce((sum, value) => sum + value, 0);

  currentDonutEntries = entries;
  currentDonutTotal = total;
  currentDonutColors = colors;

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

  if (legendEl) {
    legendEl.innerHTML = entries.length
      ? entries
          .map(([label, value], i) => {
            const pct = total ? Math.round((value / total) * 100) : 0;
            const col = colors[i % colors.length];
            return `
      <div class="category-legend__item flex items-center justify-between p-2 rounded-xl bg-[#12151C] border border-white/[0.04] hover:bg-white/[0.06] transition-colors cursor-pointer" onclick="selectCategorySlice(${i})">
        <div class="flex items-center gap-2 min-w-0 pr-2">
          <span class="category-legend__dot w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${col}"></span>
          <span class="category-legend__name text-xs font-medium text-zinc-200 truncate">${escapeHtml(label)}</span>
        </div>
        <div class="flex items-center gap-2.5 flex-shrink-0">
          <span class="category-legend__value font-mono font-semibold text-xs text-white">${formatMoney(value)}</span>
          <span class="category-legend__percent font-mono text-[11px] text-zinc-500 w-8 text-right">${pct}%</span>
        </div>
      </div>`;
          })
          .join('')
      : `<div class="p-4 text-center text-xs text-zinc-500">Нет ${currentStructureType === 'Расход' ? 'расходов' : 'доходов'} за этот месяц</div>`;
  }

  const canvas = document.getElementById('categoryExpensesChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  if (categoryChartObj && categoryChartObj.ctx && categoryChartObj.ctx.canvas === canvas) {
    categoryChartObj._activeSliceIdx = -1;
    categoryChartObj.setActiveElements([]);
    categoryChartObj.data.labels = data.length ? labels : ['Нет данных'];
    categoryChartObj.data.datasets[0].data = data.length ? data : [1];
    categoryChartObj.data.datasets[0].backgroundColor = data.length
      ? colors.slice(0, data.length)
      : ['#1C202A'];
    categoryChartObj.options.cutout = '74%';

    categoryChartObj.options.circumference = 0;
    categoryChartObj.update('none');

    requestAnimationFrame(() => {
      if (categoryChartObj) {
        categoryChartObj.options.circumference = 360;
        categoryChartObj.update();
      }
    });
  } else {
    if (categoryChartObj) categoryChartObj.destroy();

    categoryChartObj = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.length ? labels : ['Нет данных'],
        datasets: [
          {
            data: data.length ? data : [1],
            backgroundColor: data.length ? colors.slice(0, data.length) : ['#1C202A'],
            borderColor: '#0E1016',
            borderWidth: 2,
            hoverOffset: 6,
            hoverBorderColor: 'rgba(255,255,255,0.92)',
            hoverBorderWidth: 1.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: 10 },
        cutout: '74%',
        rotation: -90,
        circumference: 0,
        animation: {
          duration: 750,
          easing: 'easeOutQuart',
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
          window.selectCategorySlice(clickedIdx);
        },
        plugins: {
          legend: { display: false },
          datalabels: { display: false },
          tooltip: { enabled: false },
        },
      },
    });

    requestAnimationFrame(() => {
      if (categoryChartObj) {
        categoryChartObj.options.circumference = 360;
        categoryChartObj.update();
      }
    });
  }

  window.categoryChartObj = categoryChartObj;
}
window.updateAnalyticsForMonth = updateAnalyticsForMonth;
