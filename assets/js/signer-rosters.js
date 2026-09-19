(function () {
    const App = window.YonduApp;
    const scope = App.scope;

    with (scope) {
        let signerRosterState = null;
        let signerPickerEventsBound = false;
        const signerPickerBindings = new Map();

        function getSignerRosterDefinition(rosterKey) {
            return SIGNER_ROSTERS[rosterKey] || null;
        }

        function getSignerRosterDefaultName(rosterKey) {
            const roster = loadSignerRosterState()[rosterKey];
            return roster ? roster.defaultName : '';
        }

        function sanitizeSignerRosterNames(rosterKey, names) {
            const definition = getSignerRosterDefinition(rosterKey);
            if (!definition) {
                return [];
            }

            const uniqueNames = [];
            const seenNames = new Set();
            const sourceNames = Array.isArray(names) ? names : definition.seedNames;

            for (const name of sourceNames) {
                const cleanName = sanitizeCellValue(name);
                const normalizedName = normalizePersonName(cleanName);
                if (!cleanName || !normalizedName || seenNames.has(normalizedName)) {
                    continue;
                }

                seenNames.add(normalizedName);
                uniqueNames.push(cleanName);
            }

            return uniqueNames;
        }

        function loadSignerRosterState() {
            if (signerRosterState) {
                return signerRosterState;
            }

            let storedState = null;
            try {
                const storedValue = localStorage.getItem(SIGNER_ROSTER_STORAGE_KEY);
                storedState = storedValue ? JSON.parse(storedValue) : null;
            } catch (error) {
                console.warn('Unable to load saved signer names.', error);
            }

            signerRosterState = {};
            for (const rosterKey of Object.keys(SIGNER_ROSTERS)) {
                const definition = SIGNER_ROSTERS[rosterKey];
                const hasStoredRoster = storedState
                    && typeof storedState === 'object'
                    && Object.prototype.hasOwnProperty.call(storedState, rosterKey);
                const storedRoster = hasStoredRoster ? storedState[rosterKey] : null;
                const storedNames = Array.isArray(storedRoster)
                    ? storedRoster
                    : storedRoster && typeof storedRoster === 'object'
                        ? storedRoster.names
                        : definition.seedNames;
                const requestedDefault = storedRoster && !Array.isArray(storedRoster) && typeof storedRoster === 'object'
                    ? storedRoster.defaultName
                    : definition.defaultName;
                const names = sanitizeSignerRosterNames(rosterKey, storedNames);
                const defaultName = names.find(
                    (name) => normalizePersonName(name) === normalizePersonName(requestedDefault)
                ) || names[0] || '';

                signerRosterState[rosterKey] = { names, defaultName };
            }

            return signerRosterState;
        }

        function persistSignerRosterState() {
            try {
                localStorage.setItem(SIGNER_ROSTER_STORAGE_KEY, JSON.stringify(loadSignerRosterState()));
            } catch (error) {
                console.warn('Unable to save signer names.', error);
            }
        }

        function getSignerRosterNames(rosterKey) {
            const roster = loadSignerRosterState()[rosterKey];
            return roster && Array.isArray(roster.names) ? [...roster.names] : [];
        }

        function findSignerRosterName(rosterKey, name) {
            const normalizedName = normalizePersonName(name);
            if (!normalizedName) {
                return '';
            }

            return getSignerRosterNames(rosterKey).find(
                (candidate) => normalizePersonName(candidate) === normalizedName
            ) || '';
        }

        function resolveSignerRosterSelection(rosterKey, name) {
            return findSignerRosterName(rosterKey, name) || getSignerRosterDefaultName(rosterKey);
        }

        function addSignerRosterName(rosterKey, name) {
            const definition = getSignerRosterDefinition(rosterKey);
            const cleanName = sanitizeCellValue(name);
            if (!definition || !cleanName) {
                return { ok: false, added: false, reason: 'empty', name: '' };
            }

            const existingName = findSignerRosterName(rosterKey, cleanName);
            if (existingName) {
                return { ok: true, added: false, reason: 'duplicate', name: existingName };
            }

            const roster = loadSignerRosterState()[rosterKey];
            roster.names.push(cleanName);
            if (!roster.defaultName) {
                roster.defaultName = cleanName;
            }
            persistSignerRosterState();
            refreshSignerRosterBindings(rosterKey);
            return { ok: true, added: true, reason: '', name: cleanName };
        }

        function setSignerRosterDefaultName(rosterKey, name) {
            const roster = loadSignerRosterState()[rosterKey];
            const existingName = findSignerRosterName(rosterKey, name);
            if (!roster || !existingName) {
                return { ok: false, changed: false, reason: 'missing', name: '' };
            }

            const changed = normalizePersonName(roster.defaultName) !== normalizePersonName(existingName);
            roster.defaultName = existingName;
            persistSignerRosterState();
            refreshSignerRosterBindings(rosterKey);
            return { ok: true, changed, reason: '', name: existingName };
        }

        function deleteSignerRosterName(rosterKey, name) {
            const roster = loadSignerRosterState()[rosterKey];
            const existingName = findSignerRosterName(rosterKey, name);
            if (!roster || !existingName) {
                return { ok: false, removed: false, reason: 'missing', name: '' };
            }

            const removedDefault = normalizePersonName(existingName) === normalizePersonName(roster.defaultName);
            roster.names = getSignerRosterNames(rosterKey).filter(
                (candidate) => normalizePersonName(candidate) !== normalizePersonName(existingName)
            );
            if (removedDefault) {
                roster.defaultName = roster.names[0] || '';
            }
            persistSignerRosterState();

            for (const binding of signerPickerBindings.values()) {
                if (binding.rosterKey !== rosterKey) {
                    continue;
                }

                if (normalizePersonName(binding.field.value) === normalizePersonName(existingName)) {
                    setSignerPickerFieldValue(binding, roster.defaultName, true);
                }
            }

            refreshSignerRosterBindings(rosterKey);
            return {
                ok: true,
                removed: true,
                removedDefault,
                reason: '',
                name: existingName,
                defaultName: roster.defaultName
            };
        }

        function getSignerPickerBinding(fieldOrId) {
            const field = typeof fieldOrId === 'string'
                ? document.getElementById(fieldOrId)
                : fieldOrId;
            return field?.id ? signerPickerBindings.get(field.id) || null : null;
        }

        function setSignerPickerFieldValue(binding, name, emitEvents) {
            if (!binding) {
                return '';
            }

            const cleanName = sanitizeCellValue(name);
            binding.field.value = cleanName;
            resizeTextarea(binding.field);

            if (emitEvents) {
                binding.field.dispatchEvent(new Event('input', { bubbles: true }));
                binding.field.dispatchEvent(new Event('change', { bubbles: true }));
            }

            return cleanName;
        }

        function syncSignerPickerValue(fieldOrId) {
            const binding = getSignerPickerBinding(fieldOrId);
            if (!binding) {
                return '';
            }

            const currentName = binding.field.value || '';
            resizeTextarea(binding.field);
            if (binding.wrapper.classList.contains('is-open')) {
                renderSignerPickerOptions(binding);
            }
            return currentName;
        }

        function setSignerPickerAddError(binding, message) {
            binding.addError.textContent = message || '';
            binding.addError.hidden = !message;
            binding.addInput.classList.toggle('is-invalid', Boolean(message));
        }

        function showSignerPickerAddEditor(binding) {
            binding.addButton.hidden = true;
            binding.addEditor.hidden = false;
            binding.addInput.value = '';
            setSignerPickerAddError(binding, '');
            binding.addInput.focus();
        }

        function hideSignerPickerAddEditor(binding) {
            binding.addButton.hidden = false;
            binding.addEditor.hidden = true;
            binding.addInput.value = '';
            setSignerPickerAddError(binding, '');
        }

        function commitSignerPickerName(binding) {
            const result = addSignerRosterName(binding.rosterKey, binding.addInput.value);
            if (!result.ok) {
                setSignerPickerAddError(binding, 'Enter a name first.');
                return;
            }

            setSignerPickerFieldValue(binding, result.name, true);
            closeSignerNamePicker(binding);
        }

        function renderSignerPickerOptions(binding) {
            const rosterNames = getSignerRosterNames(binding.rosterKey);
            const defaultName = getSignerRosterDefaultName(binding.rosterKey);
            const selectedName = normalizePersonName(binding.field.value);
            const optionRows = rosterNames.map((name) => {
                const isDefault = normalizePersonName(name) === normalizePersonName(defaultName);
                const optionRow = document.createElement('div');
                optionRow.className = 'signer-name-option-row';

                const optionButton = document.createElement('button');
                optionButton.type = 'button';
                optionButton.className = 'signer-name-option';
                optionButton.setAttribute('role', 'option');
                optionButton.setAttribute('aria-selected', String(normalizePersonName(name) === selectedName));

                const optionLabel = document.createElement('span');
                optionLabel.className = 'signer-name-option-label';
                optionLabel.textContent = name;
                optionButton.appendChild(optionLabel);

                if (normalizePersonName(name) === selectedName) {
                    const selectedMark = document.createElement('span');
                    selectedMark.className = 'signer-name-selected-mark';
                    selectedMark.setAttribute('aria-hidden', 'true');
                    selectedMark.textContent = '\u2713';
                    optionButton.appendChild(selectedMark);
                    optionRow.classList.add('is-selected');
                }

                optionButton.addEventListener('click', () => {
                    setSignerPickerFieldValue(binding, name, true);
                    closeSignerNamePicker(binding);
                });
                optionRow.appendChild(optionButton);

                const defaultButton = document.createElement('button');
                defaultButton.type = 'button';
                defaultButton.className = `signer-name-default${isDefault ? ' is-default' : ''}`;
                defaultButton.setAttribute(
                    'aria-label',
                    isDefault ? `${name} is the autofill default` : `Set ${name} as autofill default`
                );
                defaultButton.title = isDefault ? 'Current autofill default' : 'Set as autofill default';
                defaultButton.innerHTML = `<i class="fa-${isDefault ? 'solid' : 'regular'} fa-star" aria-hidden="true"></i>`;
                defaultButton.disabled = isDefault;
                defaultButton.addEventListener('click', () => {
                    setSignerPickerFieldValue(binding, name, true);
                    setSignerRosterDefaultName(binding.rosterKey, name);
                });
                optionRow.appendChild(defaultButton);

                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'signer-name-delete';
                deleteButton.setAttribute('aria-label', `Delete ${name}`);
                deleteButton.title = `Delete ${name}`;
                deleteButton.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
                deleteButton.addEventListener('click', () => {
                    deleteSignerRosterName(binding.rosterKey, name);
                });
                optionRow.appendChild(deleteButton);

                if (isDefault) {
                    optionRow.classList.add('is-default');
                }

                return optionRow;
            });

            if (!optionRows.length) {
                const emptyState = document.createElement('div');
                emptyState.className = 'signer-name-empty';
                emptyState.textContent = 'No saved names. Add one below.';
                optionRows.push(emptyState);
            }

            binding.options.replaceChildren(...optionRows);
        }

        function refreshSignerRosterBindings(rosterKey) {
            for (const binding of signerPickerBindings.values()) {
                if (binding.rosterKey !== rosterKey) {
                    continue;
                }

                syncSignerPickerValue(binding.field);
                renderSignerPickerOptions(binding);
            }
        }

        function setSignerPickerOpenClasses(binding, isOpen) {
            binding.row.classList.toggle('signer-picker-row-open', isOpen);
            if (binding.panel) {
                binding.panel.classList.toggle('signer-picker-panel-open', isOpen);
            }
            if (binding.form) {
                binding.form.classList.toggle('signer-picker-form-open', isOpen);
            }
        }

        function closeSignerNamePicker(binding) {
            if (!binding) {
                return;
            }

            binding.wrapper.classList.remove('is-open');
            binding.menu.hidden = true;
            binding.trigger.setAttribute('aria-expanded', 'false');
            hideSignerPickerAddEditor(binding);
            setSignerPickerOpenClasses(binding, false);
        }

        function closeAllSignerNamePickers(exceptBinding = null) {
            for (const binding of signerPickerBindings.values()) {
                if (binding !== exceptBinding) {
                    closeSignerNamePicker(binding);
                }
            }
        }

        function openSignerNamePicker(binding) {
            closeAllSignerNamePickers(binding);
            renderSignerPickerOptions(binding);
            binding.wrapper.classList.add('is-open');
            binding.menu.hidden = false;
            binding.trigger.setAttribute('aria-expanded', 'true');
            setSignerPickerOpenClasses(binding, true);
        }

        function toggleSignerNamePicker(binding) {
            if (binding.wrapper.classList.contains('is-open')) {
                closeSignerNamePicker(binding);
                return;
            }
            openSignerNamePicker(binding);
        }

        function createSignerPicker(field) {
            const rosterKey = field.dataset.signerRoster;
            const definition = getSignerRosterDefinition(rosterKey);
            const row = field.closest('.ncs-signature-name-row');
            if (!definition || !row || !field.id) {
                return null;
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'signer-name-picker';

            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'signer-name-trigger';
            trigger.setAttribute('aria-haspopup', 'listbox');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.setAttribute('aria-controls', `${field.id}_signer_menu`);
            trigger.setAttribute('aria-label', `Show ${definition.label}`);
            trigger.title = `Show ${definition.label}`;

            const triggerIcon = document.createElement('i');
            triggerIcon.className = 'fa-solid fa-chevron-down signer-name-trigger-icon';
            triggerIcon.setAttribute('aria-hidden', 'true');
            trigger.appendChild(triggerIcon);

            const menu = document.createElement('div');
            menu.id = `${field.id}_signer_menu`;
            menu.className = 'signer-name-menu';
            menu.setAttribute('role', 'listbox');
            menu.setAttribute('aria-label', definition.label);
            menu.hidden = true;

            const menuHeader = document.createElement('div');
            menuHeader.className = 'signer-name-menu-header';
            menuHeader.textContent = definition.label;
            menu.appendChild(menuHeader);

            const options = document.createElement('div');
            options.className = 'signer-name-options';
            menu.appendChild(options);

            const addButton = document.createElement('button');
            addButton.type = 'button';
            addButton.className = 'signer-name-add';
            addButton.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i><span>Add name</span>';
            menu.appendChild(addButton);

            const addEditor = document.createElement('div');
            addEditor.className = 'signer-name-add-editor';
            addEditor.hidden = true;

            const addInput = document.createElement('input');
            addInput.type = 'text';
            addInput.className = 'signer-name-add-input';
            addInput.placeholder = 'SURNAME, FULL NAME';
            addInput.maxLength = 100;
            addInput.autocomplete = 'off';
            addEditor.appendChild(addInput);

            const addSaveButton = document.createElement('button');
            addSaveButton.type = 'button';
            addSaveButton.className = 'signer-name-add-save';
            addSaveButton.textContent = 'Save';
            addEditor.appendChild(addSaveButton);

            const addCancelButton = document.createElement('button');
            addCancelButton.type = 'button';
            addCancelButton.className = 'signer-name-add-cancel';
            addCancelButton.textContent = 'Cancel';
            addEditor.appendChild(addCancelButton);

            const addError = document.createElement('div');
            addError.className = 'signer-name-add-error';
            addError.setAttribute('role', 'alert');
            addError.hidden = true;
            addEditor.appendChild(addError);
            menu.appendChild(addEditor);

            field.classList.add('signer-name-value');
            field.dataset.signerPickerBound = 'true';
            field.removeAttribute('aria-hidden');
            field.removeAttribute('tabindex');

            wrapper.appendChild(field);
            wrapper.appendChild(trigger);
            wrapper.appendChild(menu);
            row.appendChild(wrapper);

            const binding = {
                field,
                rosterKey,
                row,
                panel: row.closest('.ncs-signature-panel'),
                form: row.closest('.printable-form'),
                wrapper,
                trigger,
                menu,
                options,
                addButton,
                addEditor,
                addInput,
                addError
            };

            trigger.addEventListener('click', (event) => {
                event.stopPropagation();
                toggleSignerNamePicker(binding);
            });
            menu.addEventListener('click', (event) => event.stopPropagation());
            addButton.addEventListener('click', () => showSignerPickerAddEditor(binding));
            addSaveButton.addEventListener('click', () => commitSignerPickerName(binding));
            addCancelButton.addEventListener('click', () => hideSignerPickerAddEditor(binding));
            addInput.addEventListener('input', () => setSignerPickerAddError(binding, ''));
            addInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    commitSignerPickerName(binding);
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    hideSignerPickerAddEditor(binding);
                    trigger.focus();
                }
            });
            field.addEventListener('input', () => syncSignerPickerValue(field));

            return binding;
        }

        function bindSignerNamePickers() {
            loadSignerRosterState();
            for (const field of document.querySelectorAll('textarea[data-signer-roster]')) {
                if (field.dataset.signerPickerBound === 'true') {
                    continue;
                }

                const binding = createSignerPicker(field);
                if (!binding) {
                    continue;
                }

                signerPickerBindings.set(field.id, binding);
                setSignerPickerFieldValue(
                    binding,
                    getSignerRosterDefaultName(binding.rosterKey),
                    false
                );
            }

            if (signerPickerEventsBound) {
                return;
            }

            signerPickerEventsBound = true;
            document.addEventListener('click', () => closeAllSignerNamePickers());
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    closeAllSignerNamePickers();
                }
            });
        }

        Object.assign(scope, {
            getSignerRosterDefaultName,
            getSignerRosterNames,
            findSignerRosterName,
            resolveSignerRosterSelection,
            addSignerRosterName,
            setSignerRosterDefaultName,
            deleteSignerRosterName,
            syncSignerPickerValue,
            closeAllSignerNamePickers,
            bindSignerNamePickers
        });
        Object.assign(App, {
            getSignerRosterDefaultName,
            getSignerRosterNames,
            findSignerRosterName,
            resolveSignerRosterSelection,
            addSignerRosterName,
            setSignerRosterDefaultName,
            deleteSignerRosterName,
            syncSignerPickerValue,
            closeAllSignerNamePickers,
            bindSignerNamePickers
        });
    }
})();
