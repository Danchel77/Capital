/**
 * calendar-bills.js
 * Calendar bills, recurring obligations, one-time expenses spread, and transaction matching.
 */

// State
let activeMatchingBillId = null;
let selectedMatchingTxId = null;
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

function getEffectiveBillAmount(bill, targetDate = new Date(), monthItems = null) {
  if (!bill) return 0;
  const d =
    targetDate ||
    (typeof getSelectedBudgetDate === 'function' ? getSelectedBudgetDate() : new Date());
  const year = d.getFullYear();
  const month = d.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  const info = getOneTimeBillMonthInfo(bill, d);
  if (!info.isActive) return 0;

  const allTxs =
    monthItems ||
    (typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : []);
  const linkedTx = allTxs.find(tx => {
    if (tx.type !== 'Расход') return false;
    if (tx.billId !== bill.id && tx.id !== bill.linkedTxId) return false;

    let txDate = null;
    if (tx.timestamp && typeof tx.timestamp === 'number') {
      txDate = new Date(tx.timestamp);
    } else if (tx.rawDate || tx.date) {
      txDate =
        typeof window.parseAnyDate === 'function'
          ? window.parseAnyDate(tx.rawDate || tx.date)
          : new Date(tx.rawDate || tx.date);
    }
    if (!txDate || isNaN(txDate.getTime())) return false;
    return txDate.getFullYear() === year && txDate.getMonth() === month;
  });

  if (linkedTx) {
    const txAmt = parseFloat(linkedTx.amount) || 0;
    if (txAmt > 0) {
      if (info.isSpread && info.totalSteps > 1) {
        return Math.round(txAmt / info.totalSteps);
      }
      return txAmt;
    }
  }

  if (bill.paidMonths && bill.paidMonths[monthKey]) {
    const pVal = bill.paidMonths[monthKey];
    if (typeof pVal === 'object' && pVal && pVal.amount) {
      const pAmt = parseFloat(pVal.amount) || 0;
      if (pAmt > 0) {
        if (info.isSpread && info.totalSteps > 1) {
          return Math.round(pAmt / info.totalSteps);
        }
        return pAmt;
      }
    }
  }

  if (info.isOneTime && bill.linkedTxId && !info.isSpread) {
    const singleTx = allTxs.find(tx => tx.id === bill.linkedTxId);
    if (singleTx) {
      const singleAmt = parseFloat(singleTx.amount) || 0;
      if (singleAmt > 0) return singleAmt;
    }
  }

  return parseFloat(bill.amount) || 0;
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

function isBillPaidInCurrentMonth(bill, monthItems, customDate) {
  const d =
    customDate ||
    (typeof getSelectedBudgetDate === 'function' ? getSelectedBudgetDate() : new Date());
  const year = d.getFullYear();
  const month = d.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  if (bill.paidMonths && bill.paidMonths[monthKey]) {
    return !!bill.paidMonths[monthKey].paid;
  }

  if (bill.isPaid && bill.paidAt) {
    const paidDate = new Date(bill.paidAt);
    if (paidDate.getFullYear() === year && paidDate.getMonth() === month) {
      return true;
    }
  }

  if (Array.isArray(monthItems)) {
    const isLinkedTxPaid = monthItems.some(
      t =>
        (t.billId === bill.id || t.id === bill.linkedTxId) &&
        (t.isBillPayment || t.excludeFromBudget)
    );
    if (isLinkedTxPaid) return true;
  }

  return false;
}
window.isBillPaidInCurrentMonth = isBillPaidInCurrentMonth;

function renderBudgetCalendar(bills, today, monthItems) {
  const container = document.getElementById('budget-calendar-list');
  const totalEl = document.getElementById('budget-bills-total');
  if (!container) return;

  let validToday;
  let itemsList;

  if (Array.isArray(today)) {
    itemsList = today;
    validToday = typeof getSelectedBudgetDate === 'function' ? getSelectedBudgetDate() : new Date();
  } else {
    validToday =
      today instanceof Date && !isNaN(today.getTime())
        ? today
        : typeof getSelectedBudgetDate === 'function'
          ? getSelectedBudgetDate()
          : new Date();
    itemsList = monthItems || [];
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
  const weekDayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const currentMonthShort = monthShortNames[validToday.getMonth()];

  const billsList = bills || Cache?.calendarBills || [];

  const activeBills = billsList.filter(b => {
    const info = getOneTimeBillMonthInfo(b, validToday);
    return info.isActive;
  });

  activeBills.sort((a, b) => {
    const infoA = getOneTimeBillMonthInfo(a, validToday);
    const infoB = getOneTimeBillMonthInfo(b, validToday);

    const groupA = !infoA.isOneTime ? 0 : infoA.currentStep === 1 ? 1 : 2;
    const groupB = !infoB.isOneTime ? 0 : infoB.currentStep === 1 ? 1 : 2;

    if (groupA !== groupB) {
      return groupA - groupB;
    }

    if (groupA === 2) {
      return (a.name || '').localeCompare(b.name || '');
    }

    return (parseInt(a.day, 10) || 1) - (parseInt(b.day, 10) || 1);
  });

  const monthlyBillsSum = billsList
    .filter(b => {
      const info = getOneTimeBillMonthInfo(b, validToday);
      return !info.isOneTime;
    })
    .reduce((s, b) => s + getEffectiveBillAmount(b, validToday, itemsList), 0);

  if (totalEl) totalEl.innerText = `Ежемесячные траты: ${formatMoney(monthlyBillsSum)}`;

  if (activeBills.length === 0) {
    container.innerHTML = `
      <div class="col-span-full card rounded-2xl p-5 text-center flex flex-col items-center justify-center gap-2.5 bg-[#181B24] border border-[rgba(255,255,255,0.06)]">
        <div class="w-10 h-10 rounded-xl bg-[#6C5DD3]/15 text-[#727cff] flex items-center justify-center">
          <i data-lucide="calendar" class="w-5 h-5"></i>
        </div>
        <div>
          <p class="text-xs font-semibold text-gray-200">Нет обязательных платежей</p>
          <p class="text-[11px] text-[#848D99] mt-0.5">Запланируйте аренду, подписки или кредиты на этот месяц</p>
        </div>
        <button type="button" onclick="openBudgetCalendarModal()" class="px-3.5 py-1.5 rounded-xl bg-[#6C5DD3] hover:bg-[#5b4ec2] text-white text-xs font-semibold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          <span>Добавить платеж</span>
        </button>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  container.innerHTML = activeBills
    .map(b => {
      const billDay = parseInt(b.day, 10) || 1;
      const info = getOneTimeBillMonthInfo(b, validToday);
      const isSubsequentPart = info.isOneTime && info.currentStep > 1;
      const isPaid = isSubsequentPart ? true : isBillPaidInCurrentMonth(b, itemsList, validToday);

      const effectiveAmount = getEffectiveBillAmount(b, validToday, itemsList);
      const baseAmount = parseFloat(b.amount) || 0;
      const isAdjusted = isPaid && Math.abs(effectiveAmount - baseAmount) > 0.01;

      const billDate = new Date(validToday.getFullYear(), validToday.getMonth(), billDay);
      const dayOfWeek = weekDayNames[billDate.getDay()];

      return `
      <div class="card group p-2.5 rounded-2xl border ${isPaid ? 'border-[#30D158]/30 bg-[#181B24]/75' : 'border-[rgba(255,255,255,0.06)] bg-[#181B24]'} hover:border-[rgba(255,255,255,0.18)] hover:bg-[#1C1F2B] flex flex-col justify-between transition-all cursor-pointer relative min-h-[82px] shadow-sm active:scale-[0.98]"
           data-id="${b.id}"
           data-table="CalendarBills"
           onclick="openEditBillModal('${b.id}')">
        
        <input type="checkbox" class="select-checkbox hidden" data-id="${b.id}">

        <div class="flex items-center justify-between gap-1 min-w-0">
          ${
            isSubsequentPart
              ? `
            <span class="text-[9.5px] font-bold text-amber-400/90 uppercase tracking-tight truncate flex-1 min-w-0">Доля ${info.currentStep} из ${info.totalSteps}</span>
            <div class="bill-pay-status w-4 h-4 rounded-full border border-[#30D158] bg-[#30D158] text-black shadow-sm flex items-center justify-center flex-shrink-0" 
                 title="Оплачено (распределенная часть)">
              <i data-lucide="check" class="w-2.5 h-2.5 opacity-100 stroke-[3]"></i>
            </div>
          `
              : `
            <span class="text-[9.5px] font-bold text-[#6C5DD3] uppercase tracking-tight truncate flex-1 min-w-0">${billDay} ${currentMonthShort} · <span class="text-[#848D99] font-normal">${dayOfWeek}</span></span>
            
            <button type="button" 
                    onclick="event.stopPropagation(); openBillPaymentMatchModal('${b.id}')" 
                    class="bill-pay-status w-4 h-4 rounded-full border transition-all flex items-center justify-center cursor-pointer flex-shrink-0 ${isPaid ? 'bg-[#30D158] border-[#30D158] text-black shadow-sm' : 'border-gray-600 hover:border-gray-400 bg-[#12151C]'}" 
                    title="${isPaid ? 'Оплачено (нажмите для управления оплатой)' : 'Отметить как оплаченный'}">
              <i data-lucide="check" class="w-2.5 h-2.5 ${isPaid ? 'opacity-100' : 'opacity-0'} stroke-[3]"></i>
            </button>
          `
          }
        </div>

        <div class="my-0.5 min-w-0">
          <h4 class="text-[11px] font-semibold text-gray-200 truncate group-hover:text-white transition-colors" title="${escapeHtml(b.name)}">${escapeHtml(b.name)}</h4>
        </div>

        <div class="pt-1 border-t border-[rgba(255,255,255,0.04)] flex items-center justify-between gap-1 min-w-0">
          <span class="text-[10.5px] font-bold font-mono text-white tracking-tight truncate min-w-0 flex-1" title="${isAdjusted ? `Фактическая оплата по привязанной операции: ${formatMoney(effectiveAmount)} (по плану: ${formatMoney(baseAmount)})` : `Сумма: ${formatMoney(effectiveAmount)}`}">-${formatCompactBillAmount(effectiveAmount, info.isOneTime)}</span>
          ${
            info.isOneTime
              ? `
            ${
              info.isSpread
                ? `
              <span class="text-[8.5px] font-mono font-bold text-amber-300 bg-amber-500/15 border border-amber-500/25 px-1 py-0.2 rounded flex items-center gap-0.5 flex-shrink-0 ml-auto" title="Распределено на ${info.totalSteps} мес. Доля текущего месяца: ${info.currentStep} из ${info.totalSteps}">
                <i data-lucide="split" class="w-2 h-2"></i>${info.currentStep}/${info.totalSteps}
              </span>
            `
                : `
              <span class="text-[8.5px] font-mono font-bold text-amber-300 bg-amber-500/15 border border-amber-500/25 px-1 py-0.2 rounded flex items-center gap-0.5 flex-shrink-0 ml-auto" title="Разовый расход">
                <i data-lucide="zap" class="w-2 h-2"></i>Разовый
              </span>
            `
            }
          `
              : ''
          }
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

    const plan = Cache?.budgetPlan || {};
    if (!plan.isConfigured) {
      if (typeof renderWizCalendar === 'function') renderWizCalendar();
      if (typeof goToWizardStep === 'function') goToWizardStep(3);
      currentWizSelectedDay = null;
      window.currentWizSelectedDay = null;
      closeWizDayTooltip();
    } else {
      if (typeof renderBudgetTab === 'function') renderBudgetTab();
      closeBudgetModalDayTooltip();
    }

    fetchAllData(true)
      .then(() => {
        if (!plan.isConfigured && typeof renderWizCalendar === 'function') {
          renderWizCalendar();
        }
      })
      .catch(() => {});
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

async function toggleBillPaidStatus(billId, newStatus) {
  try {
    const b = (Cache?.calendarBills || []).find(x => x.id === billId);
    if (b) {
      b.isPaid = newStatus;
      b.paidAt = newStatus ? Date.now() : null;
    }
    if (typeof renderBudgetTab === 'function') renderBudgetTab();

    await getUserCol('CalendarBills')
      .doc(billId)
      .update({
        isPaid: newStatus,
        paidAt: newStatus ? Date.now() : null,
      });
    fetchAllData();
  } catch (_e) {
    showToast('Ошибка обновления статуса', true);
  }
}
window.toggleBillPaidStatus = toggleBillPaidStatus;

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

  if (typeof renderWizCalendar === 'function') renderWizCalendar();
  if (typeof renderBudgetTab === 'function') renderBudgetTab();

  const plan = Cache?.budgetPlan || {};
  const isWizard =
    !plan.isConfigured ||
    document.getElementById('budget-wizard')?.classList.contains('hidden') === false;

  if (isWizard) {
    if (currentWizSelectedDay) {
      const remainingBills = (Cache?.calendarBills || []).filter(
        b => parseInt(b.day, 10) === currentWizSelectedDay
      );
      if (remainingBills.length > 0) {
        const cell = document.querySelector(`[data-wiz-day="${currentWizSelectedDay}"]`);
        if (typeof showWizDayTooltip === 'function')
          showWizDayTooltip(currentWizSelectedDay, remainingBills, cell);
      } else {
        closeWizDayTooltip();
      }
    }
  } else {
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

function renderWizCalendar() {
  const gridWiz = document.getElementById('wiz-calendar-grid');
  const gridModal = document.getElementById('budget-modal-calendar-grid');
  const totalLabelWiz = document.getElementById('wiz-bills-total-label');
  const totalLabelModal = document.getElementById('budget-modal-bills-total');

  if (!gridWiz && !gridModal) return;

  const today = new Date();
  const allBills = Cache?.calendarBills || [];
  const bills = allBills.filter(b => getOneTimeBillMonthInfo(b, today).isActive);
  const totalSum = bills.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0);
  const formattedSum = formatMoney(totalSum);

  if (totalLabelWiz) totalLabelWiz.innerText = formattedSum;
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

  if (gridWiz) gridWiz.innerHTML = html;
  if (gridModal) gridModal.innerHTML = html;
}
window.renderWizCalendar = renderWizCalendar;

function openBillPaymentMatchModal(billId, preserveSelection = false) {
  activeMatchingBillId = billId;
  if (!preserveSelection) {
    selectedMatchingTxId = null;
  }

  const bill = (Cache?.calendarBills || []).find(b => b.id === billId);
  const dlg = document.getElementById('bill-payment-match-dialog');
  if (!bill || !dlg) return;

  const targetDate =
    typeof getSelectedBudgetDate === 'function' ? getSelectedBudgetDate() : new Date();
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const info = getOneTimeBillMonthInfo(bill, targetDate);

  const titleEl = document.getElementById('bill-match-title');
  const nameEl = document.getElementById('bill-match-name');
  const dateEl = document.getElementById('bill-match-date-hint');
  const amountEl = document.getElementById('bill-match-amount');
  const unlinkBtn = document.getElementById('bill-match-unlink-btn');

  if (titleEl) {
    titleEl.innerText = info.isOneTime ? 'Оплата разовой траты' : 'Оплата ежемесячной траты';
  }
  if (nameEl) nameEl.innerText = bill.name || 'Счет';
  if (dateEl) {
    dateEl.innerText = info.isOneTime
      ? `${bill.day || 1} число`
      : `${bill.day || 1} число каждого месяца`;
  }

  const allTxs =
    typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
  const calendarBills = Cache?.calendarBills || [];

  const effectiveAmount = getEffectiveBillAmount(bill, targetDate, allTxs);
  const baseAmount = parseFloat(bill.amount) || 0;
  if (amountEl) {
    if (Math.abs(effectiveAmount - baseAmount) > 0.01) {
      amountEl.innerHTML = `${formatMoney(effectiveAmount)} <span class="text-[10px] text-[#848D99] font-normal">(план: ${formatMoney(baseAmount)})</span>`;
    } else {
      amountEl.innerText = formatMoney(baseAmount);
    }
  }

  const otherLinkedTxIds = new Set();
  calendarBills.forEach(b => {
    if (b.id !== bill.id && b.linkedTxId) {
      otherLinkedTxIds.add(b.linkedTxId);
    }
  });

  const monthTxs = allTxs.filter(t => {
    if (t.type !== 'Расход') return false;
    const dateStr = t.rawDate || t.date || '';
    const d =
      typeof parseAnyDate === 'function'
        ? parseAnyDate(dateStr)
        : dateStr
          ? new Date(dateStr)
          : null;
    if (!d || isNaN(d.getTime())) return false;
    if (d.getFullYear() !== year || d.getMonth() !== month) return false;

    if (otherLinkedTxIds.has(t.id)) return false;
    if (t.billId && t.billId !== bill.id) return false;
    if (t.isBillPayment && t.billId && t.billId !== bill.id) return false;
    if (t.isBillPayment && !t.billId && t.id !== bill.linkedTxId) return false;

    return true;
  });

  const linkedTx = monthTxs.find(
    tx =>
      (tx.billId === bill.id || tx.id === bill.linkedTxId) &&
      (tx.isBillPayment || tx.excludeFromBudget)
  );
  const isPaid = (bill.paidMonths && bill.paidMonths[monthKey]) || bill.isPaid || !!linkedTx;

  if (!preserveSelection && linkedTx) {
    selectedMatchingTxId = linkedTx.id;
  }

  if (unlinkBtn) {
    if (isPaid || linkedTx) {
      unlinkBtn.classList.remove('hidden');
    } else {
      unlinkBtn.classList.add('hidden');
    }
  }

  const billAmount = parseFloat(bill.amount) || 0;
  const tolerance = billAmount * 0.33;

  const suggestedListEl = document.getElementById('bill-match-suggested-list');
  const otherListEl = document.getElementById('bill-match-other-list');

  const suggestedTxs = [];
  const otherTxs = [];

  monthTxs.forEach(tx => {
    const amt = parseFloat(tx.amount) || 0;
    const diff = Math.abs(amt - billAmount);
    if (diff <= tolerance) {
      suggestedTxs.push(tx);
    } else {
      otherTxs.push(tx);
    }
  });

  const renderTxItem = tx => {
    const isSelected = selectedMatchingTxId === tx.id;
    const icon = typeof getCategoryIcon === 'function' ? getCategoryIcon(tx.category) : 'tag';
    return `
      <div onclick="selectBillMatchTx('${tx.id}')" 
           class="p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${isSelected ? 'bg-[#6C5DD3]/20 border-[#6C5DD3] text-white shadow-sm' : 'bg-[#12151C] border-[rgba(255,255,255,0.04)] hover:bg-[#181B24] text-gray-300'}">
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <div class="w-8 h-8 rounded-lg ${isSelected ? 'bg-[#6C5DD3] text-white' : 'bg-[#212430] text-[#727cff]'} flex items-center justify-center flex-shrink-0">
            <i data-lucide="${icon}" class="w-4 h-4"></i>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-gray-200'}">${escapeHtml(tx.category)}</p>
            <p class="text-[10px] text-[#848D99] truncate">${tx.formattedDate || tx.rawDate || tx.date || ''} ${tx.comment ? `· ${escapeHtml(tx.comment)}` : ''}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="text-xs font-bold font-mono text-white">-${formatMoney(tx.amount)}</span>
          <div class="w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'bg-[#6C5DD3] border-[#6C5DD3] text-white' : 'border-gray-600'}">
            ${isSelected ? '<i data-lucide="check" class="w-2.5 h-2.5 stroke-[3]"></i>' : ''}
          </div>
        </div>
      </div>
    `;
  };

  if (suggestedListEl) {
    if (suggestedTxs.length === 0) {
      suggestedListEl.innerHTML =
        '<div class="text-[11px] text-[#848D99] text-center py-2 px-3 bg-[#12151C] rounded-xl border border-[rgba(255,255,255,0.04)]">Подходящих операций нет. Вы можете создать новую операцию или выбрать из списка ниже.</div>';
    } else {
      suggestedListEl.innerHTML = suggestedTxs.map(renderTxItem).join('');
    }
  }

  if (otherListEl) {
    if (otherTxs.length === 0) {
      otherListEl.innerHTML =
        '<div class="text-[11px] text-[#848D99] text-center py-2">Нет других операций в этом месяце.</div>';
    } else {
      otherListEl.innerHTML = otherTxs.map(renderTxItem).join('');
    }
  }

  const applyBtn = document.getElementById('bill-match-apply-btn');
  if (applyBtn) {
    if (selectedMatchingTxId) {
      applyBtn.classList.remove('opacity-60');
      applyBtn.classList.add('opacity-100');
    } else {
      applyBtn.classList.remove('opacity-100');
      applyBtn.classList.add('opacity-60');
    }
  }

  if (typeof lockBodyScroll === 'function') lockBodyScroll();
  dlg.classList.remove('hidden');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.openBillPaymentMatchModal = openBillPaymentMatchModal;

function closeBillPaymentMatchModal() {
  const dlg = document.getElementById('bill-payment-match-dialog');
  if (dlg) {
    dlg.classList.add('hidden');
    if (typeof unlockBodyScroll === 'function') unlockBodyScroll();
  }
  activeMatchingBillId = null;
  selectedMatchingTxId = null;
}
window.closeBillPaymentMatchModal = closeBillPaymentMatchModal;

function selectBillMatchTx(txId) {
  selectedMatchingTxId = selectedMatchingTxId === txId ? null : txId;
  const bill = (Cache?.calendarBills || []).find(b => b.id === activeMatchingBillId);
  if (bill) openBillPaymentMatchModal(bill.id, true);
}
window.selectBillMatchTx = selectBillMatchTx;

function createAndLinkBillTransaction() {
  if (!activeMatchingBillId) return;
  const bill = (Cache?.calendarBills || []).find(b => b.id === activeMatchingBillId);
  if (!bill) return;

  const targetDate =
    typeof getSelectedBudgetDate === 'function' ? getSelectedBudgetDate() : new Date();
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const maxDay = new Date(year, month + 1, 0).getDate();
  const billDay = Math.min(Math.max(1, parseInt(bill.day, 10) || 1), maxDay);
  const plannedDate = new Date(year, month, billDay);

  const isOneTime = bill.type === 'onetime' || bill.type === 'Разовый';
  const totalAmount =
    isOneTime && bill.totalAmount
      ? parseFloat(bill.totalAmount) || parseFloat(bill.amount) || 0
      : parseFloat(bill.amount) || 0;
  const spreadMonths = parseInt(bill.spreadMonths, 10) || 1;

  closeBillPaymentMatchModal();

  if (typeof openCreateTxModal === 'function') {
    openCreateTxModal({
      type: 'Расход',
      amount: totalAmount,
      date: plannedDate,
      category: '',
      comment: bill.name || '',
      isBillPayment: !isOneTime,
      billType: isOneTime ? 'onetime' : 'recurring',
      excludeFromBudget: true,
      spreadMonths: spreadMonths,
      billId: bill.id,
      billName: bill.name || '',
      title: isOneTime ? 'Оплата разовой траты' : 'Оплата счета',
      subtitle: `Создание операции для «${bill.name}»`,
    });
  }
}
window.createAndLinkBillTransaction = createAndLinkBillTransaction;

async function applySelectedBillMatch() {
  if (!activeMatchingBillId) return;
  const bill = (Cache?.calendarBills || []).find(b => b.id === activeMatchingBillId);
  if (!bill) return;

  if (!selectedMatchingTxId) {
    showToast('Выберите операцию из списка или создайте новую', true);
    return;
  }

  const allTxs =
    typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];
  const tx = allTxs.find(t => t.id === selectedMatchingTxId);
  if (!tx) {
    showToast('Выбранная транзакция не найдена', true);
    return;
  }

  const targetDate =
    typeof getSelectedBudgetDate === 'function' ? getSelectedBudgetDate() : new Date();
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  const isOneTime = bill.type === 'onetime' || bill.type === 'Разовый';
  const spreadMonths = parseInt(bill.spreadMonths, 10) || tx.spreadMonths || 1;

  try {
    const batch = db.batch();

    const txRef = getUserCol('Transactions').doc(tx.id);
    batch.update(txRef, {
      isBillPayment: !isOneTime,
      billType: isOneTime ? 'onetime' : 'recurring',
      spreadMonths: spreadMonths,
      excludeFromBudget: true,
      billId: bill.id,
      billName: bill.name || '',
      updatedAt: Date.now(),
    });

    const txAmount = parseFloat(tx.amount) || 0;
    const paidMonths = { ...(bill.paidMonths || {}) };
    paidMonths[monthKey] = {
      paid: true,
      txId: tx.id,
      amount: txAmount,
    };

    const billRef = getUserCol('CalendarBills').doc(bill.id);
    batch.update(billRef, {
      isPaid: true,
      linkedTxId: tx.id,
      paidMonths: paidMonths,
      updatedAt: Date.now(),
    });

    tx.isBillPayment = !isOneTime;
    tx.billType = isOneTime ? 'onetime' : 'recurring';
    tx.spreadMonths = spreadMonths;
    tx.excludeFromBudget = true;
    tx.billId = bill.id;
    tx.billName = bill.name || '';

    bill.isPaid = true;
    bill.linkedTxId = tx.id;
    bill.paidMonths = paidMonths;

    closeBillPaymentMatchModal();
    if (typeof renderBudgetTab === 'function') renderBudgetTab();
    if (typeof renderTransactions === 'function') renderTransactions();

    showToast(`Оплата «${bill.name}» привязана`);

    batch.commit().catch(err => {
      console.error('Ошибка сохранения привязки:', err);
      showToast('Ошибка сохранения: ' + err.message, true);
    });
  } catch (err) {
    console.error('Ошибка привязки счета:', err);
    showToast('Ошибка привязки: ' + err.message, true);
  }
}
window.applySelectedBillMatch = applySelectedBillMatch;

async function unlinkCurrentBillPayment() {
  if (!activeMatchingBillId) return;
  const bill = (Cache?.calendarBills || []).find(b => b.id === activeMatchingBillId);
  if (!bill) return;

  const targetDate =
    typeof getSelectedBudgetDate === 'function' ? getSelectedBudgetDate() : new Date();
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  try {
    const batch = db.batch();
    const allTxs =
      typeof getAllCachedTransactionsFlat === 'function' ? getAllCachedTransactionsFlat() : [];

    allTxs.forEach(tx => {
      if (tx.billId === bill.id || tx.id === bill.linkedTxId) {
        tx.isBillPayment = false;
        tx.excludeFromBudget = false;
        tx.spreadMonths = 1;
        tx.billType = null;
        tx.billId = null;
        tx.billName = null;

        const txRef = getUserCol('Transactions').doc(tx.id);
        batch.update(txRef, {
          isBillPayment: false,
          excludeFromBudget: false,
          spreadMonths: 1,
          billType: null,
          billId: null,
          billName: null,
          updatedAt: Date.now(),
        });
      }
    });

    const paidMonths = { ...(bill.paidMonths || {}) };
    delete paidMonths[monthKey];

    const billRef = getUserCol('CalendarBills').doc(bill.id);
    batch.update(billRef, {
      isPaid: false,
      linkedTxId: null,
      paidMonths: paidMonths,
      updatedAt: Date.now(),
    });

    bill.isPaid = false;
    bill.linkedTxId = null;
    bill.paidMonths = paidMonths;

    closeBillPaymentMatchModal();
    if (typeof renderBudgetTab === 'function') renderBudgetTab();
    if (typeof renderTransactions === 'function') renderTransactions();

    showToast(`Оплата «${bill.name}» снята`);

    batch.commit().catch(err => {
      console.error('Ошибка снятия оплаты:', err);
      showToast('Ошибка снятия: ' + err.message, true);
    });
  } catch (err) {
    console.error('Ошибка снятия оплаты:', err);
    showToast('Ошибка снятия: ' + err.message, true);
  }
}
window.unlinkCurrentBillPayment = unlinkCurrentBillPayment;

async function handleTransactionsDeleted(txIds, deletedTxs = [], existingBatch = null) {
  if (!Array.isArray(txIds) || txIds.length === 0) return;
  const txIdSet = new Set(txIds);

  const bills = Cache?.calendarBills || [];
  if (!bills.length) return;

  const targetDate =
    typeof getSelectedBudgetDate === 'function' ? getSelectedBudgetDate() : new Date();
  const fallbackYear = targetDate.getFullYear();
  const fallbackMonth = targetDate.getMonth();
  const fallbackMonthKey = `${fallbackYear}-${String(fallbackMonth + 1).padStart(2, '0')}`;

  const batch = existingBatch || db.batch();
  let updatedAnyBill = false;

  bills.forEach(bill => {
    const isLinkedByBillTxId = bill.linkedTxId && txIdSet.has(bill.linkedTxId);
    const matchingTxs = deletedTxs.filter(t => t.billId === bill.id || t.id === bill.linkedTxId);
    const isLinkedByTxBillId = matchingTxs.length > 0;

    if (isLinkedByBillTxId || isLinkedByTxBillId) {
      updatedAnyBill = true;

      const paidMonths = { ...(bill.paidMonths || {}) };

      if (matchingTxs.length > 0) {
        matchingTxs.forEach(tx => {
          const raw = tx.rawDate || tx.date;
          const txDateObj =
            (typeof parseAnyDate === 'function' ? parseAnyDate(raw) : new Date(raw)) || targetDate;
          const mk = `${txDateObj.getFullYear()}-${String(txDateObj.getMonth() + 1).padStart(2, '0')}`;
          delete paidMonths[mk];
        });
      } else {
        delete paidMonths[fallbackMonthKey];
      }

      bill.isPaid = false;
      if (
        isLinkedByBillTxId ||
        (Array.isArray(matchingTxs) && matchingTxs.some(t => t && t.id === bill.linkedTxId))
      ) {
        bill.linkedTxId = null;
      }
      bill.paidMonths = paidMonths;

      const billRef = getUserCol('CalendarBills').doc(bill.id);
      batch.update(billRef, {
        isPaid: false,
        linkedTxId: bill.linkedTxId,
        paidMonths: paidMonths,
        updatedAt: Date.now(),
      });
    }
  });

  if (updatedAnyBill && !existingBatch) {
    try {
      await batch.commit();
    } catch (err) {
      console.error('Ошибка при сбросе статуса оплаты счетов:', err);
    }
  }
}
window.handleTransactionsDeleted = handleTransactionsDeleted;
