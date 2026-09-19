(function () {
    const App = window.YonduApp;
    const scope = App.scope;
    const pendingTextareaResizes = new Set();
    let textareaResizeFrame = 0;

    with (scope) {

            function requestToPromise(request) {
                return new Promise((resolve, reject) => {
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            }


            function transactionToPromise(transaction) {
                return new Promise((resolve, reject) => {
                    transaction.oncomplete = () => resolve();
                    transaction.onerror = () => reject(transaction.error);
                    transaction.onabort = () => reject(transaction.error);
                });
            }


            function updateDateInputState(input) {
                if (input.value) {
                    input.classList.remove('date-empty');
                    return;
                }
                input.classList.add('date-empty');
            }


            function syncDateDisplay(input) {
                const textInput = document.getElementById(`${input.id}_text`);
                if (!textInput) {
                    updateDateInputState(input);
                    return;
                }

                if (!input.value) {
                    textInput.value = '';
                    updateDateInputState(input);
                    if (textInput.classList.contains('auto-resize')) {
                        queueTextareaResize(textInput);
                    }
                    return;
                }

                const isMultiline = input.id === 'f_setupDate';
                textInput.value = formatDateForDisplay(input.value, isMultiline);
                updateDateInputState(input);

                if (textInput.classList.contains('auto-resize')) {
                    queueTextareaResize(textInput);
                }
            }


            function setDateField(nativeId, textId, isoValue, multiline) {
                const nativeInput = document.getElementById(nativeId);
                const textInput = document.getElementById(textId);
                const normalizedIso = isoValue || '';

                if (nativeInput) {
                    nativeInput.value = normalizedIso;
                    updateDateInputState(nativeInput);
                }
                if (textInput) {
                    textInput.value = normalizedIso ? formatDateForDisplay(normalizedIso, multiline) : '';
                    if (textInput.classList.contains('auto-resize')) {
                        queueTextareaResize(textInput);
                    }
                }
            }


            function coerceDateToIso(rawValue) {
                const value = sanitizeCellValue(rawValue);
                if (!value) {
                    return '';
                }

                if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                    return value;
                }

                if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
                    const [month, day, year] = value.split('/');
                    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                }

                if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(value)) {
                    const [month, day, year] = value.split('-');
                    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                }

                const parsedDate = new Date(value);
                if (!Number.isNaN(parsedDate.getTime())) {
                    const year = parsedDate.getFullYear();
                    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                    const day = String(parsedDate.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                }

                return '';
            }


            function formatDateForDisplay(isoDate) {
                const parts = isoDate.split('-');
                if (parts.length !== 3) {
                    return '';
                }

                const year = parts[0];
                const month = parts[1];
                const day = parts[2];

                return `${month}/${day}/${year}`;
            }


            function getTodayDateInfo() {
                const today = new Date();
                const year = today.getFullYear();
                const month = String(today.getMonth() + 1).padStart(2, '0');
                const day = String(today.getDate()).padStart(2, '0');

                return {
                    iso: `${year}-${month}-${day}`
                };
            }


            function resizeTextarea(textarea) {
                resizeTextareasNow([textarea]);
            }


            function resizeTextareasNow(textareas) {
                const uniqueTextareas = Array.from(new Set(Array.from(textareas || []).filter((textarea) =>
                    textarea && textarea.style
                )));
                if (!uniqueTextareas.length) {
                    return;
                }

                uniqueTextareas.forEach((textarea) => {
                    textarea.style.height = 'auto';
                });
                const heights = uniqueTextareas.map((textarea) => textarea.scrollHeight);
                uniqueTextareas.forEach((textarea, index) => {
                    textarea.style.height = `${heights[index]}px`;
                });
            }


            function flushTextareaResizes() {
                textareaResizeFrame = 0;
                const textareas = Array.from(pendingTextareaResizes);
                pendingTextareaResizes.clear();
                resizeTextareasNow(textareas);
            }


            function queueTextareaResize(textarea) {
                if (!textarea || !textarea.style) {
                    return;
                }

                pendingTextareaResizes.add(textarea);
                if (textareaResizeFrame) {
                    return;
                }

                const schedule = typeof window.requestAnimationFrame === 'function'
                    ? window.requestAnimationFrame.bind(window)
                    : (callback) => window.setTimeout(callback, 0);
                textareaResizeFrame = -1;
                const frameId = schedule(flushTextareaResizes);
                if (textareaResizeFrame === -1) {
                    textareaResizeFrame = frameId || 0;
                }
            }


            function queueTextareaResizes(textareas) {
                Array.from(textareas || []).forEach((textarea) => {
                    queueTextareaResize(textarea);
                });
            }


            function measureTextWidth(text, referenceElement) {
                const canvas = measureTextWidth.canvas || (measureTextWidth.canvas = document.createElement('canvas'));
                const context = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
                if (!context) {
                    return sanitizeCellValue(text).length * 8;
                }

                const computedStyle = window.getComputedStyle(referenceElement);
                const fallbackFont = [
                    computedStyle.fontStyle || 'normal',
                    computedStyle.fontVariant || 'normal',
                    computedStyle.fontWeight || '400',
                    computedStyle.fontSize || '16px',
                    computedStyle.fontFamily || 'sans-serif'
                ].join(' ');
                context.font = computedStyle.font || fallbackFont;

                return context.measureText(sanitizeCellValue(text)).width;
            }


            function resizeAssigneeNameInput(input) {
                if (!input) {
                    return;
                }

                if (input.tagName === 'TEXTAREA' || input.classList.contains('ncs-signature-textarea')) {
                    input.style.width = '100%';
                    queueTextareaResize(input);
                    return;
                }

                if (input.id === 'f_issuedName') {
                    input.style.width = '100%';
                    return;
                }

                const value = sanitizeCellValue(input.value);
                const minimumWidth = 120;
                const measuredWidth = value ? Math.ceil(measureTextWidth(value, input) + 6) : minimumWidth;
                input.style.width = `${Math.max(minimumWidth, measuredWidth)}px`;
            }


            function bindAssigneeNameAutosize() {
                ['f_sigEmpName', 'f_issuedName'].forEach((id) => {
                    const input = document.getElementById(id);
                    if (!input || input.dataset.autosizeBound === 'true') {
                        return;
                    }

                    input.dataset.autosizeBound = 'true';

                    const syncWidth = () => resizeAssigneeNameInput(input);
                    input.addEventListener('input', syncWidth);
                    input.addEventListener('change', syncWidth);
                    syncWidth();
                });
            }


            function setTextContent(id, value) {
                const element = document.getElementById(id);
                if (element) {
                    element.textContent = value || '';
                }
            }


            function setInputValue(id, value) {
                const element = document.getElementById(id);
                if (!element) {
                    return;
                }

                element.value = value || '';
                if (element.classList.contains('auto-resize')) {
                    queueTextareaResize(element);
                }
                if (id === 'f_sigEmpName' || id === 'f_issuedName') {
                    resizeAssigneeNameInput(element);
                }
                if (typeof scope.syncSignerPickerValue === 'function') {
                    scope.syncSignerPickerValue(element);
                }
            }


            function sanitizeCellValue(value) {
                if (value === undefined || value === null) {
                    return '';
                }
                return String(value).trim();
            }


            function normalizeText(value) {
                return sanitizeCellValue(value).toLowerCase().replace(/\s+/g, ' ');
            }


            function normalizePersonName(value) {
                return sanitizeCellValue(value)
                    .toLowerCase()
                    .replace(/[^a-z0-9\s]+/g, ' ')
                    .split(/\s+/)
                    .filter(Boolean)
                    .sort()
                    .join(' ');
            }


            function normalizeIdentifier(value) {
                return normalizeText(value).replace(/[^a-z0-9]/g, '');
            }


            function hasLegacyAssetTagPrefix(value) {
                return /^(?:YONDU|YODNU|YONDD|YONUD)/i.test(sanitizeCellValue(value));
            }


            function stripLegacyAssetTagPrefix(value) {
                return sanitizeCellValue(value)
                    .replace(/^(?:YONDU|YODNU|YONDD|YONUD)[\s_-]*/i, '')
                    .trim();
            }


            function getAssetTagSearchIdentifiers(value) {
                return Array.from(new Set([
                    normalizeIdentifier(value),
                    normalizeIdentifier(stripLegacyAssetTagPrefix(value))
                ].filter(Boolean)));
            }


            function buildSearchQuery(rawQuery) {
                return {
                    identifier: normalizeIdentifier(rawQuery),
                    personName: normalizePersonName(rawQuery)
                };
            }


            function sanitizeEmployeeIdForPrint(value) {
                const employeeId = sanitizeCellValue(value);
                if (!employeeId) {
                    return '';
                }

                return normalizeText(employeeId).includes('intern') ? '' : employeeId;
            }


            function formatTestDeviceAssetTag(value) {
                const rawValue = sanitizeCellValue(value).toUpperCase();
                if (!rawValue) {
                    return '';
                }

                const normalizedValue = rawValue.replace(/\s+/g, '');
                const tdMatch = normalizedValue.match(/^TD-?(\d+)$/);
                if (tdMatch) {
                    const digits = tdMatch[1];
                    return `TD-${digits.padStart(Math.max(digits.length, 5), '0')}`;
                }

                if (/^\d+$/.test(normalizedValue)) {
                    return `TD-${normalizedValue.padStart(Math.max(normalizedValue.length, 5), '0')}`;
                }

                return rawValue;
            }


            function formatTestDeviceAutofillAssetTag(value) {
                if (hasLegacyAssetTagPrefix(value)) {
                    return stripLegacyAssetTagPrefix(value);
                }

                return formatTestDeviceAssetTag(value);
            }


            function isLikelyTestDeviceAssetTag(value) {
                const rawValue = sanitizeCellValue(value);
                return /^TD[-\s]?\d+$/i.test(rawValue) || /^\d{1,6}$/.test(rawValue);
            }


            function isFullNameQuery(searchQuery) {
                return !!searchQuery.personName && searchQuery.personName.split(' ').length >= 2;
            }


            function supportsFullNameSearch(source) {
                const sourceKind = source.matchKind || source.effectiveKind;
                return isAccountabilityNewHireMode() && sourceKind === SOURCE_KIND.NEW_HIRE;
            }


            function getCanonicalSourceName(fileName) {
                return sanitizeCellValue(fileName).replace(/\s*\(\d+\)(?=\.[^.]+$|$)/, '');
            }


            function normalizeHeader(value) {
                return sanitizeCellValue(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
            }


            function isAllowedHeaderPrefix(fieldName, normalizedAlias, normalizedHeader) {
                if (!normalizedHeader.startsWith(`${normalizedAlias} `)) {
                    return false;
                }

                const remainder = normalizedHeader.slice(normalizedAlias.length).trim();
                return normalizedAlias.includes(' ') || /^\d(?:[\d ]*)$/.test(remainder);
            }


            function collectSourcesUsed(matches) {
                const sourceNames = [];
                matches.filter(Boolean).forEach((match) => {
                    if (!sourceNames.includes(match.sourceName)) {
                        sourceNames.push(match.sourceName);
                    }
                });
                return sourceNames;
            }


            function getAlertMessageElement(kind) {
                if (kind === 'error') {
                    return elements.errorMsgText;
                }
                if (kind === 'warning') {
                    return elements.warningMsgText;
                }
                return elements.successMsgText;
            }


            function getAlertContainer(kind) {
                if (kind === 'error') {
                    return elements.errorMsg;
                }
                if (kind === 'warning') {
                    return elements.warningMsg;
                }
                return elements.successMsg;
            }


            function clearAlertTimer(kind) {
                if (alertTimers[kind]) {
                    window.clearTimeout(alertTimers[kind]);
                    alertTimers[kind] = null;
                }
            }


            function hideAlert(kind) {
                clearAlertTimer(kind);
                const container = getAlertContainer(kind);
                const message = getAlertMessageElement(kind);
                if (message) {
                    message.textContent = '';
                }
                if (container) {
                    container.classList.add('hide');
                }
            }


            function clearAlerts() {
                hideAlert('error');
                hideAlert('success');
                hideAlert('warning');
            }


            function showError(message) {
                clearAlertTimer('error');
                const textNode = getAlertMessageElement('error');
                if (textNode) {
                    textNode.textContent = message;
                }
                elements.errorMsg.classList.remove('hide');
            }


            function showSuccess(message) {
                clearAlertTimer('success');
                const textNode = getAlertMessageElement('success');
                if (textNode) {
                    textNode.textContent = message;
                }
                elements.successMsg.classList.remove('hide');
                alertTimers.success = window.setTimeout(() => {
                    hideAlert('success');
                }, 5000);
            }


            function showWarning(message) {
                clearAlertTimer('warning');
                const textNode = getAlertMessageElement('warning');
                if (textNode) {
                    textNode.textContent = message;
                }
                elements.warningMsg?.classList.remove('hide');
            }


            function setBusyState(kind, nextValue) {
                busyState[kind] = Boolean(nextValue);
                const isBusy = busyState.search || busyState.upload;
                [
                    elements.searchBtn,
                    elements.tdaAutofillBtn,
                    elements.accReplacementAutofillBtn,
                    elements.clearSourcesBtn,
                    elements.sheetCopyBtn,
                    elements.printBtn
                ].filter(Boolean).forEach((button) => {
                    button.disabled = isBusy;
                    button.setAttribute('aria-disabled', isBusy ? 'true' : 'false');
                });

                if (elements.csvFileInput) {
                    elements.csvFileInput.disabled = isBusy;
                }

                if (elements.loadingIndicator) {
                    elements.loadingIndicator.setAttribute('aria-busy', isBusy ? 'true' : 'false');
                }
            }


            function getFormLabel(formType) {
                if (formType === 'accountability') {
                    return 'Asset Accountability Form';
                }
                if (formType === 'test_device_accountability') {
                    return 'Test-Device Accountability';
                }
                if (formType === 'sanitization_test') {
                    return 'Test Device Sanitation';
                }
                if (formType === 'sanitization_laptop') {
                    return 'Laptop / Monitor Sanitation';
                }
                if (formType === 'return_test') {
                    return 'Test Device Return';
                }
                if (formType === 'return_laptop') {
                    return 'Laptop / Monitor Return';
                }
                return 'Asset Accountability Form';
            }


            function formatModeLabel(value) {
                return sanitizeCellValue(value)
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (letter) => letter.toUpperCase());
            }


            function getActiveModeLabel() {
                if (currentFormType === 'accountability') {
                    return formatModeLabel(currentAccountabilityPrintMode);
                }
                if (currentFormType === 'test_device_accountability') {
                    return 'Test Device';
                }
                if (currentFormType.startsWith('sanitization_')) {
                    return currentFormType.includes('_test') ? 'Test Device Sanitation' : 'Laptop / Monitor Sanitation';
                }
                if (currentFormType.startsWith('return_')) {
                    return formatModeLabel(currentReturnPrintMode);
                }
                return formatModeLabel(currentReturnPrintMode);
            }


            function getRequiredSourceKindGroups(formType) {
                if (formType === 'accountability') {
                    return getAccountabilitySourceConfig().requiredKinds.map((kind) => [kind]);
                }
                if (formType === 'test_device_accountability') {
                    return [[SOURCE_KIND.TEST_DEVICE], [SOURCE_KIND.MASTER]];
                }
                if (formType.includes('_test')) {
                    return [[SOURCE_KIND.TEST_DEVICE], [SOURCE_KIND.MASTER]];
                }
                if (formType.startsWith('sanitization_') || formType.startsWith('return_')) {
                    return [[SOURCE_KIND.MASTER]];
                }
                return [[SOURCE_KIND.GENERAL]];
            }


            function getSourceReadinessSummary() {
                const groups = getRequiredSourceKindGroups(currentFormType);
                const availableKinds = new Set();
                const relevantKinds = new Set(groups.flat());
                let hasWarnings = false;

                csvFiles.forEach((file) => {
                    const diagnostics = typeof getSourceDiagnostics === 'function' ? getSourceDiagnostics(file) : null;
                    if (
                        diagnostics &&
                        (
                            diagnostics.validationState === SOURCE_VALIDATION_STATE.INVALID ||
                            diagnostics.isOperationallyUsable === false
                        )
                    ) {
                        return;
                    }

                    const effectiveKind = getEffectiveSourceKind(file);
                    availableKinds.add(effectiveKind);
                    if (diagnostics && diagnostics.validationState === SOURCE_VALIDATION_STATE.WARNING && relevantKinds.has(effectiveKind)) {
                        hasWarnings = true;
                    }
                });

                let satisfiedCount = 0;
                groups.forEach((group) => {
                    if (group.some((kind) => availableKinds.has(kind))) {
                        satisfiedCount += 1;
                    }
                });

                if (!satisfiedCount) {
                    return { key: 'missing', label: STATUS_COPY.missing };
                }
                if (satisfiedCount < groups.length || hasWarnings) {
                    return { key: 'partial', label: STATUS_COPY.partial };
                }
                return { key: 'ready', label: STATUS_COPY.ready };
            }


            function syncSourceStatusPanel() {
                if (typeof syncSheetCopyButtonVisibility === 'function') {
                    syncSheetCopyButtonVisibility();
                }

                if (!elements.sourceStatusPanel) {
                    return;
                }

                if (elements.sourceStatusForm) {
                    elements.sourceStatusForm.textContent = getFormLabel(currentFormType);
                }
                if (elements.sourceStatusMode) {
                    elements.sourceStatusMode.textContent = getActiveModeLabel();
                }
                if (elements.sourceStatusCount) {
                    elements.sourceStatusCount.textContent = String(csvFiles.length);
                }
                if (elements.sourceStatusReadiness) {
                    const readiness = getSourceReadinessSummary();
                    elements.sourceStatusReadiness.textContent = readiness.label;
                    elements.sourceStatusReadiness.setAttribute('data-state', readiness.key);
                }
            }


            function serializeActiveEditableState() {
                return JSON.stringify(Array.from(document.querySelectorAll('.form-template.active input, .form-template.active textarea, .form-template.active select'))
                    .filter((field) => field.id)
                    .map((field) => ({
                        id: field.id,
                        value: field.type === 'checkbox' ? String(field.checked) : field.value
                    })));
            }


            function captureFormDirtyBaseline() {
                formDirtyBaseline = serializeActiveEditableState();
            }


            function isCurrentFormDirty() {
                if (!formDirtyBaseline) {
                    return false;
                }
                return serializeActiveEditableState() !== formDirtyBaseline;
            }


            function focusPostAutofillField() {
                return;
            }


            function bindStatusAndSafety() {
                elements.dismissErrorBtn?.addEventListener('click', () => {
                    hideAlert('error');
                });
                elements.dismissSuccessBtn?.addEventListener('click', () => {
                    hideAlert('success');
                });
                elements.dismissWarningBtn?.addEventListener('click', () => {
                    hideAlert('warning');
                });

                captureFormDirtyBaseline();
            }


            function delay(ms) {
                return new Promise((resolve) => {
                    window.setTimeout(resolve, ms);
                });
            }

        Object.assign(scope, {
        requestToPromise,
        transactionToPromise,
        updateDateInputState,
        syncDateDisplay,
        setDateField,
        coerceDateToIso,
        formatDateForDisplay,
        getTodayDateInfo,
        resizeTextarea,
        resizeTextareasNow,
        flushTextareaResizes,
        queueTextareaResize,
        queueTextareaResizes,
        measureTextWidth,
        resizeAssigneeNameInput,
        bindAssigneeNameAutosize,
        setTextContent,
        setInputValue,
        sanitizeCellValue,
        normalizeText,
        normalizePersonName,
        normalizeIdentifier,
        hasLegacyAssetTagPrefix,
        stripLegacyAssetTagPrefix,
        getAssetTagSearchIdentifiers,
        buildSearchQuery,
        sanitizeEmployeeIdForPrint,
        formatTestDeviceAssetTag,
        formatTestDeviceAutofillAssetTag,
        isLikelyTestDeviceAssetTag,
        isFullNameQuery,
        supportsFullNameSearch,
        getCanonicalSourceName,
        normalizeHeader,
        isAllowedHeaderPrefix,
        collectSourcesUsed,
        getAlertMessageElement,
        getAlertContainer,
        clearAlertTimer,
        hideAlert,
        clearAlerts,
        showError,
        showSuccess,
        showWarning,
        setBusyState,
        getFormLabel,
        formatModeLabel,
        getActiveModeLabel,
        getRequiredSourceKindGroups,
        getSourceReadinessSummary,
        syncSourceStatusPanel,
        serializeActiveEditableState,
        captureFormDirtyBaseline,
        isCurrentFormDirty,
        focusPostAutofillField,
        bindStatusAndSafety,
        delay
        });
        Object.assign(App, {
        requestToPromise,
        transactionToPromise,
        updateDateInputState,
        syncDateDisplay,
        setDateField,
        coerceDateToIso,
        formatDateForDisplay,
        getTodayDateInfo,
        resizeTextarea,
        resizeTextareasNow,
        flushTextareaResizes,
        queueTextareaResize,
        queueTextareaResizes,
        measureTextWidth,
        resizeAssigneeNameInput,
        bindAssigneeNameAutosize,
        setTextContent,
        setInputValue,
        sanitizeCellValue,
        normalizeText,
        normalizePersonName,
        normalizeIdentifier,
        hasLegacyAssetTagPrefix,
        stripLegacyAssetTagPrefix,
        getAssetTagSearchIdentifiers,
        buildSearchQuery,
        sanitizeEmployeeIdForPrint,
        formatTestDeviceAssetTag,
        formatTestDeviceAutofillAssetTag,
        isLikelyTestDeviceAssetTag,
        isFullNameQuery,
        supportsFullNameSearch,
        getCanonicalSourceName,
        normalizeHeader,
        isAllowedHeaderPrefix,
        collectSourcesUsed,
        getAlertMessageElement,
        getAlertContainer,
        clearAlertTimer,
        hideAlert,
        clearAlerts,
        showError,
        showSuccess,
        showWarning,
        setBusyState,
        getFormLabel,
        formatModeLabel,
        getActiveModeLabel,
        getRequiredSourceKindGroups,
        getSourceReadinessSummary,
        syncSourceStatusPanel,
        serializeActiveEditableState,
        captureFormDirtyBaseline,
        isCurrentFormDirty,
        focusPostAutofillField,
        bindStatusAndSafety,
        delay
        });
    }
})();
