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
const widgetBtnBg = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#6C5DD3" />
    <corners android:radius="12dp" />
</shape>`;
fs.writeFileSync(path.join(baseRes, 'drawable/widget_btn_bg.xml'), widgetBtnBg);

// 3. XML метаданные виджетов (4x1 и 2x1)
const widgetFullInfo = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="260dp"
    android:minHeight="50dp"
    android:targetCellWidth="4"
    android:targetCellHeight="1"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_full_layout"
    android:previewLayout="@layout/widget_full_layout"
    android:resizeMode="horizontal"
    android:widgetCategory="home_screen"
    android:description="@string/widget_full_desc">
</appwidget-provider>`;
fs.writeFileSync(path.join(baseRes, 'xml/widget_full_info.xml'), widgetFullInfo);

const widgetCompactInfo = `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="130dp"
    android:minHeight="50dp"
    android:targetCellWidth="2"
    android:targetCellHeight="1"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_compact_layout"
    android:previewLayout="@layout/widget_compact_layout"
    android:resizeMode="horizontal"
    android:widgetCategory="home_screen"
    android:description="@string/widget_compact_desc">
</appwidget-provider>`;
fs.writeFileSync(path.join(baseRes, 'xml/widget_compact_info.xml'), widgetCompactInfo);

// 4. Макеты RemoteViews (4x1 и 2x1)
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

    <!-- 4x1 контент в одну элегантную строку -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="horizontal"
        android:gravity="center_vertical"
        android:paddingStart="12dp"
        android:paddingEnd="10dp"
        android:paddingTop="6dp"
        android:paddingBottom="6dp">

        <!-- 1. Неделя: Круговой индикатор + суммы -->
        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:orientation="horizontal"
            android:gravity="center_vertical">

            <ImageView
                android:id="@+id/iv_full_week_circle"
                android:layout_width="38dp"
                android:layout_height="38dp"
                android:contentDescription="@null"
                android:layout_marginEnd="8dp" />

            <LinearLayout
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:orientation="vertical">

                <TextView
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:text="НЕДЕЛЯ"
                    android:textColor="#A0AFC2"
                    android:textSize="9sp"
                    android:textStyle="bold"
                    android:shadowColor="#000000"
                    android:shadowDx="0"
                    android:shadowDy="1"
                    android:shadowRadius="2" />

                <TextView
                    android:id="@+id/tv_full_week_spent"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:text="0 ₽"
                    android:textColor="#FFFFFF"
                    android:textSize="13sp"
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
                    android:textColor="#8898AA"
                    android:textSize="9sp"
                    android:maxLines="1"
                    android:ellipsize="end"
                    android:shadowColor="#000000"
                    android:shadowDx="0"
                    android:shadowDy="1"
                    android:shadowRadius="2" />
            </LinearLayout>
        </LinearLayout>

        <!-- Тонкий вертикальный разделитель -->
        <ImageView
            android:layout_width="1dp"
            android:layout_height="28dp"
            android:background="#33384C"
            android:layout_marginStart="6dp"
            android:layout_marginEnd="10dp"
            android:contentDescription="@null" />

        <!-- 2. Месяц: Траты как на вкладке Бюджет + линейная шкала -->
        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1.3"
            android:orientation="vertical"
            android:layout_marginEnd="8dp">

            <LinearLayout
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:gravity="center_vertical">

                <TextView
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:text="МЕСЯЦ:"
                    android:textColor="#A0AFC2"
                    android:textSize="9sp"
                    android:textStyle="bold"
                    android:layout_marginEnd="4dp"
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
                    android:textSize="12sp"
                    android:textStyle="bold"
                    android:maxLines="1"
                    android:ellipsize="end"
                    android:shadowColor="#000000"
                    android:shadowDx="0"
                    android:shadowDy="1"
                    android:shadowRadius="3" />
            </LinearLayout>

            <!-- Линейная шкала месяца -->
            <ImageView
                android:id="@+id/iv_full_month_bar"
                android:layout_width="match_parent"
                android:layout_height="5dp"
                android:layout_marginTop="3dp"
                android:layout_marginBottom="3dp"
                android:scaleType="fitXY"
                android:contentDescription="@null" />

            <TextView
                android:id="@+id/tv_full_month_sub"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Остаток: 0 ₽ • 0%"
                android:textColor="#8898AA"
                android:textSize="9sp"
                android:maxLines="1"
                android:ellipsize="end"
                android:shadowColor="#000000"
                android:shadowDx="0"
                android:shadowDy="1"
                android:shadowRadius="2" />
        </LinearLayout>

        <!-- 3. Кнопка "+ Расход" -->
        <TextView
            android:id="@+id/btn_full_add_expense"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:background="@drawable/widget_btn_bg"
            android:paddingStart="10dp"
            android:paddingEnd="10dp"
            android:paddingTop="7dp"
            android:paddingBottom="7dp"
            android:text="+ Расход"
            android:textColor="#FFFFFF"
            android:textSize="11sp"
            android:textStyle="bold"
            android:gravity="center"
            android:shadowColor="#000000"
            android:shadowDx="0"
            android:shadowDy="1"
            android:shadowRadius="2" />
    </LinearLayout>
