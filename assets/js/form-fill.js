(function () {
    const App = window.YonduApp;
    const scope = App.scope;
    let searchHeaderResizeFrame = 0;

    with (scope) {

            function bindFormSelection() {
                const formButtons = document.querySelectorAll('.form-btn, .sub-btn');

                formButtons.forEach((btn) => {
                    btn.setAttribute('aria-pressed', String(btn.classList.contains('active')));
                    btn.addEventListener('click', () => {
                        const formType = btn.getAttribute('data-form');
                        if (!formType) {
                            return;
                        }

                        currentFormType = formType;
                        document.querySelectorAll('.form-btn.active, .sub-btn.active').forEach((activeBtn) => {
                            activeBtn.classList.remove('active');
                        });
                        document.querySelectorAll('.form-btn, .sub-btn').forEach((selectionButton) => {
                            selectionButton.setAttribute('aria-pressed', 'false');
                        });

                        clearAlerts();
                        resetForm();

                        if (btn.classList.contains('sub-btn')) {
                            btn.classList.add('active');
                            btn.setAttribute('aria-pressed', 'true');
                            const parentButton = btn.closest('.dropdown-wrapper').querySelector('.form-btn');
                            if (parentButton) {
                                parentButton.classList.add('active');
                                parentButton.setAttribute('aria-pressed', 'true');
                            }
                            closeFormSelectorDropdowns();
                        } else {
                            btn.classList.add('active');
                            btn.setAttribute('aria-pressed', 'true');
                        }

                        Object.values(templates).forEach((template) => {
                            template.classList.remove('active');
                        });

                        if (formType === 'accountability') {
                            templates.accountability.classList.add('active');
                            updateRemarksDropdowns(false, false);
                            syncPrintModeVisibility();
                            updatePrintDocumentTitle();
                            syncSourceStatusPanel();
                            return;
                        }

                        if (formType === 'test_device_accountability') {
                            templates.testDeviceAccountability.classList.add('active');
                            syncPrintModeVisibility();
                            updatePrintDocumentTitle();
                            syncSourceStatusPanel();
                            return;
                        }

                        if (formType.startsWith('return_') || formType.startsWith('sanitization_')) {
                            templates.returnForm.classList.add('active');
                            templates.sanitization.classList.add('active');
                            applyReturnAndSanitizationLayout(formType.includes('_test'));
                            syncPrintModeVisibility();
                            updatePrintDocumentTitle();
                            syncSourceStatusPanel();
                        }
                    });
                });
            }


            function bindFormSelectorDropdown() {
                const dropdownWrapper = document.querySelector('#sanitizationDropdownBtn')?.closest('.dropdown-wrapper');
                const dropdownButton = document.getElementById('sanitizationDropdownBtn');

                if (!dropdownWrapper || !dropdownButton || dropdownWrapper.dataset.dropdownBound === 'true') {
                    return;
                }

                dropdownWrapper.dataset.dropdownBound = 'true';
                dropdownButton.setAttribute('aria-haspopup', 'true');
                dropdownButton.setAttribute('aria-expanded', 'false');

                dropdownButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const isOpen = dropdownWrapper.classList.toggle('is-open');
                    dropdownButton.setAttribute('aria-expanded', String(isOpen));
                });

                document.addEventListener('click', (event) => {
                    if (dropdownWrapper.contains(event.target)) {
                        return;
                    }

                    closeFormSelectorDropdowns();
                });
            }


            function closeFormSelectorDropdowns() {
                const dropdownWrapper = document.querySelector('#sanitizationDropdownBtn')?.closest('.dropdown-wrapper');
                const dropdownButton = document.getElementById('sanitizationDropdownBtn');

                dropdownWrapper?.classList.remove('is-open');
                dropdownButton?.setAttribute('aria-expanded', 'false');
            }


            function applyReturnAndSanitizationLayout(isTestDevice) {
                const descHeader = isTestDevice ? 'Test Device Description' : 'Laptop Description';
                const retFormTitle = document.getElementById('retFormTitle');
                const retFooterText = document.getElementById('retFooterText');
                const sanFooterText = document.getElementById('sanFooterText');
                const retRemarksHeader = document.getElementById('retRemarksHeader');
                const sanRemarksHeader = document.getElementById('sanRemarksHeader');

                document.getElementById('retDescHeader').textContent = descHeader;
                document.getElementById('sanDescHeader').textContent = descHeader;

                if (retFormTitle) {
                    retFormTitle.textContent = 'IT ASSET RETURN FORM';
                }
                if (retFooterText) {
                    retFooterText.textContent = 'IT Asset Return Form';
                }
                if (sanFooterText) {
                    sanFooterText.textContent = 'IT Asset Sanitation Form';
                }
                if (retRemarksHeader) {
                    retRemarksHeader.textContent = 'Remarks';
                }
                if (sanRemarksHeader) {
                    sanRemarksHeader.textContent = 'Remarks';
                }

                // Toggle sanitization Project column visibility
                const sanProjectHeader = document.getElementById('sanProjectHeader');
                const sanProjectCell = document.getElementById('f_sanProjectCell');

                if (sanProjectHeader) {
                    sanProjectHeader.classList.toggle('hide', !isTestDevice);
                }
                if (sanProjectCell) {
                    sanProjectCell.classList.toggle('hide', !isTestDevice);
                }
                document.querySelectorAll('.san-project-empty-cell').forEach((cell) => {
                    cell.classList.toggle('hide', !isTestDevice);
                });

                applyReturnSanitizationSignatureDefaults();
                updateRemarksDropdowns(isTestDevice, true);
                setReturnPrintMode(currentReturnPrintMode, true);
            }


            function bindComboboxes(root = document) {
                function setComboboxOpenState(wrapper, isOpen) {
                    if (!wrapper) {
                        return;
                    }

                    wrapper.classList.toggle('is-open', isOpen);
                    wrapper.closest('td, th')?.classList.toggle('combobox-host-open', isOpen);
                    wrapper.closest('tr')?.classList.toggle('combobox-row-open', isOpen);
                    wrapper.closest('table')?.classList.toggle('combobox-table-open', isOpen);
                    wrapper.querySelector('.combobox-toggle')?.setAttribute('aria-expanded', String(isOpen));
                }

                root.querySelectorAll('.combobox-toggle').forEach((btn) => {
                    if (btn.dataset.comboboxBound === 'true') {
                        return;
                    }

                    btn.dataset.comboboxBound = 'true';
                    const options = document.getElementById(`${btn.getAttribute('data-target')}_options`);
                    btn.setAttribute('aria-haspopup', 'listbox');
                    btn.setAttribute('aria-expanded', 'false');
                    btn.setAttribute('aria-label', 'Show available field options');
                    if (options) {
                        options.setAttribute('role', 'listbox');
                        btn.setAttribute('aria-controls', options.id);
                        options.querySelectorAll('.combobox-option').forEach((option) => {
                            option.setAttribute('role', 'option');
                            option.setAttribute('tabindex', '-1');
                        });
                    }

                    btn.addEventListener('click', (event) => {
                        event.stopPropagation();
                        const wrapper = btn.closest('.combobox-wrapper');
                        const options = document.getElementById(`${btn.getAttribute('data-target')}_options`);
                        if (!options) {
                            return;
                        }

                        document.querySelectorAll('.combobox-options.open').forEach((openOptions) => {
                            if (openOptions !== options) {
                                openOptions.classList.remove('open');
                                setComboboxOpenState(openOptions.closest('.combobox-wrapper'), false);
                            }
                        });

                        const shouldOpen = !options.classList.contains('open');
                        options.classList.toggle('open', shouldOpen);
                        setComboboxOpenState(wrapper, shouldOpen);
                    });

                    btn.addEventListener('keydown', (event) => {
                        if (event.key === 'Escape') {
                            const wrapper = btn.closest('.combobox-wrapper');
                            const options = document.getElementById(`${btn.getAttribute('data-target')}_options`);
                            options?.classList.remove('open');
                            setComboboxOpenState(wrapper, false);
                            return;
                        }

                        if (event.key !== 'ArrowDown') {
                            return;
                        }

                        event.preventDefault();
                        const wrapper = btn.closest('.combobox-wrapper');
                        const options = document.getElementById(`${btn.getAttribute('data-target')}_options`);
                        const firstOption = options?.querySelector('.combobox-option');
                        if (!options || !firstOption) {
                            return;
                        }

                        options.classList.add('open');
                        setComboboxOpenState(wrapper, true);
                        firstOption.focus();
                    });
                });

                if (document.body.dataset.comboboxGlobalBound === 'true') {
                    return;
                }

                document.body.dataset.comboboxGlobalBound = 'true';
                document.addEventListener('keydown', (event) => {
                    const option = event.target.closest('.combobox-option');
                    if (!option) {
                        return;
                    }

                    const options = option.closest('.combobox-options');
                    const optionItems = Array.from(options?.querySelectorAll('.combobox-option') || []);
                    const optionIndex = optionItems.indexOf(option);

                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        option.click();
                        return;
                    }

                    if (event.key === 'Escape') {
                        event.preventDefault();
                        const wrapper = option.closest('.combobox-wrapper');
                        options?.classList.remove('open');
                        setComboboxOpenState(wrapper, false);
                        wrapper?.querySelector('.combobox-toggle')?.focus();
                        return;
                    }

                    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
                        return;
                    }

                    event.preventDefault();
                    const offset = event.key === 'ArrowDown' ? 1 : -1;
                    const nextIndex = (optionIndex + offset + optionItems.length) % optionItems.length;
                    optionItems[nextIndex]?.focus();
                });

                document.addEventListener('click', (event) => {
                    const option = event.target.closest('.combobox-option');
                    if (option) {
                        const wrapper = option.closest('.combobox-wrapper');
                        const input = wrapper.querySelector('.combobox-input') || wrapper.querySelector('textarea');
                        const options = wrapper.querySelector('.combobox-options');
                        if (input) {
                            input.value = option.getAttribute('data-value');
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        if (options) {
                            options.classList.remove('open');
                        }
                        setComboboxOpenState(wrapper, false);
                        return;
                    }

                    document.querySelectorAll('.combobox-options.open').forEach((openOptions) => {
                        openOptions.classList.remove('open');
                        setComboboxOpenState(openOptions.closest('.combobox-wrapper'), false);
                    });
                });
            }

                // f_sanTestRemarks was removed, we only use f_sanRemarks now.


            function bindMirroredFields() {
                const retRemarksEl = document.getElementById('f_retRemarks');
                const sanRemarksEl = document.getElementById('f_sanRemarks');
                const retStatusInput = document.getElementById('f_retStatus');
                const sanStatusInput = document.getElementById('f_sanStatus');

                mirrorInputValue(retRemarksEl, sanRemarksEl);
                mirrorInputValue(retStatusInput, sanStatusInput);
                mirrorInputValue(sanStatusInput, retStatusInput);
                bindStatusInputToPrintMode(retStatusInput);
                bindStatusInputToPrintMode(sanStatusInput);
            }


            function mirrorInputValue(source, target) {
                if (!source || !target) {
                    return;
                }

                source.addEventListener('input', (event) => {
                    if (target.value === event.target.value) {
                        return;
                    }

                    target.value = event.target.value;
                    if (target.tagName === 'TEXTAREA') {
                        queueTextareaResize(target);
                    }
                });
            }


            function bindDateInputs(root = document) {
                root.querySelectorAll('input[type="date"]').forEach((input) => {
                    updateDateInputState(input);

                    if (input.dataset.dateBound === 'true') {
                        return;
                    }

                    input.dataset.dateBound = 'true';

                    input.addEventListener('input', () => {
                        updateDateInputState(input);
                    });

                    input.addEventListener('change', () => {
                        syncDateDisplay(input);
                    });
                });
            }


            function bindTextareaAutoResize(root = document) {
                const textareas = root.querySelectorAll('.auto-resize');
                textareas.forEach((textarea) => {
                    if (textarea.dataset.autoResizeBound !== 'true') {
                        textarea.dataset.autoResizeBound = 'true';
                        textarea.addEventListener('input', function () {
                            queueTextareaResize(this);
                        });
                    }
                });
                queueTextareaResizes(textareas);
            }


            function syncSearchPanelVisibility() {
                const showReplacementSearch = isAccountabilityReplacementMode();
                const showTestDeviceSearch = isTestDeviceAccountabilityMode()
                    || isReturnSanitizationMode() && currentFormType.includes('_test');
                const showDualSearchLayout = showReplacementSearch || showTestDeviceSearch;

                if (elements.defaultSearchSection) {
                    elements.defaultSearchSection.classList.toggle('hide', showDualSearchLayout);
                }

                if (elements.accountabilityReplacementSearchPanel) {
                    elements.accountabilityReplacementSearchPanel.classList.toggle('hide', !showReplacementSearch);
                }

                if (elements.testDeviceAccountabilitySearchPanel) {
                    elements.testDeviceAccountabilitySearchPanel.classList.toggle('hide', !showTestDeviceSearch);
                }

                if (elements.searchSection) {
                    elements.searchSection.classList.toggle('test-device-mode', showDualSearchLayout);
                }
                if (elements.appHeader) {
                    elements.appHeader.classList.toggle('test-device-header-mode', showDualSearchLayout);
                }
                if (elements.appLogo) {
                    elements.appLogo.classList.toggle('hide', showDualSearchLayout);
                }
                updateSearchInputPlaceholder();
                syncSearchHeaderOverflow();
            }


            function updateSearchInputPlaceholder() {
                if (!elements.searchInput) {
                    return;
                }

                if (isReturnSanitizationMode()) {
                    elements.searchInput.placeholder = currentFormType.includes('_test')
                        ? 'Enter one or more TD Asset Tags or Serials (comma or space separated)'
                        : 'Enter one or more Asset Tags or Serials, or search by employee';
                    return;
                }

                if (currentFormType.includes('_test')) {
                    elements.searchInput.placeholder = 'Enter TD Asset Tag or Serial No.';
                    return;
                }

                elements.searchInput.placeholder = 'Enter EE ID, Serial No, Asset Tag, or Full Name';
            }


            function syncSearchHeaderOverflow() {
                if (!elements.appHeader || !elements.appLogo || !elements.searchInput) {
                    return;
                }

                if (searchHeaderResizeFrame) {
                    return;
                }

                searchHeaderResizeFrame = window.requestAnimationFrame(() => {
                    searchHeaderResizeFrame = 0;
                    if (elements.appLogo.classList.contains('hide') || isTestDeviceAccountabilityMode() || isAccountabilityReplacementMode() || window.innerWidth <= 900) {
                        elements.appHeader.classList.remove('logo-collapsed');
                        return;
                    }

                    elements.appHeader.classList.remove('logo-collapsed');
                    const needsExtraSpace = elements.searchInput.scrollWidth > elements.searchInput.clientWidth + 12;
                    elements.appHeader.classList.toggle('logo-collapsed', needsExtraSpace);
                });
            }


            function updateRemarksDropdowns(isTestDevice, updateValue) {
                const laptopRemarksOptions = [
                    'LAPTOP WITH BAG AND CHARGER',
                    'LAPTOP WITHOUT BOX AND CHARGER',
                    'LAPTOP WITHOUT BOX',
                    'LAPTOP WITH BOX AND CHARGER'
                ];
                const testDeviceRemarksOptions = [
                    'Box with Charger',
                    'Box Only',
                    'No box',
                    'Charger only'
                ];
                const options = isTestDevice ? testDeviceRemarksOptions : laptopRemarksOptions;

                const returnSanRemarksOptionIds = new Set([
                    'f_retRemarks_options',
                    'f_sanRemarks_options',
                    'f_remarks_options'
                ]);
                document.querySelectorAll('.return-san-remarks-options').forEach((container) => {
                    if (container.id) {
                        returnSanRemarksOptionIds.add(container.id);
                    }
                });
                returnSanRemarksOptionIds.forEach((targetId) => {
                    setComboboxOptions(targetId, options);
                });
                refreshTestDeviceProjectRemarksOptions(testDeviceRemarksOptions);

                if (!updateValue) {
                    return;
                }

                const isFieldPopulated = (id) => {
                    const field = document.getElementById(id);
                    if (!field) {
                        return false;
                    }
                    if ('value' in field) {
                        return sanitizeCellValue(field.value) !== '';
                    }
                    return sanitizeCellValue(field.textContent) !== '';
                };

                const isPopulated =
                    isFieldPopulated('f_empName') ||
                    isFieldPopulated('f_retName') ||
                    isFieldPopulated('f_sanName');

                if (!isPopulated) {
                    return;
                }

                const laptopDefault = 'LAPTOP WITH BOX AND CHARGER';
                const testDefault = 'Box with Charger';
                const nextValue = isTestDevice ? testDefault : laptopDefault;
                const previousValue = isTestDevice ? laptopDefault : testDefault;

                ['f_retRemarks', 'f_sanRemarks'].forEach((fieldId) => {
                    const field = document.getElementById(fieldId);
                    if (!field) {
                        return;
                    }
                    if (field.value === '' || field.value === previousValue) {
                        field.value = nextValue;
                        field.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });

                const tdaProjectRemarksField = document.getElementById('f_tdaProjectRemarks');
                if (tdaProjectRemarksField && tdaProjectRemarksField.value === '') {
                    tdaProjectRemarksField.value = testDefault;
                    tdaProjectRemarksField.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }


            function getAccountabilityRemarksDefault(model) {
                const normalizedModel = sanitizeCellValue(model).toLowerCase();
                if (!normalizedModel) {
                    return '';
                }

                const isAppleModel = /\bapple\b|\bmac(?:book|intosh)?\b|\bimac\b|\bmac\s+(?:mini|pro|studio)\b/.test(normalizedModel);
                return isAppleModel
                    ? 'LAPTOP WITH BOX AND CHARGER'
                    : 'LAPTOP WITH BAG AND CHARGER';
            }


            function refreshTestDeviceProjectRemarksOptions(options) {
                const testDeviceRemarksOptions = options || [
                    'Box with Charger',
                    'Box Only',
                    'No box',
                    'Charger only'
                ];
                const containers = new Set();

                const primaryOptions = document.getElementById('f_tdaProjectRemarks_options');
                if (primaryOptions) {
                    containers.add(primaryOptions);
                }

                document.querySelectorAll('.tda-project-remarks-options').forEach((container) => {
                    containers.add(container);
                });

                containers.forEach((container) => {
                    if (container && container.id) {
                        setComboboxOptions(container.id, testDeviceRemarksOptions);
                    }
                });
            }


            function setComboboxOptions(containerId, options) {
                const container = document.getElementById(containerId);
                if (!container) {
                    return;
                }

                const items = [];
                options.forEach((optionValue) => {
                    const option = document.createElement('div');
                    option.className = 'combobox-option';
                    option.setAttribute('data-value', optionValue);
                    option.textContent = optionValue;
                    items.push(option);
                });

                container.replaceChildren(...items);
            }


            function fillForm(data) {
                const accountability = data.accountability;
                const returnSan = data.returnSan;

                setTextContent('f_refNo', '');
                setInputValue('f_empName', accountability.name);
                setInputValue('f_empId', accountability.employeeId);
                setInputValue('f_position', accountability.position);
                setInputValue('f_costCenter', accountability.costCenter);
                renderAccountabilityAssetRows(accountability.assets || []);
                setInputValue('f_sigEmpName', accountability.name);
                setInputValue('f_sigPosition', accountability.position);
                setDateField('f_dateIssued', 'f_dateIssued_text', accountability.pickupDate || '', false);
                setInputValue('f_issuedName', resolveSignerRosterSelection('issued', accountability.issuedName));
                setDateField('f_issuedDate', 'f_issuedDate_text', accountability.issuedDate || accountability.pickupDate || '', false);
                setInputValue('f_issuedPos', accountability.issuedPosition);

                setInputValue('f_retName', returnSan.name);
                setInputValue('f_retEmpNo', returnSan.employeeId);
                setInputValue('f_retBU', returnSan.businessUnit);
                setInputValue('f_retEmail', returnSan.email);
                setInputValue('f_retContact', returnSan.contact);
                renderReturnSanAssetRows('return', returnSan.assets || []);
                setDateField('f_retDate', 'f_retDate_text', returnSan.todayIso, false);

                setInputValue('f_sanName', returnSan.name);
                setInputValue('f_sanEmpNo', returnSan.employeeId);
                setInputValue('f_sanBU', returnSan.businessUnit);
                setInputValue('f_sanEmail', returnSan.email);
                setInputValue('f_sanContact', returnSan.contact);
                renderReturnSanAssetRows('sanitization', returnSan.assets || []);
                setDateField('f_sanDate', 'f_sanDate_text', returnSan.todayIso, false);

                applyReturnSanitizationSignatureDefaults(returnSan);
                const isTestDevice = currentFormType.includes('_test');
                updateRemarksDropdowns(isTestDevice, true);
                setReturnPrintMode(currentReturnPrintMode, true);
                if (typeof markPrintPreparationDirty === 'function') {
                    markPrintPreparationDirty();
                }
                updatePrintDocumentTitle();
                captureFormDirtyBaseline();
                if (typeof syncAccountabilityApprovedByVisibility === 'function') {
                    syncAccountabilityApprovedByVisibility();
                }
            }


            function applyReturnSanitizationSignatureDefaults(returnSan = {}) {
                const requestedAssetManager = sanitizeCellValue(returnSan.assetManagerName);
                const assetManagerName = requestedAssetManager
                    ? resolveSignerRosterSelection('issued', requestedAssetManager)
                    : getSignerRosterDefaultName('issued');
                const returneeName = sanitizeCellValue(returnSan.name);
                const resolvedReturneeName = returneeName && returneeName !== 'N/A'
                    ? returneeName
                    : DEFAULT_SANITIZATION_RETURNEE_NAME;

                setInputValue('f_retEmployeeSigName', resolvedReturneeName);
                setInputValue('f_retEmployeeSigRole', DEFAULT_RETURN_EMPLOYEE_POS);
                setInputValue('f_retITSig', assetManagerName);
                setInputValue('f_retITRole', DEFAULT_RETURN_IT_POS);

                setInputValue('f_sanReturneeName', resolvedReturneeName);
                setInputValue('f_sanReturneeRole', DEFAULT_SANITIZATION_RETURNEE_POS);
                setInputValue('f_sanTechSupportName', getSignerRosterDefaultName('technical_support'));
                setInputValue('f_sanTechSupportRole', DEFAULT_SANITIZATION_TECH_SUPPORT_POS);
                setInputValue('sanInfoSecName', getSignerRosterDefaultName('infosec'));
                setInputValue('f_sanInfoSecRole', DEFAULT_SANITIZATION_INFOSEC_POS);
                setInputValue('sanAssetManager', assetManagerName);
                setInputValue('f_sanAssetManagerRole', DEFAULT_RETURN_IT_POS);
                setInputValue('f_sanLeadName', getSignerRosterDefaultName('approved'));
                setInputValue('f_sanLeadRole', DEFAULT_SANITIZATION_LEAD_POS);
            }


            function renderReturnSanAssetRows(formKey, assets) {
                const tbodyId = formKey === 'return' ? 'returnDetailsBody' : 'sanitizationDetailsBody';
                const prefix = formKey === 'return' ? 'ret' : 'san';
                const tbody = document.getElementById(tbodyId);
                if (!tbody) {
                    return;
                }

                const normalizedAssets = assets.length
                    ? assets
                    : [{ assetTag: '', description: '', serial: '', remarks: '' }];
                const displayRowCount = Math.max(4, normalizedAssets.length);
                const fragment = document.createDocumentFragment();

                for (let rowIndex = 0; rowIndex < displayRowCount; rowIndex += 1) {
                    const asset = normalizedAssets[rowIndex] || { assetTag: '', description: '', serial: '', remarks: '' };
                    const isPrimaryRow = rowIndex === 0;
                    const isEmptyRow = rowIndex >= normalizedAssets.length;
                    const row = document.createElement('tr');
                    if (isEmptyRow) {
                        row.className = 'empty-row';
                    }

                    if (formKey === 'sanitization') {
                        row.innerHTML = `
                            <td class="center-text">
                                ${isPrimaryRow
                                    ? `<input type="text" id="f_${prefix}Tag" class="editable-input center-text">`
                                    : '<input type="text" class="editable-input center-text return-san-asset-field return-san-asset-tag">'}
                            </td>
                            <td class="center-text">
                                ${isPrimaryRow
                                    ? `<textarea id="f_${prefix}Desc" class="editable-input auto-resize center-text ncs-description-field" rows="1"></textarea>`
                                    : '<textarea class="editable-input auto-resize center-text ncs-description-field return-san-asset-field return-san-asset-desc" rows="1"></textarea>'}
                            </td>
                            <td class="center-text">
                                ${isPrimaryRow
                                    ? `<input type="text" id="f_${prefix}Serial" class="editable-input center-text">`
                                    : '<input type="text" class="editable-input center-text return-san-asset-field return-san-asset-serial">'}
                            </td>
                            <td class="center-text">
                                ${buildReturnSanRemarksComboboxMarkup(prefix, rowIndex, isPrimaryRow)}
                            </td>
                            ${buildReturnSanConditionCellsMarkup(rowIndex, formKey)}
                        `;
                    } else {
                        row.innerHTML = `
                            <td class="center-text">
                                ${isPrimaryRow
                                    ? `<input type="text" id="f_${prefix}Tag" class="editable-input center-text">`
                                    : '<input type="text" class="editable-input center-text return-san-asset-field return-san-asset-tag">'}
                            </td>
                            <td class="center-text">
                                ${isPrimaryRow
                                    ? `<textarea id="f_${prefix}Desc" class="editable-input auto-resize center-text ncs-description-field" rows="1"></textarea>`
                                    : '<textarea class="editable-input auto-resize center-text ncs-description-field return-san-asset-field return-san-asset-desc" rows="1"></textarea>'}
                            </td>
                            <td class="center-text">
                                ${isPrimaryRow
                                    ? `<input type="text" id="f_${prefix}Serial" class="editable-input center-text">`
                                    : '<input type="text" class="editable-input center-text return-san-asset-field return-san-asset-serial">'}
                            </td>
                            <td class="center-text">
                                ${buildReturnSanRemarksComboboxMarkup(prefix, rowIndex, isPrimaryRow)}
                            </td>
                            ${buildReturnSanConditionCellsMarkup(rowIndex, formKey)}
                        `;
                    }

                const cells = row.querySelectorAll('td');
                if (isPrimaryRow) {
                    const primaryTagField = row.querySelector(`#f_${prefix}Tag`);
                    if (primaryTagField) {
                        primaryTagField.value = asset.assetTag || '';
                    }
                    const primaryDescField = row.querySelector(`#f_${prefix}Desc`);
                    if (primaryDescField) {
                        primaryDescField.value = asset.description || '';
                    }
                    const primarySerialField = row.querySelector(`#f_${prefix}Serial`);
                    if (primarySerialField) {
                        primarySerialField.value = asset.serial || '';
                    }
                    const remarksField = row.querySelector(`#f_${prefix}Remarks`);
                    if (remarksField) {
                        remarksField.value = asset.remarks || '';
                    }
                } else {
                    const tagField = row.querySelector('.return-san-asset-tag');
                    if (tagField) {
                        tagField.value = asset.assetTag || '';
                    }
                    const descField = row.querySelector('.return-san-asset-desc');
                    if (descField) {
                        descField.value = asset.description || '';
                    }
                    const serialField = row.querySelector('.return-san-asset-serial');
                    if (serialField) {
                        serialField.value = asset.serial || '';
                    }
                    const remarksField = row.querySelector('.return-san-extra-remarks');
                    if (remarksField) {
                        remarksField.value = asset.remarks || '';
                    }
                }

                    fragment.appendChild(row);
                }

                tbody.replaceChildren(fragment);
                updateRemarksDropdowns(currentFormType.includes('_test'), false);
                bindComboboxes(tbody);
                bindTextareaAutoResize(tbody);
                if (typeof markPrintPreparationDirty === 'function') {
                    markPrintPreparationDirty();
                }
                }


            function buildReturnSanRemarksComboboxMarkup(prefix, rowIndex, isPrimaryRow) {
                const suffix = isPrimaryRow ? '' : `_${rowIndex + 1}`;
                const remarksId = `f_${prefix}Remarks${suffix}`;
                const wrapperId = isPrimaryRow && prefix === 'san' ? ' id="f_sanRemarksCombobox"' : '';
                const extraRemarksClass = isPrimaryRow ? '' : ' return-san-extra-remarks';

                return `<div class="combobox-wrapper return-san-remarks-combobox"${wrapperId}>
                    <textarea id="${remarksId}" class="editable-textarea auto-resize center-text${extraRemarksClass}" rows="1"></textarea>
                    <button type="button" class="combobox-toggle" data-target="${remarksId}">&#9660;</button>
                    <div class="combobox-options return-san-remarks-options" id="${remarksId}_options"></div>
                </div>`;
            }


            function buildReturnSanConditionCellsMarkup(rowIndex, formKey) {
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


            function renderAccountabilityAssetRows(assets) {
                const tbody = document.getElementById('accountabilityDetailsBody');
                if (!tbody) {
                    return;
                }

                const hasPopulatedAssets = assets.length > 0;
                const accountabilityForm = document.getElementById('accountabilityForm');
                if (accountabilityForm) {
                    accountabilityForm.dataset.assetCount = String(hasPopulatedAssets ? assets.length : 0);
                }

                const normalizedAssets = assets.length
                    ? assets.map((asset) => ({
                        ...asset,
                        setupDate: getAccountabilitySetupDateOrToday(asset.setupDate),
                        remarks: sanitizeCellValue(asset.remarks) || getAccountabilityRemarksDefault(asset.description)
                    }))
                    : [{
                        particulars: 'Laptop',
                        assetTag: '',
                        description: '',
                        serial: '',
                        setupDate: getAccountabilitySetupDateOrToday(''),
                        remarks: ''
                    }];

                const fragment = document.createDocumentFragment();
                normalizedAssets.forEach((asset, index) => {
                    fragment.appendChild(index === 0
                        ? buildPrimaryAccountabilityRow(asset, index, hasPopulatedAssets)
                        : buildSecondaryAccountabilityRow(asset, index, hasPopulatedAssets));
                });
                fragment.appendChild(buildAccountabilityEmptyRow());

                tbody.replaceChildren(fragment);
                setDateField('f_setupDate', 'f_setupDate_text', getAccountabilitySetupDateOrToday(normalizedAssets[0].setupDate), true);
                updateRemarksDropdowns(false, false);
                bindComboboxes(tbody);
                bindDateInputs(tbody);
                bindTextareaAutoResize(tbody);
                if (typeof markPrintPreparationDirty === 'function') {
                    markPrintPreparationDirty();
                }
            }


            function buildPrimaryAccountabilityRow(asset, rowIndex, showDelete) {
                const row = document.createElement('tr');
                row.id = 'accountabilityPrimaryRow';
                row.innerHTML = `
                    <td class="center-text bordered-bottom">
                        <div class="accountability-row-qty">
                            <span>1</span>
                        </div>
                    </td>
                    <td class="center-text bordered-bottom" id="f_eqType"></td>
                    <td class="center-text bordered-bottom" id="f_assetTag"></td>
                    <td class="bordered-bottom center-text" id="f_model"></td>
                    <td class="center-text bordered-bottom" id="f_serialNum"></td>
                    <td class="bordered-bottom center-text">
                        <div class="custom-date-wrapper">
                            <textarea id="f_setupDate_text" class="editable-textarea auto-resize center-text custom-date-text" rows="1"></textarea>
                            <input type="date" id="f_setupDate" class="editable-input center-text custom-date-native">
                        </div>
                    </td>
                    <td class="bordered-bottom center-text">
                        <div class="combobox-wrapper">
                            <textarea id="f_remarks" class="editable-textarea auto-resize center-text" rows="1"></textarea>
                            <button type="button" class="combobox-toggle" data-target="f_remarks">&#9660;</button>
                            <div class="combobox-options" id="f_remarks_options"></div>
                        </div>
                    </td>
                `;

                row.querySelector('#f_eqType').textContent = asset.particulars || 'Laptop';
                row.querySelector('#f_assetTag').textContent = asset.assetTag || '';
                row.querySelector('#f_model').textContent = asset.description || '';
                row.querySelector('#f_serialNum').textContent = asset.serial || '';
                row.querySelector('#f_remarks').value = asset.remarks || getAccountabilityRemarksDefault(asset.description);

                if (showDelete) {
                    attachAccountabilityDeleteButton(row.querySelector('.accountability-row-qty'), rowIndex);
                }

                return row;
            }


            function getAccountabilitySetupDateOrToday(value) {
                return sanitizeCellValue(value) || getTodayDateInfo().iso;
            }


            function buildSecondaryAccountabilityRow(asset, rowIndex, showDelete) {
                const row = document.createElement('tr');
                row.className = 'accountability-extra-row';
                row.innerHTML = `
                    <td class="center-text bordered-bottom">
                        <div class="accountability-row-qty">
                            <span>1</span>
                        </div>
                    </td>
                    <td class="center-text bordered-bottom"></td>
                    <td class="center-text bordered-bottom"></td>
                    <td class="bordered-bottom center-text"></td>
                    <td class="center-text bordered-bottom"></td>
                    <td class="bordered-bottom center-text"><input type="text" class="editable-input center-text accountability-extra-date"></td>
                    <td class="bordered-bottom center-text"><textarea class="editable-textarea auto-resize center-text accountability-extra-remarks" rows="1"></textarea></td>
                `;

                const cells = row.querySelectorAll('td');
                cells[1].textContent = asset.particulars || 'Laptop';
                cells[2].textContent = asset.assetTag || '';
                cells[3].textContent = asset.description || '';
                cells[4].textContent = asset.serial || '';

                const dateInput = row.querySelector('.accountability-extra-date');
                if (dateInput) {
                    dateInput.value = formatAccountabilitySetupDateForDisplay(asset.setupDate);
                }

                const remarksInput = row.querySelector('.accountability-extra-remarks');
                if (remarksInput) {
                    remarksInput.value = asset.remarks || getAccountabilityRemarksDefault(asset.description);
                }

                if (showDelete) {
                    attachAccountabilityDeleteButton(row.querySelector('.accountability-row-qty'), rowIndex);
                }

                return row;
            }


            function buildAccountabilityEmptyRow() {
                const row = document.createElement('tr');
                row.className = 'empty-row';
                row.id = 'accountabilityEmptyRow';
                row.innerHTML = `
                    <td class="bordered-bottom"></td>
                    <td class="bordered-bottom"></td>
                    <td class="bordered-bottom"></td>
                    <td class="bordered-bottom"></td>
                    <td class="bordered-bottom"></td>
                    <td class="bordered-bottom"></td>
                    <td class="bordered-bottom"></td>
                `;
                return row;
            }


            function attachAccountabilityDeleteButton(container, rowIndex) {
                if (!container) {
                    return;
                }

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'accountability-row-delete hide-print';
                button.setAttribute('aria-label', `Delete asset row ${rowIndex + 1}`);
                button.innerHTML = '<i class="fa-solid fa-trash"></i>';
                button.addEventListener('click', () => {
                    removeAccountabilityAssetRow(rowIndex);
                });
                container.appendChild(button);
            }


            function removeAccountabilityAssetRow(rowIndex) {
                const assets = serializeAccountabilityAssetRows();
                if (!assets.length || rowIndex < 0 || rowIndex >= assets.length) {
                    return;
                }

                assets.splice(rowIndex, 1);
                renderAccountabilityAssetRows(assets);
                updatePrintDocumentTitle();
            }


            function serializeAccountabilityAssetRows() {
                const tbody = document.getElementById('accountabilityDetailsBody');
                if (!tbody) {
                    return [];
                }

                return Array.from(tbody.querySelectorAll('tr'))
                    .filter((row) => !row.classList.contains('empty-row'))
                    .map((row, rowIndex) => {
                        if (rowIndex === 0) {
                            return {
                                particulars: sanitizeCellValue(getDisplayValue('f_eqType')) || 'Laptop',
                                assetTag: sanitizeCellValue(getDisplayValue('f_assetTag')),
                                description: sanitizeCellValue(getDisplayValue('f_model')),
                                serial: sanitizeCellValue(getDisplayValue('f_serialNum')),
                                setupDate: sanitizeCellValue(document.getElementById('f_setupDate') ? document.getElementById('f_setupDate').value : ''),
                                remarks: sanitizeCellValue(getDisplayValue('f_remarks'))
                            };
                        }

                        const cells = row.querySelectorAll('td');
                        return {
                            particulars: sanitizeCellValue(cells[1] ? cells[1].textContent : '') || 'Laptop',
                            assetTag: sanitizeCellValue(cells[2] ? cells[2].textContent : ''),
                            description: sanitizeCellValue(cells[3] ? cells[3].textContent : ''),
                            serial: sanitizeCellValue(cells[4] ? cells[4].textContent : ''),
                            setupDate: coerceDateToIso(sanitizeCellValue(row.querySelector('.accountability-extra-date') ? row.querySelector('.accountability-extra-date').value : '')),
                            remarks: sanitizeCellValue(row.querySelector('.accountability-extra-remarks') ? row.querySelector('.accountability-extra-remarks').value : '')
                        };
                    })
                    .filter((asset) => asset.assetTag || asset.description || asset.serial || asset.setupDate || asset.remarks);
            }


            function buildTestDeviceAccountabilityDeviceEntry(assignmentRow, deviceRow, searchedAssetValue) {
                const searchedAssetTag = hasLegacyAssetTagPrefix(searchedAssetValue) || isLikelyTestDeviceAssetTag(searchedAssetValue)
                    ? formatTestDeviceAutofillAssetTag(searchedAssetValue)
                    : '';
                const resolvedAssetTag = searchedAssetTag ||
                    getFieldValue(assignmentRow, 'assetTag', { testDevice: true }) ||
                    getFieldValue(deviceRow, 'assetTag', { testDevice: true }) ||
                    'N/A';

                return {
                    assetTag: resolvedAssetTag,
                    model: getFieldValue(deviceRow, 'description') || getFieldValue(assignmentRow, 'description') || 'N/A',
                    serial: getFieldValue(deviceRow, 'serial') || getFieldValue(assignmentRow, 'serial') || 'N/A',
                    imei: getFieldValue(deviceRow, 'imei') || getFieldValue(assignmentRow, 'imei')
                };
            }


            function getTestDeviceDetailRowSuffix(rowIndex) {
                return rowIndex === 1 ? '' : `_${rowIndex}`;
            }


            function getTestDeviceDetailFieldIds(rowIndex) {
                const suffix = getTestDeviceDetailRowSuffix(rowIndex);

                return {
                    assetTagId: `f_tdaAssetTag${suffix}`,
                    modelId: `f_tdaModel${suffix}`,
                    serialId: `f_tdaSerial${suffix}`,
                    imeiId: `f_tdaImei${suffix}`,
                    dateTextId: `f_tdaDate_text${suffix}`,
                    dateId: `f_tdaDate${suffix}`,
                    signatureId: `f_tdaEmployeeSignature${suffix}`,
                    remarksId: `f_tdaProjectRemarks${suffix}`,
                    remarksOptionsId: `f_tdaProjectRemarks${suffix}_options`
                };
            }


            function syncTestDeviceAssetTags(assetTags) {
                const tags = Array.isArray(assetTags) ? assetTags.map((value) => sanitizeCellValue(value)).filter(Boolean) : [];
                setInputValue('f_tdaAssetTag', tags[0] || '');

                const list = document.getElementById('f_tdaAssetTagList');
                if (!list) {
                    return;
                }

                const items = [];
                tags.slice(1).forEach((assetTag) => {
                    const item = document.createElement('div');
                    item.className = 'tda-asset-tag-line';
                    item.textContent = assetTag;
                    items.push(item);
                });
                list.replaceChildren(...items);
                list.hidden = tags.length <= 1;
            }


            function buildTestDeviceAccountabilityDetailRow(rowIndex) {
                const row = document.createElement('tr');
                const rowIds = getTestDeviceDetailFieldIds(rowIndex);
                row.id = rowIndex === 1 ? 'f_tdaPrimaryDeviceRow' : `f_tdaDeviceRow_${rowIndex}`;
                row.className = rowIndex === 1 ? 'tda-device-row tda-device-primary-row' : 'tda-device-row tda-device-extra-row';
                row.dataset.deviceIndex = String(rowIndex);
                row.innerHTML = `
                    <td class="center-text bordered-bottom">${rowIndex}</td>
                    <td class="center-text bordered-bottom">TEST DEVICE</td>
                    <td class="center-text bordered-bottom">
                        <input type="text" id="${rowIds.assetTagId}" class="editable-input center-text">
                    </td>
                    <td class="center-text bordered-bottom">
                        <textarea id="${rowIds.modelId}" class="editable-input auto-resize center-text ncs-description-field" rows="1"></textarea>
                    </td>
                    <td class="center-text bordered-bottom">
                        <input type="text" id="${rowIds.serialId}" class="editable-input center-text">
                    </td>
                    <td class="center-text bordered-bottom">
                        <input type="text" id="${rowIds.imeiId}" class="editable-input center-text">
                    </td>
                    <td class="bordered-bottom center-text">
                        <div class="custom-date-wrapper">
                            <input type="text" id="${rowIds.dateTextId}"
                                class="editable-input center-text custom-date-text inline-date-input">
                            <input type="date" id="${rowIds.dateId}"
                                class="editable-input center-text custom-date-native inline-date-input">
                        </div>
                        <div class="ncs-hidden-meta">
                            <input type="text" id="${rowIds.signatureId}" class="editable-input center-text">
                            <div class="combobox-wrapper">
                                <textarea id="${rowIds.remarksId}"
                                    class="editable-textarea auto-resize center-text tda-project-remarks"
                                    rows="2"></textarea>
                                <button type="button" class="combobox-toggle"
                                    data-target="${rowIds.remarksId}">&#9660;</button>
                                <div class="combobox-options tda-project-remarks-options"
                                    id="${rowIds.remarksOptionsId}"></div>
                            </div>
                        </div>
                    </td>
                `;
                return row;
            }


            function populateTestDeviceDetailRow(entry, rowIndex, options) {
                const rowIds = getTestDeviceDetailFieldIds(rowIndex);
                const includeSignature = Boolean(options && options.includeSignature);
                const employeeName = sanitizeCellValue(options && options.employeeName) === 'N/A'
                    ? ''
                    : sanitizeCellValue(options && options.employeeName);
                const rowDateIso = getTodayDateInfo().iso;

                setInputValue(rowIds.assetTagId, entry.assetTag || 'N/A');
                setInputValue(rowIds.modelId, entry.model || 'N/A');
                setInputValue(rowIds.serialId, entry.serial || 'N/A');
                setInputValue(rowIds.imeiId, entry.imei || 'N/A');
                setDateField(rowIds.dateId, rowIds.dateTextId, rowDateIso, false);
                setInputValue(rowIds.remarksId, '');

                if (includeSignature) {
                    setInputValue(rowIds.signatureId, employeeName);
                }
            }


            function renderTestDeviceAccountabilityDetailRows(deviceEntries, options) {
                const tbody = document.getElementById('f_tdaDetailsBody');
                const primaryRow = document.getElementById('f_tdaPrimaryDeviceRow');
                const emptyRow = document.getElementById('f_tdaDeviceEmptyRow');
                if (!tbody || !primaryRow || !emptyRow) {
                    return;
                }

                const normalizedEntries = Array.isArray(deviceEntries) ? deviceEntries.filter(Boolean) : [];
                const extraRows = normalizedEntries.slice(1).map((_, index) => buildTestDeviceAccountabilityDetailRow(index + 2));

                tbody.replaceChildren(primaryRow, ...extraRows, emptyRow);
                refreshTestDeviceProjectRemarksOptions();
                bindDateInputs(tbody);
                bindTextareaAutoResize(tbody);
                bindComboboxes(tbody);
                if (typeof markPrintPreparationDirty === 'function') {
                    markPrintPreparationDirty();
                }

                if (!normalizedEntries.length) {
                    return;
                }

                normalizedEntries.forEach((entry, index) => {
                    populateTestDeviceDetailRow(entry, index + 1, options);
                });
            }


            function getTestDeviceAccountabilityEmployeeDetails(row) {
                return {
                    name: getFieldValue(row, 'employeeName') || 'N/A',
                    employeeId: sanitizeEmployeeIdForPrint(getFieldValue(row, 'employeeId')),
                    position: getFieldValue(row, 'position'),
                    businessUnit: getFieldValue(row, 'businessUnit')
                };
            }


            function applyTestDeviceAccountabilityEmployeeDetails(details) {
                setInputValue('f_tdaEmpName', details.name);
                setInputValue('f_tdaEmpId', details.employeeId);
                setInputValue('f_tdaPosition', details.position);
                setInputValue('f_tdaBusinessUnit', details.businessUnit);
                setInputValue('f_tdaEmployeeSignature', details.name === 'N/A' ? '' : details.name);
                setInputValue('f_tdaEmployeePrintName', details.name === 'N/A' ? '' : details.name);
                setInputValue('f_tdaCostCenter', details.position);
            }


            function fillTestDeviceAccountabilityDevice(row) {
                const deviceEntry = buildTestDeviceAccountabilityDeviceEntry(row, row, getFieldValue(row, 'assetTag'));

                clearTestDeviceAccountabilityDeviceFields();
                syncTestDeviceAssetTags([deviceEntry.assetTag]);
                renderTestDeviceAccountabilityDetailRows([deviceEntry], {
                    includeSignature: false
                });
                updatePrintDocumentTitle();
            }


            function fillTestDeviceAccountabilityDevices(deviceEntries, employeeRow) {
                const normalizedEntries = Array.isArray(deviceEntries) ? deviceEntries.filter(Boolean) : [];
                const employeeDetails = employeeRow ? getTestDeviceAccountabilityEmployeeDetails(employeeRow) : null;

                clearTestDeviceAccountabilityDeviceFields();
                if (employeeDetails) {
                    clearTestDeviceAccountabilityEmployeeFields();
                }

                syncTestDeviceAssetTags(normalizedEntries.map((entry) => entry.assetTag));
                renderTestDeviceAccountabilityDetailRows(normalizedEntries, {
                    includeSignature: Boolean(employeeDetails),
                    employeeName: employeeDetails ? employeeDetails.name : ''
                });

                if (employeeDetails) {
                    applyTestDeviceAccountabilityEmployeeDetails(employeeDetails);
                }

                updatePrintDocumentTitle();
                captureFormDirtyBaseline();
            }


            function fillTestDeviceAccountabilityCombined(assignmentRow, deviceRow, employeeRow, searchedAssetValue) {
                const deviceEntry = buildTestDeviceAccountabilityDeviceEntry(assignmentRow, deviceRow, searchedAssetValue);
                fillTestDeviceAccountabilityDevices([deviceEntry], employeeRow);
            }


            function fillTestDeviceAccountabilityEmployee(row) {
                const employeeDetails = getTestDeviceAccountabilityEmployeeDetails(row);

                applyTestDeviceAccountabilityEmployeeDetails(employeeDetails);
                updatePrintDocumentTitle();
                captureFormDirtyBaseline();
            }


            function clearTestDeviceAccountabilityDeviceFields() {
                renderTestDeviceAccountabilityDetailRows([], {
                    includeSignature: false
                });
                syncTestDeviceAssetTags([]);
                ['f_tdaAssetTag', 'f_tdaModel', 'f_tdaSerial', 'f_tdaImei'].forEach((id) => {
                    setInputValue(id, '');
                });
                setInputValue('f_tdaProjectRemarks', '');
                const tdaProject = document.getElementById('f_tdaProject');
                const tdaRemarks = document.getElementById('f_tdaRemarks');
                if (tdaProject) tdaProject.value = '';
                if (tdaRemarks) tdaRemarks.value = '';
                setDateField('f_tdaDate', 'f_tdaDate_text', getTodayDateInfo().iso, false);
                updatePrintDocumentTitle();
            }


            function clearTestDeviceAccountabilityEmployeeFields() {
                ['f_tdaEmpName', 'f_tdaEmpId', 'f_tdaPosition', 'f_tdaBusinessUnit'].forEach((id) => {
                    setInputValue(id, '');
                });
                ['f_tdaEmployeeSignature', 'f_tdaEmployeePrintName', 'f_tdaCostCenter'].forEach((id) => {
                    setInputValue(id, '');
                });
                updatePrintDocumentTitle();
            }


            function bindTestDeviceLookupInput(input) {
                if (!input || input.dataset.testDeviceLookupBound === 'true') {
                    return;
                }

                input.dataset.testDeviceLookupBound = 'true';
                input.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        handleTestDeviceAutofill();
                    }
                });
            }


            function removeTestDeviceLookupRow(input) {
                if (!input || input === elements.tdaAssetSearchInput) {
                    return;
                }

                const row = input.closest('.tda-asset-search-row');
                const rowIndex = testDeviceLookupInputs.indexOf(input);
                if (rowIndex === -1) {
                    return;
                }

                testDeviceLookupInputs.splice(rowIndex, 1);
                if (row) {
                    row.remove();
                }

                const nextFocus = testDeviceLookupInputs[rowIndex] || testDeviceLookupInputs[rowIndex - 1] || elements.tdaAssetSearchInput;
                if (nextFocus && typeof nextFocus.focus === 'function') {
                    nextFocus.focus();
                }
            }


            function createTestDeviceLookupRow(value) {
                const row = document.createElement('div');
                row.className = 'search-box tda-asset-search-row tda-asset-search-row-extra';

                const icon = document.createElement('i');
                icon.className = 'fa-solid fa-mobile-screen-button search-icon';

                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'test-device-asset-search-input';
                input.placeholder = 'Enter TD Asset Tag, Serial No, or IMEI';
                input.value = value || '';

                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'btn btn-icon tda-delete-btn hide-print';
                deleteButton.title = 'Delete test device lookup';
                deleteButton.setAttribute('aria-label', 'Delete test device lookup');
                deleteButton.innerHTML = '<i class="fa-solid fa-trash"></i>';
                deleteButton.addEventListener('click', () => {
                    removeTestDeviceLookupRow(input);
                });

                row.appendChild(icon);
                row.appendChild(input);
                row.appendChild(deleteButton);
                bindTestDeviceLookupInput(input);

                return { row, input };
            }


            function appendTestDeviceLookupRow(value) {
                const container = elements.tdaAssetSearchRows;
                if (!container) {
                    return null;
                }

                const nextRow = createTestDeviceLookupRow(value || '');
                container.appendChild(nextRow.row);
                testDeviceLookupInputs.push(nextRow.input);
                return nextRow.input;
            }


            function resetTestDeviceLookupRows() {
                testDeviceLookupInputs.length = 0;
                const firstRow = elements.tdaAssetSearchInput ? elements.tdaAssetSearchInput.closest('.tda-asset-search-row') : null;

                if (elements.tdaAssetSearchRows && firstRow) {
                    Array.from(elements.tdaAssetSearchRows.querySelectorAll('.tda-asset-search-row')).forEach((row) => {
                        if (row !== firstRow) {
                            row.remove();
                        }
                    });
                }

                if (elements.tdaAssetSearchInput) {
                    elements.tdaAssetSearchInput.value = '';
                    bindTestDeviceLookupInput(elements.tdaAssetSearchInput);
                    testDeviceLookupInputs.push(elements.tdaAssetSearchInput);
                }
            }


            function getTestDeviceLookupValues() {
                return testDeviceLookupInputs
                    .map((input) => sanitizeCellValue(input ? input.value : ''))
                    .filter(Boolean);
            }


            function resetForm() {
                renderAccountabilityAssetRows([]);
                renderReturnSanAssetRows('return', []);
                renderReturnSanAssetRows('sanitization', []);

                [
                    'f_refNo', 'f_empName', 'f_empId', 'f_position',
                    'f_assetTag', 'f_model', 'f_serialNum'
                ].forEach((id) => {
                    setTextContent(id, '');
                });

                [
                    'f_empName', 'f_empId', 'f_position',
                    'f_tdaEmpName', 'f_tdaEmpId', 'f_tdaPosition', 'f_tdaBusinessUnit',
                    'f_sigEmpName', 'f_sigPosition', 'f_costCenter',
                    'f_remarks', 'f_retRemarks', 'f_sanRemarks',
                    'f_retStatus', 'f_sanStatus', 'f_retEmail',
                    'f_retName', 'f_retEmpNo', 'f_retBU',
                    'f_retTag', 'f_retDesc', 'f_retSerial',
                    'f_sanName', 'f_sanEmpNo', 'f_sanBU',
                    'f_sanTag', 'f_sanDesc', 'f_sanSerial',
                    'f_retContact', 'f_retITSig', 'f_sanEmail', 'f_sanContact',
                    'f_dateIssued_text', 'f_issuedDate_text', 'f_issuedName', 'f_issuedPos', 'f_approvedName', 'f_approvedPos',
                    'f_tdaCostCenter', 'f_tdaEmployeeSignature', 'f_tdaEmployeePrintName',
                    'f_tdaProjectRemarks', 'f_tdaPreparedName', 'f_tdaPreparedPos', 'f_tdaApprovedName', 'f_tdaApprovedPos',
                    'f_tdaAssetTag', 'f_tdaModel', 'f_tdaSerial', 'f_tdaImei',
                    'f_retEmployeeSigName', 'f_retEmployeeSigRole', 'f_retITRole',
                    'f_sanReturneeName', 'f_sanReturneeRole', 'f_sanTechSupportName', 'f_sanTechSupportRole',
                    'sanInfoSecName', 'f_sanInfoSecRole', 'sanAssetManager', 'f_sanAssetManagerRole',
                    'f_sanLeadName', 'f_sanLeadRole'
                ].forEach((id) => {
                    setInputValue(id, '');
                });

                // Reset native select dropdowns
                ['f_sanTestProject', 'f_sanTestRemarks'].forEach((id) => {
                    const select = document.getElementById(id);
                    if (select) select.value = '';
                });

                setDateField('f_dateIssued', 'f_dateIssued_text', '', false);
                setDateField('f_issuedDate', 'f_issuedDate_text', '', false);
                setDateField('f_setupDate', 'f_setupDate_text', getTodayDateInfo().iso, true);
                setDateField('f_retDate', 'f_retDate_text', '', false);
                setDateField('f_sanDate', 'f_sanDate_text', '', false);
                setDateField('f_tdaDate', 'f_tdaDate_text', getTodayDateInfo().iso, false);

                setInputValue(
                    'f_issuedName',
                    getSignerRosterDefaultName('issued')
                );
                setInputValue('f_issuedPos', DEFAULT_ISSUED_POS);
                setInputValue('f_approvedName', getSignerRosterDefaultName('approved'));
                setInputValue('f_approvedPos', DEFAULT_APPROVED_POS);
                setInputValue('f_tdaPreparedName', getSignerRosterDefaultName('issued'));
                setInputValue('f_tdaPreparedPos', DEFAULT_TEST_DEVICE_PREPARED_POS);
                setInputValue('f_tdaApprovedName', getSignerRosterDefaultName('approved'));
                setInputValue('f_tdaApprovedPos', DEFAULT_APPROVED_POS);
                applyReturnSanitizationSignatureDefaults();
                if (typeof clearTestDeviceAccountabilityDeviceFields === 'function') {
                    clearTestDeviceAccountabilityDeviceFields();
                }
                if (typeof resetTestDeviceLookupRows === 'function') {
                    resetTestDeviceLookupRows();
                } else if (elements.tdaAssetSearchInput) {
                    elements.tdaAssetSearchInput.value = '';
                }
                if (elements.tdaEmployeeSearchInput) {
                    elements.tdaEmployeeSearchInput.value = '';
                }
                if (elements.accEmployeeSearchInput) {
                    elements.accEmployeeSearchInput.value = '';
                }
                if (elements.accAssetSearchInput) {
                    elements.accAssetSearchInput.value = '';
                }
                if (typeof markPrintPreparationDirty === 'function') {
                    markPrintPreparationDirty();
                }
                updatePrintDocumentTitle();
                syncSearchHeaderOverflow();
                captureFormDirtyBaseline();
                syncSourceStatusPanel();
            }

        Object.assign(scope, {
        bindFormSelection,
        bindFormSelectorDropdown,
        closeFormSelectorDropdowns,
        applyReturnAndSanitizationLayout,
        applyReturnSanitizationSignatureDefaults,
        bindComboboxes,
        bindMirroredFields,
        mirrorInputValue,
        bindDateInputs,
        bindTextareaAutoResize,
        syncSearchPanelVisibility,
        updateSearchInputPlaceholder,
        syncSearchHeaderOverflow,
        updateRemarksDropdowns,
        getAccountabilityRemarksDefault,
        refreshTestDeviceProjectRemarksOptions,
        setComboboxOptions,
        buildReturnSanRemarksComboboxMarkup,
        fillForm,
        renderReturnSanAssetRows,
        renderAccountabilityAssetRows,
        buildPrimaryAccountabilityRow,
        getAccountabilitySetupDateOrToday,
        buildSecondaryAccountabilityRow,
        buildAccountabilityEmptyRow,
        attachAccountabilityDeleteButton,
        removeAccountabilityAssetRow,
        serializeAccountabilityAssetRows,
        buildTestDeviceAccountabilityDeviceEntry,
        getTestDeviceDetailRowSuffix,
        getTestDeviceDetailFieldIds,
        syncTestDeviceAssetTags,
        buildTestDeviceAccountabilityDetailRow,
        populateTestDeviceDetailRow,
        renderTestDeviceAccountabilityDetailRows,
        getTestDeviceAccountabilityEmployeeDetails,
        applyTestDeviceAccountabilityEmployeeDetails,
        fillTestDeviceAccountabilityDevice,
        fillTestDeviceAccountabilityDevices,
        fillTestDeviceAccountabilityCombined,
        fillTestDeviceAccountabilityEmployee,
        clearTestDeviceAccountabilityDeviceFields,
        clearTestDeviceAccountabilityEmployeeFields,
        bindTestDeviceLookupInput,
        removeTestDeviceLookupRow,
        createTestDeviceLookupRow,
        appendTestDeviceLookupRow,
        resetTestDeviceLookupRows,
        getTestDeviceLookupValues,
        resetForm
        });
        Object.assign(App, {
        bindFormSelection,
        bindFormSelectorDropdown,
        closeFormSelectorDropdowns,
        applyReturnAndSanitizationLayout,
        applyReturnSanitizationSignatureDefaults,
        bindComboboxes,
        bindMirroredFields,
        mirrorInputValue,
        bindDateInputs,
        bindTextareaAutoResize,
        syncSearchPanelVisibility,
        updateSearchInputPlaceholder,
        syncSearchHeaderOverflow,
        updateRemarksDropdowns,
        getAccountabilityRemarksDefault,
        refreshTestDeviceProjectRemarksOptions,
        setComboboxOptions,
        buildReturnSanRemarksComboboxMarkup,
        fillForm,
        renderReturnSanAssetRows,
        renderAccountabilityAssetRows,
        buildPrimaryAccountabilityRow,
        getAccountabilitySetupDateOrToday,
        buildSecondaryAccountabilityRow,
        buildAccountabilityEmptyRow,
        attachAccountabilityDeleteButton,
        removeAccountabilityAssetRow,
        serializeAccountabilityAssetRows,
        buildTestDeviceAccountabilityDeviceEntry,
        getTestDeviceDetailRowSuffix,
        getTestDeviceDetailFieldIds,
        syncTestDeviceAssetTags,
        buildTestDeviceAccountabilityDetailRow,
        populateTestDeviceDetailRow,
        renderTestDeviceAccountabilityDetailRows,
        getTestDeviceAccountabilityEmployeeDetails,
        applyTestDeviceAccountabilityEmployeeDetails,
        fillTestDeviceAccountabilityDevice,
        fillTestDeviceAccountabilityDevices,
        fillTestDeviceAccountabilityCombined,
        fillTestDeviceAccountabilityEmployee,
        clearTestDeviceAccountabilityDeviceFields,
        clearTestDeviceAccountabilityEmployeeFields,
        bindTestDeviceLookupInput,
        removeTestDeviceLookupRow,
        createTestDeviceLookupRow,
        appendTestDeviceLookupRow,
        resetTestDeviceLookupRows,
        getTestDeviceLookupValues,
        resetForm
        });
    }
})();
