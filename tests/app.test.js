const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./load-app');

const fixturesDir = path.join(__dirname, 'fixtures');
const readFixture = (name) => fs.readFileSync(path.join(fixturesDir, name), 'utf8');

function makeStoredFile(app, name, content, kind = app.scope.SOURCE_KIND.AUTO) {
    return app.normalizeStoredFile({
        id: app.createSourceId(),
        name,
        content,
        kind,
        createdAt: Date.now(),
        updatedAt: Date.now()
    });
}

function buildParsedSources(app, formType) {
    app.scope.currentFormType = formType;
    return app.dedupeParsedSourcesByCanonicalName(app.scope.csvFiles.map((file) => {
        const matchKind = app.getMatchKindForForm(file, formType);

        return {
            ...file,
            effectiveKind: app.getEffectiveSourceKind(file),
            matchKind,
            allowDirectMatch: app.isSourceKindQueryableForForm(matchKind, formType),
            rows: app.getParsedRows(file)
        };
    })).filter((source) => source.matchKind && app.getSourceDiagnostics(source).validationState !== app.scope.SOURCE_VALIDATION_STATE.INVALID);
}

function makeAccountabilityAssets(count, overrides = {}) {
    return Array.from({ length: count }, (_, index) => ({
        particulars: 'Laptop',
        assetTag: `LAP-${String(index + 1).padStart(3, '0')}`,
        description: `Laptop Model ${index + 1}`,
        serial: `SN-${String(index + 1).padStart(3, '0')}`,
        setupDate: '2026-07-13',
        remarks: 'LAPTOP WITH BAG AND CHARGER',
        ...overrides
    }));
}

test('detects source kinds from file names and canonical names', () => {
    const { app } = loadApp();

    assert.equal(app.detectSourceKindByName('ITSM Asset Master Tracker.csv'), app.scope.SOURCE_KIND.MASTER);
    assert.equal(app.detectSourceKindByName('Task Assignment Export.csv'), app.scope.SOURCE_KIND.ITSM);
    assert.equal(app.detectSourceKindByName('Newly Hired Attendance.csv'), app.scope.SOURCE_KIND.NEW_HIRE);
    assert.equal(app.detectSourceKindByName('Test Device Pool.csv'), app.scope.SOURCE_KIND.TEST_DEVICE);
    assert.equal(app.getCanonicalSourceName('Master Tracker (1).csv'), 'Master Tracker.csv');
});

test('warns when a successful autofill still has missing core CSV details', () => {
    const { app, document } = loadApp();
    const incompletePayload = {
        accountability: {
            name: 'Sample Employee',
            employeeId: '05-00001',
            position: '',
            assets: [{
                assetTag: '105895',
                description: '',
                serial: 'N/A'
            }]
        }
    };

    assert.deepEqual(
        Array.from(app.getIncompleteAutofillFieldLabels('accountability', incompletePayload)),
        ['Position', 'Asset description', 'Asset serial number']
    );
    assert.match(
        app.showAutofillCompletenessWarning('accountability', incompletePayload),
        /Please upload the latest updated and corrected CSV file/
    );
    assert.match(document.getElementById('warningMessageText').textContent, /Position/);

    assert.deepEqual(
        Array.from(app.getIncompleteAutofillFieldLabels('sanitization_laptop', {
            returnSan: {
                name: 'Sample Employee',
                employeeId: '05-00001',
                businessUnit: 'Technology Group',
                assets: [{
                    assetTag: '105895',
                    description: 'Laptop',
                    serial: 'SN-1'
                }]
            }
        })),
        []
    );
});

test('gives every added return or sanitation asset an editable Remarks combobox', () => {
    const { app, document } = loadApp();
    const extraReturnRemarks = app.buildReturnSanRemarksComboboxMarkup('ret', 1, false);
    const extraSanitationRemarks = app.buildReturnSanRemarksComboboxMarkup('san', 3, false);

    assert.match(extraReturnRemarks, /id="f_retRemarks_2"/);
    assert.match(extraReturnRemarks, /data-target="f_retRemarks_2"/);
    assert.match(extraReturnRemarks, /id="f_retRemarks_2_options"/);
    assert.match(extraReturnRemarks, /return-san-extra-remarks/);
    assert.match(extraSanitationRemarks, /id="f_sanRemarks_4"/);

    const dynamicOptions = document.getElementById('f_retRemarks_2_options');
    document.querySelectorAll = (selector) => selector === '.return-san-remarks-options' ? [dynamicOptions] : [];
    app.updateRemarksDropdowns(true, false);

    assert.deepEqual(
        dynamicOptions.children.map((option) => option.textContent),
        ['Box with Charger', 'Box Only', 'No box', 'Charger only']
    );

    app.updateRemarksDropdowns(false, false);
    assert.deepEqual(
        dynamicOptions.children.map((option) => option.textContent),
        [
            'LAPTOP WITH BAG AND CHARGER',
            'LAPTOP WITHOUT BOX AND CHARGER',
            'LAPTOP WITHOUT BOX',
            'LAPTOP WITH BOX AND CHARGER'
        ]
    );
});

test('replaces uploaded sources by detected role instead of filename only', () => {
    const { app } = loadApp();

    const existingSources = [
        makeStoredFile(app, 'ITSM - Task Assignment - Original Export.csv', ''),
        makeStoredFile(app, 'ITSM - Task Assignment - Older Export.csv', ''),
        makeStoredFile(app, 'ITSM Asset Master Tracker - August.csv', ''),
        makeStoredFile(app, 'Newly Hired Attendance - April.csv', ''),
        makeStoredFile(app, 'TEST DEVICE - 2025.csv', '')
    ];

    assert.deepEqual(
        app.getSourceReplacementIndexes(
            existingSources,
            makeStoredFile(app, 'ITSM Task Assignment - September.csv', '')
        ),
        [0, 1]
    );
    assert.deepEqual(
        app.getSourceReplacementIndexes(
            existingSources,
            makeStoredFile(app, 'Master Tracker - September.csv', '')
        ),
        [2]
    );
    assert.deepEqual(
        app.getSourceReplacementIndexes(
            existingSources,
            makeStoredFile(app, 'New Hire Attendance - May.csv', '')
        ),
        [3]
    );
    assert.deepEqual(
        app.getSourceReplacementIndexes(
            existingSources,
            makeStoredFile(app, 'Test Device Pool - September.csv', '')
        ),
        [4]
    );

    const genericSource = makeStoredFile(app, 'Other Export.csv', '');
    assert.deepEqual(
        app.getSourceReplacementIndexes(
            [genericSource],
            makeStoredFile(app, 'Different Export.csv', '')
        ),
        []
    );
    assert.deepEqual(
        app.getSourceReplacementIndexes(
            [genericSource],
            makeStoredFile(app, 'Other Export (1).csv', '')
        ),
        [0]
    );
});

test('honors an explicitly selected source role over filename detection', () => {
    const { app } = loadApp();
    const manuallyAssignedMaster = app.normalizeStoredFile({
        id: app.createSourceId(),
        name: 'TEST DEVICE export.csv',
        content: readFixture('master-tracker.csv'),
        kind: app.scope.SOURCE_KIND.MASTER
    });
    const manuallyAssignedItsm = app.normalizeStoredFile({
        id: app.createSourceId(),
        name: 'ITSM Asset Master Tracker.csv',
        content: readFixture('itsm-task-assignment.csv'),
        kind: app.scope.SOURCE_KIND.ITSM
    });

    app.scope.currentAccountabilityPrintMode = 'replacement';
    assert.equal(
        app.getMatchKindForForm(manuallyAssignedMaster, 'accountability'),
        app.scope.SOURCE_KIND.MASTER
    );
    assert.equal(
        app.getMatchKindForAllowedKinds(manuallyAssignedItsm, [app.scope.SOURCE_KIND.ITSM]),
        app.scope.SOURCE_KIND.ITSM
    );
});

test('validates empty files, low-row files, and role/header mismatches', () => {
    const { app } = loadApp();

    const emptyFile = makeStoredFile(app, 'empty.csv', '');
    const emptyDiagnostics = app.getSourceDiagnostics(emptyFile);
    assert.equal(emptyDiagnostics.validationState, app.scope.SOURCE_VALIDATION_STATE.INVALID);
    assert.match(emptyDiagnostics.blockingErrors[0], /empty/i);

    const smallFile = makeStoredFile(app, 'ITSM Task Assignment.csv', readFixture('itsm-task-assignment.csv'));
    const smallDiagnostics = app.getSourceDiagnostics(smallFile);
    assert.equal(smallDiagnostics.validationState, app.scope.SOURCE_VALIDATION_STATE.WARNING);
    assert.match(smallDiagnostics.warnings[0], /Only 1 data row/i);

    const mismatchedFile = makeStoredFile(
        app,
        'ITSM Asset Master Tracker.csv',
        readFixture('new-hire-attendance.csv'),
        app.scope.SOURCE_KIND.MASTER
    );
    const mismatchDiagnostics = app.getSourceDiagnostics(mismatchedFile);
    assert.equal(mismatchDiagnostics.validationState, app.scope.SOURCE_VALIDATION_STATE.WARNING);
    assert.match(mismatchDiagnostics.warnings.join(' '), /do not look like Master Tracker/i);
});

test('parses only requested source kinds before building lookup inputs', () => {
    const { app } = loadApp();
    const scope = app.scope;
    const master = makeStoredFile(app, 'ITSM Asset Master Tracker.csv', readFixture('master-tracker.csv'));
    const itsm = makeStoredFile(app, 'ITSM Task Assignment.csv', readFixture('itsm-task-assignment.csv'));
    const newHire = makeStoredFile(app, 'New Hire Attendance.csv', readFixture('new-hire-attendance.csv'));
    scope.csvFiles = [master, itsm, newHire];

    const sources = app.getParsedSourcesForKinds([scope.SOURCE_KIND.MASTER]);

    assert.equal(sources.length, 1);
    assert.equal(sources[0].id, master.id);
    assert.equal(app.getFieldValue(sources[0].rows[0], 'assetTag'), 'LAP-001');
    assert.equal(scope.parsedCache.has(master.id), true);
    assert.equal(scope.parsedCache.has(itsm.id), false);
    assert.equal(scope.parsedCache.has(newHire.id), false);
    assert.equal(scope.sourceDiagnostics.has(itsm.id), false);
    assert.equal(scope.sourceDiagnostics.has(newHire.id), false);
});

test('persists versioned diagnostics and safely reuses them without reparsing', async () => {
    const first = loadApp();
    const source = makeStoredFile(first.app, 'ITSM Asset Master Tracker.csv', readFixture('master-tracker.csv'));
    const originalDiagnostics = first.app.getSourceDiagnostics(source);
    first.app.scope.csvFiles = [source];

    await first.app.saveFiles();

    const filesJson = first.context.localStorage.getItem(first.app.scope.LEGACY_STORAGE_KEY);
    const diagnosticsKey = `${first.app.scope.LEGACY_STORAGE_KEY}:diagnostics`;
    const diagnosticsJson = first.context.localStorage.getItem(diagnosticsKey);
    assert.match(diagnosticsJson, /"version":1/);
    assert.equal(first.app.scope.sourceDiagnostics.has(source.id), true);
    assert.equal(first.app.scope.parsedCache.has(source.id), true);

    const second = loadApp();
    second.context.localStorage.setItem(second.app.scope.LEGACY_STORAGE_KEY, filesJson);
    second.context.localStorage.setItem(diagnosticsKey, diagnosticsJson);
    const restoredFiles = await second.app.readStoredFiles();
    const originalParse = second.context.Papa.parse;
    let parseCount = 0;
    second.context.Papa.parse = (...args) => {
        parseCount += 1;
        return originalParse.apply(second.context.Papa, args);
    };

    const restoredDiagnostics = second.app.getSourceDiagnostics(restoredFiles[0]);
    assert.equal(parseCount, 0);
    assert.equal(restoredDiagnostics.rowCount, originalDiagnostics.rowCount);
    assert.equal(restoredDiagnostics.validationState, originalDiagnostics.validationState);

    restoredFiles[0].content += '\n';
    second.app.getSourceDiagnostics(restoredFiles[0]);
    assert.equal(parseCount, 1);
});

test('caches one IndexedDB open request for concurrent storage work', async () => {
    const { app, context } = loadApp();
    const database = {
        close() {}
    };
    let openCount = 0;
    context.indexedDB = {
        open() {
            openCount += 1;
            const request = { result: database, error: null };
            Promise.resolve().then(() => request.onsuccess());
            return request;
        }
    };

    const [firstDatabase, secondDatabase] = await Promise.all([
        app.openDatabase(),
        app.openDatabase()
    ]);

    assert.equal(firstDatabase, database);
    assert.equal(secondDatabase, database);
    assert.equal(openCount, 1);
});

