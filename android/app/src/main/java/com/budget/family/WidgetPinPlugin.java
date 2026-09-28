package com.budget.family;

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
