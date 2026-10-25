/**
 * broker.js
 * Broker account portfolio, MOEX securities, cash, and performance charts.
 */

let brokerChartObj = null;
let currentBrokerTimeframe = "ALL";

// ==========================================
// 2. Broker (Брокерский счет: расчеты и графики)
// ==========================================
function processBroker(ops) {
  let totalDeposits = 0;
  const depositList = [];
  const allOps = [];
  const points = [];

  (ops || []).forEach(o => {
    if (o.type === 'Цель') return; // Игнорируем устаревшие записи

    const rawDate = o.date || new Date().toISOString().split('T')[0];
    const ds = formatDateStr(rawDate, 'd MMM');
    const fullDate = formatDateStr(rawDate, 'd MMM yyyy');
    const parsedDate = typeof parseAnyDate === 'function' ? parseAnyDate(rawDate) : new Date(rawDate);
    const timestamp = parsedDate ? parsedDate.getTime() : new Date(rawDate).getTime();

    if (o.type === 'Пополнение') {
      const depAmount = typeof parseAmount === 'function' ? parseAmount(o.amount) : (parseFloat(o.amount) || 0);
      const balAfter = typeof parseAmount === 'function' ? parseAmount(o.balance !== undefined ? o.balance : o.amount) : (parseFloat(o.balance !== undefined ? o.balance : o.amount) || 0);
      totalDeposits += depAmount;

      const item = {
        id: o.id,
        type: 'Пополнение',
        date: rawDate,
        formattedDate: fullDate,
        amount: depAmount,
        balance: balAfter,
        timestamp
      };

      depositList.push(item);
      allOps.push(item);

      points.push({
        id: o.id,
        rawDate,
        x: ds,
        fullDate,
        y: balAfter,
        type: 'Пополнение',
        depositAmount: depAmount,
        balance: balAfter,
        timestamp
      });
    } else if (o.type === 'Баланс') {
      const bal = typeof parseAmount === 'function' ? parseAmount(o.balance !== undefined ? o.balance : o.amount) : (parseFloat(o.balance !== undefined ? o.balance : o.amount) || 0);
      const item = {
        id: o.id,
        type: 'Баланс',
        date: rawDate,
        formattedDate: fullDate,
        amount: bal,
        balance: bal,
        timestamp
      };

      allOps.push(item);

      points.push({
        id: o.id,
        rawDate,
        x: ds,
        fullDate,
        y: bal,
        type: 'Баланс',
        depositAmount: 0,
        balance: bal,
        timestamp
      });
    }
  });

  // Точки на графике сортируем от старых к новым
  points.sort((a, b) => a.timestamp - b.timestamp);

  // Карточки операций сортируем от новых к старым
  depositList.sort((a, b) => b.timestamp - a.timestamp);
  allOps.sort((a, b) => b.timestamp - a.timestamp);

  // Текущий баланс — последняя точка по времени
  const currentBalance = points.length > 0 ? points[points.length - 1].y : 0;

  // Базовый капитал
  let baseCapital = 0;
  if (points.length > 0) {
    const firstPoint = points[0];
    if (firstPoint.type === 'Баланс') {
      const subsequentDeposits = points.slice(1).filter(p => p.type === 'Пополнение').reduce((s, p) => s + (p.depositAmount || 0), 0);
      baseCapital = firstPoint.y + subsequentDeposits;
    } else {
      baseCapital = totalDeposits;
    }
  } else {
    baseCapital = totalDeposits;
  }

  const profit = currentBalance - baseCapital;

  return {
    balance: currentBalance,
    totalDeposits: baseCapital,
    profit: profit,
    chartData: points,
    deposits: depositList,
    history: allOps
  };
}

function renderBroker() {
  const assets = Cache?.brokerAssets || [];
  const mainCard = document.getElementById('broker-main-card');
  const emptyState = document.getElementById('broker-empty-state');

  // Отрисовка секции акций, фондов и рублей
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
  let totalCost = 0;

  assets.forEach(asset => {
    const qty = parseFloat(asset.quantity) || 0;
    const isCash = asset.type === 'cash';
    const price = isCash ? 1 : (parseFloat(asset.currentPrice) || parseFloat(asset.price) || 0);
    const val = qty * price;

    if (isCash) {
      cashSum += val;
      totalCost += val;
    } else {
      securitiesSum += val;
      const buyPrice = parseFloat(asset.buyPrice) || 0;
      totalCost += qty * (buyPrice > 0 ? buyPrice : price);
    }
  });

  const totalPortfolioValue = cashSum + securitiesSum;
  const totalProfit = totalPortfolioValue - totalCost;
  const totalProfitPct = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;
  const isPos = totalProfit >= 0;

  // Обновляем числовые показатели
  const balEl = document.getElementById('broker-balance');
  if (balEl) balEl.innerText = formatMoney(totalPortfolioValue);

  const assetsSumEl = document.getElementById('broker-assets-sum');
  if (assetsSumEl) assetsSumEl.innerText = formatMoney(securitiesSum);

  const cashSumEl = document.getElementById('broker-cash-sum');
  if (cashSumEl) cashSumEl.innerText = formatMoney(cashSum);

  const yieldBadge = document.getElementById('broker-yield-badge');
  if (yieldBadge) {
    yieldBadge.innerText = `${isPos ? '+' : ''}${totalProfitPct.toFixed(1)}% (${isPos ? '+' : ''}${formatMoney(totalProfit)})`;
    yieldBadge.className = `px-2.5 py-0.5 rounded-full text-xs font-semibold ${isPos ? 'bg-[#30D158]/15 text-[#30D158]' : 'bg-[#FF453A]/15 text-[#FF453A]'}`;
  }

  const brokerTab = document.getElementById('broker-tab');
  if (brokerTab && !brokerTab.classList.contains('hidden')) {
    drawBrokerChart();
  }
}