test('parses an accepted upload once and synchronizes source status once', async () => {
    const { app, context } = loadApp();
    const scope = app.scope;
    let uploadHandler = null;
    scope.elements.csvFileInput.addEventListener = (eventName, handler) => {
        if (eventName === 'change') {
            uploadHandler = handler;
        }
    };
    scope.initPromise = Promise.resolve();
    scope.clearAlerts = () => {};
    scope.showError = () => {};
    scope.showSuccess = () => {};
    scope.setBusyState = () => {};
    let statusSyncCount = 0;
    scope.syncSourceStatusPanel = () => {
        statusSyncCount += 1;
    };
    const originalParse = context.Papa.parse;
    let parseCount = 0;
    context.Papa.parse = (...args) => {
        parseCount += 1;
        return originalParse.apply(context.Papa, args);
    };

    app.bindSourceManagement();
    await uploadHandler({
        target: {
            files: [{
                name: 'ITSM Asset Master Tracker.csv',
                text: async () => readFixture('master-tracker.csv')
            }]
        }
    });

    assert.equal(parseCount, 1);
    assert.equal(statusSyncCount, 1);
    assert.equal(scope.csvFiles.length, 1);
});

test('builds print filenames from the current form fields', () => {
    const { app, document } = loadApp();
    const scope = app.scope;

    scope.currentFormType = 'accountability';
    scope.currentAccountabilityPrintMode = 'replacement';
    document.getElementById('f_assetTag').textContent = 'lap-001';
    document.getElementById('f_empName').textContent = 'ANGELES PATRICIA ALBAÑEZ';
    assert.equal(app.buildPrintDocumentTitle(), 'IT ASSET ACCOUNTABILITY FORM_LAP-001_ANGELES, PATRICIA ALBAÑEZ_REPLACEMENT');

    scope.currentFormType = 'test_device_accountability';
    document.getElementById('f_tdaAssetTag').textContent = 'td-002';
    document.getElementById('f_tdaEmpName').textContent = 'GICO KIMBERLY SHANE BOLDA';
    assert.equal(app.buildPrintDocumentTitle(), 'IT ASSET ACCOUNTABILITY FORM_TD-002_GICO, KIMBERLY SHANE BOLDA_TEST DEVICE');

    scope.currentFormType = 'sanitization_laptop';
    scope.currentReturnPrintMode = 'refresh';
    document.getElementById('f_retTag').value = 'lap-002';
    document.getElementById('f_retName').value = 'SMITH, JOHN';
    assert.equal(app.buildPrintDocumentTitle(), 'IT ASSET RETURN AND SANITATION FORM_LAP-002_SMITH, JOHN_REFRESH');

    scope.currentReturnPrintMode = 'for_repair';
    assert.equal(app.buildPrintDocumentTitle(), 'IT ASSET RETURN AND SANITATION FORM_LAP-002_SMITH, JOHN_FOR REPAIR');
});

test('bootstraps the app without missing scope exports', () => {
    const { app } = loadApp({ includeBootstrap: true });

    assert.equal(typeof app.scope.bindFormSelectorDropdown, 'function');
    assert.equal(typeof app.scope.bindSignerNamePickers, 'function');
    assert.equal(typeof app.scope.bindPrintNaming, 'function');
    assert.equal(typeof app.scope.initPromise?.then, 'function');
});

test('uses managed signer rosters across staff signature tables only', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const signerRosterJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'signer-rosters.js'), 'utf8');
    const formsCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'forms.css'), 'utf8');

    const managedFields = {
        f_issuedName: 'issued',
        f_approvedName: 'approved',
        f_tdaPreparedName: 'issued',
        f_tdaApprovedName: 'approved',
        f_retITSig: 'issued',
        f_sanTechSupportName: 'technical_support',
        sanInfoSecName: 'infosec',
        sanAssetManager: 'issued',
        f_sanLeadName: 'approved'
    };

    Object.entries(managedFields).forEach(([fieldId, rosterKey]) => {
        assert.match(
            indexHtml,
            new RegExp(`<textarea[^>]*id="${fieldId}"[^>]*data-signer-roster="${rosterKey}"[^>]*>`)
        );
    });

    ['f_sigEmpName', 'f_tdaEmployeePrintName', 'f_retEmployeeSigName', 'f_sanReturneeName'].forEach((fieldId) => {
        const fieldMarkup = indexHtml.match(new RegExp(`<textarea[^>]*id="${fieldId}"[^>]*>`));
        assert.ok(fieldMarkup);
        assert.doesNotMatch(fieldMarkup[0], /data-signer-roster=/);
    });

    assert.match(indexHtml, /<textarea id="f_tdaApprovedName"[\s\S]*?data-signer-roster="approved"[\s\S]*?>MENDEZ, PAUL ALDRIN<\/textarea>/);
    assert.match(indexHtml, /<textarea id="f_tdaApprovedPos"[\s\S]*?editable-input[\s\S]*?>ITSM Lead and Asset Management Lead<\/textarea>/);
    assert.match(signerRosterJs, /signer-name-add[\s\S]*?Add name/);
    assert.match(signerRosterJs, /signer-name-default/);
    assert.match(signerRosterJs, /signer-name-delete/);
    assert.match(signerRosterJs, /wrapper\.appendChild\(field\);[\s\S]*?wrapper\.appendChild\(trigger\);/);
    assert.doesNotMatch(signerRosterJs, /field\.setAttribute\('aria-hidden'/);
    assert.match(formsCss, /\.signer-name-picker \.signer-name-value\s*\{[\s\S]*?grid-column:\s*1;/);
    assert.doesNotMatch(formsCss, /textarea\.signer-name-value[\s\S]*?position:\s*absolute\s*!important;/);
    assert.match(formsCss, /@media \(max-width:\s*480px\)[\s\S]*?\.signer-name-menu/);
    assert.match(formsCss, /@media print[\s\S]*?\.signer-name-picker[\s\S]*?display:\s*none\s*!important;/);
});

test('seeds, adds, resolves, and deletes shared signer roster names', () => {
    const { app, context, document } = loadApp();

    assert.deepEqual(Array.from(app.getSignerRosterNames('issued')), [
        'PADUA, RUZZEL MICKO GARCIA',
        'BRUTAS, KEAN ROSWEN REYES',
        'DE LEON, RELINE BEQUILLA'
    ]);
    assert.deepEqual(Array.from(app.getSignerRosterNames('approved')), ['MENDEZ, PAUL ALDRIN']);
    assert.equal(app.resolveSignerRosterSelection('issued', 'de leon, reline bequilla'), 'DE LEON, RELINE BEQUILLA');
    assert.equal(app.resolveSignerRosterSelection('issued', 'Unknown Source Name'), 'PADUA, RUZZEL MICKO GARCIA');

    const added = app.addSignerRosterName('issued', 'DOE, JANE MARIE');
    assert.equal(added.added, true);
    assert.equal(app.addSignerRosterName('issued', 'doe jane marie').added, false);
    assert.ok(app.getSignerRosterNames('issued').includes('DOE, JANE MARIE'));
    assert.match(context.localStorage.getItem(app.scope.SIGNER_ROSTER_STORAGE_KEY), /DOE, JANE MARIE/);

    assert.equal(app.setSignerRosterDefaultName('issued', 'DE LEON, RELINE BEQUILLA').changed, true);
    assert.equal(app.getSignerRosterDefaultName('issued'), 'DE LEON, RELINE BEQUILLA');
    assert.equal(app.deleteSignerRosterName('issued', 'PADUA, RUZZEL MICKO GARCIA').removed, true);
    assert.equal(app.deleteSignerRosterName('issued', 'BRUTAS, KEAN ROSWEN REYES').removed, true);
    assert.equal(app.getSignerRosterNames('issued').includes('BRUTAS, KEAN ROSWEN REYES'), false);
    assert.equal(app.deleteSignerRosterName('issued', 'DE LEON, RELINE BEQUILLA').removedDefault, true);
    assert.equal(app.getSignerRosterDefaultName('issued'), 'DOE, JANE MARIE');

    assert.equal(app.deleteSignerRosterName('approved', 'MENDEZ, PAUL ALDRIN').removed, true);
    assert.equal(app.getSignerRosterDefaultName('approved'), '');
    assert.equal(app.addSignerRosterName('approved', 'SMITH, ALEX').added, true);
    assert.equal(app.getSignerRosterDefaultName('approved'), 'SMITH, ALEX');

    document.getElementById('f_issuedName').value = 'MANUAL, EDITED SIGNER';
    document.getElementById('f_approvedName').value = 'MANUAL, EDITED APPROVER';
    const printSnapshot = app.serializeAccountabilityPrintFormData();
    assert.equal(printSnapshot.issuedName, 'MANUAL, EDITED SIGNER');
    assert.equal(printSnapshot.approvedName, 'MANUAL, EDITED APPROVER');
});

test('autofills editable return and sanitation signature fields', () => {
    const { app, document } = loadApp();

    app.setSignerRosterDefaultName('issued', 'DE LEON, RELINE BEQUILLA');
    app.addSignerRosterName('technical_support', 'TECH, SUPPORT PERSON');
    app.setSignerRosterDefaultName('technical_support', 'TECH, SUPPORT PERSON');
    app.addSignerRosterName('infosec', 'SECURITY, SAMPLE PERSON');
    app.setSignerRosterDefaultName('infosec', 'SECURITY, SAMPLE PERSON');

    app.applyReturnSanitizationSignatureDefaults({
        name: 'Jane Doe',
        assetManagerName: 'Asset Manager'
    });

    assert.equal(document.getElementById('f_retEmployeeSigName').value, 'Jane Doe');
    assert.equal(document.getElementById('f_sanReturneeName').value, 'Jane Doe');
    assert.equal(document.getElementById('f_retITSig').value, 'DE LEON, RELINE BEQUILLA');
    assert.equal(document.getElementById('sanAssetManager').value, 'DE LEON, RELINE BEQUILLA');
    assert.equal(document.getElementById('f_sanTechSupportName').value, 'TECH, SUPPORT PERSON');
    assert.equal(document.getElementById('sanInfoSecName').value, 'SECURITY, SAMPLE PERSON');
    assert.equal(document.getElementById('f_sanLeadName').value, 'MENDEZ, PAUL ALDRIN');
});

