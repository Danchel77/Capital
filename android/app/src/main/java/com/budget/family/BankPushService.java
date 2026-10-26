package com.budget.family;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * BankPushService
 * Background Android NotificationListenerService for intercepting bank push notifications,
 * AI classification and parsing with Google Gemini (and local regex fallback),
 * direct background Firestore synchronization, and instant home screen widget updates.
 */
public class BankPushService extends NotificationListenerService {

    private static final String TAG = "BankPushService";
    private static final String PREFS_NAME = "BankPushPrefs";
    private static final String WIDGET_PREFS = "BudgetWidgetPrefs";
    private static final String CHANNEL_ID = "budget_auto_expenses";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    // Map of recognized bank packages to human-friendly bank names
    private static final Map<String, String> BANK_PACKAGES = new HashMap<String, String>() {{
        put("com.idamob.tinkoff.android", "Т-Банк");
        put("ru.tinkoff.mobile", "Т-Банк");
        put("ru.sberbankmobile", "СберБанк");
        put("ru.alfabank.mobile.android", "Альфа-Банк");
        put("ru.vtb24.mobilebanking", "ВТБ");
        put("ru.raiffeisennews", "Райффайзенбанк");
        put("com.yandex.bank", "Яндекс Банк");
        put("ru.yandex.pay", "Яндекс Пэй");
        put("ru.gazprombank.android.mobilebank.app", "Газпромбанк");
        put("ru.ozon.fintech.bank", "Озон Банк");
        put("ru.mts.money", "МТС Банк");
        put("ru.rosbank.android", "Росбанк");
        put("ru.sovcomcard.halva.v1", "Совкомбанк");
        put("ru.psbank.mobile.individual", "ПСБ");
    }};

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        boolean autoExpenseEnabled = prefs.getBoolean("auto_expense_enabled", true);
        if (!autoExpenseEnabled) return;

        String packageName = sbn.getPackageName();
        if (packageName == null) return;

        String bankName = BANK_PACKAGES.get(packageName);
        if (bankName == null) {
            String pkgLower = packageName.toLowerCase(Locale.ROOT);
            if (pkgLower.contains("tinkoff") || pkgLower.contains("tbank")) bankName = "Т-Банк";
            else if (pkgLower.contains("sber")) bankName = "СберБанк";
            else if (pkgLower.contains("alfa")) bankName = "Альфа-Банк";
            else if (pkgLower.contains("vtb")) bankName = "ВТБ";
            else if (pkgLower.contains("ozon")) bankName = "Озон Банк";
            else if (pkgLower.contains("yandex")) bankName = "Яндекс Банк";
            else if (pkgLower.contains("gazprom") || pkgLower.contains("gpb")) bankName = "Газпромбанк";
            else if (pkgLower.contains("raiff")) bankName = "Райффайзенбанк";
            else if (pkgLower.contains("bank")) bankName = "Банк";
            else return; // Not a banking application
        }

        Notification notification = sbn.getNotification();
        Bundle extras = notification.extras;
        if (extras == null) return;

