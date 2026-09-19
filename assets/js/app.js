(function () {
    const App = window.YonduApp;
    const scope = App.scope;

    with (scope) {
        initPromise = initializeApp();

        bindFormSelection();
        bindFormSelectorDropdown();
        bindComboboxes();
        bindSignerNamePickers();
        bindMirroredFields();
        bindDateInputs();
        bindAssigneeNameAutosize();
        bindTextareaAutoResize();
        bindSourceManagement();
        bindReturnSanSheetCopy();
        bindPrintNaming();
        bindSearch();
        bindPrint();
        if (typeof bindTutorial === 'function') {
            bindTutorial();
        }
        updateRemarksDropdowns(false, false);
        resetForm();
        syncPrintModeVisibility();
        updatePrintDocumentTitle();

        if (typeof bindStatusAndSafety === 'function') {
            bindStatusAndSafety();
        }
        if (typeof syncSourceStatusPanel === 'function') {
            syncSourceStatusPanel();
        }

        window.addEventListener('resize', syncSearchHeaderOverflow);
        window.requestAnimationFrame(syncSearchHeaderOverflow);
    }
})();
