/**
 * gemini-service.js
 * Intelligent assistant powered by Google Gemini API.
 * Provides smart merchant cleaning, categorization, and fuzzy duplicate detection.
 */

class GeminiService {
  constructor() {
    this.primaryModel = 'gemini-3.5-flash-lite';
    this.fallbackModels = [
      'gemini-3-flash-lite',
      'gemini-2.5-flash-lite',
      'gemini-3-flash-preview',
      'gemini-3.6-flash',
    ];
    this.apiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
    this.lastError = null;
  }

  /**
   * Retrieves active authentication token (User API Key).
   */
  getAuthCredential() {
    // Personal Gemini API Key (manual entry in Settings)
    const manualKey =
      window.Cache?.settings?.geminiApiKey ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('budget_gemini_api_key') : null);

    if (manualKey && typeof manualKey === 'string' && manualKey.trim().length > 10) {
      return { type: 'custom_key', value: manualKey.trim() };
    }

    return null;
  }

  /**
   * Checks if Gemini is available for processing.
   */
  isAvailable() {
    return this.getAuthCredential() !== null;
  }

  /**
   * Returns human-readable auth status for Settings UI.
   */
  getStatus() {
    const cred = this.getAuthCredential();
    if (!cred) {
      return {
        connected: false,
        method: 'none',
        label: 'Не подключено',
        description: 'Укажите API-ключ Google AI Studio в настройках',
      };
    }
    return {
      connected: true,
      method: 'custom_key',
      label: 'Ключ сохранен',
      description: 'Используется ваш персональный ключ Google AI Studio',
    };
  }

  /**
   * Helper to format raw error text into human-friendly Russian messages.
   */
  formatErrorMessage(err) {
    if (!err) return 'Неизвестная ошибка';
    const msg = String(err.message || err);
    if (msg.includes('API_KEY_INVALID') || msg.includes('400')) {
      return 'Неверный API-ключ Google AI';
    }
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
      return 'Превышен лимит запросов к Gemini (квота)';
    }
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return 'Ошибка сети при обращении к Google AI';
    }
    return msg.replace(/^Error:\s*/, '');
  }

  /**
   * Low-level caller to Google Generative Language API.
   */
  async executeRequest(modelName, payload) {
    const cred = this.getAuthCredential();
    if (!cred) {
      throw new Error('Gemini authentication credential not found');
    }

    let url = `${this.apiBaseUrl}/${modelName}:generateContent`;
    const headers = {
      'Content-Type': 'application/json',
    };

    if (cred.type === 'oauth') {
      headers.Authorization = `Bearer ${cred.value}`;
    } else {
      url += `?key=${encodeURIComponent(cred.value)}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Gemini API HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    const textPart = candidate?.content?.parts?.[0]?.text;

    if (!textPart) {
      throw new Error('Empty response from Gemini');
    }

    return textPart.trim();
  }

  /**
   * Executes request with automatic fallback through configured models.
   */
  async callWithFallback(payload) {
    this.lastError = null;
    const modelsToTry = [this.primaryModel, ...this.fallbackModels];
    let lastErr = null;

    for (const model of modelsToTry) {
      try {
        const res = await this.executeRequest(model, payload);
        this.primaryModel = model;
        return res;
      } catch (err) {
        lastErr = err;
        console.warn(`Gemini model ${model} failed, trying fallback:`, err);
      }
    }

    this.lastError = this.formatErrorMessage(lastErr);
    throw lastErr;
  }

  /**
   * Verifies an API key against Google Generative Language API and selects the best active model.
   */
  async testConnection(apiKey) {
    const keyToTest = (apiKey || this.getAuthCredential()?.value || '').trim();
    if (!keyToTest) {
      return { ok: false, error: 'API-ключ не указан' };
    }

    try {
      // 1. Быстрый GET-запрос к официальному списку моделей пользователя
      const listUrl = `${this.apiBaseUrl}?key=${encodeURIComponent(keyToTest)}`;
      const response = await fetch(listUrl, { method: 'GET' });

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData?.error?.message) {
            errMessage = errData.error.message;
          }
        } catch (_) {
          const raw = await response.text().catch(() => '');
          if (raw) errMessage = raw;
        }

        if (response.status === 400 && errMessage.includes('API_KEY_INVALID')) {
          return { ok: false, error: 'Неверный API-ключ (API_KEY_INVALID)', status: 400 };
        }
        if (response.status === 429) {
          return { ok: false, error: 'Превышен лимит запросов к Google AI (429)', status: 429 };
        }
        return { ok: false, error: this.formatErrorMessage(errMessage), status: response.status };
      }

      const listData = await response.json();
      const rawModels = Array.isArray(listData?.models) ? listData.models : [];

      // Отбираем модели, поддерживающие generateContent
      const supportedModels = rawModels
        .filter(
          m =>
            Array.isArray(m.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes('generateContent')
        )
        .map(m => (m.name || '').replace(/^models\//, ''));

      // Приоритетный поиск быстрых и экономичных Lite-моделей
      const preferredOrder = [
        'gemini-3.5-flash-lite',
        'gemini-3-flash-lite',
        'gemini-2.5-flash-lite',
        'gemini-3-flash-preview',
        'gemini-3.6-flash',
      ];

      let selectedModel = preferredOrder.find(m => supportedModels.includes(m));

      // Если точного совпадения нет, сначала ищем любую Lite-модель
      if (!selectedModel) {
        selectedModel = supportedModels.find(m => m.toLowerCase().includes('lite'));
      }

      // Затем любую Flash-модель
      if (!selectedModel) {
        selectedModel = supportedModels.find(m => m.toLowerCase().includes('flash'));
      }

      // Если нет flash/lite, берем первую доступную для генерации
      if (!selectedModel && supportedModels.length > 0) {
        selectedModel = supportedModels[0];
      }

      if (selectedModel) {
        this.primaryModel = selectedModel;
        return {
          ok: true,
          model: selectedModel,
          message: 'Соединение успешно установлено',
        };
      }

      return {
        ok: true,
        model: this.primaryModel,
        message: 'Соединение установлено',
      };
    } catch (netErr) {
      return { ok: false, error: 'Сетевая ошибка: ' + (netErr.message || 'нет связи с Google') };
    }
  }

  /**
   * Cleans merchant names and determines categories for a batch of statement items.
   */
  async batchCleanAndCategorize(rawItems, availableCategories = []) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) return {};
    if (!this.isAvailable()) return {};

    const categoryNames = (availableCategories || [])
      .map(c => (typeof c === 'string' ? c : c?.name))
      .filter(Boolean);

    const CHUNK_SIZE = 80;
    const results = {};

    for (let i = 0; i < rawItems.length; i += CHUNK_SIZE) {
      const chunk = rawItems.slice(i, i + CHUNK_SIZE);
      const itemsPayload = chunk.map(item => ({
        id: item._id || item.id,
        rawText: item.rawDetails || item.comment || item.merchant || '',
        amount: item.amount,
        type: item.type || 'Расход',
      }));

      const systemInstruction = `Ты финансовый AI-аналитик выписок банков РФ.
Твоя задача:
1. Очистить название мерчанта от технического мусора (убери T-PAY, SBERPAY, SBP, СБП, терминальные номера, города MOSKVA/RUS, OOO, IP, латинские транслиты замени на читаемое русское название бренда).
2. Выбрать категорию СТРОГО из списка: [${categoryNames.join(', ')}]. Если точно не подходит, укажи "Прочее".
3. Определить, является ли это внутренним переводом или пополнением (isTransfer: true/false).
Отвечай СТРОГО валидным JSON-массивом объектов:
[{"id": "...", "merchant": "...", "category": "...", "isTransfer": false, "type": "Расход"}]`;

      const prompt = `Категории пользователя:\n${JSON.stringify(categoryNames)}\n\nСписок операций для анализа:\n${JSON.stringify(itemsPayload)}`;

      const payload = {
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      };

      try {
        const rawJson = await this.callWithFallback(payload);
        const parsed = JSON.parse(rawJson);
        if (Array.isArray(parsed)) {
          parsed.forEach(res => {
            if (res && res.id) {
              results[res.id] = {
                merchant: (res.merchant || '').trim(),
                category: (res.category || 'Прочее').trim(),
                isTransfer: !!res.isTransfer,
                type: res.type || 'Расход',
                processedByAi: true,
              };
            }
          });
        }
      } catch (err) {
        this.lastError = this.formatErrorMessage(err);
        console.warn('Gemini batch processing failed for chunk, falling back to local rules:', err);
      }
    }

    return results;
  }

  /**
   * Evaluates ambiguous candidate pairs (same date and amount, different descriptions).
   * Level 3 duplicate verification for user confirmation.
   */
  async evaluateAmbiguousDuplicates(pairs) {
    if (!Array.isArray(pairs) || pairs.length === 0) return {};
    if (!this.isAvailable()) return {};

    const itemsPayload = pairs.map(p => ({
      pairId: p.pairId,
      date: p.date,
      amount: p.amount,
      statementText: p.statementText,
      dbComment: p.dbComment,
    }));

    const systemInstruction = `Ты финансовый аудитор. Сравнивай пары операций, совершенных в один день на одинаковую сумму.
Одна запись пришла из банковской выписки (с кодами терминала), вторая — внесена пользователем вручную или пушем.
Определи, описывают ли они одну и ту же фактическую покупку.
Например:
- "T-PAY*SURF COFFEE 4201" и "Кофе с круассаном" -> ДА, одна покупка (Surf Coffee = кофейня).
- "IP IVANOV" и "Стрижка" -> ДА, возможно салон.
- "YANDEX GO TAXI" и "Продукты в магазине" -> НЕТ, разные траты.
Ответь СТРОГО JSON-массивом:
[{"pairId": "...", "isSameExpense": true, "confidence": 0.9, "explanation": "Краткое пояснение"}]`;

    const payload = {
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        {
          parts: [{ text: JSON.stringify(itemsPayload) }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    };

    const results = {};
    try {
      const rawJson = await this.callWithFallback(payload);
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        parsed.forEach(res => {
          if (res && res.pairId) {
            results[res.pairId] = {
              isSameExpense: !!res.isSameExpense,
              confidence: parseFloat(res.confidence) || 0.5,
              explanation: res.explanation || '',
            };
          }
        });
      }
    } catch (err) {
      console.warn('Gemini duplicate comparison failed:', err);
    }

    return results;
  }

  /**
   * Generates a concise financial insight/advice based on user's current metrics.
   */
  async generateDailyInsight(summaryData) {
    if (!this.isAvailable()) return null;

    const prompt = `Ты — финансовый аналитик в приложении для учета семейного капитала.
Данные:
- Свободный остаток за месяц: ${summaryData.delta} ₽ (Доходы: ${summaryData.income} ₽, Расходы: ${summaryData.expense} ₽)
- Обязательные платежи на 14 дней: ${summaryData.upcomingBillsSum} ₽ (${summaryData.upcomingBillsCount} счетов)
- Общий капитал (вклады + MOEX): ${summaryData.totalCapital} ₽
- Ближайшие вклады: ${summaryData.depositsHint || 'нет данных'}
- Основная цель: ${summaryData.mainGoalHint || 'не задана'}

Задача: Сформулируй РОВНО ОДНО практическое, деловое наблюдение или совет.
Правила:
1. Строго 1-2 предложения (максимум 25 слов).
2. Без приветствий, без «Я твой помощник», без смайликов и эмодзи.
3. Только деловой тон, конкретные цифры и прикладная польза.
4. Отвечай только текстом на русском языке.`;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 120,
      },
    };

    try {
      return await this.callWithFallback(payload);
    } catch (e) {
      console.warn('Gemini daily insight generation failed:', e);
      return null;
    }
  }
}

window.GeminiService = new GeminiService();
