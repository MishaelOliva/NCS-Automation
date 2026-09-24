(function () {
    const App = window.YonduApp = window.YonduApp || {};
    const scope = App.scope = App.scope || {};

    Object.assign(scope, {
        DB_NAME: 'yonduAutofillDB',
        DB_VERSION: 1,
        STORE_NAME: 'appState',
        FILES_RECORD_KEY: 'csvFiles',
        LEGACY_STORAGE_KEY: 'yonduCsvData',
        DEFAULT_ISSUED_NAME: 'PADUA, RUZZEL MICKO GARCIA',
        DEFAULT_ISSUED_POS: 'IT Asset Specialist / Custodian',
        DEFAULT_APPROVED_NAME: 'MENDEZ, PAUL ALDRIN',
        DEFAULT_APPROVED_POS: 'ITSM Lead and Asset Management Lead',
        DEFAULT_RETURN_EMPLOYEE_POS: 'Full Name and Signature',
        DEFAULT_RETURN_IT_POS: 'IT Asset Specialist / Custodian',
        DEFAULT_TEST_DEVICE_PREPARED_NAME: 'PADUA, RUZZEL MICKO GARCIA',
        DEFAULT_TEST_DEVICE_PREPARED_POS: 'IT Asset Specialist / Custodian',
        DEFAULT_SANITIZATION_RETURNEE_NAME: 'SURNAME, FULL NAME',
        DEFAULT_SANITIZATION_RETURNEE_POS: 'Full Name and Signature',
        DEFAULT_SANITIZATION_TECH_SUPPORT_NAME: 'SURNAME, FULL NAME',
        DEFAULT_SANITIZATION_TECH_SUPPORT_POS: 'Corp IT & Infra Technical Support',
        DEFAULT_SANITIZATION_INFOSEC_POS: 'Information Security',
        DEFAULT_SANITIZATION_LEAD_NAME: 'MENDEZ, PAUL ALDRIN',
        DEFAULT_SANITIZATION_LEAD_POS: 'ITSM Lead and Asset Management Lead',
        DEFAULT_SANITIZATION_ASSET_MANAGERS: {
            laptop: 'PADUA, RUZZEL MICKO GARCIA',
            test_device: 'PADUA, RUZZEL MICKO GARCIA'
        },
        SIGNER_ROSTER_STORAGE_KEY: 'ncsSignerRostersV1',
        SIGNER_ROSTERS: {
            issued: {
                label: 'Issued by names',
                defaultName: 'PADUA, RUZZEL MICKO GARCIA',
                seedNames: [
                    'PADUA, RUZZEL MICKO GARCIA',
                    'BRUTAS, KEAN ROSWEN REYES',
                    'DE LEON, RELINE BEQUILLA'
                ]
            },
            approved: {
                label: 'Approved by names',
                defaultName: 'MENDEZ, PAUL ALDRIN',
                seedNames: ['MENDEZ, PAUL ALDRIN']
            },
            technical_support: {
                label: 'Technical support names',
                defaultName: 'SURNAME, FULL NAME',
                seedNames: ['SURNAME, FULL NAME']
            },
            infosec: {
                label: 'InfoSec names',
                defaultName: 'GANDIA, STEFFI MAGNO',
                seedNames: ['GANDIA, STEFFI MAGNO']
            }
        },
        DEFAULT_INFOSEC_NAME: 'GANDIA, STEFFI MAGNO',
        DEFAULT_RETURN_STATUS: 'RETURNED/RESIGN',
        DEFAULT_DOCUMENT_TITLE: document.title,
        ACCOUNTABILITY_PRINT_MODES: {
            new_hire: {
                fileSuffix: 'NEW HIRE'
            },
            replacement: {
                fileSuffix: 'REPLACEMENT'
            },
            refresh: {
                fileSuffix: 'REFRESH'
            },
            temporary: {
                fileSuffix: 'TEMPO'
            }
        },
        RETURN_PRINT_MODES: {
            returned_only: {
                statusValue: 'RETURNED',
                fileSuffix: 'RETURNED ONLY'
            },
            resigned: {
                statusValue: 'RETURNED/RESIGN',
                fileSuffix: 'RESIGNED'
            },
            purchased: {
                statusValue: 'REFRESH/PURCHASED',
                fileSuffix: 'PURCHASED'
            },
            refresh: {
                statusValue: 'RETURNED/REFRESH',
                fileSuffix: 'REFRESH'
            },
            replacement: {
                statusValue: 'RETURNED/REPLACEMENT',
                fileSuffix: 'REPLACEMENT'
            },
            for_repair: {
                statusValue: 'RETURNED/REPAIR',
                fileSuffix: 'FOR REPAIR'
            }
        },
        PRINT_REMARK_OVERRIDES: {
            'laptop with charger (pending box)': 'WITH CHARGER (PENDING BOX)',
            'laptop with bag and charger': 'WITH BAG / CHARGER',
            'laptop without box and charger': 'NO BOX / NO CHARGER',
            'laptop without box': 'NO BOX',
            'laptop with box and charger': 'WITH BOX / CHARGER'
        },
        MONTH_NAMES: ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'],
        SOURCE_KIND: {
            AUTO: 'auto',
            MASTER: 'master',
            ITSM: 'itsm',
            NEW_HIRE: 'new_hire',
            TEST_DEVICE: 'test_device',
            GENERAL: 'general'
        },
        SOURCE_KIND_LABELS: {
            auto: 'Auto detect',
            master: 'Master Tracker',
            itsm: 'ITSM Task Assignment',
            new_hire: 'New Hire Attendance',
            test_device: 'Test Device',
            general: 'General Source'
        },
        SOURCE_KIND_OPTIONS: [
            'auto',
            'master',
            'itsm',
            'new_hire',
            'test_device',
            'general'
        ],
        FIELD_ALIASES: {
            employeeId: {
                exact: ['ee id', 'employee id', 'employee number', 'emp id', 'employee no', 'eeid', 'ee no', 'ee number', 'xr'],
                contains: ['employeeid', 'employeenumber', 'empid', 'eeid', 'eeno', 'eenumber', 'xr']
            },
            employeeName: {
                exact: ['employee name', 'ee name', 'name', 'full name', 'employee full name', 'assignee'],
                contains: ['employeename', 'eename', 'fullname', 'employeefullname', 'assignee']
            },
            position: {
                exact: ['employee position', 'position', 'job title', 'title', 'role', 'for site pick up', 'for site pickup'],
                contains: ['employeeposition', 'jobtitle', 'forsitepickup']
            },
            serial: {
                exact: ['serial no', 'serial number', 'serial', 'imei'],
                contains: ['serialno', 'serialnumber']
            },
            imei: {
                exact: ['imei', 'imei no', 'imei number'],
                contains: ['imeino', 'imeinumber']
            },
            issuedDate: {
                exact: ['issued date', 'date issued'],
                contains: ['issueddate', 'dateissued']
            },
            assetTag: {
                exact: ['asset tag', 'laptop tag', 'tag number', 'tag', 'tagging', 'asset no', 'newly assigned asset (asset no.)', 'newly assigned asset', 'new assigned asset (asset no.)', 'new assigned asset'],
                contains: ['assettag', 'laptoptag', 'tagnumber', 'tagging', 'assetno', 'newlyassignedassetassetno', 'newlyassignedasset', 'newassignedassetassetno', 'newassignedasset']
            },
            description: {
                exact: ['laptop description', 'device description', 'test device description', 'model / description', 'model description', 'description', 'desc', 'model', 'mobile unit'],
                contains: ['laptopdescription', 'devicedescription', 'testdevicedescription', 'modeldescription', 'mobileunit']
            },
            businessUnit: {
                exact: ['business unit', 'bu', 'department', 'dept', 'project', 'for transportify dept group unit', 'dept group unit'],
                contains: ['businessunit', 'project', 'deptgroupunit', 'departmentgroupunit']
            },
            costCenter: {
                exact: ['cost center', 'costcentre'],
                contains: ['costcenter', 'costcentre']
            },
            email: {
                exact: ['email address', 'email', 'e-mail'],
                contains: ['emailaddress']
            },
            contact: {
                exact: ['contact number', 'contact no', 'contact', 'mobile number', 'mobile', 'phone number', 'phone'],
                contains: ['contactnumber', 'mobilenumber', 'phonenumber']
            },
            status: {
                exact: ['employee status', 'status'],
                contains: ['employeestatus']
            },
            setupDate: {
                exact: ['setup date', 'date setup', 'deployment date', 'deployed date', 'issued date', 'day o.n.e strong start', 'day o.n.e. strong start', 'day one strong start', 'assigned date', 'date assigned', 'assignment date', 'release date', 'for site pick up start date'],
                contains: ['setupdate', 'deploymentdate', 'deployeddate', 'issueddate', 'dayonestrongstart', 'assigneddate', 'dateassigned', 'assignmentdate', 'releasedate', 'startdate', 'strongstart']
            },
            issuedBy: {
                exact: ['issued by', 'issuer name'],
                contains: ['issuedby', 'issuername']
            },
            issuerPosition: {
                exact: ['issuer position', 'issued by position'],
                contains: ['issuerposition', 'issuedbyposition']
            }
        },
        SOURCE_VALIDATION_STATE: {
            READY: 'ready',
            WARNING: 'warning',
            INVALID: 'invalid'
        },
        STATUS_COPY: {
            ready: 'Ready',
            partial: 'Partially ready',
            missing: 'Missing source'
        },
        parsedCache: new Map(),
        csvFiles: [],
        testDeviceLookupInputs: [],
        currentFormType: 'accountability',
        currentAccountabilityPrintMode: 'new_hire',
        currentReturnPrintMode: 'resigned',
        isSyncingReturnPrintMode: false,
        storageReady: false,
        initPromise: null,
        alertTimers: {
            success: null,
            error: null,
            warning: null
        },
        lastSourceFeedback: null,
        busyState: {
            search: false,
            upload: false
        },
        sourceDiagnostics: new Map(),
        formDirtyBaseline: '',
        hasPendingDirtyReset: false
    });

    scope.elements = {
        csvFileInput: document.getElementById('csvFileInput'),
        loadDemoDataBtn: document.getElementById('loadDemoDataBtn'),
        sheetCopyBtn: document.getElementById('copySheetRowBtn'),
        tutorialBtn: document.getElementById('tutorialBtn'),
        clearSourcesBtn: document.getElementById('clearSourcesBtn'),
        gsheetList: document.getElementById('gsheetList'),
        excelPreviewModal: document.getElementById('excelPreviewModal'),
        excelCloseBtn: document.getElementById('excelCloseBtn'),
        excelDownloadBtn: document.getElementById('excelDownloadBtn'),
        excelSearchInput: document.getElementById('excelSearchInput'),
        excelSearchClearBtn: document.getElementById('excelSearchClearBtn'),
        excelTableHead: document.getElementById('excelTableHead'),
        excelTableBody: document.getElementById('excelTableBody'),
        excelModalTitle: document.getElementById('excelModalTitle'),
        excelRoleBadge: document.getElementById('excelRoleBadge'),
        excelDimsBadge: document.getElementById('excelDimsBadge'),
        excelRowRangeInfo: document.getElementById('excelRowRangeInfo'),
        excelFilterActiveNotice: document.getElementById('excelFilterActiveNotice'),
        excelEmptyState: document.getElementById('excelEmptyState'),
        excelFirstPageBtn: document.getElementById('excelFirstPageBtn'),
        excelPrevPageBtn: document.getElementById('excelPrevPageBtn'),
        excelNextPageBtn: document.getElementById('excelNextPageBtn'),
        excelLastPageBtn: document.getElementById('excelLastPageBtn'),
        excelPageIndicator: document.getElementById('excelPageIndicator'),
        excelPageSizeSelect: document.getElementById('excelPageSizeSelect'),
        appHeader: document.getElementById('appHeader'),
        appLogo: document.getElementById('appLogo'),
        tutorialGlowResetBtn: document.getElementById('tutorialGlowResetBtn'),
        searchSection: document.querySelector('.search-section'),
        accountabilityPrintModePanel: document.getElementById('accountabilityPrintModePanel'),
        returnPrintModePanel: document.getElementById('returnPrintModePanel'),
        printFilePreview: document.getElementById('printFilePreview'),
        defaultSearchSection: document.getElementById('defaultSearchSection'),
        accountabilityReplacementSearchPanel: document.getElementById('accountabilityReplacementSearchPanel'),
        accEmployeeSearchInput: document.getElementById('accEmployeeSearchInput'),
        accAssetSearchInput: document.getElementById('accAssetSearchInput'),
        accReplacementAutofillBtn: document.getElementById('accReplacementAutofillBtn'),
        testDeviceAccountabilitySearchPanel: document.getElementById('testDeviceAccountabilitySearchPanel'),
        tdaAddBtn: document.getElementById('tdaAddBtn'),
        tdaAssetSearchRows: document.getElementById('tdaAssetSearchRows'),
        searchBtn: document.getElementById('searchBtn'),
        searchInput: document.getElementById('searchInput'),
        tdaAssetSearchInput: document.getElementById('tdaAssetSearchInput'),
        tdaEmployeeSearchInput: document.getElementById('tdaEmployeeSearchInput'),
        tdaAutofillBtn: document.getElementById('tdaAutofillBtn'),
        printBtn: document.getElementById('printBtn'),
        loadingIndicator: document.getElementById('loadingIndicator'),
        errorMsg: document.getElementById('errorMessage'),
        errorMsgText: document.getElementById('errorMessageText'),
        successMsg: document.getElementById('successMessage'),
        successMsgText: document.getElementById('successMessageText'),
        warningMsg: document.getElementById('warningMessage'),
        warningMsgText: document.getElementById('warningMessageText'),
        dismissErrorBtn: document.getElementById('dismissErrorBtn'),
        dismissSuccessBtn: document.getElementById('dismissSuccessBtn'),
        dismissWarningBtn: document.getElementById('dismissWarningBtn'),
        sourceStatusPanel: document.getElementById('sourceStatusPanel'),
        sourceStatusForm: document.getElementById('statusActiveForm'),
        sourceStatusMode: document.getElementById('statusActiveMode'),
        sourceStatusCount: document.getElementById('statusLoadedSources'),
        sourceStatusReadiness: document.getElementById('statusAutofillReadiness'),
        tutorialOverlay: document.getElementById('tutorialOverlay'),
        tutorialSpotlight: document.getElementById('tutorialSpotlight'),
        tutorialSkipBtn: document.getElementById('tutorialSkipBtn'),
        tutorialCursor: document.getElementById('tutorialCursor'),
        tutorialBubble: document.getElementById('tutorialBubble'),
        tutorialStepCount: document.getElementById('tutorialStepCount'),
        tutorialProgress: document.getElementById('tutorialProgress'),
        tutorialProgressBar: document.getElementById('tutorialProgressBar'),
        tutorialTitle: document.getElementById('tutorialTitle'),
        tutorialText: document.getElementById('tutorialText'),
        tutorialExamplePanel: document.getElementById('tutorialExamplePanel'),
        tutorialExampleBody: document.getElementById('tutorialExampleBody'),
        tutorialReplayBtn: document.getElementById('tutorialReplayBtn'),
        tutorialVoiceToggleBtn: document.getElementById('tutorialVoiceToggleBtn'),
        tutorialBackBtn: document.getElementById('tutorialBackBtn'),
        tutorialNextBtn: document.getElementById('tutorialNextBtn')
    };

    if (scope.elements.tdaAssetSearchInput) {
        scope.testDeviceLookupInputs.push(scope.elements.tdaAssetSearchInput);
    }

    scope.templates = {
        accountability: document.getElementById('template-accountability'),
        testDeviceAccountability: document.getElementById('template-test-device-accountability'),
        returnForm: document.getElementById('template-return'),
        sanitization: document.getElementById('template-sanitization')
    };

    Object.assign(App, {
        scope
    });
})();
