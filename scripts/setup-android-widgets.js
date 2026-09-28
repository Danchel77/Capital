const fs = require('fs');
const path = require('path');

console.log('--- Настройка нативных виджетов Android (AppWidgetProvider + Configuration) ---');

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
  path.join(baseRes, 'values'),
  baseJava
].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 2. Векторные ресурсы и подложки для предпросмотра и кнопок (Drawables)
const widgetBtnBg = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#6C5DD3" />
    <corners android:radius="14dp" />
</shape>`;
fs.writeFileSync(path.join(baseRes, 'drawable/widget_btn_bg.xml'), widgetBtnBg);

const widgetPreviewBg = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#1A1C28" />
    <stroke android:width="1.2dp" android:color="#363A4D" />
    <corners android:radius="20dp" />
</shape>`;
fs.writeFileSync(path.join(baseRes, 'drawable/widget_preview_bg.xml'), widgetPreviewBg);

const widgetSampleCircle = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- Фоновый темный круг-подложка -->
    <item>
        <shape android:shape="oval">
            <solid android:color="#14261F" />
            <stroke android:width="4.5dp" android:color="#23352D" />
            <size android:width="48dp" android:height="48dp" />
        </shape>
    </item>
    <!-- Акцентное кольцо прогресса -->
    <item>
        <shape android:shape="oval">
            <stroke android:width="4.5dp" android:color="#30D158" />
            <size android:width="48dp" android:height="48dp" />
        </shape>
    </item>
</layer-list>`;
fs.writeFileSync(path.join(baseRes, 'drawable/widget_sample_circle.xml'), widgetSampleCircle);

const widgetSampleBar = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- Фоновый трек шкалы -->
    <item>
        <shape android:shape="rectangle">
            <solid android:color="#242838" />
            <corners android:radius="4dp" />
            <size android:height="8dp" />
        </shape>
    </item>
    <!-- Заполненная часть шкалы -->
    <item android:right="55dp">
        <shape android:shape="rectangle">
            <solid android:color="#30D158" />
            <corners android:radius="4dp" />
            <size android:height="8dp" />
        </shape>
    </item>
</layer-list>`;
fs.writeFileSync(path.join(baseRes, 'drawable/widget_sample_bar.xml'), widgetSampleBar);

// 3. XML метаданные виджетов (4x1, 2x1, Action 2x1)
// Без android:configure, чтобы виджет добавлялся мгновенно на рабочий стол без навязчивых диалогов
const widgetFullInfo = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="260dp"
    android:minHeight="55dp"
    android:targetCellWidth="4"
    android:targetCellHeight="1"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_full_layout"
    android:previewLayout="@layout/widget_full_preview"
    android:resizeMode="horizontal"
    android:widgetCategory="home_screen"
    android:description="@string/widget_full_desc">
</appwidget-provider>`;
fs.writeFileSync(path.join(baseRes, 'xml/widget_full_info.xml'), widgetFullInfo);

const widgetCompactInfo = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="130dp"
    android:minHeight="55dp"
    android:targetCellWidth="2"
    android:targetCellHeight="1"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_compact_layout"
    android:previewLayout="@layout/widget_compact_preview"
    android:resizeMode="horizontal"
    android:widgetCategory="home_screen"
    android:description="@string/widget_compact_desc">
</appwidget-provider>`;
fs.writeFileSync(path.join(baseRes, 'xml/widget_compact_info.xml'), widgetCompactInfo);

const widgetActionInfo = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="130dp"
    android:minHeight="55dp"
    android:targetCellWidth="2"
    android:targetCellHeight="1"
    android:updatePeriodMillis="86400000"
    android:initialLayout="@layout/widget_action_layout"
    android:previewLayout="@layout/widget_action_preview"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen"
    android:description="@string/widget_action_desc">
