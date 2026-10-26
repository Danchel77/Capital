/**
 * calendar-bills.js
 * Calendar bills, recurring obligations, one-time expenses spread, and transaction matching.
 */

// State
let currentWizSelectedDay = null;
window.currentWizSelectedDay = currentWizSelectedDay;

function formatShortSum(val, forceRoundK = false) {
  if (val >= 1000000) {
    const m = (val / 1000000).toFixed(1);
    return m.endsWith('.0') ? `${Math.round(val / 1000000)}M` : `${m}M`;
  }
  if (val >= 10000 || forceRoundK) {
    return `${Math.round(val / 1000)}k`;
  }
  if (val >= 1000) {
    const k = (val / 1000).toFixed(1);
    return k.endsWith('.0') ? `${Math.round(val / 1000)}k` : `${k}k`;
  }
  return `${Math.round(val)}`;
}
window.formatShortSum = formatShortSum;

function getOneTimeBillMonthInfo(bill, targetDate = new Date()) {
  const isOneTime = bill.type === 'onetime' || bill.type === 'Разовый';
  if (!isOneTime) {
    return { isActive: true, isOneTime: false, isSpread: false, currentStep: 1, totalSteps: 1 };
  }
  const spreadMonths = Math.max(1, parseInt(bill.spreadMonths, 10) || 1);
  const startMonthStr =
    bill.startMonth ||
    bill.month ||
    (typeof formatDateStr === 'function'
      ? formatDateStr(targetDate, 'yyyy-MM')
      : `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`);

  const parts = String(startMonthStr).split('-');
  const startYear = parseInt(parts[0], 10) || targetDate.getFullYear();
  const startM = parseInt(parts[1], 10) || targetDate.getMonth() + 1;

  const targetYear = targetDate.getFullYear();
  const targetM = targetDate.getMonth() + 1;

  const monthDiff = (targetYear - startYear) * 12 + (targetM - startM);
  const isActive = monthDiff >= 0 && monthDiff < spreadMonths;
  const currentStep = monthDiff + 1;

  return {
    isActive,
    isOneTime: true,
    currentStep,
    totalSteps: spreadMonths,
    isSpread: spreadMonths > 1,
    startMonthStr,
    monthDiff,
  };
}
window.getOneTimeBillMonthInfo = getOneTimeBillMonthInfo;

function getEffectiveBillAmount(bill, targetDate = new Date()) {
  if (!bill) return 0;
  const d =
    targetDate ||
    (typeof getSelectedBudgetDate === 'function' ? getSelectedBudgetDate() : new Date());

  const info = getOneTimeBillMonthInfo(bill, d);
  if (!info.isActive) return 0;

  const rawAmt = parseFloat(bill.amount) || 0;
  if (info.isSpread && info.totalSteps > 1) {
    return Math.round(rawAmt / info.totalSteps);
  }
  return rawAmt;
}
window.getEffectiveBillAmount = getEffectiveBillAmount;

function formatCompactBillAmount(amount, hasBadge = false) {
  if (window.isPrivacyModeEnabled) {
    return '•••• ₽';
  }
  const num = parseFloat(amount) || 0;
  if (hasBadge && num >= 10000) {
    const k = (num / 1000).toFixed(num % 1000 === 0 ? 0 : 1).replace('.0', '');
    return `${k}k ₽`;
  }
  return formatMoney(num);
}
window.formatCompactBillAmount = formatCompactBillAmount;

