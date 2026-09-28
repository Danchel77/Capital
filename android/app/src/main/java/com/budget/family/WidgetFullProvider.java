package com.budget.family;

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