</appwidget-provider>`;
fs.writeFileSync(path.join(baseRes, 'xml/widget_action_info.xml'), widgetActionInfo);

// 4. Макет 4x1 (Большой виджет: Недельные траты + Траты за месяц, крупные шрифты и шкалы)
const widgetFullLayout = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_full_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <!-- Динамический полупрозрачный фон с настраиваемой прозрачностью -->
    <ImageView
        android:id="@+id/iv_widget_full_bg"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:scaleType="fitXY"
        android:contentDescription="@null" />

    <!-- 4x1 контент: крупные шрифты и шкалы -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="horizontal"
        android:gravity="center_vertical"
        android:paddingStart="14dp"
        android:paddingEnd="14dp"
        android:paddingTop="6dp"
        android:paddingBottom="6dp">

        <!-- 1. Слева: Недельные траты -->
        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:orientation="vertical"
            android:layout_marginEnd="10dp">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Недельные траты"
                android:textColor="#BAC7D5"
                android:textSize="11sp"
                android:textStyle="bold"
                android:shadowColor="#000000"
                android:shadowDx="0"
                android:shadowDy="1"
                android:shadowRadius="2" />

            <LinearLayout
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:gravity="center_vertical"
                android:layout_marginTop="3dp">

                <ImageView
                    android:id="@+id/iv_full_week_circle"
                    android:layout_width="52dp"
                    android:layout_height="52dp"
                    android:contentDescription="@null"
                    android:layout_marginEnd="9dp" />

                <LinearLayout
                    android:layout_width="0dp"
                    android:layout_height="wrap_content"
                    android:layout_weight="1"
                    android:orientation="vertical">

                    <TextView
                        android:id="@+id/tv_full_week_spent"
                        android:layout_width="wrap_content"
                        android:layout_height="wrap_content"
                        android:text="0 ₽"
                        android:textColor="#FFFFFF"
                        android:textSize="17.5sp"
                        android:textStyle="bold"
                        android:maxLines="1"
                        android:ellipsize="end"
                        android:shadowColor="#000000"
                        android:shadowDx="0"
                        android:shadowDy="1"
                        android:shadowRadius="3" />

                    <TextView
                        android:id="@+id/tv_full_week_sub"
                        android:layout_width="wrap_content"
                        android:layout_height="wrap_content"
                        android:text="из 0 ₽"
                        android:textColor="#94A3B8"
                        android:textSize="12sp"
                        android:maxLines="1"
                        android:ellipsize="end"
                        android:shadowColor="#000000"
                        android:shadowDx="0"
                        android:shadowDy="1"
                        android:shadowRadius="2" />
                </LinearLayout>
            </LinearLayout>
        </LinearLayout>

        <!-- 2. Справа: Траты за месяц -->
        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1.35"
            android:orientation="vertical">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Траты за месяц"
                android:textColor="#BAC7D5"
                android:textSize="11sp"
                android:textStyle="bold"
                android:shadowColor="#000000"
                android:shadowDx="0"
                android:shadowDy="1"
                android:shadowRadius="2" />

            <TextView
                android:id="@+id/tv_full_month_spent"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="0 ₽ из 0 ₽"
                android:textColor="#FFFFFF"
                android:textSize="16sp"
                android:textStyle="bold"
                android:maxLines="1"
                android:ellipsize="end"
                android:layout_marginTop="2dp"
                android:shadowColor="#000000"
                android:shadowDx="0"
                android:shadowDy="1"
                android:shadowRadius="3" />

            <!-- Линейная шкала месяца (увеличенная высота 8.5dp) -->
            <ImageView
                android:id="@+id/iv_full_month_bar"
                android:layout_width="match_parent"
                android:layout_height="8.5dp"
                android:layout_marginTop="5dp"
                android:layout_marginBottom="4dp"
                android:scaleType="fitXY"
                android:contentDescription="@null" />

            <TextView
                android:id="@+id/tv_full_month_sub"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Остаток: 0 ₽ • 0%"
                android:textColor="#BAC7D5"
                android:textSize="12sp"
                android:textStyle="bold"
                android:maxLines="1"
                android:ellipsize="end"
                android:shadowColor="#000000"
                android:shadowDx="0"
                android:shadowDy="1"
                android:shadowRadius="2" />
        </LinearLayout>
    </LinearLayout>
</FrameLayout>`;
fs.writeFileSync(path.join(baseRes, 'layout/widget_full_layout.xml'), widgetFullLayout);

// 5. Макет предпросмотра 4x1 для системного списка One UI / Android Launcher
const widgetFullPreview = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/widget_preview_bg"
    android:paddingStart="14dp"
    android:paddingEnd="14dp"
    android:paddingTop="8dp"
    android:paddingBottom="8dp">

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
            android:orientation="vertical"
            android:layout_marginEnd="10dp">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Недельные траты"
                android:textColor="#BAC7D5"
                android:textSize="11sp"
                android:textStyle="bold"
                android:maxLines="1" />

            <LinearLayout
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:gravity="center_vertical"
                android:layout_marginTop="3dp">

                <ImageView
                    android:layout_width="48dp"
                    android:layout_height="48dp"
                    android:src="@drawable/widget_sample_circle"
                    android:scaleType="fitCenter"
                    android:adjustViewBounds="false"
                    android:layout_marginEnd="9dp" />

                <LinearLayout
                    android:layout_width="0dp"
                    android:layout_height="wrap_content"
                    android:layout_weight="1"
                    android:orientation="vertical">

                    <TextView
                        android:layout_width="wrap_content"
                        android:layout_height="wrap_content"
                        android:text="635 ₽"
                        android:textColor="#FFFFFF"
                        android:textSize="17sp"
                        android:textStyle="bold"
                        android:maxLines="1" />

                    <TextView
                        android:layout_width="wrap_content"
                        android:layout_height="wrap_content"
                        android:text="из 10 000 ₽"
                        android:textColor="#94A3B8"
                        android:textSize="11.5sp"
                        android:maxLines="1" />
                </LinearLayout>
            </LinearLayout>
        </LinearLayout>

        <!-- Месяц -->
        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1.35"
            android:orientation="vertical">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Траты за месяц"
                android:textColor="#BAC7D5"
                android:textSize="11sp"
                android:textStyle="bold"
                android:maxLines="1" />

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="36 037 ₽ из 78 000 ₽"
                android:textColor="#FFFFFF"
                android:textSize="15sp"
                android:textStyle="bold"
                android:layout_marginTop="2dp"
                android:maxLines="1" />

            <ImageView
                android:layout_width="match_parent"
                android:layout_height="8dp"
                android:src="@drawable/widget_sample_bar"
                android:scaleType="fitXY"
                android:layout_marginTop="5dp"
                android:layout_marginBottom="4dp" />

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Остаток: 41 935 ₽ • 46%"
                android:textColor="#BAC7D5"
                android:textSize="11.5sp"
                android:textStyle="bold"
                android:maxLines="1" />
        </LinearLayout>
    </LinearLayout>