        CharSequence titleCs = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence textCs = extras.getCharSequence(Notification.EXTRA_TEXT);
        CharSequence bigTextCs = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);

        String title = titleCs != null ? titleCs.toString().trim() : "";
        String text = bigTextCs != null ? bigTextCs.toString().trim() : (textCs != null ? textCs.toString().trim() : "");

        if (title.isEmpty() && text.isEmpty()) return;

        long postTime = sbn.getPostTime();
        final String finalBankName = bankName;

        // Run AI classification, local parsing, Firestore sync, and widget update on background worker
        executor.execute(() -> processIncomingPush(packageName, finalBankName, title, text, postTime));
    }

    private void processIncomingPush(String packageName, String bankName, String title, String text, long postTime) {
        String fullText = (title + " " + text).trim();

        // 1. Hard-gate check for OTP codes and security alerts (instant drop)
        if (isOtpOrSecurityNotice(fullText)) {
            Log.d(TAG, "Dropped OTP or security notification: " + fullText);
            return;
        }

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        // 2. Try parsing via Google Gemini API
        PushParseResult parseResult = null;
        String geminiApiKey = prefs.getString("gemini_api_key", "");
        String userCategories = prefs.getString("user_categories", "[]");

        if (!geminiApiKey.isEmpty()) {
            parseResult = parseWithGemini(fullText, bankName, userCategories, geminiApiKey);
        }

        // 3. Fallback to robust local regex parser if Gemini was unavailable or offline
        if (parseResult == null) {
            String categoryRules = prefs.getString("category_rules", "[]");
            parseResult = parseWithLocalFallback(title, text, bankName, categoryRules);
        }

        if (parseResult == null || !parseResult.isFinancial || parseResult.amount <= 0) {
            Log.d(TAG, "Notification is not a valid financial transaction: " + fullText);
            return;
        }

        // 4. Drop internal transfers between user's own accounts
        if (parseResult.isInternalTransfer) {
            Log.d(TAG, "Dropped internal transfer between own accounts: " + parseResult.merchant);
            return;
        }

        // 5. Send transaction directly to Firestore via REST API
        boolean syncSuccess = sendToFirestore(prefs, parseResult, postTime, bankName);

        // 6. Update home screen widgets immediately
        updateWidgets(parseResult.amount, parseResult.type, parseResult.isPendingTransfer);

        // 7. Show native local notification if user enabled notifications on expense save
        boolean notifyEnabled = prefs.getBoolean("bank_push_notify_on_save_enabled", true);
        if (notifyEnabled) {
            showExpenseNotification(parseResult);
        }

        // 8. Store in pending queue and dispatch Capacitor event for foreground web UI
        recordPendingPush(prefs, packageName, title, text, postTime, syncSuccess, parseResult);

        JSObject eventData = new JSObject();
        eventData.put("packageName", packageName);
        eventData.put("title", title);
        eventData.put("text", text);
        eventData.put("postTime", postTime);
        eventData.put("amount", parseResult.amount);
        eventData.put("merchant", parseResult.merchant);
        eventData.put("category", parseResult.category);
        eventData.put("type", parseResult.type);
        eventData.put("isPendingTransfer", parseResult.isPendingTransfer);
        eventData.put("alreadySynced", syncSuccess);

        BankPushPlugin.dispatchBankPushEvent(eventData);
    }

    /**
     * Checks if notification is an authentication OTP, password, or security alert.
     */
    private boolean isOtpOrSecurityNotice(String text) {
        Pattern otpPattern = Pattern.compile(
            "(?:код\s+подтверждения|пароль\s+для\s+входа|никому\s+не\s+(?:сообщайте|передавайте)|вход\s+в\s+(?:приложение|банк)|одноразовый\s+пароль|для\s+входа\s+в\s+лк|push[- ]?код|код\s+авторизации|sms[- ]?код)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
        );
        return otpPattern.matcher(text).find();
    }

    /**
     * Parses bank notification using Google Gemini REST API.
     */
    private PushParseResult parseWithGemini(String fullText, String bankName, String categoriesJson, String apiKey) {
        HttpURLConnection conn = null;
        try {
            String primaryModel = "gemini-2.5-flash";
            String urlStr = "https://generativelanguage.googleapis.com/v1beta/models/" + primaryModel + ":generateContent?key=" + URLEncoder.encode(apiKey, "UTF-8");
            URL url = new URL(urlStr);

            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setConnectTimeout(4000);
            conn.setReadTimeout(4000);
            conn.setDoOutput(true);

            String systemInstruction = "Ты финансовый AI-парсер пуш-уведомлений банков РФ.
" +
                "Проанализируй заголовок и текст уведомления.
" +
                "Определи:
" +
                "1. Это реальная финансовая транзакция (покупка, списание, зачисление, перевод), а не реклама, предложение кредита или акция?
" +
                "2. Является ли это внутренним переводом между СВОИМИ счетами (в сейв, копилку, накопительный счет)?
" +
                "3. Является ли это переводом другому лицу (СБП, клиенту банка)?
" +
                "4. Извлеки сумму (число), тип (Расход или Доход), очисти имя магазина/мерчанта от мусора и выбери наиболее подходящую категорию из списка.
" +
                "Отвечай СТРОГО валидным JSON-объектом по схеме:
" +
                "{\"isFinancial\": true, \"amount\": 1250.0, \"type\": \"Расход\", \"merchant\": \"ВкусВилл\", \"category\": \"Продукты\", \"isInternalTransfer\": false, \"isPendingTransfer\": false}";

            JSONObject root = new JSONObject();
            JSONObject sysInst = new JSONObject();
            JSONArray sysParts = new JSONArray();
            sysParts.put(new JSONObject().put("text", systemInstruction));
            sysInst.put("parts", sysParts);
            root.put("systemInstruction", sysInst);

            JSONArray contents = new JSONArray();
            JSONObject contentObj = new JSONObject();
            JSONArray parts = new JSONArray();
            parts.put(new JSONObject().put("text", "Банк: " + bankName + "
Категории пользователя: " + categoriesJson + "
Текст уведомления: \"" + fullText + "\""));
            contentObj.put("parts", parts);
            contents.put(contentObj);
            root.put("contents", contents);

            JSONObject genConfig = new JSONObject();
            genConfig.put("responseMimeType", "application/json");
            genConfig.put("temperature", 0.1);
            root.put("generationConfig", genConfig);

            byte[] bodyBytes = root.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bodyBytes);
            }

            int code = conn.getResponseCode();
            if (code == 200) {
                String responseBody = readStream(conn.getInputStream());
                JSONObject jsonRes = new JSONObject(responseBody);
                JSONArray candidates = jsonRes.optJSONArray("candidates");
                if (candidates != null && candidates.length() > 0) {
                    JSONObject cand = candidates.getJSONObject(0);
                    JSONObject cContent = cand.optJSONObject("content");
                    if (cContent != null) {
                        JSONArray cParts = cContent.optJSONArray("parts");
                        if (cParts != null && cParts.length() > 0) {
                            String rawOutput = cParts.getJSONObject(0).optString("text", "{}");
                            JSONObject parsed = new JSONObject(rawOutput);

                            boolean isFin = parsed.optBoolean("isFinancial", false);
                            double amt = parsed.optDouble("amount", 0.0);
                            String type = parsed.optString("type", "Расход");
                            String merchant = parsed.optString("merchant", "Операция");
                            String category = parsed.optString("category", "Прочее");
                            boolean isInternal = parsed.optBoolean("isInternalTransfer", false);
                            boolean isPending = parsed.optBoolean("isPendingTransfer", false);

                            if (isFin && amt > 0) {
                                return new PushParseResult(isFin, amt, type, merchant, category, isInternal, isPending);
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Gemini push parse failed, using local fallback: " + e.getMessage());
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    /**
     * Local fallback parsing engine using financial action verbs and regex patterns.
     */
    private PushParseResult parseWithLocalFallback(String title, String text, String bankName, String categoryRulesJson) {
        String full = (title + " " + text).trim();
        String lower = full.toLowerCase(Locale.ROOT);

        // 1. Marketing / range penalty filter
        if (Pattern.compile("(?:до|от)\s+\d+.*(?:₽|руб|%|бонус|кэшбэк|кешбэк)", Pattern.CASE_INSENSITIVE).matcher(full).find()) {
            return null;
        }

        // 2. Detect internal transfer between own accounts
        boolean isInternal = Pattern.compile(
            "(?:на\s+сч[её]т\s+в\s+сейвах|в\s+сейвы|пополнение\s+с\s+карты.*на\s+сч[её]т|перевод.*между\s+(?:своими|счетами)|в\s+инвесткопилку|перевод\s+на\s+сч[её]т\s+в\s+сейв)",
            Pattern.CASE_INSENSITIVE
        ).matcher(full).find();

        // 3. Extract amount
        double amount = 0;
        Pattern[] patterns = new Pattern[] {
            Pattern.compile("(?:покупка|оплата|списание|списано|снятие|зачисление|пополнение|сумма|чек|на сумму|расход|перевод)\s*:?\s*([+\-]?\s*\d+[\s\d]*(?:[.,]\d{1,2})?)\s*(?:₽|руб|rur|rub|р\b)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("([+\-]?\s*\d+[\s\d]*(?:[.,]\d{1,2})?)\s*(?:₽|руб|rur|rub|р\b)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(?:сумма|итог)\s*[:=]\s*([+\-]?\s*\d+[\s\d]*(?:[.,]\d{1,2})?)", Pattern.CASE_INSENSITIVE)
        };

        for (Pattern p : patterns) {
            Matcher m = p.matcher(full);
            if (m.find()) {
                String numStr = m.group(1).replaceAll("[\s+]", "").replace(',', '.');
                try {
                    double val = Double.parseDouble(numStr);
                    if (val > 0 && val < 10000000) {
                        amount = Math.round(val * 100.0) / 100.0;
                        break;
                    }
                } catch (Exception ignored) {}
            }
        }

        if (amount <= 0) return null;

        // 4. Type & transfer determination
        boolean isIncome = Pattern.compile("(?:зачисление|пополнение|перевод от|возврат|зарплата|входящий перевод|\+[\d\s]+)", Pattern.CASE_INSENSITIVE).matcher(full).find()
            && !Pattern.compile("(?:списание|покупка|оплата)", Pattern.CASE_INSENSITIVE).matcher(full).find();

        boolean isPendingTransfer = !isInternal && Pattern.compile(
            "(?:пополнение\s+(?:с|из)\s+сейва|с\s+сейва|из\s+сейва|копилк|перевод|сбп|по\s+номеру|клиенту|зачисление\s+перевода)",
            Pattern.CASE_INSENSITIVE
        ).matcher(full).find();

        // 5. Clean merchant
        String merchant = cleanMerchant(text, title);

        // 6. Category mapping via stored category rules
        String category = isIncome ? "Зарплата" : "Продукты";
        if (isPendingTransfer || isInternal) {
            category = isIncome ? "Входящий перевод" : "Перевод";
        } else {
            try {
                JSONArray rules = new JSONArray(categoryRulesJson);
                for (int i = 0; i < rules.length(); i++) {
                    JSONObject r = rules.getJSONObject(i);
                    String pattern = r.optString("pattern", "").toLowerCase(Locale.ROOT);
                    if (!pattern.isEmpty() && lower.contains(pattern)) {
                        category = r.optString("category", category);
                        break;
                    }
                }
            } catch (Exception ignored) {}
        }

        return new PushParseResult(true, amount, isIncome ? "Доход" : "Расход", merchant, category, isInternal, isPendingTransfer);
    }

    private String cleanMerchant(String text, String title) {
        String clean = (text.isEmpty() ? title : text).trim();
        clean = clean.split("(?i)(?:\.|\n|\r)\s*(?:баланс|доступно|остаток|лимит|карта|кэшб|mcc|счет)")[0];
        clean = clean.split("(?i)\s+(?:баланс|доступно|остаток|лимит)[\s:]+")[0];
        clean = clean.replaceAll("(?i)^(?:сбербанк|тинькофф|т-банк|альфа-банк|втб|банк|яндекс\s*пэй|пэй|озон\s*банк|райффайзенбанк|газпромбанк)[:\s]+", "");
        clean = clean.replaceAll("(?i)^(?:покупка|оплата|списание|списано|зачисление|пополнение|снятие|перевод)(?:\s*(?:на\s+сумму|в\s+размере))?[:\s]+[+\-]?\s*[\d\s.,]+(?:₽|руб|rur|rub|р)?\s*[,.]?\s*(?:в\s+|за\s+|от\s+|клиенту\s+|на\s+карту\s+|с\s+карты\s+)?", "");
        clean = clean.replaceAll("(?i)\s+(?:карта\s+пэй|карта\s+\*?\d+|кэшбэк.*)$", "");
        clean = clean.replaceAll("^[\s,.—–:;]+|[\s,.—–:;]+$", "").trim();
        return clean.isEmpty() ? "Операция" : clean;
    }

    /**
     * Direct background write to Google Cloud Firestore via REST API with automated token refresh.
     */
    private boolean sendToFirestore(SharedPreferences prefs, PushParseResult result, long postTime, String bankName) {
        String userId = prefs.getString("auth_user_id", "");
        String idToken = prefs.getString("auth_id_token", "");
        String refreshToken = prefs.getString("auth_refresh_token", "");
        String apiKey = prefs.getString("firebase_api_key", "");
        String projectId = prefs.getString("firebase_project_id", "familybudget-4245a");
        String familyId = prefs.getString("auth_family_id", "");

        if (userId.isEmpty() || (idToken.isEmpty() && refreshToken.isEmpty())) {
            Log.w(TAG, "Cannot write to Firestore: missing user credentials");
            return false;
        }

        String targetBasePath = (!familyId.isEmpty()) ? "families/" + familyId : "users/" + userId;
        String txId = "auto_push_" + postTime + "_" + UUID.randomUUID().toString().substring(0, 5);

        SimpleDateFormat isoFmt = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        SimpleDateFormat ruFmt = new SimpleDateFormat("dd.MM.yyyy", Locale.ROOT);
        Date now = new Date();
        String dateIso = isoFmt.format(now);
        String dateRu = ruFmt.format(now);

        String authorName = prefs.getString("author_name", "Пользователь");
        String authorAvatarId = prefs.getString("author_avatar_id", "user");

        JSONObject docJson = buildFirestoreDocJson(
            txId, result, dateIso, dateRu, postTime, bankName, userId, authorName, authorAvatarId
        );

        // Attempt 1: write with current idToken
        int statusCode = writeFirestoreDoc(projectId, targetBasePath, txId, docJson, idToken);

        // If token expired (401 Unauthorized), refresh token and retry
        if (statusCode == 401 && !refreshToken.isEmpty() && !apiKey.isEmpty()) {
            String newIdToken = refreshFirebaseIdToken(apiKey, refreshToken, prefs);
            if (newIdToken != null && !newIdToken.isEmpty()) {
                statusCode = writeFirestoreDoc(projectId, targetBasePath, txId, docJson, newIdToken);
            }
        }

        boolean success = statusCode >= 200 && statusCode < 300;
        Log.i(TAG, "Firestore write status: " + statusCode + ", success: " + success);
        return success;
    }

    private JSONObject buildFirestoreDocJson(String txId, PushParseResult res, String dateIso, String dateRu, long postTime, String bankName, String uid, String name, String avatarId) {
        try {
            JSONObject fields = new JSONObject();
            fields.put("id", new JSONObject().put("stringValue", txId));
            fields.put("type", new JSONObject().put("stringValue", res.type));
            fields.put("amount", new JSONObject().put("doubleValue", res.amount));
            fields.put("category", new JSONObject().put("stringValue", res.category));
            fields.put("comment", new JSONObject().put("stringValue", res.merchant));
            fields.put("date", new JSONObject().put("stringValue", dateIso));
            fields.put("formattedDate", new JSONObject().put("stringValue", dateRu));
            fields.put("rawDate", new JSONObject().put("stringValue", dateIso));
            fields.put("source", new JSONObject().put("stringValue", "bank_push"));
            fields.put("bank", new JSONObject().put("stringValue", bankName));
            fields.put("excludeFromBudget", new JSONObject().put("booleanValue", res.isPendingTransfer));
            fields.put("isPendingTransfer", new JSONObject().put("booleanValue", res.isPendingTransfer));
            fields.put("transferStatus", new JSONObject().put("stringValue", res.isPendingTransfer ? "pending" : "confirmed"));
            fields.put("spreadMonths", new JSONObject().put("integerValue", "1"));
            fields.put("isBillPayment", new JSONObject().put("booleanValue", false));
            fields.put("timestamp", new JSONObject().put("integerValue", String.valueOf(postTime > 0 ? postTime : System.currentTimeMillis())));
            fields.put("createdAt", new JSONObject().put("integerValue", String.valueOf(System.currentTimeMillis())));

            JSONObject authorMap = new JSONObject();
            JSONObject authorFields = new JSONObject();
            authorFields.put("uid", new JSONObject().put("stringValue", uid));
            authorFields.put("name", new JSONObject().put("stringValue", name));
            authorFields.put("avatarId", new JSONObject().put("stringValue", avatarId));
            authorMap.put("fields", authorFields);
            fields.put("author", new JSONObject().put("mapValue", authorMap));

            JSONObject root = new JSONObject();
            root.put("fields", fields);
            return root;
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private int writeFirestoreDoc(String projectId, String targetBasePath, String txId, JSONObject docJson, String token) {
        HttpURLConnection conn = null;
        try {
            String urlStr = "https://firestore.googleapis.com/v1/projects/" + projectId +
                "/databases/(default)/documents/" + targetBasePath + "/Transactions/" + txId;
            URL url = new URL(urlStr);

            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("PATCH");
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setDoOutput(true);

            byte[] bodyBytes = docJson.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bodyBytes);
            }

            return conn.getResponseCode();
        } catch (Exception e) {
            Log.e(TAG, "Error writing Firestore document: " + e.getMessage());
            return -1;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private String refreshFirebaseIdToken(String apiKey, String refreshToken, SharedPreferences prefs) {
        HttpURLConnection conn = null;
        try {
            String urlStr = "https://securetoken.googleapis.com/v1/token?key=" + URLEncoder.encode(apiKey, "UTF-8");
            URL url = new URL(urlStr);

            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.setDoOutput(true);

            String body = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refreshToken, "UTF-8");
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }

            if (conn.getResponseCode() == 200) {
                String resp = readStream(conn.getInputStream());
                JSONObject json = new JSONObject(resp);
                String newIdToken = json.optString("id_token", "");
                String newRefreshToken = json.optString("refresh_token", refreshToken);

                if (!newIdToken.isEmpty()) {
                    prefs.edit()
                        .putString("auth_id_token", newIdToken)
                        .putString("auth_refresh_token", newRefreshToken)
                        .apply();
                    return newIdToken;
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to refresh Firebase token: " + e.getMessage());
        } finally {
            if (conn != null) conn.disconnect();
        }
        return null;
    }

    /**
     * Updates home screen widget metrics instantly upon expense receipt.
     */
    private void updateWidgets(double amount, String type, boolean isPending) {
        if (isPending || !"Расход".equalsIgnoreCase(type)) return;

        try {
            SharedPreferences widgetPrefs = getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE);
            String jsonStr = widgetPrefs.getString("widget_data", "{}");
            JSONObject obj = new JSONObject(jsonStr);

            double monthlySpent = obj.optDouble("monthlySpent", 0.0) + amount;
            double weeklySpent = obj.optDouble("weeklySpent", 0.0) + amount;
            double monthlyAvailable = Math.max(0.0, obj.optDouble("monthlyAvailable", 0.0) - amount);
            double monthlyLimit = obj.optDouble("monthlyLimit", 0.0);
            double weeklyLimit = obj.optDouble("weeklyLimit", 0.0);

            obj.put("monthlySpent", monthlySpent);
            obj.put("weeklySpent", weeklySpent);
            obj.put("monthlyAvailable", monthlyAvailable);

            if (monthlyLimit > 0) {
                obj.put("monthlyPct", (int) Math.round((monthlySpent / monthlyLimit) * 100));
                obj.put("monthlyOverbudget", monthlySpent > monthlyLimit);
            }
            if (weeklyLimit > 0) {
                obj.put("weeklyPct", (int) Math.round((weeklySpent / weeklyLimit) * 100));
                obj.put("weeklyOverbudget", weeklySpent > weeklyLimit);
            }

            widgetPrefs.edit().putString("widget_data", obj.toString()).apply();

            WidgetFullProvider.updateAllWidgets(this);
            WidgetCompactProvider.updateAllWidgets(this);
            WidgetActionProvider.updateAllWidgets(this);
        } catch (Exception e) {
            Log.w(TAG, "Widget update failed: " + e.getMessage());
        }
    }

    private void showExpenseNotification(PushParseResult res) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Авто-внесение трат",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Уведомления об автоматически внесенных операциях");
                nm.createNotificationChannel(channel);
            }

            String title = res.isPendingTransfer ? "Перевод: " + formatSum(res.amount) : "Расход внесен: " + formatSum(res.amount);
            String body = res.merchant + " • " + res.category;

            NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true);

            nm.notify((int) System.currentTimeMillis(), b.build());
        } catch (Exception ignored) {}
    }

    private void recordPendingPush(SharedPreferences prefs, String packageName, String title, String text, long postTime, boolean synced, PushParseResult parsed) {
        try {
            String existingQueue = prefs.getString("pending_pushes", "[]");
            JSONArray arr = new JSONArray(existingQueue);

            JSONObject item = new JSONObject();
            item.put("packageName", packageName);
            item.put("title", title);
            item.put("text", text);
            item.put("postTime", postTime);
            item.put("alreadySynced", synced);
            if (parsed != null) {
                item.put("amount", parsed.amount);
                item.put("merchant", parsed.merchant);
                item.put("category", parsed.category);
                item.put("type", parsed.type);
            }

            arr.put(item);
            prefs.edit().putString("pending_pushes", arr.toString()).apply();
        } catch (Exception ignored) {}
    }

    private String formatSum(double val) {
        return Math.round(val) + " ₽";
    }

    private String readStream(InputStream is) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            sb.append(line).append('
');
        }
        return sb.toString();
    }

    private static class PushParseResult {
        final boolean isFinancial;
        final double amount;
        final String type;
        final String merchant;
        final String category;
        final boolean isInternalTransfer;
        final boolean isPendingTransfer;

        PushParseResult(boolean isFinancial, double amount, String type, String merchant, String category, boolean isInternalTransfer, boolean isPendingTransfer) {
            this.isFinancial = isFinancial;
            this.amount = amount;
            this.type = type;
            this.merchant = merchant;
            this.category = category;
            this.isInternalTransfer = isInternalTransfer;
            this.isPendingTransfer = isPendingTransfer;
        }
    }
}
