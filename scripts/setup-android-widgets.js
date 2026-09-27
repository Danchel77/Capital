const fs = require('fs');
const path = require('path');

console.log('--- Настройка нативных виджетов Android (AppWidgetProvider) ---');

const baseRes = path.join('android/app/src/main/res');
const baseJava = path.join('android/app/src/main/java/com/budget/family');
const manifestPath = path.join('android/app/src/main/AndroidManifest.xml');
const mainActivityPath = path.join(baseJava, 'MainActivity.java');
const stringsPath = path.join(baseRes, 'values/strings.xml');

// 1. Создаем необходимые директории
[
  path.join(baseRes, 'drawable'),
  path.join(baseRes, 'xml'),
  path.join(baseRes, 'layout'),
  baseJava
].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 2. Фоны для виджетов (Drawables)
const widgetCardBg = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#161824" />
    <corners android:radius="24dp" />
    <stroke android:width="1dp" android:color="#2D3244" />
</shape>`;
fs.writeFileSync(path.join(baseRes, 'drawable/widget_card_bg.xml'), widgetCardBg);

const widgetBtnBg = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#6C5DD3" />
    <corners android:radius="10dp" />
</shape>`;
fs.writeFileSync(path.join(baseRes, 'drawable/widget_btn_bg.xml'), widgetBtnBg);

// 3. XML метаданные виджетов
const widgetFullInfo = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="260dp"
    android:minHeight="100dp"
    android:targetCellWidth="4"
    android:targetCellHeight="2"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_full_layout"
    android:previewLayout="@layout/widget_full_layout"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:description="@string/widget_full_desc">
</appwidget-provider>`;
fs.writeFileSync(path.join(baseRes, 'xml/widget_full_info.xml'), widgetFullInfo);

const widgetCompactInfo = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="140dp"
    android:minHeight="140dp"
    android:targetCellWidth="2"
    android:targetCellHeight="2"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_compact_layout"
    android:previewLayout="@layout/widget_compact_layout"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:description="@string/widget_compact_desc">
</appwidget-provider>`;
fs.writeFileSync(path.join(baseRes, 'xml/widget_compact_info.xml'), widgetCompactInfo);

// 4. Макеты RemoteViews (Layouts)
const widgetFullLayout = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_full_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="@drawable/widget_card_bg"
    android:padding="16dp">

    <!-- Верхняя шапка: Логотип и кнопка расхода -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="center_vertical"
        android:layout_marginBottom="12dp">

        <TextView
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="Семейный бюджет"
            android:textColor="#FFFFFF"
            android:textSize="13sp"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/btn_full_add_expense"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:background="@drawable/widget_btn_bg"
            android:paddingStart="10dp"
            android:paddingEnd="10dp"
            android:paddingTop="5dp"
            android:paddingBottom="5dp"
            android:text="+ Расход"
            android:textColor="#FFFFFF"
            android:textSize="11sp"
            android:textStyle="bold" />
    </LinearLayout>

    <!-- Два сбалансированных блока: Неделя и Месяц -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="horizontal"
        android:gravity="center_vertical">

        <!-- Неделя -->
        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:orientation="vertical">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="НЕДЕЛЯ"
                android:textColor="#9EADC0"
                android:textSize="10sp"
                android:textStyle="bold" />

            <TextView
                android:id="@+id/tv_full_week_avail"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="0 ₽"
                android:textColor="#FFFFFF"
                android:textSize="17sp"
                android:textStyle="bold"
                android:maxLines="1"
                android:ellipsize="end" />

            <TextView
                android:id="@+id/tv_full_week_sub"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="из 0 ₽"
                android:textColor="#7A8799"
                android:textSize="10sp"
                android:maxLines="1"
                android:ellipsize="end" />
        </LinearLayout>

        <!-- Разделитель (ImageView для совместимости с RemoteViews) -->
        <ImageView
            android:layout_width="1dp"
            android:layout_height="36dp"
            android:background="#242838"
            android:layout_marginStart="8dp"
            android:layout_marginEnd="12dp"
            android:contentDescription="@null" />

        <!-- Месяц -->
        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:orientation="vertical">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="МЕСЯЦ"
                android:textColor="#9EADC0"
                android:textSize="10sp"
                android:textStyle="bold" />

            <TextView
                android:id="@+id/tv_full_month_avail"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="0 ₽"
                android:textColor="#FFFFFF"
                android:textSize="17sp"
                android:textStyle="bold"
                android:maxLines="1"
                android:ellipsize="end" />

            <TextView
                android:id="@+id/tv_full_month_sub"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="В день: 0 ₽"
                android:textColor="#7A8799"
                android:textSize="10sp"
                android:maxLines="1"
                android:ellipsize="end" />
        </LinearLayout>
    </LinearLayout>