</FrameLayout>`;
fs.writeFileSync(path.join(baseRes, 'layout/widget_full_preview.xml'), widgetFullPreview);

// 6. Макет 2x1 (Компактный виджет месяца, крупные шрифты)
const widgetCompactLayout = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_compact_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <ImageView
        android:id="@+id/iv_widget_compact_bg"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:scaleType="fitXY"
        android:contentDescription="@null" />

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="horizontal"
        android:gravity="center_vertical"
        android:paddingStart="14dp"
        android:paddingEnd="14dp"
        android:paddingTop="6dp"
        android:paddingBottom="6dp">

        <ImageView
            android:id="@+id/iv_compact_circle"
            android:layout_width="52dp"
            android:layout_height="52dp"
            android:contentDescription="@null"
            android:layout_marginEnd="12dp" />

        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:orientation="vertical">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Траты за месяц"
                android:textColor="#BAC7D5"
                android:textSize="11sp"
                android:textStyle="bold"
                android:shadowColor="#000000"
                android:shadowDx="0"
                android:shadowDy="1"
                android:shadowRadius="2" />

            <TextView
                android:id="@+id/tv_compact_month_spent"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="0 ₽"
                android:textColor="#FFFFFF"
                android:textSize="18sp"
                android:textStyle="bold"
                android:maxLines="1"
                android:ellipsize="end"
                android:shadowColor="#000000"
                android:shadowDx="0"
                android:shadowDy="1"
                android:shadowRadius="3" />

            <TextView
                android:id="@+id/tv_compact_month_sub"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="из 0 ₽"
                android:textColor="#94A3B8"
                android:textSize="12.5sp"
                android:maxLines="1"
                android:ellipsize="end"
                android:shadowColor="#000000"
                android:shadowDx="0"
                android:shadowDy="1"
                android:shadowRadius="2" />
        </LinearLayout>
    </LinearLayout>
</FrameLayout>`;
fs.writeFileSync(path.join(baseRes, 'layout/widget_compact_layout.xml'), widgetCompactLayout);

const widgetCompactPreview = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/widget_preview_bg"
    android:paddingStart="14dp"
    android:paddingEnd="14dp"
    android:paddingTop="8dp"
    android:paddingBottom="8dp">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="horizontal"
        android:gravity="center_vertical">

        <ImageView
            android:layout_width="48dp"
            android:layout_height="48dp"
            android:src="@drawable/widget_sample_circle"
            android:scaleType="fitCenter"
            android:adjustViewBounds="false"
            android:layout_marginEnd="12dp" />

        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:orientation="vertical">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Траты за месяц"
                android:textColor="#BAC7D5"
                android:textSize="11sp"
                android:textStyle="bold"
                android:maxLines="1" />

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="36 037 ₽"
                android:textColor="#FFFFFF"
                android:textSize="18sp"
                android:textStyle="bold"
                android:maxLines="1" />

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="из 78 000 ₽"
                android:textColor="#94A3B8"
                android:textSize="12sp"
                android:maxLines="1" />
        </LinearLayout>
    </LinearLayout>
</FrameLayout>`;
fs.writeFileSync(path.join(baseRes, 'layout/widget_compact_preview.xml'), widgetCompactPreview);

// 7. Макет отдельного виджета быстрого расхода (2x1 Action Widget)
const widgetActionLayout = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_action_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <ImageView
        android:id="@+id/iv_widget_action_bg"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:scaleType="fitXY"
        android:contentDescription="@null" />

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="horizontal"
        android:gravity="center"
        android:padding="8dp">

        <TextView
            android:id="@+id/btn_action_main"
            android:layout_width="match_parent"
            android:layout_height="42dp"
            android:background="@drawable/widget_btn_bg"
            android:text="+ Внести расход"
            android:textColor="#FFFFFF"
            android:textSize="14sp"
            android:textStyle="bold"
            android:gravity="center"
            android:shadowColor="#000000"
            android:shadowDx="0"
            android:shadowDy="1"
            android:shadowRadius="2" />
    </LinearLayout>
</FrameLayout>`;
fs.writeFileSync(path.join(baseRes, 'layout/widget_action_layout.xml'), widgetActionLayout);

const widgetActionPreview = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/widget_preview_bg"
    android:padding="12dp">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:gravity="center">

        <TextView
            android:layout_width="match_parent"
            android:layout_height="42dp"
            android:background="@drawable/widget_btn_bg"
            android:text="+ Внести расход"
            android:textColor="#FFFFFF"
            android:textSize="14sp"
            android:textStyle="bold"
            android:gravity="center" />
    </LinearLayout>
