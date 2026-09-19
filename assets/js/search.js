(function () {
    const App = window.YonduApp;
    const scope = App.scope;

    with (scope) {

            const compiledSchemaCache = new Map();
            const rowSchemaCache = new WeakMap();
            const normalizedAliasCache = new Map();
            const normalizedRowCache = new WeakMap();
            const rowArrayIndexCache = new WeakMap();
            const deviceIndexNames = [
                'testDeviceAssetDirect',
                'testDeviceAssetCanonical'
            ];


            function getNormalizedAliasConfig(fieldName) {
                const aliases = FIELD_ALIASES[fieldName];
                if (!aliases) {
                    return null;
                }

                const cached = normalizedAliasCache.get(fieldName);
                if (cached && cached.aliases === aliases) {
                    return cached;
                }

                const compiled = {
                    aliases,
                    exact: aliases.exact.map((alias) => normalizeHeader(alias)),
                    contains: aliases.contains.map((alias) => normalizeHeader(alias).replace(/\s+/g, ''))
                };
                normalizedAliasCache.set(fieldName, compiled);
                return compiled;
            }


            function getCompiledRowSchema(row) {
                const cached = rowSchemaCache.get(row);
                if (cached) {
                    return cached;
                }

                const keys = Object.keys(row);
                const signature = JSON.stringify(keys);
                let schema = compiledSchemaCache.get(signature);

                if (!schema) {
                    const normalizedKeys = keys.map((key) => {
                        const normalized = normalizeHeader(key);
                        return {
                            original: key,
                            normalized,
                            compact: normalized.replace(/\s+/g, ''),
                            isTestDeviceAssetColumn: normalized.includes('tag') || normalized.includes('asset')
                        };
                    });

                    schema = {
                        normalizedKeys,
                        fieldAccessors: new Map()
                    };
                    compiledSchemaCache.set(signature, schema);
                }

                rowSchemaCache.set(row, schema);
                return schema;
            }


            function getCompiledFieldAccessor(row, fieldName) {
                const schema = getCompiledRowSchema(row);
                if (schema.fieldAccessors.has(fieldName)) {
                    return schema.fieldAccessors.get(fieldName);
                }

                const aliases = getNormalizedAliasConfig(fieldName);
                if (!aliases) {
                    schema.fieldAccessors.set(fieldName, []);
                    return [];
                }

                const accessor = [];
                const appendKeys = (keysToRead) => {
                    const orderedKeys = fieldName === 'assetTag'
                        ? keysToRead.slice().reverse()
                        : keysToRead;
                    for (const key of orderedKeys) {
                        accessor.push(key.original);
                    }
                };

                for (const normalizedAlias of aliases.exact) {
                    appendKeys(schema.normalizedKeys.filter((item) => item.normalized === normalizedAlias));
                }

                for (const normalizedAlias of aliases.exact) {
                    appendKeys(schema.normalizedKeys.filter((item) =>
                        isAllowedHeaderPrefix(fieldName, normalizedAlias, item.normalized)
                    ));
                }

                for (const normalizedAlias of aliases.contains) {
                    appendKeys(schema.normalizedKeys.filter((item) => item.compact.includes(normalizedAlias)));
                }

                schema.fieldAccessors.set(fieldName, accessor);
                return accessor;
            }


            function getNormalizedRowData(row) {
                let cached = normalizedRowCache.get(row);
                if (!cached) {
                    cached = {
                        identifiers: Object.create(null),
                        personNames: Object.create(null),
                        normalizedText: Object.create(null),
                        allIdentifiers: null,
                        testDeviceAssetDirect: null,
                        testDeviceAssetCanonical: null
                    };
                    normalizedRowCache.set(row, cached);
                }
                return cached;
            }


            function getNormalizedIdentifierField(row, fieldName) {
                if (!row) {
                    return '';
                }

                const data = getNormalizedRowData(row);
                if (!Object.prototype.hasOwnProperty.call(data.identifiers, fieldName)) {
                    data.identifiers[fieldName] = normalizeIdentifier(getFieldValue(row, fieldName));
                }
                return data.identifiers[fieldName];
            }


            function rowAssetTagMatchesIdentifier(row, normalizedIdentifier) {
                if (!row || !normalizedIdentifier) {
                    return false;
                }

                const rowIdentifiers = getAssetTagSearchIdentifiers(getRawFieldValue(row, 'assetTag'));
                return getAssetTagSearchIdentifiers(normalizedIdentifier)
                    .some((identifier) => rowIdentifiers.includes(identifier));
            }


            function getNormalizedPersonField(row, fieldName) {
                if (!row) {
                    return '';
                }

                const data = getNormalizedRowData(row);
                if (!Object.prototype.hasOwnProperty.call(data.personNames, fieldName)) {
                    data.personNames[fieldName] = normalizePersonName(getFieldValue(row, fieldName));
                }
                return data.personNames[fieldName];
            }


            function getNormalizedTextField(row, fieldName) {
                if (!row) {
                    return '';
                }

                const data = getNormalizedRowData(row);
                if (!Object.prototype.hasOwnProperty.call(data.normalizedText, fieldName)) {
                    data.normalizedText[fieldName] = normalizeText(getFieldValue(row, fieldName));
                }
                return data.normalizedText[fieldName];
            }


            function ensureAllNormalizedRowIdentifiers(row) {
                const data = getNormalizedRowData(row);
                if (data.allIdentifiers) {
                    return data.allIdentifiers;
                }

                const allIdentifiers = new Set();
                const schema = getCompiledRowSchema(row);

                for (const key of schema.normalizedKeys) {
                    const rawValue = sanitizeCellValue(row[key.original]);
                    const normalizedValue = normalizeIdentifier(rawValue);
                    if (normalizedValue) {
                        allIdentifiers.add(normalizedValue);
                    }
                }

                data.allIdentifiers = allIdentifiers;
                return data.allIdentifiers;
            }


            function ensureTestDeviceAssetValueSets(row) {
                const data = getNormalizedRowData(row);
                if (data.testDeviceAssetDirect) {
                    return data;
                }

                const testDeviceAssetDirect = new Set();
                const testDeviceAssetCanonical = new Set();
                const schema = getCompiledRowSchema(row);

                for (const key of schema.normalizedKeys) {
                    if (!key.isTestDeviceAssetColumn) {
                        continue;
                    }

                    const rawValue = sanitizeCellValue(row[key.original]);
                    if (!rawValue) {
                        continue;
                    }

                    const normalizedValue = normalizeIdentifier(rawValue);
                    if (normalizedValue) {
                        testDeviceAssetDirect.add(normalizedValue);
                    }

                    if (isLikelyTestDeviceAssetTag(rawValue)) {
                        const canonicalValue = normalizeIdentifier(formatTestDeviceAssetTag(rawValue));
                        if (canonicalValue) {
                            testDeviceAssetCanonical.add(canonicalValue);
                        }
                    }
                }

                data.testDeviceAssetDirect = testDeviceAssetDirect;
                data.testDeviceAssetCanonical = testDeviceAssetCanonical;
                return data;
            }


            function getRowArrayIndex(rows) {
                let cached = rowArrayIndexCache.get(rows);
                if (cached) {
                    return cached;
                }

                const entries = [];
                for (let index = 0; index < rows.length; index += 1) {
                    if (!(index in rows)) {
                        continue;
                    }
                    entries.push({ row: rows[index], index });
                }
                cached = {
                    entries,
                    maps: new Map()
                };
                rowArrayIndexCache.set(rows, cached);
                return cached;
            }


            function getRowIndexValues(row, indexName) {
                if (indexName === 'assetTag') {
                    return getAssetTagSearchIdentifiers(getRawFieldValue(row, 'assetTag'));
                }
                if (indexName === 'employeeId' || indexName === 'serial' || indexName === 'imei') {
                    const value = getNormalizedIdentifierField(row, indexName);
                    return value ? [value] : [];
                }
                if (indexName === 'employeeName') {
                    const value = getNormalizedPersonField(row, 'employeeName');
                    return value ? [value] : [];
                }

                if (indexName === 'anyValue') {
                    return ensureAllNormalizedRowIdentifiers(row);
                }
                if (indexName === 'testDeviceAssetDirect') {
                    return ensureTestDeviceAssetValueSets(row).testDeviceAssetDirect;
                }
                if (indexName === 'testDeviceAssetCanonical') {
                    return ensureTestDeviceAssetValueSets(row).testDeviceAssetCanonical;
                }
                return [];
            }


            function getRowIndexMap(rows, indexName) {
                const index = getRowArrayIndex(rows);
                if (index.maps.has(indexName)) {
                    return index.maps.get(indexName);
                }

                const indexNames = deviceIndexNames.includes(indexName)
                    ? deviceIndexNames.filter((name) => !index.maps.has(name))
                    : [indexName];
                buildRowIndexMaps(index, indexNames);
                return index.maps.get(indexName);
            }


            function buildRowIndexMaps(index, indexNames) {
                const valueMaps = new Map();
                for (const name of indexNames) {
                    valueMaps.set(name, new Map());
                }

                for (const entry of index.entries) {
                    for (const name of indexNames) {
                        const valueMap = valueMaps.get(name);
                        const values = getRowIndexValues(entry.row, name);
                        for (const value of values) {
                            if (!valueMap.has(value)) {
                                valueMap.set(value, []);
                            }
                            valueMap.get(value).push(entry);
                        }
                    }
                }

                for (const [name, valueMap] of valueMaps) {
                    index.maps.set(name, valueMap);
                }
            }


            function getIndexedRowEntries(source, lookups) {
                const selected = new Map();
                for (const [indexName, query] of lookups) {
                    if (!query) {
                        continue;
                    }
                    const queries = indexName === 'assetTag'
                        ? getAssetTagSearchIdentifiers(query)
                        : [query];
                    for (const lookupQuery of queries) {
                        const matches = getRowIndexMap(source.rows, indexName).get(lookupQuery) || [];
                        for (const entry of matches) {
                            selected.set(entry.index, entry);
                        }
                    }
                }

                return Array.from(selected.values()).sort((left, right) => left.index - right.index);
            }


            function getHighestPriorityIndexedRowEntries(source, lookups) {
                for (const lookup of lookups) {
                    const matches = getIndexedRowEntries(source, [lookup]);
                    if (matches.length) {
                        return matches;
                    }
                }
                return [];
            }


            function getEmployeeCandidateEntries(source, searchQuery) {
                const lookups = [];
                if (searchQuery.identifier) {
                    lookups.push(['employeeId', searchQuery.identifier]);
                }
                if (isFullNameQuery(searchQuery)) {
                    lookups.push(['employeeName', searchQuery.personName]);
                }
                return getIndexedRowEntries(source, lookups);
            }


            function getDeviceCandidateEntries(source, normalizedQuery) {
                return getIndexedRowEntries(source, [
                    ['assetTag', normalizedQuery],
                    ['testDeviceAssetDirect', normalizedQuery],
                    ['testDeviceAssetCanonical', normalizedQuery],
                    ['serial', normalizedQuery],
                    ['imei', normalizedQuery],
                    ['anyValue', normalizedQuery]
                ]);
            }


            function getBestDeviceCandidateEntries(source, normalizedQuery) {
                return getHighestPriorityIndexedRowEntries(source, [
                    ['assetTag', normalizedQuery],
                    ['testDeviceAssetDirect', normalizedQuery],
                    ['testDeviceAssetCanonical', normalizedQuery],
                    ['serial', normalizedQuery],
                    ['imei', normalizedQuery],
                    ['anyValue', normalizedQuery]
                ]);
            }


            function getQueryCandidateEntries(source, searchQuery) {
                const normalizedQuery = searchQuery.identifier;
                const sourceKind = source.matchKind || source.effectiveKind;

                if (currentFormType.includes('_test') && normalizedQuery && (sourceKind === SOURCE_KIND.TEST_DEVICE || sourceKind === SOURCE_KIND.MASTER)) {
                    const priorityLookups = [
                        ['assetTag', normalizedQuery],
                        ['testDeviceAssetDirect', normalizedQuery],
                        ['testDeviceAssetCanonical', normalizedQuery],
                        ['serial', normalizedQuery],
                        ['imei', normalizedQuery]
                    ];
                    if (sourceKind === SOURCE_KIND.TEST_DEVICE) {
                        priorityLookups.push(['anyValue', normalizedQuery]);
                    }
                    return getHighestPriorityIndexedRowEntries(source, priorityLookups);
                }

                const priorityLookups = [];
                if (normalizedQuery) {
                    priorityLookups.push(
                        ['serial', normalizedQuery],
                        ['assetTag', normalizedQuery]
                    );
                }
                if (supportsFullNameSearch(source) && isFullNameQuery(searchQuery)) {
                    priorityLookups.push(['employeeName', searchQuery.personName]);
                }
                if (normalizedQuery) {
                    priorityLookups.push(['employeeId', normalizedQuery]);
                    if (sourceKind === SOURCE_KIND.TEST_DEVICE) {
                        priorityLookups.push(['anyValue', normalizedQuery]);
                    }
                }

                return getHighestPriorityIndexedRowEntries(source, priorityLookups);
            }


            function getIdentityCandidateEntries(source, identity) {
                if (identity.serial) {
                    const serialMatches = getIndexedRowEntries(source, [['serial', identity.serial]]);
                    if (serialMatches.length) {
                        return serialMatches;
                    }
                }
                if (identity.assetTag) {
                    const assetMatches = getIndexedRowEntries(source, [
                        ['assetTag', identity.assetTag],
                        ['testDeviceAssetDirect', identity.assetTag],
                        ['testDeviceAssetCanonical', identity.assetTag]
                    ]);
                    if (assetMatches.length) {
                        return assetMatches;
                    }
                }
                if (identity.employeeId) {
                    const employeeIdMatches = getIndexedRowEntries(source, [['employeeId', identity.employeeId]]);
                    if (employeeIdMatches.length) {
                        return employeeIdMatches;
                    }
                }
                if (identity.employeeNameKey) {
                    return getIndexedRowEntries(source, [['employeeName', identity.employeeNameKey]]);
                }
                return [];
            }

            function bindSearch() {
                elements.searchBtn.addEventListener('click', handleSearch);
                elements.searchInput.addEventListener('input', syncSearchHeaderOverflow);
                elements.searchInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        handleSearch();
                    }
                });

                if (elements.tdaAutofillBtn) {
                    elements.tdaAutofillBtn.addEventListener('click', handleTestDeviceAutofill);
                }
                if (elements.tdaAddBtn) {
                    elements.tdaAddBtn.addEventListener('click', () => {
                        const nextInput = appendTestDeviceLookupRow('');
                        if (nextInput) {
                            nextInput.focus();
                        }
                    });
                }
                if (elements.tdaAssetSearchInput) {
                    bindTestDeviceLookupInput(elements.tdaAssetSearchInput);
                }

                if (elements.tdaEmployeeSearchInput) {
                    elements.tdaEmployeeSearchInput.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            handleTestDeviceAutofill();
                        }
                    });
                }

                if (elements.accReplacementAutofillBtn) {
                    elements.accReplacementAutofillBtn.addEventListener('click', handleAccountabilityReplacementAutofill);
                }
                if (elements.accEmployeeSearchInput) {
                    elements.accEmployeeSearchInput.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            handleAccountabilityReplacementAutofill();
                        }
                    });
                }
                if (elements.accAssetSearchInput) {
                    elements.accAssetSearchInput.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            handleAccountabilityReplacementAutofill();
                        }
                    });
                }
            }


            function isMissingAutofillValue(value) {
                const normalizedValue = sanitizeCellValue(value).toLowerCase();
                return !normalizedValue || ['n/a', 'na', 'null', 'undefined', '-'].includes(normalizedValue);
            }


            function getIncompleteAutofillFieldLabels(formType, formData, options = {}) {
                const payload = formData || {};
                const isAccountabilityForm = formType === 'accountability' ||
                    formType === 'accountability_replacement' ||
                    formType === 'test_device_accountability';
                const details = isAccountabilityForm
                    ? (payload.accountability || {})
                    : (payload.returnSan || {});
                const missingFields = [];
                const requireEmployee = options.requireEmployee !== false;
                const requireAssets = options.requireAssets !== false;

                if (requireEmployee) {
                    const employeeFields = isAccountabilityForm
                        ? [
                            ['Employee name', details.name],
                            ['Employee number', details.employeeId],
                            ['Position', details.position]
                        ]
                        : [
                            ['Employee name', details.name],
                            ['Employee number', details.employeeId],
                            ['Business unit', details.businessUnit]
                        ];
                    employeeFields.forEach(([label, value]) => {
                        if (isMissingAutofillValue(value)) {
                            missingFields.push(label);
                        }
                    });
                }

                if (!requireAssets) {
                    return missingFields;
                }

                const assets = Array.isArray(details.assets) ? details.assets.filter(Boolean) : [];
                if (!assets.length) {
                    missingFields.push('Asset details');
                    return missingFields;
                }

                assets.forEach((asset, index) => {
                    const prefix = assets.length > 1 ? `Asset ${index + 1} ` : 'Asset ';
                    const description = asset.description || asset.model;
                    [
                        [`${prefix}tag`, asset.assetTag],
                        [`${prefix}description`, description],
                        [`${prefix}serial number`, asset.serial]
                    ].forEach(([label, value]) => {
                        if (isMissingAutofillValue(value)) {
                            missingFields.push(label);
                        }
                    });
                });

                return missingFields;
            }


            function showAutofillCompletenessWarning(formType, formData, options = {}) {
                const missingFields = getIncompleteAutofillFieldLabels(formType, formData, options);
                if (!missingFields.length) {
                    return '';
                }

                const displayedFields = missingFields.slice(0, 6);
                const moreFieldsText = missingFields.length > displayedFields.length
                    ? ` and ${missingFields.length - displayedFields.length} more`
                    : '';
                const message = `Some form details could not be autofilled (${displayedFields.join(', ')}${moreFieldsText}). Please upload the latest updated and corrected CSV file, then try Autofill again.`;
                showWarning(message);
                return message;
            }


            function buildTestDeviceAutofillWarningPayload(deviceEntries, employeeRow) {
                const entries = Array.isArray(deviceEntries) ? deviceEntries.filter(Boolean) : [];
                return {
                    accountability: {
                        name: getFieldValue(employeeRow, 'employeeName') || 'N/A',
                        employeeId: sanitizeEmployeeIdForPrint(getFieldValue(employeeRow, 'employeeId')) || 'N/A',
                        position: getFieldValue(employeeRow, 'position'),
                        assets: entries.map((entry) => ({
                            assetTag: entry.assetTag,
                            description: entry.model || entry.description,
                            serial: entry.serial
                        }))
                    }
                };
            }


            async function handleSearch() {
                await initPromise;

                const rawQuery = elements.searchInput.value.trim();
                const multiAssetQueries = parseReturnSanMultiAssetQueries(rawQuery);
                const searchQuery = buildSearchQuery(rawQuery);
                if (!multiAssetQueries.length && !searchQuery.identifier && !searchQuery.personName) {
                    showError(isReturnSanitizationMode()
                        ? (currentFormType.includes('_test')
                            ? 'Please enter one or more TD asset tags or serial numbers.'
                            : 'Please enter one or more asset tags or serial numbers, or search by employee.')
                        : (currentFormType.includes('_test')
                            ? 'Please enter a TD asset tag or serial number.'
                            : 'Please enter an EE ID, serial number, asset tag, or full employee name.'));
                    return;
                }

                if (!csvFiles.length) {
                    showError('Please upload at least one CSV source first.');
                    return;
                }

                clearAlerts();
                resetForm();
                elements.loadingIndicator.classList.remove('hide');
                setBusyState('search', true);

                await delay(0);

                try {
                    const parsedSources = dedupeParsedSourcesByCanonicalName(csvFiles.map((file) => {
                        const matchKind = getMatchKindForForm(file, currentFormType);

                        return {
                            ...file,
                            effectiveKind: getEffectiveSourceKind(file),
                            matchKind,
                            allowDirectMatch: isSourceKindQueryableForForm(matchKind, currentFormType),
                            rows: getParsedRows(file)
                        };
                    })).filter((source) => source.matchKind && getSourceDiagnostics(source).validationState !== SOURCE_VALIDATION_STATE.INVALID);

                    const queryableSources = parsedSources.filter((source) => source.allowDirectMatch);

                    if (!parsedSources.length || !queryableSources.length) {
                        elements.loadingIndicator.classList.add('hide');
                        showError(getMissingSourceMessage(currentFormType));
                        return;
                    }

                    const missingRequiredSourcesMessage = getMissingRequiredSourcesMessage(parsedSources, currentFormType);
                    if (missingRequiredSourcesMessage) {
                        elements.loadingIndicator.classList.add('hide');
                        showError(missingRequiredSourcesMessage);
                        return;
                    }

                    const resolution = isReturnSanitizationMode() && multiAssetQueries.length > 1
                        ? resolveMultiReturnSanFormData(multiAssetQueries, parsedSources, currentFormType)
                        : resolveFormData(searchQuery, rawQuery, parsedSources, currentFormType);

                    elements.loadingIndicator.classList.add('hide');

                    if (resolution.error) {
                        showError(resolution.error);
                        return;
                    }

                    fillForm(resolution.data);
                    const sourceSummary = resolution.sourcesUsed.length
                        ? ` using ${resolution.sourcesUsed.join(', ')}`
                        : '';
                    showSuccess(`Match found${sourceSummary}.`);
                    showAutofillCompletenessWarning(currentFormType, resolution.data);
                    focusPostAutofillField();
                } catch (error) {
                    console.error('Search failed:', error);
                    showError('Unable to search the loaded CSV sources.');
                } finally {
                    elements.loadingIndicator.classList.add('hide');
                    setBusyState('search', false);
                }
            }


            async function handleAccountabilityReplacementAutofill() {
                await initPromise;

                const rawEmployeeQuery = sanitizeCellValue(elements.accEmployeeSearchInput ? elements.accEmployeeSearchInput.value : '');
                const employeeSearchQuery = buildSearchQuery(rawEmployeeQuery);
                const rawAssetQuery = sanitizeCellValue(elements.accAssetSearchInput ? elements.accAssetSearchInput.value : '');
                const normalizedAssetQuery = normalizeIdentifier(rawAssetQuery);
                const hasEmployeeQuery = !!(employeeSearchQuery.identifier || employeeSearchQuery.personName);
                const hasAssetQuery = !!normalizedAssetQuery;

                if (!hasEmployeeQuery && !hasAssetQuery) {
                    showError('Please enter an EE ID, full employee name, asset tag, or serial number before autofill.');
                    return;
                }

                if (!csvFiles.length) {
                    showError('Please upload the required CSV sources first.');
                    return;
                }

                clearAlerts();
                resetForm();
                if (elements.accEmployeeSearchInput) {
                    elements.accEmployeeSearchInput.value = rawEmployeeQuery;
                }
                if (elements.accAssetSearchInput) {
                    elements.accAssetSearchInput.value = rawAssetQuery;
                }
                elements.loadingIndicator.classList.remove('hide');
                setBusyState('search', true);

                await delay(0);

                try {
                    const masterSources = getParsedSourcesForKinds([SOURCE_KIND.MASTER]);
                    if (!masterSources.length) {
                        elements.loadingIndicator.classList.add('hide');
                        showError('The ITSM Asset Master Tracker CSV is required for Replacement, Refresh, and Temporary accountability modes.');
                        return;
                    }

                    if (hasEmployeeQuery && !hasAssetQuery) {
                        const employeeAssetsResolution = findReplacementAccountabilityEmployeeRows(
                            masterSources,
                            employeeSearchQuery,
                            rawEmployeeQuery
                        );

                        elements.loadingIndicator.classList.add('hide');

                        if (employeeAssetsResolution.error || !employeeAssetsResolution.matches.length) {
                            showError(employeeAssetsResolution.error || `No employee match was found for "${rawEmployeeQuery}" in the ITSM Asset Master Tracker.`);
                            return;
                        }

                        const formData = {
                            accountability: buildReplacementAccountabilityPayload(employeeAssetsResolution.matches),
                            returnSan: createEmptyReturnSanPayload()
                        };
                        fillForm(formData);

                        const sourcesUsed = collectSourcesUsed(employeeAssetsResolution.matches);
                        const sourceSummary = sourcesUsed.length ? ` using ${sourcesUsed.join(', ')}` : '';
                        const assetSummary = employeeAssetsResolution.matches.length === 1
                            ? '1 asset'
                            : `${employeeAssetsResolution.matches.length} assets`;

                        showSuccess(`Autofilled asset accountability form with ${assetSummary}${sourceSummary}.`);
                        showAutofillCompletenessWarning(currentFormType, formData);
                        focusPostAutofillField();
                        return;
                    }

                    const notes = [];
                    const employeeResolution = hasEmployeeQuery
                        ? findReplacementAccountabilityEmployeeRecord(masterSources, employeeSearchQuery, rawEmployeeQuery)
                        : { match: null };
                    const assetResolution = hasAssetQuery
                        ? findReplacementAccountabilityAssetRecord(masterSources, normalizedAssetQuery, rawAssetQuery)
                        : { match: null };

                    const employeeMatch = (employeeResolution || {}).match || null;
                    const assetMatch = (assetResolution || {}).match || null;
                    const assetMatches = assetMatch ? [assetMatch] : [];

                    if (hasEmployeeQuery && !employeeMatch) {
                        notes.push(employeeResolution.error || `No employee match was found for "${rawEmployeeQuery}" in the ITSM Asset Master Tracker.`);
                    }
                    if (hasAssetQuery && !assetMatch) {
                        notes.push(assetResolution.error || `No asset or serial match was found for "${rawAssetQuery}" in the ITSM Asset Master Tracker.`);
                    }

                    elements.loadingIndicator.classList.add('hide');

                    if (!employeeMatch && !assetMatches.length) {
                        showError(notes[0] || 'No employee or asset match was found in the ITSM Asset Master Tracker.');
                        return;
                    }

                    const formData = {
                        accountability: buildReplacementAccountabilityPayload({
                            employeeMatch,
                            assetMatches
                        }),
                        returnSan: createEmptyReturnSanPayload()
                    };
                    fillForm(formData);

                    const sourcesUsed = collectSourcesUsed([employeeMatch, ...assetMatches]);
                    const sourceSummary = sourcesUsed.length ? ` using ${sourcesUsed.join(', ')}` : '';
                    const filledSections = [];
                    if (employeeMatch) {
                        filledSections.push('employee details');
                    }
                    if (assetMatches.length) {
                        filledSections.push(assetMatches.length === 1 ? '1 asset' : `${assetMatches.length} assets`);
                    }

                    const filledSummary = filledSections.length > 1
                        ? `${filledSections.slice(0, -1).join(', ')} and ${filledSections[filledSections.length - 1]}`
                        : filledSections[0];
                    const noteSummary = notes.length ? ` Note: ${notes.join(' ')}` : '';

                    showSuccess(`Autofilled asset accountability form with ${filledSummary}${sourceSummary}.${noteSummary}`);
                    showAutofillCompletenessWarning(currentFormType, formData, {
                        requireEmployee: hasEmployeeQuery,
                        requireAssets: true
                    });
                    focusPostAutofillField();
                } catch (error) {
                    console.error('Asset accountability replacement/refresh autofill failed:', error);
                    showError('Unable to autofill the asset accountability form from the saved CSV sources.');
                } finally {
                    elements.loadingIndicator.classList.add('hide');
                    setBusyState('search', false);
                }
            }


            function findReplacementAccountabilityEmployeeRecord(parsedSources, employeeSearchQuery, rawEmployeeQuery) {
                const resolution = findReplacementAccountabilityEmployeeRows(
                    parsedSources,
                    employeeSearchQuery,
                    rawEmployeeQuery,
                    { requireAssetIdentity: false }
                );

                if (resolution.error || !resolution.matches.length) {
                    return resolution.error
                        ? { error: resolution.error }
                        : { error: `No employee match was found for "${rawEmployeeQuery}" in the ITSM Asset Master Tracker.` };
                }

                return {
                    match: selectBestReplacementAccountabilityEmployeeMatch(resolution.matches)
                };
            }


            function findReplacementAccountabilityEmployeeRows(parsedSources, employeeSearchQuery, rawEmployeeQuery, options) {
                const requireAssetIdentity = !options || options.requireAssetIdentity !== false;
                const groupedMatches = new Map();
                let matchedEmployeeWithoutAsset = false;

                parsedSources.forEach((source) => {
                    getEmployeeCandidateEntries(source, employeeSearchQuery).forEach(({ row, index }) => {
                        const score = getMasterEmployeeMatchScore(row, employeeSearchQuery);
                        if (score <= 0) {
                            return;
                        }

                        if (requireAssetIdentity && !hasReplacementAccountabilityAssetIdentity(row)) {
                            matchedEmployeeWithoutAsset = true;
                            return;
                        }

                        const groupKey = getReplacementEmployeeGroupKey(row);
                        if (!groupKey) {
                            return;
                        }

                        if (!groupedMatches.has(groupKey)) {
                            groupedMatches.set(groupKey, []);
                        }

                        groupedMatches.get(groupKey).push({
                            row,
                            sourceId: source.id,
                            sourceKind: source.matchKind || source.effectiveKind,
                            sourceName: source.name,
                            index,
                            score
                        });
                    });
                });

                if (!groupedMatches.size) {
                    if (requireAssetIdentity && matchedEmployeeWithoutAsset) {
                        return { error: `No asset-tagged laptop rows were found for "${rawEmployeeQuery}" in the ITSM Asset Master Tracker.` };
                    }
                        return { error: `No employee match was found for "${rawEmployeeQuery}" in the ITSM Asset Master Tracker.` };
                }

                if (groupedMatches.size > 1) {
                    return { error: `Multiple employees matched "${rawEmployeeQuery}" in the ITSM Asset Master Tracker. Search by exact EE ID or full name instead.` };
                }

                const [matches] = Array.from(groupedMatches.values());
                return {
                    matches: dedupeReplacementEmployeeMatches(matches)
                };
            }


            function selectBestReplacementAccountabilityEmployeeMatch(matches) {
                return matches
                    .slice()
                    .sort(compareMatchCandidates)[0] || null;
            }


            function hasReplacementAccountabilityAssetIdentity(row) {
                return !!(
                    getNormalizedIdentifierField(row, 'assetTag') ||
                    getNormalizedIdentifierField(row, 'serial')
                );
            }


            function getReplacementEmployeeGroupKey(row) {
                const employeeId = getNormalizedIdentifierField(row, 'employeeId');
                const employeeName = getNormalizedPersonField(row, 'employeeName');

                if (employeeId) {
                    return `id:${employeeId}`;
                }
                if (employeeName) {
                    return `name:${employeeName}`;
                }
                return '';
            }


            function dedupeReplacementEmployeeMatches(matches) {
                const seen = new Map();

                matches.forEach((match) => {
                    const assetTag = getNormalizedIdentifierField(match.row, 'assetTag');
                    const serial = getNormalizedIdentifierField(match.row, 'serial');
                    const description = getNormalizedTextField(match.row, 'description');
                    const dedupeKey = assetTag || serial || description
                        ? `${assetTag}|${serial}|${description}`
                        : `${match.sourceId}|${match.index}`;

                    if (!seen.has(dedupeKey)) {
                        seen.set(dedupeKey, match);
                    }
                });

                return Array.from(seen.values()).sort((left, right) => {
                    const leftTag = sanitizeCellValue(getFieldValue(left.row, 'assetTag'));
                    const rightTag = sanitizeCellValue(getFieldValue(right.row, 'assetTag'));
                    return leftTag.localeCompare(rightTag) || left.index - right.index;
                });
            }


            function filterReplacementEmployeeMatchesByAssetQuery(matches, normalizedAssetQuery) {
                return matches.filter((match) => {
                    const serial = getNormalizedIdentifierField(match.row, 'serial');
                    return rowAssetTagMatchesIdentifier(match.row, normalizedAssetQuery) || serial === normalizedAssetQuery;
                });
            }


            function findReplacementAccountabilityAssetRecord(parsedSources, normalizedAssetQuery, rawAssetQuery) {
                const candidates = [];

                parsedSources.forEach((source) => {
                    getHighestPriorityIndexedRowEntries(source, [
                        ['assetTag', normalizedAssetQuery],
                        ['serial', normalizedAssetQuery]
                    ]).forEach(({ row, index }) => {
                        const score = getReplacementAccountabilityAssetMatchScore(row, normalizedAssetQuery);
                        if (score > 0) {
                            candidates.push(buildMatchCandidate(source, row, score, index, Number.NaN));
                        }
                    });
                });

                const result = resolveBestCandidate(
                    candidates,
                    `Multiple asset rows matched "${rawAssetQuery}" in the ITSM Asset Master Tracker. Search by exact asset tag or serial number instead.`
                );

                if (result.error || !result.match) {
                    return result.error
                        ? { error: result.error }
                        : { error: `No asset or serial match was found for "${rawAssetQuery}" in the ITSM Asset Master Tracker.` };
                }

                return result;
            }


            function getReplacementAccountabilityAssetMatchScore(row, normalizedAssetQuery) {
                let score = 0;

                if (rowAssetTagMatchesIdentifier(row, normalizedAssetQuery)) {
                    score = Math.max(score, 350);
                }
                if (getNormalizedIdentifierField(row, 'serial') === normalizedAssetQuery) {
                    score = Math.max(score, 300);
                }

                return score;
            }


            function buildReplacementAccountabilityPayload(matchesOrOptions) {
                if (!Array.isArray(matchesOrOptions)) {
                    const employeeMatch = matchesOrOptions && matchesOrOptions.employeeMatch
                        ? matchesOrOptions.employeeMatch
                        : null;
                    const assetMatches = matchesOrOptions && Array.isArray(matchesOrOptions.assetMatches)
                        ? matchesOrOptions.assetMatches.filter(Boolean)
                        : [];
                    const employeeRows = employeeMatch ? [employeeMatch.row] : [];
                    const payload = createEmptyAccountabilityPayload();

                    if (employeeRows.length) {
                        payload.name = pickFieldValue(employeeRows, 'employeeName');
                        payload.employeeId = sanitizeEmployeeIdForPrint(pickFieldValue(employeeRows, 'employeeId'));
                        payload.position = pickFieldValue(employeeRows, 'position');
                        payload.costCenter = pickFieldValue(employeeRows, 'costCenter');
                        payload.issuedName = pickFieldValue(employeeRows, 'issuedBy') || getDefaultIssuedName();
                        payload.issuedPosition = pickFieldValue(employeeRows, 'issuerPosition') || DEFAULT_ISSUED_POS;
                        payload.issuedDate = coerceDateToIso(pickFieldValue(employeeRows, 'issuedDate') || pickFieldValue(employeeRows, 'setupDate'));
                    }

                    payload.assets = assetMatches.map((match) => ({
                        particulars: inferAccountabilityParticulars(match.row),
                        assetTag: getFieldValue(match.row, 'assetTag') || 'N/A',
                        description: getFieldValue(match.row, 'description') || 'N/A',
                        serial: getFieldValue(match.row, 'serial') || 'N/A',
                        setupDate: coerceDateToIso(getFieldValue(match.row, 'setupDate'))
                    }));

                    return payload;
                }

                const matches = matchesOrOptions;
                const rows = matches.map((match) => match.row);
                return {
                    name: pickFieldValue(rows, 'employeeName') || 'N/A',
                    employeeId: sanitizeEmployeeIdForPrint(pickFieldValue(rows, 'employeeId')),
                    position: pickFieldValue(rows, 'position'),
                    costCenter: pickFieldValue(rows, 'costCenter'),
                    issuedName: pickFieldValue(rows, 'issuedBy') || getDefaultIssuedName(),
                    issuedPosition: pickFieldValue(rows, 'issuerPosition') || DEFAULT_ISSUED_POS,
                    pickupDate: '',
                    issuedDate: coerceDateToIso(pickFieldValue(rows, 'issuedDate') || pickFieldValue(rows, 'setupDate')),
                    assets: matches.map((match) => ({
                        particulars: inferAccountabilityParticulars(match.row),
                        assetTag: getFieldValue(match.row, 'assetTag') || 'N/A',
                        description: getFieldValue(match.row, 'description') || 'N/A',
                        serial: getFieldValue(match.row, 'serial') || 'N/A',
                        setupDate: coerceDateToIso(getFieldValue(match.row, 'setupDate'))
                    }))
                };
            }


            function inferAccountabilityParticulars(row) {
                const description = getNormalizedTextField(row, 'description');
                const assetTag = getNormalizedTextField(row, 'assetTag');

                if (description.includes('monitor') || assetTag.includes('monitor')) {
                    return 'Monitor';
                }

                return 'Laptop';
            }


            function createEmptyReturnSanPayload() {
                return {
                    name: '',
                    employeeId: '',
                    businessUnit: '',
                    email: '',
                    contact: '',
                    assetTag: '',
                    description: '',
                    serial: '',
                    assets: [],
                    assetManagerName: getDisplayValue('sanAssetManager'),
                    todayIso: getTodayDateInfo().iso
                };
            }


            function getDefaultIssuedName() {
                return getSignerRosterDefaultName('issued');
            }


            function createEmptyAccountabilityPayload() {
                return {
                    name: '',
                    employeeId: '',
                    position: '',
                    costCenter: '',
                    issuedName: getDefaultIssuedName(),
                    issuedPosition: DEFAULT_ISSUED_POS,
                    pickupDate: '',
                    issuedDate: '',
                    assets: []
                };
            }


            function pickFirstValue(values) {
                for (const value of values) {
                    const sanitized = sanitizeCellValue(value);
                    if (sanitized) {
                        return sanitized;
                    }
                }

                return '';
            }


            async function handleTestDeviceAssetSearch() {
                await initPromise;

                const rawQuery = sanitizeCellValue(elements.tdaAssetSearchInput ? elements.tdaAssetSearchInput.value : '');
                const normalizedQuery = normalizeIdentifier(rawQuery);
                if (!normalizedQuery) {
                    showError('Please enter a TD asset tag, serial number, or IMEI.');
                    return;
                }

                if (!csvFiles.length) {
                    showError('Please upload at least one CSV source first.');
                    return;
                }

                clearAlerts();
                clearTestDeviceAccountabilityDeviceFields();
                elements.loadingIndicator.classList.remove('hide');
                setBusyState('search', true);

                await delay(0);

                try {
                    const parsedSources = getParsedSourcesForKinds([SOURCE_KIND.TEST_DEVICE]);
                    if (!parsedSources.length) {
                        elements.loadingIndicator.classList.add('hide');
                        showError('Test Device Accountability requires the TEST DEVICE CSV.');
                        return;
                    }

                    const resolution = findTestDeviceAssetRecord(parsedSources, normalizedQuery, rawQuery);
                    elements.loadingIndicator.classList.add('hide');

                    if (resolution.error) {
                        showError(resolution.error);
                        return;
                    }

                    fillTestDeviceAccountabilityDevice(resolution.match.row);
                    showSuccess(`Test device matched using ${resolution.match.sourceName}.`);
                    focusPostAutofillField();
                } catch (error) {
                    console.error('Test-device asset lookup failed:', error);
                    showError('Unable to search the loaded TEST DEVICE CSV.');
                } finally {
                    elements.loadingIndicator.classList.add('hide');
                    setBusyState('search', false);
                }
            }


                async function handleTestDeviceAutofill() {
                await initPromise;

                const rawAssetQueries = getTestDeviceLookupValues();
                const rawEmployeeQuery = sanitizeCellValue(elements.tdaEmployeeSearchInput ? elements.tdaEmployeeSearchInput.value : '');
                const employeeSearchQuery = buildSearchQuery(rawEmployeeQuery);
                const hasEmployeeQuery = Boolean(employeeSearchQuery.identifier || employeeSearchQuery.personName);
                const validationMessage = getTestDeviceAutofillValidationMessage(rawAssetQueries, hasEmployeeQuery);

                if (validationMessage) {
                    showError(validationMessage);
                    return;
                }

                if (!csvFiles.length) {
                    showError('Please upload the required CSV sources first.');
                    return;
                }

                clearAlerts();
                clearTestDeviceAccountabilityDeviceFields();
                clearTestDeviceAccountabilityEmployeeFields();
                elements.loadingIndicator.classList.remove('hide');
                setBusyState('search', true);

                await delay(0);

                try {
                    const testDeviceSources = getParsedSourcesForKinds([SOURCE_KIND.TEST_DEVICE]);
                    const masterSources = getParsedSourcesForKinds([SOURCE_KIND.MASTER]);
                    const isReturnSanitizationTest = isReturnSanitizationMode() && currentFormType.includes('_test');

                    if (!testDeviceSources.length || !masterSources.length) {
                        elements.loadingIndicator.classList.add('hide');
                        showError(isReturnSanitizationTest
                            ? 'Test Device Sanitation requires both the TEST DEVICE CSV and the ITSM Asset Master Tracker CSV.'
                            : 'Test Device Accountability requires both the TEST DEVICE CSV and the ITSM Asset Master Tracker CSV.');
                        return;
                    }

                    const masterEmployeeResolution = findMasterEmployeeRecord(masterSources, employeeSearchQuery, rawEmployeeQuery);

                    if (masterEmployeeResolution.error || !masterEmployeeResolution.match) {
                        elements.loadingIndicator.classList.add('hide');
                        showError(masterEmployeeResolution.error || `No employee match was found for "${rawEmployeeQuery}" in the ITSM Asset Master Tracker.`);
                        return;
                    }

                    const deviceResolution = resolveTestDeviceAccountabilityDeviceEntries(rawAssetQueries, testDeviceSources, masterSources);
                    elements.loadingIndicator.classList.add('hide');

                    if (deviceResolution.error) {
                        showError(deviceResolution.error);
                        return;
                    }

                    const autofillWarningPayload = isReturnSanitizationTest
                        ? {
                            accountability: createEmptyAccountabilityPayload(),
                            returnSan: buildReturnSanPayloadFromTestDeviceEntries(
                                deviceResolution.deviceEntries,
                                masterEmployeeResolution.match.row
                            )
                        }
                        : buildTestDeviceAutofillWarningPayload(
                            deviceResolution.deviceEntries,
                            masterEmployeeResolution.match.row
                        );

                    if (isReturnSanitizationTest) {
                        fillTestDeviceAccountabilityDevices(deviceResolution.deviceEntries, masterEmployeeResolution.match.row);
                        fillForm(autofillWarningPayload);
                    } else {
                        fillTestDeviceAccountabilityDevices(deviceResolution.deviceEntries, masterEmployeeResolution.match.row);
                    }

                    const sourcesUsed = collectSourcesUsed([
                        ...deviceResolution.matches,
                        masterEmployeeResolution.match
                    ]);
                    const sourceSummary = sourcesUsed.length ? ` using ${sourcesUsed.join(', ')}` : '';
                    const successMessage = isReturnSanitizationTest
                        ? `Autofilled test device sanitation forms${sourceSummary}.`
                        : `Autofilled test device accountability form${sourceSummary}.`;
                    showAutofillCompletenessWarning(
                        currentFormType,
                        autofillWarningPayload
                    );

                    if (deviceResolution.warnings.length) {
                        const warningMessage = deviceResolution.warnings.length
                            ? ` Note: ${deviceResolution.warnings.join('; ')}.`
                            : '';
                        showSuccess(`${successMessage}${warningMessage}`);
                        focusPostAutofillField();
                        return;
                    }

                    showSuccess(successMessage);
                    focusPostAutofillField();
                } catch (error) {
                    console.error('Test-device autofill failed:', error);
                    showError(isReturnSanitizationTest
                        ? 'Unable to autofill the Test Device sanitation form from the saved CSV sources.'
                        : 'Unable to autofill the Test Device accountability form from the saved CSV sources.');
                } finally {
                    elements.loadingIndicator.classList.add('hide');
                    setBusyState('search', false);
                }
            }


            function getTestDeviceAutofillValidationMessage(rawAssetQueries, hasEmployeeQuery) {
                const hasAssetQuery = Array.isArray(rawAssetQueries) && rawAssetQueries.length > 0;
                if (hasAssetQuery && !hasEmployeeQuery) {
                    return 'Please enter an assignee before autofill.';
                }
                if (!hasAssetQuery && hasEmployeeQuery) {
                    return 'Please enter at least one test device asset tag before autofill.';
                }
                if (!hasAssetQuery && !hasEmployeeQuery) {
                    return 'Please enter a test device asset tag and an assignee before autofill.';
                }
                return '';
            }


            function resolveTestDeviceAccountabilityDeviceEntries(rawAssetQueries, testDeviceSources, masterSources) {
                const deviceEntries = [];
                const matches = [];
                const warnings = [];

                for (const rawAssetQuery of rawAssetQueries) {
                    const normalizedAssetQuery = normalizeIdentifier(rawAssetQuery);
                    const assignmentResolution = findTestDeviceAssetRecord(testDeviceSources, normalizedAssetQuery, rawAssetQuery);

                    if (assignmentResolution.error || !assignmentResolution.match) {
                        return {
                            error: assignmentResolution.error || `No matching test-device assignment record was found for "${rawAssetQuery}".`
                        };
                    }

                    const assignmentRow = assignmentResolution.match.row;
                    const masterDeviceResolution = findMasterDeviceRecord(masterSources, normalizedAssetQuery, rawAssetQuery);
                    const deviceRow = (masterDeviceResolution.match || {}).row || assignmentRow;

                    deviceEntries.push(buildTestDeviceAccountabilityDeviceEntry(assignmentRow, deviceRow, rawAssetQuery));
                    matches.push(assignmentResolution.match);

                    if (masterDeviceResolution.match) {
                        matches.push(masterDeviceResolution.match);
                    } else {
                        warnings.push(`device details for "${rawAssetQuery}" were not found in the ITSM Asset Master Tracker, so the assignment row was used`);
                    }
                }

                return {
                    deviceEntries,
                    matches,
                    warnings
                };
            }


            function buildReturnSanPayloadFromTestDeviceEntries(deviceEntries, employeeRow) {
                const normalizedEntries = Array.isArray(deviceEntries)
                    ? deviceEntries.filter((entry) => entry && typeof entry === 'object')
                    : [];
                const employeeName = sanitizeCellValue(employeeRow ? getFieldValue(employeeRow, 'employeeName') : 'N/A');
                const employeeId = sanitizeEmployeeIdForPrint(
                    sanitizeCellValue(employeeRow ? getFieldValue(employeeRow, 'employeeId') : '')
                );
                const firstEntry = normalizedEntries[0] || {};

                return {
                    name: employeeName || 'N/A',
                    employeeId: employeeId || 'N/A',
                    businessUnit: sanitizeCellValue(employeeRow ? getFieldValue(employeeRow, 'businessUnit') : ''),
                    email: sanitizeCellValue(employeeRow ? getFieldValue(employeeRow, 'email') : ''),
                    contact: sanitizeCellValue(employeeRow ? getFieldValue(employeeRow, 'contact') : ''),
                    assetTag: sanitizeCellValue(firstEntry.assetTag) || 'N/A',
                    description: sanitizeCellValue(firstEntry.model) || sanitizeCellValue(firstEntry.description) || '',
                    serial: sanitizeCellValue(firstEntry.serial) || 'N/A',
                    assets: normalizedEntries.map((entry) => ({
                        assetTag: sanitizeCellValue(entry.assetTag) || 'N/A',
                        description: sanitizeCellValue(entry.model) || sanitizeCellValue(entry.description) || 'N/A',
                        serial: sanitizeCellValue(entry.serial) || 'N/A',
                        remarks: ''
                    })),
                    assetManagerName: getDisplayValue('sanAssetManager'),
                    todayIso: getTodayDateInfo().iso
                };
            }


            async function handleTestDeviceEmployeeSearch() {
                await initPromise;

                const rawQuery = sanitizeCellValue(elements.tdaEmployeeSearchInput ? elements.tdaEmployeeSearchInput.value : '');
                const searchQuery = buildSearchQuery(rawQuery);
                if (!searchQuery.identifier && !searchQuery.personName) {
                    showError('Please enter an EE ID or full employee name.');
                    return;
                }

                if (!csvFiles.length) {
                    showError('Please upload at least one CSV source first.');
                    return;
                }

                clearAlerts();
                clearTestDeviceAccountabilityEmployeeFields();
                elements.loadingIndicator.classList.remove('hide');
                setBusyState('search', true);

                await delay(0);

                try {
                    const parsedSources = getParsedSourcesForKinds([SOURCE_KIND.MASTER]);
                    if (!parsedSources.length) {
                        elements.loadingIndicator.classList.add('hide');
                        showError('Test Device Accountability requires the ITSM Asset Master Tracker CSV for assignee lookup.');
                        return;
                    }

                    const resolution = findMasterEmployeeRecord(parsedSources, searchQuery, rawQuery);
                    elements.loadingIndicator.classList.add('hide');

                    if (resolution.error) {
                        showError(resolution.error);
                        return;
                    }

                    fillTestDeviceAccountabilityEmployee(resolution.match.row);
                    showSuccess(`Assignee matched using ${resolution.match.sourceName}.`);
                    focusPostAutofillField();
                } catch (error) {
                    console.error('Test-device assignee lookup failed:', error);
                    showError('Unable to search the loaded ITSM Asset Master Tracker CSV.');
                } finally {
                    elements.loadingIndicator.classList.add('hide');
                    setBusyState('search', false);
                }
            }


            function findTestDeviceAssignmentRecord(parsedSources, normalizedAssetQuery, employeeSearchQuery, rawAssetQuery, rawEmployeeQuery) {
                const candidates = [];

                parsedSources.forEach((source) => {
                    getDeviceCandidateEntries(source, normalizedAssetQuery).forEach(({ row, index }) => {
                        const score = getTestDeviceAssignmentMatchScore(row, normalizedAssetQuery, employeeSearchQuery);
                        if (score > 0) {
                            candidates.push(buildMatchCandidate(source, row, score, index, Number.NaN));
                        }
                    });
                });

                const result = resolveBestCandidate(
                    candidates,
                    `Multiple test-device assignment rows matched "${rawAssetQuery}" and "${rawEmployeeQuery}". Use an exact TD asset tag and exact EE ID or full employee name.`
                );

                if (result.error || !result.match) {
                    return result.error
                        ? { error: result.error }
                        : { error: `No test-device assignment match was found for asset "${rawAssetQuery}" with assignee "${rawEmployeeQuery}" in the saved TEST DEVICE source.` };
                }

                return result;
            }


            function findTestDeviceAssetRecord(parsedSources, normalizedQuery, rawQuery) {
                const candidates = [];

                parsedSources.forEach((source) => {
                    getBestDeviceCandidateEntries(source, normalizedQuery).forEach(({ row, index }) => {
                        const score = getTestDeviceAssetMatchScore(row, normalizedQuery);
                        if (score > 0) {
                            candidates.push(buildMatchCandidate(source, row, score, index, Number.NaN));
                        }
                    });
                });

                const result = resolveUniqueDeviceCandidate(
                    candidates,
                    `Multiple test devices matched "${rawQuery}". Search by exact TD asset tag, serial number, or IMEI instead.`
                );

                if (result.error || !result.match) {
                    return result.error
                        ? { error: result.error }
                        : { error: `No test-device match was found for "${rawQuery}" in the saved TEST DEVICE CSV.` };
                }

                return result;
            }


            function findMasterDeviceRecord(parsedSources, normalizedQuery, rawQuery) {
                const candidates = [];

                parsedSources.forEach((source) => {
                    getBestDeviceCandidateEntries(source, normalizedQuery).forEach(({ row, index }) => {
                        const score = getTestDeviceAssetMatchScore(row, normalizedQuery);
                        if (score > 0) {
                            candidates.push(buildMatchCandidate(source, row, score, index, Number.NaN));
                        }
                    });
                });

                const result = resolveUniqueDeviceCandidate(
                    candidates,
                    `Multiple device rows matched "${rawQuery}" in the ITSM Asset Master Tracker. Search by exact asset tag, serial number, or IMEI instead.`
                );

                if (result.error || !result.match) {
                    return result.error ? { error: result.error } : { match: null };
                }

                return result;
            }


            function findMasterEmployeeRecord(parsedSources, searchQuery, rawQuery) {
                const candidates = [];

                parsedSources.forEach((source) => {
                    getHighestPriorityIndexedRowEntries(source, [
                        ['employeeId', searchQuery.identifier],
                        ...(isFullNameQuery(searchQuery) ? [['employeeName', searchQuery.personName]] : [])
                    ]).forEach(({ row, index }) => {
                        const score = getMasterEmployeeMatchScore(row, searchQuery);
                        if (score > 0) {
                            candidates.push(buildMatchCandidate(source, row, score, index, Number.NaN));
                        }
                    });
                });

                const result = resolveBestCandidate(
                    candidates,
                    `Multiple employees matched "${rawQuery}" in the ITSM Asset Master Tracker. Search by exact EE ID or full name instead.`
                );

                if (result.error || !result.match) {
                    return result.error
                        ? { error: result.error }
                        : { error: `No employee match was found for "${rawQuery}" in the ITSM Asset Master Tracker.` };
                }

                return result;
            }


            function resolveFormData(searchQuery, rawQuery, parsedSources, formType) {
                const queryMatches = [];

                for (const source of parsedSources) {
                    if (!source.allowDirectMatch) {
                        continue;
                    }

                    const result = findBestQueryMatch(source, searchQuery, parsedSources);
                    if (result.error) {
                        return { error: result.error };
                    }
                    if (result.match) {
                        queryMatches.push(result.match);
                    }
                }

                if (!queryMatches.length) {
                    return { error: `No exact match was found for "${rawQuery}" in the saved sources.` };
                }

                const directMatchSelection = selectBestMatchesByKind(queryMatches, rawQuery, 'direct');
                if (directMatchSelection.error) {
                    return { error: directMatchSelection.error };
                }

                const primaryKinds = getPrimaryKindsForForm(formType);
                const primaryMatch = primaryKinds.map((kind) => directMatchSelection.byKind[kind]).find(Boolean);

                if (!primaryMatch) {
                    const contextLabel = formType === 'accountability'
                        ? 'an accountability device record'
                        : 'a return or sanitization record';
                    return { error: `Found "${rawQuery}" in saved sources, but not in ${contextLabel}.` };
                }

                const identity = buildIdentity([
                    primaryMatch,
                    directMatchSelection.byKind[SOURCE_KIND.MASTER],
                    directMatchSelection.byKind[SOURCE_KIND.ITSM],
                    directMatchSelection.byKind[SOURCE_KIND.NEW_HIRE],
                    directMatchSelection.byKind[SOURCE_KIND.TEST_DEVICE],
                    directMatchSelection.byKind[SOURCE_KIND.GENERAL]
                ]);

                const supportingSelection = findSupportingMatches(parsedSources, identity, directMatchSelection.byKind, rawQuery);
                if (supportingSelection.error) {
                    return { error: supportingSelection.error };
                }

                const rowsByKind = {
                    [SOURCE_KIND.MASTER]: (directMatchSelection.byKind[SOURCE_KIND.MASTER] || supportingSelection.byKind[SOURCE_KIND.MASTER] || {}).row || null,
                    [SOURCE_KIND.ITSM]: (directMatchSelection.byKind[SOURCE_KIND.ITSM] || supportingSelection.byKind[SOURCE_KIND.ITSM] || {}).row || null,
                    [SOURCE_KIND.NEW_HIRE]: (directMatchSelection.byKind[SOURCE_KIND.NEW_HIRE] || supportingSelection.byKind[SOURCE_KIND.NEW_HIRE] || {}).row || null,
                    [SOURCE_KIND.TEST_DEVICE]: (directMatchSelection.byKind[SOURCE_KIND.TEST_DEVICE] || supportingSelection.byKind[SOURCE_KIND.TEST_DEVICE] || {}).row || null,
                    [SOURCE_KIND.GENERAL]: (directMatchSelection.byKind[SOURCE_KIND.GENERAL] || supportingSelection.byKind[SOURCE_KIND.GENERAL] || {}).row || null
                };

                const sourcesUsed = collectSourcesUsed([
                    directMatchSelection.byKind[SOURCE_KIND.MASTER],
                    directMatchSelection.byKind[SOURCE_KIND.ITSM],
                    directMatchSelection.byKind[SOURCE_KIND.NEW_HIRE],
                    directMatchSelection.byKind[SOURCE_KIND.TEST_DEVICE],
                    directMatchSelection.byKind[SOURCE_KIND.GENERAL],
                    supportingSelection.byKind[SOURCE_KIND.MASTER],
                    supportingSelection.byKind[SOURCE_KIND.ITSM],
                    supportingSelection.byKind[SOURCE_KIND.NEW_HIRE],
                    supportingSelection.byKind[SOURCE_KIND.TEST_DEVICE],
                    supportingSelection.byKind[SOURCE_KIND.GENERAL]
                ]);

                return {
                    data: buildFormPayload(rowsByKind, parsedSources, formType, rawQuery),
                    sourcesUsed
                };
            }


            function resolveMultiReturnSanFormData(assetQueries, parsedSources, formType) {
                const normalizedQueries = Array.from(new Set(assetQueries.map((query) => normalizeIdentifier(query)).filter(Boolean)));
                if (!normalizedQueries.length) {
                    return { error: 'Please enter at least one asset tag or serial number.' };
                }

                if (formType.includes('_test')) {
                    return resolveMultiTestDeviceReturnSanData(normalizedQueries, parsedSources);
                }

                return resolveMultiLaptopReturnSanData(normalizedQueries, parsedSources);
            }


            function resolveMultiLaptopReturnSanData(normalizedQueries, parsedSources) {
                const masterSources = parsedSources.filter((source) => (source.matchKind || source.effectiveKind) === SOURCE_KIND.MASTER);
                if (!masterSources.length) {
                    return { error: 'Laptop / monitor sanitation requires the ITSM Asset Master Tracker CSV.' };
                }

                const matches = [];
                for (const normalizedQuery of normalizedQueries) {
                    const resolution = findMasterDeviceRecord(masterSources, normalizedQuery, normalizedQuery);
                    if (resolution.error) {
                        return { error: resolution.error };
                    }
                    if (!resolution.match) {
                        return { error: `No asset match was found for "${normalizedQuery}" in the ITSM Asset Master Tracker.` };
                    }
                    matches.push(resolution.match);
                }

                const firstRow = matches[0].row;
                return {
                    data: {
                        accountability: createEmptyAccountabilityPayload(),
                        returnSan: buildMultiReturnSanPayload(matches, {
                            name: getFieldValue(firstRow, 'employeeName') || 'N/A',
                            employeeId: pickFirstValue([sanitizeEmployeeIdForPrint(getFieldValue(firstRow, 'employeeId')), 'N/A']),
                            businessUnit: getFieldValue(firstRow, 'businessUnit'),
                            email: getFieldValue(firstRow, 'email'),
                            contact: getFieldValue(firstRow, 'contact')
                        })
                    },
                    sourcesUsed: collectSourcesUsed(matches)
                };
            }


            function resolveMultiTestDeviceReturnSanData(normalizedQueries, parsedSources) {
                const testSources = parsedSources.filter((source) => (source.matchKind || source.effectiveKind) === SOURCE_KIND.TEST_DEVICE);
                const masterSources = parsedSources.filter((source) => (source.matchKind || source.effectiveKind) === SOURCE_KIND.MASTER);
                const matches = [];

                for (const normalizedQuery of normalizedQueries) {
                    let resolution = testSources.length
                        ? findTestDeviceAssetRecord(testSources, normalizedQuery, normalizedQuery)
                        : { match: null };

                    if ((!resolution || !resolution.match) && masterSources.length) {
                        resolution = findMasterDeviceRecord(masterSources, normalizedQuery, normalizedQuery);
                    }

                    if (resolution.error) {
                        return { error: resolution.error };
                    }

                    if (!resolution.match) {
                        return { error: `No test-device asset match was found for "${normalizedQuery}" in the saved sources.` };
                    }

                    matches.push(resolution.match);
                }

                const firstMatch = matches[0];
                const firstRow = firstMatch.row;
                const detectedEmployeeId = sanitizeCellValue(getFieldValue(firstRow, 'employeeId'));
                const employeeResolution = detectedEmployeeId && masterSources.length
                    ? findMasterEmployeeRecord(masterSources, buildSearchQuery(detectedEmployeeId), detectedEmployeeId)
                    : { match: null };
                if (employeeResolution.error) {
                    return { error: employeeResolution.error };
                }

                const employeeRow = (employeeResolution.match || {}).row || firstRow;

                return {
                    data: {
                        accountability: createEmptyAccountabilityPayload(),
                        returnSan: buildMultiReturnSanPayload(matches, {
                            name: getFieldValue(employeeRow, 'employeeName') || 'N/A',
                            employeeId: pickFirstValue([
                                sanitizeEmployeeIdForPrint(getFieldValue(employeeRow, 'employeeId')),
                                sanitizeEmployeeIdForPrint(detectedEmployeeId),
                                'N/A'
                            ]),
                            businessUnit: getFieldValue(employeeRow, 'businessUnit') || getFieldValue(firstRow, 'businessUnit'),
                            email: '',
                            contact: ''
                        })
                    },
                    sourcesUsed: collectSourcesUsed([
                        ...matches,
                        employeeResolution.match
                    ])
                };
            }


            function buildMultiReturnSanPayload(matches, header) {
                return {
                    name: header.name || 'N/A',
                    employeeId: header.employeeId || 'N/A',
                    businessUnit: header.businessUnit || '',
                    email: header.email || '',
                    contact: header.contact || '',
                    assetTag: getFieldValue(matches[0].row, 'assetTag') || 'N/A',
                    description: getFieldValue(matches[0].row, 'description'),
                    serial: getFieldValue(matches[0].row, 'serial') || 'N/A',
                    assets: matches.map((match) => ({
                        assetTag: getFieldValue(match.row, 'assetTag') || 'N/A',
                        description: getFieldValue(match.row, 'description') || 'N/A',
                        serial: getFieldValue(match.row, 'serial') || 'N/A',
                        remarks: ''
                    })),
                    assetManagerName: getDisplayValue('sanAssetManager'),
                    todayIso: getTodayDateInfo().iso
                };
            }


            function parseReturnSanMultiAssetQueries(rawQuery) {
                if (!isReturnSanitizationMode()) {
                    return [];
                }

                const sanitized = sanitizeCellValue(rawQuery);
                if (!sanitized) {
                    return [];
                }

                const containsComma = sanitized.includes(',');
                const compactNumericIdentifier = sanitized.replace(/\s+/g, '');
                if (/\s/.test(sanitized) && /^\d{14,16}$/.test(compactNumericIdentifier)) {
                    return [];
                }

                const tokens = sanitized
                    .split(/[\s,]+/)
                    .map((token) => sanitizeCellValue(token))
                    .filter(Boolean);

                if (tokens.length <= 1) {
                    return [];
                }

                const allLookLikeIdentifiers = tokens.every((token) => /[0-9]/.test(token) || /[-/]/.test(token));
                if (!allLookLikeIdentifiers) {
                    return [];
                }

                return containsComma || tokens.length > 1 ? tokens : [];
            }


            function buildFormPayload(rowsByKind, parsedSources, formType, rawQuery) {
                const accountabilitySourceConfig = getAccountabilitySourceConfig();
                const accountabilityRows = accountabilitySourceConfig.payloadOrder.map((kind) => rowsByKind[kind] || null);
                const accountabilityPickupRows = [
                    rowsByKind[SOURCE_KIND.NEW_HIRE],
                    rowsByKind[SOURCE_KIND.ITSM],
                    rowsByKind[SOURCE_KIND.GENERAL]
                ];
                const accountabilityIssuedRows = [
                    rowsByKind[SOURCE_KIND.ITSM],
                    rowsByKind[SOURCE_KIND.NEW_HIRE],
                    rowsByKind[SOURCE_KIND.GENERAL]
                ];
                const returnRows = [
                    rowsByKind[SOURCE_KIND.TEST_DEVICE],
                    rowsByKind[SOURCE_KIND.MASTER],
                    rowsByKind[SOURCE_KIND.ITSM],
                    rowsByKind[SOURCE_KIND.NEW_HIRE],
                    rowsByKind[SOURCE_KIND.GENERAL]
                ];
                const todayInfo = getTodayDateInfo();

                const accountability = {
                    name: pickFieldValue(accountabilityRows, 'employeeName') || 'N/A',
                    employeeId: sanitizeEmployeeIdForPrint(pickFieldValue(accountabilityRows, 'employeeId')),
                    position: pickFieldValue(accountabilitySourceConfig.positionOrder.map((kind) => rowsByKind[kind] || null), 'position'),
                    costCenter: pickFieldValue(accountabilityRows, 'costCenter'),
                    issuedName: pickFieldValue(accountabilityRows, 'issuedBy') || getDefaultIssuedName(),
                    issuedPosition: pickFieldValue(accountabilityRows, 'issuerPosition') || DEFAULT_ISSUED_POS,
                    pickupDate: coerceDateToIso(pickFieldValue(accountabilityPickupRows, 'setupDate')),
                    issuedDate: coerceDateToIso(
                        pickFieldValue(accountabilityIssuedRows, 'issuedDate') ||
                        pickFieldValue(accountabilityIssuedRows, 'setupDate')
                    ),
                    assets: [{
                        particulars: 'Laptop',
                        assetTag: pickFieldValue(accountabilitySourceConfig.assetOrder.map((kind) => rowsByKind[kind] || null), 'assetTag') || 'N/A',
                        description: pickFieldValue(accountabilitySourceConfig.assetOrder.map((kind) => rowsByKind[kind] || null), 'description'),
                        serial: pickFieldValue(accountabilitySourceConfig.assetOrder.map((kind) => rowsByKind[kind] || null), 'serial') || 'N/A',
                        setupDate: coerceDateToIso(pickFieldValue(accountabilityRows, 'setupDate'))
                    }]
                };
                const returnSan = formType.includes('_test')
                    ? buildTestDeviceReturnSanPayload(rowsByKind, parsedSources, rawQuery, todayInfo)
                    : {
                        name: pickFieldValue(returnRows, 'employeeName') || 'N/A',
                        employeeId: pickFieldValue(returnRows, 'employeeId') || 'N/A',
                        businessUnit: pickFieldValue(returnRows, 'businessUnit'),
                        email: pickFieldValue(returnRows, 'email'),
                        contact: pickFieldValue(returnRows, 'contact'),
                        assetTag: pickFieldValue([
                            rowsByKind[SOURCE_KIND.TEST_DEVICE],
                            rowsByKind[SOURCE_KIND.MASTER],
                            rowsByKind[SOURCE_KIND.ITSM],
                            rowsByKind[SOURCE_KIND.GENERAL]
                        ], 'assetTag') || 'N/A',
                        description: pickFieldValue([
                            rowsByKind[SOURCE_KIND.TEST_DEVICE],
                            rowsByKind[SOURCE_KIND.MASTER],
                            rowsByKind[SOURCE_KIND.ITSM],
                            rowsByKind[SOURCE_KIND.GENERAL]
                        ], 'description'),
                        serial: pickFieldValue([
                            rowsByKind[SOURCE_KIND.TEST_DEVICE],
                            rowsByKind[SOURCE_KIND.MASTER],
                            rowsByKind[SOURCE_KIND.ITSM],
                            rowsByKind[SOURCE_KIND.GENERAL]
                        ], 'serial') || 'N/A',
                        assets: [{
                            assetTag: pickFieldValue([
                                rowsByKind[SOURCE_KIND.TEST_DEVICE],
                                rowsByKind[SOURCE_KIND.MASTER],
                                rowsByKind[SOURCE_KIND.ITSM],
                                rowsByKind[SOURCE_KIND.GENERAL]
                            ], 'assetTag') || 'N/A',
                            description: pickFieldValue([
                                rowsByKind[SOURCE_KIND.TEST_DEVICE],
                                rowsByKind[SOURCE_KIND.MASTER],
                                rowsByKind[SOURCE_KIND.ITSM],
                                rowsByKind[SOURCE_KIND.GENERAL]
                            ], 'description'),
                            serial: pickFieldValue([
                                rowsByKind[SOURCE_KIND.TEST_DEVICE],
                                rowsByKind[SOURCE_KIND.MASTER],
                                rowsByKind[SOURCE_KIND.ITSM],
                                rowsByKind[SOURCE_KIND.GENERAL]
                            ], 'serial') || 'N/A',
                            remarks: ''
                        }],
                        assetManagerName: getDisplayValue('sanAssetManager'),
                        todayIso: todayInfo.iso
                    };

                return { accountability, returnSan };
            }


            function findBestQueryMatch(source, searchQuery, parsedSources) {
                const candidates = [];

                getQueryCandidateEntries(source, searchQuery).forEach(({ row, index }) => {
                    const score = getQueryMatchScore(row, searchQuery, source);
                    if (score > 0) {
                        candidates.push(buildMatchCandidate(
                            source,
                            row,
                            score,
                            index,
                            getMatchReferenceTimestamp(source, row, Number.NaN, parsedSources)
                        ));
                    }
                });

                const sourceKind = source.matchKind || source.effectiveKind;
                const isDeviceSanitationLookup = (currentFormType.startsWith('sanitization_') || currentFormType.startsWith('return_')) &&
                    (sourceKind === SOURCE_KIND.MASTER || sourceKind === SOURCE_KIND.TEST_DEVICE);
                if (isDeviceSanitationLookup && hasTopScoreTie(candidates)) {
                    return { error: `Multiple rows matched in ${source.name}. Search by an exact asset tag or serial number instead.` };
                }

                return resolveBestCandidate(candidates, `Multiple rows matched in ${source.name}. Search by full name, EE ID, serial, or asset tag instead.`);
            }


            function hasTopScoreTie(candidates) {
                if (!candidates.length) {
                    return false;
                }

                const topScore = Math.max(...candidates.map((candidate) => candidate.score));
                return candidates.filter((candidate) => candidate.score === topScore).length > 1;
            }


            function resolveUniqueDeviceCandidate(candidates, ambiguousMessage) {
                if (hasTopScoreTie(candidates)) {
                    return { error: ambiguousMessage };
                }

                return resolveBestCandidate(candidates, ambiguousMessage);
            }


            function findSupportingMatches(parsedSources, identity, directByKind, rawQuery) {
                const supportingCandidates = [];

                for (const source of parsedSources) {
                    if (directByKind[source.matchKind] && directByKind[source.matchKind].sourceId === source.id) {
                        continue;
                    }

                    const result = findBestIdentityMatch(source, identity, parsedSources);
                    if (result.error) {
                        return { error: result.error };
                    }
                    if (result.match) {
                        supportingCandidates.push(result.match);
                    }
                }

                if (!supportingCandidates.length) {
                    return { byKind: {} };
                }

                return selectBestMatchesByKind(supportingCandidates, rawQuery, 'supporting');
            }


            function findBestIdentityMatch(source, identity, parsedSources) {
                const candidates = [];

                getIdentityCandidateEntries(source, identity).forEach(({ row, index }) => {
                    const score = getIdentityMatchScore(row, identity);
                    if (score > 0) {
                        candidates.push(buildMatchCandidate(
                            source,
                            row,
                            score,
                            index,
                            getMatchReferenceTimestamp(source, row, identity.referenceDateTimestamp, parsedSources)
                        ));
                    }
                });

                return resolveBestCandidate(candidates, `Multiple supporting rows matched in ${source.name}. Search by full name, EE ID, serial, or asset tag instead.`);
            }


            function selectBestMatchesByKind(matches, rawQuery, label) {
                const byKind = {};

                [SOURCE_KIND.MASTER, SOURCE_KIND.ITSM, SOURCE_KIND.NEW_HIRE, SOURCE_KIND.TEST_DEVICE, SOURCE_KIND.GENERAL].forEach((kind) => {
                    const kindMatches = matches.filter((match) => match.sourceKind === kind);
                    if (!kindMatches.length) {
                        return;
                    }

                    const result = resolveBestCandidate(
                        kindMatches,
                        `Multiple ${SOURCE_KIND_LABELS[kind]} sources matched "${rawQuery}" during ${label} lookup. Search by serial or set source roles manually.`
                    );
                    if (result.error) {
                        byKind.error = result.error;
                        return;
                    }
                    if (result.match) {
                        byKind[kind] = result.match;
                    }
                });

                if (byKind.error) {
                    return { error: byKind.error };
                }

                return { byKind };
            }


            function resolveBestCandidate(candidates, ambiguousMessage) {
                if (!candidates.length) {
                    return { match: null };
                }

                const sorted = candidates
                    .slice()
                    .sort(compareMatchCandidates);
                const best = sorted[0];
                const tiedMatches = sorted.filter((candidate) => compareMatchCandidates(candidate, best) === 0);

                if (tiedMatches.length > 1) {
                    return { error: ambiguousMessage };
                }

                return { match: best };
            }


            function getQueryMatchScore(row, searchQuery, source) {
                let score = 0;
                const normalizedQuery = searchQuery.identifier;
                const sourceKind = source.matchKind || source.effectiveKind;

                if (currentFormType.includes('_test') && normalizedQuery && (sourceKind === SOURCE_KIND.TEST_DEVICE || sourceKind === SOURCE_KIND.MASTER)) {
                    const assetTagMatchScore = getTestDeviceAssetTagMatchScore(row, normalizedQuery);
                    if (assetTagMatchScore === 3) {
                        score = Math.max(score, 360);
                    } else if (assetTagMatchScore === 2) {
                        score = Math.max(score, 350);
                    } else if (assetTagMatchScore === 1) {
                        score = Math.max(score, 340);
                    }
                    if (getNormalizedIdentifierField(row, 'serial') === normalizedQuery) {
                        score = Math.max(score, 300);
                    }
                    if (getNormalizedIdentifierField(row, 'imei') === normalizedQuery) {
                        score = Math.max(score, 280);
                    }
                    if (!score && sourceKind === SOURCE_KIND.TEST_DEVICE && rowContainsNormalizedValue(row, normalizedQuery)) {
                        score = Math.max(score, 180);
                    }
                    return score;
                }

                if (getNormalizedIdentifierField(row, 'serial') === normalizedQuery) {
                    score = Math.max(score, 300);
                }
                if (rowAssetTagMatchesIdentifier(row, normalizedQuery)) {
                    score = Math.max(score, 250);
                }
                if (getNormalizedIdentifierField(row, 'employeeId') === normalizedQuery) {
                    score = Math.max(score, 200);
                }
                if (
                    supportsFullNameSearch(source) &&
                    isFullNameQuery(searchQuery) &&
                    getNormalizedPersonField(row, 'employeeName') === searchQuery.personName
                ) {
                    score = Math.max(score, 225);
                }
                if (!score && sourceKind === SOURCE_KIND.TEST_DEVICE && normalizedQuery && rowContainsNormalizedValue(row, normalizedQuery)) {
                    score = Math.max(score, 180);
                }

                return score;
            }


            function getTestDeviceAssetMatchScore(row, normalizedQuery) {
                let score = 0;

                const assetTagMatchScore = getTestDeviceAssetTagMatchScore(row, normalizedQuery);
                if (assetTagMatchScore === 3) {
                    score = Math.max(score, 360);
                } else if (assetTagMatchScore === 2) {
                    score = Math.max(score, 350);
                } else if (assetTagMatchScore === 1) {
                    score = Math.max(score, 340);
                }
                if (getNormalizedIdentifierField(row, 'serial') === normalizedQuery) {
                    score = Math.max(score, 300);
                }
                if (getNormalizedIdentifierField(row, 'imei') === normalizedQuery) {
                    score = Math.max(score, 280);
                }
                if (!score && rowContainsNormalizedValue(row, normalizedQuery)) {
                    score = Math.max(score, 180);
                }

                return score;
            }


            function rowHasTestDeviceAssetTag(row, normalizedQuery) {
                return getTestDeviceAssetTagMatchScore(row, normalizedQuery) > 0;
            }


            function getTestDeviceAssetTagMatchScore(row, normalizedQuery) {
                if (!row || !normalizedQuery) {
                    return 0;
                }

                if (rowAssetTagMatchesIdentifier(row, normalizedQuery)) {
                    return 3;
                }

                const data = ensureTestDeviceAssetValueSets(row);
                if (data.testDeviceAssetDirect.has(normalizedQuery)) {
                    return 2;
                }
                return data.testDeviceAssetCanonical.has(normalizedQuery) ? 1 : 0;
            }


            function getTestDeviceAssignmentMatchScore(row, normalizedAssetQuery, employeeSearchQuery) {
                const assetScore = getTestDeviceAssetMatchScore(row, normalizedAssetQuery);
                const employeeScore = getMasterEmployeeMatchScore(row, employeeSearchQuery);

                if (!assetScore || !employeeScore) {
                    return 0;
                }

                return assetScore + employeeScore;
            }


            function getMasterEmployeeMatchScore(row, searchQuery) {
                let score = 0;

                if (searchQuery.identifier && getNormalizedIdentifierField(row, 'employeeId') === searchQuery.identifier) {
                    score = Math.max(score, 350);
                }
                if (isFullNameQuery(searchQuery) && getNormalizedPersonField(row, 'employeeName') === searchQuery.personName) {
                    score = Math.max(score, 300);
                }

                return score;
            }


            function getIdentityMatchScore(row, identity) {
                let score = 0;

                if (identity.serial && getNormalizedIdentifierField(row, 'serial') === identity.serial) {
                    score = Math.max(score, 300);
                }
                if (identity.assetTag && (
                    rowAssetTagMatchesIdentifier(row, identity.assetTag) ||
                    rowHasTestDeviceAssetTag(row, identity.assetTag)
                )) {
                    score = Math.max(score, 250);
                }
                if (identity.employeeId && getNormalizedIdentifierField(row, 'employeeId') === identity.employeeId) {
                    score = Math.max(score, 200);
                }
                if (identity.employeeNameKey && getNormalizedPersonField(row, 'employeeName') === identity.employeeNameKey) {
                    score = Math.max(score, 100);
                }

                return score;
            }


            function buildIdentity(matches) {
                const resolvedMatches = matches.filter(Boolean);
                const rows = resolvedMatches.map((match) => match.row);
                const newHireMatch = resolvedMatches.find((match) => match.sourceKind === SOURCE_KIND.NEW_HIRE);
                const employeeName = pickFieldValue(rows, 'employeeName');

                return {
                    employeeId: normalizeIdentifier(pickFieldValue(rows, 'employeeId')),
                    employeeName: normalizeText(employeeName),
                    employeeNameKey: normalizePersonName(employeeName),
                    serial: normalizeIdentifier(pickFieldValue(rows, 'serial')),
                    assetTag: normalizeIdentifier(pickFieldValue(rows, 'assetTag')),
                    referenceDateTimestamp: getRowDateTimestamp((newHireMatch || resolvedMatches[0] || {}).row || null)
                };
            }


            function buildMatchCandidate(source, row, score, index, referenceDateTimestamp) {
                const rowDateTimestamp = getRowDateTimestamp(row);

                return {
                    sourceId: source.id,
                    sourceName: source.name,
                    sourceKind: source.matchKind || source.effectiveKind,
                    row,
                    score,
                    coverage: getRowCompletenessScore(row),
                    rowDateTimestamp,
                    dateDistance: getDateDistance(rowDateTimestamp, referenceDateTimestamp),
                    index
                };
            }


            function compareMatchCandidates(left, right) {
                return right.score - left.score ||
                    compareAscendingFinite(left.dateDistance, right.dateDistance) ||
                    compareDescendingFinite(left.rowDateTimestamp, right.rowDateTimestamp) ||
                    right.coverage - left.coverage ||
                    left.index - right.index;
            }


            function compareAscendingFinite(left, right) {
                const leftFinite = Number.isFinite(left);
                const rightFinite = Number.isFinite(right);

                if (leftFinite && rightFinite) {
                    return left - right;
                }
                if (leftFinite) {
                    return -1;
                }
                if (rightFinite) {
                    return 1;
                }
                return 0;
            }


            function compareDescendingFinite(left, right) {
                const leftFinite = Number.isFinite(left);
                const rightFinite = Number.isFinite(right);

                if (leftFinite && rightFinite) {
                    return right - left;
                }
                if (leftFinite) {
                    return -1;
                }
                if (rightFinite) {
                    return 1;
                }
                return 0;
            }


            function getMatchReferenceTimestamp(source, row, identityReferenceTimestamp, parsedSources) {
                if (Number.isFinite(identityReferenceTimestamp)) {
                    return identityReferenceTimestamp;
                }

                const sourceKind = source.matchKind || source.effectiveKind;
                if (sourceKind !== SOURCE_KIND.ITSM || !isAccountabilityNewHireMode()) {
                    return Number.NaN;
                }

                return getNewHireReferenceTimestampForRow(row, parsedSources);
            }


            function getNewHireReferenceTimestampForRow(row, parsedSources) {
                const employeeId = getNormalizedIdentifierField(row, 'employeeId');
                const employeeNameKey = getNormalizedPersonField(row, 'employeeName');
                const rowDateTimestamp = getRowDateTimestamp(row);
                const referenceTimestamps = [];

                parsedSources.forEach((source) => {
                    if ((source.matchKind || source.effectiveKind) !== SOURCE_KIND.NEW_HIRE) {
                        return;
                    }

                    getIndexedRowEntries(source, [
                        ['employeeId', employeeId],
                        ['employeeName', employeeNameKey]
                    ]).forEach(({ row: newHireRow }) => {
                        const matchesEmployeeId = employeeId && getNormalizedIdentifierField(newHireRow, 'employeeId') === employeeId;
                        const matchesEmployeeName = employeeNameKey && getNormalizedPersonField(newHireRow, 'employeeName') === employeeNameKey;

                        if (!matchesEmployeeId && !matchesEmployeeName) {
                            return;
                        }

                        const timestamp = getRowDateTimestamp(newHireRow);
                        if (Number.isFinite(timestamp)) {
                            referenceTimestamps.push(timestamp);
                        }
                    });
                });

                if (!referenceTimestamps.length) {
                    return Number.NaN;
                }

                if (!Number.isFinite(rowDateTimestamp)) {
                    return referenceTimestamps.slice().sort((left, right) => right - left)[0];
                }

                return referenceTimestamps
                    .slice()
                    .sort((left, right) => Math.abs(left - rowDateTimestamp) - Math.abs(right - rowDateTimestamp))[0];
            }


            function getDateDistance(rowDateTimestamp, referenceDateTimestamp) {
                if (!Number.isFinite(rowDateTimestamp) || !Number.isFinite(referenceDateTimestamp)) {
                    return Number.POSITIVE_INFINITY;
                }

                return Math.abs(rowDateTimestamp - referenceDateTimestamp);
            }


            function getRowDateTimestamp(row) {
                if (!row) {
                    return Number.NaN;
                }

                const data = getNormalizedRowData(row);
                if (!Object.prototype.hasOwnProperty.call(data, 'rowDateTimestamp')) {
                    data.rowDateTimestamp = parseDateValue(getRelevantDateValue(row));
                }
                return data.rowDateTimestamp;
            }


            function getRelevantDateValue(row) {
                if (!row) {
                    return '';
                }

                const aliasedValue = getFieldValue(row, 'setupDate');
                if (aliasedValue) {
                    return aliasedValue;
                }

                const normalizedKeys = getCompiledRowSchema(row).normalizedKeys;
                const preferredHeaders = [
                    'day o n e strong start',
                    'day one strong start',
                    'assignment date',
                    'date assigned',
                    'assigned date',
                    'setup date',
                    'deployment date',
                    'issued date',
                    'release date'
                ];

                for (const header of preferredHeaders) {
                    const match = normalizedKeys.find((item) =>
                        item.normalized === header || item.normalized.includes(header)
                    );
                    if (match) {
                        const value = sanitizeCellValue(row[match.original]);
                        if (value) {
                            return value;
                        }
                    }
                }

                const fallbackMatch = normalizedKeys.find((item) =>
                    item.normalized.includes('strong start') ||
                    item.normalized.endsWith(' date') ||
                    item.normalized.includes(' date ')
                );

                return fallbackMatch ? sanitizeCellValue(row[fallbackMatch.original]) : '';
            }


            function parseDateValue(value) {
                const rawValue = sanitizeCellValue(value);
                if (!rawValue) {
                    return Number.NaN;
                }

                const compactValue = rawValue.split(/\s+/)[0];
                let match = compactValue.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
                if (match) {
                    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
                }

                match = compactValue.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
                if (match) {
                    const year = Number(match[3]) < 100 ? Number(match[3]) + 2000 : Number(match[3]);
                    return Date.UTC(year, Number(match[1]) - 1, Number(match[2]));
                }

                const parsedDate = new Date(rawValue);
                if (Number.isNaN(parsedDate.getTime())) {
                    return Number.NaN;
                }

                return Date.UTC(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
            }


            function getRowCompletenessScore(row) {
                if (!row) {
                    return 0;
                }

                const data = getNormalizedRowData(row);
                if (Object.prototype.hasOwnProperty.call(data, 'completenessScore')) {
                    return data.completenessScore;
                }

                data.completenessScore = [
                    'employeeId',
                    'employeeName',
                    'position',
                    'serial',
                    'imei',
                    'assetTag',
                    'description',
                    'businessUnit',
                    'email',
                    'contact',
                    'costCenter',
                    'setupDate'
                ].reduce((score, fieldName) => score + (getFieldValue(row, fieldName) ? 1 : 0), 0);
                return data.completenessScore;
            }


            function pickFieldValue(rows, fieldName) {
                for (const row of rows) {
                    if (!row) {
                        continue;
                    }

                    const value = getFieldValue(row, fieldName);
                    if (value) {
                        return value;
                    }
                }
                return '';
            }


            function buildTestDeviceReturnSanPayload(rowsByKind, parsedSources, rawQuery, todayInfo) {
                const testDeviceRow = rowsByKind[SOURCE_KIND.TEST_DEVICE];
                const masterSources = parsedSources.filter((source) => (source.matchKind || source.effectiveKind) === SOURCE_KIND.MASTER);
                const detectedEmployeeId = sanitizeCellValue(getFieldValue(testDeviceRow, 'employeeId'));
                const employeeResolution = detectedEmployeeId
                    ? findMasterEmployeeRecord(masterSources, buildSearchQuery(detectedEmployeeId), detectedEmployeeId)
                    : { match: null };
                const employeeRow = (employeeResolution.match || {}).row || null;
                const searchedTag = hasLegacyAssetTagPrefix(rawQuery) || isLikelyTestDeviceAssetTag(rawQuery)
                    ? formatTestDeviceAutofillAssetTag(rawQuery)
                    : '';
                const resolvedAssetTag = searchedTag || getFieldValue(testDeviceRow, 'assetTag', {
                    testDevice: true
                }) || 'N/A';

                return {
                    name: getFieldValue(employeeRow, 'employeeName') || 'N/A',
                    employeeId: sanitizeEmployeeIdForPrint(getFieldValue(employeeRow, 'employeeId') || detectedEmployeeId || 'N/A'),
                    businessUnit: getFieldValue(employeeRow, 'businessUnit'),
                    email: '',
                    contact: '',
                    assetTag: resolvedAssetTag,
                    description: getFieldValue(testDeviceRow, 'description'),
                    serial: getFieldValue(testDeviceRow, 'serial') || 'N/A',
                    assets: [{
                        assetTag: resolvedAssetTag,
                        description: getFieldValue(testDeviceRow, 'description') || 'N/A',
                        serial: getFieldValue(testDeviceRow, 'serial') || 'N/A',
                        remarks: ''
                    }],
                    assetManagerName: getDisplayValue('sanAssetManager'),
                    todayIso: todayInfo.iso
                };
            }


            function rowContainsNormalizedValue(row, normalizedQuery) {
                if (!row || !normalizedQuery) {
                    return false;
                }

                return ensureAllNormalizedRowIdentifiers(row).has(normalizedQuery);
            }


            function getRawFieldValue(row, fieldName) {
                if (!row || !FIELD_ALIASES[fieldName]) {
                    return '';
                }

                const accessor = getCompiledFieldAccessor(row, fieldName);
                for (const key of accessor) {
                    const value = sanitizeCellValue(row[key]);
                    if (value) {
                        return value;
                    }
                }

                return '';
            }


            function getFieldValue(row, fieldName, options) {
                const value = getRawFieldValue(row, fieldName);
                if (fieldName !== 'assetTag') {
                    return value;
                }

                return options && options.testDevice
                    ? formatTestDeviceAutofillAssetTag(value)
                    : stripLegacyAssetTagPrefix(value);
            }

        Object.assign(scope, {
        bindSearch,
        isMissingAutofillValue,
        getIncompleteAutofillFieldLabels,
        showAutofillCompletenessWarning,
        buildTestDeviceAutofillWarningPayload,
        handleSearch,
        handleAccountabilityReplacementAutofill,
        findReplacementAccountabilityEmployeeRecord,
        findReplacementAccountabilityEmployeeRows,
        selectBestReplacementAccountabilityEmployeeMatch,
        hasReplacementAccountabilityAssetIdentity,
        getReplacementEmployeeGroupKey,
        dedupeReplacementEmployeeMatches,
        filterReplacementEmployeeMatchesByAssetQuery,
        findReplacementAccountabilityAssetRecord,
        getReplacementAccountabilityAssetMatchScore,
        buildReplacementAccountabilityPayload,
        inferAccountabilityParticulars,
        createEmptyReturnSanPayload,
        createEmptyAccountabilityPayload,
        pickFirstValue,
        handleTestDeviceAssetSearch,
        handleTestDeviceAutofill,
        getTestDeviceAutofillValidationMessage,
        handleTestDeviceEmployeeSearch,
        findTestDeviceAssignmentRecord,
        findTestDeviceAssetRecord,
        findMasterDeviceRecord,
        findMasterEmployeeRecord,
        resolveFormData,
        resolveMultiReturnSanFormData,
        resolveMultiLaptopReturnSanData,
        resolveMultiTestDeviceReturnSanData,
        buildMultiReturnSanPayload,
        parseReturnSanMultiAssetQueries,
        buildFormPayload,
        findBestQueryMatch,
        findSupportingMatches,
        findBestIdentityMatch,
        selectBestMatchesByKind,
        resolveBestCandidate,
        getQueryMatchScore,
        getTestDeviceAssetMatchScore,
        rowHasTestDeviceAssetTag,
        getTestDeviceAssignmentMatchScore,
        getMasterEmployeeMatchScore,
        getIdentityMatchScore,
        buildIdentity,
        buildMatchCandidate,
        compareMatchCandidates,
        compareAscendingFinite,
        compareDescendingFinite,
        getMatchReferenceTimestamp,
        getNewHireReferenceTimestampForRow,
        getDateDistance,
        getRowDateTimestamp,
        getRelevantDateValue,
        parseDateValue,
        getRowCompletenessScore,
        pickFieldValue,
        buildTestDeviceReturnSanPayload,
        rowContainsNormalizedValue,
        getFieldValue
        });
        Object.assign(App, {
        bindSearch,
        isMissingAutofillValue,
        getIncompleteAutofillFieldLabels,
        showAutofillCompletenessWarning,
        buildTestDeviceAutofillWarningPayload,
        handleSearch,
        handleAccountabilityReplacementAutofill,
        findReplacementAccountabilityEmployeeRecord,
        findReplacementAccountabilityEmployeeRows,
        selectBestReplacementAccountabilityEmployeeMatch,
        hasReplacementAccountabilityAssetIdentity,
        getReplacementEmployeeGroupKey,
        dedupeReplacementEmployeeMatches,
        filterReplacementEmployeeMatchesByAssetQuery,
        findReplacementAccountabilityAssetRecord,
        getReplacementAccountabilityAssetMatchScore,
        buildReplacementAccountabilityPayload,
        inferAccountabilityParticulars,
        createEmptyReturnSanPayload,
        createEmptyAccountabilityPayload,
        pickFirstValue,
        handleTestDeviceAssetSearch,
        handleTestDeviceAutofill,
        getTestDeviceAutofillValidationMessage,
        handleTestDeviceEmployeeSearch,
        findTestDeviceAssignmentRecord,
        findTestDeviceAssetRecord,
        findMasterDeviceRecord,
        findMasterEmployeeRecord,
        resolveFormData,
        resolveMultiReturnSanFormData,
        resolveMultiLaptopReturnSanData,
        resolveMultiTestDeviceReturnSanData,
        buildMultiReturnSanPayload,
        parseReturnSanMultiAssetQueries,
        buildFormPayload,
        findBestQueryMatch,
        findSupportingMatches,
        findBestIdentityMatch,
        selectBestMatchesByKind,
        resolveBestCandidate,
        getQueryMatchScore,
        getTestDeviceAssetMatchScore,
        rowHasTestDeviceAssetTag,
        getTestDeviceAssignmentMatchScore,
        getMasterEmployeeMatchScore,
        getIdentityMatchScore,
        buildIdentity,
        buildMatchCandidate,
        compareMatchCandidates,
        compareAscendingFinite,
        compareDescendingFinite,
        getMatchReferenceTimestamp,
        getNewHireReferenceTimestampForRow,
        getDateDistance,
        getRowDateTimestamp,
        getRelevantDateValue,
        parseDateValue,
        getRowCompletenessScore,
        pickFieldValue,
        buildTestDeviceReturnSanPayload,
        rowContainsNormalizedValue,
        getFieldValue
        });
    }
})();