// ------------------------------------------
// Состояние и интерактивность графика брокера
// ------------------------------------------
let currentBrokerChartPoints = [];
let brokerLongPressTimer = null;
let brokerTouchStartX = 0;
let brokerTouchStartY = 0;
let isBrokerLongPressActive = false;
let activeBrokerPoint = null;
let selectedBrokerPointIndex = -1;

function getBrokerPointAtCoords(clientX, clientY) {
  if (!brokerChartObj || !currentBrokerChartPoints || currentBrokerChartPoints.length === 0) return null;
  const canvas = document.getElementById('brokerChart');
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  const meta = brokerChartObj.getDatasetMeta(0);
  if (!meta || !meta.data || meta.data.length === 0) return null;

  let closest = null;
  let minDistance = Infinity;
  // Круговая область вокруг центра точки (радиус 28px)
  const HIT_RADIUS = 28;

  for (let i = 0; i < meta.data.length; i++) {
    const ptElem = meta.data[i];
    if (!ptElem) continue;
    const dist = Math.hypot(x - ptElem.x, y - ptElem.y);

    if (dist <= HIT_RADIUS && dist < minDistance) {
      minDistance = dist;
      closest = {
        point: currentBrokerChartPoints[i],
        index: i,
        element: ptElem,
        screenX: rect.left + ptElem.x,
        screenY: rect.top + ptElem.y,
        distance: dist
      };
    }
  }

  return closest;
}

function showBrokerPointTooltip(index) {
  if (!brokerChartObj || index == null || index < 0) return;
  const meta = brokerChartObj.getDatasetMeta(0);
  if (!meta || !meta.data || !meta.data[index]) return;

  const ptElem = meta.data[index];

  // Активируем hover-состояние точки в Chart.js
  brokerChartObj.setActiveElements([{
    datasetIndex: 0,
    index: index
  }]);

  // Программно активируем тултип
  if (brokerChartObj.tooltip) {
    brokerChartObj.tooltip.setActiveElements([{
      datasetIndex: 0,
      index: index
    }], {
      x: ptElem.x,
      y: ptElem.y
    });
  }

  brokerChartObj.update('none');
}

function hideBrokerPointTooltip() {
  if (!brokerChartObj) return;
  brokerChartObj.setActiveElements([]);
  if (brokerChartObj.tooltip) {
    brokerChartObj.tooltip.setActiveElements([], { x: 0, y: 0 });
  }
  brokerChartObj.update('none');
}

function highlightBrokerPoint(index) {
  if (!brokerChartObj) return;
  const ds = brokerChartObj.data?.datasets?.[0];
  if (!ds || index == null || index < 0 || index >= ds.data.length) return;

  selectedBrokerPointIndex = index;

  if (!ds._basePointBorderColors) {
    ds._basePointBorderColors = Array.isArray(ds.pointBorderColor) ? [...ds.pointBorderColor] : Array(ds.data.length).fill('#181B24');
  }
  if (!ds._basePointRadii) {
    ds._basePointRadii = Array.isArray(ds.pointRadius) ? [...ds.pointRadius] : Array(ds.data.length).fill(4);
  }
  if (!ds._basePointBorderWidths) {
    ds._basePointBorderWidths = Array.isArray(ds.pointBorderWidth) ? [...ds.pointBorderWidth] : Array(ds.data.length).fill(2);
  }

  const borderColors = [...ds._basePointBorderColors];
  const borderWidths = [...ds._basePointBorderWidths];
  const radii = [...ds._basePointRadii];

  // Яркая белая обводка и увеличенный радиус для эффекта выбранной точки
  borderColors[index] = '#FFFFFF';
  borderWidths[index] = 3.5;
  radii[index] = Math.max(8.5, (radii[index] || 4) + 4);

  ds.pointBorderColor = borderColors;
  ds.pointBorderWidth = borderWidths;
  ds.pointRadius = radii;

  brokerChartObj.update('none');
}

function clearBrokerPointHighlight() {
  selectedBrokerPointIndex = -1;
  if (!brokerChartObj) return;
  const ds = brokerChartObj.data?.datasets?.[0];
  if (!ds || !ds._basePointBorderColors) return;

  ds.pointBorderColor = [...ds._basePointBorderColors];
  ds.pointBorderWidth = [...ds._basePointBorderWidths];
  ds.pointRadius = [...ds._basePointRadii];

  brokerChartObj.update('none');
}