</FrameLayout>`;
fs.writeFileSync(path.join(baseRes, 'layout/widget_action_preview.xml'), widgetActionPreview);

// 8. Java Providers: WidgetFullProvider, WidgetCompactProvider, WidgetActionProvider
const widgetFullProviderJava = `package com.budget.family;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;
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

    public static void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_full_layout);

        SharedPreferences prefs = context.getSharedPreferences("BudgetWidgetPrefs", Context.MODE_PRIVATE);
        String jsonStr = prefs.getString("widget_data", "{}");

        int customOpacity = prefs.getInt("widget_opacity_" + appWidgetId, -1);
        int bgOpacity = customOpacity >= 0 ? customOpacity : prefs.getInt("bgOpacity", 75);

        try {
            JSONObject obj = new JSONObject(jsonStr);
            double weeklySpent = obj.optDouble("weeklySpent", 0);
            double weeklyLimit = obj.optDouble("weeklyLimit", 0);
            int weeklyPct = obj.optInt("weeklyPct", 0);

            double monthlySpent = obj.optDouble("monthlySpent", 0);
            double monthlyLimit = obj.optDouble("monthlyLimit", 0);
            double monthlyAvailable = obj.optDouble("monthlyAvailable", 0);
            int monthlyPct = obj.optInt("monthlyPct", 0);
            if (customOpacity < 0 && obj.has("bgOpacity")) {
                bgOpacity = obj.optInt("bgOpacity", bgOpacity);
            }

            // 1. Недельные данные
            views.setTextViewText(R.id.tv_full_week_spent, formatMoney(weeklySpent));
            views.setTextViewText(R.id.tv_full_week_sub, "из " + formatMoney(weeklyLimit));

            String weekColorHex = "#30D158";
            if (weeklyLimit > 0 && weeklySpent > weeklyLimit) weekColorHex = "#FF453A";
            else if (weeklyPct >= 80) weekColorHex = "#FF9F0A";

            Bitmap circleBmp = createCircularProgressBitmap(context, weeklyPct, weekColorHex, 52);
            views.setImageViewBitmap(R.id.iv_full_week_circle, circleBmp);

            // 2. Месячные данные
            views.setTextViewText(R.id.tv_full_month_spent, formatMoney(monthlySpent) + " из " + formatMoney(monthlyLimit));
            views.setTextViewText(R.id.tv_full_month_sub, "Остаток: " + formatMoney(monthlyAvailable) + " • " + monthlyPct + "%");

            String monthColorHex = "#30D158";
            if (monthlyLimit > 0 && monthlySpent > monthlyLimit) monthColorHex = "#FF453A";
            else if (monthlyPct >= 80) monthColorHex = "#FF9F0A";

            Bitmap barBmp = createHorizontalProgressBarBitmap(context, monthlyPct, monthColorHex, 220, 9);
            views.setImageViewBitmap(R.id.iv_full_month_bar, barBmp);

            // 3. Фон с настраиваемой прозрачностью
            Bitmap bgBmp = createCardBackgroundBitmap(context, bgOpacity, 360, 75);
            views.setImageViewBitmap(R.id.iv_widget_full_bg, bgBmp);

        } catch (Exception ignored) {}

        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openAppPending = PendingIntent.getActivity(
            context, 100, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_full_root, openAppPending);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    public static Bitmap createCircularProgressBitmap(Context context, int pct, String strokeColorHex, int sizeDp) {
        float density = context.getResources().getDisplayMetrics().density;
        int sizePx = Math.max(1, Math.round(sizeDp * density));
        Bitmap bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        float strokeWidth = 5.2f * density;
        Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        bgPaint.setStyle(Paint.Style.STROKE);
        bgPaint.setStrokeWidth(strokeWidth);
        bgPaint.setColor(Color.argb(55, 255, 255, 255));

        Paint progressPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        progressPaint.setStyle(Paint.Style.STROKE);
        progressPaint.setStrokeWidth(strokeWidth);
        progressPaint.setStrokeCap(Paint.Cap.ROUND);
        progressPaint.setColor(Color.parseColor(strokeColorHex));

        RectF rect = new RectF(strokeWidth, strokeWidth, sizePx - strokeWidth, sizePx - strokeWidth);
        canvas.drawArc(rect, 0, 360, false, bgPaint);

        int clampedPct = Math.min(100, Math.max(0, pct));
        float sweepAngle = (clampedPct / 100f) * 360f;
        canvas.drawArc(rect, -90, sweepAngle, false, progressPaint);

        Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        textPaint.setColor(Color.WHITE);
        textPaint.setTextSize(12f * density);
        textPaint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setShadowLayer(3.5f, 0, 1.5f, Color.BLACK);

        String pctStr = clampedPct + "%";
        Rect textBounds = new Rect();
        textPaint.getTextBounds(pctStr, 0, pctStr.length(), textBounds);
        canvas.drawText(pctStr, sizePx / 2f, (sizePx / 2f) + (textBounds.height() / 2f), textPaint);

        return bitmap;
    }

    public static Bitmap createHorizontalProgressBarBitmap(Context context, int pct, String colorHex, int widthDp, int heightDp) {
        float density = context.getResources().getDisplayMetrics().density;
        int widthPx = Math.max(10, Math.round(widthDp * density));
        int heightPx = Math.max(4, Math.round(heightDp * density));

        Bitmap bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        float radius = heightPx / 2f;
        Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        bgPaint.setColor(Color.argb(55, 255, 255, 255));
        canvas.drawRoundRect(new RectF(0, 0, widthPx, heightPx), radius, radius, bgPaint);

        int clampedPct = Math.min(100, Math.max(0, pct));
        float progressWidth = (clampedPct / 100f) * widthPx;
        if (progressWidth > 0) {
            Paint progressPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            progressPaint.setColor(Color.parseColor(colorHex));
            canvas.drawRoundRect(new RectF(0, 0, Math.max(progressWidth, radius * 2), heightPx), radius, radius, progressPaint);
        }

        return bitmap;
    }

    public static Bitmap createCardBackgroundBitmap(Context context, int opacityPct, int widthDp, int heightDp) {
        float density = context.getResources().getDisplayMetrics().density;
        int widthPx = Math.max(10, Math.round(widthDp * density));
        int heightPx = Math.max(10, Math.round(heightDp * density));

        Bitmap bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888);
        if (opacityPct <= 0) {
            return bitmap;
        }

        Canvas canvas = new Canvas(bitmap);
        float radius = 18f * density;
        int alpha = Math.min(255, Math.max(0, Math.round(opacityPct * 2.55f)));

        Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        fillPaint.setColor(Color.argb(alpha, 22, 24, 36));
        RectF rect = new RectF(1.5f, 1.5f, widthPx - 1.5f, heightPx - 1.5f);
        canvas.drawRoundRect(rect, radius, radius, fillPaint);

        Paint strokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        strokePaint.setStyle(Paint.Style.STROKE);
        strokePaint.setStrokeWidth(1.2f * density);
        strokePaint.setColor(Color.argb(Math.min(255, alpha + 35), 65, 75, 100));
        canvas.drawRoundRect(rect, radius, radius, strokePaint);

        return bitmap;
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
import android.graphics.Bitmap;
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

    public static void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_compact_layout);

        SharedPreferences prefs = context.getSharedPreferences("BudgetWidgetPrefs", Context.MODE_PRIVATE);
        String jsonStr = prefs.getString("widget_data", "{}");

        int customOpacity = prefs.getInt("widget_opacity_" + appWidgetId, -1);
        int bgOpacity = customOpacity >= 0 ? customOpacity : prefs.getInt("bgOpacity", 75);

        try {
            JSONObject obj = new JSONObject(jsonStr);
            double monthlySpent = obj.optDouble("monthlySpent", 0);
            double monthlyLimit = obj.optDouble("monthlyLimit", 0);
            int monthlyPct = obj.optInt("monthlyPct", 0);
            if (customOpacity < 0 && obj.has("bgOpacity")) {
                bgOpacity = obj.optInt("bgOpacity", bgOpacity);
            }

            views.setTextViewText(R.id.tv_compact_month_spent, formatMoney(monthlySpent));
            views.setTextViewText(R.id.tv_compact_month_sub, "из " + formatMoney(monthlyLimit));

            String monthColorHex = "#30D158";
            if (monthlyLimit > 0 && monthlySpent > monthlyLimit) monthColorHex = "#FF453A";
            else if (monthlyPct >= 80) monthColorHex = "#FF9F0A";

            Bitmap circleBmp = WidgetFullProvider.createCircularProgressBitmap(context, monthlyPct, monthColorHex, 52);
            views.setImageViewBitmap(R.id.iv_compact_circle, circleBmp);

            Bitmap bgBmp = WidgetFullProvider.createCardBackgroundBitmap(context, bgOpacity, 160, 75);
            views.setImageViewBitmap(R.id.iv_widget_compact_bg, bgBmp);

        } catch (Exception ignored) {}

        Intent openAppIntent = new Intent(context, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openAppPending = PendingIntent.getActivity(
            context, 200, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_compact_root, openAppPending);

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

const widgetActionProviderJava = `package com.budget.family;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.widget.RemoteViews;

public class WidgetActionProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void updateAllWidgets(Context context) {
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        ComponentName thisWidget = new ComponentName(context, WidgetActionProvider.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget);
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_action_layout);

        SharedPreferences prefs = context.getSharedPreferences("BudgetWidgetPrefs", Context.MODE_PRIVATE);
        int customOpacity = prefs.getInt("widget_opacity_" + appWidgetId, -1);
        int bgOpacity = customOpacity >= 0 ? customOpacity : prefs.getInt("bgOpacity", 75);

        Bitmap bgBmp = WidgetFullProvider.createCardBackgroundBitmap(context, bgOpacity, 160, 50);
        views.setImageViewBitmap(R.id.iv_widget_action_bg, bgBmp);

        // Клик открывает сразу форму добавления расхода
        Intent addExpenseIntent = new Intent(context, MainActivity.class);
        addExpenseIntent.putExtra("action", "new-expense");
        addExpenseIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent addExpensePending = PendingIntent.getActivity(
            context, 301, addExpenseIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_action_root, addExpensePending);
        views.setOnClickPendingIntent(R.id.btn_action_main, addExpensePending);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
`;
fs.writeFileSync(path.join(baseJava, 'WidgetActionProvider.java'), widgetActionProviderJava);

// 9. Системная Activity настроек виджетов с 5 дискретными шагами (0, 25, 50, 75, 100%)
const widgetConfigureLayout = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="#0C0E14"
    android:padding="20dp">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Настройки виджета"
        android:textColor="#FFFFFF"
        android:textSize="20sp"
        android:textStyle="bold"
        android:layout_marginBottom="16dp" />

    <!-- Область предпросмотра на обоях -->
    <FrameLayout
        android:id="@+id/fl_config_preview_container"
        android:layout_width="match_parent"
        android:layout_height="120dp"
        android:background="@drawable/widget_preview_bg"
        android:layout_marginBottom="20dp">

        <LinearLayout
            android:id="@+id/ll_config_preview_card"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_gravity="center"
            android:layout_margin="14dp"
            android:orientation="vertical"
            android:padding="12dp">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Семейный бюджет"
                android:textColor="#FFFFFF"
                android:textSize="14sp"
                android:textStyle="bold" />

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Пример прозрачности фона виджета"
                android:textColor="#94A3B8"
                android:textSize="11sp"
                android:layout_marginTop="3dp" />
        </LinearLayout>
    </FrameLayout>

    <!-- Слайдер 5 фиксированных шагов (0%, 25%, 50%, 75%, 100%) -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="vertical"
        android:background="#161924"
        android:padding="16dp"
        android:layout_marginBottom="16dp">

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
                android:text="Прозрачность фона"
                android:textColor="#FFFFFF"
                android:textSize="14sp"
                android:textStyle="bold" />

            <TextView
                android:id="@+id/tv_config_opacity_value"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="75%"
                android:textColor="#8C7DFF"
                android:textSize="14sp"
                android:textStyle="bold" />
        </LinearLayout>

        <!-- SeekBar с 4 делениями (0=0%, 1=25%, 2=50%, 3=75%, 4=100%) -->
        <SeekBar
            android:id="@+id/sb_config_opacity"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:max="4"
            android:progress="3" />

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:layout_marginTop="6dp">

            <TextView
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="0%"
                android:textColor="#64748B"
                android:textSize="10sp"
                android:gravity="start" />

            <TextView
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="25%"
                android:textColor="#64748B"
                android:textSize="10sp"
                android:gravity="center" />

            <TextView
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="50%"
                android:textColor="#64748B"
                android:textSize="10sp"
                android:gravity="center" />

            <TextView
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="75%"
                android:textColor="#64748B"
                android:textSize="10sp"
                android:gravity="center" />

            <TextView
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="100%"
                android:textColor="#64748B"
                android:textSize="10sp"
                android:gravity="end" />
        </LinearLayout>
    </LinearLayout>

    <View
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1" />

    <!-- Кнопки Отмена / Сохранить -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal">

        <Button
            android:id="@+id/btn_config_cancel"
            android:layout_width="0dp"
            android:layout_height="48dp"
            android:layout_weight="1"
            android:text="Отменить"
            android:textColor="#9DA8B9"
            android:background="#1C1F2D"
            android:layout_marginEnd="8dp" />

        <Button
            android:id="@+id/btn_config_save"
            android:layout_width="0dp"
            android:layout_height="48dp"
            android:layout_weight="1"
            android:text="Сохранить"
            android:textColor="#FFFFFF"
            android:background="#6C5DD3"
            android:layout_marginStart="8dp" />
    </LinearLayout>
</LinearLayout>`;
fs.writeFileSync(path.join(baseRes, 'layout/widget_configure_layout.xml'), widgetConfigureLayout);

const widgetConfigureActivityJava = `package com.budget.family;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;

public class WidgetConfigureActivity extends Activity {

    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private final int[] OPACITY_STEPS = {0, 25, 50, 75, 100};
    private int stepIndex = 3; // 75% по умолчанию

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);

        Intent intent = getIntent();
        Bundle extras = intent.getExtras();
        if (extras != null) {
            appWidgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        }

        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        setContentView(R.layout.widget_configure_layout);

        SharedPreferences prefs = getSharedPreferences("BudgetWidgetPrefs", Context.MODE_PRIVATE);
        int savedOpacity = prefs.getInt("widget_opacity_" + appWidgetId, prefs.getInt("bgOpacity", 75));
        
        stepIndex = 3;
        for (int i = 0; i < OPACITY_STEPS.length; i++) {
            if (OPACITY_STEPS[i] == savedOpacity) {
                stepIndex = i;
                break;
            }
        }

        final TextView tvOpacityValue = findViewById(R.id.tv_config_opacity_value);
        final SeekBar sbOpacity = findViewById(R.id.sb_config_opacity);
        final LinearLayout previewCard = findViewById(R.id.ll_config_preview_card);
        final Button btnCancel = findViewById(R.id.btn_config_cancel);
        final Button btnSave = findViewById(R.id.btn_config_save);

        sbOpacity.setProgress(stepIndex);
        tvOpacityValue.setText(OPACITY_STEPS[stepIndex] + "%");
        updatePreviewAlpha(previewCard, OPACITY_STEPS[stepIndex]);

        sbOpacity.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                stepIndex = Math.max(0, Math.min(OPACITY_STEPS.length - 1, progress));
                int currentOpacity = OPACITY_STEPS[stepIndex];
                tvOpacityValue.setText(currentOpacity + "%");
                updatePreviewAlpha(previewCard, currentOpacity);
            }

            @Override
            public void onStartTrackingTouch(SeekBar seekBar) {}

            @Override
            public void onStopTrackingTouch(SeekBar seekBar) {}
        });

        btnCancel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });

        btnSave.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                int chosenOpacity = OPACITY_STEPS[stepIndex];
                SharedPreferences.Editor editor = getSharedPreferences("BudgetWidgetPrefs", Context.MODE_PRIVATE).edit();
                editor.putInt("widget_opacity_" + appWidgetId, chosenOpacity);
                editor.putInt("bgOpacity", chosenOpacity);
                editor.apply();

                AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(WidgetConfigureActivity.this);
                AppWidgetProviderInfo info = appWidgetManager.getAppWidgetInfo(appWidgetId);
                String providerClass = (info != null && info.provider != null) ? info.provider.getClassName() : "";

                // Обновляем ТОЛЬКО тот провайдер, к которому относится этот виджет
                if (providerClass.contains("WidgetFullProvider")) {
                    WidgetFullProvider.updateWidget(WidgetConfigureActivity.this, appWidgetManager, appWidgetId);
                } else if (providerClass.contains("WidgetCompactProvider")) {
                    WidgetCompactProvider.updateWidget(WidgetConfigureActivity.this, appWidgetManager, appWidgetId);
                } else if (providerClass.contains("WidgetActionProvider")) {
                    WidgetActionProvider.updateWidget(WidgetConfigureActivity.this, appWidgetManager, appWidgetId);
                } else {
                    WidgetFullProvider.updateAllWidgets(WidgetConfigureActivity.this);
                    WidgetCompactProvider.updateAllWidgets(WidgetConfigureActivity.this);
                    WidgetActionProvider.updateAllWidgets(WidgetConfigureActivity.this);
                }

                Intent resultValue = new Intent();
                resultValue.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
                setResult(RESULT_OK, resultValue);
                finish();
            }
        });
    }

    private void updatePreviewAlpha(LinearLayout card, int opacityPct) {
        if (card == null) return;
        int alpha = Math.min(255, Math.max(0, Math.round(opacityPct * 2.55f)));
        card.setBackgroundColor(Color.argb(alpha, 22, 24, 36));
    }
}
`;
fs.writeFileSync(path.join(baseJava, 'WidgetConfigureActivity.java'), widgetConfigureActivityJava);

// 10. Capacitor Plugin для запроса закрепления виджета (requestPinAppWidget) и отправки данных
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
                Class<?> providerClass = WidgetFullProvider.class;
                if ("compact".equals(variant)) providerClass = WidgetCompactProvider.class;
                else if ("action".equals(variant)) providerClass = WidgetActionProvider.class;

                ComponentName provider = new ComponentName(getContext(), providerClass);
                boolean pinned = appWidgetManager.requestPinAppWidget(provider, null, null);
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
        WidgetActionProvider.updateAllWidgets(getContext());
        call.resolve();
    }
}
`;
fs.writeFileSync(path.join(baseJava, 'WidgetPinPlugin.java'), widgetPinPluginJava);

