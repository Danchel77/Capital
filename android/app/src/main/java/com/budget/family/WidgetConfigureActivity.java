package com.budget.family;

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