test('return/sanitation autofill targets are editable form controls', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

    assert.match(indexHtml, /<input type="text" id="f_retName" class="editable-input/);
    assert.match(indexHtml, /<input type="text" id="f_retEmpNo" class="editable-input/);
    assert.match(indexHtml, /<input type="text" id="f_retBU" class="editable-input/);
    assert.match(indexHtml, /<input type="text" id="f_sanName" class="editable-input/);
    assert.match(indexHtml, /<input type="text" id="f_sanEmpNo" class="editable-input/);
    assert.match(indexHtml, /<input type="text" id="f_sanBU" class="editable-input/);
    assert.match(indexHtml, /<input type="text" id="f_retTag" class="editable-input/);
    assert.match(indexHtml, /<input type="text" id="f_sanTag" class="editable-input/);
});

test('places the Return and Sanitation sheet-copy action beside Data sources', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const experienceCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'experience.css'), 'utf8');

    assert.match(
        indexHtml,
        /<div class="sidebar-section-heading-row">[\s\S]*?<strong>Data sources<\/strong>[\s\S]*?<button id="copySheetRowBtn" class="sheet-copy-btn hide"/
    );
    assert.match(indexHtml, /Ctrl\+C or Ctrl\+Shift\+C/);
    assert.match(experienceCss, /\.sidebar-section-heading-row\s*\{[\s\S]*?justify-content:\s*space-between/);
});

test('builds nine-column Google Sheets rows for every returned asset', () => {
    const { app } = loadApp();
    const snapshot = {
        employeeId: 'E-100',
        employeeName: 'Jane Doe',
        returnDate: 'Jul 28, 2026',
        status: 'RETURNED/RESIGN',
        assets: [
            { assetTag: 'LAP-001', serial: 'SN-001' },
            { assetTag: 'MON-002', serial: 'SN-002' },
            { assetTag: '', serial: '' }
        ]
    };

    assert.deepEqual(
        JSON.parse(JSON.stringify(app.buildReturnSanSheetRows(snapshot))),
        [
            ['R', 'E-100', 'Jane Doe', 'LAP-001', 'Jul 28, 2026', 'SN-001', '', '', 'Returned/Resign'],
            ['R', 'E-100', 'Jane Doe', 'MON-002', 'Jul 28, 2026', 'SN-002', '', '', 'Returned/Resign']
        ]
    );
    assert.equal(
        app.buildReturnSanSheetClipboardText(snapshot),
        'R\tE-100\tJane Doe\tLAP-001\tJul 28, 2026\tSN-001\t\t\tReturned/Resign\n'
            + 'R\tE-100\tJane Doe\tMON-002\tJul 28, 2026\tSN-002\t\t\tReturned/Resign'
    );
});

test('leaves the resignation cell blank for non-resigned return statuses', () => {
    const { app } = loadApp();
    const rows = app.buildReturnSanSheetRows({
        employeeId: 'E-200',
        employeeName: 'Sam Lee',
        returnDate: 'Jul 28, 2026',
        status: 'RETURNED/REPAIR',
        assets: [{ assetTag: 'TD-00002', serial: 'IMEI-002' }]
    });

    assert.equal(rows[0].length, 9);
    assert.equal(rows[0][0], '');
    assert.equal(rows[0][8], 'Returned/Repair');
    assert.equal(app.formatReturnSanSheetStatus('REFRESH/PURCHASED'), 'Refresh/Purchased');
    assert.equal(app.getReturnSanSheetDate('2026-07-06', '', ''), 'Jul 6, 2026');
    assert.equal(app.getReturnSanSheetDate('2026-02-19', '', ''), 'Feb 19, 2026');
    assert.equal(app.getReturnSanSheetDate('2025-01-10', '', ''), 'Jan 10, 2025');
});

test('keeps pasted cells on one line and copies through the browser clipboard', async () => {
    const { app, context } = loadApp();
    let copiedText = '';
    context.navigator = {
        clipboard: {
            async writeText(value) {
                copiedText = value;
            }
        }
    };

    assert.equal(app.sanitizeSheetClipboardCell('Jane\tDoe\nIT'), 'Jane Doe IT');
    assert.equal(app.sanitizeSheetClipboardCell('=SUM(A1:A2)'), "'=SUM(A1:A2)");
    assert.equal(await app.writeTextToClipboard('paste-ready'), true);
    assert.equal(copiedText, 'paste-ready');
});

test('shows the Google Sheets copy button only for Return and Sanitation forms', () => {
    const { app, document } = loadApp();
    const button = document.getElementById('copySheetRowBtn');

    app.scope.currentFormType = 'accountability';
    app.syncSheetCopyButtonVisibility();
    assert.equal(button.classList.contains('hide'), true);
    assert.equal(button.disabled, true);

    app.scope.currentFormType = 'sanitization_laptop';
    app.syncSheetCopyButtonVisibility();
    assert.equal(button.classList.contains('hide'), false);
    assert.equal(button.disabled, false);

    app.scope.currentFormType = 'sanitization_test';
    app.syncSheetCopyButtonVisibility();
    assert.equal(button.classList.contains('hide'), false);
    assert.equal(button.disabled, false);
});

test('supports Ctrl+C and Ctrl+Shift+C for Copy row without hijacking native text copy', () => {
    const { app, context } = loadApp();
    const button = app.scope.elements.sheetCopyBtn;
    const pageTarget = { closest() { return null; } };
    const editableTarget = { closest() { return this; } };
    const makeEvent = (overrides = {}) => ({
        key: 'c',
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        repeat: false,
        defaultPrevented: false,
        target: pageTarget,
        ...overrides
    });

    app.scope.currentFormType = 'sanitization_laptop';
    app.syncSheetCopyButtonVisibility();
    assert.equal(button.disabled, false);
    assert.equal(app.isReturnSanSheetCopyShortcut(makeEvent()), true);
    assert.equal(app.isReturnSanSheetCopyShortcut(makeEvent({ key: 'C', shiftKey: true })), true);
    assert.equal(app.shouldHandleReturnSanSheetCopyShortcut(makeEvent()), true);
    assert.equal(app.shouldHandleReturnSanSheetCopyShortcut(makeEvent({ key: 'C', shiftKey: true })), true);

    assert.equal(app.shouldHandleReturnSanSheetCopyShortcut(makeEvent({ target: editableTarget })), false);
    context.getSelection = () => ({ isCollapsed: false, toString: () => 'selected text' });
    assert.equal(app.shouldHandleReturnSanSheetCopyShortcut(makeEvent()), false);
    context.getSelection = () => ({ isCollapsed: true, toString: () => '' });

    assert.equal(app.isReturnSanSheetCopyShortcut(makeEvent({ altKey: true })), false);
    assert.equal(app.isReturnSanSheetCopyShortcut(makeEvent({ metaKey: true })), false);
    assert.equal(app.isReturnSanSheetCopyShortcut(makeEvent({ repeat: true })), false);
    assert.equal(app.isReturnSanSheetCopyShortcut(makeEvent({ key: 'v' })), false);

    app.scope.currentFormType = 'accountability';
    app.syncSheetCopyButtonVisibility();
    assert.equal(app.shouldHandleReturnSanSheetCopyShortcut(makeEvent()), false);
});

test('supports Returned Only mode with RETURNED status', () => {
    const { app, document } = loadApp();

    app.setReturnPrintMode('returned_only', true);

    assert.equal(app.scope.currentReturnPrintMode, 'returned_only');
    assert.equal(document.getElementById('f_retStatus').value, 'RETURNED');
    assert.equal(document.getElementById('f_sanStatus').value, 'RETURNED');
    assert.equal(app.inferReturnPrintMode('RETURNED'), 'returned_only');
});

test('gives targeted test-device autofill validation messages', () => {
    const { app } = loadApp();

    assert.equal(
        app.getTestDeviceAutofillValidationMessage(['TD-00002'], false),
        'Please enter an assignee before autofill.'
    );
    assert.equal(
        app.getTestDeviceAutofillValidationMessage([], true),
        'Please enter at least one test device asset tag before autofill.'
    );
    assert.equal(
        app.getTestDeviceAutofillValidationMessage([], false),
        'Please enter a test device asset tag and an assignee before autofill.'
    );
    assert.equal(app.getTestDeviceAutofillValidationMessage(['TD-00002'], true), '');
});

test('selects accountability laptop remarks from the detected model', () => {
    const { app } = loadApp();

    assert.equal(
        app.getAccountabilityRemarksDefault('14-inch MacBook Pro: Apple M3 chip'),
        'LAPTOP WITH BOX AND CHARGER'
    );
    assert.equal(
        app.getAccountabilityRemarksDefault('Lenovo ThinkPad T14'),
        'LAPTOP WITH BAG AND CHARGER'
    );
    assert.equal(app.getAccountabilityRemarksDefault(''), '');
});

test('strips legacy Yondu prefixes from asset-tag autofill while keeping both lookup forms', () => {
    const { app } = loadApp();
    const scope = app.scope;

    const generalizedTags = new Map([
        ['YONDU103396', '103396'],
        ['YODNU00042', '00042'],
        ['YONDD-ABC-91', 'ABC-91'],
        ['YONUD 7812-X', '7812-X']
    ]);
    for (const [sourceTag, expectedTag] of generalizedTags) {
        assert.equal(app.hasLegacyAssetTagPrefix(sourceTag), true);
        assert.equal(app.stripLegacyAssetTagPrefix(sourceTag), expectedTag);
    }

    assert.equal(app.stripLegacyAssetTagPrefix('yondu-103396'), '103396');
    assert.equal(app.stripLegacyAssetTagPrefix('YODNU 103396'), '103396');
    assert.equal(app.stripLegacyAssetTagPrefix('103396'), '103396');
    assert.equal(app.stripLegacyAssetTagPrefix('LAP-YONDU103396'), 'LAP-YONDU103396');
    assert.equal(app.stripLegacyAssetTagPrefix('TD-00001'), 'TD-00001');
    assert.equal(app.getFieldValue({ 'Serial No': 'YONDU103396' }, 'serial'), 'YONDU103396');
    assert.deepEqual(
        app.getAssetTagSearchIdentifiers('YONDU103396'),
        ['yondu103396', '103396']
    );

    const row = {
        'Employee ID': '05-03494',
        'Employee Name': 'DE LEON, RELINE BEQUILLA',
        'Asset Tag': 'YONDU103396',
        'Laptop Description': 'LENOVO THINKBOOK 14S',
        'Serial No': 'R90Z7YA3'
    };
    const source = {
        id: 'legacy-master-source',
        name: 'ITSM Asset Master Tracker.csv',
        matchKind: scope.SOURCE_KIND.MASTER,
        effectiveKind: scope.SOURCE_KIND.MASTER,
        rows: [row]
    };

    const strippedLookup = app.findReplacementAccountabilityAssetRecord(
        [source],
        app.normalizeIdentifier('103396'),
        '103396'
    );
    const prefixedLookup = app.findReplacementAccountabilityAssetRecord(
        [source],
        app.normalizeIdentifier('YONDU103396'),
        'YONDU103396'
    );

    assert.equal(strippedLookup.match.row, row);
    assert.equal(prefixedLookup.match.row, row);
    assert.equal(app.getFieldValue(row, 'assetTag'), '103396');

    const alreadyCleanRow = { ...row, 'Asset Tag': '103396' };
    const alreadyCleanSource = { ...source, id: 'clean-master-source', rows: [alreadyCleanRow] };
    const legacyQueryAgainstCleanSource = app.findReplacementAccountabilityAssetRecord(
        [alreadyCleanSource],
        app.normalizeIdentifier('YODNU103396'),
        'YODNU103396'
    );
    assert.equal(legacyQueryAgainstCleanSource.match.row, alreadyCleanRow);

    const accountabilityPayload = app.buildReplacementAccountabilityPayload({
        employeeMatch: null,
        assetMatches: [strippedLookup.match]
    });
    const returnPayload = app.buildMultiReturnSanPayload([strippedLookup.match], {
        name: 'DE LEON, RELINE BEQUILLA',
        employeeId: '05-03494'
    });

    assert.equal(accountabilityPayload.assets[0].assetTag, '103396');
    assert.equal(returnPayload.assetTag, '103396');
    assert.equal(returnPayload.assets[0].assetTag, '103396');

    const testDeviceEntry = app.buildTestDeviceAccountabilityDeviceEntry(
        row,
        row,
        row['Serial No']
    );
    const testDeviceReturnPayload = app.buildTestDeviceReturnSanPayload(
        { [scope.SOURCE_KIND.TEST_DEVICE]: row },
        [],
        row['Serial No'],
        { iso: '2026-07-28' }
    );
    assert.equal(testDeviceEntry.assetTag, '103396');
    assert.equal(testDeviceReturnPayload.assetTag, '103396');
});

test('maps composite source headers without stealing exact values from prefixed headers', () => {
    const { app } = loadApp();

    const row = {
        'EE NUMBER3.0': '05-03896',
        'Retracted EMPLOYEE NAME': 'MARAÑA, JAMES RICKSON LOLA',
        'Email Only (client issued laptop) Email': '04/10/2026',
        Email: 'jrmarana@yondu.com',
        'For Transportify DEPT/GROUP/UNIT': 'Technology Group',
        'DEPLOYED DATE': 'Nov 16, 2021',
        'ISSUED DATE': '2026-04-10'
    };

    assert.equal(app.getFieldValue(row, 'employeeId'), '05-03896');
    assert.equal(app.getFieldValue(row, 'email'), 'jrmarana@yondu.com');
    assert.equal(app.getFieldValue(row, 'businessUnit'), 'Technology Group');
    assert.equal(app.getFieldValue(row, 'setupDate'), 'Nov 16, 2021');
    assert.equal(app.getFieldValue(row, 'issuedDate'), '2026-04-10');
    assert.equal(app.getFieldValue({ xr: '05-01742' }, 'employeeId'), '05-01742');
    assert.equal(app.getFieldValue({ 'MOBILE UNIT': 'IPHONE 7S PLUS' }, 'contact'), '');
});

test('preserves the New Hire POSITION label when column I has a prefixed header', () => {
    const { app } = loadApp();
    const content = [
        ',,,,,,,,For Site Pick up',
        'A,B,C,D,E,F,G,H,POSITION',
        ',,,,,,,,Process Writer'
    ].join('\n');
    const file = app.normalizeStoredFile({
        id: app.createSourceId(),
        name: 'Newly Hired Attendance - April.csv',
        content
    });
    const parsed = app.parseNewHireSourceFile(file);

    assert.equal(parsed.rows[0].POSITION, 'Process Writer');
    assert.equal(app.getFieldValue(parsed.rows[0], 'position'), 'Process Writer');
});

test('uses the canonical duplicate TD tag and preserves it for serial or IMEI searches', () => {
    const { app } = loadApp();
    const scope = app.scope;
    const row = {
        TAGGING_3: 'TD0013',
        TAGGING_2: 'TD-00016',
        'EE No.': '05-03722',
        ASSIGNEE: 'LANDICHO, ERICKA RIZZELLE GATDULA',
        'MOBILE UNIT': 'HUAWEI Y7A',
        'Serial No.': '0151409S34106030',
        'IMEI NO': '860219054903997'
    };
    const source = {
        id: 'test-device-source',
        name: 'TEST DEVICE.csv',
        matchKind: scope.SOURCE_KIND.TEST_DEVICE,
        effectiveKind: scope.SOURCE_KIND.TEST_DEVICE,
        rows: [row]
    };

    assert.equal(app.getFieldValue(row, 'assetTag'), 'TD-00016');
    assert.equal(
        app.findTestDeviceAssetRecord([source], app.normalizeIdentifier('TD-00013'), 'TD-00013').match.row,
        row
    );

    const conflictingSource = {
        ...source,
        rows: [
            { TAGGING_3: 'TD-00077', TAGGING_2: 'TD-00042' },
            { TAGGING_3: '', TAGGING_2: 'TD-00077' }
        ]
    };
    assert.equal(
        app.findTestDeviceAssetRecord([conflictingSource], app.normalizeIdentifier('TD-00077'), 'TD-00077').match.row,
        conflictingSource.rows[1]
    );

    const serialPayload = app.buildTestDeviceReturnSanPayload(
        { [scope.SOURCE_KIND.TEST_DEVICE]: row },
        [],
        '0151409S34106030',
        { iso: '2026-07-26' }
    );
    const imeiPayload = app.buildTestDeviceReturnSanPayload(
        { [scope.SOURCE_KIND.TEST_DEVICE]: row },
        [],
        '860219054903997',
        { iso: '2026-07-26' }
    );

    assert.equal(serialPayload.assetTag, 'TD-00016');
    assert.equal(imeiPayload.assetTag, 'TD-00016');
    assert.equal(serialPayload.serial, '0151409S34106030');
});

test('does not split a space-separated IMEI into multiple sanitation assets', () => {
    const { app } = loadApp();

    app.scope.currentFormType = 'sanitization_test';

    assert.equal(
        JSON.stringify(app.parseReturnSanMultiAssetQueries('35 307209 059454 2')),
        '[]'
    );
    assert.equal(
        JSON.stringify(app.parseReturnSanMultiAssetQueries('TD-00002, TD-00003')),
        JSON.stringify(['TD-00002', 'TD-00003'])
    );
});

test('resolves new-hire accountability payloads without changing field population data', () => {
    const { app } = loadApp();
    const scope = app.scope;

    scope.currentFormType = 'accountability';
    scope.currentAccountabilityPrintMode = 'new_hire';
    scope.csvFiles = [
        makeStoredFile(app, 'ITSM Task Assignment.csv', readFixture('itsm-task-assignment.csv')),
        makeStoredFile(app, 'New Hire Attendance.csv', readFixture('new-hire-attendance.csv'))
    ];

    const parsedSources = buildParsedSources(app, 'accountability');
    const resolution = app.resolveFormData(app.buildSearchQuery('1003'), '1003', parsedSources, 'accountability');

    assert.equal(resolution.error, undefined);
    assert.equal(resolution.data.accountability.name, 'Alice Johnson');
    assert.equal(resolution.data.accountability.employeeId, '1003');
    assert.equal(resolution.data.accountability.position, 'Data Analyst');
    assert.equal(resolution.data.accountability.pickupDate, '2026-03-04');
    assert.equal(resolution.data.accountability.issuedDate, '2026-03-04');
    assert.equal(resolution.data.accountability.assets[0].assetTag, 'LAP-003');
    assert.equal(resolution.data.accountability.assets[0].serial, 'SN-003');
});

test('fills accountability pick up date from Day One Strong Start', () => {
    const { app } = loadApp();
    const scope = app.scope;

    scope.currentFormType = 'accountability';
    scope.currentAccountabilityPrintMode = 'new_hire';
    scope.csvFiles = [
        makeStoredFile(app, 'ITSM Task Assignment.csv', readFixture('itsm-task-assignment.csv')),
        makeStoredFile(app, 'New Hire Attendance.csv', readFixture('new-hire-attendance.csv'))
    ];

    const parsedSources = buildParsedSources(app, 'accountability');
    const resolution = app.resolveFormData(app.buildSearchQuery('1003'), '1003', parsedSources, 'accountability');

    assert.equal(resolution.error, undefined);
    assert.equal(resolution.data.accountability.pickupDate, '2026-03-04');
});

test('defaults accountability setup date to today only when source date is blank', () => {
    const { app } = loadApp();
    const todayIso = app.getTodayDateInfo().iso;

    assert.equal(app.getAccountabilitySetupDateOrToday(''), todayIso);
    assert.equal(app.getAccountabilitySetupDateOrToday('2026-03-04'), '2026-03-04');
});

test('resolves replacement accountability payloads from the master tracker', () => {
    const { app } = loadApp();
    const scope = app.scope;

    scope.currentFormType = 'accountability';
    scope.currentAccountabilityPrintMode = 'replacement';
    scope.csvFiles = [
        makeStoredFile(app, 'ITSM Asset Master Tracker.csv', readFixture('master-tracker.csv'))
    ];

    const masterSources = app.getParsedSourcesForKinds([scope.SOURCE_KIND.MASTER]);
    const employeeResolution = app.findReplacementAccountabilityEmployeeRows(masterSources, app.buildSearchQuery('Jane Doe'), 'Jane Doe');
    const payload = app.buildReplacementAccountabilityPayload(employeeResolution.matches);

    assert.equal(payload.name, 'Jane Doe');
    assert.equal(payload.employeeId, '1001');
    assert.equal(payload.position, 'Software Engineer');
    assert.equal(payload.assets.length, 2);
    assert.equal(payload.assets[0].assetTag, 'LAP-001');
    assert.equal(payload.assets[1].assetTag, 'MON-001');
});

test('builds replacement accountability payloads from independent employee and asset lookups', () => {
    const { app } = loadApp();
    const scope = app.scope;

    scope.currentFormType = 'accountability';
    scope.currentAccountabilityPrintMode = 'replacement';
    scope.csvFiles = [
        makeStoredFile(app, 'ITSM Asset Master Tracker.csv', readFixture('master-tracker.csv'))
    ];

    const masterSources = app.getParsedSourcesForKinds([scope.SOURCE_KIND.MASTER]);
    const employeeResolution = app.findReplacementAccountabilityEmployeeRecord(
        masterSources,
        app.buildSearchQuery('Jane Doe'),
        'Jane Doe'
    );
    const assetResolution = app.findReplacementAccountabilityAssetRecord(
        masterSources,
        app.normalizeIdentifier('LAP-002'),
        'LAP-002'
    );
    const payload = app.buildReplacementAccountabilityPayload({
        employeeMatch: employeeResolution.match,
        assetMatches: [assetResolution.match]
    });

    assert.equal(payload.name, 'Jane Doe');
    assert.equal(payload.employeeId, '1001');
    assert.equal(payload.position, 'Software Engineer');
    assert.equal(payload.assets.length, 1);
    assert.equal(payload.assets[0].assetTag, 'LAP-002');
    assert.equal(payload.assets[0].serial, 'SN-002');
});

test('supports employee-only and asset-only replacement accountability payloads', () => {
    const { app } = loadApp();
    const scope = app.scope;

    scope.currentFormType = 'accountability';
    scope.currentAccountabilityPrintMode = 'refresh';
    scope.csvFiles = [
        makeStoredFile(app, 'ITSM Asset Master Tracker.csv', readFixture('master-tracker.csv'))
    ];

    const masterSources = app.getParsedSourcesForKinds([scope.SOURCE_KIND.MASTER]);
    const employeeResolution = app.findReplacementAccountabilityEmployeeRecord(
        masterSources,
        app.buildSearchQuery('1001'),
        '1001'
    );
    const employeeAssetsResolution = app.findReplacementAccountabilityEmployeeRows(
        masterSources,
        app.buildSearchQuery('1001'),
        '1001'
    );
    const employeeOnlyPayload = app.buildReplacementAccountabilityPayload({
        employeeMatch: employeeResolution.match,
        assetMatches: employeeAssetsResolution.matches
    });
    const assetResolution = app.findReplacementAccountabilityAssetRecord(
        masterSources,
        app.normalizeIdentifier('MON-001'),
        'MON-001'
    );
    const assetOnlyPayload = app.buildReplacementAccountabilityPayload({
        employeeMatch: null,
        assetMatches: [assetResolution.match]
    });

    assert.equal(employeeOnlyPayload.name, 'Jane Doe');
    assert.equal(employeeOnlyPayload.employeeId, '1001');
    assert.equal(employeeOnlyPayload.assets.length, 2);
    assert.equal(employeeOnlyPayload.assets[0].assetTag, 'LAP-001');
    assert.equal(employeeOnlyPayload.assets[1].assetTag, 'MON-001');

    assert.equal(assetOnlyPayload.name, '');
    assert.equal(assetOnlyPayload.employeeId, '');
    assert.equal(assetOnlyPayload.assets.length, 1);
    assert.equal(assetOnlyPayload.assets[0].assetTag, 'MON-001');
});

test('resolves laptop sanitization payloads from the master tracker', () => {
    const { app } = loadApp();
    const scope = app.scope;

    scope.currentFormType = 'sanitization_laptop';
    scope.csvFiles = [
        makeStoredFile(app, 'ITSM Asset Master Tracker.csv', readFixture('master-tracker.csv'))
    ];

    const parsedSources = buildParsedSources(app, 'sanitization_laptop');
    const resolution = app.resolveFormData(app.buildSearchQuery('lap-002'), 'lap-002', parsedSources, 'sanitization_laptop');

    assert.equal(resolution.error, undefined);
    assert.equal(resolution.data.returnSan.name, 'John Smith');
    assert.equal(resolution.data.returnSan.employeeId, '1002');
    assert.equal(resolution.data.returnSan.assetTag, 'LAP-002');
    assert.equal(resolution.data.returnSan.serial, 'SN-002');
});

test('resolves test-device sanitization payloads from test-device and master sources', () => {
    const { app } = loadApp();
    const scope = app.scope;

    scope.currentFormType = 'sanitization_test';
    scope.csvFiles = [
        makeStoredFile(app, 'TEST DEVICE.csv', readFixture('test-device.csv')),
        makeStoredFile(app, 'ITSM Asset Master Tracker.csv', readFixture('master-tracker.csv'))
    ];

    const parsedSources = buildParsedSources(app, 'sanitization_test');
    const resolution = app.resolveFormData(app.buildSearchQuery('TD-00001'), 'TD-00001', parsedSources, 'sanitization_test');

    assert.equal(resolution.error, undefined);
    assert.equal(resolution.data.returnSan.name, 'Chris P. Bacon');
    assert.equal(resolution.data.returnSan.employeeId, '3001');
    assert.equal(resolution.data.returnSan.assetTag, 'TD-00001');
    assert.equal(resolution.data.returnSan.serial, 'SN-TD-001');
});

test('keeps the searched TD asset tag in test-device sanitization when source rows disagree', () => {
    const { app } = loadApp();

    const payload = app.buildTestDeviceReturnSanPayload(
        {
            [app.scope.SOURCE_KIND.TEST_DEVICE]: {
                'TD Asset Tag': 'TD-00006',
                'Employee ID': '05-03303',
                'Test Device Description': 'Samsung Galaxy A11',
                'Serial No': 'R9RR701478E',
                'IMEI': '356173119602691'
            }
        },
        [],
        'TD-00008',
        { iso: '2026-03-20' }
    );

    assert.equal(payload.assetTag, 'TD-00008');
    assert.equal(payload.assets[0].assetTag, 'TD-00008');
    assert.equal(payload.serial, 'R9RR701478E');
});

test('fills the test-device accountability fields with the same combined source data', () => {
    const { app, document } = loadApp();
    const scope = app.scope;

    const testDeviceSource = makeStoredFile(app, 'TEST DEVICE.csv', readFixture('test-device.csv'));
    const masterSource = makeStoredFile(app, 'ITSM Asset Master Tracker.csv', readFixture('master-tracker.csv'));
    const assignmentRow = app.getParsedRows(testDeviceSource)[0];
    const employeeRow = app.getParsedRows(masterSource).find((row) => app.getFieldValue(row, 'employeeId') === '3001');

    scope.currentFormType = 'test_device_accountability';
    app.fillTestDeviceAccountabilityCombined(assignmentRow, assignmentRow, employeeRow, 'TD-00001');

    assert.equal(document.getElementById('f_tdaAssetTag').value, 'TD-00001');
    assert.equal(document.getElementById('f_tdaEmpName').value, 'Chris P. Bacon');
    assert.equal(document.getElementById('f_tdaEmpId').value, '3001');
    assert.equal(document.getElementById('f_tdaCostCenter').value, document.getElementById('f_tdaPosition').value);
});

test('keeps the searched TD asset tag when combined sources disagree', () => {
    const { app, document } = loadApp();
    const scope = app.scope;

    const employeeRow = {
        'Employee ID': '05-03303',
        'Employee Name': 'DIESTA, SHAIRA SALVIO',
        'Employee Position': 'Business Analyst',
        'Business Unit': 'Technology Group'
    };
    const assignmentRow = {
        'TD Asset Tag': 'TD-00006',
        'Test Device Description': 'Samsung Galaxy A11',
        'Serial No': 'R9RR701478E',
        'IMEI': '356173119602691'
    };
    const deviceRow = {
        'Asset Tag': 'TD-00006',
        'Laptop Description': 'Samsung Galaxy A11',
        'Serial No': 'R9RR701478E',
        'IMEI': '356173119602691'
    };

    scope.currentFormType = 'test_device_accountability';
    app.fillTestDeviceAccountabilityCombined(assignmentRow, deviceRow, employeeRow, 'TD-00008');

    assert.equal(document.getElementById('f_tdaAssetTag').value, 'TD-00008');
    assert.equal(document.getElementById('f_tdaSerial').value, 'R9RR701478E');
    assert.equal(document.getElementById('f_tdaEmpId').value, '05-03303');
});

test('adds extra test-device lookup inputs and preserves their collected values', () => {
    const { app, document } = loadApp();
    const scope = app.scope;

    scope.resetTestDeviceLookupRows();
    document.getElementById('tdaAssetSearchInput').value = 'TD-00064';

    const nextInput = app.appendTestDeviceLookupRow('TD-00065');

    assert.ok(nextInput);
    assert.equal(scope.testDeviceLookupInputs.length, 2);
    assert.equal(JSON.stringify(app.getTestDeviceLookupValues()), JSON.stringify(['TD-00064', 'TD-00065']));
});

test('removes only additional test-device lookup inputs when delete is pressed', () => {
    const { app, document } = loadApp();
    const scope = app.scope;

    scope.resetTestDeviceLookupRows();
    document.getElementById('tdaAssetSearchInput').value = 'TD-00064';

    app.appendTestDeviceLookupRow('TD-00065');

    const lookupRows = document.getElementById('tdaAssetSearchRows').children;
    const extraRow = lookupRows[0];
    assert.equal(lookupRows.length, 1);
    assert.equal(extraRow.children.length, 3);

    app.removeTestDeviceLookupRow(extraRow.children[1]);

    assert.equal(scope.testDeviceLookupInputs.length, 1);
    assert.equal(JSON.stringify(app.getTestDeviceLookupValues()), JSON.stringify(['TD-00064']));
    assert.equal(document.getElementById('tdaAssetSearchRows').children.length, 0);
});

test('renders multiple test-device asset tags in the right-side cell', () => {
    const { app, document } = loadApp();
    const scope = app.scope;

    scope.currentFormType = 'test_device_accountability';

    const employeeRow = {
        'Employee ID': '05-03544',
        'Employee Name': 'REYES, MARC ALVIN CANAPI',
        'Employee Position': 'Business Analyst',
        'Business Unit': 'Technology Group'
    };

    const firstEntry = app.buildTestDeviceAccountabilityDeviceEntry(
        {
            'TD Asset Tag': 'TD-00064',
            'Test Device Description': 'OPPO A92',
            'Serial No': '1f22b3e1',
            'IMEI': '860621059043036'
        },
        {
            'Asset Tag': 'TD-00064',
            'Laptop Description': 'OPPO A92',
            'Serial No': '1f22b3e1',
            'IMEI': '860621059043036'
        },
        'TD-00064'
    );
    const secondEntry = app.buildTestDeviceAccountabilityDeviceEntry(
        {
            'TD Asset Tag': 'TD-00065',
            'Test Device Description': 'Samsung Galaxy A11',
            'Serial No': 'R9RR701478E',
            'IMEI': '356173119602691'
        },
        {
            'Asset Tag': 'TD-00065',
            'Laptop Description': 'Samsung Galaxy A11',
            'Serial No': 'R9RR701478E',
            'IMEI': '356173119602691'
        },
        'TD-00065'
    );

    app.fillTestDeviceAccountabilityDevices([firstEntry, secondEntry], employeeRow);

    assert.equal(document.getElementById('f_tdaAssetTag').value, 'TD-00064');
    assert.equal(document.getElementById('f_tdaAssetTagList').children.length, 1);
    assert.equal(document.getElementById('f_tdaAssetTagList').children[0].textContent, 'TD-00065');
    assert.equal(document.getElementById('f_tdaModel').value, 'OPPO A92');
    assert.equal(document.getElementById('f_tdaModel_2').value, 'Samsung Galaxy A11');
    assert.equal(document.getElementById('f_tdaSerial_2').value, 'R9RR701478E');
    assert.equal(document.getElementById('f_tdaEmployeeSignature').value, 'REYES, MARC ALVIN CANAPI');
    assert.equal(document.getElementById('f_tdaEmployeeSignature_2').value, 'REYES, MARC ALVIN CANAPI');
    assert.equal(document.getElementById('f_tdaEmployeePrintName').value, 'REYES, MARC ALVIN CANAPI');
    assert.equal(document.getElementById('f_tdaCostCenter').value, 'Business Analyst');
    assert.equal(document.getElementById('f_tdaDetailsBody').children.length, 3);
});

test('renders a third test-device asset tag in the same right-side stack', () => {
    const { app, document } = loadApp();
    const scope = app.scope;

    scope.currentFormType = 'test_device_accountability';

    const employeeRow = {
        'Employee ID': '05-03544',
        'Employee Name': 'REYES, MARC ALVIN CANAPI',
        'Employee Position': 'Business Analyst',
        'Business Unit': 'Technology Group'
    };

    const firstEntry = app.buildTestDeviceAccountabilityDeviceEntry(
        {
            'TD Asset Tag': 'TD-00064',
            'Test Device Description': 'OPPO A92',
            'Serial No': '1f22b3e1',
            'IMEI': '860621059043036'
        },
        {
            'Asset Tag': 'TD-00064',
            'Laptop Description': 'OPPO A92',
            'Serial No': '1f22b3e1',
            'IMEI': '860621059043036'
        },
        'TD-00064'
    );
    const secondEntry = app.buildTestDeviceAccountabilityDeviceEntry(
        {
            'TD Asset Tag': 'TD-00065',
            'Test Device Description': 'Samsung Galaxy A11',
            'Serial No': 'R9RR701478E',
            'IMEI': '356173119602691'
        },
        {
            'Asset Tag': 'TD-00065',
            'Laptop Description': 'Samsung Galaxy A11',
            'Serial No': 'R9RR701478E',
            'IMEI': '356173119602691'
        },
        'TD-00065'
    );
    const thirdEntry = app.buildTestDeviceAccountabilityDeviceEntry(
        {
            'TD Asset Tag': 'TD-00066',
            'Test Device Description': 'iPhone 8',
            'Serial No': 'C8PVJ81SJC67',
            'IMEI': '356767085092439'
        },
        {
            'Asset Tag': 'TD-00066',
            'Laptop Description': 'iPhone 8',
            'Serial No': 'C8PVJ81SJC67',
            'IMEI': '356767085092439'
        },
        'TD-00066'
    );

    app.fillTestDeviceAccountabilityDevices([firstEntry, secondEntry, thirdEntry], employeeRow);

    assert.equal(document.getElementById('f_tdaAssetTag').value, 'TD-00064');
    assert.equal(document.getElementById('f_tdaAssetTagList').children.length, 2);
    assert.equal(document.getElementById('f_tdaAssetTagList').children[0].textContent, 'TD-00065');
    assert.equal(document.getElementById('f_tdaAssetTagList').children[1].textContent, 'TD-00066');
    assert.equal(document.getElementById('f_tdaDetailsBody').children.length, 4);
});

test('keeps lookup normalization for mixed casing, trailing spaces, and ambiguity handling', () => {
    const { app } = loadApp();
    const scope = app.scope;
    const duplicateMasterRow = [
        'Employee ID,Employee Name,Employee Position,Cost Center,Business Unit,Asset Tag,Laptop Description,Serial No,Email Address,Contact Number,Issued By,Issuer Position,Setup Date,Employee Status',
        '4001,Sam Lee,Operations Specialist,CC400,Ops,LAP-400,ThinkPad,SN-400,sam@example.com,555100,Ruzzel Micko G. Padua,IT Asset Custodian,2026-02-01,ACTIVE'
    ].join('\n');

    scope.currentFormType = 'sanitization_laptop';
    scope.csvFiles = [
        makeStoredFile(app, 'ITSM Asset Master Tracker.csv', readFixture('master-tracker.csv'))
    ];

    const parsedSources = buildParsedSources(app, 'sanitization_laptop');
    const mixedCaseResolution = app.resolveFormData(app.buildSearchQuery(' lap-001 '), ' lap-001 ', parsedSources, 'sanitization_laptop');
    assert.equal(mixedCaseResolution.error, undefined);
    assert.equal(mixedCaseResolution.data.returnSan.name, 'Jane Doe');

    scope.csvFiles = [
        makeStoredFile(app, 'ITSM Asset Master Tracker Alpha.csv', duplicateMasterRow),
        makeStoredFile(app, 'ITSM Asset Master Tracker Beta.csv', duplicateMasterRow)
    ];

    const ambiguous = app.findMasterEmployeeRecord(app.getParsedSourcesForKinds([scope.SOURCE_KIND.MASTER]), app.buildSearchQuery('Sam Lee'), 'Sam Lee');
    assert.match(ambiguous.error, /Multiple employees matched/i);
});

test('rejects duplicate device identifiers instead of choosing an arbitrary asset', () => {
    const { app } = loadApp();
    const scope = app.scope;
    const duplicateRows = [
        { 'Asset Tag': 'LAP-401', 'Serial No': 'DUPLICATE-SERIAL', 'Employee Name': 'Sam Lee' },
        { 'Asset Tag': 'LAP-402', 'Serial No': 'DUPLICATE-SERIAL', 'Employee Name': 'Alex Lee' }
    ];
    const source = {
        id: 'duplicate-master-source',
        name: 'ITSM Asset Master Tracker.csv',
        matchKind: scope.SOURCE_KIND.MASTER,
        effectiveKind: scope.SOURCE_KIND.MASTER,
        rows: duplicateRows
    };

    const result = app.findMasterDeviceRecord(
        [source],
        app.normalizeIdentifier('DUPLICATE-SERIAL'),
        'DUPLICATE-SERIAL'
    );

    assert.match(result.error, /Multiple device rows matched/i);
});

test('invalidates lookup indexes when a source receives a replacement rows array', () => {
    const { app } = loadApp();
    const scope = app.scope;
    const originalRow = { 'Asset Tag': 'LAP-OLD', 'Serial No': 'SN-OLD' };
    const replacementRow = { 'Asset Tag': 'LAP-NEW', 'Serial No': 'SN-NEW' };
    const source = {
        id: 'replaceable-master-source',
        name: 'ITSM Asset Master Tracker.csv',
        matchKind: scope.SOURCE_KIND.MASTER,
        effectiveKind: scope.SOURCE_KIND.MASTER,
        rows: [originalRow]
    };

    const originalResult = app.findMasterDeviceRecord(
        [source],
        app.normalizeIdentifier('SN-OLD'),
        'SN-OLD'
    );
    assert.equal(originalResult.match.row, originalRow);

    source.rows = [replacementRow];

    const staleResult = app.findMasterDeviceRecord(
        [source],
        app.normalizeIdentifier('SN-OLD'),
        'SN-OLD'
    );
    const replacementResult = app.findMasterDeviceRecord(
        [source],
        app.normalizeIdentifier('SN-NEW'),
        'SN-NEW'
    );

    assert.equal(staleResult.match, null);
    assert.equal(replacementResult.match.row, replacementRow);
});

test('keeps fallback-value lookup and mixed employee ambiguity behavior with indexed candidates', () => {
    const { app } = loadApp();
    const scope = app.scope;
    const fallbackRow = {
        'TD Asset Tag': 'TD-00091',
        'Serial No': 'SERIAL-91',
        'Legacy Lookup Key': 'ARCHIVE-0091'
    };
    const testDeviceSource = {
        id: 'fallback-test-device-source',
        name: 'TEST DEVICE.csv',
        matchKind: scope.SOURCE_KIND.TEST_DEVICE,
        effectiveKind: scope.SOURCE_KIND.TEST_DEVICE,
        rows: [fallbackRow]
    };

    const fallbackResult = app.findTestDeviceAssetRecord(
        [testDeviceSource],
        app.normalizeIdentifier('ARCHIVE-0091'),
        'ARCHIVE-0091'
    );
    assert.equal(fallbackResult.match.row, fallbackRow);

    const idRow = {
        'Employee ID': 'E-1',
        'Employee Name': 'Jane Doe',
        'Asset Tag': 'LAP-001'
    };
    const nameRow = {
        'Employee ID': 'E-2',
        'Employee Name': 'E 1',
        'Asset Tag': 'LAP-002'
    };
    const masterSource = {
        id: 'mixed-employee-source',
        name: 'ITSM Asset Master Tracker.csv',
        matchKind: scope.SOURCE_KIND.MASTER,
        effectiveKind: scope.SOURCE_KIND.MASTER,
        rows: [idRow, nameRow]
    };
    const searchQuery = app.buildSearchQuery('E-1');

    assert.equal(app.findMasterEmployeeRecord([masterSource], searchQuery, 'E-1').match.row, idRow);
    assert.match(
        app.findReplacementAccountabilityEmployeeRows([masterSource], searchQuery, 'E-1').error,
        /Multiple employees matched/i
    );
});

test('plans compact accountability pages without losing or reordering assets', () => {
    const { app } = loadApp();
    const expectedPageSizes = new Map([
        [0, [0]],
        [1, [1]],
        [4, [4]],
        [6, [6]],
        [7, [5, 2]],
        [8, [5, 3]],
        [9, [6, 3]],
        [10, [7, 3]],
        [11, [7, 4]],
        [12, [8, 4]],
        [13, [5, 5, 3]],
        [14, [6, 5, 3]],
        [18, [7, 7, 4]],
        [19, [8, 7, 4]],
        [20, [8, 8, 4]]
    ]);

    for (const [assetCount, expectedSizes] of expectedPageSizes) {
        const assets = makeAccountabilityAssets(assetCount);
        const profile = app.getAccountabilityPrintProfile(assets, {});
        const pages = app.splitAccountabilityAssetsForPrint(assets, profile);
        const pageSizes = Array.from(pages, (page) => page.length);
        const printedTags = Array.from(pages, (page) =>
            Array.from(page, (asset) => asset.assetTag)
        ).flat();

        assert.deepEqual(pageSizes, expectedSizes, `unexpected page split for ${assetCount} assets`);
        assert.deepEqual(
            printedTags,
            assets.map((asset) => asset.assetTag),
            `assets changed order for ${assetCount} assets`
        );
    }
});

test('keeps six realistic laptop rows on one compact accountability sheet', () => {
    const { app } = loadApp();
    const descriptions = [
        '13-INCH MACBOOK AIR; APPLE M2 CHIP WITH 8 CORE CPU, 16GB, 512GB',
        'LENOVO THINKBOOK 14S, PROCESSOR I7, 16GB RAM, 512 SSD',
        'LENOVO E14, GEN 6, ULTRA 7, 16GB RAM, 1TB SSD'
    ];
    const assets = makeAccountabilityAssets(6).map((asset, index) => ({
        ...asset,
        description: descriptions[index % descriptions.length],
        remarks: index % descriptions.length === 0
            ? 'LAPTOP WITH BOX AND CHARGER'
            : 'LAPTOP WITH BAG AND CHARGER'
    }));

    const profile = app.getAccountabilityPrintProfile(assets, {});
    const pages = app.splitAccountabilityAssetsForPrint(assets, profile);

    assert.equal(profile.wrapRiskScore, 6);
    assert.equal(profile.constrainedContent, false);
    assert.equal(profile.density, 'compact');
    assert.deepEqual(Array.from(pages, (page) => page.length), [6]);
});

test('splits high-wrap accountability rows before the browser can break the form', () => {
    const { app } = loadApp();
    const assets = makeAccountabilityAssets(4).map((asset, index) => ({
        ...asset,
        description: index % 2 === 0
            ? '13-INCH MACBOOK AIR; APPLE M2 CHIP WITH 8 CORE CPU, 16GB RAM, 512GB SSD, CORPORATE BUILD WITH ENDPOINT PROTECTION, VPN, AND FULL ACCESSORY KIT'
            : 'LENOVO THINKBOOK 14S; INTEL CORE I7; 16GB RAM; 512GB SSD; CORPORATE SECURITY BUILD WITH ENDPOINT PROTECTION, VPN, AND STANDARD BUSINESS APPLICATIONS',
        remarks: index % 2 === 0
            ? 'LAPTOP WITH BOX, BAG, CHARGER, ADAPTER, AND COMPLETE ACCESSORY SET'
            : 'LAPTOP WITH BAG, CHARGER, DOCKING STATION, AND COMPLETE ACCESSORY SET'
    }));

    const threeRowProfile = app.getAccountabilityPrintProfile(assets.slice(0, 3), {});
    const fourRowProfile = app.getAccountabilityPrintProfile(assets, {});

    assert.equal(threeRowProfile.highWrapContent, false);
    assert.deepEqual(
        Array.from(app.splitAccountabilityAssetsForPrint(assets.slice(0, 3), threeRowProfile), (page) => page.length),
        [3]
    );
    assert.equal(fourRowProfile.wrapRiskScore, 20);
    assert.equal(fourRowProfile.highWrapContent, true);
    assert.equal(fourRowProfile.singlePageCapacity, 3);
    assert.deepEqual(
        Array.from(app.splitAccountabilityAssetsForPrint(assets, fourRowProfile), (page) => page.length),
        [2, 2]
    );
});

test('balances accountability continuation pages across every transition', () => {
    const { app } = loadApp();
    const profiles = [
        ['standard', { singlePageCapacity: 6, continuationPageCapacity: 8, finalPageCapacity: 4 }],
        ['constrained', { singlePageCapacity: 5, continuationPageCapacity: 7, finalPageCapacity: 3 }],
        ['high-wrap', { singlePageCapacity: 3, continuationPageCapacity: 7, finalPageCapacity: 3 }]
    ];

    for (const [profileName, profile] of profiles) {
        for (let assetCount = 1; assetCount <= 40; assetCount += 1) {
            const assets = makeAccountabilityAssets(assetCount);
            const pages = app.splitAccountabilityAssetsForPrint(assets, profile);
            const pageList = Array.from(pages, (page) => Array.from(page));
            const printedAssets = pageList.flat();
            const continuationCounts = pageList.slice(0, -1).map((page) => page.length);
            const caseLabel = `${profileName} profile at ${assetCount} assets`;

            assert.equal(printedAssets.length, assetCount, `lost assets for ${caseLabel}`);
            assert.deepEqual(
                Array.from(printedAssets, (asset) => asset.assetTag),
                Array.from(assets, (asset) => asset.assetTag),
                `changed asset order for ${caseLabel}`
            );
            assert.ok(
                pageList.every((page) => page.length > 0),
                `created an empty page for ${caseLabel}`
            );
            assert.ok(
                pageList.length === 1 || pageList.at(-1).length <= profile.finalPageCapacity,
                `overfilled the final page for ${caseLabel}`
            );
            assert.ok(
                continuationCounts.every((count) => count <= profile.continuationPageCapacity),
                `overfilled a continuation page for ${caseLabel}`
            );
            if (continuationCounts.length > 1) {
                assert.ok(
                    Math.max(...continuationCounts) - Math.min(...continuationCounts) <= 1,
                    `unbalanced continuation pages for ${caseLabel}: ${continuationCounts.join(',')}`
                );
            }
        }
    }
});

test('reduces accountability page capacity when any row has high wrap risk', () => {
    const { app } = loadApp();
    const assets = makeAccountabilityAssets(6);
    assets[5].description = 'A'.repeat(90);
    assets[5].remarks = 'R'.repeat(70);

    const profile = app.getAccountabilityPrintProfile(assets, {});
    const pages = app.splitAccountabilityAssetsForPrint(assets, profile);

    assert.equal(profile.constrainedContent, true);
    assert.equal(profile.density, 'compact');
    assert.deepEqual(Array.from(pages, (page) => page.length), [4, 2]);
});

test('reduces accountability page capacity for cumulative moderate wrapping', () => {
    const { app } = loadApp();
    const assets = makeAccountabilityAssets(6, {
        description: 'M'.repeat(60),
        remarks: 'R'.repeat(45)
    });

    const profile = app.getAccountabilityPrintProfile(assets, {});
    const pages = app.splitAccountabilityAssetsForPrint(assets, profile);

    assert.ok(profile.wrapRiskScore >= 4);
    assert.equal(profile.constrainedContent, true);
    assert.deepEqual(Array.from(pages, (page) => page.length), [4, 2]);
});

test('builds deliberate accountability continuation and final pages', () => {
    const { app } = loadApp();
    const assets = makeAccountabilityAssets(8);
    const snapshot = {
        controlNumber: 'CTRL-001',
        employeeName: 'Jane Doe',
        position: 'Engineer',
        employeeId: '1001',
        costCenter: 'CC100',
        assigneeName: 'Jane Doe',
        assigneePosition: 'Engineer',
        pickupDate: 'July 13, 2026',
        issuedName: 'Asset Custodian',
        issuedDate: 'July 13, 2026',
        issuedPosition: 'IT Asset Specialist',
        approvedName: 'Approver',
        approvedPosition: 'ITSM Lead'
    };
    const continuedPage = app.buildAccountabilityPrintPage(assets.slice(0, 5), snapshot, {
        pageNumber: 1,
        totalPages: 2,
        totalAssets: 8,
        assetStartIndex: 0,
        minimumTableRows: 8,
        isFinal: false,
        printDensity: 'compact'
    });
    const finalPage = app.buildAccountabilityPrintPage(assets.slice(5), snapshot, {
        pageNumber: 2,
        totalPages: 2,
        totalAssets: 8,
        assetStartIndex: 5,
        minimumTableRows: 4,
        isFinal: true,
        printDensity: 'compact'
    });

    assert.match(continuedPage.innerHTML, /Assets 1-5 of 8/);
    assert.match(continuedPage.innerHTML, /Page 1 of 2/);
    assert.match(continuedPage.innerHTML, /3 assets remain/);
    assert.match(continuedPage.innerHTML, /Asset list continues on the next page/);
    assert.doesNotMatch(continuedPage.innerHTML, /AUTHORITY TO DEDUCT/);
    assert.equal((continuedPage.innerHTML.match(/class="empty-row"/g) || []).length, 3);

    assert.match(finalPage.innerHTML, /Assets 6-8 of 8/);
    assert.match(finalPage.innerHTML, /Page 2 of 2/);
    assert.match(finalPage.innerHTML, /AUTHORITY TO DEDUCT/);
    assert.doesNotMatch(finalPage.innerHTML, /Asset list continues on the next page/);
    assert.equal((finalPage.innerHTML.match(/class="empty-row"/g) || []).length, 1);
    assert.equal(finalPage.dataset.pageRole, 'final');
    assert.equal(finalPage.dataset.totalPages, '2');
});

test('keeps the tuned live accountability form for one page and enables overflow only when needed', () => {
    const { app, document } = loadApp();
    const scope = app.scope;
    const template = scope.templates.accountability;
    const overflow = document.getElementById('accountabilityPrintOverflow');
    scope.currentFormType = 'accountability';

    scope.serializeAccountabilityAssetRows = () => makeAccountabilityAssets(6);
    app.syncAccountabilityPrintOverflowPages();

    assert.equal(template.classList.contains('is-paged-print'), false);
    assert.equal(template.dataset.printPageCount, '1');
    assert.equal(overflow.children.length, 0);

    scope.serializeAccountabilityAssetRows = () => makeAccountabilityAssets(7);
    app.syncAccountabilityPrintOverflowPages();

    assert.equal(template.classList.contains('is-paged-print'), true);
    assert.equal(template.dataset.printPageCount, '2');
    assert.equal(overflow.children.length, 1);
    assert.equal(overflow.children[0].children.length, 2);
});

test('keeps the generated accountability page shell inside A4 landscape at the active print scale', () => {
    const printCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'print.css'), 'utf8');
    const adaptiveCss = printCss.slice(printCss.indexOf('Adaptive accountability pagination'));
    const scaleMatch = printCss.match(/#template-accountability\s*\{\s*--ncs-print-fit-scale:\s*([\d.]+)/);
    const pageWidthMatch = printCss.match(/#template-accountability \.accountability-print-page\s*\{[\s\S]*?width:\s*([\d.]+)mm/);
    const pageHeightMatch = adaptiveCss.match(/#template-accountability \.accountability-print-page\s*\{[\s\S]*?min-height:\s*([\d.]+)mm/);

    assert.ok(scaleMatch, 'accountability print scale is missing');
    assert.ok(pageWidthMatch, 'accountability print page width is missing');
    assert.ok(pageHeightMatch, 'adaptive accountability page height is missing');

    const scale = Number(scaleMatch[1]);
    const effectiveWidthMm = Number(pageWidthMatch[1]) * scale;
    const effectiveMinimumHeightMm = Number(pageHeightMatch[1]) * scale;

    assert.ok(effectiveWidthMm <= 297, `accountability page width is ${effectiveWidthMm}mm`);
    assert.ok(effectiveMinimumHeightMm <= 210, `accountability page height is ${effectiveMinimumHeightMm}mm`);
});

test('keeps sanitization print signatures aligned and evenly spaced', () => {
    const printCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'print.css'), 'utf8');

    assert.match(
        printCss,
        /#template-sanitization \.ncs-san-grid-top\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(11rem, 1fr\)\);/
    );
    assert.match(
        printCss,
        /#template-sanitization \.ncs-san-grid-bottom\s*\{[\s\S]*?width:\s*68%;[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?gap:\s*1\.55rem;[\s\S]*?margin:\s*1\.6rem auto 0;/
    );
    assert.match(
        printCss,
        /#template-sanitization \.ncs-signature-panel-small \.ncs-signature-blank\s*\{[\s\S]*?min-height:\s*5\.45rem;/
    );
    assert.match(
        printCss,
        /#template-sanitization \.ncs-signature-panel-small \.ncs-signature-date-label,[\s\S]*?min-height:\s*1\.55rem;/
    );
    assert.match(
        printCss,
        /#template-sanitization #sanitizationForm\[data-print-density="compact"\][\s\S]*?zoom:\s*calc\(var\(--ncs-print-fit-scale\) \* var\(--ncs-print-name-scale, 1\)\);/
    );
    assert.match(
        printCss,
        /#template-sanitization #sanitizationForm\[data-print-density="compact"\][\s\S]*?\.ncs-san-grid-bottom[\s\S]*?margin-top:\s*1\.05rem;/
    );
});

test('keeps dense Return and Sanitation print states on deliberate page boundaries', () => {
    const printCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'print.css'), 'utf8');
    const safetyCss = printCss.slice(printCss.lastIndexOf('Final print safety contract'));

    assert.match(
        safetyCss,
        /#template-return\.is-paged-print\[data-print-visible="true"\][\s\S]*?break-after:\s*page\s*!important;[\s\S]*?page-break-after:\s*always\s*!important;/
    );
    assert.match(
        safetyCss,
        /#template-sanitization #sanitizationForm\[data-print-density="compact"\]\[data-print-asset-count="6"\] \.ncs-san-signatures[\s\S]*?margin-top:\s*0\.42rem\s*!important;/
    );
    assert.match(
        safetyCss,
        /#template-sanitization #sanitizationForm\[data-print-density="compact"\]\[data-print-asset-count="6"\] \.ncs-san-grid-bottom[\s\S]*?margin-top:\s*0\.42rem\s*!important;/
    );
    assert.match(
        safetyCss,
        /#template-sanitization #sanitizationForm\[data-print-density="compact"\]\[data-print-asset-count="6"\] \.ncs-signature-panel-small \.ncs-signature-blank[\s\S]*?min-height:\s*2\.8rem\s*!important;/
    );
});

test('prints long editable details through fitted wrapping mirrors', () => {
    const printJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'print.js'), 'utf8');
    const printCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'print.css'), 'utf8');
    const safetyCss = printCss.slice(printCss.lastIndexOf('Final print safety contract'));

    for (const selector of [
        '#template-accountability .ncs-info-table td.value',
        '#template-test-device-accountability .ncs-info-table td.value',
        '#template-return .ncs-info-table td.value',
        '#template-sanitization .ncs-info-table td.value',
        '#template-return .ncs-return-table td:nth-child(4)',
        '#template-sanitization .ncs-sanitization-table td:nth-child(4)'
    ]) {
        assert.ok(printJs.includes(selector), `missing print mirror selector: ${selector}`);
    }

    assert.match(printJs, /mirror\.dataset\.printFit\s*=\s*getPrintSignatureFitTier\(field\.value\);/);
    assert.match(
        printCss,
        /#template-return \.ncs-return-table td:nth-child\(4\) > \.combobox-wrapper,[\s\S]*?#template-sanitization \.ncs-sanitization-table td:nth-child\(4\) > \.combobox-wrapper[\s\S]*?display:\s*none\s*!important;/
    );
    assert.match(
        safetyCss,
        /#template-test-device-accountability \.ncs-info-table td\.value > \.ncs-print-info-value[\s\S]*?white-space:\s*normal\s*!important;[\s\S]*?overflow-wrap:\s*anywhere\s*!important;/
    );
    assert.match(
        safetyCss,
        /#template-accountability #accountabilityForm \.ncs-accountability-signatures \.ncs-signature-name-row[\s\S]*?flex-basis:\s*auto\s*!important;[\s\S]*?overflow:\s*visible\s*!important;/
    );
    assert.match(
        safetyCss,
        /#template-accountability \.ncs-accountability-signatures \.ncs-signature-role-row > \.ncs-print-signature-value\[data-print-fit="ultra"\][\s\S]*?font-size:\s*0\.41rem\s*!important;/
    );
});