// 10.1. Нативный NotificationListenerService для автоматического считывания банковских пушей
const bankPushServiceJava = `package com.budget.family;

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
`;
fs.writeFileSync(path.join(baseJava, 'BankPushService.java'), bankPushServiceJava);

// 10.2. Capacitor Plugin для связи JS с BankPushService
const bankPushPluginJava = `package com.budget.family;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import android.text.TextUtils;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "BankPush")
public class BankPushPlugin extends Plugin {

    private static final String PREFS_NAME = "BankPushPrefs";
    private static final String CHANNEL_ID = "budget_auto_expenses";
    private static BankPushPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
        createNotificationChannel();
    }

    public static void dispatchBankPushEvent(JSObject data) {
        if (instance != null) {
            instance.notifyListeners("bankPushReceived", data);
        }
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        Context context = getContext();
        boolean isEnabled = isNotificationServiceEnabled(context);
        JSObject ret = new JSObject();
        ret.put("granted", isEnabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void openPermissionSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (Exception ex) {
                call.reject("Cannot open settings", ex);
            }
        }
    }

    @PluginMethod
    public void getPendingBankPushes(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String jsonStr = prefs.getString("pending_pushes", "[]");
        prefs.edit().putString("pending_pushes", "[]").apply();

        try {
            JSONArray arr = new JSONArray(jsonStr);
            JSArray jsArr = new JSArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                JSObject jsObj = new JSObject();
                jsObj.put("packageName", obj.optString("packageName"));
                jsObj.put("title", obj.optString("title"));
                jsObj.put("text", obj.optString("text"));
                jsObj.put("postTime", obj.optLong("postTime"));
                jsArr.put(jsObj);
            }
            JSObject ret = new JSObject();
            ret.put("pushes", jsArr);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("pushes", new JSArray());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void notifyExpenseSaved(PluginCall call) {
        String title = call.getString("title", "Расход внесен");
        String body = call.getString("body", "");

        try {
            createNotificationChannel();
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setAutoCancel(true);

                nm.notify((int) System.currentTimeMillis(), builder.build());
            }
            call.resolve();
        } catch (Exception e) {
            call.resolve();
        }
    }

    @PluginMethod
    public void setAutoExpenseEnabled(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putBoolean("auto_expense_enabled", enabled).apply();
        call.resolve();
    }

    private boolean isNotificationServiceEnabled(Context context) {
        String pkgName = context.getPackageName();
        final String flat = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
        if (!TextUtils.isEmpty(flat)) {
            final String[] names = flat.split(":");
            for (String name : names) {
                final ComponentName cn = ComponentName.unflattenFromString(name);
                if (cn != null) {
                    if (TextUtils.equals(pkgName, cn.getPackageName())) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Авто-внесение трат",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Уведомления об автоматически внесенных операциях");
                nm.createNotificationChannel(channel);
            }
        }
    }
}
`;
fs.writeFileSync(path.join(baseJava, 'BankPushPlugin.java'), bankPushPluginJava);

