/**
 * tx-analytics.js
 * Analytics, Chart.js visualizations (bar & doughnut charts), monthly dynamics and category distribution.
 */

// Analytics chart state
let monthlyChartObj = null;
let categoryChartObj = null;
let currentAnalyticsMonthIndex = 0;
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

  const chronological = months.slice().reverse();
  const lastMonths = chronological.slice(-8);
  const labels = lastMonths.map(m => m.label);
  const expenses = lastMonths.map(m => Number(m.expense) || 0);
  const incomes = lastMonths.map(m => Number(m.income) || 0);

  const canvas = document.getElementById('monthlyExpensesChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (monthlyChartObj) monthlyChartObj.destroy();

  monthlyChartObj = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Доходы',
          data: incomes,
          backgroundColor: 'rgba(48, 209, 88, 0.78)',
          hoverBackgroundColor: '#34D35B',
          borderColor: '#30D158',
          hoverBorderColor: 'rgba(94, 235, 135, 0.95)',
          borderWidth: 0,
          hoverBorderWidth: 1.5,
          borderRadius: 7,
          borderSkipped: false,
          barPercentage: 0.72,
          categoryPercentage: 0.62,
        },
        {
          label: 'Расходы',
          data: expenses,
          backgroundColor: 'rgba(255, 69, 58, 0.78)',
          hoverBackgroundColor: '#FF4A3F',
          borderColor: '#FF453A',
          hoverBorderColor: 'rgba(255, 120, 110, 0.95)',
          borderWidth: 0,
          hoverBorderWidth: 1.5,
          borderRadius: 7,
          borderSkipped: false,
          barPercentage: 0.72,
          categoryPercentage: 0.62,
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
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            borderRadius: 3,
            useBorderRadius: true,
            color: '#848D99',
            font: { size: 11, weight: '600' },
            padding: 10,
          },
        },
        datalabels: { display: false },
        tooltip: {
          backgroundColor: '#1C202B',
          titleColor: '#F2F4F7',
          bodyColor: '#A0A7B5',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          padding: { top: 9, bottom: 9, left: 12, right: 12 },
          cornerRadius: 10,
          displayColors: true,
          boxWidth: 8,
          boxHeight: 8,
          boxPadding: 4,
          usePointStyle: true,
          titleFont: { size: 12, weight: '700' },
          bodyFont: { size: 12, weight: '600' },
          callbacks: {
            label(context) {
              const val = context.raw || 0;
              return `  ${context.dataset.label}: ${formatMoney(val)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#656D7A',
            font: { size: 10, weight: '600' },
            maxRotation: 0,
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
            color: '#656D7A',
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
  updateAnalyticsMonthView();
}
window.buildCharts = buildCharts;

function updateAnalyticsMonthView() {
  const months = Cache?.transactions || [];
  if (!months.length) return;

  currentAnalyticsMonthIndex = Math.max(0, Math.min(months.length - 1, currentAnalyticsMonthIndex));
  const cur = months[currentAnalyticsMonthIndex];

  const labelEl = document.getElementById('analytics-month-label');
  if (labelEl) labelEl.textContent = cur.label;

  const prevBtn = document.getElementById('prev-month-btn');
  const nextBtn = document.getElementById('next-month-btn');

  const hasPrev = currentAnalyticsMonthIndex < months.length - 1;
  const hasNext = currentAnalyticsMonthIndex > 0;

  if (prevBtn) {
    prevBtn.classList.toggle('invisible', !hasPrev);
    prevBtn.disabled = !hasPrev;
  }
  if (nextBtn) {
    nextBtn.classList.toggle('invisible', !hasNext);
    nextBtn.disabled = !hasNext;
  }

  updateAnalyticsForMonth(cur.id);

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}
window.updateAnalyticsMonthView = updateAnalyticsMonthView;

function changeAnalyticsMonth(direction) {
  const months = Cache?.transactions || [];
  if (!months.length) return;
  currentAnalyticsMonthIndex += direction;
  updateAnalyticsMonthView();
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
        'px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-gray-700 text-white transition-all';
      incBtn.className =
        'px-2.5 py-1 text-[11px] font-semibold rounded-lg text-gray-400 hover:text-white transition-all';
    } else {
      incBtn.className =
        'px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-emerald-600 text-white transition-all';
      expBtn.className =
        'px-2.5 py-1 text-[11px] font-semibold rounded-lg text-gray-400 hover:text-white transition-all';
    }
  }

  const titleEl = document.getElementById('structure-title');
  if (titleEl) {
    titleEl.textContent = type === 'Расход' ? 'Куда уходят деньги' : 'Источники доходов';
  }

  const months = Cache?.transactions || [];
  if (months.length > 0) {
    const curMonth = months[currentAnalyticsMonthIndex] || months[0];
    updateAnalyticsForMonth(curMonth.id);
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
      ? ['#0A84FF', '#FF9F0A', '#FF453A', '#BF5AF2', '#30D158', '#FF375F', '#5E5CE6']
      : ['#30D158', '#32ADE6', '#FF9F0A', '#64D2FF'];
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
          .map(
            ([label, value], i) => `
      <div class="category-legend__item" onclick="selectCategorySlice(${i})">
        <span class="category-legend__dot" style="background:${colors[i % colors.length]}"></span>
        <span class="category-legend__name">${escapeHtml(label)}</span>
        <span class="category-legend__value">${formatMoney(value)}</span>
        <span class="category-legend__percent">${total ? Math.round((value / total) * 100) : 0}%</span>
      </div>`
          )
          .join('')
      : `<div class="analytics-empty">Нет ${currentStructureType === 'Расход' ? 'расходов' : 'доходов'} за этот месяц</div>`;
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
      : ['#303740'];
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
            backgroundColor: data.length ? colors.slice(0, data.length) : ['#303740'],
            borderColor: '#171d24',
            borderWidth: 3,
            hoverOffset: 8,
            hoverBorderColor: 'rgba(255,255,255,0.92)',
            hoverBorderWidth: 2,
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