function getUpcomingBills(daysAhead = 14, fromDate = new Date()) {
  const allBills = Cache?.calendarBills || [];
  const today = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate(),
    0,
    0,
    0,
    0
  );
  const todayTime = today.getTime();
  const maxTime = todayTime + daysAhead * 24 * 60 * 60 * 1000;

  const upcomingList = [];

  allBills.forEach(bill => {
    const rawDay = parseInt(bill.day, 10);
    if (isNaN(rawDay) || rawDay < 1 || rawDay > 31) return;

    const info = getOneTimeBillMonthInfo(bill, today);
    if (!info.isActive) return;

    const amount = getEffectiveBillAmount(bill, today);
    if (amount <= 0) return;

    // Ищем дату в текущем месяце
    const daysInCurMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const curMonthDay = Math.min(rawDay, daysInCurMonth);
    const dateCur = new Date(today.getFullYear(), today.getMonth(), curMonthDay, 0, 0, 0, 0);
    if (dateCur.getTime() >= todayTime) {
      const candTime = dateCur.getTime();
      if (candTime <= maxTime) {
        const diffDays = Math.round((candTime - todayTime) / (24 * 60 * 60 * 1000));
        upcomingList.push({
          bill,
          date: dateCur,
          daysLeft: diffDays,
          amount,
        });
      }
    } else if (!info.isOneTime || info.isSpread) {
      // Дата в следующем месяце
      const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const nextMonthInfo = getOneTimeBillMonthInfo(bill, nextMonthDate);
      if (nextMonthInfo.isActive) {
        const daysInNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0).getDate();
        const nextMonthDay = Math.min(rawDay, daysInNextMonth);
        const dateNext = new Date(
          today.getFullYear(),
          today.getMonth() + 1,
          nextMonthDay,
          0,
          0,
          0,
          0
        );
        const candTime = dateNext.getTime();
        if (candTime <= maxTime) {
          const diffDays = Math.round((candTime - todayTime) / (24 * 60 * 60 * 1000));
          upcomingList.push({
            bill,
            date: dateNext,
            daysLeft: diffDays,
            amount,
          });
        }
      }
    }
  });

  upcomingList.sort((a, b) => a.daysLeft - b.daysLeft);
  const totalAmount = upcomingList.reduce((sum, item) => sum + item.amount, 0);

  return { items: upcomingList, totalAmount };
}
window.getUpcomingBills = getUpcomingBills;