</FrameLayout>`;
fs.writeFileSync(path.join(baseRes, 'layout/widget_full_layout.xml'), widgetFullLayout);

const widgetCompactLayout = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_compact_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <!-- Динамический полупрозрачный фон -->
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
        android:paddingStart="10dp"
        android:paddingEnd="8dp"
        android:paddingTop="6dp"
        android:paddingBottom="6dp">

        <ImageView
            android:id="@+id/iv_compact_circle"
            android:layout_width="36dp"
            android:layout_height="36dp"
            android:contentDescription="@null"
            android:layout_marginEnd="8dp" />

        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:orientation="vertical">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="МЕСЯЦ"
                android:textColor="#A0AFC2"
                android:textSize="9sp"
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
                android:textSize="12sp"
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
                android:textColor="#8898AA"
                android:textSize="9sp"
                android:maxLines="1"
                android:ellipsize="end"
                android:shadowColor="#000000"
                android:shadowDx="0"
                android:shadowDy="1"
                android:shadowRadius="2" />
        </LinearLayout>

        <TextView
            android:id="@+id/btn_compact_add_expense"
            android:layout_width="28dp"
            android:layout_height="28dp"
            android:background="@drawable/widget_btn_bg"
            android:text="+"
            android:textColor="#FFFFFF"
            android:textSize="15sp"
            android:textStyle="bold"
            android:gravity="center"
            android:layout_marginStart="4dp" />
    </LinearLayout>
</FrameLayout>`;
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

    private static void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_full_layout);

        SharedPreferences prefs = context.getSharedPreferences("BudgetWidgetPrefs", Context.MODE_PRIVATE);
        String jsonStr = prefs.getString("widget_data", "{}");

        try {
            JSONObject obj = new JSONObject(jsonStr);
            double weeklySpent = obj.optDouble("weeklySpent", 0);
            double weeklyLimit = obj.optDouble("weeklyLimit", 0);
            int weeklyPct = obj.optInt("weeklyPct", 0);

            double monthlySpent = obj.optDouble("monthlySpent", 0);
            double monthlyLimit = obj.optDouble("monthlyLimit", 0);
            double monthlyAvailable = obj.optDouble("monthlyAvailable", 0);
            int monthlyPct = obj.optInt("monthlyPct", 0);
            int bgOpacity = obj.optInt("bgOpacity", 75);

            // 1. Недельные данные
            views.setTextViewText(R.id.tv_full_week_spent, formatMoney(weeklySpent));
            views.setTextViewText(R.id.tv_full_week_sub, "из " + formatMoney(weeklyLimit));

            String weekColorHex = "#30D158";
            if (weeklyLimit > 0 && weeklySpent > weeklyLimit) weekColorHex = "#FF453A";
            else if (weeklyPct >= 80) weekColorHex = "#FF9F0A";

            Bitmap circleBmp = createCircularProgressBitmap(context, weeklyPct, weekColorHex, 38);
            views.setImageViewBitmap(R.id.iv_full_week_circle, circleBmp);

            // 2. Месячные данные (соответствуют вкладке Бюджет)
            views.setTextViewText(R.id.tv_full_month_spent, formatMoney(monthlySpent) + " из " + formatMoney(monthlyLimit));
            views.setTextViewText(R.id.tv_full_month_sub, "Остаток: " + formatMoney(monthlyAvailable) + " • " + monthlyPct + "%");

            String monthColorHex = "#30D158";
            if (monthlyLimit > 0 && monthlySpent > monthlyLimit) monthColorHex = "#FF453A";
            else if (monthlyPct >= 80) monthColorHex = "#FF9F0A";

            Bitmap barBmp = createHorizontalProgressBarBitmap(context, monthlyPct, monthColorHex, 180, 5);
            views.setImageViewBitmap(R.id.iv_full_month_bar, barBmp);

            // 3. Фон с настраиваемой прозрачностью
            Bitmap bgBmp = createCardBackgroundBitmap(context, bgOpacity, 360, 65);
            views.setImageViewBitmap(R.id.iv_widget_full_bg, bgBmp);

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

    private static Bitmap createCircularProgressBitmap(Context context, int pct, String strokeColorHex, int sizeDp) {
        float density = context.getResources().getDisplayMetrics().density;
        int sizePx = Math.max(1, Math.round(sizeDp * density));
        Bitmap bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        float strokeWidth = 3.2f * density;
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
        textPaint.setTextSize(9f * density);
        textPaint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        textPaint.setTextAlign(Paint.Align.CENTER);
        String pctStr = clampedPct + "%";
        Rect textBounds = new Rect();
        textPaint.getTextBounds(pctStr, 0, pctStr.length(), textBounds);
        canvas.drawText(pctStr, sizePx / 2f, (sizePx / 2f) + (textBounds.height() / 2f), textPaint);

        return bitmap;
    }

    private static Bitmap createHorizontalProgressBarBitmap(Context context, int pct, String colorHex, int widthDp, int heightDp) {
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

    private static Bitmap createCardBackgroundBitmap(Context context, int opacityPct, int widthDp, int heightDp) {
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
            double monthlySpent = obj.optDouble("monthlySpent", 0);
            double monthlyLimit = obj.optDouble("monthlyLimit", 0);
            int monthlyPct = obj.optInt("monthlyPct", 0);
            int bgOpacity = obj.optInt("bgOpacity", 75);

            views.setTextViewText(R.id.tv_compact_month_spent, formatMoney(monthlySpent));
            views.setTextViewText(R.id.tv_compact_month_sub, "из " + formatMoney(monthlyLimit));

            String monthColorHex = "#30D158";
            if (monthlyLimit > 0 && monthlySpent > monthlyLimit) monthColorHex = "#FF453A";
            else if (monthlyPct >= 80) monthColorHex = "#FF9F0A";

            Bitmap circleBmp = createCircularProgressBitmap(context, monthlyPct, monthColorHex, 36);
            views.setImageViewBitmap(R.id.iv_compact_circle, circleBmp);

            Bitmap bgBmp = createCardBackgroundBitmap(context, bgOpacity, 160, 65);
            views.setImageViewBitmap(R.id.iv_widget_compact_bg, bgBmp);

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

    private static Bitmap createCircularProgressBitmap(Context context, int pct, String strokeColorHex, int sizeDp) {
        float density = context.getResources().getDisplayMetrics().density;
        int sizePx = Math.max(1, Math.round(sizeDp * density));
        Bitmap bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        float strokeWidth = 3.2f * density;
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
        textPaint.setTextSize(8.5f * density);
        textPaint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        textPaint.setTextAlign(Paint.Align.CENTER);
        String pctStr = clampedPct + "%";
        Rect textBounds = new Rect();
        textPaint.getTextBounds(pctStr, 0, pctStr.length(), textBounds);
        canvas.drawText(pctStr, sizePx / 2f, (sizePx / 2f) + (textBounds.height() / 2f), textPaint);

        return bitmap;
    }

    private static Bitmap createCardBackgroundBitmap(Context context, int opacityPct, int widthDp, int heightDp) {
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
        call.resolve();
    }
}`;
fs.writeFileSync(path.join(baseJava, 'WidgetPinPlugin.java'), widgetPinPluginJava);

// 7. Обновление strings.xml
if (fs.existsSync(stringsPath)) {
  let stringsContent = fs.readFileSync(stringsPath, 'utf8');
  if (!stringsContent.includes('widget_full_name')) {
    const stringEntries = [
      '    <string name="widget_full_name">Бюджет (Неделя и Месяц 4x1)</string>',
      '    <string name="widget_full_desc">Шкалы трат на неделю и месяц</string>',
      '    <string name="widget_compact_name">Бюджет (2x1)</string>',
      '    <string name="widget_compact_desc">Траты текущего месяца</string>'
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

// 9. Обновление MainActivity.java с поддержкой действия new-expense
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
    '                }, 400);',
    '            }',
    '        }',
    '    }',
    '}'
  ].join('\n');
  fs.writeFileSync(mainActivityPath, mainActivityCode);
}

console.log('--- Настройка виджетов Android успешно завершена! ---');
