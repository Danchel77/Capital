// ==========================================
// Variables & State
// ==========================================
let brokerChartObj = null;
let currentBrokerTimeframe = 'ALL';

// ==========================================
// 1. Deposits (Вклады и привязка к целям)
// ==========================================
function processDeposits(deposits, goals) {
  const goalsMap = {};
  (goals || []).forEach(g => goalsMap[g.id] = g.name || '');

  return deposits.map(dep => {
    const amount = parseFloat(dep.amount !== undefined ? dep.amount : (dep.initialAmount !== undefined ? dep.initialAmount : (dep.currentAmount || 0))) || 0;
    const rate = parseFloat(dep.rate !== undefined ? dep.rate : (dep.percent !== undefined ? dep.percent : (dep.interestRate || 0))) || 0;
    
    const rawStart = dep.startDate || dep.rawStart;
    const startDate = rawStart ? (typeof parseAnyDate === 'function' ? parseAnyDate(rawStart) : new Date(rawStart)) : new Date();
    
    const rawEnd = dep.endDate || dep.rawEnd;
    let endDate;
    if (rawEnd) {
      endDate = typeof parseAnyDate === 'function' ? parseAnyDate(rawEnd) : new Date(rawEnd);
    } else if (dep.months && !isNaN(Number(dep.months))) {
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + Number(dep.months));
    } else {
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    const isExplicitlyClosed = dep.status === 'Закрыт' || dep.isClosed === true;
    const isMatured = !isExplicitlyClosed && (today >= end);
    const isClosed = isExplicitlyClosed;

    const totalDays = Math.max(1, Math.round((endDate - startDate) / 86400000));
    const daysPassed = isClosed ? totalDays : Math.max(0, Math.min(Math.round((new Date() - startDate) / 86400000), totalDays));
    const goalIdStr = dep.goalId || '';
    const durationStr = getDepositDurationStr(startDate, endDate);

    const totalExpectedInterest = Math.round(totalDays * (amount * (rate / 100) / 365));
    const currentInterest = Math.round(daysPassed * (amount * (rate / 100) / 365));
    const monthlyInterest = (amount * (rate / 100)) / 12;

    // Авто-миграция неполных записей в Firestore при чтении
    if (dep.id && (dep.amount === undefined || dep.rate === undefined || !dep.startDate || !dep.endDate)) {
      try {
        getUserCol('Deposits').doc(dep.id).update({
          amount: amount,
          rate: rate,
          startDate: formatDateStr(startDate, 'yyyy-MM-dd') || dep.startDate,
          endDate: formatDateStr(endDate, 'yyyy-MM-dd') || dep.endDate,
          status: isClosed ? 'Закрыт' : 'Активен'
        }).catch(() => {});
      } catch (e) {}
    }

    return {
      id: dep.id,
      name: dep.name || 'Вклад',
      amount,
      rate,
      goalId: goalIdStr,
      goalName: goalsMap[goalIdStr] || '',
      currentInterest,
      expectedInterest: totalExpectedInterest,
      monthlyInterest,
      progress: Math.min(100, (daysPassed / totalDays) * 100).toFixed(1),
      endDateStr: formatDateStr(endDate, 'dd.MM.yyyy'),
      durationStr,
      rawStart: formatDateStr(startDate, 'yyyy-MM-dd') || dep.startDate,
      rawEnd: formatDateStr(endDate, 'yyyy-MM-dd') || dep.endDate,
      isClosed,
      isMatured,
      isInterestCredited: !!dep.isInterestCredited
    };
  });
}