function renderBudgetCalendar() {
  const container = document.getElementById('budget-calendar-list');
  const totalEl = document.getElementById('budget-bills-total');
  if (!container) return;

  const today = new Date();
  const { items: upcomingBills, totalAmount } = getUpcomingBills(14, today);

  if (totalEl) {
    totalEl.innerText = `Ближайшие 14 дней: ${formatMoney(totalAmount)}`;
  }

  if (upcomingBills.length === 0) {
    container.innerHTML = `
      <div class="card rounded-2xl p-4 text-center flex flex-col items-center justify-center gap-2 bg-[#181B24] border border-[rgba(255,255,255,0.06)]">
        <div class="w-9 h-9 rounded-xl bg-[#212430] text-[#848D99] flex items-center justify-center">
          <i data-lucide="calendar-check-2" class="w-4 h-4 text-[#6C5DD3]"></i>
        </div>
        <div>
          <p class="text-xs font-semibold text-gray-200">Нет списаний на ближайшие две недели</p>
          <p class="text-[11px] text-[#848D99] mt-0.5">Все регулярные платежи распределены дальше по календарю</p>
        </div>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  const monthShortNames = [
    'янв',
    'фев',
    'мар',
    'апр',
    'май',
    'июн',
    'июл',
    'авг',
    'сен',
    'окт',
    'ноя',
    'дек',
  ];

  container.innerHTML = upcomingBills
    .map(item => {
      const b = item.bill;
      const dayNum = item.date.getDate();
      const monthStr = monthShortNames[item.date.getMonth()];

      let daysBadgeClass = 'bg-[#212430] text-gray-300 border-[rgba(255,255,255,0.06)]';
      let daysText = `Через ${item.daysLeft} дн.`;
      if (item.daysLeft === 0) {
        daysBadgeClass = 'bg-[#FF453A]/15 text-[#FF453A] border-[#FF453A]/25';
        daysText = 'Сегодня';
      } else if (item.daysLeft === 1) {
        daysBadgeClass = 'bg-[#FF9F0A]/15 text-[#FF9F0A] border-[#FF9F0A]/25';
        daysText = 'Завтра';
      } else if (item.daysLeft <= 4) {
        daysBadgeClass = 'bg-[#6C5DD3]/15 text-[#9DA5FF] border-[#6C5DD3]/25';
        daysText = `Через ${item.daysLeft} дн.`;
      }

      const typeDesc = b.type === 'onetime' ? 'Разовый платеж' : 'Регулярный счет';

      return `
      <div class="card p-3 rounded-2xl bg-[#181B24] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.14)] hover:bg-[#1C202C] flex items-center justify-between gap-3 transition-all cursor-pointer select-none active:scale-[0.99]"
           onclick="openEditBillModal('${b.id}')">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-[#212430] border border-[rgba(255,255,255,0.04)] text-gray-300 flex flex-col items-center justify-center flex-shrink-0 leading-tight">
            <span class="text-xs font-bold text-white leading-none">${dayNum}</span>
            <span class="text-[9px] text-[#848D99] uppercase font-semibold leading-none mt-0.5">${monthStr}</span>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-white truncate">${escapeHtml(b.name)}</span>
              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border ${daysBadgeClass}">${daysText}</span>
            </div>
            <span class="text-[10px] text-[#848D99] block mt-0.5">${typeDesc}</span>
          </div>
        </div>

        <div class="text-right flex-shrink-0">
          <span class="text-xs font-mono font-bold text-white">${formatMoney(item.amount)}</span>
        </div>
      </div>
    `;
    })
    .join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.renderBudgetCalendar = renderBudgetCalendar;

function setBillType(type) {
  const input = document.getElementById('bill-type');
  if (input) input.value = type || 'recurring';
}
window.setBillType = setBillType;

function openAddBillModal(initialDay = null) {
  const form = document.getElementById('calendar-bill-form');
  if (form) form.reset();

  const editIdEl = document.getElementById('bill-edit-id');
  if (editIdEl) editIdEl.value = '';

  const targetDay = parseInt(initialDay, 10) || currentWizSelectedDay || 1;
  currentWizSelectedDay = targetDay;
  window.currentWizSelectedDay = currentWizSelectedDay;

  const dayInput = document.getElementById('bill-day');
  if (dayInput) dayInput.value = targetDay;

  const typeInput = document.getElementById('bill-type');
  if (typeInput) typeInput.value = 'recurring';

  const actions = document.getElementById('bill-dialog-actions');
  const deleteBtn = document.getElementById('bill-delete-btn');
  const title = document.getElementById('calendar-bill-dialog-title');

  if (actions) actions.classList.remove('hidden');
  if (deleteBtn) deleteBtn.classList.add('hidden');
  if (title) title.innerText = `Ежемесячный счет на ${targetDay} число`;

  const dlg = document.getElementById('calendar-bill-dialog');
  if (dlg) dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: dlg });
}
window.openAddBillModal = openAddBillModal;

function closeAddBillModal() {
  const dlg = document.getElementById('calendar-bill-dialog');
  if (dlg) dlg.classList.add('hidden');
}
window.closeAddBillModal = closeAddBillModal;

function openEditBillModal(billId) {
  if (typeof isSelectionMode === 'function' && isSelectionMode()) return;
  if (window.isSelectionMode && window.isSelectionMode()) return;
  const bill = Cache?.calendarBills?.find(b => b.id === billId);
  if (!bill) return;

  const dlg = document.getElementById('calendar-bill-dialog');
  const title = document.getElementById('calendar-bill-dialog-title');
  const deleteBtn = document.getElementById('bill-delete-btn');

  document.getElementById('bill-edit-id').value = bill.id;
  document.getElementById('bill-name').value = bill.name;
  setFormattedVal('bill-amount', bill.amount);

  const dayInput = document.getElementById('bill-day');
  if (dayInput) dayInput.value = bill.day;
  currentWizSelectedDay = parseInt(bill.day, 10) || 1;
  window.currentWizSelectedDay = currentWizSelectedDay;

  const typeInput = document.getElementById('bill-type');
  if (typeInput) typeInput.value = 'recurring';

  if (title) title.innerText = `Редактировать счет (${bill.day} число)`;
  if (deleteBtn) deleteBtn.classList.remove('hidden');

  if (dlg) dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons({ root: dlg });
}
window.openEditBillModal = openEditBillModal;

async function submitCalendarBill(e) {
  e.preventDefault();
  const editId = document.getElementById('bill-edit-id')?.value;
  const name = document.getElementById('bill-name')?.value.trim();
  const amount = getUnformattedVal(document.getElementById('bill-amount'));
  const dayInput = document.getElementById('bill-day');
  const day =
    parseInt(dayInput ? dayInput.value : currentWizSelectedDay, 10) || currentWizSelectedDay || 1;

  if (!name || !amount) return;

  try {
    const col = getUserCol('CalendarBills');
    const existingBill = editId ? (Cache?.calendarBills || []).find(b => b.id === editId) : null;

    const billData = {
      name,
      amount: parseFloat(amount) || 0,
      totalAmount: parseFloat(amount) || 0,
      spreadMonths: 1,
      day,
      type: 'recurring',
      startMonth: null,
      month: null,
      updatedAt: Date.now(),
    };

    if (!Cache.calendarBills) Cache.calendarBills = [];

    if (editId) {
      if (existingBill) Object.assign(existingBill, billData);
      await col.doc(editId).update(billData);
    } else {
      const newBill = { ...billData, isPaid: false, createdAt: Date.now() };
      const docRef = await col.add(newBill);
      newBill.id = docRef.id;
      Cache.calendarBills.push(newBill);
    }

    closeAddBillModal();
    document.getElementById('calendar-bill-form')?.reset();
    if (document.getElementById('bill-edit-id')) document.getElementById('bill-edit-id').value = '';

    if (typeof renderBudgetTab === 'function') renderBudgetTab();
    closeBudgetModalDayTooltip();

    fetchAllData(true).catch(() => {});
  } catch (err) {
    showToast('Ошибка: ' + err.message, true);
  }
}
window.submitCalendarBill = submitCalendarBill;

async function deleteCurrentEditingBill() {
  const id = document.getElementById('bill-edit-id')?.value;
  if (!id) return;

  closeAddBillModal();
  deleteCalendarBill(id);
}
window.deleteCurrentEditingBill = deleteCurrentEditingBill;

function openDayBillsModal(day) {
  const dlg = document.getElementById('day-bills-dialog');
  const title = document.getElementById('day-bills-title');
  const list = document.getElementById('day-bills-items-list');
  const addBtn = document.getElementById('btn-add-second-bill');

  window.currentDayBillsModalDay = day;

  if (title) title.innerText = `${day} число: список платежей`;
  if (dlg) dlg.classList.remove('hidden');

  const today = new Date();
  const bills = (Cache?.calendarBills || []).filter(
    b => parseInt(b.day, 10) === parseInt(day, 10) && getOneTimeBillMonthInfo(b, today).isActive
  );

  if (list) {
    if (bills.length === 0) {
      list.innerHTML =
        '<div class="text-center py-4 text-xs text-[#848D99]">Счетов на этот день нет</div>';
    } else {
      list.innerHTML = bills
        .map(b => {
          const info = getOneTimeBillMonthInfo(b, today);
          return `
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-[#12151C] border border-[rgba(255,255,255,0.04)] text-xs">
            <div>
              <div class="font-semibold text-white flex items-center gap-1.5">
                ${escapeHtml(b.name)}
                ${info.isSpread ? `<span class="text-[9px] text-amber-300 font-mono">(${info.currentStep}/${info.totalSteps})</span>` : ''}
              </div>
              <div class="font-mono text-[11px] text-[#848D99]">-${formatMoney(b.amount)}</div>
            </div>
            <button type="button" onclick="deleteCalendarBill('${b.id}')" class="text-gray-500 hover:text-[#FF453A] p-1.5 cursor-pointer">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `;
        })
        .join('');
    }
  }

  if (addBtn) {
    addBtn.onclick = () => {
      closeDayBillsModal();
      openAddBillModal(day);
    };
  }

  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.openDayBillsModal = openDayBillsModal;

function closeDayBillsModal() {
  const dlg = document.getElementById('day-bills-dialog');
  if (dlg) dlg.classList.add('hidden');
}
window.closeDayBillsModal = closeDayBillsModal;

async function deleteCalendarBill(billId) {
  if (!billId) return;

  const deletedBill = (Cache?.calendarBills || []).find(b => b.id === billId);
  Cache.calendarBills = (Cache?.calendarBills || []).filter(b => b.id !== billId);

  if (deletedBill?.linkedTxId) {
    try {
      await getUserCol('Transactions')
        .doc(deletedBill.linkedTxId)
        .update({ excludeFromBudget: false });
      (Cache.transactions || []).forEach(m => {
        (m.items || []).forEach(tx => {
          if (tx.id === deletedBill.linkedTxId) tx.excludeFromBudget = false;
        });
      });
    } catch (e) {
      console.warn('Не удалось обновить транзакцию при удалении счета:', e);
    }
  }

  if (typeof renderBudgetTab === 'function') renderBudgetTab();

  const modalCalendar = document.getElementById('budget-calendar-modal');
  if (modalCalendar && !modalCalendar.classList.contains('hidden') && currentWizSelectedDay) {
    const remainingBills = (Cache?.calendarBills || []).filter(
      b => parseInt(b.day, 10) === currentWizSelectedDay
    );
    if (remainingBills.length > 0) {
      const cell = document.querySelector(
        `#budget-modal-calendar-grid [data-wiz-day="${currentWizSelectedDay}"]`
      );
      showBudgetModalDayTooltip(currentWizSelectedDay, remainingBills, cell);
    } else {
      closeBudgetModalDayTooltip();
    }
  }

  const dayDlg = document.getElementById('day-bills-dialog');
  if (dayDlg && !dayDlg.classList.contains('hidden') && window.currentDayBillsModalDay) {
    const dayBills = (Cache?.calendarBills || []).filter(
      b => parseInt(b.day, 10) === window.currentDayBillsModalDay
    );
    if (dayBills.length > 0) {
      openDayBillsModal(window.currentDayBillsModalDay);
    } else {
      closeDayBillsModal();
    }
  }

  try {
    await getUserCol('CalendarBills').doc(billId).delete();
  } catch (e) {
    console.error('Ошибка фонового удаления счета:', e);
    showToast('Ошибка синхронизации удаления', true);
    if (deletedBill) {
      Cache.calendarBills.push(deletedBill);
      if (typeof renderWizCalendar === 'function') renderWizCalendar();
      if (typeof renderBudgetTab === 'function') renderBudgetTab();
    }
  }
}
window.deleteCalendarBill = deleteCalendarBill;