function openBrokerPointPopup(pt, screenX, screenY, ptIndex) {
  if (!pt) return;
  activeBrokerPoint = pt;
  const popup = document.getElementById('broker-point-popup');
  if (!popup) return;

  if (ptIndex == null || ptIndex < 0) {
    ptIndex = currentBrokerChartPoints.findIndex(p => p.id === pt.id);
  }

  // Выделяем точку обводкой
  highlightBrokerPoint(ptIndex);

  const dateEl = document.getElementById('broker-popup-date');
  const infoEl = document.getElementById('broker-popup-info');
  const editBtn = document.getElementById('broker-popup-btn-edit');
  const deleteBtn = document.getElementById('broker-popup-btn-delete');

  const parsedDate = typeof parseAnyDate === 'function' ? parseAnyDate(pt.rawDate || pt.date) : new Date(pt.rawDate || pt.date);
  if (dateEl) {
    dateEl.innerText = (typeof formatDateStr === 'function') ? formatDateStr(parsedDate, 'dd.MM.yyyy') : (pt.rawDate || pt.date);
  }

  if (infoEl) {
    if (pt.type === 'Пополнение') {
      infoEl.innerText = `Пополнение: +${formatMoney(pt.depositAmount || pt.amount)}`;
    } else {
      infoEl.innerText = `Баланс: ${formatMoney(pt.balance || pt.y)}`;
    }
  }

  if (editBtn) {
    editBtn.onclick = () => {
      const id = pt.id;
      editBtn.classList.add('is-pressed');
      setTimeout(() => {
        editBtn.classList.remove('is-pressed');
        closeBrokerPointPopup();
        openEditBrokerPointModal(id);
      }, 75);
    };
  }

  if (deleteBtn) {
    deleteBtn.onclick = () => {
      const id = pt.id;
      deleteBtn.classList.add('is-pressed');
      setTimeout(() => {
        deleteBtn.classList.remove('is-pressed');
        closeBrokerPointPopup();
        deleteBrokerPoint(id);
      }, 75);
    };
  }

  popup.classList.remove('hidden');

  // Измеряем реальные габариты попапа
  const popupWidth = popup.offsetWidth || 210;
  const popupHeight = popup.offsetHeight || 122;

  const gap = 8; // отступ от точки
  const minMargin = 12; // отступ от краев экрана
  const topSafeLimit = 64; // безопасная зона сверху (шапка приложения)
  const bottomSafeLimit = 70; // безопасная зона снизу (навигационная панель)

  // Доступное пространство по вертикали
  const spaceTop = screenY - topSafeLimit;
  const spaceBottom = (window.innerHeight - bottomSafeLimit) - screenY;

  // Доступное пространство по горизонтали
  const spaceRight = (window.innerWidth - minMargin) - screenX;
  const spaceLeft = screenX - minMargin;

  // Определение вертикального положения (сверху или снизу)
  let placeTop;
  if (spaceTop >= popupHeight + gap) {
    placeTop = true;
  } else if (spaceBottom >= popupHeight + gap) {
    placeTop = false;
  } else {
    placeTop = spaceTop >= spaceBottom;
  }

  // Определение горизонтального положения (справа или слева)
  let placeRight;
  if (spaceRight >= popupWidth + gap) {
    placeRight = true;
  } else if (spaceLeft >= popupWidth + gap) {
    placeRight = false;
  } else {
    placeRight = spaceRight >= spaceLeft;
  }

  // Координаты попапа (сверху-справа, сверху-слева, снизу-справа, снизу-слева)
  let top = placeTop ? (screenY - popupHeight - gap) : (screenY + gap);
  let left = placeRight ? (screenX + gap) : (screenX - popupWidth - gap);

  // Страховочное ограничение в пределах экрана
  top = Math.max(topSafeLimit, Math.min(window.innerHeight - popupHeight - bottomSafeLimit, top));
  left = Math.max(minMargin, Math.min(window.innerWidth - popupWidth - minMargin, left));

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;

  // Элегантная анимация появления из угла, ближайшего к точке
  const originY = placeTop ? 'bottom' : 'top';
  const originX = placeRight ? 'left' : 'right';
  popup.style.transformOrigin = `${originY} ${originX}`;

  if (typeof lucide !== 'undefined') {
    lucide.createIcons({ root: popup });
  }
}

function closeBrokerPointPopup() {
  const popup = document.getElementById('broker-point-popup');
  if (popup) popup.classList.add('hidden');
  activeBrokerPoint = null;
  clearBrokerPointHighlight();
}

