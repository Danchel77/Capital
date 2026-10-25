/**
 * gemini-service.js
 * Intelligent assistant powered by Google Gemini (OAuth 2.0 / API Key).
 * Provides smart merchant cleaning, categorization, and fuzzy duplicate detection.
 */

class GeminiService {
  constructor() {
    this.primaryModel = 'gemini-2.5-flash';
    this.fallbackModel = 'gemini-1.5-flash';
    this.apiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  }

  /**
   * Retrieves active authentication token (Google OAuth or user API Key).
   */
  getAuthCredential() {
    // 1. Google OAuth Access Token (automatic for Google Sign-In users)
    const oauthToken =
      window._googleAccessToken ||
      (typeof localStorage !== 'undefined'
        ? localStorage.getItem('budget_google_access_token')
        : null);

    if (oauthToken && typeof oauthToken === 'string' && oauthToken.trim().length > 10) {
      return { type: 'oauth', value: oauthToken.trim() };
    }

    // 2. Personal Gemini API Key (manual entry in Settings)
    const manualKey =
      window.Cache?.settings?.geminiApiKey ||
      (typeof localStorage !== 'undefined'
        ? localStorage.getItem('budget_gemini_api_key')
        : null);

    if (manualKey && typeof manualKey === 'string' && manualKey.trim().length > 10) {
      return { type: 'key', value: manualKey.trim() };
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
        description: 'Войдите через Google или укажите API-ключ в настройках',
      };
    }
    if (cred.type === 'oauth') {
      return {
        connected: true,
        method: 'oauth',
        label: 'Подключено через Google Аккаунт',
        description: 'Используется защищенная авторизация вашего Google-аккаунта',
      };
    }
    return {
      connected: true,
      method: 'key',
      label: 'Подключено по API-ключу',
      description: 'Используется персональный ключ Google AI Studio',
    };
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
   * Executes request with automatic fallback to secondary model.
   */
  async callWithFallback(payload) {
    try {
      return await this.executeRequest(this.primaryModel, payload);
    } catch (primaryErr) {
      console.warn(`Gemini ${this.primaryModel} failed, trying fallback:`, primaryErr);
      return await this.executeRequest(this.fallbackModel, payload);
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

    const CHUNK_SIZE = 35;
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
}

window.GeminiService = new GeminiService();