// 11. Обновление strings.xml
if (fs.existsSync(stringsPath)) {
  let stringsContent = fs.readFileSync(stringsPath, 'utf8');
  if (!stringsContent.includes('widget_full_name')) {
    const stringEntries = [
      '    <string name="widget_full_name">Бюджет (Неделя и Месяц 4x1)</string>',
      '    <string name="widget_full_desc">Шкалы трат на неделю и месяц</string>',
      '    <string name="widget_compact_name">Бюджет (Месяц 2x1)</string>',
      '    <string name="widget_compact_desc">Траты текущего месяца</string>',
      '    <string name="widget_action_name">Бюджет (+ Расход 2x1)</string>',
      '    <string name="widget_action_desc">Быстрое внесение расхода</string>'
    ].join('\n');
    stringsContent = stringsContent.replace('</resources>', stringEntries + '\n</resources>');
    fs.writeFileSync(stringsPath, stringsContent);
  }
}

// 12. Обновление AndroidManifest.xml
if (fs.existsSync(manifestPath)) {
  let manifestContent = fs.readFileSync(manifestPath, 'utf8');
  
  // Добавляем разрешение на получение уведомлений (Android 13+)
  if (!manifestContent.includes('POST_NOTIFICATIONS')) {
    manifestContent = manifestContent.replace(
      '<application',
      '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>\n    <application'
    );
  }

  if (!manifestContent.includes('BankPushService')) {
    const serviceRegistration = [
      '        <service android:name=".BankPushService"',
      '            android:label="@string/app_name"',
      '            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"',
      '            android:exported="true">',
      '            <intent-filter>',
      '                <action android:name="android.service.notification.NotificationListenerService" />',
      '            </intent-filter>',
      '        </service>'
    ].join('\n');
    manifestContent = manifestContent.replace('</application>', serviceRegistration + '\n    </application>');
  }

  if (!manifestContent.includes('WidgetConfigureActivity')) {
    const activityAndReceivers = [
      '        <activity android:name=".WidgetConfigureActivity" android:exported="true">',
      '            <intent-filter>',
      '                <action android:name="android.appwidget.action.APPWIDGET_CONFIGURE"/>',
      '            </intent-filter>',
      '        </activity>',
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
      '        </receiver>',
      '        <receiver android:name=".WidgetActionProvider" android:exported="true" android:label="@string/widget_action_name">',
      '            <intent-filter>',
      '                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />',
      '            </intent-filter>',
      '            <meta-data',
      '                android:name="android.appwidget.provider"',
      '                android:resource="@xml/widget_action_info" />',
      '        </receiver>'
    ].join('\n');
    manifestContent = manifestContent.replace('</application>', activityAndReceivers + '\n    </application>');
  }

  fs.writeFileSync(manifestPath, manifestContent);
}