function openBudgetCalendarModal() {
  const dlg = document.getElementById('budget-calendar-modal');
  if (dlg) {
    if (typeof lockBodyScroll === 'function') lockBodyScroll();
    dlg.classList.remove('hidden');
    renderWizCalendar();
  }
}
window.openBudgetCalendarModal = openBudgetCalendarModal;

function closeBudgetCalendarModal() {
  const dlg = document.getElementById('budget-calendar-modal');
  if (dlg) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
  closeBudgetModalDayTooltip();
}
window.closeBudgetCalendarModal = closeBudgetCalendarModal;

function closeBudgetModalDayTooltip() {
  const tooltip = document.getElementById('budget-modal-day-tooltip');
  if (tooltip) tooltip.classList.add('hidden');
  currentWizSelectedDay = null;
  window.currentWizSelectedDay = null;
  document
    .querySelectorAll('#budget-modal-calendar-grid .wiz-day-cell.is-selected')
    .forEach(el => el.classList.remove('is-selected'));
}
window.closeBudgetModalDayTooltip = closeBudgetModalDayTooltip;

function addAnotherBillFromBudgetModalTooltip() {
  const day = currentWizSelectedDay || 1;
  closeBudgetModalDayTooltip();
  openAddBillModal(day);
}
window.addAnotherBillFromBudgetModalTooltip = addAnotherBillFromBudgetModalTooltip;

