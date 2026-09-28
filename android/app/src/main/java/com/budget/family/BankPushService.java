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
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class BankPushService extends NotificationListenerService {

    private static final String PREFS_NAME = "BankPushPrefs";
    private static final String CHANNEL_ID = "budget_auto_expenses";
    
    // Белый список пакетов официальных банков РФ
    private static final Set<String> ALLOWED_BANK_PACKAGES = new HashSet<>(Arrays.asList(
        "com.idamob.tinkoff.android",
        "ru.tinkoff.mobile",
        "ru.sberbankmobile",
        "ru.alfabank.mobile.android",
        "ru.vtb24.mobilebanking",
        "ru.raiffeisennews",
        "com.yandex.bank",
        "ru.yandex.pay",
        "ru.gazprombank.android.mobilebank.app",
        "ru.ozon.fintech.bank",
        "ru.mts.money",
        "ru.rosbank.android",
        "ru.sovcomcard.halva.v1",
        "ru.psbank.mobile.individual"
    ));

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;

        String packageName = sbn.getPackageName();
        if (packageName == null) return;

        // Фильтрация: слушаем строго банковские приложения
        boolean isAllowedBank = ALLOWED_BANK_PACKAGES.contains(packageName);
        if (!isAllowedBank) {
            // Проверка по ключевым словам в имени пакета
            String pkgLower = packageName.toLowerCase();
            if (!pkgLower.contains("bank") && !pkgLower.contains("tinkoff") && !pkgLower.contains("sber") && !pkgLower.contains("alfa") && !pkgLower.contains("vtb")) {
                return;
            }
        }

        Notification notification = sbn.getNotification();
        Bundle extras = notification.extras;
        if (extras == null) return;

        CharSequence titleCs = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence textCs = extras.getCharSequence(Notification.EXTRA_TEXT);
        CharSequence bigTextCs = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);

        String title = titleCs != null ? titleCs.toString() : "";
        String text = bigTextCs != null ? bigTextCs.toString() : (textCs != null ? textCs.toString() : "");

        if (title.isEmpty() && text.isEmpty()) return;

        // Сохраняем во временную очередь SharedPreferences для веб-части
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existingQueue = prefs.getString("pending_pushes", "[]");
            JSONArray arr = new JSONArray(existingQueue);

            JSONObject item = new JSONObject();
            item.put("packageName", packageName);
            item.put("title", title);
            item.put("text", text);
            item.put("postTime", sbn.getPostTime());

            arr.put(item);
            prefs.edit().putString("pending_pushes", arr.toString()).apply();
        } catch (Exception ignored) {}

        // Отправляем событие в плагин Capacitor в реальном времени
        JSObject data = new JSObject();
        data.put("packageName", packageName);
        data.put("title", title);
        data.put("text", text);
        data.put("postTime", sbn.getPostTime());

        BankPushPlugin.dispatchBankPushEvent(data);
    }
}
