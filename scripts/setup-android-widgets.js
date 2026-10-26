import fs from 'node:fs';
import path from 'node:path';

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
  baseJava,
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

// 5. Макет предпросмотра 4x1 для системного списка One UI / Android Launcher (компактный масштаб превью)
const widgetFullPreview = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/widget_preview_bg"
    android:paddingStart="12dp"
    android:paddingEnd="12dp"
    android:paddingTop="5dp"
    android:paddingBottom="5dp">

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
            android:layout_marginEnd="8dp">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Недельные траты"
                android:textColor="#BAC7D5"
                android:textSize="9.5sp"
                android:textStyle="bold"
                android:maxLines="1" />

            <LinearLayout
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:gravity="center_vertical"
                android:layout_marginTop="2dp">

                <ImageView
                    android:layout_width="38dp"
                    android:layout_height="38dp"
                    android:src="@drawable/widget_sample_circle"
                    android:scaleType="fitCenter"
                    android:adjustViewBounds="false"
                    android:layout_marginEnd="7dp" />

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
                        android:textSize="14sp"
                        android:textStyle="bold"
                        android:maxLines="1" />

                    <TextView
                        android:layout_width="wrap_content"
                        android:layout_height="wrap_content"
                        android:text="из 10 000 ₽"
                        android:textColor="#94A3B8"
                        android:textSize="10sp"
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
                android:textSize="9.5sp"
                android:textStyle="bold"
                android:maxLines="1" />

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="36 037 ₽ из 78 000 ₽"
                android:textColor="#FFFFFF"
                android:textSize="13sp"
                android:textStyle="bold"
                android:layout_marginTop="1.5dp"
                android:maxLines="1" />

            <ImageView
                android:layout_width="match_parent"
                android:layout_height="6dp"
                android:src="@drawable/widget_sample_bar"
                android:scaleType="fitXY"
                android:layout_marginTop="3.5dp"
                android:layout_marginBottom="3dp" />

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Остаток: 41 935 ₽ • 46%"
                android:textColor="#BAC7D5"
                android:textSize="10sp"
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
            "(?:код\\s+подтверждения|пароль\\s+для\\s+входа|никому\\s+не\\s+(?:сообщайте|передавайте)|вход\\s+в\\s+(?:приложение|банк)|одноразовый\\s+пароль|для\\s+входа\\s+в\\s+лк|push[- ]?код|код\\s+авторизации|sms[- ]?код)",
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

            String systemInstruction = "Ты финансовый AI-парсер пуш-уведомлений банков РФ.\n" +
                "Проанализируй заголовок и текст уведомления.\n" +
                "Определи:\n" +
                "1. Это реальная финансовая транзакция (покупка, списание, зачисление, перевод), а не реклама, предложение кредита или акция?\n" +
                "2. Является ли это внутренним переводом между СВОИМИ счетами (в сейв, копилку, накопительный счет)?\n" +
                "3. Является ли это переводом другому лицу (СБП, клиенту банка)?\n" +
                "4. Извлеки сумму (число), тип (Расход или Доход), очисти имя магазина/мерчанта от мусора и выбери наиболее подходящую категорию из списка.\n" +
                "Отвечай СТРОГО валидным JSON-объектом по схеме:\n" +
                "{\\"isFinancial\\": true, \\"amount\\": 1250.0, \\"type\\": \\"Расход\\", \\"merchant\\": \\"ВкусВилл\\", \\"category\\": \\"Продукты\\", \\"isInternalTransfer\\": false, \\"isPendingTransfer\\": false}";

            JSONObject root = new JSONObject();
            JSONObject sysInst = new JSONObject();
            JSONArray sysParts = new JSONArray();
            sysParts.put(new JSONObject().put("text", systemInstruction));
            sysInst.put("parts", sysParts);
            root.put("systemInstruction", sysInst);

            JSONArray contents = new JSONArray();
            JSONObject contentObj = new JSONObject();
            JSONArray parts = new JSONArray();
            parts.put(new JSONObject().put("text", "Банк: " + bankName + "\nКатегории пользователя: " + categoriesJson + "\nТекст уведомления: \\"" + fullText + "\\""));
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
        if (Pattern.compile("(?:до|от)\\s+\\d+.*(?:₽|руб|%|бонус|кэшбэк|кешбэк)", Pattern.CASE_INSENSITIVE).matcher(full).find()) {
            return null;
        }

        // 2. Detect internal transfer between own accounts
        boolean isInternal = Pattern.compile(
            "(?:на\\s+сч[её]т\\s+в\\s+сейвах|в\\s+сейвы|пополнение\\s+с\\s+карты.*на\\s+сч[её]т|перевод.*между\\s+(?:своими|счетами)|в\\s+инвесткопилку|перевод\\s+на\\s+сч[её]т\\s+в\\s+сейв)",
            Pattern.CASE_INSENSITIVE
        ).matcher(full).find();

        // 3. Extract amount
        double amount = 0;
        Pattern[] patterns = new Pattern[] {
            Pattern.compile("(?:покупка|оплата|списание|списано|снятие|зачисление|пополнение|сумма|чек|на сумму|расход|перевод)\\s*:?\\s*([+\\-]?\\s*\\d+[\\s\\d]*(?:[.,]\\d{1,2})?)\\s*(?:₽|руб|rur|rub|р\\b)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("([+\\-]?\\s*\\d+[\\s\\d]*(?:[.,]\\d{1,2})?)\\s*(?:₽|руб|rur|rub|р\\b)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(?:сумма|итог)\\s*[:=]\\s*([+\\-]?\\s*\\d+[\\s\\d]*(?:[.,]\\d{1,2})?)", Pattern.CASE_INSENSITIVE)
        };

        for (Pattern p : patterns) {
            Matcher m = p.matcher(full);
            if (m.find()) {
                String numStr = m.group(1).replaceAll("[\\s+]", "").replace(',', '.');
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
        boolean isIncome = Pattern.compile("(?:зачисление|пополнение|перевод от|возврат|зарплата|входящий перевод|\\+[\\d\\s]+)", Pattern.CASE_INSENSITIVE).matcher(full).find()
            && !Pattern.compile("(?:списание|покупка|оплата)", Pattern.CASE_INSENSITIVE).matcher(full).find();

        boolean isPendingTransfer = !isInternal && Pattern.compile(
            "(?:пополнение\\s+(?:с|из)\\s+сейва|с\\s+сейва|из\\s+сейва|копилк|перевод|сбп|по\\s+номеру|клиенту|зачисление\\s+перевода)",
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
        clean = clean.split("(?i)(?:\\.|\\n|\\r)\\s*(?:баланс|доступно|остаток|лимит|карта|кэшб|mcc|счет)")[0];
        clean = clean.split("(?i)\\s+(?:баланс|доступно|остаток|лимит)[\\s:]+")[0];
        clean = clean.replaceAll("(?i)^(?:сбербанк|тинькофф|т-банк|альфа-банк|втб|банк|яндекс\\s*пэй|пэй|озон\\s*банк|райффайзенбанк|газпромбанк)[:\\s]+", "");
        clean = clean.replaceAll("(?i)^(?:покупка|оплата|списание|списано|зачисление|пополнение|снятие|перевод)(?:\\s*(?:на\\s+сумму|в\\s+размере))?[:\\s]+[+\\-]?\\s*[\\d\\s.,]+(?:₽|руб|rur|rub|р)?\\s*[,.]?\\s*(?:в\\s+|за\\s+|от\\s+|клиенту\\s+|на\\s+карту\\s+|с\\s+карты\\s+)?", "");
        clean = clean.replaceAll("(?i)\\s+(?:карта\\s+пэй|карта\\s+\\*?\\d+|кэшбэк.*)$", "");
        clean = clean.replaceAll("^[\\s,.—–:;]+|[\\s,.—–:;]+$", "").trim();
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
            sb.append(line).append('\n');
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
    public void checkPostNotificationPermission(PluginCall call) {
        Context context = getContext();
        boolean granted = true;
        if (Build.VERSION.SDK_INT >= 33) {
            granted = androidx.core.content.ContextCompat.checkSelfPermission(
                context,
                "android.permission.POST_NOTIFICATIONS"
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED;
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPostNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getActivity() != null) {
            androidx.core.app.ActivityCompat.requestPermissions(
                getActivity(),
                new String[]{"android.permission.POST_NOTIFICATIONS"},
                101
            );
        }
        call.resolve();
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

    @PluginMethod
    public void setAuthCredentials(PluginCall call) {
        String userId = call.getString("userId", "");
        String familyId = call.getString("familyId", "");
        String idToken = call.getString("idToken", "");
        String refreshToken = call.getString("refreshToken", "");
        String apiKey = call.getString("apiKey", "");
        String projectId = call.getString("projectId", "");
        String geminiApiKey = call.getString("geminiApiKey", "");
        String authorName = call.getString("authorName", "Пользователь");
        String authorAvatarId = call.getString("authorAvatarId", "user");
        String categoriesJson = call.getString("categoriesJson", "[]");
        String categoryRulesJson = call.getString("categoryRulesJson", "[]");

        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putString("auth_user_id", userId)
            .putString("auth_family_id", familyId)
            .putString("auth_id_token", idToken)
            .putString("auth_refresh_token", refreshToken)
            .putString("firebase_api_key", apiKey)
            .putString("firebase_project_id", projectId)
            .putString("gemini_api_key", geminiApiKey)
            .putString("author_name", authorName)
            .putString("author_avatar_id", authorAvatarId)
            .putString("user_categories", categoriesJson)
            .putString("category_rules", categoryRulesJson)
            .apply();

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
      '    <string name="widget_action_desc">Быстрое внесение расхода</string>',
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
      '        </service>',
    ].join('\n');
    manifestContent = manifestContent.replace(
      '</application>',
      serviceRegistration + '\n    </application>'
    );
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
      '        </receiver>',
    ].join('\n');
    manifestContent = manifestContent.replace(
      '</application>',
      activityAndReceivers + '\n    </application>'
    );
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
    "                            \"if (typeof window.triggerQuickNewExpense === 'function') { window.triggerQuickNewExpense(); } else { window._pendingAction = 'new-expense'; }\",",
    '                            null',
    '                        );',
    '                    }',
    '                }, 350);',
    '            }',
    '        }',
    '    }',
    '}',
  ].join('\n');
  fs.writeFileSync(mainActivityPath, mainActivityCode);
}

console.log('--- Настройка виджетов Android успешно завершена! ---');
