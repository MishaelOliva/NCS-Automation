(function () {
    const App = window.YonduApp;
    const scope = App.scope;

    with (scope) {
        const SHEET_MONTH_NAMES = [
            'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ];


        function isReturnSanitizationCopyMode(formType = currentFormType) {
            return formType.startsWith('return_') || formType.startsWith('sanitization_');
        }


        function sanitizeSheetClipboardCell(value) {
            const singleLineValue = sanitizeCellValue(value)
                .replace(/[\t\r\n]+/g, ' ')
                .replace(/\s{2,}/g, ' ');

            return /^[=+@]/.test(singleLineValue) ? `'${singleLineValue}` : singleLineValue;
        }


        function getReturnSanSheetDate(nativeValue, textValue, fallbackIso = getTodayDateInfo().iso) {
            const resolvedIso = coerceDateToIso(nativeValue)
                || coerceDateToIso(textValue)
                || coerceDateToIso(fallbackIso);

            if (!resolvedIso) {
                return sanitizeSheetClipboardCell(textValue);
            }

            const [year, month, day] = resolvedIso.split('-');
            const monthName = SHEET_MONTH_NAMES[Number(month) - 1];
            return monthName ? `${monthName} ${Number(day)}, ${year}` : '';
        }


        function formatReturnSanSheetStatus(value) {
            return sanitizeSheetClipboardCell(value)
                .toLowerCase()
                .replace(/(^|\/)([a-z])/g, (match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
        }


        function getReturnSanSheetCopySnapshot() {
            const returnForm = document.getElementById('returnForm');
            const sanitizationForm = document.getElementById('sanitizationForm');
            const modeConfig = RETURN_PRINT_MODES[currentReturnPrintMode] || {};
            const returnAssets = returnForm && typeof serializeReturnSanitizationTableRows === 'function'
                ? serializeReturnSanitizationTableRows(returnForm)
                : [];
            const assets = returnAssets.length || !sanitizationForm
                ? returnAssets
                : serializeReturnSanitizationTableRows(sanitizationForm);

            return {
                employeeId: getDisplayValue('f_retEmpNo') || getDisplayValue('f_sanEmpNo'),
                employeeName: getDisplayValue('f_retName') || getDisplayValue('f_sanName'),
                returnDate: getReturnSanSheetDate(
                    getDisplayValue('f_retDate') || getDisplayValue('f_sanDate'),
                    getDisplayValue('f_retDate_text') || getDisplayValue('f_sanDate_text')
                ),
                status: getDisplayValue('f_retStatus') || getDisplayValue('f_sanStatus') || modeConfig.statusValue,
                assets
            };
        }


        function buildReturnSanSheetRows(snapshot = {}) {
            const status = formatReturnSanSheetStatus(snapshot.status);
            const resignationMarker = normalizeText(status).includes('resign') ? 'R' : '';
            const employeeId = sanitizeSheetClipboardCell(snapshot.employeeId);
            const employeeName = sanitizeSheetClipboardCell(snapshot.employeeName);
            const returnDate = sanitizeSheetClipboardCell(snapshot.returnDate);
            const assets = Array.isArray(snapshot.assets) ? snapshot.assets : [];

            return assets
                .filter((asset) => sanitizeCellValue(asset?.assetTag) || sanitizeCellValue(asset?.serial))
                .map((asset) => [
                    resignationMarker,
                    employeeId,
                    employeeName,
                    sanitizeSheetClipboardCell(asset.assetTag),
                    returnDate,
                    sanitizeSheetClipboardCell(asset.serial),
                    '',
                    '',
                    status
                ]);
        }


        function buildReturnSanSheetClipboardText(snapshot = {}) {
            return buildReturnSanSheetRows(snapshot)
                .map((row) => row.join('\t'))
                .join('\n');
        }


        async function writeTextToClipboard(text) {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                try {
                    await navigator.clipboard.writeText(text);
                    return true;
                } catch (error) {
                    // Continue to the browser's legacy copy path when clipboard permission is unavailable.
                }
            }

            if (!document.body || typeof document.execCommand !== 'function') {
                return false;
            }

            const copyField = document.createElement('textarea');
            copyField.value = text;
            copyField.setAttribute('readonly', '');
            copyField.setAttribute('aria-hidden', 'true');
            copyField.style.position = 'fixed';
            copyField.style.left = '-9999px';
            copyField.style.opacity = '0';
            document.body.appendChild(copyField);
            copyField.focus();
            copyField.select();

            try {
                return document.execCommand('copy');
            } catch (error) {
                return false;
            } finally {
                copyField.remove();
            }
        }


        async function copyReturnSanSheetRows() {
            if (!isReturnSanitizationCopyMode()) {
                showError('Open a Return & Sanitation form before copying a Google Sheets row.');
                return false;
            }

            const snapshot = getReturnSanSheetCopySnapshot();
            if (!sanitizeCellValue(snapshot.employeeId) || !sanitizeCellValue(snapshot.employeeName)) {
                showError('Autofill or enter the employee number and name before copying.');
                return false;
            }

            const rows = buildReturnSanSheetRows(snapshot);
            if (!rows.length) {
                showError('Autofill or enter at least one returned asset before copying.');
                return false;
            }

            const copied = await writeTextToClipboard(rows.map((row) => row.join('\t')).join('\n'));
            if (!copied) {
                showError('Could not copy the Google Sheets row. Allow clipboard access and try again.');
                return false;
            }

            const rowLabel = rows.length === 1 ? 'row' : 'rows';
            showSuccess(`${rows.length} Google Sheets ${rowLabel} copied. Paste into the first column of the target row.`);
            return true;
        }


        function syncSheetCopyButtonVisibility() {
            const button = elements.sheetCopyBtn;
            if (!button) {
                return;
            }

            const shouldShow = isReturnSanitizationCopyMode();
            button.classList.toggle('hide', !shouldShow);
            button.disabled = !shouldShow || busyState.search || busyState.upload;
            button.setAttribute('aria-hidden', String(!shouldShow));
            button.setAttribute('aria-disabled', String(button.disabled));
        }


        function isReturnSanSheetCopyShortcut(event) {
            return Boolean(
                event &&
                event.ctrlKey &&
                !event.altKey &&
                !event.metaKey &&
                !event.repeat &&
                !event.defaultPrevented &&
                String(event.key || '').toLowerCase() === 'c'
            );
        }


        function isNativeCopyTarget(target) {
            return Boolean(
                target &&
                typeof target.closest === 'function' &&
                target.closest('input, textarea, select, [contenteditable], [role="textbox"]')
            );
        }


        function hasActiveTextSelection() {
            if (typeof window === 'undefined' || typeof window.getSelection !== 'function') {
                return false;
            }

            try {
                const selection = window.getSelection();
                return Boolean(selection && !selection.isCollapsed && String(selection).trim());
            } catch (error) {
                return false;
            }
        }


        function shouldHandleReturnSanSheetCopyShortcut(event) {
            const button = elements.sheetCopyBtn;
            return Boolean(
                isReturnSanSheetCopyShortcut(event) &&
                isReturnSanitizationCopyMode() &&
                button &&
                !button.disabled &&
                !isNativeCopyTarget(event.target) &&
                !hasActiveTextSelection()
            );
        }


        async function handleReturnSanSheetCopyShortcut(event) {
            if (!shouldHandleReturnSanSheetCopyShortcut(event)) {
                return false;
            }

            event.preventDefault();
            return copyReturnSanSheetRows();
        }


        function bindReturnSanSheetCopy() {
            const button = elements.sheetCopyBtn;
            if (!button || button.dataset.copyBound === 'true') {
                return;
            }

            button.dataset.copyBound = 'true';
            button.addEventListener('click', copyReturnSanSheetRows);
            document.addEventListener('keydown', handleReturnSanSheetCopyShortcut);
            syncSheetCopyButtonVisibility();
        }

        Object.assign(scope, {
            isReturnSanitizationCopyMode,
            sanitizeSheetClipboardCell,
            getReturnSanSheetDate,
            formatReturnSanSheetStatus,
            getReturnSanSheetCopySnapshot,
            buildReturnSanSheetRows,
            buildReturnSanSheetClipboardText,
            writeTextToClipboard,
            copyReturnSanSheetRows,
            syncSheetCopyButtonVisibility,
            isReturnSanSheetCopyShortcut,
            shouldHandleReturnSanSheetCopyShortcut,
            handleReturnSanSheetCopyShortcut,
            bindReturnSanSheetCopy
        });
        Object.assign(App, {
            isReturnSanitizationCopyMode,
            sanitizeSheetClipboardCell,
            getReturnSanSheetDate,
            formatReturnSanSheetStatus,
            getReturnSanSheetCopySnapshot,
            buildReturnSanSheetRows,
            buildReturnSanSheetClipboardText,
            writeTextToClipboard,
            copyReturnSanSheetRows,
            syncSheetCopyButtonVisibility,
            isReturnSanSheetCopyShortcut,
            shouldHandleReturnSanSheetCopyShortcut,
            handleReturnSanSheetCopyShortcut,
            bindReturnSanSheetCopy
        });
    }
})();
