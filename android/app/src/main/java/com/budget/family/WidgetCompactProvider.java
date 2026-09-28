package com.budget.family;

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