function renderDeposits() {
  const data = Cache.deposits || [];
  const listEl = document.getElementById('deposits-list');
  const topBtn = document.getElementById('dep-open-top-btn');
  const summaryPanel = document.getElementById('deposits-summary-panel');
  const totalAmountEl = document.getElementById('deposits-total-amount');
  const monthlyInterestEl = document.getElementById('deposits-monthly-interest');

  const matured = data.filter(d => !d.isClosed && d.isMatured);
  const active = data.filter(d => !d.isClosed && !d.isMatured);
  const closed = data.filter(d => d.isClosed);

  const totalActiveAmount = [...active, ...matured].reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
  const totalMonthlyInterest = Math.round(active.reduce((sum, d) => sum + (parseFloat(d.monthlyInterest) || 0), 0));

  if (totalAmountEl) {
    totalAmountEl.innerText = formatMoney(totalActiveAmount);
  }
  if (monthlyInterestEl) {
    monthlyInterestEl.innerText = `+${formatMoney(totalMonthlyInterest)}`;
  }

  if (topBtn) {
    if (data.length === 0) topBtn.classList.add('hidden');
    else topBtn.classList.remove('hidden');
  }

  if (summaryPanel) {
    if (data.length === 0) summaryPanel.classList.add('hidden');
    else summaryPanel.classList.remove('hidden');
  }

  updateDepositsBadge();

  if (!listEl) return;

  if (data.length === 0) {
    listEl.innerHTML = `
      <div class="card rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-3 mt-4 border border-[rgba(255,255,255,0.06)] bg-[#181B24]">
        <div class="w-12 h-12 rounded-2xl bg-[#6C5DD3]/15 text-[#8C7DFF] flex items-center justify-center">
          <i data-lucide="piggy-bank" class="w-6 h-6"></i>
        </div>
        <div>
          <p class="text-sm font-semibold text-gray-200">У вас пока нет открытых вкладов</p>
          <p class="text-xs text-[#848D99] mt-1.5 max-w-[320px] leading-relaxed">Добавьте банковский вклад или накопительный счет, чтобы отслеживать доходность. Вклад можно привязать к цели, и начисленные проценты будут пополнять ваши накопления.</p>
        </div>
        <button type="button" onclick="toggleForm('deposit-form-container', 'dep-submit-btn', 'Добавить вклад', 'deposit-form', 'dep')" class="mt-1 px-4 py-2.5 rounded-xl bg-[#6C5DD3] hover:bg-[#5b4ec2] text-white text-xs font-semibold transition-all active:scale-95 cursor-pointer flex items-center gap-2">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Открыть первый вклад</span>
        </button>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  let html = '';

  // Секция вкладов, требующих закрытия
  if (matured.length > 0) {
    html += `
      <div class="mb-4 space-y-2.5">
        <div class="flex items-center justify-between px-1">
          <h3 class="font-bold text-amber-400 text-xs uppercase tracking-wider flex items-center gap-1.5">
            <i data-lucide="bell-ring" class="w-3.5 h-3.5 text-amber-400"></i>
            <span>Требуется закрытие (${matured.length})</span>
          </h3>
          <span class="text-[10px] text-amber-400/80 font-medium">Срок завершен</span>
        </div>
        ${matured.map(dep => `
          <div class="card bg-gradient-to-r from-amber-500/15 via-[#181B24] to-[#181B24] border border-amber-500/40 hover:border-amber-500/60 rounded-2xl p-4 flex flex-col transition-all shadow-lg cursor-pointer"
               onclick="openCloseDepositModal('${dep.id}')">
            <div class="flex items-start justify-between w-full gap-2">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center flex-shrink-0 border border-amber-500/30">
                  <i data-lucide="piggy-bank" class="w-5 h-5"></i>
                </div>
                <div class="min-w-0">
                  <h3 class="text-[15px] font-bold text-white truncate leading-tight">${escapeHtml(dep.name)}</h3>
                  <p class="text-[11px] text-amber-300/90 font-medium mt-0.5">Срок истек ${dep.endDateStr} • ${dep.rate}% годовых</p>
                </div>
              </div>
              <button type="button" 
                      onclick="event.stopPropagation(); openCloseDepositModal('${dep.id}')" 
                      class="py-1.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-95 text-black font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1 flex-shrink-0">
                <span>Закрыть</span>
                <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
              </button>
            </div>

            <div class="mt-3 pt-2.5 border-t border-amber-500/20 flex items-center justify-between text-xs">
              <span class="text-gray-300">Вложено: <b class="font-mono text-white">${formatMoney(dep.amount)}</b></span>
              <span class="text-gray-300">Начислено: <b class="font-mono text-[#30D158] font-bold">+${formatMoney(dep.expectedInterest)}</b></span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  const renderCard = (dep, isCls) => `
    <div
      class="card bg-[#181B24] border border-[rgba(255,255,255,0.06)] rounded-2xl w-full mb-3 flex flex-col p-4 cursor-pointer overflow-hidden ${isCls ? 'opacity-60' : 'hover:border-[rgba(255,255,255,0.12)]'} transition-all"
      data-id="${dep.id}"
      data-table="Deposits"
      ${!isCls ? `onclick="openCardContextMenu(event, '${escapeHtml(dep.name)}', () => openEditDepModal('${dep.id}'), () => deleteRecord('Deposits', '${dep.id}'))"` : `onclick="openCardContextMenu(event, '${escapeHtml(dep.name)}', null, () => deleteRecord('Deposits', '${dep.id}'))"`}
    >
      <input type="checkbox" class="select-checkbox" data-id="${dep.id}">

      <div class="flex justify-between items-start w-full">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl ${isCls ? 'bg-gray-700/30 text-gray-400' : 'bg-[#6C5DD3]/15 text-[#8C7DFF]'} flex items-center justify-center flex-shrink-0">
            <i data-lucide="${isCls ? 'check-circle' : 'vault'}" class="w-4 h-4"></i>
          </div>
          <div class="min-w-0">
            <h3 class="text-[15px] font-semibold text-white truncate leading-tight">${escapeHtml(dep.name)}</h3>
            <p class="text-[11px] text-[#848D99] mt-0.5">${isCls ? `Закрыт ${dep.endDateStr} • ${dep.durationStr}` : `До ${dep.endDateStr}`} • ${dep.rate}% годовых</p>
          </div>
        </div>
        
        ${dep.goalName ? `
          <div class="deposit-goal-tag flex-shrink-0 ml-2">
            <span class="px-2 py-0.5 text-[10px] font-semibold bg-[#6C5DD3]/15 text-[#9DA5FF] rounded-full border border-[#6C5DD3]/25 truncate max-w-[110px] inline-flex items-center gap-1">
              <i data-lucide="target" class="w-2.5 h-2.5"></i>
              <span class="truncate">${escapeHtml(dep.goalName)}</span>
            </span>
          </div>
        ` : ''}
      </div>

      <div class="mt-3 flex items-end justify-between w-full">
        <div class="flex flex-col">
          <span class="text-[10px] text-[#848D99] uppercase font-bold tracking-wider mb-0.5">Вложено: ${formatMoney(dep.amount)}</span>
          ${isCls ? `
            <div class="flex items-center gap-1.5 text-xs">
               <span class="text-[#30D158] font-bold font-mono">+${formatMoney(dep.expectedInterest)}</span>
               <span class="text-[10px] text-[#848D99] font-medium">${dep.goalName && dep.isInterestCredited ? 'зачислено в цель' : 'выплачено'}</span>
            </div>
          ` : `
            <div class="flex items-center gap-1 text-xs">
               <span class="text-[#30D158] font-bold font-mono">+${formatMoney(dep.currentInterest)}</span>
               <span class="text-gray-600">/</span>
               <span class="text-gray-400 font-mono text-[11px]">+${formatMoney(dep.expectedInterest)}</span>
            </div>
          `}
        </div>

        ${!isCls && dep.monthlyInterest > 0 ? `
          <div class="text-right">
            <span class="text-[10px] text-[#848D99] block font-medium">~+${formatMoney(Math.round(dep.monthlyInterest))}/мес</span>
          </div>
        ` : ''}
      </div>

      <!-- Тонкая полоска прогресса (Material/iOS) -->
      <div class="w-full bg-[rgba(255,255,255,0.06)] h-1.5 rounded-full overflow-hidden mt-2.5">
        <div class="bg-gradient-to-r from-[#6C5DD3] to-[#8C7DFF] h-full rounded-full transition-all duration-500" style="width:${dep.progress}%"></div>
      </div>

    </div>
  `;

  if (active.length > 0) {
    html += `<h3 class="font-bold text-[#848D99] text-xs uppercase tracking-wider mb-2.5 px-1 mt-2">Активные вклады</h3>`;
    html += active.map(d => renderCard(d, false)).join('');
  }

  if (closed.length > 0) {
    html += `<h3 class="font-bold text-[#848D99] text-xs uppercase tracking-wider mb-2.5 px-1 mt-4">Завершенные</h3>`;
    html += closed.map(d => renderCard(d, true)).join('');
  }

  listEl.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function submitDeposit(e) {
  e.preventDefault();
  const startRaw = document.getElementById('dep-start').value;
  const endRaw = document.getElementById('dep-end').value;

  if (!endRaw) {
    showToast('Укажите дату закрытия вклада', true);
    return;
  }

  const allDeposits = Cache?.deposits || [];
  const nextNum = allDeposits.length + 1;
  const rawName = document.getElementById('dep-name')?.value?.trim();
  const name = rawName || `Вклад ${nextNum}`;

  const parsedStart = (typeof parseAnyDate === 'function') ? parseAnyDate(startRaw) : new Date(startRaw);
  const startDate = (parsedStart && !isNaN(parsedStart.getTime()) && typeof formatDateStr === 'function') ? formatDateStr(parsedStart, 'yyyy-MM-dd') : (formatDateStr(startRaw) || startRaw);

  const parsedEnd = (typeof parseAnyDate === 'function') ? parseAnyDate(endRaw) : new Date(endRaw);
  const endDate = (parsedEnd && !isNaN(parsedEnd.getTime()) && typeof formatDateStr === 'function') ? formatDateStr(parsedEnd, 'yyyy-MM-dd') : (formatDateStr(endRaw) || endRaw);

  submitAction('dep-submit-btn', 'Deposits', {
    name,
    amount: getUnformattedVal(document.getElementById('dep-amount')),
    rate: getUnformattedVal(document.getElementById('dep-rate')),
    startDate,
    endDate,
    goalId: document.getElementById('dep-goal').value || '',
    status: 'Активен',
    isInterestCredited: false
  });
}

// ==========================================
// 1.5. Deposit Edit Modal & Actions
// ==========================================
function openEditDepModal(id) {
  if (typeof isSelectionMode === 'function' && isSelectionMode()) return;
  if (window.isSelectionMode && window.isSelectionMode()) return;

  const dep = (Cache?.deposits || []).find(d => d.id === id);
  if (!dep) return;

  const dlg = document.getElementById('dep-edit-modal');
  if (!dlg) return;

  document.getElementById('edit-dep-id').value = dep.id;
  document.getElementById('edit-dep-name').value = dep.name || '';
  setFormattedVal('edit-dep-amount', dep.amount);
  setFormattedVal('edit-dep-rate', dep.rate);

  const startRaw = dep.rawStart || dep.startDate || '';
  const parsedStart = typeof parseAnyDate === 'function' ? parseAnyDate(startRaw) : new Date(startRaw);
  document.getElementById('edit-dep-start').value = (typeof formatDateStr === 'function') ? formatDateStr(parsedStart, 'dd.MM.yyyy') : startRaw;

  const endRaw = dep.rawEnd || dep.endDate || '';
  const parsedEnd = typeof parseAnyDate === 'function' ? parseAnyDate(endRaw) : new Date(endRaw);
  document.getElementById('edit-dep-end').value = (typeof formatDateStr === 'function') ? formatDateStr(parsedEnd, 'dd.MM.yyyy') : endRaw;

  const goalObj = (Cache?.goals || []).find(g => g.id === dep.goalId);
  selectEditDepositGoal(dep.goalId || '', goalObj ? goalObj.name : '');

  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeEditDepModal() {
  const dlg = document.getElementById('dep-edit-modal');
  if (dlg) dlg.classList.add('hidden');
  const menu = document.getElementById('edit-dep-goal-menu');
  if (menu) menu.classList.add('hidden');
}

function toggleEditDepositGoalMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('edit-dep-goal-menu');
  if (!menu) return;
  const isClosed = menu.classList.contains('hidden');
  document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
  if (isClosed) {
    renderEditDepositGoals();
    menu.classList.remove('hidden');
  }
}

function renderEditDepositGoals() {
  const menu = document.getElementById('edit-dep-goal-menu');
  if (!menu || !Cache) return;

  const goals = Cache.goals || [];
  let html = `
    <div onclick="selectEditDepositGoal('', '')" class="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#212430] text-xs font-medium text-gray-400 hover:text-white transition-colors cursor-pointer">
      <i data-lucide="circle-dashed" class="w-4 h-4 text-[#848D99]"></i>
      <span>Без привязки к цели</span>
    </div>
  `;

  if (goals.length > 0) {
    html += '<div class="border-t border-[rgba(255,255,255,0.06)] my-1"></div>';
    goals.forEach(g => {
      html += `
        <div onclick="selectEditDepositGoal('${g.id}', '${escapeHtml(g.name)}')" class="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-[#212430] text-xs font-medium text-gray-200 transition-colors cursor-pointer">
          <span class="flex items-center gap-2.5 truncate">
            <i data-lucide="target" class="w-4 h-4 text-[#6C5DD3]"></i>
            <span class="truncate">${escapeHtml(g.name)}</span>
          </span>
          <span class="text-[10px] text-[#848D99] ml-2 flex-shrink-0">${formatMoney(g.saved || 0)} / ${formatMoney(g.target || 0)}</span>
        </div>
      `;
    });
  }

  menu.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function selectEditDepositGoal(id, name) {
  const input = document.getElementById('edit-dep-goal');
  const label = document.getElementById('edit-dep-goal-label');
  const menu = document.getElementById('edit-dep-goal-menu');
  if (input) input.value = id;
  if (label) {
    if (id && name) {
      label.innerHTML = `<i data-lucide="target" class="w-4 h-4 text-[#6C5DD3]"></i><span class="truncate text-white font-medium">${escapeHtml(name)}</span>`;
    } else {
      label.innerHTML = `<i data-lucide="circle-dashed" class="w-4 h-4 text-[#848D99]"></i><span class="truncate text-gray-400">Без привязки к цели</span>`;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
  if (menu) menu.classList.add('hidden');
}

async function submitEditDepModal(e) {
  if (e) e.preventDefault();
  const id = document.getElementById('edit-dep-id').value;
  if (!id) return;

  const name = document.getElementById('edit-dep-name').value.trim();
  const amount = getUnformattedVal(document.getElementById('edit-dep-amount'));
  const rate = getUnformattedVal(document.getElementById('edit-dep-rate'));
  const startRaw = document.getElementById('edit-dep-start').value;
  const endRaw = document.getElementById('edit-dep-end').value;
  const goalId = document.getElementById('edit-dep-goal').value || '';

  if (!name) {
    showToast('Укажите название вклада', true);
    return;
  }
  if (!amount || amount <= 0) {
    showToast('Укажите сумму вклада', true);
    return;
  }
  if (!endRaw) {
    showToast('Укажите дату закрытия вклада', true);
    return;
  }

  const startDate = formatDateStr(startRaw) || startRaw;
  const endDate = formatDateStr(endRaw) || endRaw;

  try {
    await getUserCol('Deposits').doc(id).update({
      name,
      amount,
      rate,
      startDate,
      endDate,
      goalId
    });
    closeEditDepModal();
    await fetchAllData();
  } catch (err) {
    showToast('Ошибка при сохранении: ' + (err.message || ''), true);
  }
}

function deleteDepFromModal() {
  const id = document.getElementById('edit-dep-id').value;
  if (!id) return;
  showDialog('Удаление вклада', 'Точно удалить вклад? Это действие нельзя отменить.', true, async () => {
    try {
      await getUserCol('Deposits').doc(id).delete();
      closeEditDepModal();
      await fetchAllData();
    } catch (err) {
      showToast('Ошибка при удалении: ' + (err.message || ''), true);
    }
  });
}

function editDep(id) {
  openEditDepModal(id);
}

// ==========================================
// 1.6. Deposit Close Modal & Actions
// ==========================================
function updateDepositsBadge() {
  const data = Cache?.deposits || [];
  const maturedCount = data.filter(d => !d.isClosed && d.isMatured).length;
  const badge = document.getElementById('nav-deposits-badge');
  if (badge) {
    if (maturedCount > 0) {
      badge.classList.remove('hidden');
      badge.setAttribute('title', `Требуется закрытие: ${maturedCount}`);
    } else {
      badge.classList.add('hidden');
    }
  }
}
window.updateDepositsBadge = updateDepositsBadge;

function openCloseDepositModal(id) {
  const dep = (Cache?.deposits || []).find(d => d.id === id);
  const dlg = document.getElementById('deposit-close-dialog');
  if (!dep || !dlg) return;

  const idInp = document.getElementById('dep-close-id');
  const nameEl = document.getElementById('dep-close-name');
  const amountEl = document.getElementById('dep-close-amount');
  const interestEl = document.getElementById('dep-close-interest');
  const totalEl = document.getElementById('dep-close-total');
  const toggle = document.getElementById('dep-close-credit-toggle');

  if (idInp) idInp.value = dep.id;
  if (nameEl) nameEl.innerText = dep.name || 'Вклад';
  if (amountEl) amountEl.innerText = formatMoney(dep.amount || 0);
  if (interestEl) interestEl.innerText = `+${formatMoney(dep.expectedInterest || 0)}`;
  if (totalEl) totalEl.innerText = formatMoney((dep.amount || 0) + (dep.expectedInterest || 0));

  const activeGoals = (Cache?.goals || []).filter(g => g.status !== 'Архив');

  if (toggle) {
    if (activeGoals.length === 0) {
      toggle.checked = false;
      toggle.disabled = true;
    } else {
      toggle.checked = true;
      toggle.disabled = false;
    }
  }

  toggleDepCloseGoalSection(toggle ? toggle.checked : true);

  // Выбираем цель по умолчанию: если у вклада была привязана цель
  if (dep.goalId && activeGoals.some(g => g.id === dep.goalId)) {
    selectDepCloseGoal(dep.goalId);
  } else if (activeGoals.length > 0) {
    selectDepCloseGoal(activeGoals[0].id);
  } else {
    selectDepCloseGoal('');
  }

  dlg.classList.remove('hidden');
  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.openCloseDepositModal = openCloseDepositModal;

function closeDepositCloseModal() {
  const dlg = document.getElementById('deposit-close-dialog');
  if (dlg) dlg.classList.add('hidden');
  const menu = document.getElementById('dep-close-goal-menu');
  if (menu) menu.classList.add('hidden');
  if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
}
window.closeDepositCloseModal = closeDepositCloseModal;

function toggleDepCloseGoalSection(isChecked) {
  const wrap = document.getElementById('dep-close-goal-wrap');
  if (wrap) {
    if (isChecked) {
      wrap.classList.remove('hidden');
    } else {
      wrap.classList.add('hidden');
    }
  }
}
window.toggleDepCloseGoalSection = toggleDepCloseGoalSection;

function toggleDepCloseGoalMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('dep-close-goal-menu');
  if (!menu) return;
  const isClosed = menu.classList.contains('hidden');
  document.querySelectorAll('.custom-dropdown-menu').forEach(m => m.classList.add('hidden'));
  if (isClosed) {
    renderDepCloseGoals();
    menu.classList.remove('hidden');
  }
}
window.toggleDepCloseGoalMenu = toggleDepCloseGoalMenu;

function renderDepCloseGoals() {
  const menu = document.getElementById('dep-close-goal-menu');
  if (!menu) return;

  const goals = (Cache?.goals || []).filter(g => g.status !== 'Архив');
  const selectedId = document.getElementById('dep-close-goal-id')?.value || '';

  if (goals.length === 0) {
    menu.innerHTML = '<div class="px-3 py-2 text-xs text-[#848D99] text-center">Нет активных целей</div>';
    return;
  }

  menu.innerHTML = goals.map(g => {
    const isSelected = g.id === selectedId;
    return `
      <div onclick="selectDepCloseGoal('${g.id}')" 
           class="flex items-center justify-between px-3 py-2 rounded-xl transition-colors cursor-pointer ${isSelected ? 'bg-[#6C5DD3]/20 text-white font-semibold' : 'hover:bg-[#212430] text-gray-200'}">
        <span class="flex items-center gap-2 truncate text-xs">
          <i data-lucide="target" class="w-3.5 h-3.5 ${isSelected ? 'text-[#8C7DFF]' : 'text-gray-400'}"></i>
          <span class="truncate">${escapeHtml(g.name)}</span>
        </span>
        <span class="text-[10px] text-[#848D99] font-mono ml-2 flex-shrink-0">${formatMoney(g.saved || 0)}</span>
      </div>
    `;
  }).join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.renderDepCloseGoals = renderDepCloseGoals;

function selectDepCloseGoal(id) {
  const input = document.getElementById('dep-close-goal-id');
  const label = document.getElementById('dep-close-goal-label');
  const menu = document.getElementById('dep-close-goal-menu');

  if (input) input.value = id || '';

  const goal = (Cache?.goals || []).find(g => g.id === id);
  if (label) {
    if (goal) {
      label.innerHTML = `
        <i data-lucide="target" class="w-3.5 h-3.5 text-amber-400 flex-shrink-0"></i>
        <span class="truncate font-semibold text-white">${escapeHtml(goal.name)}</span>
        <span class="text-[10px] text-gray-400 font-mono ml-1">(${formatMoney(goal.saved || 0)})</span>
      `;
    } else {
      label.innerHTML = `
        <i data-lucide="circle-dashed" class="w-3.5 h-3.5 text-[#848D99] flex-shrink-0"></i>
        <span class="truncate text-gray-400">Выберите цель</span>
      `;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  if (menu) menu.classList.add('hidden');
}
window.selectDepCloseGoal = selectDepCloseGoal;

async function submitCloseDepositModal() {
  const depId = document.getElementById('dep-close-id')?.value;
  if (!depId) return;

  const dep = (Cache?.deposits || []).find(d => d.id === depId);
  if (!dep) {
    showToast('Вклад не найден', true);
    return;
  }

  const toggle = document.getElementById('dep-close-credit-toggle');
  const isCreditToGoal = toggle ? toggle.checked : false;
  const goalId = document.getElementById('dep-close-goal-id')?.value;

  const interestEarned = Math.round(dep.expectedInterest || 0);

  if (isCreditToGoal && interestEarned > 0) {
    if (!goalId) {
      showToast('Выберите цель для начисления процентов', true);
      return;
    }
  }

  const btn = document.getElementById('dep-close-submit-btn');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-70');
  }

  try {
    const batch = db.batch();
    const depRef = getUserCol('Deposits').doc(dep.id);

    let updatedGoalName = '';

    if (isCreditToGoal && interestEarned > 0 && goalId) {
      const goal = (Cache?.goals || []).find(g => g.id === goalId);
      if (goal) {
        const newSaved = (parseFloat(goal.saved) || 0) + interestEarned;
        const target = parseFloat(goal.target) || 0;
        const isAchieved = (target > 0 && newSaved >= target);

        const goalRef = getUserCol('Goals').doc(goal.id);
        batch.update(goalRef, {
          saved: newSaved,
          status: isAchieved ? 'Выполнена' : (goal.status || 'В процессе'),
          updatedAt: Date.now()
        });

        goal.saved = newSaved;
        if (isAchieved) goal.status = 'Выполнена';
        updatedGoalName = goal.name || '';
      }
    }

    batch.update(depRef, {
      status: 'Закрыт',
      isClosed: true,
      isInterestCredited: isCreditToGoal,
      creditedGoalId: isCreditToGoal ? (goalId || '') : '',
      interestEarned: interestEarned,
      closedAt: Date.now(),
      updatedAt: Date.now()
    });

    await batch.commit();

    // Обновляем локальный объект в Cache.deposits
    dep.status = 'Закрыт';
    dep.isClosed = true;
    dep.isMatured = false;
    dep.isInterestCredited = isCreditToGoal;

    closeDepositCloseModal();

    if (isCreditToGoal && interestEarned > 0 && updatedGoalName) {
      showToast(`Вклад «${dep.name}» закрыт. Проценты (+${formatMoney(interestEarned)}) зачислены в цель «${updatedGoalName}»!`);
    } else {
      showToast(`Вклад «${dep.name}» перенесен в закрытые вклады.`);
    }

    // Обновляем бейдж и перерисовываем списки
    updateDepositsBadge();
    renderDeposits();

    if (typeof renderBudgetTab === 'function') {
      renderBudgetTab();
    }
  } catch (err) {
    console.error('Ошибка при закрытии вклада:', err);
    showToast('Ошибка при закрытии: ' + (err.message || ''), true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-70');
    }
  }
}
window.submitCloseDepositModal = submitCloseDepositModal;

// Обновление статусов и бейджей для завершенных вкладов
async function checkAndCreditMaturedDeposits() {
  updateDepositsBadge();
}

// Хелпер склонения месяцев для вкладов
function getDepositDurationStr(startDate, endDate) {
  const totalDays = Math.max(1, Math.round((endDate - startDate) / 86400000));
  let months = Math.round(totalDays / 30.4375);
  if (months < 1) months = 1;

  const mod10 = months % 10;
  const mod100 = months % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${months} месяцев`;
  if (mod10 === 1) return `${months} месяц`;
  if (mod10 >= 2 && mod10 <= 4) return `${months} месяца`;
  return `${months} месяцев`;
}

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
  const br = Cache?.broker;
  const history = br?.history || br?.deposits || [];
  const mainCard = document.getElementById('broker-main-card');
  const emptyState = document.getElementById('broker-empty-state');
  const list = document.getElementById('broker-deposits-list');

  if (!br || history.length === 0) {
    if (mainCard) mainCard.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    if (list) {
      list.innerHTML = '';
      list.classList.add('hidden');
    }
    if (brokerChartObj) {
      brokerChartObj.destroy();
      brokerChartObj = null;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  if (mainCard) mainCard.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');
  if (list) list.classList.remove('hidden');

  // Основной баланс
  const balEl = document.getElementById('broker-balance');
  if (balEl) balEl.innerText = formatMoney(br.balance);

  // Базовый капитал и чистая прибыль
  const baseCapital = br.totalDeposits;
  const profit = br.profit;
  const yieldPct = baseCapital > 0 ? ((profit / baseCapital) * 100).toFixed(1) : 0;
  const isPos = profit >= 0;

  const depEl = document.getElementById('broker-deposits');
  if (depEl) depEl.innerText = formatMoney(baseCapital);

  const yieldBadge = document.getElementById('broker-yield-badge');
  if (yieldBadge) {
    yieldBadge.innerText = `${isPos ? '+' : ''}${yieldPct}% (${isPos ? '+' : ''}${formatMoney(profit)}) за всё время`;
    yieldBadge.className = `px-2.5 py-0.5 rounded-full text-xs font-semibold ${isPos ? 'bg-[#30D158]/15 text-[#30D158]' : 'bg-[#FF453A]/15 text-[#FF453A]'}`;
  }

  // Отрисовка списка операций
  if (list) {
    list.innerHTML = `
      <div class="flex items-center justify-between mt-5 mb-2.5 px-1">
        <h3 class="text-[11px] uppercase font-bold tracking-wider text-[#848D99]">История операций (${history.length})</h3>
        <span class="text-[10px] text-[#848D99]">Нажмите для изменения</span>
      </div>
      <div class="space-y-2">
        ${history.map(d => {
          const isDep = d.type === 'Пополнение';
          return `
            <div class="card relative bg-[#181B24] hover:bg-[#1C202B] rounded-2xl border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] p-3.5 flex justify-between items-center transition-all cursor-pointer"
                 data-id="${d.id}"
                 data-table="Broker"
                 onclick="openEditBrokerPointModal('${d.id}')">
              <input type="checkbox" class="select-checkbox" data-id="${d.id}">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-9 h-9 rounded-xl ${isDep ? 'bg-[#30D158]/10 text-[#30D158]' : 'bg-[#6C5DD3]/15 text-[#6C5DD3]'} flex items-center justify-center flex-shrink-0">
                  <i data-lucide="${isDep ? 'arrow-down-left' : 'scale'}" class="w-4 h-4"></i>
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="text-[15px] font-semibold ${isDep ? 'text-[#30D158]' : 'text-white'} truncate">
                      ${isDep ? `+${formatMoney(d.amount)}` : `Баланс: ${formatMoney(d.balance)}`}
                    </p>
                    <span class="text-[10px] font-medium px-2 py-0.5 rounded-full ${isDep ? 'bg-[#30D158]/10 text-[#30D158]' : 'bg-[#6C5DD3]/15 text-[#a89eff]'} flex-shrink-0">
                      ${d.type}
                    </span>
                  </div>
                  <p class="text-[11px] text-[#848D99] mt-0.5">${d.formattedDate} • Баланс: ${formatMoney(d.balance)}</p>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();

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
// 3. Broker Point Modal & CRUD Actions
// ==========================================
function openEditBrokerPointModal(id) {
  if (typeof isSelectionMode === 'function' && isSelectionMode()) return;
  if (window.isSelectionMode && window.isSelectionMode()) return;
  const br = Cache?.broker;
  if (!br) return;
  const op = (br.history || br.deposits || []).find(o => o.id === id);
  if (!op) return;

  const dlg = document.getElementById('broker-point-modal');
  if (!dlg) return;

  document.getElementById('edit-broker-id').value = op.id;
  document.getElementById('edit-broker-type').value = op.type;
  const rawDate = op.date || new Date().toISOString().split('T')[0];
  const parsedDate = typeof parseAnyDate === 'function' ? parseAnyDate(rawDate) : new Date(rawDate);
  document.getElementById('edit-broker-date').value = (typeof formatDateStr === 'function') ? formatDateStr(parsedDate, 'dd.MM.yyyy') : rawDate;

  const titleEl = document.getElementById('edit-broker-title');
  const typeSubtitle = document.getElementById('edit-broker-subtitle');
  const amountWrap = document.getElementById('edit-broker-amount-wrap');
  const balLabel = document.getElementById('edit-broker-balance-label');

  if (op.type === 'Пополнение') {
    if (titleEl) titleEl.innerText = 'Редактировать пополнение';
    if (typeSubtitle) typeSubtitle.innerText = 'Пополнение брокерского счета';
    if (amountWrap) amountWrap.classList.remove('hidden');
    setFormattedVal('edit-broker-amount', op.amount);
    setFormattedVal('edit-broker-balance', op.balance);
    if (balLabel) balLabel.innerText = 'Баланс после пополнения (₽)';
  } else {
    if (titleEl) titleEl.innerText = 'Редактировать баланс';
    if (typeSubtitle) typeSubtitle.innerText = 'Фиксация баланса на дату';
    if (amountWrap) amountWrap.classList.add('hidden');
    setFormattedVal('edit-broker-balance', op.balance || op.amount);
    if (balLabel) balLabel.innerText = 'Зафиксированный баланс (₽)';
  }

  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeEditBrokerPointModal() {
  const dlg = document.getElementById('broker-point-modal');
  if (dlg) dlg.classList.add('hidden');
}

async function submitEditBrokerPoint(e) {
  if (e) e.preventDefault();
  const id = document.getElementById('edit-broker-id').value;
  const type = document.getElementById('edit-broker-type').value;
  const rawDate = document.getElementById('edit-broker-date').value;
  const parsedDate = (typeof parseAnyDate === 'function' ? parseAnyDate(rawDate) : new Date(rawDate)) || new Date();
  const date = (typeof formatDateStr === 'function') ? formatDateStr(parsedDate, 'yyyy-MM-dd') : rawDate;

  if (!id) return;

  try {
    const col = getUserCol('Broker');
    if (type === 'Пополнение') {
      const amount = getUnformattedVal(document.getElementById('edit-broker-amount'));
      const balance = getUnformattedVal(document.getElementById('edit-broker-balance')) || amount;
      if (!amount) return showToast('Введите сумму пополнения', true);
      await col.doc(id).update({ date, amount, balance, updatedAt: Date.now() });
    } else {
      const balance = getUnformattedVal(document.getElementById('edit-broker-balance'));
      if (!balance && balance !== 0) return showToast('Введите баланс', true);
      await col.doc(id).update({ date, amount: balance, balance, updatedAt: Date.now() });
    }

    closeEditBrokerPointModal();
    closeBrokerPointPopup();
    await fetchAllData();
  } catch (err) {
    showToast('Ошибка сохранения: ' + err.message, true);
  }
}

async function deleteBrokerPoint(id) {
  const targetId = id || document.getElementById('edit-broker-id').value;
  if (!targetId) return;

  showDialog('Удаление записи', 'Удалить эту точку с графика брокерского счета?', true, async () => {
    try {
      await getUserCol('Broker').doc(targetId).delete();
      closeEditBrokerPointModal();
      closeBrokerPointPopup();
      await fetchAllData();
    } catch (err) {
      showToast('Ошибка удаления: ' + err.message, true);
    }
  });
}

// ==========================================
// 4. Broker UI (Поповеры)
// ==========================================
function toggleBrokerPopover(type, e) {
  if (e) e.stopPropagation();
  const popDep = document.getElementById('broker-popover-deposit');
  const popBal = document.getElementById('broker-popover-balance');

  const now = new Date();
  const todayRu = (typeof formatDateStr === 'function') ? formatDateStr(now, 'dd.MM.yyyy') : `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;

  if (type === 'deposit') {
    if (popBal) popBal.classList.add('hidden');
    if (popDep) {
      const isHidden = popDep.classList.contains('hidden');
      popDep.classList.toggle('hidden', !isHidden);
      if (isHidden) {
        const depDateInp = document.getElementById('popover-dep-date');
        if (depDateInp) depDateInp.value = todayRu;
        const depAmtInp = document.getElementById('popover-dep-amount');
        if (depAmtInp) depAmtInp.value = '';
        const depBalInp = document.getElementById('popover-dep-balance');
        if (depBalInp) depBalInp.value = '';
      }
    }
  } else {
    if (popDep) popDep.classList.add('hidden');
    if (popBal) {
      const isHidden = popBal.classList.contains('hidden');
      popBal.classList.toggle('hidden', !isHidden);
      if (isHidden) {
        const balDateInp = document.getElementById('popover-bal-date');
        if (balDateInp) balDateInp.value = todayRu;
        const balInp = document.getElementById('popover-bal-input');
        if (balInp) balInp.value = '';
      }
    }
  }
}

function openBrokerActionFromEmpty(type, e) {
  const mainCard = document.getElementById('broker-main-card');
  const emptyState = document.getElementById('broker-empty-state');
  if (mainCard) mainCard.classList.remove('hidden');
  if (emptyState) emptyState.classList.add('hidden');
  toggleBrokerPopover(type, e);
}

function closeAllBrokerPopovers() {
  const popDep = document.getElementById('broker-popover-deposit');
  const popBal = document.getElementById('broker-popover-balance');
  if (popDep) popDep.classList.add('hidden');
  if (popBal) popBal.classList.add('hidden');

  const history = Cache?.broker?.history || Cache?.broker?.deposits || [];
  if (history.length === 0) {
    const mainCard = document.getElementById('broker-main-card');
    const emptyState = document.getElementById('broker-empty-state');
    if (mainCard) mainCard.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
  }
}

async function submitBrokerPopover(type) {
  if (type === 'Пополнение') {
    const rawDate = document.getElementById('popover-dep-date').value;
    const parsedDate = (typeof parseAnyDate === 'function' ? parseAnyDate(rawDate) : new Date(rawDate)) || new Date();
    const date = (typeof formatDateStr === 'function') ? formatDateStr(parsedDate, 'yyyy-MM-dd') : rawDate;
    const amount = getUnformattedVal(document.getElementById('popover-dep-amount'));
    const balance = getUnformattedVal(document.getElementById('popover-dep-balance')) || amount;
    if (!amount) return showToast('Введите сумму пополнения', true);
    
    closeAllBrokerPopovers();
    try {
      await getUserCol('Broker').add({ type: 'Пополнение', date, amount, balance });
      await fetchAllData();
    } catch (e) {
      showToast('Ошибка сохранения: ' + e.message, true);
    }
  } else {
    const rawDate = document.getElementById('popover-bal-date').value;
    const parsedDate = (typeof parseAnyDate === 'function' ? parseAnyDate(rawDate) : new Date(rawDate)) || new Date();
    const date = (typeof formatDateStr === 'function') ? formatDateStr(parsedDate, 'yyyy-MM-dd') : rawDate;
    const balance = getUnformattedVal(document.getElementById('popover-bal-input'));
    if (!balance && balance !== 0) return showToast('Введите баланс', true);
    closeAllBrokerPopovers();
   
    try {
      await getUserCol('Broker').add({ type: 'Баланс', date, amount: balance, balance });
      await fetchAllData();
    } catch (e) {
      showToast('Ошибка сохранения: ' + e.message, true);
    }
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

// ==========================================
// 6. Global Scope Exports
// ==========================================
window.processDeposits = processDeposits;
window.renderDeposits = renderDeposits;
window.submitDeposit = submitDeposit;
window.editDep = editDep;
window.openEditDepModal = openEditDepModal;
window.closeEditDepModal = closeEditDepModal;
window.submitEditDepModal = submitEditDepModal;
window.deleteDepFromModal = deleteDepFromModal;
window.toggleEditDepositGoalMenu = toggleEditDepositGoalMenu;
window.selectEditDepositGoal = selectEditDepositGoal;
window.getDepositDurationStr = getDepositDurationStr;
window.checkAndCreditMaturedDeposits = checkAndCreditMaturedDeposits;
window.toggleDepositGoalMenu = toggleDepositGoalMenu;
window.selectDepositGoal = selectDepositGoal;

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
window.toggleBrokerPopover = toggleBrokerPopover;
window.closeAllBrokerPopovers = closeAllBrokerPopovers;
window.openBrokerActionFromEmpty = openBrokerActionFromEmpty;
window.submitBrokerPopover = submitBrokerPopover;
window.updateGoalDropdowns = updateGoalDropdowns;

window.openCloseDepositModal = openCloseDepositModal;
window.closeDepositCloseModal = closeDepositCloseModal;
window.toggleDepCloseGoalSection = toggleDepCloseGoalSection;
window.toggleDepCloseGoalMenu = toggleDepCloseGoalMenu;
window.renderDepCloseGoals = renderDepCloseGoals;
window.selectDepCloseGoal = selectDepCloseGoal;
window.submitCloseDepositModal = submitCloseDepositModal;
window.updateDepositsBadge = updateDepositsBadge;

window.openEditBrokerPointModal = openEditBrokerPointModal;
window.closeEditBrokerPointModal = closeEditBrokerPointModal;
window.submitEditBrokerPoint = submitEditBrokerPoint;
window.deleteBrokerPoint = deleteBrokerPoint;