function attachBrokerChartLongPressListeners() {
  const canvas = document.getElementById('brokerChart');
  if (!canvas || canvas._brokerLongPressAttached) return;
  canvas._brokerLongPressAttached = true;

  // Touch события для мобильных устройств
  canvas.addEventListener('touchstart', (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    brokerTouchStartX = e.touches[0].clientX;
    brokerTouchStartY = e.touches[0].clientY;
    isBrokerLongPressActive = false;

    clearTimeout(brokerLongPressTimer);
    const hit = getBrokerPointAtCoords(brokerTouchStartX, brokerTouchStartY);
    if (hit && hit.point && hit.point.id) {
      brokerLongPressTimer = setTimeout(() => {
        isBrokerLongPressActive = true;
        if (navigator.vibrate) {
          try { navigator.vibrate(40); } catch (_) {}
        }
        openBrokerPointPopup(hit.point, hit.screenX, hit.screenY, hit.index);
      }, 500);
    } else {
      // Касание мимо точки - закрываем активный попап
      closeBrokerPointPopup();
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (!e.touches || e.touches.length === 0) return;
    const curX = e.touches[0].clientX;
    const curY = e.touches[0].clientY;
    const dx = curX - brokerTouchStartX;
    const dy = curY - brokerTouchStartY;
    if (Math.hypot(dx, dy) > 10) {
      clearTimeout(brokerLongPressTimer);
    }
  }, { passive: true });

  canvas.addEventListener('touchend', (e) => {
    clearTimeout(brokerLongPressTimer);
    if (isBrokerLongPressActive) {
      if (e.cancelable) e.preventDefault();
      setTimeout(() => { isBrokerLongPressActive = false; }, 150);
      return;
    }

    // Одиночный быстрый тап: проверяем попадание по точке
    const touchEndX = (e.changedTouches && e.changedTouches.length > 0) ? e.changedTouches[0].clientX : brokerTouchStartX;
    const touchEndY = (e.changedTouches && e.changedTouches.length > 0) ? e.changedTouches[0].clientY : brokerTouchStartY;

    if (Math.hypot(touchEndX - brokerTouchStartX, touchEndY - brokerTouchStartY) < 18) {
      const hit = getBrokerPointAtCoords(touchEndX, touchEndY);
      if (hit) {
        closeBrokerPointPopup();
        showBrokerPointTooltip(hit.index);
        if (e.cancelable) e.preventDefault();
      } else {
        closeBrokerPointPopup();
        hideBrokerPointTooltip();
      }
    }
  });

  canvas.addEventListener('touchcancel', () => {
    clearTimeout(brokerLongPressTimer);
    isBrokerLongPressActive = false;
  });

  // Мышь для десктопа
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    brokerTouchStartX = e.clientX;
    brokerTouchStartY = e.clientY;
    isBrokerLongPressActive = false;

    clearTimeout(brokerLongPressTimer);
    const hit = getBrokerPointAtCoords(brokerTouchStartX, brokerTouchStartY);
    if (hit && hit.point && hit.point.id) {
      brokerLongPressTimer = setTimeout(() => {
        isBrokerLongPressActive = true;
        openBrokerPointPopup(hit.point, hit.screenX, hit.screenY, hit.index);
      }, 500);
    } else {
      // Клик мимо точки
      closeBrokerPointPopup();
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const dx = e.clientX - brokerTouchStartX;
    const dy = e.clientY - brokerTouchStartY;
    if (Math.hypot(dx, dy) > 6) {
      clearTimeout(brokerLongPressTimer);
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    clearTimeout(brokerLongPressTimer);
    if (isBrokerLongPressActive) {
      setTimeout(() => { isBrokerLongPressActive = false; }, 150);
      return;
    }
    const hit = getBrokerPointAtCoords(e.clientX, e.clientY);
    if (hit) {
      closeBrokerPointPopup();
      showBrokerPointTooltip(hit.index);
    } else {
      closeBrokerPointPopup();
      hideBrokerPointTooltip();
    }
  });

  canvas.addEventListener('mouseleave', () => {
    clearTimeout(brokerLongPressTimer);
    hideBrokerPointTooltip();
  });

  // Контекстное меню (правый клик) на десктопе
  canvas.addEventListener('contextmenu', (e) => {
    const hit = getBrokerPointAtCoords(e.clientX, e.clientY);
    if (hit && hit.point && hit.point.id) {
      e.preventDefault();
      openBrokerPointPopup(hit.point, hit.screenX, hit.screenY, hit.index);
    } else {
      closeBrokerPointPopup();
    }
  });
}

function drawBrokerChart() {
  closeBrokerPointPopup();
  const br = Cache?.broker;
  const canvas = document.getElementById('brokerChart');
  if (!canvas) return;

  const rawData = br?.chartData || [];
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

  currentBrokerChartPoints = filteredData;

  const labels = filteredData.map(p => p.x);
  const data = filteredData.map(p => p.y);

  // Стилизация точек: аккуратный темный бордер под цвет фона, без неестественной обводки в обычном состоянии
  const pointBgColors = filteredData.map(p => p.type === 'Пополнение' ? '#30D158' : '#6C5DD3');
  const pointBorderColors = filteredData.map(() => '#181B24');
  const pointRadii = filteredData.map(p => p.type === 'Пополнение' ? 5.5 : (filteredData.length === 1 ? 5 : 3.5));
  const pointHoverRadii = filteredData.map(p => p.type === 'Пополнение' ? 7.5 : 6);
  const pointBorderWidths = Array(filteredData.length).fill(2);

  const grad = ctx.createLinearGradient(0, 0, 0, 200);
  grad.addColorStop(0, 'rgba(108, 93, 211, 0.35)');
  grad.addColorStop(1, 'rgba(108, 93, 211, 0.0)');

  brokerChartObj = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        borderColor: '#6C5DD3',
        borderWidth: 2.5,
        backgroundColor: grad,
        fill: true,
        tension: 0.3,
        pointRadius: pointRadii,
        pointHoverRadius: pointHoverRadii,
        pointBackgroundColor: pointBgColors,
        pointBorderColor: pointBorderColors,
        pointBorderWidth: pointBorderWidths
      }]
    },
    plugins: [{
      id: 'brokerSelectedPointHalo',
      afterDatasetsDraw(chart) {
        if (selectedBrokerPointIndex == null || selectedBrokerPointIndex < 0) return;
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || !meta.data[selectedBrokerPointIndex]) return;
        const pt = meta.data[selectedBrokerPointIndex];
        const c = chart.ctx;
        c.save();
        c.beginPath();
        c.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
        c.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        c.lineWidth = 2;
        c.stroke();
        c.restore();
      }
    }],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        intersect: true
      },
      onClick: (evt) => {
        if (isBrokerLongPressActive) {
          isBrokerLongPressActive = false;
          return;
        }
        closeBrokerPointPopup();
        const clientX = evt.native ? evt.native.clientX : evt.x;
        const clientY = evt.native ? evt.native.clientY : evt.y;
        if (clientX != null && clientY != null) {
          const hit = getBrokerPointAtCoords(clientX, clientY);
          if (hit) {
            showBrokerPointTooltip(hit.index);
          } else {
            hideBrokerPointTooltip();
          }
        }
      },
      onHover: (evt, elements) => {
        const target = evt.native ? evt.native.target : evt.chart?.canvas;
        if (target) {
          target.style.cursor = elements && elements.length > 0 ? 'pointer' : 'default';
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(24, 27, 36, 0.95)',
          titleColor: '#848D99',
          titleFont: { size: 11, weight: 'normal' },
          bodyColor: '#FFFFFF',
          bodyFont: { size: 12, weight: 'bold' },
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 12,
          displayColors: false,
          callbacks: {
            title: function(items) {
              if (!items || !items.length) return '';
              const idx = items[0].dataIndex;
              const pt = filteredData[idx];
              if (!pt) return items[0].label;
              const d = typeof parseAnyDate === 'function' ? parseAnyDate(pt.rawDate || pt.date) : null;
              return d ? formatDateStr(d, 'dd.MM.yyyy') : (pt.fullDate || items[0].label);
            },
            label: function(item) {
              const idx = item.dataIndex;
              const pt = filteredData[idx];
              if (!pt) return `Баланс: ${formatMoney(item.raw)}`;
              if (pt.type === 'Пополнение') {
                return [
                  `Баланс: ${formatMoney(pt.y)}`,
                  `Пополнение: +${formatMoney(pt.depositAmount)}`,
                  'Удерживайте для действий'
                ];
              }
              return [
                `Баланс: ${formatMoney(pt.y)}`,
                'Удерживайте для действий'
              ];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#848D99', font: { size: 10 } }
        },
        y: {
          display: false
        }
      }
    }
  });

  // Сохраняем исходные стили точек для мгновенного сброса подсветки
  brokerChartObj.data.datasets[0]._basePointBorderColors = [...pointBorderColors];
  brokerChartObj.data.datasets[0]._basePointRadii = [...pointRadii];
  brokerChartObj.data.datasets[0]._basePointBorderWidths = [...pointBorderWidths];

  window.brokerChartObj = brokerChartObj;
  attachBrokerChartLongPressListeners();
}