</LinearLayout>`;
fs.writeFileSync(path.join(baseRes, 'layout/widget_full_layout.xml'), widgetFullLayout);

const widgetCompactLayout = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_compact_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="@drawable/widget_card_bg"
    android:gravity="center"
    android:padding="16dp">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="ОСТАТОК МЕСЯЦА"
        android:textColor="#9EADC0"
        android:textSize="10sp"
        android:textStyle="bold" />

    <TextView
        android:id="@+id/tv_compact_month_avail"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="0 ₽"
        android:textColor="#FFFFFF"
        android:textSize="21sp"
        android:textStyle="bold"
        android:layout_marginTop="4dp"
        android:maxLines="1"
        android:ellipsize="end" />

    <TextView
        android:id="@+id/tv_compact_month_sub"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="В день: 0 ₽"
        android:textColor="#7A8799"
        android:textSize="11sp"
        android:layout_marginTop="2dp"
        android:maxLines="1"
        android:ellipsize="end" />

    <TextView
        android:id="@+id/btn_compact_add_expense"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:background="@drawable/widget_btn_bg"
        android:paddingTop="7dp"
        android:paddingBottom="7dp"
        android:gravity="center"
        android:text="+ Расход"
        android:textColor="#FFFFFF"
        android:textSize="12sp"
        android:textStyle="bold"
        android:layout_marginTop="12dp" />
</LinearLayout>`;
fs.writeFileSync(path.join(baseRes, 'layout/widget_compact_layout.xml'), widgetCompactLayout);

// 5. Java Providers
const widgetFullProviderJava = `package com.budget.family;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import org.json.JSONObject;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

public class WidgetFullProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void updateAllWidgets(Context context) {
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        ComponentName thisWidget = new ComponentName(context, WidgetFullProvider.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget);
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    private static void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_full_layout);

        SharedPreferences prefs = context.getSharedPreferences("BudgetWidgetPrefs", Context.MODE_PRIVATE);
        String jsonStr = prefs.getString("widget_data", "{}");

        try {
            JSONObject obj = new JSONObject(jsonStr);
            double weeklyAvailable = obj.optDouble("weeklyAvailable", 0);
            double weeklyLimit = obj.optDouble("weeklyLimit", 0);
            double monthlyAvailable = obj.optDouble("monthlyAvailable", 0);
            double dailyBudget = obj.optDouble("dailyBudget", 0);
            int daysRemaining = obj.optInt("daysRemaining", 0);

            views.setTextViewText(R.id.tv_full_week_avail, formatMoney(weeklyAvailable));
            views.setTextViewText(R.id.tv_full_week_sub, "из " + formatMoney(weeklyLimit));
            views.setTextViewText(R.id.tv_full_month_avail, formatMoney(monthlyAvailable));
            views.setTextViewText(R.id.tv_full_month_sub, formatMoney(dailyBudget) + "/дн. • " + daysRemaining + "д");
        } catch (Exception ignored) {}

        // Клик на весь виджет открывает приложение
        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openAppPending = PendingIntent.getActivity(
            context, 100, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_full_root, openAppPending);

        // Клик на кнопку "+ Расход" открывает приложение с действием new-expense
        Intent addExpenseIntent = new Intent(context, MainActivity.class);
        addExpenseIntent.putExtra("action", "new-expense");
        addExpenseIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent addExpensePending = PendingIntent.getActivity(
            context, 101, addExpenseIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.btn_full_add_expense, addExpensePending);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private static String formatMoney(double val) {
        DecimalFormatSymbols symbols = new DecimalFormatSymbols(new Locale("ru", "RU"));
        symbols.setGroupingSeparator(' ');
        DecimalFormat df = new DecimalFormat("#,##0", symbols);
        return df.format(Math.round(val)) + " ₽";
    }
}
`;
fs.writeFileSync(path.join(baseJava, 'WidgetFullProvider.java'), widgetFullProviderJava);

const widgetCompactProviderJava = `package com.budget.family;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import org.json.JSONObject;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

public class WidgetCompactProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void updateAllWidgets(Context context) {
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        ComponentName thisWidget = new ComponentName(context, WidgetCompactProvider.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget);
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    private static void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_compact_layout);

        SharedPreferences prefs = context.getSharedPreferences("BudgetWidgetPrefs", Context.MODE_PRIVATE);
        String jsonStr = prefs.getString("widget_data", "{}");

        try {
            JSONObject obj = new JSONObject(jsonStr);
            double monthlyAvailable = obj.optDouble("monthlyAvailable", 0);
            double dailyBudget = obj.optDouble("dailyBudget", 0);
            int daysRemaining = obj.optInt("daysRemaining", 0);

            views.setTextViewText(R.id.tv_compact_month_avail, formatMoney(monthlyAvailable));
            views.setTextViewText(R.id.tv_compact_month_sub, "В день: " + formatMoney(dailyBudget) + " • " + daysRemaining + " дн.");
        } catch (Exception ignored) {}

        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openAppPending = PendingIntent.getActivity(
            context, 200, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_compact_root, openAppPending);

        Intent addExpenseIntent = new Intent(context, MainActivity.class);
        addExpenseIntent.putExtra("action", "new-expense");
        addExpenseIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent addExpensePending = PendingIntent.getActivity(
            context, 201, addExpenseIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.btn_compact_add_expense, addExpensePending);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private static String formatMoney(double val) {
        DecimalFormatSymbols symbols = new DecimalFormatSymbols(new Locale("ru", "RU"));
        symbols.setGroupingSeparator(' ');
        DecimalFormat df = new DecimalFormat("#,##0", symbols);
        return df.format(Math.round(val)) + " ₽";
    }
}
`;
fs.writeFileSync(path.join(baseJava, 'WidgetCompactProvider.java'), widgetCompactProviderJava);

