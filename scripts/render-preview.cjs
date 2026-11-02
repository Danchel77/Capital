const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromePath = '/home/deck/HarnessProjects/Budget/chrome-headless-shell/linux-156.0.8078.80/chrome-headless-shell-linux64/chrome-headless-shell';

// We extract the exact HTML of #tx-edit-modal from index.html
const indexHtml = fs.readFileSync('index.html', 'utf8');
const modalStart = indexHtml.indexOf('<div\n      id="tx-edit-modal"');
const modalEnd = indexHtml.indexOf('<!-- МОДАЛЬНОЕ ОКНО ЗАКРЫТИЯ ВКЛАДА', modalStart);
let modalHtml = indexHtml.substring(modalStart, modalEnd).trim();

// Remove "hidden" class from the modal so it is visible in preview
modalHtml = modalHtml.replace('id="tx-edit-modal"', 'id="tx-edit-modal" style="display: flex !important;"');
modalHtml = modalHtml.replace('class="fixed inset-0 bg-black/85 z-[150] hidden', 'class="fixed inset-0 bg-black/85 z-[150]');

// Fill in realistic mock values into the form fields
modalHtml = modalHtml.replace('id="edit-tx-amount"\n              placeholder="0 ₽"', 'id="edit-tx-amount" value="14 850 ₽"');
modalHtml = modalHtml.replace('id="edit-tx-category-label">Категория</span>', 'id="edit-tx-category-label">Супермаркеты</span>');
modalHtml = modalHtml.replace('data-lucide="tag" class="w-4 h-4 text-zinc-400"', 'data-lucide="shopping-cart" class="w-4 h-4 text-emerald-400"');
modalHtml = modalHtml.replace('id="edit-tx-date"\n                  data-datepicker="true"\n                  readonly\n                  placeholder="Дата"', 'id="edit-tx-date" data-datepicker="true" readonly value="02.11.2026"');
modalHtml = modalHtml.replace('id="edit-tx-comment"\n              placeholder="Комментарий"', 'id="edit-tx-comment" value="ВкусВилл (продукты на неделю)"');

const fullHtml = `<!DOCTYPE html>
<html lang="ru" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Preview: #tx-edit-modal</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <link rel="stylesheet" href="style.css">
  <style>
    body { background-color: #000000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  </style>
</head>
<body class="bg-black text-white min-h-screen flex items-center justify-center">
  ${modalHtml}
  <script>
    window.addEventListener('DOMContentLoaded', () => {
      if (typeof lucide !== 'undefined') lucide.createIcons();
    });
  </script>
</body>
</html>`;

const previewFile = path.resolve('preview-tx-modal.html');
const outputFile = path.resolve('preview-tx-modal.png');

fs.writeFileSync(previewFile, fullHtml);

// Capture with device-scale-factor=2 and mobile viewport (390x844)
execSync(`"${chromePath}" --headless --no-sandbox --hide-scrollbars --window-size=390,844 --screenshot="${outputFile}" "${previewFile}"`);

console.log('OK! Screenshot created at:', outputFile, 'Size:', fs.statSync(outputFile).size);