function setBrokerTimeframe(tf) {
  closeBrokerPointPopup();
  currentBrokerTimeframe = tf;
  document.querySelectorAll('.broker-tf-btn').forEach(btn => {
    const isAct = btn.dataset.tf === tf;
    btn.className = `broker-tf-btn flex-1 py-1 text-center rounded-lg transition-all cursor-pointer ${isAct ? 'bg-[#212430] text-white font-semibold' : 'text-[#848D99] hover:text-white'}`;
  });
  drawBrokerChart();
}

function toggleDepositGoalMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('dep-goal-menu');
  if (!menu) return;
  const isClosed = menu.classList.contains('hidden');
  document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
  if (isClosed) {
    menu.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

function selectDepositGoal(goalId, goalName) {
  const hiddenInp = document.getElementById('dep-goal');
  const labelEl = document.getElementById('dep-goal-label');
  const menu = document.getElementById('dep-goal-menu');
  if (hiddenInp) hiddenInp.value = goalId || '';
  if (labelEl) {
    if (goalId && goalName) {
      labelEl.innerHTML = `<i data-lucide="target" class="w-4 h-4 text-[#9DA5FF] flex-shrink-0"></i> <span class="truncate text-white font-medium">${escapeHtml(goalName)}</span>`;
    } else {
      labelEl.innerHTML = `<i data-lucide="circle-dashed" class="w-4 h-4 text-[#848D99] flex-shrink-0"></i> <span class="truncate text-gray-400">Без привязки к цели</span>`;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  if (menu) menu.classList.add('hidden');
}

function updateGoalDropdowns() {
  if (!Cache) return;
  const menu = document.getElementById('dep-goal-menu');
  if (!menu) return;

  const activeGoals = (Cache.goals || []).filter(g => !g.isAchieved);
  const currentVal = document.getElementById('dep-goal')?.value || '';

  let html = `
    <button type="button" onclick="selectDepositGoal('', 'Без привязки к цели')" class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-left transition-colors cursor-pointer ${!currentVal ? 'bg-[#6C5DD3]/20 text-white font-semibold' : 'text-gray-300 hover:bg-[#212430]'}">
      <i data-lucide="circle-dashed" class="w-4 h-4 text-[#848D99] flex-shrink-0"></i>
      <span class="truncate">Без привязки к цели</span>
    </button>
  `;

  activeGoals.forEach(g => {
    const isSelected = currentVal === g.id;
    html += `
      <button type="button" onclick="selectDepositGoal('${g.id}', '${escapeHtml(g.name)}')" class="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs text-left transition-colors cursor-pointer ${isSelected ? 'bg-[#6C5DD3]/20 text-[#9DA5FF] font-semibold' : 'text-gray-200 hover:bg-[#212430]'}">
        <span class="flex items-center gap-2 truncate min-w-0">
          <i data-lucide="target" class="w-4 h-4 text-[#9DA5FF] flex-shrink-0"></i>
          <span class="truncate">${escapeHtml(g.name)}</span>
        </span>
        <span class="text-[10px] text-[#848D99] flex-shrink-0 font-mono">${formatMoney(g.saved)}</span>
      </button>
    `;
  });

  menu.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Синхронизируем текст на кнопке
  const curGoal = activeGoals.find(g => g.id === currentVal);
  if (curGoal) {
    selectDepositGoal(curGoal.id, curGoal.name);
  } else if (currentVal) {
    const anyGoal = (Cache.goals || []).find(g => g.id === currentVal);
    if (anyGoal) selectDepositGoal(anyGoal.id, anyGoal.name);
    else if (activeGoals.length > 0) selectDepositGoal(activeGoals[0].id, activeGoals[0].name);
    else selectDepositGoal('', 'Без привязки к цели');
  } else if (activeGoals.length > 0) {
    selectDepositGoal(activeGoals[0].id, activeGoals[0].name);
  } else {
    selectDepositGoal('', 'Без привязки к цели');
  }
}

// ==========================================
// 5. Global Event Listeners (Инвестиции)
// ==========================================
document.addEventListener('click', (e) => {
  const target = (e?.target?.nodeType === 3) ? e.target.parentElement : e?.target;
  if (!target || typeof target.closest !== 'function') return;

  // Закрывать попап точки брокера при клике вне него
  if (!target.closest('#broker-point-popup')) {
    if (!isBrokerLongPressActive) {
      closeBrokerPointPopup();
    }
  }

  // Не закрывать поповеры брокера, если клик произошел внутри самого поповера, кнопок его вызова, модалки точки, или внутри дейтпикера
  if (target.closest('.broker-popover') ||
      target.closest('#broker-deposit-btn') ||
      target.closest('#broker-balance-btn') ||
      target.closest('#broker-point-modal') ||
      target.closest('#broker-point-popup') ||
      target.closest('#custom-datepicker') ||
      target.closest('input[data-datepicker]') ||
      target.closest('input[type="date"]')) {
    return;
  }
  if (typeof closeAllBrokerPopovers === 'function') {
    closeAllBrokerPopovers();
  }
});

// Мгновенная реакция закрытия попапа при начале касания/клика вне его
document.addEventListener('pointerdown', (e) => {
  const target = (e?.target?.nodeType === 3) ? e.target.parentElement : e?.target;
  if (!target || typeof target.closest !== 'function') return;

  const popup = document.getElementById('broker-point-popup');
  if (popup && !popup.classList.contains('hidden')) {
    if (!target.closest('#broker-point-popup') && !target.closest('#brokerChart')) {
      closeBrokerPointPopup();
    }
  }
});

// Закрытие попапа точки при скролле экрана или изменении размера
window.addEventListener('scroll', () => {
  const popup = document.getElementById('broker-point-popup');
  if (popup && !popup.classList.contains('hidden')) {
    closeBrokerPointPopup();
  }
}, { passive: true });

window.addEventListener('resize', () => {
  const popup = document.getElementById('broker-point-popup');
  if (popup && !popup.classList.contains('hidden')) {
    closeBrokerPointPopup();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeBrokerPointPopup();
  }
});


// Broker Global Exports
window.processBroker = processBroker;
window.renderBroker = renderBroker;
window.drawBrokerChart = drawBrokerChart;
window.setBrokerTimeframe = setBrokerTimeframe;
window.showBrokerPointTooltip = showBrokerPointTooltip;
window.hideBrokerPointTooltip = hideBrokerPointTooltip;
window.highlightBrokerPoint = highlightBrokerPoint;
window.clearBrokerPointHighlight = clearBrokerPointHighlight;
window.openBrokerPointPopup = openBrokerPointPopup;
window.closeBrokerPointPopup = closeBrokerPointPopup;
window.updateGoalDropdowns = updateGoalDropdowns;

// ==========================================
// MOEX Portfolio & Live Securities Engine (T-Bank Style)
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
      cashTab.className = 'py-2 px-2 rounded-xl text-xs font-semibold bg-[#212430] text-white transition-all cursor-pointer';
    }
    if (secTab) {
      secTab.className = 'py-2 px-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white transition-all cursor-pointer';
    }
    if (secFields) secFields.classList.add('hidden');
    if (cashFields) cashFields.classList.remove('hidden');
    document.getElementById('moex-asset-type').value = 'cash';
  } else {
    if (secTab) {
      secTab.className = 'py-2 px-2 rounded-xl text-xs font-semibold bg-[#212430] text-white transition-all cursor-pointer';
    }
    if (cashTab) {
      cashTab.className = 'py-2 px-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white transition-all cursor-pointer';
    }
    if (secFields) secFields.classList.remove('hidden');
    if (cashFields) cashFields.classList.add('hidden');
    document.getElementById('moex-asset-type').value = 'stock';
  }
  updateMoexAssetCalculations();
}