function showBudgetModalDayTooltip(day, bills, targetEl) {
  const tooltip = document.getElementById('budget-modal-day-tooltip');
  const dayBadge = document.getElementById('budget-modal-tooltip-day-badge');
  const title = document.getElementById('budget-modal-tooltip-title');
  const list = document.getElementById('budget-modal-tooltip-bills-list');
  const addLabel = document.getElementById('budget-modal-tooltip-add-label');
  const wrapper = document.getElementById('budget-modal-calendar-wrapper');

  if (!tooltip || !list || !wrapper) return;

  if (dayBadge) dayBadge.innerText = `${day}`;
  if (title) title.innerText = `Платежи (${bills.length})`;
  if (addLabel) addLabel.innerText = `Добавить еще платеж на ${day} число`;

  const today = new Date();
  list.innerHTML = bills
    .map(b => {
      const info = getOneTimeBillMonthInfo(b, today);
      return `
      <div class="flex items-center justify-between p-2 rounded-xl bg-[#12151C] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-all">
        <div class="min-w-0 pr-2 cursor-pointer flex-1" onclick="openEditBillModal('${b.id}')">
          <div class="flex items-center gap-1.5 mb-0.5">
            <span class="text-xs font-semibold text-white truncate block">${escapeHtml(b.name)}</span>
            ${
              info.isSpread
                ? `<span class="text-[8px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5 flex-shrink-0 font-medium font-mono"><i data-lucide="split" class="w-2.5 h-2.5"></i>${info.currentStep}/${info.totalSteps}</span>`
                : info.isOneTime
                  ? `<span class="text-[8px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-0.5 flex-shrink-0 font-medium"><i data-lucide="zap" class="w-2.5 h-2.5"></i>Разовый</span>`
                  : `<span class="text-[8px] px-1.5 py-0.2 rounded bg-[#6C5DD3]/20 text-[#a594fd] border border-[#6C5DD3]/30 flex items-center gap-0.5 flex-shrink-0 font-medium">Ежемесячно</span>`
            }
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-mono font-bold text-gray-200">-${formatMoney(b.amount)}</span>
            ${info.isSpread ? `<span class="text-[9px] text-[#848D99] font-mono">из ${formatMoney(b.totalAmount || b.amount * b.spreadMonths)}</span>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          <button type="button" onclick="openEditBillModal('${b.id}')" class="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#212430] cursor-pointer transition-colors" title="Редактировать">
            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
          </button>
          <button type="button" onclick="deleteCalendarBill('${b.id}')" class="text-gray-400 hover:text-[#FF453A] p-1 rounded-lg hover:bg-[#212430] cursor-pointer transition-colors" title="Удалить">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;
    })
    .join('');

  if (typeof lucide !== 'undefined') lucide.createIcons();

  tooltip.classList.remove('hidden');

  const cell =
    targetEl || document.querySelector(`#budget-modal-calendar-grid [data-wiz-day="${day}"]`);
  if (!cell) return;

  const wrapperRect = wrapper.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();

  const cellTop = cellRect.top - wrapperRect.top;
  const cellLeft = cellRect.left - wrapperRect.left;
  const cellWidth = cellRect.width;
  const cellHeight = cellRect.height;

  const tooltipWidth = tooltip.offsetWidth || 260;
  const tooltipHeight = tooltip.offsetHeight || 180;

  let left = cellLeft + cellWidth / 2 - tooltipWidth / 2;
  const minLeft = 8;
  const maxLeft = Math.max(minLeft, wrapperRect.width - tooltipWidth - 8);
  left = Math.max(minLeft, Math.min(left, maxLeft));

  const spaceBelow = wrapperRect.height - (cellTop + cellHeight);
  const spaceAbove = cellTop;

  let top = 0;
  if (spaceBelow >= tooltipHeight + 12 || spaceBelow >= spaceAbove) {
    top = cellTop + cellHeight + 6;
  } else {
    top = Math.max(6, cellTop - tooltipHeight - 6);
  }

  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}
