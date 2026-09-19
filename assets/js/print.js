(function () {
    const App = window.YonduApp;
    const scope = App.scope;
    let printPreparationDirty = true;
    let printSessionPrepared = false;

    with (scope) {

            const ACCOUNTABILITY_PRINT_PROFILES = Object.freeze({
                standard: Object.freeze({
                    singlePageCapacity: 6,
                    continuationPageCapacity: 8,
                    finalPageCapacity: 4
                }),
                constrained: Object.freeze({
                    singlePageCapacity: 5,
                    continuationPageCapacity: 7,
                    finalPageCapacity: 3
                }),
                highWrap: Object.freeze({
                    singlePageCapacity: 3,
                    continuationPageCapacity: 7,
                    finalPageCapacity: 3
                })
            });
            const RETURN_SANITIZATION_PRINT_PAGE_CAPACITY = 6;
            const RETURN_SANITIZATION_LONG_NAME_THRESHOLD = 28;
            const PRINT_DESCRIPTION_CELL_SELECTOR = [
                '#template-accountability .ncs-details-table td:nth-child(4)',
                '#template-test-device-accountability .ncs-details-table td:nth-child(4)',
                '#template-return .ncs-return-table td:nth-child(2)',
                '#template-return .ncs-return-table td:nth-child(4)',
                '#template-sanitization .ncs-sanitization-table td:nth-child(2)',
                '#template-sanitization .ncs-sanitization-table td:nth-child(4)'
            ].join(', ');
            const PRINT_INFO_VALUE_CELL_SELECTOR = [
                '#template-accountability .ncs-info-table td.value',
                '#template-test-device-accountability .ncs-info-table td.value',
                '#template-return .ncs-info-table td.value',
                '#template-sanitization .ncs-info-table td.value'
            ].join(', ');
            const PRINT_SIGNATURE_VALUE_SELECTOR = '.form-template textarea.ncs-signature-textarea';

            function getPrintSignatureFitTier(value) {
                const normalizedValue = sanitizeCellValue(value).replace(/\s+/g, ' ').trim();
                const valueLength = normalizedValue.length;

                if (valueLength > 78) {
                    return 'ultra';
                }
                if (valueLength > 52) {
                    return 'tight';
                }
                if (valueLength > 32) {
                    return 'compact';
                }
                return 'normal';
            }


            function markPrintPreparationDirty() {
                printPreparationDirty = true;
            }


            function preparePrintOutput() {
                syncPrintTemplateVisibility();
                applyPrintTemplateVisibility();

                if (printSessionPrepared && !printPreparationDirty) {
                    updatePrintDocumentTitle();
                    return;
                }

                if (typeof flushTextareaResizes === 'function') {
                    flushTextareaResizes();
                }
                applyPrintTextOptimizations();
                syncAccountabilityPrintOverflowPages();
                syncReturnSanPrintOverflowPages();
                updatePrintDocumentTitle();
                printPreparationDirty = false;
                printSessionPrepared = true;
            }


            function bindPrintDirtyTracking() {
                if (!document.body || document.body.dataset.printDirtyBound === 'true') {
                    return;
                }

                document.body.dataset.printDirtyBound = 'true';
                const handleFieldMutation = (event) => {
                    const target = event && event.target;
                    if (target && typeof target.closest === 'function' && target.closest('.form-template')) {
                        markPrintPreparationDirty();
                    }
                };
                document.addEventListener('input', handleFieldMutation);
                document.addEventListener('change', handleFieldMutation);
            }

            function bindPrintNaming() {
                document.querySelectorAll('.print-mode-btn[data-accountability-mode]').forEach((button) => {
                    button.addEventListener('click', () => {
                        const nextMode = button.getAttribute('data-accountability-mode');
                        setAccountabilityPrintMode(nextMode);
                    });
                });

                document.querySelectorAll('.print-mode-btn[data-return-mode]').forEach((button) => {
                    button.addEventListener('click', () => {
                        const nextMode = button.getAttribute('data-return-mode');
                        setReturnPrintMode(nextMode, true);
                    });
                });

                window.addEventListener('beforeprint', () => {
                    preparePrintOutput();
                });

                window.addEventListener('afterprint', () => {
                    restorePrintTemplateVisibility();
                    restorePrintTextOptimizations();
                    clearReturnSanitizationPrintDensity();
                    printSessionPrepared = false;
                    updatePrintDocumentTitle();
                });
            }


            function bindStatusInputToPrintMode(input) {
                if (!input) {
                    return;
                }

                input.addEventListener('input', () => {
                    if (isSyncingReturnPrintMode) {
                        return;
                    }

                    const inferredMode = inferReturnPrintMode(input.value);
                    if (inferredMode) {
                        setReturnPrintMode(inferredMode, false);
                        return;
                    }

                    updatePrintDocumentTitle();
                });
            }


            function bindPrint() {
                bindPrintDirtyTracking();
                elements.printBtn.addEventListener('click', () => {
                    preparePrintOutput();
                    window.requestAnimationFrame(() => {
                        window.print();
                    });
                });
            }


            function syncPrintModeVisibility() {
                if (elements.accountabilityPrintModePanel) {
                    elements.accountabilityPrintModePanel.classList.toggle('hide', !isAccountabilityMode());
                }

                if (elements.returnPrintModePanel) {
                    elements.returnPrintModePanel.classList.toggle('hide', !isReturnSanitizationMode());
                }

                if (document.body) {
                    document.body.setAttribute('data-print-form-mode', currentFormType);
                }
                syncPrintTemplateVisibility();
                syncAccountabilityApprovedByVisibility();

                syncSearchPanelVisibility();
                syncAccountabilityPrintModeButtons();
                syncPrintModeButtons();
                syncSourceStatusPanel();
                markPrintPreparationDirty();
            }


            function isAccountabilityMode() {
                return currentFormType === 'accountability';
            }


            function isTestDeviceAccountabilityMode() {
                return currentFormType === 'test_device_accountability';
            }


            function isAccountabilityNewHireMode() {
                return currentFormType === 'accountability' && currentAccountabilityPrintMode === 'new_hire';
            }


            function isAccountabilityReplacementMode() {
                return currentFormType === 'accountability'
                    && (
                        currentAccountabilityPrintMode === 'replacement' ||
                        currentAccountabilityPrintMode === 'refresh' ||
                        currentAccountabilityPrintMode === 'temporary'
                    );
            }


            function isAccountabilityTemporaryMode() {
                return currentFormType === 'accountability' && currentAccountabilityPrintMode === 'temporary';
            }


            function isReturnSanitizationMode() {
                return currentFormType.startsWith('return_') || currentFormType.startsWith('sanitization_');
            }


            function syncPrintTemplateVisibility() {
                Object.values(templates).forEach((template) => {
                    if (!template) {
                        return;
                    }

                    template.setAttribute('data-print-visible', 'false');
                });

                if (currentFormType === 'accountability') {
                    templates.accountability?.setAttribute('data-print-visible', 'true');
                    return;
                }

                if (currentFormType === 'test_device_accountability') {
                    templates.testDeviceAccountability?.setAttribute('data-print-visible', 'true');
                    return;
                }

                if (isReturnSanitizationMode()) {
                    templates.returnForm?.setAttribute('data-print-visible', 'true');
                    templates.sanitization?.setAttribute('data-print-visible', 'true');
                }
            }


            function getVisiblePrintTemplateKeys() {
                if (currentFormType === 'accountability') {
                    return ['accountability'];
                }

                if (currentFormType === 'test_device_accountability') {
                    return ['testDeviceAccountability'];
                }

                if (isReturnSanitizationMode()) {
                    return ['returnForm', 'sanitization'];
                }

                return [];
            }


            function applyPrintTemplateVisibility() {
                const visibleTemplateKeys = new Set(getVisiblePrintTemplateKeys());

                Object.entries(templates).forEach(([key, template]) => {
                    if (!template) {
                        return;
                    }

                    if (!Object.prototype.hasOwnProperty.call(template.dataset, 'printDisplayBackup')) {
                        template.dataset.printDisplayBackup = template.style.getPropertyValue('display') || '';
                        template.dataset.printDisplayPriority = template.style.getPropertyPriority('display') || '';
                    }

                    template.style.setProperty('display', visibleTemplateKeys.has(key) ? 'block' : 'none', 'important');
                });
            }


            function restorePrintTemplateVisibility() {
                Object.values(templates).forEach((template) => {
                    if (!template) {
                        return;
                    }

                    const backupValue = Object.prototype.hasOwnProperty.call(template.dataset, 'printDisplayBackup')
                        ? template.dataset.printDisplayBackup
                        : '';
                    const backupPriority = Object.prototype.hasOwnProperty.call(template.dataset, 'printDisplayPriority')
                        ? template.dataset.printDisplayPriority
                        : '';

                    if (backupValue) {
                        template.style.setProperty('display', backupValue, backupPriority || '');
                    } else {
                        template.style.removeProperty('display');
                    }

                    delete template.dataset.printDisplayBackup;
                    delete template.dataset.printDisplayPriority;
                });
            }


            function setAccountabilityPrintMode(modeKey) {
                if (!ACCOUNTABILITY_PRINT_MODES[modeKey]) {
                    return;
                }

                currentAccountabilityPrintMode = modeKey;
                syncAccountabilityPrintModeButtons();
                syncSearchPanelVisibility();
                syncAccountabilityApprovedByVisibility();
                updatePrintDocumentTitle();
                syncSourceStatusPanel();
                markPrintPreparationDirty();
            }


            function syncAccountabilityApprovedByVisibility() {
                const approvedDetails = document.getElementById('accountabilityApprovedByDetails');
                const approvedName = document.getElementById('f_approvedName');
                const approvedPos = document.getElementById('f_approvedPos');
                const shouldShowApprovedBy = true;

                if (approvedDetails) {
                    approvedDetails.hidden = !shouldShowApprovedBy;
                }
                if (approvedName) {
                    setInputValue(
                        'f_approvedName',
                        approvedName.value || getSignerRosterDefaultName('approved')
                    );
                }
                if (approvedPos) {
                    approvedPos.value = approvedPos.value || DEFAULT_APPROVED_POS;
                }
            }


            function setReturnPrintMode(modeKey, syncInputs) {
                if (!RETURN_PRINT_MODES[modeKey]) {
                    return;
                }

                currentReturnPrintMode = modeKey;
                syncPrintModeButtons();

                if (syncInputs) {
                    const statusValue = RETURN_PRINT_MODES[modeKey].statusValue;
                    isSyncingReturnPrintMode = true;
                    setInputValue('f_retStatus', statusValue);
                    setInputValue('f_sanStatus', statusValue);
                    isSyncingReturnPrintMode = false;
                }

                updatePrintDocumentTitle();
                syncSourceStatusPanel();
                markPrintPreparationDirty();
            }


            function syncPrintModeButtons() {
                document.querySelectorAll('.print-mode-btn[data-return-mode]').forEach((button) => {
                    const isActive = button.getAttribute('data-return-mode') === currentReturnPrintMode;
                    button.classList.toggle('active', isActive);
                });
            }


            function syncAccountabilityPrintModeButtons() {
                document.querySelectorAll('.print-mode-btn[data-accountability-mode]').forEach((button) => {
                    const isActive = button.getAttribute('data-accountability-mode') === currentAccountabilityPrintMode;
                    button.classList.toggle('active', isActive);
                });
            }


            function inferReturnPrintMode(statusValue) {
                const normalized = normalizeText(statusValue);

                if (!normalized) {
                    return currentReturnPrintMode;
                }
                if (normalized.includes('replacement')) {
                    return 'replacement';
                }
                if (normalized.includes('refresh')) {
                    return 'refresh';
                }
                if (normalized.includes('repair')) {
                    return 'for_repair';
                }
                if (normalized.includes('returned')) {
                    return 'returned_only';
                }
                if (normalized.includes('resign')) {
                    return 'resigned';
                }
                if (normalized.includes('purchased')) {
                    return 'purchased';
                }
                if (normalized.includes('return')) {
                    return 'purchased';
                }
                return '';
            }


            function updatePrintDocumentTitle() {
                const nextTitle = buildPrintDocumentTitle();
                const safeTitle = buildSafePrintDialogTitle(nextTitle);
                document.title = safeTitle;
                if (elements.printFilePreview) {
                    elements.printFilePreview.textContent = `${safeTitle}.pdf`;
                }
            }


            function buildPrintDocumentTitle() {
                if (currentFormType === 'accountability') {
                    const assetTag = sanitizeFilenamePart(getDisplayValue('f_assetTag'));
                    const employeeName = formatPrintEmployeeName(getDisplayValue('f_empName'));

                    if (!assetTag && !employeeName) {
                        return DEFAULT_DOCUMENT_TITLE;
                    }

                    return composePrintFileName([
                        'IT ASSET ACCOUNTABILITY FORM',
                        assetTag || 'UNKNOWN ASSET',
                        employeeName || 'UNKNOWN EMPLOYEE',
                        ACCOUNTABILITY_PRINT_MODES[currentAccountabilityPrintMode].fileSuffix
                    ]);
                }

                if (isTestDeviceAccountabilityMode()) {
                    const assetTag = sanitizeFilenamePart(getDisplayValue('f_tdaAssetTag'));
                    const employeeName = formatPrintEmployeeName(getDisplayValue('f_tdaEmpName'));

                    if (!assetTag && !employeeName) {
                        return DEFAULT_DOCUMENT_TITLE;
                    }

                    return composePrintFileName([
                        'IT ASSET ACCOUNTABILITY FORM',
                        assetTag || 'UNKNOWN ASSET',
                        employeeName || 'UNKNOWN EMPLOYEE',
                        'TEST DEVICE'
                    ]);
                }

                if (isReturnSanitizationMode()) {
                    const assetTag = sanitizeFilenamePart(getDisplayValue('f_sanTag')) || sanitizeFilenamePart(getDisplayValue('f_retTag'));
                    const employeeName = formatPrintEmployeeName(getDisplayValue('f_sanName')) || formatPrintEmployeeName(getDisplayValue('f_retName'));

                    if (!assetTag && !employeeName) {
                        return DEFAULT_DOCUMENT_TITLE;
                    }

                    return composePrintFileName([
                        'IT ASSET RETURN AND SANITATION FORM',
                        assetTag || 'UNKNOWN ASSET',
                        employeeName || 'UNKNOWN EMPLOYEE',
                        RETURN_PRINT_MODES[currentReturnPrintMode].fileSuffix
                    ]);
                }

                return DEFAULT_DOCUMENT_TITLE;
            }


            function composePrintFileName(parts) {
                const cleanedParts = parts
                    .map((part) => sanitizeCellValue(part))
                    .filter(Boolean);

                return cleanedParts.length ? cleanedParts.join('_') : DEFAULT_DOCUMENT_TITLE;
            }


            function buildSafePrintDialogTitle(title) {
                return sanitizeCellValue(title)
                    .replace(/\s+/g, ' ')
                    .slice(0, 120) || DEFAULT_DOCUMENT_TITLE;
            }


            function formatPrintEmployeeName(value) {
                const name = sanitizeFilenamePart(value);
                if (!name || name.includes(',')) {
                    return name;
                }

                const nameParts = name.split(/\s+/).filter(Boolean);
                if (nameParts.length < 2) {
                    return name;
                }

                return `${nameParts[0]}, ${nameParts.slice(1).join(' ')}`;
            }


            function sanitizeFilenamePart(value) {
                return sanitizeCellValue(value)
                    .replace(/[<>:"/\\|?*]+/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toUpperCase();
            }


            function getDisplayValue(id) {
                const element = document.getElementById(id);
                if (!element) {
                    return '';
                }

                if ('value' in element) {
                    return element.value;
                }
                return element.textContent;
            }


            function applyPrintTextOptimizations() {
                syncPrintDescriptionMirrors();
                syncPrintInfoValueMirrors();
                syncPrintSignatureMirrors();

                ['f_retRemarks', 'f_sanRemarks'].forEach((fieldId) => {
                    const field = document.getElementById(fieldId);
                    if (!field) {
                        return;
                    }

                    if (!Object.prototype.hasOwnProperty.call(field.dataset, 'printOriginalValue')) {
                        field.dataset.printOriginalValue = field.value;
                    }

                    const optimizedValue = getPrintOptimizedRemark(field.dataset.printOriginalValue);
                    if (optimizedValue !== field.value) {
                        field.value = optimizedValue;
                        resizeTextarea(field);
                    }
                });

                document.querySelectorAll('.tda-project-remarks').forEach((field) => {
                    if (!Object.prototype.hasOwnProperty.call(field.dataset, 'printOriginalValue')) {
                        field.dataset.printOriginalValue = field.value;
                    }

                    const optimizedValue = getPrintOptimizedRemark(field.dataset.printOriginalValue);
                    if (optimizedValue !== field.value) {
                        field.value = optimizedValue;
                        resizeTextarea(field);
                    }
                });
            }


            function syncPrintDescriptionMirrors() {
                document.querySelectorAll(PRINT_DESCRIPTION_CELL_SELECTOR).forEach((cell) => {
                    const field = cell.querySelector('input, textarea');
                    if (!field) {
                        return;
                    }

                    let mirror = cell.querySelector('.ncs-print-description');
                    if (!mirror) {
                        mirror = document.createElement('span');
                        mirror.className = 'ncs-print-description';
                        mirror.setAttribute('aria-hidden', 'true');
                        cell.appendChild(mirror);
                    }

                    mirror.textContent = field.value || '';
                    mirror.dataset.printFit = getPrintSignatureFitTier(field.value);
                });
            }


            function syncPrintInfoValueMirrors() {
                document.querySelectorAll(PRINT_INFO_VALUE_CELL_SELECTOR).forEach((cell) => {
                    const field = cell.querySelector('input, textarea');
                    if (!field) {
                        return;
                    }

                    let mirror = cell.querySelector('.ncs-print-info-value');
                    if (!mirror) {
                        mirror = document.createElement('span');
                        mirror.className = 'ncs-print-info-value';
                        mirror.setAttribute('aria-hidden', 'true');
                        cell.appendChild(mirror);
                    }

                    mirror.textContent = field.value || '';
                    mirror.dataset.printFit = getPrintSignatureFitTier(field.value);
                });
            }


            function syncPrintSignatureMirrors() {
                document.querySelectorAll(PRINT_SIGNATURE_VALUE_SELECTOR).forEach((field) => {
                    const row = field.closest('.ncs-signature-name-row, .ncs-signature-role-row');
                    if (!row) {
                        return;
                    }

                    let mirror = row.querySelector('.ncs-print-signature-value');
                    if (!mirror) {
                        mirror = document.createElement('span');
                        mirror.className = 'ncs-print-signature-value';
                        mirror.setAttribute('aria-hidden', 'true');
                        row.appendChild(mirror);
                    }

                    mirror.textContent = field.value || '';
                    mirror.dataset.printFit = getPrintSignatureFitTier(field.value);
                });
            }


            function restorePrintTextOptimizations() {
                ['f_retRemarks', 'f_sanRemarks'].forEach((fieldId) => {
                    const field = document.getElementById(fieldId);
                    if (!field || !Object.prototype.hasOwnProperty.call(field.dataset, 'printOriginalValue')) {
                        return;
                    }

                    field.value = field.dataset.printOriginalValue;
                    delete field.dataset.printOriginalValue;
                    resizeTextarea(field);
                });

                document.querySelectorAll('.tda-project-remarks').forEach((field) => {
                    if (!Object.prototype.hasOwnProperty.call(field.dataset, 'printOriginalValue')) {
                        return;
                    }

                    field.value = field.dataset.printOriginalValue;
                    delete field.dataset.printOriginalValue;
                    resizeTextarea(field);
                });
            }


            function getPrintOptimizedRemark(value) {
                const originalValue = sanitizeCellValue(value);
                if (!originalValue) {
                    return '';
                }

                const normalizedValue = normalizeText(originalValue);
                return PRINT_REMARK_OVERRIDES[normalizedValue] || originalValue;
            }


            function formatAccountabilitySetupDateForDisplay(value) {
                const isoValue = coerceDateToIso(value);
                return isoValue ? formatDateForDisplay(isoValue) : sanitizeCellValue(value);
            }


            function syncAccountabilityPrintOverflowPages() {
                const template = templates.accountability;
                const container = document.getElementById('accountabilityPrintOverflow');
                if (!template || !container) {
                    return;
                }

                const form = document.getElementById('accountabilityForm');

                if (currentFormType !== 'accountability') {
                    template.classList.remove('is-paged-print');
                    applyAccountabilityPrintDensity(form, '');
                    delete template.dataset.printPageCount;
                    delete template.dataset.printAssetCount;
                    container.replaceChildren();
                    return;
                }

                const assets = serializeAccountabilityAssetRows();
                const formSnapshot = serializeAccountabilityPrintFormData();
                const printProfile = getAccountabilityPrintProfile(assets, formSnapshot);
                applyAccountabilityPrintDensity(form, printProfile.density);

                const pageChunks = splitAccountabilityAssetsForPrint(assets, printProfile);
                template.dataset.printPageCount = String(pageChunks.length);
                template.dataset.printAssetCount = String(assets.length);

                if (pageChunks.length === 1) {
                    template.classList.remove('is-paged-print');
                    container.replaceChildren();
                    return;
                }

                const fragment = document.createDocumentFragment();
                let assetOffset = 0;

                for (const [index, pageAssets] of pageChunks.entries()) {
                    const isFinal = index === pageChunks.length - 1;
                    const minimumTableRows = isFinal ? 4 : printProfile.continuationPageCapacity;

                    fragment.appendChild(buildAccountabilityPrintPage(pageAssets, formSnapshot, {
                        pageNumber: index + 1,
                        totalPages: pageChunks.length,
                        isFinal,
                        printDensity: printProfile.density,
                        totalAssets: assets.length,
                        assetStartIndex: assetOffset,
                        minimumTableRows
                    }));
                    assetOffset += pageAssets.length;
                }

                container.replaceChildren(fragment);
                template.classList.add('is-paged-print');
            }


            function syncReturnSanPrintOverflowPages() {
                syncReturnOrSanitizationPrintOverflow({
                    template: templates.returnForm,
                    containerId: 'returnPrintOverflow',
                    formId: 'returnForm',
                    pageClass: 'return-print-page',
                    type: 'return'
                });
                syncReturnOrSanitizationPrintOverflow({
                    template: templates.sanitization,
                    containerId: 'sanitizationPrintOverflow',
                    formId: 'sanitizationForm',
                    pageClass: 'sanitization-print-page',
                    type: 'sanitization'
                });
            }


            function syncReturnOrSanitizationPrintOverflow(config) {
                const { template, containerId, formId, pageClass, type } = config;
                const container = document.getElementById(containerId);
                const form = document.getElementById(formId);

                if (!template || !container || !form) {
                    return;
                }

                if (!isReturnSanitizationMode()) {
                    template.classList.remove('is-paged-print');
                    delete form.dataset.printAssetCount;
                    applyReturnSanitizationPrintDensity(form, null);
                    container.replaceChildren();
                    return;
                }

                const snapshot = serializeReturnSanitizationPrintFormData(type);
                applyReturnSanitizationPrintDensity(form, snapshot);
                const rows = serializeReturnSanitizationTableRows(form);
                form.dataset.printAssetCount = String(rows.length);
                if (rows.length <= RETURN_SANITIZATION_PRINT_PAGE_CAPACITY) {
                    template.classList.remove('is-paged-print');
                    container.replaceChildren();
                    return;
                }

                const pageChunks = chunkRows(rows, RETURN_SANITIZATION_PRINT_PAGE_CAPACITY);
                const fragment = document.createDocumentFragment();

                pageChunks.forEach((pageRows, index) => {
                    fragment.appendChild(buildReturnSanitizationPrintPage({
                        type,
                        pageRows,
                        snapshot,
                        pageClass,
                        pageNumber: index + 1,
                        totalPages: pageChunks.length,
                        isFinal: index === pageChunks.length - 1
                    }));
                });

                container.replaceChildren(fragment);
                template.classList.add('is-paged-print');
            }


            function serializeReturnSanitizationTableRows(form) {
                return Array.from(form.querySelectorAll('.details-table tbody tr'))
                    .map((row) => {
                        const cells = Array.from(row.querySelectorAll('td')).slice(0, 4);
                        if (!cells.length) {
                            return null;
                        }

                        return cells.map((cell) => getTableCellDisplayValue(cell));
                    })
                    .filter((rowValues) =>
                        Array.isArray(rowValues) && rowValues.some((value) => sanitizeCellValue(value) !== '')
                    )
                    .map(([assetTag, description, serial, remarks]) => ({
                        assetTag,
                        description,
                        serial,
                        remarks
                    }));
            }


            function getTableCellDisplayValue(cell) {
                if (!cell) {
                    return '';
                }

                const input = cell.querySelector('input, textarea');
                if (input) {
                    return sanitizeCellValue(input.value);
                }

                return sanitizeCellValue(cell.textContent);
            }


            function chunkRows(rows, chunkSize) {
                const chunks = [];

                for (let index = 0; index < rows.length; index += chunkSize) {
                    chunks.push(rows.slice(index, index + chunkSize));
                }

                return chunks;
            }


            function getReturnSanitizationPrintNameValues(snapshot) {
                return [
                    snapshot?.employeeName,
                    snapshot?.returneeName,
                    snapshot?.techSupportName,
                    snapshot?.itPersonnel,
                    snapshot?.assetManager,
                    snapshot?.infosecName,
                    snapshot?.leadName
                ]
                    .map((value) => sanitizeCellValue(value))
                    .filter(Boolean);
            }


            function getReturnSanitizationPrintMaxNameLength(snapshot) {
                return getReturnSanitizationPrintNameValues(snapshot)
                    .reduce((maxLength, value) => Math.max(maxLength, value.length), 0);
            }


            function getReturnSanitizationPrintDensity(snapshot) {
                const nameValues = getReturnSanitizationPrintNameValues(snapshot);
                const maxNameLength = getReturnSanitizationPrintMaxNameLength(snapshot);
                const hasMultilineName = nameValues.some((value) => /[\r\n]/.test(value));

                return hasMultilineName || maxNameLength >= RETURN_SANITIZATION_LONG_NAME_THRESHOLD
                    ? 'compact'
                    : '';
            }


            function getReturnSanitizationPrintNameScale(snapshot) {
                const maxNameLength = getReturnSanitizationPrintMaxNameLength(snapshot);
                if (maxNameLength <= RETURN_SANITIZATION_LONG_NAME_THRESHOLD) {
                    return 1;
                }

                return Math.max(
                    0.82,
                    Math.min(1, RETURN_SANITIZATION_LONG_NAME_THRESHOLD / maxNameLength)
                );
            }


            function applyReturnSanitizationPrintDensity(form, snapshot) {
                if (!form) {
                    return;
                }

                const density = getReturnSanitizationPrintDensity(snapshot);
                const nameScale = getReturnSanitizationPrintNameScale(snapshot);

                if (density) {
                    form.dataset.printDensity = density;
                } else {
                    delete form.dataset.printDensity;
                }

                if (form.style) {
                    if (nameScale < 1) {
                        form.style.setProperty('--ncs-print-name-scale', String(nameScale));
                    } else if (typeof form.style.removeProperty === 'function') {
                        form.style.removeProperty('--ncs-print-name-scale');
                    }
                }
            }


            function clearReturnSanitizationPrintDensity() {
                const forms = [
                    document.getElementById('returnForm'),
                    document.getElementById('sanitizationForm')
                ];
                const pages = document.querySelectorAll('.return-print-page, .sanitization-print-page');

                [...forms, ...pages].filter(Boolean).forEach((element) => {
                    delete element.dataset.printDensity;
                    if (element.style && typeof element.style.removeProperty === 'function') {
                        element.style.removeProperty('--ncs-print-name-scale');
                    }
                });
            }


            function serializeReturnSanitizationPrintFormData(type) {
                const itAssetManagerFallback = getSignerRosterDefaultName('issued');

                if (type === 'return') {
                    return {
                        title: sanitizeCellValue(document.getElementById('retFormTitle') ? document.getElementById('retFormTitle').textContent : 'IT ASSET RETURN FORM'),
                        employeeName: sanitizeCellValue(getDisplayValue('f_retName')),
                        email: sanitizeCellValue(getDisplayValue('f_retEmail')),
                        employeeId: sanitizeCellValue(getDisplayValue('f_retEmpNo')),
                        contact: sanitizeCellValue(getDisplayValue('f_retContact')),
                        businessUnit: sanitizeCellValue(getDisplayValue('f_retBU')),
                        status: sanitizeCellValue(getDisplayValue('f_retStatus')),
                        returnedDate: sanitizeCellValue(getDisplayValue('f_retDate_text')),
                        remarksHeader: sanitizeCellValue(document.getElementById('retRemarksHeader') ? document.getElementById('retRemarksHeader').textContent : 'Remarks'),
                        descriptionHeader: sanitizeCellValue(document.getElementById('retDescHeader') ? document.getElementById('retDescHeader').textContent : 'Laptop Description'),
                        footerText: sanitizeCellValue(document.getElementById('retFooterText') ? document.getElementById('retFooterText').textContent : 'IT Asset Return Form'),
                        returneeName: sanitizeCellValue(getDisplayValue('f_retEmployeeSigName')) || DEFAULT_SANITIZATION_RETURNEE_NAME,
                        returneeRole: sanitizeCellValue(getDisplayValue('f_retEmployeeSigRole')) || DEFAULT_RETURN_EMPLOYEE_POS,
                        itPersonnel: sanitizeCellValue(getDisplayValue('f_retITSig')) || itAssetManagerFallback,
                        itPersonnelRole: sanitizeCellValue(getDisplayValue('f_retITRole')) || DEFAULT_RETURN_IT_POS
                    };
                }

                return {
                    title: sanitizeCellValue(document.querySelector('#sanitizationForm .form-title-bar') ? document.querySelector('#sanitizationForm .form-title-bar').textContent : 'ASSET SANITATION FORM'),
                    employeeName: sanitizeCellValue(getDisplayValue('f_sanName')),
                    email: sanitizeCellValue(getDisplayValue('f_sanEmail')),
                    employeeId: sanitizeCellValue(getDisplayValue('f_sanEmpNo')),
                    contact: sanitizeCellValue(getDisplayValue('f_sanContact')),
                    businessUnit: sanitizeCellValue(getDisplayValue('f_sanBU')),
                    status: sanitizeCellValue(getDisplayValue('f_sanStatus')),
                    returnedDate: sanitizeCellValue(getDisplayValue('f_sanDate_text')),
                    remarksHeader: sanitizeCellValue(document.getElementById('sanRemarksHeader') ? document.getElementById('sanRemarksHeader').textContent : 'Remarks'),
                    descriptionHeader: sanitizeCellValue(document.getElementById('sanDescHeader') ? document.getElementById('sanDescHeader').textContent : 'Laptop Description'),
                    footerText: sanitizeCellValue(document.getElementById('sanFooterText') ? document.getElementById('sanFooterText').textContent : 'Asset Sanitation Form'),
                    returneeName: sanitizeCellValue(getDisplayValue('f_sanReturneeName')) || DEFAULT_SANITIZATION_RETURNEE_NAME,
                    returneeRole: sanitizeCellValue(getDisplayValue('f_sanReturneeRole')) || DEFAULT_SANITIZATION_RETURNEE_POS,
                    techSupportName: sanitizeCellValue(getDisplayValue('f_sanTechSupportName')) || getSignerRosterDefaultName('technical_support'),
                    techSupportRole: sanitizeCellValue(getDisplayValue('f_sanTechSupportRole')) || DEFAULT_SANITIZATION_TECH_SUPPORT_POS,
                    assetManager: sanitizeCellValue(getDisplayValue('sanAssetManager')) || itAssetManagerFallback,
                    assetManagerRole: sanitizeCellValue(getDisplayValue('f_sanAssetManagerRole')) || DEFAULT_RETURN_IT_POS,
                    infosecName: sanitizeCellValue(getDisplayValue('sanInfoSecName')) || getSignerRosterDefaultName('infosec'),
                    infosecRole: sanitizeCellValue(getDisplayValue('f_sanInfoSecRole')) || DEFAULT_SANITIZATION_INFOSEC_POS,
                    leadName: sanitizeCellValue(getDisplayValue('f_sanLeadName')) || getSignerRosterDefaultName('approved'),
                    leadRole: sanitizeCellValue(getDisplayValue('f_sanLeadRole')) || DEFAULT_SANITIZATION_LEAD_POS
                };
            }


            function buildReturnSanitizationPrintPage(config) {
                const { type, pageRows, snapshot, pageClass, pageNumber, totalPages, isFinal } = config;
                const page = document.createElement('div');
                page.className = `printable-form ${pageClass}`;
                page.dataset.pageRole = isFinal ? 'final' : 'continued';
                page.dataset.printAssetCount = String(pageRows.length);
                const printDensity = getReturnSanitizationPrintDensity(snapshot);
                const nameScale = getReturnSanitizationPrintNameScale(snapshot);
                if (printDensity) {
                    page.dataset.printDensity = printDensity;
                }
                if (nameScale < 1) {
                    page.style.setProperty('--ncs-print-name-scale', String(nameScale));
                }

                const pageBadge = totalPages > 1
                    ? `<div class="accountability-page-badge">Page ${pageNumber} of ${totalPages}</div>`
                    : '';

                if (type === 'sanitization') {
                    page.innerHTML = `
                        <div class="form-top-row">
                            <img src="assets/img/ncs-logo-optimized.png" alt="NCS Logo" class="yondu-logo-img ncs-logo-img" width="720" height="259">
                        </div>
                        <div class="form-title-bar ncs-form-title mt-spacing">IT ASSET SANITATION FORM</div>
                        ${pageBadge}
                        <table class="info-table ncs-info-table">
                            <tr>
                                <td class="label">Employee Name</td>
                                <td class="value center-text">${escapeHtml(snapshot.employeeName)}</td>
                                <td class="label">Email Address</td>
                                <td class="value center-text">${escapeHtml(snapshot.email)}</td>
                            </tr>
                            <tr>
                                <td class="label">Employee Number</td>
                                <td class="value center-text">${escapeHtml(snapshot.employeeId)}</td>
                                <td class="label">Status</td>
                                <td class="value center-text">${escapeHtml(snapshot.status)}</td>
                            </tr>
                            <tr>
                                <td class="label">Business Unit</td>
                                <td class="value center-text">${escapeHtml(snapshot.businessUnit)}</td>
                                <td class="label">Returned Date</td>
                                <td class="value">${escapeHtml(snapshot.returnedDate)}</td>
                            </tr>
                        </table>
                        <table class="details-table ncs-details-table ncs-sanitization-table mt-spacing">
                            <thead>
                                <tr>
                                    <th>Asset Tag</th>
                                    <th>${escapeHtml(snapshot.descriptionHeader)}</th>
                                    <th>Serial Number</th>
                                    <th>${escapeHtml(snapshot.remarksHeader)}</th>
                                    <th>Asset Condition</th>
                                    <th>Asset Condition Remarks</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${buildReturnSanitizationPrintRowsMarkup(pageRows, type)}
                            </tbody>
                        </table>
                        ${isFinal ? buildSanitizationPrintFooterMarkup(snapshot) : ''}
                    `;

                    return page;
                }

                page.innerHTML = `
                    <div class="form-top-row">
                        <img src="assets/img/ncs-logo-optimized.png" alt="NCS Logo" class="yondu-logo-img ncs-logo-img" width="720" height="259">
                    </div>
                    <div class="form-title-bar ncs-form-title mt-spacing">${escapeHtml(snapshot.title)}</div>
                    ${pageBadge}
                    <table class="info-table ncs-info-table ncs-return-info-table">
                        <tr>
                            <td class="label">Employee Name</td>
                            <td class="value center-text">${escapeHtml(snapshot.employeeName)}</td>
                            <td class="label">Email Address</td>
                            <td class="value center-text">${escapeHtml(snapshot.email)}</td>
                        </tr>
                        <tr>
                            <td class="label">Employee Number</td>
                            <td class="value center-text">${escapeHtml(snapshot.employeeId)}</td>
                            <td class="label">Status</td>
                            <td class="value center-text">${escapeHtml(snapshot.status)}</td>
                        </tr>
                        <tr>
                            <td class="label">Business Unit</td>
                            <td class="value center-text">${escapeHtml(snapshot.businessUnit)}</td>
                            <td class="label">Returned Date</td>
                            <td class="value">${escapeHtml(snapshot.returnedDate)}</td>
                        </tr>
                    </table>
                    <table class="details-table ncs-details-table ncs-return-table mt-spacing">
                        <thead>
                            <tr>
                                <th>Asset Tag</th>
                                <th>${escapeHtml(snapshot.descriptionHeader)}</th>
                                <th>Serial Number</th>
                                <th>${escapeHtml(snapshot.remarksHeader)}</th>
                                <th>Asset Condition</th>
                                <th>Asset Condition Remarks</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${buildReturnSanitizationPrintRowsMarkup(pageRows, type)}
                        </tbody>
                    </table>
                    ${isFinal ? buildReturnPrintFooterMarkup(snapshot) : ''}
                `;

                return page;
            }


            function buildReturnSanitizationPrintRowsMarkup(rows, type) {
                const paddedRows = [...rows];

                while (paddedRows.length < 4) {
                    paddedRows.push({ assetTag: '', description: '', serial: '', remarks: '' });
                }

                if (type === 'sanitization') {
                    return paddedRows.map((row, index) => `
                        <tr${index > rows.length - 1 ? ' class="empty-row"' : ''}>
                            <td class="center-text">${escapeHtml(row.assetTag)}</td>
                            <td class="center-text">${escapeHtml(row.description)}</td>
                            <td class="center-text">${escapeHtml(row.serial)}</td>
                            <td class="center-text">${escapeHtml(row.remarks)}</td>
                            ${buildReturnSanPrintConditionCellsMarkup(index, type)}
                        </tr>
                    `).join('');
                }

                return paddedRows.map((row, index) => `
                    <tr${index > rows.length - 1 ? ' class="empty-row"' : ''}>
                        <td class="center-text">${escapeHtml(row.assetTag)}</td>
                        <td class="center-text">${escapeHtml(row.description)}</td>
                        <td class="center-text">${escapeHtml(row.serial)}</td>
                        <td class="center-text">${escapeHtml(row.remarks)}</td>
                        ${buildReturnSanPrintConditionCellsMarkup(index, type)}
                    </tr>
                `).join('');
            }


            function buildReturnSanPrintConditionCellsMarkup(rowIndex, type) {
                if (rowIndex === 0) {
                    return `
                        <td class="condition-cell ncs-condition-cell" rowspan="2">
                            <div class="ncs-condition-option"><span class="ncs-condition-flag" aria-hidden="true"></span><span>Unit received in good condition</span></div>
                        </td>
                        <td class="condition-cell ncs-condition-remarks" rowspan="4">
                            <div class="ncs-condition-remarks-text">Specify the damage here if applicable</div>
                        </td>
                    `;
                }

                if (rowIndex === 1 || rowIndex === 3) {
                    return '';
                }

                if (rowIndex === 2) {
                    return `
                        <td class="condition-cell ncs-condition-cell" rowspan="2">
                            <div class="ncs-condition-option"><span class="ncs-condition-flag" aria-hidden="true"></span><span>Unit received with damage</span></div>
                        </td>
                    `;
                }

                return `
                    <td class="condition-cell ncs-condition-cell"></td>
                    <td class="condition-cell ncs-condition-remarks"></td>
                `;
            }


            function buildReturnPrintFooterMarkup(snapshot) {
                return `
                    <div class="ncs-divider-bar ncs-return-divider" aria-hidden="true"></div>
                    <div class="affirmation-box ncs-affirmation-box ncs-return-affirmation">
                        <i>I hereby affirm that I have received the unit in good condition and acknowledge that it is free from any visible damage at the time of receipt.</i>
                    </div>
                    <div class="ncs-signatures-grid ncs-return-signatures mt-spacing">
                        <div class="ncs-signature-panel ncs-return-signature-panel">
                            <div class="sig-title-bar">EMPLOYEE</div>
                            <div class="ncs-signature-blank"></div>
                            <div class="ncs-signature-name-row ncs-signature-static">${escapeHtml(snapshot.returneeName)}</div>
                            <div class="ncs-signature-role-row ncs-signature-static">${escapeHtml(snapshot.returneeRole)}</div>
                            <div class="ncs-signature-date-row ncs-return-mobile-row">
                                <div class="ncs-signature-date-label">Mobile Number</div>
                                <div class="ncs-signature-date-cell">${escapeHtml(snapshot.contact)}</div>
                            </div>
                            <div class="ncs-signature-date-row">
                                <div class="ncs-signature-date-label">Date Signed</div>
                                <div class="ncs-signature-date-cell"></div>
                            </div>
                        </div>
                        <div class="ncs-signature-panel ncs-return-signature-panel">
                            <div class="sig-title-bar">CORP IT &amp; INFRA PERSONNEL IN-CHARGE</div>
                            <div class="ncs-signature-blank"></div>
                            <div class="ncs-signature-name-row ncs-signature-static">${escapeHtml(snapshot.itPersonnel)}</div>
                            <div class="ncs-signature-role-row ncs-signature-static">${escapeHtml(snapshot.itPersonnelRole)}</div>
                            <div class="ncs-signature-date-row">
                                <div class="ncs-signature-date-label">Date Signed</div>
                                <div class="ncs-signature-date-cell"></div>
                            </div>
                        </div>
                    </div>
                `;
            }


            function buildSanitizationPrintFooterMarkup(snapshot) {
                return `
                    <div class="ncs-divider-bar" aria-hidden="true"></div>
                    <div class="affirmation-box bold-affirmation ncs-affirmation-box">
                        <i>I hereby confirm that the above asset has been sanitized and cleared of all data in
                            accordance with company policies and applicable data protection regulations.</i>
                    </div>
                    <div class="sanitization-signatures ncs-san-signatures mt-spacing">
                        <div class="ncs-signatures-grid ncs-san-grid-top">
                            <div class="ncs-signature-panel ncs-signature-panel-small">
                                <div class="sig-title-bar">RETURNEE</div>
                                <div class="ncs-signature-blank"></div>
                                <div class="ncs-signature-name-row ncs-signature-static">${escapeHtml(snapshot.returneeName)}</div>
                                <div class="ncs-signature-role-row ncs-signature-static">${escapeHtml(snapshot.returneeRole)}</div>
                                <div class="ncs-signature-date-row">
                                    <div class="ncs-signature-date-label">Date Signed</div>
                                    <div class="ncs-signature-date-cell"></div>
                                </div>
                            </div>
                            <div class="ncs-signature-panel ncs-signature-panel-small">
                                <div class="sig-title-bar">TECHNICAL SUPPORT CONFORME</div>
                                <div class="ncs-signature-blank"></div>
                                <div class="ncs-signature-name-row ncs-signature-static">${escapeHtml(snapshot.techSupportName)}</div>
                                <div class="ncs-signature-role-row ncs-signature-static">${escapeHtml(snapshot.techSupportRole)}</div>
                                <div class="ncs-signature-date-row">
                                    <div class="ncs-signature-date-label">Date Signed</div>
                                    <div class="ncs-signature-date-cell"></div>
                                </div>
                            </div>
                                <div class="ncs-signature-panel ncs-signature-panel-small">
                                    <div class="sig-title-bar">INFOSEC CONFORME</div>
                                    <div class="ncs-signature-blank"></div>
                                    <div class="ncs-signature-name-row ncs-signature-static">${escapeHtml(snapshot.infosecName)}</div>
                                    <div class="ncs-signature-role-row ncs-signature-static">${escapeHtml(snapshot.infosecRole)}</div>
                                    <div class="ncs-signature-date-row">
                                        <div class="ncs-signature-date-label">Date Signed</div>
                                    <div class="ncs-signature-date-cell"></div>
                                </div>
                            </div>
                        </div>
                        <div class="ncs-signatures-grid ncs-san-grid-bottom">
                            <div class="ncs-signature-panel ncs-signature-panel-small">
                                <div class="sig-title-bar">IT ASSET MANAGEMENT</div>
                                <div class="ncs-signature-blank"></div>
                                <div class="ncs-signature-name-row ncs-signature-static">${escapeHtml(snapshot.assetManager)}</div>
                                <div class="ncs-signature-role-row ncs-signature-static">${escapeHtml(snapshot.assetManagerRole)}</div>
                                <div class="ncs-signature-date-row">
                                    <div class="ncs-signature-date-label">Date Signed</div>
                                    <div class="ncs-signature-date-cell"></div>
                                </div>
                            </div>
                            <div class="ncs-signature-panel ncs-signature-panel-small">
                                <div class="sig-title-bar">CORP IT &amp; INFRA LEAD / HEAD</div>
                                <div class="ncs-signature-blank"></div>
                                <div class="ncs-signature-name-row ncs-signature-static">${escapeHtml(snapshot.leadName)}</div>
                                <div class="ncs-signature-role-row ncs-signature-static">${escapeHtml(snapshot.leadRole)}</div>
                                <div class="ncs-signature-date-row">
                                    <div class="ncs-signature-date-label">Date Signed</div>
                                    <div class="ncs-signature-date-cell"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }


            function splitAccountabilityAssetsForPrint(assets, profile = {}) {
                const rows = Array.isArray(assets) ? [...assets] : [];
                const singlePageCapacity = getPositivePrintCapacity(profile.singlePageCapacity, 6);
                const continuationPageCapacity = getPositivePrintCapacity(profile.continuationPageCapacity, 8);
                const finalPageCapacity = getPositivePrintCapacity(profile.finalPageCapacity, 4);

                if (rows.length <= singlePageCapacity) {
                    return [rows];
                }

                const pageCount = 1 + Math.ceil(
                    Math.max(0, rows.length - finalPageCapacity) / continuationPageCapacity
                );
                const pageCapacities = Array.from(
                    { length: Math.max(0, pageCount - 1) },
                    () => continuationPageCapacity
                );
                pageCapacities.push(finalPageCapacity);

                const pageRowCounts = allocateAccountabilityPageRowCounts(rows.length, pageCapacities);
                const pages = [];
                let rowOffset = 0;

                for (const rowCount of pageRowCounts) {
                    pages.push(rows.slice(rowOffset, rowOffset + rowCount));
                    rowOffset += rowCount;
                }

                return pages;
            }


            function getPositivePrintCapacity(value, fallback) {
                const parsedValue = Number(value);
                return Number.isFinite(parsedValue) && parsedValue > 0
                    ? Math.floor(parsedValue)
                    : fallback;
            }


            function allocateAccountabilityPageRowCounts(totalRows, pageCapacities) {
                const totalCapacity = pageCapacities.reduce((sum, capacity) => sum + capacity, 0);
                const fillRatio = totalCapacity > 0 ? totalRows / totalCapacity : 1;
                const finalPageIndex = pageCapacities.length - 1;
                const allocations = pageCapacities.map((capacity, index) => {
                    const minimumAllocation = pageCapacities.length > 1 && index === finalPageIndex
                        ? Math.min(2, capacity)
                        : 1;
                    return Math.max(
                        minimumAllocation,
                        Math.min(capacity, Math.floor(capacity * fillRatio))
                    );
                });
                const priorities = pageCapacities.map((capacity, index) => ({
                    index,
                    remainder: (capacity * fillRatio) - Math.floor(capacity * fillRatio)
                })).sort((left, right) =>
                    right.remainder - left.remainder || left.index - right.index
                );

                let rowsToAllocate = totalRows - allocations.reduce((sum, count) => sum + count, 0);
                while (rowsToAllocate > 0) {
                    let allocatedThisPass = false;

                    for (const { index } of priorities) {
                        if (rowsToAllocate <= 0) {
                            break;
                        }
                        if (allocations[index] >= pageCapacities[index]) {
                            continue;
                        }

                        allocations[index] += 1;
                        rowsToAllocate -= 1;
                        allocatedThisPass = true;
                    }

                    if (!allocatedThisPass) {
                        break;
                    }
                }

                return allocations;
            }


            function serializeAccountabilityPrintFormData() {
                const assigneeName = sanitizeCellValue(getDisplayValue('f_sigEmpName')) || 'SURNAME, FULL NAME';
                const assigneePosition = sanitizeCellValue(getDisplayValue('f_sigPosition')) || 'Full Name and Signature';
                return {
                    controlNumber: sanitizeCellValue(getDisplayValue('f_refNo')),
                    employeeName: sanitizeCellValue(getDisplayValue('f_empName')),
                    position: sanitizeCellValue(getDisplayValue('f_position')),
                    employeeId: sanitizeCellValue(getDisplayValue('f_empId')),
                    costCenter: sanitizeCellValue(getDisplayValue('f_costCenter')),
                    assigneeName,
                    assigneePosition,
                    pickupDate: sanitizeCellValue(getDisplayValue('f_dateIssued_text')),
                    issuedName: sanitizeCellValue(getDisplayValue('f_issuedName')),
                    issuedDate: sanitizeCellValue(getDisplayValue('f_issuedDate_text')),
                    issuedPosition: sanitizeCellValue(getDisplayValue('f_issuedPos')),
                    approvedName: sanitizeCellValue(getDisplayValue('f_approvedName')) || getSignerRosterDefaultName('approved'),
                    approvedPosition: sanitizeCellValue(getDisplayValue('f_approvedPos')) || DEFAULT_APPROVED_POS
                };
            }


            function buildAccountabilityPrintPage(assets, snapshot, options) {
                const page = document.createElement('div');
                page.className = 'printable-form accountability-print-page';
                page.dataset.pageRole = options.isFinal ? 'final' : 'continued';
                page.dataset.assetCount = String(assets.length);
                page.dataset.totalAssets = String(options.totalAssets ?? assets.length);
                page.dataset.totalPages = String(options.totalPages || 1);
                if (options.printDensity) {
                    page.dataset.printDensity = options.printDensity;
                }

                const firstAssetNumber = (options.assetStartIndex || 0) + 1;
                const lastAssetNumber = (options.assetStartIndex || 0) + assets.length;
                const pageMeta = options.totalPages > 1
                    ? `
                        <div class="accountability-page-meta">
                            <div class="accountability-page-range">
                                ${options.isFinal
                                    ? 'Final asset list'
                                    : options.pageNumber === 1
                                        ? 'Asset list'
                                        : 'Asset list - continued'}
                                <span>Assets ${firstAssetNumber}-${lastAssetNumber} of ${options.totalAssets}</span>
                            </div>
                            <div class="accountability-page-badge">Page ${options.pageNumber} of ${options.totalPages}</div>
                        </div>
                    `
                    : '';

                page.innerHTML = `
                    <div class="form-top-row">
                        <img src="assets/img/ncs-logo-optimized.png" alt="NCS Logo" class="yondu-logo-img ncs-logo-img" width="720" height="259">
                        <div class="control-number-container ncs-control-number">
                            <div class="cn-label-box">Control Number</div>
                            <div class="cn-value-box">${escapeHtml(snapshot.controlNumber)}</div>
                        </div>
                    </div>
                    <div class="form-title-bar ncs-form-title">
                        ASSET ACCOUNTABILITY FORM
                    </div>
                    ${pageMeta}
                    <table class="info-table ncs-info-table">
                        <tr>
                            <td class="label">Employee Name</td>
                            <td class="value">${escapeHtml(snapshot.employeeName)}</td>
                            <td class="label">Position</td>
                            <td class="value">${escapeHtml(snapshot.position)}</td>
                        </tr>
                        <tr>
                            <td class="label">Employee Number</td>
                            <td class="value">${escapeHtml(snapshot.employeeId)}</td>
                            <td class="label">Cost Center</td>
                            <td class="value">${escapeHtml(snapshot.costCenter)}</td>
                        </tr>
                    </table>
                    <table class="details-table ncs-details-table mt-4">
                        <thead>
                            <tr>
                                <th>QTY</th>
                                <th>PARTICULARS</th>
                                <th>ASSET TAG</th>
                                <th>MODEL / DESCRIPTION</th>
                                <th>SERIAL / IMEI</th>
                                <th>SETUP DATE</th>
                                <th>REMARKS</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${assets.map((asset) => buildAccountabilityPrintAssetRowMarkup(asset)).join('')}
                            ${buildAccountabilityPrintEmptyRowsMarkup(assets.length, options.minimumTableRows)}
                        </tbody>
                    </table>
                    ${options.isFinal ? '' : buildAccountabilityPrintContinuationMarkup(options, assets.length)}
                    ${options.isFinal ? buildAccountabilityPrintAuthorityMarkup(snapshot) : ''}
                `;

                return page;
            }


            function buildAccountabilityPrintAssetRowMarkup(asset) {
                return `
                    <tr>
                        <td class="center-text bordered-bottom">1</td>
                        <td class="center-text bordered-bottom">${escapeHtml(asset.particulars || 'Laptop')}</td>
                        <td class="center-text bordered-bottom">${escapeHtml(asset.assetTag)}</td>
                        <td class="bordered-bottom center-text">${escapeHtml(asset.description)}</td>
                        <td class="center-text bordered-bottom">${escapeHtml(asset.serial)}</td>
                        <td class="bordered-bottom center-text">${escapeHtml(formatAccountabilitySetupDateForDisplay(asset.setupDate))}</td>
                        <td class="bordered-bottom center-text">${escapeHtml(asset.remarks)}</td>
                    </tr>
                `;
            }


            function buildAccountabilityPrintEmptyRowsMarkup(assetCount, minimumTableRows = 4) {
                const emptyRowCount = Math.max(0, minimumTableRows - assetCount);
                return Array.from({ length: emptyRowCount }, () => `
                    <tr class="empty-row">
                        <td class="bordered-bottom"></td>
                        <td class="bordered-bottom"></td>
                        <td class="bordered-bottom"></td>
                        <td class="bordered-bottom"></td>
                        <td class="bordered-bottom"></td>
                        <td class="bordered-bottom"></td>
                        <td class="bordered-bottom"></td>
                    </tr>
                `).join('');
            }


            function buildAccountabilityPrintContinuationMarkup(options, pageAssetCount) {
                const remainingAssetCount = Math.max(
                    0,
                    Number(options.totalAssets || 0) - ((options.assetStartIndex || 0) + Number(pageAssetCount || 0))
                );
                const remainingLabel = remainingAssetCount === 1 ? '1 asset remains' : `${remainingAssetCount} assets remain`;

                return `
                    <div class="accountability-continuation-note">
                        <span class="accountability-continuation-title">Asset list continues on the next page</span>
                        <span class="accountability-continuation-count">${escapeHtml(remainingLabel)}</span>
                    </div>
                `;
            }


            function buildAccountabilityPrintAuthorityMarkup(snapshot) {
                return `
                        <div class="authority-section ncs-authority-section">
                            <div class="auth-header">AUTHORITY TO DEDUCT</div>
                            <p class="auth-text">
                            By signing on this document, the employee affirms that <strong>he/she received the unit in
                            good condition and will be held accountable for any loss or damage to the equipment</strong>
                            assigned to him/her, the employee shall shoulder the full replacement cost or full repair cost,
                            whichever is applicable.
                        </p>
                        <div class="signatures-grid ncs-signatures-grid ncs-accountability-signatures">
                            <div class="sig-column ncs-signature-column ncs-assignee-signature-column">
                                <div class="ncs-signature-panel">
                                    <div class="sig-title-bar">ASSIGNEE</div>
                                    <div class="ncs-signature-blank"></div>
                                    <div class="ncs-signature-name-row ncs-signature-static">${escapeHtml(snapshot.assigneeName)}</div>
                                    <div class="ncs-signature-role-row ncs-signature-static">${escapeHtml(snapshot.assigneePosition)}</div>
                                    <div class="ncs-signature-date-row">
                                        <div class="ncs-signature-date-label">Date Signed</div>
                                        <div class="ncs-signature-date-cell"></div>
                                    </div>
                                </div>
                                <div class="ncs-pickup-row ncs-pickup-row-standalone">
                                    <div class="sig-title-bar ncs-inline-title">PICK UP DATE:</div>
                                    <div class="ncs-pickup-input ncs-signature-static">${escapeHtml(snapshot.pickupDate)}</div>
                                </div>
                            </div>
                            <div class="sig-column ncs-signature-panel">
                                <div class="sig-title-bar">ISSUED BY</div>
                                <div class="ncs-signature-blank"></div>
                                <div class="ncs-signature-name-row ncs-signature-static">${escapeHtml(snapshot.issuedName)}</div>
                                <div class="ncs-signature-role-row ncs-signature-static">${escapeHtml(snapshot.issuedPosition)}</div>
                                <div class="ncs-signature-date-row">
                                    <div class="ncs-signature-date-label">Date Signed</div>
                                    <div class="ncs-signature-date-cell ncs-signature-static">${escapeHtml(snapshot.issuedDate)}</div>
                                </div>
                            </div>
                            <div class="sig-column right ncs-signature-panel">
                                <div class="sig-title-bar">APPROVED BY</div>
                                <div class="ncs-signature-blank"></div>
                                <div class="ncs-signature-name-row ncs-signature-static">${escapeHtml(snapshot.approvedName)}</div>
                                <div class="ncs-signature-role-row ncs-signature-static">${escapeHtml(snapshot.approvedPosition)}</div>
                                <div class="ncs-signature-date-row">
                                    <div class="ncs-signature-date-label">Date Signed</div>
                                    <div class="ncs-signature-date-cell"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }


            function getAccountabilityPrintWrapRiskScore(assets) {
                const assetRows = Array.isArray(assets) ? assets : [];
                return assetRows.reduce((totalRisk, asset) =>
                    totalRisk
                    + getAccountabilityPrintWrapUnits(asset?.particulars, 18)
                    + getAccountabilityPrintWrapUnits(asset?.assetTag, 18)
                    + getAccountabilityPrintWrapUnits(asset?.description, 44)
                    + getAccountabilityPrintWrapUnits(asset?.serial, 24)
                    + getAccountabilityPrintWrapUnits(asset?.remarks, 32), 0
                );
            }


            function getAccountabilityPrintWrapUnits(value, approximateLineLength) {
                const text = String(value || '').trim();
                if (!text) {
                    return 0;
                }

                const renderedLineCount = text.split(/\r?\n/).reduce((lineCount, line) =>
                    lineCount + Math.max(1, Math.ceil(line.trim().length / approximateLineLength)), 0
                );
                return Math.max(0, renderedLineCount - 1);
            }


            function getAccountabilityPrintProfile(assets, snapshot) {
                const assetRows = Array.isArray(assets) ? assets : [];
                const wrapRiskScore = getAccountabilityPrintWrapRiskScore(assetRows);
                const longPosition = [
                    snapshot?.position,
                    snapshot?.assigneePosition,
                    snapshot?.issuedPosition
                ].some((value) => String(value || '').trim().length >= 34);
                const longDescription = assetRows.some((asset) =>
                    String(asset?.description || '').trim().length >= 44
                );
                const highWrapContent = assetRows.length >= 4 && wrapRiskScore >= 16;
                const constrainedContent = (assetRows.length >= 5 && wrapRiskScore >= 8) || [
                    snapshot?.controlNumber,
                    snapshot?.employeeName,
                    snapshot?.position,
                    snapshot?.employeeId,
                    snapshot?.costCenter,
                    snapshot?.assigneeName,
                    snapshot?.assigneePosition,
                    snapshot?.pickupDate,
                    snapshot?.issuedName,
                    snapshot?.issuedDate,
                    snapshot?.issuedPosition,
                    snapshot?.approvedName,
                    snapshot?.approvedPosition
                ].some((value) => /[\r\n]/.test(String(value || '')) || String(value || '').trim().length >= 60)
                    || assetRows.some((asset) =>
                        /[\r\n]/.test([
                            asset?.particulars,
                            asset?.assetTag,
                            asset?.description,
                            asset?.serial,
                            asset?.remarks
                        ].map((value) => String(value || '')).join(' '))
                        || String(asset?.particulars || '').trim().length >= 32
                        || String(asset?.assetTag || '').trim().length >= 24
                        || String(asset?.description || '').trim().length >= 72
                        || String(asset?.remarks || '').trim().length >= 52
                        || String(asset?.serial || '').trim().length >= 30
                    );
                const capacityProfile = highWrapContent
                    ? ACCOUNTABILITY_PRINT_PROFILES.highWrap
                    : constrainedContent
                        ? ACCOUNTABILITY_PRINT_PROFILES.constrained
                        : ACCOUNTABILITY_PRINT_PROFILES.standard;

                return {
                    ...capacityProfile,
                    density: assetRows.length >= 4 || constrainedContent || longPosition || longDescription
                        ? 'compact'
                        : '',
                    constrainedContent,
                    highWrapContent,
                    wrapRiskScore
                };
            }


            function getAccountabilityPrintDensity(assets, snapshot) {
                return getAccountabilityPrintProfile(assets, snapshot).density;
            }


            function applyAccountabilityPrintDensity(form, density) {
                if (!form) {
                    return;
                }

                if (density) {
                    form.dataset.printDensity = density;
                    return;
                }

                delete form.dataset.printDensity;
            }


            function escapeHtml(value) {
                return sanitizeCellValue(value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            }

        Object.assign(scope, {
        bindPrintNaming,
        bindStatusInputToPrintMode,
        bindPrint,
        markPrintPreparationDirty,
        preparePrintOutput,
        syncPrintModeVisibility,
        isAccountabilityMode,
        isTestDeviceAccountabilityMode,
        isAccountabilityNewHireMode,
        isAccountabilityReplacementMode,
        isAccountabilityTemporaryMode,
        isReturnSanitizationMode,
        syncPrintTemplateVisibility,
        getVisiblePrintTemplateKeys,
        applyPrintTemplateVisibility,
        restorePrintTemplateVisibility,
        syncAccountabilityApprovedByVisibility,
        setAccountabilityPrintMode,
        setReturnPrintMode,
        syncPrintModeButtons,
        syncAccountabilityPrintModeButtons,
        inferReturnPrintMode,
        updatePrintDocumentTitle,
        buildPrintDocumentTitle,
        composePrintFileName,
        buildSafePrintDialogTitle,
        formatPrintEmployeeName,
        sanitizeFilenamePart,
        getDisplayValue,
        getPrintSignatureFitTier,
        applyPrintTextOptimizations,
        restorePrintTextOptimizations,
        getPrintOptimizedRemark,
        formatAccountabilitySetupDateForDisplay,
        syncAccountabilityPrintOverflowPages,
        syncReturnSanPrintOverflowPages,
        syncReturnOrSanitizationPrintOverflow,
        serializeReturnSanitizationTableRows,
        getTableCellDisplayValue,
        chunkRows,
        getReturnSanitizationPrintNameValues,
        getReturnSanitizationPrintMaxNameLength,
        getReturnSanitizationPrintDensity,
        getReturnSanitizationPrintNameScale,
        applyReturnSanitizationPrintDensity,
        clearReturnSanitizationPrintDensity,
        serializeReturnSanitizationPrintFormData,
        buildReturnSanitizationPrintPage,
        buildReturnSanitizationPrintRowsMarkup,
        buildReturnPrintFooterMarkup,
        buildSanitizationPrintFooterMarkup,
        splitAccountabilityAssetsForPrint,
        getPositivePrintCapacity,
        allocateAccountabilityPageRowCounts,
        serializeAccountabilityPrintFormData,
        buildAccountabilityPrintPage,
        buildAccountabilityPrintAssetRowMarkup,
        buildAccountabilityPrintEmptyRowsMarkup,
        buildAccountabilityPrintContinuationMarkup,
        buildAccountabilityPrintAuthorityMarkup,
        getAccountabilityPrintWrapRiskScore,
        getAccountabilityPrintWrapUnits,
        getAccountabilityPrintProfile,
        getAccountabilityPrintDensity,
        applyAccountabilityPrintDensity,
        escapeHtml
        });
        Object.assign(App, {
        bindPrintNaming,
        bindStatusInputToPrintMode,
        bindPrint,
        markPrintPreparationDirty,
        preparePrintOutput,
        syncPrintModeVisibility,
        isAccountabilityMode,
        isTestDeviceAccountabilityMode,
        isAccountabilityNewHireMode,
        isAccountabilityReplacementMode,
        isAccountabilityTemporaryMode,
        isReturnSanitizationMode,
        syncPrintTemplateVisibility,
        getVisiblePrintTemplateKeys,
        applyPrintTemplateVisibility,
        restorePrintTemplateVisibility,
        syncAccountabilityApprovedByVisibility,
        setAccountabilityPrintMode,
        setReturnPrintMode,
        syncPrintModeButtons,
        syncAccountabilityPrintModeButtons,
        inferReturnPrintMode,
        updatePrintDocumentTitle,
        buildPrintDocumentTitle,
        composePrintFileName,
        buildSafePrintDialogTitle,
        formatPrintEmployeeName,
        sanitizeFilenamePart,
        getDisplayValue,
        getPrintSignatureFitTier,
        applyPrintTextOptimizations,
        restorePrintTextOptimizations,
        getPrintOptimizedRemark,
        formatAccountabilitySetupDateForDisplay,
        syncAccountabilityPrintOverflowPages,
        syncReturnSanPrintOverflowPages,
        syncReturnOrSanitizationPrintOverflow,
        serializeReturnSanitizationTableRows,
        getTableCellDisplayValue,
        chunkRows,
        getReturnSanitizationPrintNameValues,
        getReturnSanitizationPrintMaxNameLength,
        getReturnSanitizationPrintDensity,
        getReturnSanitizationPrintNameScale,
        applyReturnSanitizationPrintDensity,
        clearReturnSanitizationPrintDensity,
        serializeReturnSanitizationPrintFormData,
        buildReturnSanitizationPrintPage,
        buildReturnSanitizationPrintRowsMarkup,
        buildReturnPrintFooterMarkup,
        buildSanitizationPrintFooterMarkup,
        splitAccountabilityAssetsForPrint,
        getPositivePrintCapacity,
        allocateAccountabilityPageRowCounts,
        serializeAccountabilityPrintFormData,
        buildAccountabilityPrintPage,
        buildAccountabilityPrintAssetRowMarkup,
        buildAccountabilityPrintEmptyRowsMarkup,
        buildAccountabilityPrintContinuationMarkup,
        buildAccountabilityPrintAuthorityMarkup,
        getAccountabilityPrintWrapRiskScore,
        getAccountabilityPrintWrapUnits,
        getAccountabilityPrintProfile,
        getAccountabilityPrintDensity,
        applyAccountabilityPrintDensity,
        escapeHtml
        });
    }
})();