function renderMoexPortfolio() {
  const container = document.getElementById('moex-portfolio-container');
  if (!container) return;

  const assets = window.Cache?.brokerAssets || [];
  if (assets.length === 0) {
    container.innerHTML = '';
    return;
  }

  const cashAssets = assets.filter(a => a.type === 'cash');
  const securities = assets.filter(a => a.type !== 'cash');

  let totalValue = 0;
  assets.forEach(a => {
    const qty = parseFloat(a.quantity) || 0;
    const price = a.type === 'cash' ? 1 : (parseFloat(a.currentPrice) || parseFloat(a.price) || 0);
    totalValue += qty * price;
  });

  let html = '';

  // СЕКЦИЯ: ДЕНЬГИ
  if (cashAssets.length > 0) {
    html += `
      <div class="space-y-2">
        <div class="flex items-center justify-between px-1">
          <span class="text-[11px] uppercase font-bold tracking-wider text-[#848D99]">Денежные средства</span>
        </div>
        <div class="space-y-2">
    `;
    cashAssets.forEach(asset => {
      const amount = parseFloat(asset.quantity) || 0;
      const sharePct = totalValue > 0 ? ((amount / totalValue) * 100).toFixed(1) : 0;
      html += `
        <div class="card bg-[#181B24] hover:bg-[#1C202B] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.14)] p-3.5 rounded-2xl flex items-center justify-between gap-3 transition-all cursor-pointer active:scale-[0.99]"
             onclick="openEditMoexAssetModal('${asset.id}')">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center flex-shrink-0">
              <i data-lucide="banknote" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-white truncate">${escapeHtml(asset.name || 'Свободные рубли')}</span>
                <span class="text-[10px] text-gray-500 font-mono">${sharePct}%</span>
              </div>
              <p class="text-[11px] text-[#848D99] mt-0.5 font-mono">RUB • Рубли</p>
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
          <span class="text-[11px] uppercase font-bold tracking-wider text-[#848D99]">Ценные бумаги (${securities.length})</span>
        </div>
        <div class="space-y-2">
    `;
    securities.forEach(asset => {
      const qty = parseFloat(asset.quantity) || 0;
      const price = parseFloat(asset.currentPrice) || parseFloat(asset.price) || 0;
      const posValue = qty * price;
      const sharePct = totalValue > 0 ? ((posValue / totalValue) * 100).toFixed(1) : 0;
      const changePct = parseFloat(asset.changePct24h) || 0;
      const isChangePos = changePct >= 0;
      const isFund = asset.type === 'fund' || !!asset.isFund;

      const buyPrice = parseFloat(asset.buyPrice) || 0;
      let profitBadge = '';
      if (buyPrice > 0) {
        const posCost = qty * buyPrice;
        const posProfit = posValue - posCost;
        const posProfitPct = posCost > 0 ? (posProfit / posCost) * 100 : 0;
        const isPosProfit = posProfit >= 0;
        profitBadge = `<span class="text-[10px] font-mono font-semibold ${isPosProfit ? 'text-emerald-400' : 'text-rose-400'}">${isPosProfit ? '+' : ''}${posProfitPct.toFixed(1)}%</span>`;
      }

      html += `
        <div class="card bg-[#181B24] hover:bg-[#1C202B] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.14)] p-3.5 rounded-2xl flex items-center justify-between gap-3 transition-all cursor-pointer active:scale-[0.99]"
             onclick="openEditMoexAssetModal('${asset.id}')">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-xl ${isFund ? 'bg-amber-500/15 text-amber-400' : 'bg-cyan-500/15 text-cyan-400'} flex items-center justify-center flex-shrink-0">
              <i data-lucide="${isFund ? 'pie-chart' : 'building-2'}" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-bold text-white font-mono tracking-tight">${escapeHtml(asset.ticker)}</span>
                <span class="text-[9px] px-1.5 py-0.2 rounded font-semibold ${isFund ? 'bg-amber-500/20 text-amber-300' : 'bg-cyan-500/20 text-cyan-300'}">
                  ${isFund ? 'БПИФ' : 'Акция'}
                </span>
                <span class="text-[10px] text-gray-500 font-mono">${sharePct}%</span>
              </div>
              <p class="text-xs text-[#848D99] truncate mt-0.5">${escapeHtml(asset.name || asset.shortName || asset.ticker)} • ${qty} шт.</p>
            </div>
          </div>

          <div class="text-right flex-shrink-0">
            <p class="text-[15px] font-bold text-white font-mono leading-tight">${formatMoney(posValue)}</p>
            <div class="flex items-center justify-end gap-1.5 mt-0.5">
              <span class="text-[10px] font-mono ${isChangePos ? 'text-[#30D158]' : 'text-[#FF453A]'}">
                ${isChangePos ? '+' : ''}${changePct.toFixed(2)}%
              </span>
              ${profitBadge}
            </div>
          </div>
        </div>
      `;
    });
    html += `</div></div>`;
  }

  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: container });
}

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
        timestamp: Date.now()
      });
    } else {
      await col.add({
        type: 'Баланс',
        date: todayStr,
        amount: totalValue,
        balance: totalValue,
        timestamp: Date.now()
      });
    }
  } catch (err) {
    console.warn('Auto snapshot warning:', err);
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
    const securities = assets.filter(a => a.type !== 'cash');
    const tickers = securities.map(a => a.ticker);
    const quotes = await window.MoexService.fetchBatchPrices(tickers);

    let updatedCount = 0;
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
        updatedCount++;

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

    await Promise.all(updatePromises);
    await autoRecordBrokerDailySnapshot(newTotalValue);

    renderBroker();
    showToast(`Котировки обновлены (${updatedCount} бумаг)`);
  } catch (err) {
    console.warn('Ошибка обновления котировок MOEX:', err);
    showToast('Не удалось обновить котировки Мосбиржи', true);
  } finally {
    if (btn) {
      const icon = btn.querySelector('svg, i');
      if (icon) icon.classList.remove('animate-spin');
    }
  }
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
      isFund: asset.type === 'fund',
      currentPrice: asset.currentPrice || 0,
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
      document.getElementById('moex-preview-badge').textContent = asset.type === 'fund' ? 'БПИФ' : 'Акция';
      document.getElementById('moex-preview-price').textContent = `${formatMoney(asset.currentPrice || 0)}/шт.`;
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
      const items = await window.MoexService.searchSecurities(value);
      if (spinner) spinner.classList.add('hidden');

      if (!resultsDiv) return;
      if (items.length === 0) {
        resultsDiv.innerHTML = '<div class="p-3 text-center text-xs text-gray-400">Ничего не найдено</div>';
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
                <span class="text-[9px] px-1 py-0.2 rounded font-semibold ${item.isFund ? 'bg-amber-500/20 text-amber-300' : 'bg-cyan-500/20 text-cyan-300'}">
                  ${item.isFund ? 'БПИФ' : 'Акция'}
                </span>
              </div>
              <p class="text-[11px] text-gray-400 truncate max-w-[240px]">${escapeHtml(item.fullName || item.shortName)}</p>
            </div>
            <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-gray-500"></i>
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

  const quote = await window.MoexService.fetchSecurityPrice(ticker);
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
    const cashVal = typeof parseAmount === 'function' ? parseAmount(rawCash) : parseFloat(rawCash) || 0;
    totalEl.textContent = formatMoney(cashVal);
  } else {
    const qtyInput = document.getElementById('moex-asset-qty');
    const qty = parseFloat(qtyInput?.value) || 0;
    const price = _currentSelectedMoexSecurity?.currentPrice || 0;
    totalEl.textContent = formatMoney(qty * price);
  }
}

