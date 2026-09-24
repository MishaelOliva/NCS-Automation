(function () {
    const App = window.YonduApp;
    const scope = App.scope;

    with (scope) {

            const SOURCE_DIAGNOSTICS_META_VERSION = 1;
            const SOURCE_DIAGNOSTICS_RECORD_KEY = 'csvSourceDiagnostics';
            const LEGACY_DIAGNOSTICS_STORAGE_KEY = `${LEGACY_STORAGE_KEY}:diagnostics`;
            const persistedSourceDiagnostics = new Map();
            const sourceFingerprintCache = new Map();
            let databaseOpenPromise = null;
            let diagnosticsMetadataDirty = false;

            async function initializeApp() {
                try {
                    csvFiles = await readStoredFiles();
                    storageReady = true;
                    pruneSourceCaches(csvFiles);
                    hydratePersistedSourceDiagnostics(csvFiles);
                    renderFileList();
                    await persistSourceDiagnosticsIfDirty(csvFiles);
                } catch (error) {
                    console.error('Failed to load saved sources:', error);
                    renderFileList();
                    showError('Failed to load saved sources from browser storage.');
                }
            }


            function bindSourceManagement() {
                elements.csvFileInput.addEventListener('change', async (event) => {
                    await initPromise;

                    const selectedFiles = Array.from(event.target.files || []);
                    if (!selectedFiles.length) {
                        return;
                    }

                    clearAlerts();
                    setBusyState('upload', true);

                    try {
                        const nextFiles = csvFiles.map((file) => normalizeStoredFile(file));
                        const savedSources = [];
                        const replacements = [];
                        const rejectedFiles = [];

                        for (const file of selectedFiles) {
                            let content = '';

                            try {
                                content = await file.text();
                            } catch (error) {
                                rejectedFiles.push(`${file.name}: unreadable file.`);
                                continue;
                            }

                            const incomingSource = normalizeStoredFile({
                                id: createSourceId(),
                                name: file.name,
                                content,
                                kind: SOURCE_KIND.AUTO,
                                createdAt: Date.now(),
                                updatedAt: Date.now()
                            });
                            const incomingDiagnostics = getSourceDiagnostics(incomingSource);
                            if (incomingDiagnostics.validationState === SOURCE_VALIDATION_STATE.INVALID) {
                                rejectedFiles.push(`${file.name}: ${incomingDiagnostics.blockingErrors[0]}`);
                                deleteSourceCaches(incomingSource.id);
                                continue;
                            }

                            const replacementIndexes = getSourceReplacementIndexes(nextFiles, incomingSource);
                            const existingIndex = replacementIndexes[0] ?? -1;
                            const previousSource = existingIndex >= 0 ? nextFiles[existingIndex] : null;
                            const previousDiagnostics = previousSource ? getSourceDiagnostics(previousSource) : null;
                            const validationSource = normalizeStoredFile({
                                ...(previousSource || {}),
                                id: incomingSource.id,
                                name: file.name,
                                content,
                                kind: previousSource ? previousSource.kind : SOURCE_KIND.AUTO,
                                createdAt: previousSource ? previousSource.createdAt : incomingSource.createdAt,
                                updatedAt: Date.now()
                            });
                            const sourceIsUnchanged = previousSource
                                && previousSource.name === validationSource.name
                                && previousSource.content === validationSource.content
                                && previousSource.kind === validationSource.kind;
                            const nextDiagnostics = sourceIsUnchanged
                                ? previousDiagnostics
                                : getSourceDiagnostics(validationSource);

                            const nextSource = normalizeStoredFile({
                                ...validationSource,
                                id: previousSource ? previousSource.id : validationSource.id
                            });
                            if (sourceIsUnchanged) {
                                deleteSourceCaches(validationSource.id);
                            } else {
                                moveSourceCaches(validationSource.id, nextSource.id);
                            }
                            if (replacementIndexes.length) {
                                nextFiles[existingIndex] = nextSource;
                                replacementIndexes
                                    .slice(1)
                                    .sort((left, right) => right - left)
                                    .forEach((duplicateIndex) => nextFiles.splice(duplicateIndex, 1));
                                replacements.push({
                                    name: file.name,
                                    oldRowCount: previousDiagnostics ? previousDiagnostics.rowCount : 0,
                                    newRowCount: nextDiagnostics.rowCount
                                });
                            } else {
                                nextFiles.push(nextSource);
                            }

                            savedSources.push({
                                file: nextSource,
                                diagnostics: nextDiagnostics
                            });
                        }

                        if (savedSources.length) {
                            pruneSourceCaches(nextFiles);
                            await writeStoredFiles(nextFiles, true);
                            csvFiles = nextFiles;
                            showSuccess(buildUploadSuccessMessage(savedSources, replacements));
                        }

                        if (rejectedFiles.length) {
                            showError(buildRejectedUploadMessage(rejectedFiles));
                        }

                        if (!savedSources.length && !rejectedFiles.length) {
                            showError('Please select at least one CSV file.');
                        }
                    } catch (error) {
                        console.error('Failed to read CSV file:', error);
                        if (isStorageQuotaError(error)) {
                            showError('This browser ran out of local storage space while saving CSV sources. Remove older sources or use smaller CSV exports.');
                        } else {
                            showError('Failed to read the selected CSV file.');
                        }
                    } finally {
                        elements.csvFileInput.value = '';
                        renderFileList();
                        setBusyState('upload', false);
                    }
                });

                if (elements.loadDemoDataBtn) {
                    elements.loadDemoDataBtn.addEventListener('click', async () => {
                        await initPromise;
                        await loadDemoDatasets();
                    });
                }

                bindExcelModalEvents();

                elements.gsheetList.addEventListener('click', async (event) => {
                    const previewButton = event.target.closest('[data-action="preview-source"]');
                    if (previewButton) {
                        await initPromise;
                        const fileId = previewButton.getAttribute('data-file-id');
                        const targetFile = csvFiles.find((file) => file.id === fileId);
                        if (targetFile) {
                            openExcelPreviewModal(targetFile);
                        }
                        return;
                    }

                    const downloadButton = event.target.closest('[data-action="download-source"]');
                    if (downloadButton) {
                        await initPromise;
                        const fileId = downloadButton.getAttribute('data-file-id');
                        const targetFile = csvFiles.find((file) => file.id === fileId);
                        if (targetFile) {
                            downloadCsvFile(targetFile.name, targetFile.content);
                        }
                        return;
                    }

                    const removeButton = event.target.closest('[data-action="remove-source"]');
                    if (!removeButton) {
                        return;
                    }

                    await initPromise;

                    const fileId = removeButton.getAttribute('data-file-id');
                    const targetFile = csvFiles.find((file) => file.id === fileId);
                    if (!targetFile) {
                        return;
                    }

                    csvFiles = csvFiles.filter((file) => file.id !== fileId);
                    parsedCache.delete(fileId);
                    sourceDiagnostics.delete(fileId);
                    await saveFiles();
                    renderFileList();
                    showSuccess(`Removed ${targetFile.name}.`);
                });

                elements.gsheetList.addEventListener('change', async (event) => {
                    if (!event.target.classList.contains('source-kind-select')) {
                        return;
                    }

                    await initPromise;

                    const fileId = event.target.getAttribute('data-file-id');
                    const nextKind = event.target.value;
                    const file = csvFiles.find((item) => item.id === fileId);
                    if (!file) {
                        return;
                    }

                    file.kind = SOURCE_KIND_OPTIONS.includes(nextKind) ? nextKind : SOURCE_KIND.AUTO;
                    file.updatedAt = Date.now();
                    sourceDiagnostics.delete(file.id);
                    persistedSourceDiagnostics.delete(file.id);
                    diagnosticsMetadataDirty = true;
                    const diagnostics = getSourceDiagnostics(file);
                    await saveFiles();
                    renderFileList();
                    showSuccess(`Updated source role for ${file.name}.`);
                    if (diagnostics.validationState === SOURCE_VALIDATION_STATE.WARNING) {
                        showError(diagnostics.warnings[0]);
                    }
                });

                elements.clearSourcesBtn.addEventListener('click', async () => {
                    await initPromise;

                    if (!csvFiles.length) {
                        showError('There are no saved sources to clear.');
                        return;
                    }

                    if (!window.confirm('Clear all saved CSV sources from this browser?')) {
                        return;
                    }

                    csvFiles = [];
                    parsedCache.clear();
                    sourceDiagnostics.clear();
                    await clearStoredFiles();
                    renderFileList();
                    resetForm();
                    clearAlerts();
                    showSuccess('Removed all saved sources from this browser.');
                });
            }


            function renderFileList() {
                const list = elements.gsheetList;
                list.replaceChildren();

                if (!csvFiles.length) {
                    const emptyItem = document.createElement('li');
                    emptyItem.className = 'gsheet-item empty-state';
                    emptyItem.textContent = storageReady
                        ? 'No saved CSV sources yet.'
                        : 'Loading saved CSV sources...';
                    list.appendChild(emptyItem);
                    syncSourceStatusPanel();
                    return;
                }

                const fragment = document.createDocumentFragment();

                csvFiles.forEach((file) => {
                    const diagnostics = getSourceDiagnostics(file);
                    const effectiveKind = getEffectiveSourceKind(file);
                    const item = document.createElement('li');
                    item.className = `gsheet-item validation-${diagnostics.validationState}`;

                    const meta = document.createElement('div');
                    meta.className = 'source-meta';

                    const sourceName = document.createElement('div');
                    sourceName.className = 'source-name';

                    const icon = document.createElement('i');
                    icon.className = 'fa-regular fa-file-lines';
                    sourceName.appendChild(icon);

                    const nameText = document.createElement('span');
                    nameText.title = file.name;
                    nameText.textContent = file.name;
                    sourceName.appendChild(nameText);

                    const rowCountLabel = document.createElement('div');
                    rowCountLabel.className = 'source-row-count';
                    rowCountLabel.textContent = `${SOURCE_KIND_LABELS[effectiveKind]} \u2014 ${diagnostics.rowCount.toLocaleString()} ${diagnostics.rowCount === 1 ? 'row' : 'rows'}`;

                    const roleRow = document.createElement('div');
                    roleRow.className = 'source-role-row';

                    const select = document.createElement('select');
                    select.className = 'source-kind-select';
                    select.setAttribute('data-file-id', file.id);
                    SOURCE_KIND_OPTIONS.forEach((kind) => {
                        const option = document.createElement('option');
                        option.value = kind;
                        option.textContent = SOURCE_KIND_LABELS[kind];
                        if ((file.kind || SOURCE_KIND.AUTO) === kind) {
                            option.selected = true;
                        }
                        select.appendChild(option);
                    });
                    roleRow.appendChild(select);

                    const validationBadge = document.createElement('span');
                    validationBadge.className = `source-validation-badge state-${diagnostics.validationState}`;
                    validationBadge.textContent = getSourceValidationLabel(diagnostics.validationState);
                    roleRow.appendChild(validationBadge);

                    const detectedLabel = document.createElement('div');
                    detectedLabel.className = 'source-detected';
                    detectedLabel.textContent = file.kind === SOURCE_KIND.AUTO || !file.kind
                        ? `Detected as ${SOURCE_KIND_LABELS[effectiveKind]}`
                        : `Manual role: ${SOURCE_KIND_LABELS[file.kind]}`;

                    const validationMessage = document.createElement('div');
                    validationMessage.className = 'source-validation-message';
                    validationMessage.textContent = diagnostics.blockingErrors[0] || diagnostics.warnings[0] || 'Headers and row count look usable.';

                    const cardActions = document.createElement('div');
                    cardActions.className = 'source-card-actions';

                    const cardPreviewBtn = document.createElement('button');
                    cardPreviewBtn.type = 'button';
                    cardPreviewBtn.className = 'btn-source-pill btn-source-pill-preview';
                    cardPreviewBtn.setAttribute('data-action', 'preview-source');
                    cardPreviewBtn.setAttribute('data-file-id', file.id);
                    cardPreviewBtn.title = `Preview ${file.name} in Excel view`;
                    cardPreviewBtn.innerHTML = '<svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg><span>Preview in Excel</span>';

                    const cardDownloadBtn = document.createElement('button');
                    cardDownloadBtn.type = 'button';
                    cardDownloadBtn.className = 'btn-source-pill btn-source-pill-download';
                    cardDownloadBtn.setAttribute('data-action', 'download-source');
                    cardDownloadBtn.setAttribute('data-file-id', file.id);
                    cardDownloadBtn.title = `Download ${file.name}`;
                    cardDownloadBtn.innerHTML = '<svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg><span>Download CSV</span>';

                    const cardRemoveBtn = document.createElement('button');
                    cardRemoveBtn.type = 'button';
                    cardRemoveBtn.className = 'btn-source-pill btn-source-pill-delete';
                    cardRemoveBtn.setAttribute('data-action', 'remove-source');
                    cardRemoveBtn.setAttribute('data-file-id', file.id);
                    cardRemoveBtn.title = `Remove ${file.name}`;
                    cardRemoveBtn.innerHTML = '<svg class="icon-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg><span>Delete</span>';

                    cardActions.appendChild(cardPreviewBtn);
                    cardActions.appendChild(cardDownloadBtn);
                    cardActions.appendChild(cardRemoveBtn);

                    meta.appendChild(sourceName);
                    meta.appendChild(rowCountLabel);
                    meta.appendChild(roleRow);
                    meta.appendChild(detectedLabel);
                    meta.appendChild(validationMessage);
                    meta.appendChild(cardActions);

                    item.appendChild(meta);
                    fragment.appendChild(item);
                });

                list.appendChild(fragment);
                syncSourceStatusPanel();
            }


            function getSourceValidationLabel(validationState) {
                if (validationState === SOURCE_VALIDATION_STATE.INVALID) {
                    return 'Invalid source';
                }
                if (validationState === SOURCE_VALIDATION_STATE.WARNING) {
                    return 'Needs review';
                }
                return 'Ready';
            }


            function buildUploadSuccessMessage(savedSources, replacements) {
                const savedLabel = savedSources.length === 1
                    ? `Saved ${savedSources[0].file.name} to this browser.`
                    : `Saved ${savedSources.length} CSV sources to this browser.`;

                if (!replacements.length) {
                    return savedLabel;
                }

                const replacementSummary = replacements
                    .map((item) => `${item.name} (${item.oldRowCount} \u2192 ${item.newRowCount} rows)`)
                    .join('; ');

                return `${savedLabel} Replaced: ${replacementSummary}.`;
            }


            function buildRejectedUploadMessage(rejectedFiles) {
                return rejectedFiles.join(' ');
            }


            function isStorageQuotaError(error) {
                return error && (
                    error.name === 'QuotaExceededError' ||
                    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                    error.code === 22 ||
                    error.code === 1014
                );
            }


            function getSourceContentFingerprint(file) {
                const content = typeof file.content === 'string' ? file.content : '';
                const cached = sourceFingerprintCache.get(file.id);
                const updatedAt = Number.isFinite(file.updatedAt) ? file.updatedAt : 0;
                if (cached && cached.content === content && cached.updatedAt === updatedAt) {
                    return cached.fingerprint;
                }

                const sampleWidth = 96;
                const middleStart = Math.max(0, Math.floor(content.length / 2) - Math.floor(sampleWidth / 2));
                const sample = [
                    content.slice(0, sampleWidth),
                    content.slice(middleStart, middleStart + sampleWidth),
                    content.slice(-sampleWidth)
                ].join('\u0000');
                let hash = 2166136261;
                for (let index = 0; index < sample.length; index += 1) {
                    hash ^= sample.charCodeAt(index);
                    hash = Math.imul(hash, 16777619);
                }

                // updatedAt is changed by every supported source mutation; length and three content
                // samples protect metadata recovery if storage writes are interrupted or tampered with.
                const fingerprint = `${updatedAt}:${content.length}:${(hash >>> 0).toString(16)}`;
                sourceFingerprintCache.set(file.id, { content, updatedAt, fingerprint });
                return fingerprint;
            }


            function cloneDiagnosticErrors(errors) {
                if (!Array.isArray(errors)) {
                    return [];
                }

                return errors.map((error) => {
                    if (!error || typeof error !== 'object') {
                        return error;
                    }

                    return Object.keys(error).reduce((copy, key) => {
                        const value = error[key];
                        if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
                            copy[key] = value;
                        }
                        return copy;
                    }, {});
                });
            }


            function createPersistedSourceDiagnostics(file, diagnostics) {
                return {
                    fingerprint: getSourceContentFingerprint(file),
                    name: file.name,
                    kind: file.kind,
                    rowCount: diagnostics.rowCount,
                    headerCount: diagnostics.headerCount,
                    headers: diagnostics.headers.slice(),
                    errors: cloneDiagnosticErrors(diagnostics.errors),
                    detectedKind: diagnostics.detectedKind,
                    assignedKind: diagnostics.assignedKind,
                    isOperationallyUsable: diagnostics.isOperationallyUsable,
                    blockingErrors: diagnostics.blockingErrors.slice(),
                    warnings: diagnostics.warnings.slice(),
                    validationState: diagnostics.validationState
                };
            }


            function isPersistedSourceDiagnosticsValid(file, metadata) {
                return !!metadata
                    && metadata.name === file.name
                    && metadata.kind === file.kind
                    && metadata.fingerprint === getSourceContentFingerprint(file)
                    && Number.isFinite(metadata.rowCount)
                    && metadata.rowCount >= 0
                    && Number.isFinite(metadata.headerCount)
                    && metadata.headerCount >= 0
                    && Array.isArray(metadata.headers)
                    && metadata.headers.every((header) => typeof header === 'string')
                    && Array.isArray(metadata.errors)
                    && typeof metadata.detectedKind === 'string'
                    && typeof metadata.assignedKind === 'string'
                    && typeof metadata.isOperationallyUsable === 'boolean'
                    && Array.isArray(metadata.blockingErrors)
                    && metadata.blockingErrors.every((message) => typeof message === 'string')
                    && Array.isArray(metadata.warnings)
                    && metadata.warnings.every((message) => typeof message === 'string')
                    && [
                        SOURCE_VALIDATION_STATE.INVALID,
                        SOURCE_VALIDATION_STATE.WARNING,
                        SOURCE_VALIDATION_STATE.READY
                    ].includes(metadata.validationState);
            }


            function restorePersistedSourceDiagnostics(file) {
                const metadata = persistedSourceDiagnostics.get(file.id);
                if (!metadata) {
                    return null;
                }
                if (!isPersistedSourceDiagnosticsValid(file, metadata)) {
                    persistedSourceDiagnostics.delete(file.id);
                    diagnosticsMetadataDirty = true;
                    return null;
                }

                return {
                    content: file.content,
                    kind: file.kind,
                    name: file.name,
                    rowCount: metadata.rowCount,
                    headerCount: metadata.headerCount,
                    headers: metadata.headers.slice(),
                    errors: cloneDiagnosticErrors(metadata.errors),
                    detectedKind: metadata.detectedKind,
                    assignedKind: metadata.assignedKind,
                    isOperationallyUsable: metadata.isOperationallyUsable,
                    blockingErrors: metadata.blockingErrors.slice(),
                    warnings: metadata.warnings.slice(),
                    validationState: metadata.validationState
                };
            }


            function cacheSourceDiagnostics(file, diagnostics) {
                sourceDiagnostics.set(file.id, diagnostics);
                persistedSourceDiagnostics.set(file.id, createPersistedSourceDiagnostics(file, diagnostics));
                diagnosticsMetadataDirty = true;
            }


            function hydratePersistedSourceDiagnostics(files) {
                for (const file of files) {
                    const cached = sourceDiagnostics.get(file.id);
                    if (cached && cached.content === file.content && cached.kind === file.kind && cached.name === file.name) {
                        continue;
                    }

                    const restored = restorePersistedSourceDiagnostics(file);
                    if (restored) {
                        sourceDiagnostics.set(file.id, restored);
                    }
                }
            }


            function deleteSourceCaches(fileId) {
                parsedCache.delete(fileId);
                sourceDiagnostics.delete(fileId);
                sourceFingerprintCache.delete(fileId);
                if (persistedSourceDiagnostics.delete(fileId)) {
                    diagnosticsMetadataDirty = true;
                }
            }


            function moveSourceCaches(fromFileId, toFileId) {
                if (fromFileId === toFileId) {
                    return;
                }

                for (const cache of [parsedCache, sourceDiagnostics, sourceFingerprintCache, persistedSourceDiagnostics]) {
                    const entry = cache.get(fromFileId);
                    cache.delete(fromFileId);
                    if (entry) {
                        cache.set(toFileId, entry);
                    }
                }
                diagnosticsMetadataDirty = true;
            }


            function pruneSourceCaches(files) {
                const activeIds = new Set(files.map((file) => file.id));
                for (const cache of [parsedCache, sourceDiagnostics, sourceFingerprintCache]) {
                    for (const fileId of cache.keys()) {
                        if (!activeIds.has(fileId)) {
                            cache.delete(fileId);
                        }
                    }
                }

                for (const fileId of persistedSourceDiagnostics.keys()) {
                    if (!activeIds.has(fileId)) {
                        persistedSourceDiagnostics.delete(fileId);
                        diagnosticsMetadataDirty = true;
                    }
                }
            }


            function getSourceDiagnostics(file) {
                const cached = sourceDiagnostics.get(file.id);
                if (cached && cached.content === file.content && cached.kind === file.kind && cached.name === file.name) {
                    return cached;
                }

                const persisted = restorePersistedSourceDiagnostics(file);
                if (persisted) {
                    sourceDiagnostics.set(file.id, persisted);
                    return persisted;
                }

                const operationalParsedInfo = getParsedFileInfo(file);
                const effectiveKind = getEffectiveSourceKind(file);
                const assignedKind = file.kind && file.kind !== SOURCE_KIND.AUTO ? file.kind : effectiveKind;
                // Validation can fall back to an alternate parser so mismatched source roles warn cleanly
                // without changing the parser used by the lookup workflow itself.
                const parsedInfo = getValidationParsedInfo(file, operationalParsedInfo, effectiveKind);
                const blockingErrors = [];
                const warnings = [];
                const blockingParseErrors = parsedInfo.errors.filter((error) => error.code !== 'UndetectableDelimiter');
                const isOperationallyUsable = operationalParsedInfo.headerCount > 0 && operationalParsedInfo.rows.length > 0;

                if (!sanitizeCellValue(file.content)) {
                    blockingErrors.push('The file is empty.');
                }
                if (blockingParseErrors.length) {
                    blockingErrors.push('The CSV structure could not be parsed cleanly.');
                } else if (parsedInfo.errors.length) {
                    warnings.push('The CSV delimiter could not be auto-detected, but the file was still read.');
                }
                if (!parsedInfo.headerCount) {
                    blockingErrors.push('No usable headers were found.');
                }
                if (!parsedInfo.rows.length) {
                    blockingErrors.push('No usable data rows were found.');
                }
                if (parsedInfo.rows.length > 0 && parsedInfo.rows.length < 5) {
                    warnings.push(`Only ${parsedInfo.rows.length} data ${parsedInfo.rows.length === 1 ? 'row' : 'rows'} detected.`);
                }

                const roleWarning = getSourceRoleWarning(assignedKind, parsedInfo.headers);
                if (roleWarning) {
                    warnings.push(roleWarning);
                }

                const diagnostics = {
                    content: file.content,
                    kind: file.kind,
                    name: file.name,
                    rowCount: parsedInfo.rows.length,
                    headerCount: parsedInfo.headerCount,
                    headers: parsedInfo.headers,
                    errors: parsedInfo.errors,
                    detectedKind: effectiveKind,
                    assignedKind,
                    isOperationallyUsable,
                    blockingErrors,
                    warnings,
                    validationState: blockingErrors.length
                        ? SOURCE_VALIDATION_STATE.INVALID
                        : (warnings.length ? SOURCE_VALIDATION_STATE.WARNING : SOURCE_VALIDATION_STATE.READY)
                };

                cacheSourceDiagnostics(file, diagnostics);
                return diagnostics;
            }


            function getValidationParsedInfo(file, operationalParsedInfo, effectiveKind) {
                if (operationalParsedInfo.headerCount > 0 && operationalParsedInfo.rows.length > 0) {
                    return operationalParsedInfo;
                }

                const fallbackInfo = parseValidationFallbackFile(file);
                return fallbackInfo.headerCount > 0 && fallbackInfo.rows.length > 0
                    ? fallbackInfo
                    : operationalParsedInfo;
            }


            function parseValidationFallbackFile(file) {
                const parsed = Papa.parse(file.content, {
                    header: false,
                    skipEmptyLines: 'greedy'
                });

                const rawRows = parsed.data
                    .filter((row) => Array.isArray(row))
                    .map((row) => row.map((value) => sanitizeCellValue(value)));

                for (let index = 0; index < rawRows.length - 1; index += 1) {
                    const headers = rawRows[index].map((header, headerIndex) => sanitizeCellValue(header) || `Unnamed Column ${headerIndex + 1}`);
                    const headerCount = countUsableHeaders(headers);
                    if (!headerCount) {
                        continue;
                    }

                    const rows = rawRows
                        .slice(index + 1)
                        .map((row) => mapRowToHeaders(row, headers))
                        .filter((row) => Object.values(row).some((value) => sanitizeCellValue(value) !== ''));

                    if (rows.length) {
                        return {
                            rows,
                            headers,
                            headerCount,
                            errors: parsed.errors || []
                        };
                    }
                }

                return {
                    rows: [],
                    headers: [],
                    headerCount: 0,
                    errors: parsed.errors || []
                };
            }


            function getSourceRoleWarning(kind, headers) {
                if (!headers.length || kind === SOURCE_KIND.AUTO || kind === SOURCE_KIND.GENERAL) {
                    return '';
                }

                const hasEmployeeIdentity = headerMatchesField(headers, 'employeeName') || headerMatchesField(headers, 'employeeId');
                const hasAssetIdentity = headerMatchesField(headers, 'assetTag') || headerMatchesField(headers, 'serial') || headerMatchesField(headers, 'imei');

                if ((kind === SOURCE_KIND.MASTER || kind === SOURCE_KIND.ITSM) && (!hasEmployeeIdentity || !hasAssetIdentity)) {
                    return `Headers do not look like ${SOURCE_KIND_LABELS[kind]}.`;
                }

                if (kind === SOURCE_KIND.NEW_HIRE) {
                    const hasPeopleHeaders = headerMatchesField(headers, 'employeeName')
                        && (headerMatchesField(headers, 'employeeId') || headerMatchesField(headers, 'position') || headerMatchesField(headers, 'costCenter') || headerMatchesField(headers, 'businessUnit'));
                    if (!hasPeopleHeaders) {
                        return 'Headers do not look like New Hire Attendance.';
                    }
                }

                if (kind === SOURCE_KIND.TEST_DEVICE) {
                    const hasAssignee = headerMatchesField(headers, 'employeeName') || headerMatchesField(headers, 'employeeId');
                    if (!hasAssetIdentity || !hasAssignee) {
                        return 'Headers do not look like Test Device.';
                    }
                }

                return '';
            }


            function headerMatchesField(headers, fieldName) {
                const aliases = FIELD_ALIASES[fieldName];
                if (!aliases) {
                    return false;
                }

                return headers.some((header) => {
                    const normalizedHeader = normalizeHeader(header);
                    const compactHeader = normalizedHeader.replace(/\s+/g, '');

                    return aliases.exact.some((alias) => {
                        const normalizedAlias = normalizeHeader(alias);
                        return normalizedHeader === normalizedAlias || isAllowedHeaderPrefix(fieldName, normalizedAlias, normalizedHeader);
                    }) || aliases.contains.some((alias) => compactHeader.includes(normalizeHeader(alias).replace(/\s+/g, '')));
                });
            }


            function getParsedFileInfo(file) {
                const cachedEntry = parsedCache.get(file.id);
                const parserKind = getEffectiveSourceKind(file) === SOURCE_KIND.NEW_HIRE
                    ? SOURCE_KIND.NEW_HIRE
                    : SOURCE_KIND.GENERAL;
                if (cachedEntry && cachedEntry.content === file.content && cachedEntry.parserKind === parserKind) {
                    return cachedEntry;
                }

                const parsedInfo = parserKind === SOURCE_KIND.NEW_HIRE
                    ? parseNewHireSourceFile(file)
                    : parseStandardSourceFile(file);

                const nextEntry = {
                    content: file.content,
                    parserKind,
                    rows: parsedInfo.rows,
                    headers: parsedInfo.headers,
                    headerCount: parsedInfo.headerCount,
                    errors: parsedInfo.errors
                };
                parsedCache.set(file.id, nextEntry);
                return nextEntry;
            }


            function parseStandardSourceFile(file) {
                const headerCounts = {};
                const parsed = Papa.parse(file.content, {
                    header: true,
                    skipEmptyLines: 'greedy',
                    transformHeader(header) {
                        const cleanHeader = sanitizeCellValue(header) || 'Unnamed Column';
                        if (!headerCounts[cleanHeader]) {
                            headerCounts[cleanHeader] = 1;
                            return cleanHeader;
                        }
                        headerCounts[cleanHeader] += 1;
                        return `${cleanHeader}_${headerCounts[cleanHeader]}`;
                    }
                });

                if (parsed.errors && parsed.errors.length) {
                    console.warn(`CSV parse warnings for ${file.name}:`, parsed.errors);
                }

                const rows = parsed.data.filter((row) =>
                    Object.values(row).some((value) => sanitizeCellValue(value) !== '')
                );
                const headers = Array.isArray(parsed.meta && parsed.meta.fields)
                    ? parsed.meta.fields
                    : Object.keys(rows[0] || {});

                return {
                    rows,
                    headers,
                    headerCount: countUsableHeaders(headers),
                    errors: parsed.errors || []
                };
            }


            function parseNewHireSourceFile(file) {
                const parsed = Papa.parse(file.content, {
                    header: false,
                    skipEmptyLines: 'greedy'
                });

                if (parsed.errors && parsed.errors.length) {
                    console.warn(`CSV parse warnings for ${file.name}:`, parsed.errors);
                }

                const rawRows = parsed.data
                    .filter((row) => Array.isArray(row))
                    .map((row) => row.map((value) => sanitizeCellValue(value)));

                if (rawRows.length < 2) {
                    return {
                        rows: [],
                        headers: [],
                        headerCount: 0,
                        errors: parsed.errors || []
                    };
                }

                const labelHeaders = rawRows[1];
                const headers = buildCompositeHeaders(rawRows[0], labelHeaders);
                const rows = rawRows
                    .slice(2)
                    .map((row) => mapNewHireRowToHeaders(row, headers, labelHeaders))
                    .filter((row) => Object.values(row).some((value) => sanitizeCellValue(value) !== ''));

                return {
                    rows,
                    headers,
                    headerCount: countUsableHeaders(headers),
                    errors: parsed.errors || []
                };
            }


            function countUsableHeaders(headers) {
                return headers.filter((header) => {
                    const normalized = normalizeHeader(header);
                    return normalized && !normalized.startsWith('unnamed column');
                }).length;
            }


            function loadPersistedSourceDiagnostics(value) {
                persistedSourceDiagnostics.clear();
                diagnosticsMetadataDirty = false;

                if (value === null || typeof value === 'undefined') {
                    return;
                }
                if (
                    !value
                    || value.version !== SOURCE_DIAGNOSTICS_META_VERSION
                    || !Array.isArray(value.sources)
                ) {
                    diagnosticsMetadataDirty = true;
                    return;
                }

                for (const entry of value.sources) {
                    if (!entry || typeof entry.id !== 'string' || !entry.metadata || typeof entry.metadata !== 'object') {
                        diagnosticsMetadataDirty = true;
                        continue;
                    }
                    persistedSourceDiagnostics.set(entry.id, entry.metadata);
                }
            }


            function buildPersistedSourceDiagnosticsValue(files) {
                const sources = [];

                for (const file of files) {
                    const metadata = persistedSourceDiagnostics.get(file.id);
                    if (!metadata) {
                        continue;
                    }
                    if (!isPersistedSourceDiagnosticsValid(file, metadata)) {
                        persistedSourceDiagnostics.delete(file.id);
                        diagnosticsMetadataDirty = true;
                        continue;
                    }
                    sources.push({ id: file.id, metadata });
                }

                return {
                    version: SOURCE_DIAGNOSTICS_META_VERSION,
                    sources
                };
            }


            function readLegacySourceDiagnostics() {
                try {
                    const raw = localStorage.getItem(LEGACY_DIAGNOSTICS_STORAGE_KEY);
                    loadPersistedSourceDiagnostics(raw ? JSON.parse(raw) : null);
                } catch (error) {
                    console.warn('Failed to read cached source diagnostics:', error);
                    loadPersistedSourceDiagnostics(null);
                    diagnosticsMetadataDirty = true;
                }
            }


            async function persistSourceDiagnosticsIfDirty(files) {
                if (!diagnosticsMetadataDirty) {
                    return;
                }

                try {
                    await writeStoredSourceDiagnostics(files);
                } catch (error) {
                    console.warn('Failed to cache source diagnostics:', error);
                }
            }


            async function writeStoredSourceDiagnostics(files) {
                const value = buildPersistedSourceDiagnosticsValue(files);
                const db = await openDatabase();
                if (!db) {
                    localStorage.setItem(LEGACY_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(value));
                    diagnosticsMetadataDirty = false;
                    return;
                }

                const transaction = db.transaction(STORE_NAME, 'readwrite');
                transaction.objectStore(STORE_NAME).put({
                    key: SOURCE_DIAGNOSTICS_RECORD_KEY,
                    value
                });
                await transactionToPromise(transaction);
                localStorage.removeItem(LEGACY_DIAGNOSTICS_STORAGE_KEY);
                diagnosticsMetadataDirty = false;
            }


            async function saveFiles() {
                const normalizedFiles = csvFiles.map((file) => normalizeStoredFile(file));
                csvFiles = normalizedFiles;
                pruneSourceCaches(normalizedFiles);
                await writeStoredFiles(normalizedFiles, true);
            }


            async function readStoredFiles() {
                const db = await openDatabase();
                if (!db) {
                    return readLegacyStoredFiles();
                }

                const transaction = db.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const filesRequest = store.get(FILES_RECORD_KEY);
                const diagnosticsRequest = store.get(SOURCE_DIAGNOSTICS_RECORD_KEY);
                const [record, diagnosticsRecord] = await Promise.all([
                    requestToPromise(filesRequest),
                    requestToPromise(diagnosticsRequest)
                ]);
                await transactionToPromise(transaction);
                loadPersistedSourceDiagnostics(diagnosticsRecord ? diagnosticsRecord.value : null);

                if (record && Array.isArray(record.value)) {
                    return record.value.map((file) => normalizeStoredFile(file));
                }

                const legacyFiles = readLegacyStoredFiles();
                if (legacyFiles.length) {
                    await writeStoredFiles(legacyFiles, true);
                    localStorage.removeItem(LEGACY_STORAGE_KEY);
                    localStorage.removeItem(LEGACY_DIAGNOSTICS_STORAGE_KEY);
                }
                return legacyFiles;
            }


            async function writeStoredFiles(files, filesAreNormalized = false) {
                const normalizedFiles = filesAreNormalized
                    ? files
                    : files.map((file) => normalizeStoredFile(file));
                const diagnosticsValue = buildPersistedSourceDiagnosticsValue(normalizedFiles);
                const db = await openDatabase();
                if (!db) {
                    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(normalizedFiles));
                    try {
                        localStorage.setItem(LEGACY_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(diagnosticsValue));
                        diagnosticsMetadataDirty = false;
                    } catch (error) {
                        localStorage.removeItem(LEGACY_DIAGNOSTICS_STORAGE_KEY);
                        console.warn('Failed to cache source diagnostics:', error);
                    }
                    return;
                }

                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                store.put({
                    key: FILES_RECORD_KEY,
                    value: normalizedFiles
                });
                store.put({
                    key: SOURCE_DIAGNOSTICS_RECORD_KEY,
                    value: diagnosticsValue
                });
                await transactionToPromise(transaction);
                localStorage.removeItem(LEGACY_STORAGE_KEY);
                localStorage.removeItem(LEGACY_DIAGNOSTICS_STORAGE_KEY);
                diagnosticsMetadataDirty = false;
            }


            async function clearStoredFiles() {
                const db = await openDatabase();
                if (!db) {
                    localStorage.removeItem(LEGACY_STORAGE_KEY);
                    localStorage.removeItem(LEGACY_DIAGNOSTICS_STORAGE_KEY);
                    persistedSourceDiagnostics.clear();
                    sourceFingerprintCache.clear();
                    diagnosticsMetadataDirty = false;
                    return;
                }

                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                store.delete(FILES_RECORD_KEY);
                store.delete(SOURCE_DIAGNOSTICS_RECORD_KEY);
                await transactionToPromise(transaction);
                localStorage.removeItem(LEGACY_STORAGE_KEY);
                localStorage.removeItem(LEGACY_DIAGNOSTICS_STORAGE_KEY);
                persistedSourceDiagnostics.clear();
                sourceFingerprintCache.clear();
                diagnosticsMetadataDirty = false;
            }


            async function openDatabase() {
                if (!window.indexedDB) {
                    return null;
                }
                if (databaseOpenPromise) {
                    return databaseOpenPromise;
                }

                databaseOpenPromise = new Promise((resolve) => {
                    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

                    request.onupgradeneeded = () => {
                        const db = request.result;
                        if (!db.objectStoreNames.contains(STORE_NAME)) {
                            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
                        }
                    };

                    request.onsuccess = () => {
                        const db = request.result;
                        db.onversionchange = () => {
                            db.close();
                            databaseOpenPromise = null;
                        };
                        db.onclose = () => {
                            databaseOpenPromise = null;
                        };
                        resolve(db);
                    };

                    request.onerror = () => {
                        console.warn('IndexedDB unavailable, falling back to localStorage:', request.error);
                        databaseOpenPromise = null;
                        resolve(null);
                    };
                });
                return databaseOpenPromise;
            }


            function readLegacyStoredFiles() {
                try {
                    const raw = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY)) || [];
                    readLegacySourceDiagnostics();
                    return Array.isArray(raw) ? raw.map((file) => normalizeStoredFile(file)) : [];
                } catch (error) {
                    console.warn('Failed to read legacy localStorage data:', error);
                    readLegacySourceDiagnostics();
                    return [];
                }
            }


            function normalizeStoredFile(file) {
                return {
                    id: file.id || createSourceId(),
                    name: sanitizeCellValue(file.name) || 'Untitled Source',
                    content: typeof file.content === 'string' ? file.content : '',
                    kind: SOURCE_KIND_OPTIONS.includes(file.kind) ? file.kind : SOURCE_KIND.AUTO,
                    createdAt: Number.isFinite(file.createdAt) ? file.createdAt : Date.now(),
                    updatedAt: Number.isFinite(file.updatedAt) ? file.updatedAt : Date.now()
                };
            }


            function createSourceId() {
                if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                    return window.crypto.randomUUID();
                }
                return `source-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
            }


            function detectSourceKindByName(fileName) {
                const normalizedName = normalizeText(getCanonicalSourceName(fileName));

                if ((normalizedName.includes('master') && normalizedName.includes('tracker')) || normalizedName.includes('asset master')) {
                    return SOURCE_KIND.MASTER;
                }
                if (normalizedName.includes('itsm') || (normalizedName.includes('task') && normalizedName.includes('assignment'))) {
                    return SOURCE_KIND.ITSM;
                }
                if ((normalizedName.includes('new') || normalizedName.includes('newly')) && (normalizedName.includes('hire') || normalizedName.includes('hired'))) {
                    return SOURCE_KIND.NEW_HIRE;
                }
                if (normalizedName.includes('attendance') || normalizedName.includes('attendace')) {
                    return SOURCE_KIND.NEW_HIRE;
                }
                if (normalizedName.includes('test') && normalizedName.includes('device')) {
                    return SOURCE_KIND.TEST_DEVICE;
                }
                return SOURCE_KIND.GENERAL;
            }


            function getEffectiveSourceKind(file) {
                if (file.kind && file.kind !== SOURCE_KIND.AUTO) {
                    return file.kind;
                }
                return detectSourceKindByName(file.name);
            }


            function getSourceReplacementIndexes(files, incomingFile) {
                const storedFiles = Array.isArray(files) ? files : [];
                const incomingCanonicalName = normalizeText(getCanonicalSourceName(incomingFile?.name));
                const incomingKind = getEffectiveSourceKind(incomingFile || {});
                const replaceByRole = incomingKind !== SOURCE_KIND.AUTO && incomingKind !== SOURCE_KIND.GENERAL;

                return storedFiles
                    .map((storedFile, index) => ({
                        index,
                        sameCanonicalName: normalizeText(getCanonicalSourceName(storedFile.name)) === incomingCanonicalName,
                        sameRole: replaceByRole && getEffectiveSourceKind(storedFile) === incomingKind
                    }))
                    .filter((match) => match.sameCanonicalName || match.sameRole)
                    .sort((left, right) => Number(right.sameCanonicalName) - Number(left.sameCanonicalName) || left.index - right.index)
                    .map((match) => match.index);
            }


            function getAccountabilitySourceConfig() {
                if (
                    currentAccountabilityPrintMode === 'replacement' ||
                    currentAccountabilityPrintMode === 'refresh' ||
                    currentAccountabilityPrintMode === 'temporary'
                ) {
                    return {
                        allowedKinds: [SOURCE_KIND.MASTER],
                        queryableKinds: [SOURCE_KIND.MASTER],
                        primaryKinds: [SOURCE_KIND.MASTER],
                        requiredKinds: [SOURCE_KIND.MASTER],
                        payloadOrder: [SOURCE_KIND.MASTER],
                        positionOrder: [SOURCE_KIND.MASTER],
                        costCenterOrder: [SOURCE_KIND.MASTER],
                        assetOrder: [SOURCE_KIND.MASTER],
                        missingSourceMessage: 'The ITSM Asset Master Tracker CSV is required for Replacement, Refresh, and Temporary accountability modes.'
                    };
                }

                return {
                    allowedKinds: [SOURCE_KIND.ITSM, SOURCE_KIND.NEW_HIRE],
                    queryableKinds: [SOURCE_KIND.ITSM, SOURCE_KIND.NEW_HIRE],
                    primaryKinds: [SOURCE_KIND.NEW_HIRE, SOURCE_KIND.ITSM],
                    requiredKinds: [SOURCE_KIND.ITSM, SOURCE_KIND.NEW_HIRE],
                    payloadOrder: [SOURCE_KIND.ITSM, SOURCE_KIND.NEW_HIRE],
                    positionOrder: [SOURCE_KIND.NEW_HIRE, SOURCE_KIND.ITSM],
                    costCenterOrder: [SOURCE_KIND.NEW_HIRE, SOURCE_KIND.ITSM],
                    assetOrder: [SOURCE_KIND.ITSM, SOURCE_KIND.NEW_HIRE],
                    missingSourceMessage: 'New Hire accountability requires both the ITSM Task Assignment CSV and the New Hire Attendance CSV.'
                };
            }


            function getMatchKindForForm(file, formType) {
                const effectiveKind = getEffectiveSourceKind(file);
                return isSourceKindAllowedForForm(effectiveKind, formType) ? effectiveKind : '';
            }


            function getMatchKindForAllowedKinds(file, allowedKinds) {
                const effectiveKind = getEffectiveSourceKind(file);
                return allowedKinds.includes(effectiveKind) ? effectiveKind : '';
            }


            function getParsedSourcesForKinds(allowedKinds) {
                const matchingSources = csvFiles.reduce((sources, file) => {
                    const matchKind = getMatchKindForAllowedKinds(file, allowedKinds);
                    if (!matchKind) {
                        return sources;
                    }

                    sources.push({
                        ...file,
                        effectiveKind: getEffectiveSourceKind(file),
                        matchKind,
                        allowDirectMatch: true
                    });
                    return sources;
                }, []);

                return dedupeParsedSourcesByCanonicalName(matchingSources).reduce((sources, source) => {
                    const diagnostics = getSourceDiagnostics(source);
                    if (diagnostics.validationState === SOURCE_VALIDATION_STATE.INVALID || !diagnostics.isOperationallyUsable) {
                        return sources;
                    }

                    sources.push({
                        ...source,
                        rows: getParsedRows(source)
                    });
                    return sources;
                }, []);
            }


            function isSourceKindAllowedForForm(kind, formType) {
                if (formType === 'accountability') {
                    return getAccountabilitySourceConfig().allowedKinds.includes(kind);
                }

                if (formType === 'test_device_accountability') {
                    return kind === SOURCE_KIND.TEST_DEVICE || kind === SOURCE_KIND.MASTER;
                }

                if (formType.includes('_test')) {
                    return kind === SOURCE_KIND.TEST_DEVICE || kind === SOURCE_KIND.MASTER;
                }

                if (formType.startsWith('sanitization_') || formType.startsWith('return_')) {
                    return kind === SOURCE_KIND.MASTER;
                }

                return kind === SOURCE_KIND.GENERAL;
            }


            function isSourceKindQueryableForForm(kind, formType) {
                if (!kind) {
                    return false;
                }

                if (formType === 'accountability') {
                    return getAccountabilitySourceConfig().queryableKinds.includes(kind);
                }

                if (formType === 'test_device_accountability') {
                    return kind === SOURCE_KIND.TEST_DEVICE || kind === SOURCE_KIND.MASTER;
                }

                if (formType.includes('_test')) {
                    return kind === SOURCE_KIND.TEST_DEVICE || kind === SOURCE_KIND.MASTER;
                }

                return isSourceKindAllowedForForm(kind, formType);
            }


            function getPrimaryKindsForForm(formType) {
                if (formType === 'accountability') {
                    return getAccountabilitySourceConfig().primaryKinds;
                }

                if (formType === 'test_device_accountability') {
                    return [SOURCE_KIND.TEST_DEVICE, SOURCE_KIND.MASTER];
                }

                if (formType.includes('_test')) {
                    return [SOURCE_KIND.TEST_DEVICE, SOURCE_KIND.MASTER];
                }

                return [SOURCE_KIND.MASTER];
            }


            function getMissingSourceMessage(formType) {
                if (formType === 'accountability') {
                    return getAccountabilitySourceConfig().missingSourceMessage;
                }

                if (formType === 'test_device_accountability') {
                    return 'Test Device Accountability requires both the TEST DEVICE CSV and the ITSM Asset Master Tracker CSV.';
                }

                if (formType.includes('_test')) {
                    return 'Test Device Sanitation requires both the TEST DEVICE CSV and the ITSM Asset Master Tracker CSV.';
                }

                return 'Laptop / monitor sanitation requires the ITSM Asset Master Tracker CSV.';
            }


            function getMissingRequiredSourcesMessage(parsedSources, formType) {
                if (formType !== 'accountability' && formType !== 'test_device_accountability' && !formType.includes('_test')) {
                    return '';
                }

                const requiredKinds = formType === 'accountability'
                    ? getAccountabilitySourceConfig().requiredKinds
                    : [SOURCE_KIND.TEST_DEVICE, SOURCE_KIND.MASTER];
                const availableKinds = new Set(parsedSources.map((source) => source.matchKind));
                const hasAllRequiredKinds = requiredKinds.every((kind) => availableKinds.has(kind));

                return hasAllRequiredKinds ? '' : getMissingSourceMessage(formType);
            }


            function dedupeParsedSourcesByCanonicalName(parsedSources) {
                const latestSources = new Map();

                parsedSources.forEach((source) => {
                    const key = normalizeText(getCanonicalSourceName(source.name));
                    const existingSource = latestSources.get(key);

                    if (!existingSource || source.updatedAt >= existingSource.updatedAt) {
                        latestSources.set(key, source);
                    }
                });

                return Array.from(latestSources.values());
            }


            function getParsedRows(file) {
                return getParsedFileInfo(file).rows;
            }


            function getParsedRowsWithMultiHeader(file) {
                return parseNewHireSourceFile(file).rows;
            }


            function buildCompositeHeaders(topHeaderRow, labelHeaderRow) {
                const maxLength = Math.max(topHeaderRow.length, labelHeaderRow.length);
                const headerCounts = {};
                const headers = [];

                for (let index = 0; index < maxLength; index += 1) {
                    const topHeader = sanitizeCellValue(topHeaderRow[index]);
                    const labelHeader = sanitizeCellValue(labelHeaderRow[index]);
                    const combinedHeader = [topHeader, labelHeader].filter(Boolean).join(' ').trim() || `Unnamed Column ${index + 1}`;

                    if (!headerCounts[combinedHeader]) {
                        headerCounts[combinedHeader] = 1;
                        headers.push(combinedHeader);
                        continue;
                    }

                    headerCounts[combinedHeader] += 1;
                    headers.push(`${combinedHeader}_${headerCounts[combinedHeader]}`);
                }

                return headers;
            }


            function mapRowToHeaders(rowValues, headers) {
                const row = {};

                headers.forEach((header, index) => {
                    row[header] = sanitizeCellValue(rowValues[index]);
                });

                return row;
            }


            function mapNewHireRowToHeaders(rowValues, headers, labelHeaders) {
                const row = mapRowToHeaders(rowValues, headers);
                const positionHeaderIndex = labelHeaders.findIndex((header) => normalizeHeader(header) === 'position');

                if (positionHeaderIndex !== -1) {
                    row.POSITION = sanitizeCellValue(rowValues[positionHeaderIndex]);
                }

                return row;
            }


            async function loadDemoDatasets() {
                clearAlerts();
                setBusyState('upload', true);

                try {
                    const demoFilePaths = [
                        'assets/demo-data/ITSM Asset Master Tracker - Sanitized Masterdata (FAR August).csv',
                        'assets/demo-data/ITSM - Task Assignment - Original File - RELEASING_UPDATED.csv',
                        'assets/demo-data/Newly Hired Attendance - IT - April 2026.csv',
                        'assets/demo-data/TEST DEVICE 2025 - MONITORING.csv'
                    ];

                    const nextFiles = csvFiles.map((file) => normalizeStoredFile(file));
                    const savedSources = [];
                    const replacements = [];
                    const rejectedFiles = [];

                    for (const filePath of demoFilePaths) {
                        let content = '';
                        const fileName = filePath.split('/').pop();

                        try {
                            const resp = await fetch(filePath);
                            if (!resp.ok) {
                                throw new Error('HTTP ' + resp.status);
                            }
                            content = await resp.text();
                        } catch (err) {
                            console.warn('Could not fetch demo file ' + filePath + ':', err);
                            rejectedFiles.push(`${fileName}: failed to load demo file.`);
                            continue;
                        }

                        const incomingSource = normalizeStoredFile({
                            id: createSourceId(),
                            name: fileName,
                            content,
                            kind: SOURCE_KIND.AUTO,
                            createdAt: Date.now(),
                            updatedAt: Date.now()
                        });
                        const incomingDiagnostics = getSourceDiagnostics(incomingSource);
                        if (incomingDiagnostics.validationState === SOURCE_VALIDATION_STATE.INVALID) {
                            rejectedFiles.push(`${fileName}: ${incomingDiagnostics.blockingErrors[0]}`);
                            deleteSourceCaches(incomingSource.id);
                            continue;
                        }

                        const replacementIndexes = getSourceReplacementIndexes(nextFiles, incomingSource);
                        const existingIndex = replacementIndexes[0] ?? -1;
                        const previousSource = existingIndex >= 0 ? nextFiles[existingIndex] : null;
                        const previousDiagnostics = previousSource ? getSourceDiagnostics(previousSource) : null;
                        const validationSource = normalizeStoredFile({
                            ...(previousSource || {}),
                            id: incomingSource.id,
                            name: fileName,
                            content,
                            kind: previousSource ? previousSource.kind : SOURCE_KIND.AUTO,
                            createdAt: previousSource ? previousSource.createdAt : incomingSource.createdAt,
                            updatedAt: Date.now()
                        });
                        const sourceIsUnchanged = previousSource
                            && previousSource.name === validationSource.name
                            && previousSource.content === validationSource.content
                            && previousSource.kind === validationSource.kind;
                        const nextDiagnostics = sourceIsUnchanged
                            ? previousDiagnostics
                            : getSourceDiagnostics(validationSource);

                        const nextSource = normalizeStoredFile({
                            ...validationSource,
                            id: previousSource ? previousSource.id : validationSource.id
                        });
                        if (sourceIsUnchanged) {
                            deleteSourceCaches(validationSource.id);
                        } else {
                            moveSourceCaches(validationSource.id, nextSource.id);
                        }
                        if (replacementIndexes.length) {
                            nextFiles[existingIndex] = nextSource;
                            replacementIndexes
                                .slice(1)
                                .sort((left, right) => right - left)
                                .forEach((duplicateIndex) => nextFiles.splice(duplicateIndex, 1));
                            replacements.push({
                                name: fileName,
                                oldRowCount: previousDiagnostics ? previousDiagnostics.rowCount : 0,
                                newRowCount: nextDiagnostics.rowCount
                            });
                        } else {
                            nextFiles.push(nextSource);
                        }

                        savedSources.push({
                            file: nextSource,
                            diagnostics: nextDiagnostics
                        });
                    }

                    if (savedSources.length) {
                        pruneSourceCaches(nextFiles);
                        await writeStoredFiles(nextFiles, true);
                        csvFiles = nextFiles;
                        showSuccess(buildUploadSuccessMessage(savedSources, replacements));
                    }

                    if (rejectedFiles.length) {
                        showError(buildRejectedUploadMessage(rejectedFiles));
                    }
                } catch (error) {
                    console.error('Failed to load demo files:', error);
                    showError('Failed to load sample demo datasets.');
                } finally {
                    renderFileList();
                    setBusyState('upload', false);
                }
            }

            let currentPreviewFile = null;
            let currentRawRows = [];
            let currentFilteredIndices = [];
            let currentPreviewPage = 1;
            let currentPreviewPageSize = 100;
            let currentSearchTerm = '';
            let excelEventsBound = false;
            let excelSelection = null; // { startRow: 0, startCol: 0, endRow: 0, endCol: 0 }
            let isSelectingExcelCells = false;
            let excelToastTimeout = null;
            let excelCopyBtnTimeout = null;

            function getColumnLetter(colIndex) {
                let temp = colIndex + 1;
                let letter = '';
                while (temp > 0) {
                    let mod = (temp - 1) % 26;
                    letter = String.fromCharCode(65 + mod) + letter;
                    temp = Math.floor((temp - mod) / 26);
                }
                return letter;
            }

            function downloadCsvFile(fileName, content) {
                try {
                    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', fileName || 'dataset.csv');
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                } catch (err) {
                    console.error('Download CSV failed:', err);
                }
            }

            function ensureExcelElements() {
                if (!elements.excelPreviewModal && typeof document !== 'undefined') {
                    elements.excelPreviewModal = document.getElementById('excelPreviewModal');
                    elements.excelCloseBtn = document.getElementById('excelCloseBtn');
                    elements.excelCopyBtn = document.getElementById('excelCopyBtn');
                    elements.excelCopyBtnText = document.getElementById('excelCopyBtnText');
                    elements.excelDownloadBtn = document.getElementById('excelDownloadBtn');
                    elements.excelSearchInput = document.getElementById('excelSearchInput');
                    elements.excelSearchClearBtn = document.getElementById('excelSearchClearBtn');
                    elements.excelFormulaBar = document.getElementById('excelFormulaBar');
                    elements.excelActiveCellAddress = document.getElementById('excelActiveCellAddress');
                    elements.excelFormulaValue = document.getElementById('excelFormulaValue');
                    elements.excelSelectionCountBadge = document.getElementById('excelSelectionCountBadge');
                    elements.excelToast = document.getElementById('excelToast');
                    elements.excelTableHead = document.getElementById('excelTableHead');
                    elements.excelTableBody = document.getElementById('excelTableBody');
                    elements.excelTable = document.getElementById('excelTable');
                    elements.excelModalTitle = document.getElementById('excelModalTitle');
                    elements.excelRoleBadge = document.getElementById('excelRoleBadge');
                    elements.excelDimsBadge = document.getElementById('excelDimsBadge');
                    elements.excelRowRangeInfo = document.getElementById('excelRowRangeInfo');
                    elements.excelFilterActiveNotice = document.getElementById('excelFilterActiveNotice');
                    elements.excelEmptyState = document.getElementById('excelEmptyState');
                    elements.excelFirstPageBtn = document.getElementById('excelFirstPageBtn');
                    elements.excelPrevPageBtn = document.getElementById('excelPrevPageBtn');
                    elements.excelNextPageBtn = document.getElementById('excelNextPageBtn');
                    elements.excelLastPageBtn = document.getElementById('excelLastPageBtn');
                    elements.excelPageIndicator = document.getElementById('excelPageIndicator');
                    elements.excelPageSizeSelect = document.getElementById('excelPageSizeSelect');
                }
                return elements.excelPreviewModal;
            }

            Object.defineProperty(scope, 'excelSelection', {
                get: () => excelSelection,
                set: (val) => {
                    excelSelection = val;
                },
                configurable: true
            });

            function getExcelSelection() {
                return excelSelection;
            }

            function setExcelSelection(sel) {
                excelSelection = sel;
                updateExcelSelectionUI();
                return excelSelection;
            }

            function getExcelBodyRows() {
                if (!elements.excelTableBody) return [];
                if (elements.excelTableBody.rows && elements.excelTableBody.rows.length > 0) {
                    return elements.excelTableBody.rows;
                }
                const children = elements.excelTableBody.children || [];
                if (children.length === 1 && children[0]?.id === 'fragment') {
                    return children[0].children || [];
                }
                return children;
            }

            function getExcelHeadRows() {
                if (!elements.excelTableHead) return [];
                if (elements.excelTableHead.rows && elements.excelTableHead.rows.length > 0) {
                    return elements.excelTableHead.rows;
                }
                const children = elements.excelTableHead.children || [];
                if (children.length === 1 && children[0]?.id === 'fragment') {
                    return children[0].children || [];
                }
                return children;
            }

            function getVisibleExcelRowCount() {
                return getExcelBodyRows().length;
            }

            function getExcelTotalCols() {
                return currentRawRows.reduce((max, r) => Math.max(max, r.length), 0);
            }

            function openExcelPreviewModal(file) {
                if (!file) return;
                ensureExcelElements();
                bindExcelModalEvents();
                if (!elements.excelPreviewModal) return;

                currentPreviewFile = file;

                const papaParser = typeof Papa !== 'undefined' ? Papa : (typeof window !== 'undefined' ? window.Papa : null);
                let rows = [];
                if (papaParser) {
                    const parsed = papaParser.parse(file.content || '', { header: false, skipEmptyLines: false });
                    rows = parsed.data || [];
                } else {
                    rows = (file.content || '').split(/\r?\n/).map((line) => line.split(','));
                }

                while (rows.length > 0 && rows[rows.length - 1].every((cell) => !cell || String(cell).trim() === '')) {
                    rows.pop();
                }
                currentRawRows = rows;
                currentPreviewPage = 1;
                currentSearchTerm = '';
                excelSelection = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
                isSelectingExcelCells = false;

                if (elements.excelSearchInput) {
                    elements.excelSearchInput.value = '';
                }
                if (elements.excelSearchClearBtn) {
                    elements.excelSearchClearBtn.classList.add('hide');
                }

                if (elements.excelModalTitle) {
                    elements.excelModalTitle.textContent = file.name;
                }
                const effectiveKind = getEffectiveSourceKind(file);
                if (elements.excelRoleBadge) {
                    elements.excelRoleBadge.textContent = SOURCE_KIND_LABELS[effectiveKind] || 'CSV Source';
                }

                const isNewHire = effectiveKind === SOURCE_KIND.NEW_HIRE && currentRawRows.length >= 2;
                const headerRowCount = isNewHire ? 2 : 1;
                const totalDataRows = Math.max(0, currentRawRows.length - headerRowCount);
                const totalCols = currentRawRows.reduce((max, r) => Math.max(max, r.length), 0);

                if (elements.excelDimsBadge) {
                    elements.excelDimsBadge.textContent = `${totalDataRows.toLocaleString()} rows \u00D7 ${totalCols} cols`;
                }

                currentFilteredIndices = [];
                for (let i = 0; i < totalDataRows; i++) {
                    currentFilteredIndices.push(i);
                }

                renderExcelTable();
                elements.excelPreviewModal.classList.remove('hide');
                if (typeof document !== 'undefined' && document.body) {
                    document.body.classList.add('excel-modal-open');
                }
            }

            function closeExcelPreviewModal() {
                ensureExcelElements();
                if (!elements.excelPreviewModal) return;
                elements.excelPreviewModal.classList.add('hide');
                if (typeof document !== 'undefined' && document.body) {
                    document.body.classList.remove('excel-modal-open');
                }
                currentPreviewFile = null;
                currentRawRows = [];
                currentFilteredIndices = [];
                excelSelection = null;
                isSelectingExcelCells = false;
            }

            function updateExcelSelectionUI() {
                ensureExcelElements();
                if (!elements.excelTableBody || !elements.excelTableHead) return;

                const bodyRows = getExcelBodyRows();
                const visibleRowsCount = bodyRows.length;
                const totalCols = getExcelTotalCols();

                // Clear previous cell selection classes
                if (typeof elements.excelTableBody.querySelectorAll === 'function') {
                    const prevSelected = elements.excelTableBody.querySelectorAll('.excel-cell-selected, .excel-cell-anchor, .excel-sel-top, .excel-sel-bottom, .excel-sel-left, .excel-sel-right');
                    for (let i = 0; i < prevSelected.length; i++) {
                        prevSelected[i].classList.remove('excel-cell-selected', 'excel-cell-anchor', 'excel-sel-top', 'excel-sel-bottom', 'excel-sel-left', 'excel-sel-right');
                    }
                }
                if (elements.excelPreviewModal && typeof elements.excelPreviewModal.querySelectorAll === 'function') {
                    const prevHeaders = elements.excelPreviewModal.querySelectorAll('.excel-header-selected');
                    for (let i = 0; i < prevHeaders.length; i++) {
                        prevHeaders[i].classList.remove('excel-header-selected');
                    }
                }

                if (!excelSelection || visibleRowsCount === 0 || totalCols === 0) {
                    if (elements.excelActiveCellAddress) elements.excelActiveCellAddress.textContent = '-';
                    if (elements.excelFormulaValue) elements.excelFormulaValue.value = '';
                    if (elements.excelSelectionCountBadge) elements.excelSelectionCountBadge.textContent = '0 cells';
                    return;
                }

                const minR = Math.max(0, Math.min(excelSelection.startRow, excelSelection.endRow));
                const maxR = Math.min(visibleRowsCount - 1, Math.max(excelSelection.startRow, excelSelection.endRow));
                const minC = Math.max(0, Math.min(excelSelection.startCol, excelSelection.endCol));
                const maxC = Math.min(totalCols - 1, Math.max(excelSelection.startCol, excelSelection.endCol));

                for (let r = minR; r <= maxR; r++) {
                    const row = bodyRows[r];
                    if (!row) continue;
                    const rowCells = row.cells || row.children || [];

                    // Highlight row number
                    if (rowCells[0] && rowCells[0].classList) {
                        rowCells[0].classList.add('excel-header-selected');
                    }

                    for (let c = minC; c <= maxC; c++) {
                        const cell = rowCells[c + 1];
                        if (!cell || !cell.classList) continue;

                        cell.classList.add('excel-cell-selected');

                        if (r === excelSelection.startRow && c === excelSelection.startCol) {
                            cell.classList.add('excel-cell-anchor');
                        }

                        if (r === minR) cell.classList.add('excel-sel-top');
                        if (r === maxR) cell.classList.add('excel-sel-bottom');
                        if (c === minC) cell.classList.add('excel-sel-left');
                        if (c === maxC) cell.classList.add('excel-sel-right');
                    }
                }

                // Highlight column letters
                const headRows = getExcelHeadRows();
                const letterRow = headRows[0];
                if (letterRow) {
                    const letterCells = letterRow.cells || letterRow.children || [];
                    for (let c = minC; c <= maxC; c++) {
                        const th = letterCells[c + 1];
                        if (th && th.classList) th.classList.add('excel-header-selected');
                    }
                }

                // Address Name Box
                const startRowEl = bodyRows[excelSelection.startRow];
                const startRowCells = startRowEl ? (startRowEl.cells || startRowEl.children || []) : [];
                const startRowNumText = startRowCells[0] ? startRowCells[0].textContent : String(excelSelection.startRow + 1);

                const activeColLetter = getColumnLetter(excelSelection.startCol);
                const isSingleCell = (minR === maxR && minC === maxC);

                if (elements.excelActiveCellAddress) {
                    if (isSingleCell) {
                        elements.excelActiveCellAddress.textContent = `${activeColLetter}${startRowNumText}`;
                    } else {
                        const minColLetter = getColumnLetter(minC);
                        const maxColLetter = getColumnLetter(maxC);
                        const minRowEl = bodyRows[minR];
                        const minRowCells = minRowEl ? (minRowEl.cells || minRowEl.children || []) : [];
                        const minRowNumText = minRowCells[0] ? minRowCells[0].textContent : String(minR + 1);

                        const maxRowEl = bodyRows[maxR];
                        const maxRowCells = maxRowEl ? (maxRowEl.cells || maxRowEl.children || []) : [];
                        const maxRowNumText = maxRowCells[0] ? maxRowCells[0].textContent : String(maxR + 1);

                        elements.excelActiveCellAddress.textContent = `${minColLetter}${minRowNumText}:${maxColLetter}${maxRowNumText}`;
                    }
                }

                // Formula Bar value: active cell content (Read-only)
                if (elements.excelFormulaValue) {
                    const activeCell = startRowCells[excelSelection.startCol + 1];
                    elements.excelFormulaValue.value = activeCell ? activeCell.textContent : '';
                }

                // Selection count badge
                if (elements.excelSelectionCountBadge) {
                    const rowsCount = maxR - minR + 1;
                    const colsCount = maxC - minC + 1;
                    const totalSelected = rowsCount * colsCount;
                    if (totalSelected <= 1) {
                        elements.excelSelectionCountBadge.textContent = '1 cell';
                    } else {
                        elements.excelSelectionCountBadge.textContent = `${totalSelected.toLocaleString()} cells (${rowsCount}R \u00D7 ${colsCount}C)`;
                    }
                }
            }

            function getSelectedExcelCellsAsTSV() {
                ensureExcelElements();
                const bodyRows = getExcelBodyRows();
                const visibleRowsCount = bodyRows.length;
                const totalCols = getExcelTotalCols();
                if (!excelSelection || visibleRowsCount === 0 || totalCols === 0) return '';

                const minR = Math.max(0, Math.min(excelSelection.startRow, excelSelection.endRow));
                const maxR = Math.min(visibleRowsCount - 1, Math.max(excelSelection.startRow, excelSelection.endRow));
                const minC = Math.max(0, Math.min(excelSelection.startCol, excelSelection.endCol));
                const maxC = Math.min(totalCols - 1, Math.max(excelSelection.startCol, excelSelection.endCol));

                const lines = [];
                for (let r = minR; r <= maxR; r++) {
                    const row = bodyRows[r];
                    if (!row) continue;
                    const rowCells = row.cells || row.children || [];
                    const rowVals = [];
                    for (let c = minC; c <= maxC; c++) {
                        const cell = rowCells[c + 1];
                        let val = cell ? cell.textContent : '';
                        if (val.includes('\t') || val.includes('\n') || val.includes('\r') || val.includes('"')) {
                            val = `"${val.replace(/"/g, '""')}"`;
                        }
                        rowVals.push(val);
                    }
                    lines.push(rowVals.join('\t'));
                }
                return lines.join('\r\n');
            }

            function showExcelToast(message) {
                ensureExcelElements();
                if (!elements.excelToast) return;
                elements.excelToast.textContent = message;
                elements.excelToast.classList.remove('hide');
                elements.excelToast.classList.add('show');
                clearTimeout(excelToastTimeout);
                excelToastTimeout = setTimeout(() => {
                    if (elements.excelToast) {
                        elements.excelToast.classList.remove('show');
                        elements.excelToast.classList.add('hide');
                    }
                }, 2500);
            }

            async function copySelectedExcelCells() {
                ensureExcelElements();
                const textToCopy = getSelectedExcelCellsAsTSV();
                if (textToCopy === '' && (!excelSelection || getVisibleExcelRowCount() === 0)) {
                    showExcelToast('No cells selected to copy.');
                    return false;
                }

                const clipboardWriter = scope.writeTextToClipboard || (async (text) => {
                    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                        try {
                            await navigator.clipboard.writeText(text);
                            return true;
                        } catch (_) {}
                    }
                    if (!document.body || typeof document.execCommand !== 'function') return false;
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.setAttribute('readonly', '');
                    ta.style.position = 'fixed';
                    ta.style.left = '-9999px';
                    document.body.appendChild(ta);
                    ta.select();
                    try {
                        return document.execCommand('copy');
                    } catch (_) {
                        return false;
                    } finally {
                        ta.remove();
                    }
                });

                const success = await clipboardWriter(textToCopy);

                if (success) {
                    if (elements.excelCopyBtn) {
                        elements.excelCopyBtn.classList.add('copied');
                        if (elements.excelCopyBtnText) {
                            elements.excelCopyBtnText.textContent = '\u2713 Copied!';
                        }
                        clearTimeout(excelCopyBtnTimeout);
                        excelCopyBtnTimeout = setTimeout(() => {
                            if (elements.excelCopyBtn) elements.excelCopyBtn.classList.remove('copied');
                            if (elements.excelCopyBtnText) elements.excelCopyBtnText.textContent = 'Copy Cells';
                        }, 1800);
                    }

                    if (elements.excelTableBody && typeof elements.excelTableBody.querySelectorAll === 'function') {
                        const selectedCells = elements.excelTableBody.querySelectorAll('.excel-cell-selected');
                        for (let i = 0; i < selectedCells.length; i++) {
                            const c = selectedCells[i];
                            c.classList.remove('excel-cell-copied');
                            void c.offsetWidth;
                            c.classList.add('excel-cell-copied');
                        }
                    }

                    const bodyRows = getExcelBodyRows();
                    const visibleRowsCount = bodyRows.length;
                    const totalCols = getExcelTotalCols();
                    const minR = Math.max(0, Math.min(excelSelection.startRow, excelSelection.endRow));
                    const maxR = Math.min(visibleRowsCount - 1, Math.max(excelSelection.startRow, excelSelection.endRow));
                    const minC = Math.max(0, Math.min(excelSelection.startCol, excelSelection.endCol));
                    const maxC = Math.min(totalCols - 1, Math.max(excelSelection.startCol, excelSelection.endCol));
                    const cellCount = (maxR - minR + 1) * (maxC - minC + 1);
                    const countLabel = cellCount === 1 ? '1 cell' : `${cellCount.toLocaleString()} cells`;

                    showExcelToast(`\u2713 Copied ${countLabel} to clipboard! Ready to paste into Excel or Google Sheets.`);
                    return true;
                } else {
                    showExcelToast('Could not copy cells. Allow clipboard permissions and try again.');
                    return false;
                }
            }

            function renderExcelTable() {
                if (!elements.excelTableHead || !elements.excelTableBody) return;

                const effectiveKind = currentPreviewFile ? getEffectiveSourceKind(currentPreviewFile) : SOURCE_KIND.GENERAL;
                const isNewHire = effectiveKind === SOURCE_KIND.NEW_HIRE && currentRawRows.length >= 2;
                const headerRowCount = isNewHire ? 2 : 1;
                const totalDataRows = Math.max(0, currentRawRows.length - headerRowCount);
                const totalCols = currentRawRows.reduce((max, r) => Math.max(max, r.length), 0);

                // 1. Build Thead
                elements.excelTableHead.replaceChildren();

                // Top row: Column Letters (A, B, C...)
                const letterRow = document.createElement('tr');
                letterRow.className = 'excel-col-header-row';

                const cornerCell = document.createElement('th');
                cornerCell.className = 'excel-corner-cell';
                cornerCell.id = 'excelCornerCell';
                cornerCell.title = 'Select all visible cells';
                cornerCell.textContent = '';
                letterRow.appendChild(cornerCell);

                for (let c = 0; c < totalCols; c++) {
                    const th = document.createElement('th');
                    th.className = 'excel-col-letter';
                    th.dataset.col = String(c);
                    th.title = `Select Column ${getColumnLetter(c)}`;
                    th.textContent = getColumnLetter(c);
                    letterRow.appendChild(th);
                }
                elements.excelTableHead.appendChild(letterRow);

                // Header Titles Row 1
                const titleRow1 = document.createElement('tr');
                titleRow1.className = 'excel-title-header-row';
                const rowIdxHdr1 = document.createElement('th');
                rowIdxHdr1.className = 'excel-row-idx-hdr';
                rowIdxHdr1.textContent = '1';
                titleRow1.appendChild(rowIdxHdr1);

                const row0 = currentRawRows[0] || [];
                for (let c = 0; c < totalCols; c++) {
                    const th = document.createElement('th');
                    const val = row0[c] || '';
                    th.textContent = val;
                    th.title = val;
                    titleRow1.appendChild(th);
                }
                elements.excelTableHead.appendChild(titleRow1);

                // If New Hire, Header Titles Row 2
                if (isNewHire) {
                    const titleRow2 = document.createElement('tr');
                    titleRow2.className = 'excel-title-header-row';
                    titleRow2.style.top = '47px';
                    const rowIdxHdr2 = document.createElement('th');
                    rowIdxHdr2.className = 'excel-row-idx-hdr';
                    rowIdxHdr2.textContent = '2';
                    titleRow2.appendChild(rowIdxHdr2);

                    const row1 = currentRawRows[1] || [];
                    for (let c = 0; c < totalCols; c++) {
                        const th = document.createElement('th');
                        const val = row1[c] || '';
                        th.textContent = val;
                        th.title = val;
                        titleRow2.appendChild(th);
                    }
                    elements.excelTableHead.appendChild(titleRow2);
                }

                // 2. Build Tbody (Paginated)
                elements.excelTableBody.replaceChildren();

                const totalFiltered = currentFilteredIndices.length;
                const totalPages = Math.max(1, Math.ceil(totalFiltered / currentPreviewPageSize));
                if (currentPreviewPage > totalPages) {
                    currentPreviewPage = totalPages;
                }

                const startIndex = (currentPreviewPage - 1) * currentPreviewPageSize;
                const endIndex = Math.min(startIndex + currentPreviewPageSize, totalFiltered);

                if (totalFiltered === 0) {
                    if (elements.excelEmptyState) elements.excelEmptyState.classList.remove('hide');
                } else {
                    if (elements.excelEmptyState) elements.excelEmptyState.classList.add('hide');

                    const frag = document.createDocumentFragment();
                    for (let i = startIndex; i < endIndex; i++) {
                        const dataRowIdx = currentFilteredIndices[i];
                        const rawRow = currentRawRows[headerRowCount + dataRowIdx] || [];
                        const tr = document.createElement('tr');
                        tr.className = 'excel-data-row';

                        const visibleRowIdx = i - startIndex;

                        const rowTh = document.createElement('th');
                        rowTh.className = 'excel-row-number';
                        rowTh.dataset.row = String(visibleRowIdx);
                        rowTh.title = `Select Row ${headerRowCount + dataRowIdx + 1}`;
                        rowTh.textContent = String(headerRowCount + dataRowIdx + 1);
                        tr.appendChild(rowTh);

                        for (let c = 0; c < totalCols; c++) {
                            const td = document.createElement('td');
                            td.className = 'excel-cell';
                            td.dataset.r = String(visibleRowIdx);
                            td.dataset.c = String(c);
                            const cellVal = rawRow[c] !== undefined && rawRow[c] !== null ? String(rawRow[c]) : '';
                            td.textContent = cellVal;
                            td.title = cellVal;
                            tr.appendChild(td);
                        }
                        frag.appendChild(tr);
                    }
                    elements.excelTableBody.appendChild(frag);
                }

                // 3. Update Footer
                if (elements.excelRowRangeInfo) {
                    if (totalFiltered === 0) {
                        elements.excelRowRangeInfo.textContent = '0 rows matched filter';
                    } else {
                        elements.excelRowRangeInfo.textContent = `Showing ${(startIndex + 1).toLocaleString()} to ${endIndex.toLocaleString()} of ${totalFiltered.toLocaleString()} rows`;
                    }
                }

                if (elements.excelFilterActiveNotice) {
                    if (currentSearchTerm.trim()) {
                        elements.excelFilterActiveNotice.textContent = `(Filtered from ${totalDataRows.toLocaleString()} total rows)`;
                        elements.excelFilterActiveNotice.classList.remove('hide');
                    } else {
                        elements.excelFilterActiveNotice.classList.add('hide');
                    }
                }

                if (elements.excelPageIndicator) {
                    elements.excelPageIndicator.textContent = `Page ${currentPreviewPage} of ${totalPages}`;
                }

                if (elements.excelFirstPageBtn) elements.excelFirstPageBtn.disabled = currentPreviewPage <= 1;
                if (elements.excelPrevPageBtn) elements.excelPrevPageBtn.disabled = currentPreviewPage <= 1;
                if (elements.excelNextPageBtn) elements.excelNextPageBtn.disabled = currentPreviewPage >= totalPages;
                if (elements.excelLastPageBtn) elements.excelLastPageBtn.disabled = currentPreviewPage >= totalPages;

                const viewport = document.getElementById('excelGridViewport');
                if (viewport) {
                    viewport.scrollTop = 0;
                }

                // 4. Update Selection UI
                const visibleRowsCount = endIndex - startIndex;
                if (visibleRowsCount === 0 || totalCols === 0) {
                    excelSelection = null;
                } else if (!excelSelection) {
                    excelSelection = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
                } else {
                    excelSelection.startRow = Math.max(0, Math.min(visibleRowsCount - 1, excelSelection.startRow));
                    excelSelection.endRow = Math.max(0, Math.min(visibleRowsCount - 1, excelSelection.endRow));
                    excelSelection.startCol = Math.max(0, Math.min(totalCols - 1, excelSelection.startCol));
                    excelSelection.endCol = Math.max(0, Math.min(totalCols - 1, excelSelection.endCol));
                }
                updateExcelSelectionUI();
            }

            function filterExcelRows(term) {
                currentSearchTerm = term.trim().toLowerCase();
                const effectiveKind = currentPreviewFile ? getEffectiveSourceKind(currentPreviewFile) : SOURCE_KIND.GENERAL;
                const isNewHire = effectiveKind === SOURCE_KIND.NEW_HIRE && currentRawRows.length >= 2;
                const headerRowCount = isNewHire ? 2 : 1;
                const totalDataRows = Math.max(0, currentRawRows.length - headerRowCount);

                if (!currentSearchTerm) {
                    currentFilteredIndices = [];
                    for (let i = 0; i < totalDataRows; i++) {
                        currentFilteredIndices.push(i);
                    }
                } else {
                    currentFilteredIndices = [];
                    for (let i = 0; i < totalDataRows; i++) {
                        const row = currentRawRows[headerRowCount + i] || [];
                        const matches = row.some(cell => cell && String(cell).toLowerCase().includes(currentSearchTerm));
                        if (matches) {
                            currentFilteredIndices.push(i);
                        }
                    }
                }

                currentPreviewPage = 1;
                renderExcelTable();
            }

            function bindExcelModalEvents() {
                ensureExcelElements();
                if (!elements.excelPreviewModal || excelEventsBound) return;
                excelEventsBound = true;

                if (elements.excelCloseBtn) {
                    elements.excelCloseBtn.addEventListener('click', closeExcelPreviewModal);
                }

                if (elements.excelCopyBtn) {
                    elements.excelCopyBtn.addEventListener('click', () => {
                        copySelectedExcelCells();
                    });
                }

                if (elements.excelPreviewModal) {
                    elements.excelPreviewModal.addEventListener('click', (e) => {
                        if (e.target === elements.excelPreviewModal) {
                            closeExcelPreviewModal();
                        }
                    });
                }

                // Table mouse interaction delegation (Cell selection & Drag)
                const tableEl = elements.excelTable || (typeof document !== 'undefined' ? document.getElementById('excelTable') : null);
                if (tableEl && typeof tableEl.addEventListener === 'function') {
                    tableEl.addEventListener('mousedown', (e) => {
                        const target = e.target;
                        if (!target) return;

                        // 1. Data cell clicked
                        const cell = typeof target.closest === 'function' ? target.closest('td.excel-cell') : null;
                        if (cell && cell.dataset) {
                            const r = parseInt(cell.dataset.r, 10);
                            const c = parseInt(cell.dataset.c, 10);
                            if (!isNaN(r) && !isNaN(c)) {
                                if (e.shiftKey && excelSelection) {
                                    excelSelection.endRow = r;
                                    excelSelection.endCol = c;
                                } else {
                                    excelSelection = { startRow: r, startCol: c, endRow: r, endCol: c };
                                }
                                isSelectingExcelCells = true;
                                updateExcelSelectionUI();
                                if (typeof e.preventDefault === 'function') {
                                    e.preventDefault();
                                }
                            }
                            return;
                        }

                        // 2. Row number header clicked -> select whole row
                        const rowHdr = typeof target.closest === 'function' ? target.closest('th.excel-row-number') : null;
                        if (rowHdr && rowHdr.dataset) {
                            const r = parseInt(rowHdr.dataset.row, 10);
                            const totalCols = getExcelTotalCols();
                            if (!isNaN(r) && totalCols > 0) {
                                if (e.shiftKey && excelSelection) {
                                    excelSelection.endRow = r;
                                    excelSelection.startCol = 0;
                                    excelSelection.endCol = totalCols - 1;
                                } else {
                                    excelSelection = { startRow: r, startCol: 0, endRow: r, endCol: totalCols - 1 };
                                }
                                isSelectingExcelCells = false;
                                updateExcelSelectionUI();
                                if (typeof e.preventDefault === 'function') {
                                    e.preventDefault();
                                }
                            }
                            return;
                        }

                        // 3. Column letter header clicked -> select whole column
                        const colHdr = typeof target.closest === 'function' ? target.closest('th.excel-col-letter') : null;
                        if (colHdr && colHdr.dataset) {
                            const c = parseInt(colHdr.dataset.col, 10);
                            const visibleRowsCount = getVisibleExcelRowCount();
                            if (!isNaN(c) && visibleRowsCount > 0) {
                                if (e.shiftKey && excelSelection) {
                                    excelSelection.endCol = c;
                                    excelSelection.startRow = 0;
                                    excelSelection.endRow = visibleRowsCount - 1;
                                } else {
                                    excelSelection = { startRow: 0, startCol: c, endRow: visibleRowsCount - 1, endCol: c };
                                }
                                isSelectingExcelCells = false;
                                updateExcelSelectionUI();
                                if (typeof e.preventDefault === 'function') {
                                    e.preventDefault();
                                }
                            }
                            return;
                        }

                        // 4. Corner cell clicked -> select all visible cells
                        const cornerCell = typeof target.closest === 'function' ? target.closest('th.excel-corner-cell') : null;
                        if (cornerCell) {
                            const visibleRowsCount = getVisibleExcelRowCount();
                            const totalCols = getExcelTotalCols();
                            if (visibleRowsCount > 0 && totalCols > 0) {
                                excelSelection = { startRow: 0, startCol: 0, endRow: visibleRowsCount - 1, endCol: totalCols - 1 };
                                isSelectingExcelCells = false;
                                updateExcelSelectionUI();
                                if (typeof e.preventDefault === 'function') {
                                    e.preventDefault();
                                }
                            }
                            return;
                        }
                    });

                    tableEl.addEventListener('mouseover', (e) => {
                        if (!isSelectingExcelCells) return;
                        const target = e.target;
                        if (!target) return;
                        const cell = typeof target.closest === 'function' ? target.closest('td.excel-cell') : null;
                        if (cell && cell.dataset) {
                            const r = parseInt(cell.dataset.r, 10);
                            const c = parseInt(cell.dataset.c, 10);
                            if (!isNaN(r) && !isNaN(c) && excelSelection) {
                                if (excelSelection.endRow !== r || excelSelection.endCol !== c) {
                                    excelSelection.endRow = r;
                                    excelSelection.endCol = c;
                                    updateExcelSelectionUI();
                                }
                            }
                        }
                    });
                }

                if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
                    document.addEventListener('mouseup', () => {
                        isSelectingExcelCells = false;
                    });

                    document.addEventListener('keydown', (e) => {
                        if (!elements.excelPreviewModal || (elements.excelPreviewModal.classList && elements.excelPreviewModal.classList.contains('hide'))) {
                            return;
                        }

                        if (e.key === 'Escape') {
                            closeExcelPreviewModal();
                            return;
                        }

                        // Do not intercept if user is typing into search box
                        if (document.activeElement === elements.excelSearchInput) {
                            return;
                        }

                        // Ctrl+C or Cmd+C -> copy selected cells
                        if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
                            if (typeof e.preventDefault === 'function') e.preventDefault();
                            copySelectedExcelCells();
                            return;
                        }

                        // Ctrl+A or Cmd+A -> select all visible cells
                        if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
                            if (typeof e.preventDefault === 'function') e.preventDefault();
                            const visibleRowsCount = getVisibleExcelRowCount();
                            const totalCols = getExcelTotalCols();
                            if (visibleRowsCount > 0 && totalCols > 0) {
                                excelSelection = { startRow: 0, startCol: 0, endRow: visibleRowsCount - 1, endCol: totalCols - 1 };
                                updateExcelSelectionUI();
                            }
                            return;
                        }

                        // Arrow keys navigation
                        let dRow = 0;
                        let dCol = 0;
                        if (e.key === 'ArrowUp') dRow = -1;
                        else if (e.key === 'ArrowDown') dRow = 1;
                        else if (e.key === 'ArrowLeft') dCol = -1;
                        else if (e.key === 'ArrowRight') dCol = 1;

                        if (dRow !== 0 || dCol !== 0) {
                            const visibleRowsCount = getVisibleExcelRowCount();
                            const totalCols = getExcelTotalCols();
                            if (visibleRowsCount > 0 && totalCols > 0) {
                                if (typeof e.preventDefault === 'function') e.preventDefault();
                                if (!excelSelection) {
                                    excelSelection = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };
                                } else if (e.shiftKey) {
                                    excelSelection.endRow = Math.max(0, Math.min(visibleRowsCount - 1, excelSelection.endRow + dRow));
                                    excelSelection.endCol = Math.max(0, Math.min(totalCols - 1, excelSelection.endCol + dCol));
                                } else {
                                    const nextR = Math.max(0, Math.min(visibleRowsCount - 1, excelSelection.endRow + dRow));
                                    const nextC = Math.max(0, Math.min(totalCols - 1, excelSelection.endCol + dCol));
                                    excelSelection = { startRow: nextR, startCol: nextC, endRow: nextR, endCol: nextC };
                                }
                                updateExcelSelectionUI();

                                const bodyRows = getExcelBodyRows();
                                const activeRow = bodyRows[excelSelection.endRow];
                                const activeCells = activeRow ? (activeRow.cells || activeRow.children || []) : [];
                                const targetCell = activeCells[excelSelection.endCol + 1];
                                if (targetCell && typeof targetCell.scrollIntoView === 'function') {
                                    targetCell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                                }
                            }
                        }
                    });
                }

                if (elements.excelDownloadBtn) {
                    elements.excelDownloadBtn.addEventListener('click', () => {
                        if (currentPreviewFile) {
                            downloadCsvFile(currentPreviewFile.name, currentPreviewFile.content);
                        }
                    });
                }

                if (elements.excelSearchInput) {
                    elements.excelSearchInput.addEventListener('input', (e) => {
                        const val = e.target.value;
                        if (elements.excelSearchClearBtn) {
                            elements.excelSearchClearBtn.classList.toggle('hide', !val);
                        }
                        filterExcelRows(val);
                    });
                }

                if (elements.excelSearchClearBtn) {
                    elements.excelSearchClearBtn.addEventListener('click', () => {
                        if (elements.excelSearchInput) {
                            elements.excelSearchInput.value = '';
                            elements.excelSearchClearBtn.classList.add('hide');
                            filterExcelRows('');
                        }
                    });
                }

                if (elements.excelFirstPageBtn) {
                    elements.excelFirstPageBtn.addEventListener('click', () => {
                        currentPreviewPage = 1;
                        renderExcelTable();
                    });
                }
                if (elements.excelPrevPageBtn) {
                    elements.excelPrevPageBtn.addEventListener('click', () => {
                        if (currentPreviewPage > 1) {
                            currentPreviewPage--;
                            renderExcelTable();
                        }
                    });
                }
                if (elements.excelNextPageBtn) {
                    elements.excelNextPageBtn.addEventListener('click', () => {
                        currentPreviewPage++;
                        renderExcelTable();
                    });
                }
                if (elements.excelLastPageBtn) {
                    elements.excelLastPageBtn.addEventListener('click', () => {
                        const totalPages = Math.max(1, Math.ceil(currentFilteredIndices.length / currentPreviewPageSize));
                        currentPreviewPage = totalPages;
                        renderExcelTable();
                    });
                }
                if (elements.excelPageSizeSelect) {
                    elements.excelPageSizeSelect.addEventListener('change', (e) => {
                        currentPreviewPageSize = parseInt(e.target.value, 10) || 100;
                        currentPreviewPage = 1;
                        renderExcelTable();
                    });
                }
            }

        Object.assign(scope, {
        openExcelPreviewModal,
        closeExcelPreviewModal,
        copySelectedExcelCells,
        getSelectedExcelCellsAsTSV,
        updateExcelSelectionUI,
        getExcelSelection,
        setExcelSelection,
        downloadCsvFile,
        loadDemoDatasets,
        initializeApp,
        bindSourceManagement,
        renderFileList,
        getSourceValidationLabel,
        buildUploadSuccessMessage,
        buildRejectedUploadMessage,
        isStorageQuotaError,
        getSourceDiagnostics,
        getValidationParsedInfo,
        getSourceRoleWarning,
        headerMatchesField,
        getParsedFileInfo,
        parseStandardSourceFile,
        parseNewHireSourceFile,
        countUsableHeaders,
        saveFiles,
        readStoredFiles,
        writeStoredFiles,
        clearStoredFiles,
        openDatabase,
        readLegacyStoredFiles,
        normalizeStoredFile,
        createSourceId,
        detectSourceKindByName,
        getEffectiveSourceKind,
        getSourceReplacementIndexes,
        getAccountabilitySourceConfig,
        getMatchKindForForm,
        getMatchKindForAllowedKinds,
        getParsedSourcesForKinds,
        isSourceKindAllowedForForm,
        isSourceKindQueryableForForm,
        getPrimaryKindsForForm,
        getMissingSourceMessage,
        getMissingRequiredSourcesMessage,
        dedupeParsedSourcesByCanonicalName,
        getParsedRows,
        getParsedRowsWithMultiHeader,
        buildCompositeHeaders,
        mapRowToHeaders,
        mapNewHireRowToHeaders
        });
        Object.assign(App, {
        openExcelPreviewModal,
        closeExcelPreviewModal,
        copySelectedExcelCells,
        getSelectedExcelCellsAsTSV,
        updateExcelSelectionUI,
        getExcelSelection,
        setExcelSelection,
        downloadCsvFile,
        loadDemoDatasets,
        initializeApp,
        bindSourceManagement,
        renderFileList,
        getSourceValidationLabel,
        buildUploadSuccessMessage,
        buildRejectedUploadMessage,
        isStorageQuotaError,
        getSourceDiagnostics,
        getValidationParsedInfo,
        getSourceRoleWarning,
        headerMatchesField,
        getParsedFileInfo,
        parseStandardSourceFile,
        parseNewHireSourceFile,
        countUsableHeaders,
        saveFiles,
        readStoredFiles,
        writeStoredFiles,
        clearStoredFiles,
        openDatabase,
        readLegacyStoredFiles,
        normalizeStoredFile,
        createSourceId,
        detectSourceKindByName,
        getEffectiveSourceKind,
        getSourceReplacementIndexes,
        getAccountabilitySourceConfig,
        getMatchKindForForm,
        getMatchKindForAllowedKinds,
        getParsedSourcesForKinds,
        isSourceKindAllowedForForm,
        isSourceKindQueryableForForm,
        getPrimaryKindsForForm,
        getMissingSourceMessage,
        getMissingRequiredSourcesMessage,
        dedupeParsedSourcesByCanonicalName,
        getParsedRows,
        getParsedRowsWithMultiHeader,
        buildCompositeHeaders,
        mapRowToHeaders,
        mapNewHireRowToHeaders
        });
        Object.assign(App, {
        openExcelPreviewModal,
        closeExcelPreviewModal,
        copySelectedExcelCells,
        getSelectedExcelCellsAsTSV,
        updateExcelSelectionUI,
        downloadCsvFile,
        loadDemoDatasets,
        initializeApp,
        bindSourceManagement,
        renderFileList,
        getSourceValidationLabel,
        buildUploadSuccessMessage,
        buildRejectedUploadMessage,
        isStorageQuotaError,
        getSourceDiagnostics,
        getValidationParsedInfo,
        getSourceRoleWarning,
        headerMatchesField,
        getParsedFileInfo,
        parseStandardSourceFile,
        parseNewHireSourceFile,
        countUsableHeaders,
        saveFiles,
        readStoredFiles,
        writeStoredFiles,
        clearStoredFiles,
        openDatabase,
        readLegacyStoredFiles,
        normalizeStoredFile,
        createSourceId,
        detectSourceKindByName,
        getEffectiveSourceKind,
        getSourceReplacementIndexes,
        getAccountabilitySourceConfig,
        getMatchKindForForm,
        getMatchKindForAllowedKinds,
        getParsedSourcesForKinds,
        isSourceKindAllowedForForm,
        isSourceKindQueryableForForm,
        getPrimaryKindsForForm,
        getMissingSourceMessage,
        getMissingRequiredSourcesMessage,
        dedupeParsedSourcesByCanonicalName,
        getParsedRows,
        getParsedRowsWithMultiHeader,
        buildCompositeHeaders,
        mapRowToHeaders,
        mapNewHireRowToHeaders
        });
    }
})();
