// ==========================================
// Native Mock Mode for Visual Testing & Headless QA
// Enabled strictly via URL query: ?mock=1 or ?demo=1
// Zero production overhead: does nothing if mock is not present
// ==========================================

(function () {
  const urlParams = new URLSearchParams(window.location.search);
  const isMock =
    urlParams.get('mock') === '1' || urlParams.get('demo') === '1' || window.__MOCK_MODE__ === true;

  if (!isMock) return;

  window.__MOCK_MODE__ = true;
  console.warn('[MockMode] Native mock mode active');

  // 1. Mock User & Settings
  window.currentUser = {
    uid: 'mock-user-preview-123',
    email: 'alexey@budget.local',
    displayName: 'Алексей',
  };

  window.UserSettings = {
    marketRatesBanks: ['Сбербанк', 'ВТБ', 'Т-Банк', 'Альфа-Банк', 'Газпромбанк', 'Совкомбанк'],
    maxDepositTermMonths: 6,
    depositTags: ['новые деньги', 'капитализация'],
  };

  // 2. Realistic Mock Cache
  const mockCacheData = {
    deposits: [
      {
        id: 'dep-1',
        name: 'Сбер Накопительный',
        bank: 'Сбербанк',
        amount: 1500000,
        rate: 16.0,
        startDate: '2026-01-10',
        endDate: '2027-07-10',
        status: 'Активен',
        isInterestCredited: false,
      },
      {
        id: 'dep-2',
        name: 'Т-Банк Максимум',
        bank: 'Т-Банк',
        amount: 450000,
        rate: 15.5,
        startDate: '2026-02-01',
        endDate: '2027-08-01',
        status: 'Активен',
        isInterestCredited: false,
      },
      {
        id: 'dep-3',
        name: 'ВТБ Выгодный',
        bank: 'ВТБ',
        amount: 301162,
        rate: 14.8,
        startDate: '2026-03-15',
        endDate: '2027-09-15',
        status: 'Активен',
        isInterestCredited: false,
      },
    ],
    savingsAccounts: [
      {
        id: 'sa-1',
        name: 'Копилка ВТБ',
        bank: 'ВТБ',
        amount: 150000,
        rate: 15.0,
        status: 'Активен',
      },
      {
        id: 'sa-2',
        name: 'Озон Счёт',
        bank: 'Ozon Банк',
        amount: 85000,
        rate: 15.1,
        status: 'Активен',
      },
    ],
    transactions: [
      {
        id: '2026-11',
        monthId: '2026-11',
        label: 'Ноябрь 2026',
        items: [
          {
            id: 'tx-1',
            type: 'Доход',
            amount: 240000,
            category: 'Зарплата',
            name: 'Основная зарплата',
            date: '2026-11-05',
            rawDate: '2026-11-05',
            formattedDate: '05.11.2026',
            timestamp: 1793865600000,
            dayTimestamp: 1793865600000,
            note: '',
          },
          {
            id: 'tx-2',
            type: 'Расход',
            amount: 48500,
            category: 'Супермаркеты',
            name: 'Продукты Eurospar',
            date: '2026-11-04',
            rawDate: '2026-11-04',
            formattedDate: '04.11.2026',
            timestamp: 1793779200000,
            dayTimestamp: 1793779200000,
            note: '',
          },
          {
            id: 'tx-3',
            type: 'Расход',
            amount: 32000,
            category: 'Кафе и рестораны',
            name: 'Ужины и кофе',
            date: '2026-11-03',
            rawDate: '2026-11-03',
            formattedDate: '03.11.2026',
            timestamp: 1793692800000,
            dayTimestamp: 1793692800000,
            note: '',
          },
          {
            id: 'tx-4',
            type: 'Расход',
            amount: 28000,
            category: 'Квартира и ЖКХ',
            name: 'Коммунальные услуги',
            date: '2026-11-02',
            rawDate: '2026-11-02',
            formattedDate: '02.11.2026',
            timestamp: 1793606400000,
            dayTimestamp: 1793606400000,
            note: '',
          },
          {
            id: 'tx-5',
            type: 'Расход',
            amount: 19500,
            category: 'Транспорт и авто',
            name: 'Бензин и парковки',
            date: '2026-11-01',
            rawDate: '2026-11-01',
            formattedDate: '01.11.2026',
            timestamp: 1793520000000,
            dayTimestamp: 1793520000000,
            note: '',
          },
          {
            id: 'tx-6',
            type: 'Расход',
            amount: 15000,
            category: 'Здоровье и аптеки',
            name: 'Витамины и стоматолог',
            date: '2026-11-01',
            rawDate: '2026-11-01',
            formattedDate: '01.11.2026',
            timestamp: 1793520000000,
            dayTimestamp: 1793520000000,
            note: '',
          },
          {
            id: 'tx-7',
            type: 'Расход',
            amount: 12500,
            category: 'Одежда и обувь',
            name: 'Покупки',
            date: '2026-11-01',
            rawDate: '2026-11-01',
            formattedDate: '01.11.2026',
            timestamp: 1793520000000,
            dayTimestamp: 1793520000000,
            note: '',
          },
        ],
      },
    ],
    goals: [
      {
        id: 'goal-1',
        name: 'Резервный фонд',
        target: 1000000,
        saved: 850000,
        share: 50,
        color: '#10B981',
        icon: 'shield-check',
      },
      {
        id: 'goal-2',
        name: 'Отпуск на море',
        target: 350000,
        saved: 195000,
        share: 50,
        color: '#38BDF8',
        icon: 'plane',
      },
    ],
    calendarBills: [
      {
        id: 'bill-1',
        name: 'Ипотека / аренда',
        amount: 45000,
        day: 12,
        category: 'Квартира и ЖКХ',
      },
      { id: 'bill-2', name: 'Интернет и связь', amount: 2500, day: 18, category: 'Связь' },
    ],
    family: {
      id: 'mock-family-1',
      name: 'Семья Волковых',
      code: 'CAP-789X',
      ownerUid: 'mock-user-preview-123',
      members: [
        { uid: 'mock-user-preview-123', name: 'Алексей', avatarId: 'user', role: 'owner' },
        { uid: 'mock-user-preview-456', name: 'Мария', avatarId: 'user', role: 'member' },
      ],
    },
    userProfile: {
      displayName: 'Алексей',
      avatarId: 'user',
    },
    broker: [],
    brokerAssets: [],
    budgetPlan: {
      monthlyIncome: 240000,
    },
    categories: {
      expense: [
        'Супермаркеты',
        'Кафе и рестораны',
        'Квартира и ЖКХ',
        'Транспорт и авто',
        'Здоровье и аптеки',
        'Одежда и обувь',
      ],
      income: ['Зарплата', 'Проценты по вкладам', 'Дивиденды', 'Прочее'],
    },
    isInitialDataLoaded: true,
    isServerSyncComplete: true,
  };

  // 3. Stub Firebase network sync functions
  window.resetGlobalCache = function () {};
  window.fetchAllData = async function () {
    return true;
  };
  window.loadUserSettings = async function () {
    return window.UserSettings;
  };
  window.initNewUserIfNeeded = async function () {
    return true;
  };
  window.checkAndSendReminders = function () {};
  window.initDailyInsight = function () {};

  // 4. Populate cache
  if (!window.Cache) window.Cache = {};
  Object.assign(window.Cache, mockCacheData);

  // 5. Native Mock App Launcher on DOMContentLoaded
  window.initMockUI = function () {
    const targetTab = urlParams.get('tab') || 'capital';
    const summaryMode = urlParams.get('mode') || 'numbers';

    // Remove loading and login overlays
    const splash = document.getElementById('loading-screen');
    if (splash) splash.remove();
    const login = document.getElementById('login-screen');
    if (login) login.remove();

    // Populate user name
    const nameEl = document.getElementById('header-user-name');
    if (nameEl) nameEl.textContent = 'Алексей';

    // Ensure processed deposits
    if (typeof window.processDeposits === 'function') {
      window.Cache.deposits = window.processDeposits(window.Cache.deposits);
    }

    // Switch to target tab
    if (typeof window.switchTab === 'function') {
      window.switchTab(targetTab, { initial: true });
    }

    // Tab-specific rendering
    if (targetTab === 'capital') {
      if (typeof window.renderDeposits === 'function') window.renderDeposits();
      if (typeof window.renderSavingsAccounts === 'function') window.renderSavingsAccounts();
      if (typeof window.renderCapitalOverview === 'function') window.renderCapitalOverview();

      if (urlParams.get('openDepositForm') === '1') {
        const formContainer = document.getElementById('deposit-form-container');
        if (formContainer) formContainer.classList.remove('hidden');
      }
    } else if (targetTab === 'budget') {
      if (typeof window.renderBudgetTab === 'function') window.renderBudgetTab();
      if (typeof window.applyMonthSummaryViewMode === 'function')
        window.applyMonthSummaryViewMode(summaryMode);
      if (typeof window.updateAnalyticsForMonth === 'function')
        window.updateAnalyticsForMonth('2026-11');
      if (
        urlParams.get('openCalendar') === '1' &&
        typeof window.openBudgetCalendarModal === 'function'
      ) {
        window.openBudgetCalendarModal();
      }
      if (urlParams.get('emptyBills') === 'none') {
        window.Cache.calendarBills = [];
        if (typeof window.renderBudgetCalendar === 'function') window.renderBudgetCalendar();
      } else if (urlParams.get('emptyBills') === 'future') {
        window.Cache.calendarBills = [
          { id: 'b-later', name: 'Налог на имущество', amount: 12000, day: 28, isRegular: true },
        ];
        if (typeof window.renderBudgetCalendar === 'function') window.renderBudgetCalendar();
      }
      if (
        urlParams.get('openGoalModal') === '1' &&
        typeof window.openEditGoalModal === 'function'
      ) {
        window.openEditGoalModal('goal-1');
      }
    } else if (targetTab === 'transactions') {
      if (typeof window.renderTransactionsTab === 'function') window.renderTransactionsTab();
    }

    // Modal triggers for automated testing & screenshot previews
    if (urlParams.get('openProfile') === '1' && typeof window.openProfileModal === 'function') {
      window.openProfileModal();
    }
    if (urlParams.get('openBackup') === '1' && typeof window.openDataBackupModal === 'function') {
      window.openDataBackupModal();
    }
    if (
      urlParams.get('openChangePassword') === '1' &&
      typeof window.openChangePasswordModal === 'function'
    ) {
      window.openChangePasswordModal();
    }
    if (
      urlParams.get('openChangeLogin') === '1' &&
      typeof window.openChangeLoginModal === 'function'
    ) {
      window.openChangeLoginModal();
    }
    if (
      urlParams.get('openCreateFamily') === '1' &&
      typeof window.openCreateFamilyModal === 'function'
    ) {
      window.openCreateFamilyModal();
    }
    if (
      urlParams.get('openDeleteAccount') === '1' &&
      typeof window.openDeleteAccountModal === 'function'
    ) {
      window.openDeleteAccountModal();
    }
    if (
      urlParams.get('openAppInstall') === '1' &&
      typeof window.openAppInstallOptionsModal === 'function'
    ) {
      window.openAppInstallOptionsModal();
    }

    // Refresh Lucide icons if available
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }

    console.warn(`[MockMode] UI initialized for tab: ${targetTab}`);
  };

  // Run as soon as DOM is ready or immediately if already interactive
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initMockUI);
  } else {
    setTimeout(window.initMockUI, 50);
  }
})();