async function submitMoexAsset(e) {
  e.preventDefault();
  const idInput = document.getElementById('moex-asset-id');
  const existingId = idInput?.value || null;

  let assetData = {};

  if (_currentMoexModalMode === 'cash') {
    const rawCash = document.getElementById('moex-cash-amount')?.value;
    const amount = typeof parseAmount === 'function' ? parseAmount(rawCash) : parseFloat(rawCash) || 0;
    if (amount <= 0) {
      showToast('Укажите сумму в рублях больше 0', true);
      return;
    }
    const name = (document.getElementById('moex-cash-name')?.value || '').trim() || 'Свободные рубли';
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
    const buyPrice = typeof parseAmount === 'function' ? parseAmount(buyPriceRaw) : parseFloat(buyPriceRaw) || 0;

    assetData = {
      ticker: _currentSelectedMoexSecurity.ticker,
      name: _currentSelectedMoexSecurity.shortName || _currentSelectedMoexSecurity.ticker,
      type: document.getElementById('moex-asset-type')?.value || 'stock',
      quantity: qty,
      buyPrice: buyPrice || 0,
      currentPrice: _currentSelectedMoexSecurity.currentPrice || 0,
      changePct24h: _currentSelectedMoexSecurity.changePct || 0,
      updatedAt: Date.now(),
    };
  }

  const saveBtn = document.getElementById('moex-asset-save-btn');
  if (saveBtn) saveBtn.disabled = true;

  try {
    const col = getUserCol('BrokerAssets');
    if (existingId) {
      await col.doc(existingId).update(assetData);
      showToast(`${assetData.name || assetData.ticker} обновлен`);
    } else {
      await col.add(assetData);
      showToast(`${assetData.name || assetData.ticker} добавлен в портфель`);
    }

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
      await getUserCol('BrokerAssets').doc(id).delete();
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