window.showBudgetModalDayTooltip = showBudgetModalDayTooltip;

function renderCalendarGrid() {
  const gridModal = document.getElementById('budget-modal-calendar-grid');
  const totalLabelModal = document.getElementById('budget-modal-bills-total');

  if (!gridModal) return;

  const today = new Date();
  const allBills = Cache?.calendarBills || [];
  const bills = allBills.filter(b => getOneTimeBillMonthInfo(b, today).isActive);
  const totalSum = bills.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0);
  const formattedSum = formatMoney(totalSum);

  if (totalLabelModal) totalLabelModal.innerText = formattedSum;

  let html = '';

  for (let day = 1; day <= 31; day++) {
    const dayBills = bills.filter(b => parseInt(b.day, 10) === day);
    const count = dayBills.length;
    const hasBills = count > 0;
    const isSelected = day === currentWizSelectedDay;

    let chipsHtml = '';
    if (count === 1) {
      const b = dayBills[0];
      const info = getOneTimeBillMonthInfo(b, today);
      const formatted = formatShortSum(b.amount, false);
      const spreadHint = info.isSpread
        ? ` (${info.currentStep}/${info.totalSteps})`
        : info.isOneTime
          ? ' (Разовый)'
          : ' (Ежемесячно)';
      chipsHtml = `
        <div class="wiz-chips-wrap">
          <span class="wiz-bill-chip is-single ${info.isOneTime ? 'is-onetime' : 'is-recurring'}" title="${escapeHtml(b.name)}: ${formatMoney(b.amount)}${spreadHint}">${formatted}</span>
        </div>
      `;
    } else if (count === 2) {
      chipsHtml = `<div class="wiz-chips-wrap">${dayBills
        .map(b => {
          const info = getOneTimeBillMonthInfo(b, today);
          const formatted = formatShortSum(b.amount, true);
          const spreadHint = info.isSpread
            ? ` (${info.currentStep}/${info.totalSteps})`
            : info.isOneTime
              ? ' (Разовый)'
              : ' (Ежемесячно)';
          return `<span class="wiz-bill-chip ${info.isOneTime ? 'is-onetime' : 'is-recurring'}" title="${escapeHtml(b.name)}: ${formatMoney(b.amount)}${spreadHint}">${formatted}</span>`;
        })
        .join('')}</div>`;
    } else if (count > 2) {
      const totalDaySum = dayBills.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0);
      const formatted = formatShortSum(totalDaySum, true);
      chipsHtml = `
        <div class="wiz-chips-wrap">
          <span class="wiz-bill-chip is-multi" title="${count} платежей на сумму ${formatMoney(totalDaySum)}">
            ${formatted}
            <span class="wiz-count-badge">${count}</span>
          </span>
        </div>
      `;
    }

    html += `
      <div data-wiz-day="${day}" onclick="handleWizardDayClick(${day}, event)" class="wiz-day-cell ${isSelected ? 'is-selected' : ''} ${hasBills ? 'has-bills' : ''}">
        <span class="wiz-day-num">${day}</span>
        ${chipsHtml}
      </div>
    `;
  }

  if (gridModal) gridModal.innerHTML = html;
}
window.renderCalendarGrid = renderCalendarGrid;
window.renderWizCalendar = renderCalendarGrid;

function handleWizardDayClick(day, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const today = new Date();
  const bills = (Cache?.calendarBills || []).filter(
    b => parseInt(b.day, 10) === parseInt(day, 10) && getOneTimeBillMonthInfo(b, today).isActive
  );
  currentWizSelectedDay = day;
  window.currentWizSelectedDay = day;

  if (bills.length > 0) {
    const cell = document.querySelector(`#budget-modal-calendar-grid [data-wiz-day="${day}"]`);
    if (typeof showBudgetModalDayTooltip === 'function') {
      showBudgetModalDayTooltip(day, bills, cell);
    } else {
      openDayBillsModal(day);
    }
  } else {
    openAddBillModal(day);
  }
}
window.handleWizardDayClick = handleWizardDayClick;
window.selectWizCalendarDay = handleWizardDayClick;

// Безопасная заглушка для удаления транзакций (привязка к счетам упразднена)
async function handleTransactionsDeleted() {}
window.handleTransactionsDeleted = handleTransactionsDeleted;