test('compacts return and sanitation print output for long names', () => {
    const { app, document } = loadApp();
    const shortSnapshot = {
        employeeName: 'Jane Doe',
        returneeName: 'Jane Doe',
        techSupportName: 'Support Name',
        assetManager: 'Asset Manager',
        infosecName: 'InfoSec Name',
        leadName: 'Lead Name'
    };
    const longSnapshot = {
        ...shortSnapshot,
        employeeName: 'SURNAME, VERY LONG EMPLOYEE NAME WITH MANY WORDS',
        returneeName: 'SURNAME, VERY LONG EMPLOYEE NAME WITH MANY WORDS'
    };

    assert.equal(app.getReturnSanitizationPrintDensity(shortSnapshot), '');
    assert.equal(app.getReturnSanitizationPrintNameScale(shortSnapshot), 1);
    assert.equal(app.getReturnSanitizationPrintDensity(longSnapshot), 'compact');
    assert.ok(app.getReturnSanitizationPrintNameScale(longSnapshot) < 1);

    const form = document.getElementById('sanitizationForm');
    app.applyReturnSanitizationPrintDensity(form, longSnapshot);
    assert.equal(form.dataset.printDensity, 'compact');

    app.applyReturnSanitizationPrintDensity(form, shortSnapshot);
    assert.equal(form.dataset.printDensity, undefined);
});