// 13. MainActivity.java
if (fs.existsSync(mainActivityPath)) {
  const mainActivityCode = [
    'package com.budget.family;',
    '',
    'import android.content.Intent;',
    'import android.os.Bundle;',
    'import com.getcapacitor.BridgeActivity;',
    'import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;',
    '',
    'public class MainActivity extends BridgeActivity {',
    '    @Override',
    '    public void onCreate(Bundle savedInstanceState) {',
    '        registerPlugin(GoogleAuth.class);',
    '        registerPlugin(WidgetPinPlugin.class);',
    '        registerPlugin(BankPushPlugin.class);',
    '        super.onCreate(savedInstanceState);',
    '        handleWidgetAction(getIntent());',
    '    }',
    '',
    '    @Override',
    '    protected void onNewIntent(Intent intent) {',
    '        super.onNewIntent(intent);',
    '        setIntent(intent);',
    '        handleWidgetAction(intent);',
    '    }',
    '',
    '    private void handleWidgetAction(Intent intent) {',
    '        if (intent == null) return;',
    '        String action = intent.getStringExtra("action");',
    '        if ("new-expense".equals(action)) {',
    '            if (getBridge() != null && getBridge().getWebView() != null) {',
    '                getBridge().getWebView().postDelayed(new Runnable() {',
    '                    @Override',
    '                    public void run() {',
    '                        getBridge().getWebView().evaluateJavascript(',
    '                            "if (typeof window.triggerQuickNewExpense === \'function\') { window.triggerQuickNewExpense(); } else { window._pendingAction = \'new-expense\'; }",',
    '                            null',
    '                        );',
    '                    }',
    '                }, 350);',
    '            }',
    '        }',
    '    }',
    '}'
  ].join('\n');
  fs.writeFileSync(mainActivityPath, mainActivityCode);
}

console.log('--- Настройка виджетов Android успешно завершена! ---');