// 6. Capacitor Plugin для запроса закрепления виджета (requestPinAppWidget) и отправки данных
const widgetPinPluginJava = `package com.budget.family;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WidgetPin")
public class WidgetPinPlugin extends Plugin {

    @PluginMethod
    public void requestPin(PluginCall call) {
        String variant = call.getString("variant", "full");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AppWidgetManager appWidgetManager = getContext().getSystemService(AppWidgetManager.class);
            if (appWidgetManager != null && appWidgetManager.isRequestPinAppWidgetSupported()) {
                Class<?> providerClass = "compact".equals(variant) ? WidgetCompactProvider.class : WidgetFullProvider.class;
                ComponentName provider = new ComponentName(getContext(), providerClass);
                Intent callbackIntent = new Intent(getContext(), providerClass);
                PendingIntent successCallback = PendingIntent.getBroadcast(
                    getContext(),
                    0,
                    callbackIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                boolean pinned = appWidgetManager.requestPinAppWidget(provider, null, successCallback);
                JSObject ret = new JSObject();
                ret.put("success", pinned);
                call.resolve(ret);
                return;
            }
        }
        JSObject ret = new JSObject();
        ret.put("success", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void updateData(PluginCall call) {
        String jsonStr = call.getString("data", "{}");
        SharedPreferences prefs = getContext().getSharedPreferences("BudgetWidgetPrefs", Context.MODE_PRIVATE);
        prefs.edit().putString("widget_data", jsonStr).apply();
        WidgetFullProvider.updateAllWidgets(getContext());
        WidgetCompactProvider.updateAllWidgets(getContext());
        call.resolve();
    }
}`;
fs.writeFileSync(path.join(baseJava, 'WidgetPinPlugin.java'), widgetPinPluginJava);

// 7. Обновление strings.xml
if (fs.existsSync(stringsPath)) {
  let stringsContent = fs.readFileSync(stringsPath, 'utf8');
  if (!stringsContent.includes('widget_full_name')) {
    const stringEntries = [
      '    <string name="widget_full_name">Бюджет (Неделя и Месяц)</string>',
      '    <string name="widget_full_desc">Остаток бюджета на неделю и месяц</string>',
      '    <string name="widget_compact_name">Бюджет (Месяц)</string>',
      '    <string name="widget_compact_desc">Остаток бюджета на текущий месяц</string>'
    ].join('\n');
    stringsContent = stringsContent.replace('</resources>', stringEntries + '\n</resources>');
    fs.writeFileSync(stringsPath, stringsContent);
  }
}

// 8. Обновление AndroidManifest.xml
if (fs.existsSync(manifestPath)) {
  let manifestContent = fs.readFileSync(manifestPath, 'utf8');
  if (!manifestContent.includes('WidgetFullProvider')) {
    const receivers = [
      '        <receiver android:name=".WidgetFullProvider" android:exported="true" android:label="@string/widget_full_name">',
      '            <intent-filter>',
      '                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />',
      '            </intent-filter>',
      '            <meta-data',
      '                android:name="android.appwidget.provider"',
      '                android:resource="@xml/widget_full_info" />',
      '        </receiver>',
      '        <receiver android:name=".WidgetCompactProvider" android:exported="true" android:label="@string/widget_compact_name">',
      '            <intent-filter>',
      '                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />',
      '            </intent-filter>',
      '            <meta-data',
      '                android:name="android.appwidget.provider"',
      '                android:resource="@xml/widget_compact_info" />',
      '        </receiver>'
    ].join('\n');
    manifestContent = manifestContent.replace('</application>', receivers + '\n    </application>');
    fs.writeFileSync(manifestPath, manifestContent);
  }
}

// 9. Обновление MainActivity.java
if (fs.existsSync(mainActivityPath)) {
  const mainActivityCode = [
    'package com.budget.family;',
    '',
    'import android.os.Bundle;',
    'import com.getcapacitor.BridgeActivity;',
    'import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;',
    '',
    'public class MainActivity extends BridgeActivity {',
    '    @Override',
    '    public void onCreate(Bundle savedInstanceState) {',
    '        registerPlugin(GoogleAuth.class);',
    '        registerPlugin(WidgetPinPlugin.class);',
    '        super.onCreate(savedInstanceState);',
    '    }',
    '}'
  ].join('\n');
  fs.writeFileSync(mainActivityPath, mainActivityCode);
}

console.log('--- Настройка виджетов Android успешно завершена! ---');