test('keeps editable descriptions printable without clipping', () => {
    const printJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'print.js'), 'utf8');
    const printCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'print.css'), 'utf8');

    assert.match(printJs, /PRINT_DESCRIPTION_CELL_SELECTOR/);
    assert.match(printJs, /mirror\.textContent\s*=\s*field\.value\s*\|\|\s*''/);
    assert.match(printJs, /PRINT_INFO_VALUE_CELL_SELECTOR/);
    assert.match(printJs, /ncs-print-info-value/);
    assert.match(printJs, /PRINT_SIGNATURE_VALUE_SELECTOR/);
    assert.match(printJs, /ncs-print-signature-value/);
    assert.match(printCss, /\.ncs-print-description\s*\{\s*display:\s*none;/);
    assert.match(printCss, /\.ncs-print-info-value\s*\{\s*display:\s*none;/);
    assert.match(printCss, /\.ncs-print-signature-value\s*\{\s*display:\s*none;/);
    assert.match(printCss, /\.ncs-print-description[\s\S]*?display:\s*block\s*!important;/);
    assert.match(
        printCss,
        /#template-return \.ncs-info-table td\.value > \.combobox-wrapper,[\s\S]*?#template-sanitization \.ncs-info-table td\.value > \.custom-date-wrapper\s*\{[\s\S]*?display:\s*none\s*!important;/
    );
    assert.match(printCss, /#template-test-device-accountability \.ncs-details-table td:nth-child\(4\)[\s\S]*?white-space:\s*normal\s*!important;/);
    assert.match(printCss, /#template-return \.ncs-return-table td:nth-child\(2\)[\s\S]*?white-space:\s*normal\s*!important;/);
    assert.match(printCss, /#template-sanitization \.ncs-sanitization-table td:nth-child\(2\)[\s\S]*?white-space:\s*normal\s*!important;/);
    assert.match(printCss, /Final accountability fit[\s\S]*?min-height:\s*170mm\s*!important;/);
    assert.match(printCss, /#template-accountability #accountabilityForm \.ncs-info-table td\.value[\s\S]*?white-space:\s*normal\s*!important;/);
    assert.match(printCss, /#template-accountability #accountabilityForm \.ncs-details-table td:nth-child\(4\)[\s\S]*?height:\s*auto\s*!important;/);
    assert.match(printCss, /#template-accountability #accountabilityForm \.ncs-authority-section[\s\S]*?display:\s*flex\s*!important;/);
    assert.match(printCss, /#template-accountability #accountabilityForm \.ncs-accountability-signatures[\s\S]*?margin-top:\s*auto\s*!important;/);
    assert.match(printCss, /\.form-template\[data-print-visible="true"\] \.ncs-signature-name-row[\s\S]*?flex:\s*0 0 auto\s*!important;/);
    assert.match(printCss, /\.form-template\[data-print-visible="true"\] \.ncs-signature-role-row[\s\S]*?overflow:\s*visible\s*!important;/);
});

test('keeps the compact Accountability employee table below the title band', () => {
    const printCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'print.css'), 'utf8');
    const flowRuleStart = printCss.indexOf('Keep compact tables in normal document flow.');

    assert.notEqual(flowRuleStart, -1);

    const flowRules = printCss.slice(flowRuleStart);
    assert.match(
        flowRules,
        /#template-accountability #accountabilityForm\[data-print-density="compact"\] \.ncs-info-table,[\s\S]*?top:\s*0\s*!important;[\s\S]*?margin-top:\s*0\s*!important;/
    );
    assert.match(
        flowRules,
        /#template-accountability #accountabilityForm\[data-print-density="compact"\] \.ncs-details-table,[\s\S]*?top:\s*0\s*!important;[\s\S]*?margin-top:\s*-1px\s*!important;/
    );
    assert.match(
        flowRules,
        /#template-accountability #accountabilityForm\[data-print-density="compact"\] \.ncs-authority-section,[\s\S]*?top:\s*0\s*!important;[\s\S]*?margin-top:\s*4px\s*!important;/
    );
    assert.match(flowRules, /\.ncs-info-table tr[\s\S]*?break-inside:\s*avoid\s*!important;/);
    assert.doesNotMatch(flowRules, /top:\s*-0\.4rem\s*!important;/);
});

test('wraps long descriptions in every affected form preview', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const formFillJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'form-fill.js'), 'utf8');
    const experienceCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'experience.css'), 'utf8');

    for (const id of ['f_tdaModel', 'f_retDesc', 'f_sanDesc']) {
        assert.match(
            indexHtml,
            new RegExp(`<textarea id="${id}"\\s+class="editable-input auto-resize center-text ncs-description-field" rows="1"></textarea>`)
        );
        assert.doesNotMatch(indexHtml, new RegExp(`<input[^>]+id="${id}"`));
    }

    assert.match(
        formFillJs,
        /<textarea id="f_\$\{prefix\}Desc" class="editable-input auto-resize center-text ncs-description-field" rows="1"><\/textarea>/
    );
    assert.match(
        formFillJs,
        /<textarea class="editable-input auto-resize center-text ncs-description-field return-san-asset-field return-san-asset-desc" rows="1"><\/textarea>/
    );
    assert.match(
        formFillJs,
        /<textarea id="\$\{rowIds\.modelId\}" class="editable-input auto-resize center-text ncs-description-field" rows="1"><\/textarea>/
    );

    const descriptionRule = experienceCss.match(/textarea\.ncs-description-field\s*\{([\s\S]*?)\}/);
    assert.ok(descriptionRule);
    assert.match(descriptionRule[1], /display:\s*block;/);
    assert.match(descriptionRule[1], /box-sizing:\s*border-box;/);
    assert.match(descriptionRule[1], /min-height:\s*1\.25rem;/);
    assert.match(descriptionRule[1], /line-height:\s*1\.2;/);
    assert.match(descriptionRule[1], /resize:\s*none;/);
    assert.match(descriptionRule[1], /overflow:\s*hidden;/);
    assert.match(descriptionRule[1], /white-space:\s*pre-wrap;/);
    assert.match(descriptionRule[1], /overflow-wrap:\s*anywhere;/);
    assert.match(descriptionRule[1], /word-break:\s*break-word;/);
});

test('auto-grows description fields when autofill assigns a long model', () => {
    const { app, document } = loadApp();
    const field = document.getElementById('f_retDesc');
    const description = '13-INCH MACBOOK AIR; APPLE M2; 16GB RAM; 512GB SSD';

    field.classList.add('auto-resize');
    field.scrollHeight = 56;
    app.setInputValue('f_retDesc', description);

    assert.equal(field.value, description);
    assert.equal(field.style.height, '56px');
});

test('keeps accountability print signatures in the Test Device layout flow', () => {
    const printCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'print.css'), 'utf8');
    const accountabilityFlowCss = printCss.slice(printCss.lastIndexOf('Keep Asset Accountability signatures'));

    assert.match(accountabilityFlowCss, /#template-test-device-accountability \.tda-signatures-grid\.ncs-accountability-signatures[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 24\.5%\)\) !important;/);
    assert.match(accountabilityFlowCss, /grid-template-columns:\s*repeat\(3, minmax\(0, 24\.5%\)\) !important;[\s\S]*?gap:\s*1\.55rem !important;/);
    assert.doesNotMatch(printCss, /grid-template-columns:\s*29% 36% 29%/);
    assert.match(
        accountabilityFlowCss,
        /#template-accountability #accountabilityForm:is\(\[data-asset-count="0"\], \[data-asset-count="1"\]\) \.ncs-accountability-signatures,[\s\S]*?margin-top:\s*3\.75rem\s*!important;/
    );
    assert.match(
        accountabilityFlowCss,
        /#template-accountability #accountabilityForm\[data-asset-count="2"\] \.ncs-accountability-signatures,[\s\S]*?margin-top:\s*1\.85rem\s*!important;/
    );
    assert.match(
        accountabilityFlowCss,
        /#template-accountability \.accountability-print-page\[data-page-role="final"\] \.ncs-accountability-signatures[\s\S]*?padding-top:\s*0\.3rem\s*!important;[\s\S]*?padding-right:\s*1\.25rem\s*!important;[\s\S]*?padding-left:\s*1\.25rem\s*!important;/
    );
    assert.match(accountabilityFlowCss, /#template-accountability #accountabilityForm \.ncs-accountability-signatures \.ncs-signature-panel[\s\S]*?break-inside:\s*avoid\s*!important;/);
    assert.match(accountabilityFlowCss, /#template-test-device-accountability \.tda-signatures-grid \.ncs-signature-role-row[\s\S]*?height:\s*1\.4rem\s*!important;[\s\S]*?overflow:\s*hidden\s*!important;/);
    assert.match(accountabilityFlowCss, /data-print-fit="ultra"[\s\S]*?font-size:\s*0\.41rem\s*!important;/);
});

test('fits long printable signature positions without increasing row height', () => {
    const { app } = loadApp();

    assert.equal(app.getPrintSignatureFitTier('Sr. Software Engineer'), 'normal');
    assert.equal(app.getPrintSignatureFitTier('Senior Enterprise Applications Support Specialist'), 'compact');
    assert.equal(app.getPrintSignatureFitTier('Senior Enterprise Applications Support and Service Specialist'), 'tight');
    assert.equal(app.getPrintSignatureFitTier('Senior Enterprise Applications Support and Service Delivery Operations Specialist for Regional Technology Platforms'), 'ultra');
});

test('keeps narrow-screen form previews responsive across lookup modes', () => {
    const experienceCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'experience.css'), 'utf8');

    assert.match(
        experienceCss,
        /@media screen and \(max-width: 960px\)[\s\S]*?#template-test-device-accountability \.tda-signatures-grid\.ncs-accountability-signatures[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) !important;/
    );
    assert.match(
        experienceCss,
        /@media screen and \(max-width: 760px\)[\s\S]*?\.printable-form\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;/
    );
});

test('keeps dual lookup fields wide by placing desktop actions on their own row', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const experienceCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'experience.css'), 'utf8');

    assert.match(
        experienceCss,
        /\.search-section\.test-device-mode \.test-device-search-panel\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/
    );
    assert.match(
        experienceCss,
        /\.search-section\.test-device-mode \.test-device-search-actions\s*\{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?justify-content:\s*flex-end;/
    );
    assert.doesNotMatch(
        experienceCss,
        /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\) minmax\(14rem, 0\.42fr\)/
    );
    assert.match(indexHtml, /assets\/css\/base\.css\?v=[^"\s]+/);
    assert.match(indexHtml, /assets\/css\/components\.css\?v=[^"\s]+/);
    assert.match(indexHtml, /assets\/css\/forms\.css\?v=[^"\s]+/);
    assert.match(indexHtml, /assets\/css\/print\.css\?v=[^"\s]+" media="print"/);
    assert.match(indexHtml, /assets\/css\/experience\.css\?v=[^"\s]+/);
    assert.match(indexHtml, /assets\/js\/config\.js\?v=[^"\s]+/);
    assert.match(indexHtml, /assets\/js\/signer-rosters\.js\?v=[^"\s]+/);
    assert.match(indexHtml, /assets\/js\/search\.js\?v=[^"\s]+/);
    assert.match(indexHtml, /assets\/js\/form-fill\.js\?v=[^"\s]+/);
    assert.match(indexHtml, /assets\/js\/print\.js\?v=[^"\s]+/);
    assert.match(indexHtml, /assets\/js\/tutorial-loader\.js\?v=[^"\s]+/);
    assert.match(indexHtml, /data-tutorial-src="assets\/js\/tutorial\.js\?v=[^"\s]+"/);
    assert.doesNotMatch(indexHtml, /assets\/css\/style\.css|fontawesome\/css\/all\.min\.css|\ssrc="assets\/js\/tutorial\.js/);
});

test('uses the supplied NCS logo with a themed gradient backdrop', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const experienceCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'experience.css'), 'utf8');
    const sidebarLogoPath = path.join(__dirname, '..', 'assets', 'img', 'ncs-logo-sidebar.png');

    assert.equal(fs.existsSync(sidebarLogoPath), false);
    const optimizedLogoPath = path.join(__dirname, '..', 'assets', 'img', 'ncs-logo-optimized.png');
    const originalLogoPath = path.join(__dirname, '..', 'assets', 'img', 'ncs-logo.png');

    assert.match(indexHtml, /<div class="panel-brand-mark"[^>]*>[\s\S]*?assets\/img\/ncs-logo-optimized\.png/);
    assert.ok(fs.statSync(optimizedLogoPath).size < fs.statSync(originalLogoPath).size);
    assert.match(experienceCss, /\.panel-brand-mark\s*\{[\s\S]*?background:\s*linear-gradient\(/);
    assert.match(experienceCss, /\.panel-brand-mark img\s*\{[\s\S]*?filter:\s*none;[\s\S]*?visibility:\s*visible;/);
    assert.doesNotMatch(experienceCss, /\.panel-brand-mark::before/);
});

test('uses the NCS accountability palette in the form comfort preview', () => {
    const settingsHtml = fs.readFileSync(path.join(__dirname, '..', 'settings.html'), 'utf8');
    const settingsCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'settings.css'), 'utf8');

    assert.match(settingsHtml, /Live NCS Form Preview/);
    assert.match(settingsHtml, /form-comfort-preview-brand[\s\S]*?assets\/img\/ncs-logo-optimized\.png/);
    assert.match(settingsHtml, /form-comfort-preview-bar">Asset Accountability Form/);
    assert.match(settingsCss, /\.form-comfort-preview-paper\s*\{[\s\S]*?--ncs-preview-navy:\s*#172d67;[\s\S]*?--ncs-preview-sky:\s*#53a6dc;/);
    assert.match(settingsCss, /\.form-comfort-preview-detail-head span\s*\{[\s\S]*?background:\s*var\(--ncs-preview-navy\);[\s\S]*?color:\s*#ffffff;/);
    assert.doesNotMatch(settingsCss, /#6a329d|#ece5f2/);
    assert.match(settingsHtml, /assets\/css\/settings\.css\?v=20260728opt1/);
    assert.doesNotMatch(settingsHtml, /assets\/css\/forms\.css|assets\/css\/print\.css|assets\/css\/style\.css/);
});

test('keeps the tutorial current, user-paced, and easy to navigate', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const tutorialSource = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'tutorial.js'), 'utf8');
    const componentsCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'components.css'), 'utf8');
    const stepsSource = tutorialSource.match(/const tutorialSteps = \[([\s\S]*?)\n\s*\];/)?.[1] || '';
    const stepIds = Array.from(stepsSource.matchAll(/\bid: '([^']+)'/g), (match) => match[1]);

    assert.equal(stepIds.length, 9);
    assert.equal(new Set(stepIds).size, 9);
    assert.deepEqual(stepIds, [
        'welcome',
        'upload-sources',
        'check-sources',
        'accountability-mode',
        'accountability-lookup',
        'test-devices',
        'return-sanitation',
        'review-adjust',
        'print-save'
    ]);

    assert.match(stepsSource, /recognized source role/);
    assert.match(stepsSource, /ITSM Task Assignment plus New Hire Attendance/);
    assert.match(stepsSource, /Replacement, Refresh,[\s\S]*Temporary[\s\S]*Master Tracker/);
    assert.match(stepsSource, /Use <strong>Add<\/strong> when one person has several devices/);
    assert.match(stepsSource, /fills and prints the Return and Sanitation forms together/);
    assert.match(stepsSource, /Copy row[\s\S]*one Google Sheets-ready row per asset/);
    assert.match(stepsSource, /everything important stays editable/);
    assert.doesNotMatch(stepsSource, /newer export|narrows results|prefers the <strong>Test Device/);
    assert.doesNotMatch(stepsSource, /Yondu/i);

    assert.match(indexHtml, /id="tutorialProgress"[^>]*role="progressbar"/);
    assert.match(indexHtml, /id="tutorialBackBtn"/);
    assert.match(indexHtml, /id="tutorialNextBtn"/);
    assert.match(indexHtml, />Exit tour<\/span>/);
    assert.match(componentsCss, /\.tutorial-actions\s*\{[\s\S]*?pointer-events:\s*auto;/);
    assert.match(tutorialSource, /function navigateTutorial\(direction\)/);
    assert.match(tutorialSource, /isLastStep \? 'Finish' : 'Next'/);
    assert.equal((tutorialSource.match(/scheduleTutorialStepAdvance\(/g) || []).length, 0);

    assert.match(tutorialSource, /const TUTORIAL_VOICE_PITCH = 1;/);
    assert.match(tutorialSource, /name\.includes\('natural'\) \|\| name\.includes\('neural'\)[\s\S]*?score \+= 120;/);
    assert.doesNotMatch(tutorialSource, /preferredMaleTokens|discouragedTokens/);
});

test('provides Excel preview, CSV download, and demo data actions for active sources', () => {
    const { app } = loadApp();
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const componentsCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'css', 'components.css'), 'utf8');

    assert.equal(typeof app.openExcelPreviewModal, 'function');
    assert.equal(typeof app.closeExcelPreviewModal, 'function');
    assert.equal(typeof app.downloadCsvFile, 'function');
    assert.equal(typeof app.loadDemoDatasets, 'function');

    assert.match(indexHtml, /id="loadDemoDataBtn"/);
    assert.match(indexHtml, /id="excelPreviewModal"/);
    assert.match(indexHtml, /id="excelTable"/);
    assert.match(indexHtml, /id="excelSearchInput"/);
    assert.match(indexHtml, /id="excelDownloadBtn"/);

    assert.match(componentsCss, /\.excel-spreadsheet-table/);
    assert.match(componentsCss, /\.excel-modal-backdrop/);
    assert.match(componentsCss, /\.excel-col-letter/);
    assert.match(componentsCss, /\.excel-row-number/);

    const testFile = app.normalizeStoredFile({
        id: app.createSourceId(),
        name: 'Sample.csv',
        content: 'A,B,C\n1,2,3'
    });
    app.scope.csvFiles = [testFile];
    app.renderFileList();

    const gsheetList = app.scope.elements.gsheetList;
    const item = gsheetList.children[0]?.id === 'fragment' ? gsheetList.children[0].children[0] : gsheetList.children[0];
    const meta = item?.children?.[0];
    const actions = item?.children?.[1];
    assert.ok(meta, 'Source meta container should exist');
    assert.ok(actions, 'Source actions container should exist');

    const cardActions = meta.children.find((c) => (c.className || '').includes('source-card-actions'));
    assert.ok(cardActions, 'Source card action pills container should exist');

    const cardPreviewPill = cardActions.children.find((c) => (c.className || '').includes('btn-source-pill-preview'));
    const cardDownloadPill = cardActions.children.find((c) => (c.className || '').includes('btn-source-pill-download'));
    assert.ok(cardPreviewPill, 'Preview pill button should exist on card');
    assert.ok(cardDownloadPill, 'Download pill button should exist on card');
    assert.match(cardPreviewPill.innerHTML, /Preview in Excel/);
    assert.match(cardDownloadPill.innerHTML, /Download CSV/);
    assert.match(cardPreviewPill.innerHTML, /<svg class="icon-svg"/);
    assert.match(cardDownloadPill.innerHTML, /<svg class="icon-svg"/);

    const previewBtn = actions.children.find((c) => (c.className || '').includes('btn-preview'));
    const downloadBtn = actions.children.find((c) => (c.className || '').includes('btn-download'));
    const removeBtn = actions.children.find((c) => (c.className || '').includes('btn-icon'));

    assert.ok(previewBtn, 'Preview button should exist');
    assert.ok(downloadBtn, 'Download button should exist');
    assert.ok(removeBtn, 'Remove button should exist');
    assert.match(previewBtn.innerHTML, /<svg class="icon-svg"/);
    assert.match(downloadBtn.innerHTML, /<svg class="icon-svg"/);

    // Modal lifecycle test
    app.openExcelPreviewModal(testFile);
    assert.equal(app.scope.elements.excelModalTitle.textContent, 'Sample.csv');
    assert.equal(app.scope.elements.excelPreviewModal.classList.contains('hide'), false);

    app.closeExcelPreviewModal();
    assert.equal(app.scope.elements.excelPreviewModal.classList.contains('hide'), true);
});

