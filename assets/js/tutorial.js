(function () {
    const App = window.YonduApp;
    const scope = App.scope;

    with (scope) {
        const TUTORIAL_PREPARE_DELAY = 450;
        const TUTORIAL_CURSOR_OFFSET = 12;
        const TUTORIAL_BUBBLE_GAP = 24;
        const TUTORIAL_EXAMPLE_GAP = 16;
        const TUTORIAL_VIEWPORT_MARGIN = 16;
        const TUTORIAL_GLOW_STORAGE_KEY = 'yonduTutorialGlowDismissed';
        const TUTORIAL_GLOW_RESET_WINDOW_MS = 3000;
        const TUTORIAL_VOICE_MUTE_STORAGE_KEY = 'yonduTutorialVoiceMuted';
        const TUTORIAL_VOICE_RATE = 0.96;
        const TUTORIAL_VOICE_PITCH = 1;
        const tutorialRuntime = {
            active: false,
            snapshot: null,
            previousFocus: null,
            timers: [],
            glowResetClicks: [],
            currentStepIndex: -1,
            speech: {
                supported: typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined',
                enabled: true,
                selectedVoice: null,
                voicesLoaded: false
            }
        };

        const TUTORIAL_EXTRA_FIELD_IDS = [
            'searchInput',
            'accEmployeeSearchInput',
            'accAssetSearchInput',
            'tdaAssetSearchInput',
            'tdaEmployeeSearchInput',
            'retFormTitle',
            'retFooterText',
            'sanFooterText',
            'sanAssetManager',
            'retDescHeader',
            'retRemarksHeader',
            'sanDescHeader',
            'sanRemarksHeader'
        ];

        const tutorialSteps = [
            {
                id: 'welcome',
                title: 'Let’s get a form ready',
                body: '<span class="tutorial-summary">We’ll go from CSV files to a form that’s ready to print.</span><span class="tutorial-detail">This takes about two minutes. Use <strong>Back</strong> and <strong>Next</strong> at your own pace. You can exit at any time—your current work will be restored.</span>',
                narration: 'Let’s get a form ready. We’ll go from your CSV files to a form that is ready to print. Take your time, and use Back or Next whenever you are ready.',
                target: () => elements.appHeader || document.getElementById('formSelector'),
                placement: 'bottom'
            },
            {
                id: 'upload-sources',
                title: 'Add your CSV files',
                body: '<span class="tutorial-summary">Choose all the exports you need—you can select several at once.</span><span class="tutorial-detail">They stay in this browser. If you upload another file for a recognized source role, it replaces the saved file for that role.</span>',
                narration: 'Start by choosing the CSV exports you need. You can select several at once. The files stay in this browser, and another upload for the same recognized role replaces the saved one.',
                target: () => elements.csvFileInput,
                placement: 'right'
            },
            {
                id: 'check-sources',
                title: 'Check the source cards',
                body: '<span class="tutorial-summary">Aim for <strong>Ready</strong> before you start autofill.</span><span class="tutorial-detail">The app guesses each source role from its filename. If the role is wrong—or a card says <strong>Needs review</strong>—choose the correct role on that source card and check the message.</span>',
                narration: 'Next, check the source cards. The app guesses each role from the filename. If it guesses wrong, choose the correct role on the card. Aim for Ready before you start autofill.',
                target: () => elements.sourceStatusPanel,
                placement: 'right'
            },
            {
                id: 'accountability-mode',
                title: 'Choose an Accountability mode',
                body: '<span class="tutorial-summary">Pick the job you’re doing before you search.</span><span class="tutorial-detail"><strong>New Hire</strong> uses ITSM Task Assignment plus New Hire Attendance. <strong>Replacement, Refresh,</strong> and <strong>Temporary</strong> use the Master Tracker.</span>',
                narration: 'For Accountability, pick the job first. New Hire uses the ITSM Task Assignment and New Hire Attendance files. Replacement, Refresh, and Temporary use the Master Tracker.',
                target: () => elements.accountabilityPrintModePanel,
                placement: 'right',
                prepare() {
                    activateTutorialForm('accountability');
                    setAccountabilityPrintMode('new_hire');
                }
            },
            {
                id: 'accountability-lookup',
                title: 'Fill the Accountability form',
                body: '<span class="tutorial-summary">Search with the information you already have.</span><span class="tutorial-detail">New Hire accepts an EE ID, full name, asset tag, or serial number in one box. In the other modes, the employee and asset lookups work independently, so either one—or both—can fill the form.</span>',
                narration: 'Now search with whatever you already have. New Hire uses one search box. In the other modes, the employee and asset lookups work independently, so you can use either one or both.',
                target: () => elements.defaultSearchSection,
                placement: 'bottom',
                prepare() {
                    activateTutorialForm('accountability');
                    setAccountabilityPrintMode('new_hire');
                }
            },
            {
                id: 'test-devices',
                title: 'Work with test devices',
                body: '<span class="tutorial-summary">Enter the device on the left and the assignee on the right.</span><span class="tutorial-detail">Use <strong>Add</strong> when one person has several devices. Test-device Accountability needs both the Test Device CSV and the Master Tracker.</span>',
                narration: 'For test devices, enter the device on the left and the assignee on the right. Use Add when one person has several devices. You will need both the Test Device file and the Master Tracker.',
                target: () => elements.testDeviceAccountabilitySearchPanel,
                placement: 'left',
                prepare() {
                    activateTutorialForm('test_device_accountability');
                }
            },
            {
                id: 'return-sanitation',
                title: 'Prepare Return & Sanitation',
                body: '<span class="tutorial-summary">This workflow fills and prints the Return and Sanitation forms together.</span><span class="tutorial-detail">Laptops and monitors use the Master Tracker and can search several asset tags or serials. Test devices need both the Test Device CSV and the Master Tracker.</span>',
                narration: 'Return and Sanitation always work as a pair. Laptops and monitors use the Master Tracker and can search several assets. Test devices need both the Test Device file and the Master Tracker.',
                target: () => document.getElementById('sanitizationDropdownBtn'),
                placement: 'bottom',
                click: true,
                prepare() {
                    openTutorialDropdown();
                },
                action() {
                    activateTutorialForm('sanitization_laptop');
                },
                postActionTarget: () => elements.defaultSearchSection
            },
            {
                id: 'review-adjust',
                title: 'Review and adjust',
                body: '<span class="tutorial-summary">Autofill gives you a starting point—everything important stays editable.</span><span class="tutorial-detail">Choose the right return reason, then check names, dates, remarks, assets, and signers. <strong>Copy row</strong> creates one Google Sheets-ready row per asset.</span>',
                narration: 'Treat autofill as a starting point. Choose the right return reason, then review the names, dates, remarks, assets, and signers. Copy row gives you one Google Sheets ready row for each asset.',
                target: () => elements.returnPrintModePanel,
                placement: 'right',
                prepare() {
                    activateTutorialForm('sanitization_laptop');
                }
            },
            {
                id: 'print-save',
                title: 'Print or save',
                body: '<span class="tutorial-summary">Check the PDF name in the sidebar, then select <strong>Print Form</strong>.</span><span class="tutorial-detail">Choose <strong>Save as PDF</strong> in the print window when everything looks right. Select <strong>Finish</strong> below to return to your original workspace.</span>',
                narration: 'Finally, check the PDF name in the sidebar and select Print Form. Choose Save as PDF when everything looks right. Finish the tour to return to your original workspace.',
                target: () => elements.printBtn,
                placement: 'left'
            }
        ];


        function bindTutorial() {
            if (!elements.tutorialBtn || !elements.tutorialOverlay || elements.tutorialBtn.dataset.tutorialBound === 'true') {
                return;
            }

            elements.tutorialBtn.dataset.tutorialBound = 'true';
            applyTutorialGlowState();
            bindTutorialVoice();
            elements.tutorialBtn.addEventListener('click', startTutorial);
            elements.tutorialSkipBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                endTutorial();
            });
            elements.tutorialBackBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                navigateTutorial(-1);
            });
            elements.tutorialNextBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                navigateTutorial(1);
            });
            elements.tutorialGlowResetBtn?.addEventListener('click', handleTutorialGlowResetClick);
            document.addEventListener('keydown', handleTutorialKeydown);
            window.addEventListener('pagehide', handleTutorialPageExit);
            window.addEventListener('beforeunload', handleTutorialPageExit);
        }


        function handleTutorialPageExit() {
            clearTutorialTimers();
            cancelTutorialSpeech();
        }


        function handleTutorialKeydown(event) {
            if (!tutorialRuntime.active || !elements.tutorialOverlay) {
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                endTutorial();
                return;
            }

            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                navigateTutorial(-1);
                return;
            }

            if (event.key === 'ArrowRight') {
                event.preventDefault();
                navigateTutorial(1);
                return;
            }

            if (event.key !== 'Tab') {
                return;
            }

            const focusableElements = Array.from(elements.tutorialOverlay.querySelectorAll(
                'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
            )).filter((element) => !element.classList.contains('hide') && element.getAttribute('aria-hidden') !== 'true');

            if (!focusableElements.length) {
                event.preventDefault();
                return;
            }

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];
            const activeElement = document.activeElement;

            if (!elements.tutorialOverlay.contains(activeElement)) {
                event.preventDefault();
                firstElement.focus();
                return;
            }

            if (event.shiftKey && activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
                return;
            }

            if (!event.shiftKey && activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        }


        async function startTutorial() {
            await Promise.resolve(initPromise).catch(() => {
                return;
            });

            if (tutorialRuntime.active) {
                endTutorial({ dismissGlow: false });
                await delay(50);
            }

            tutorialRuntime.active = true;
            tutorialRuntime.currentStepIndex = -1;
            tutorialRuntime.snapshot = captureTutorialState();
            tutorialRuntime.previousFocus = document.activeElement;

            document.body.classList.add('tutorial-active');
            elements.tutorialOverlay.removeAttribute('inert');
            elements.tutorialOverlay.classList.remove('hide');
            elements.tutorialOverlay.classList.add('is-visible');
            elements.tutorialOverlay.setAttribute('aria-hidden', 'false');
            elements.tutorialSkipBtn.classList.remove('hide');
            elements.tutorialCursor.classList.remove('is-clicking');

            playTutorialStep(0);
            window.requestAnimationFrame(() => {
                elements.tutorialNextBtn?.focus();
            });
        }


        function navigateTutorial(direction) {
            if (!tutorialRuntime.active || !Number.isFinite(direction)) {
                return;
            }

            const nextIndex = tutorialRuntime.currentStepIndex + Math.sign(direction);
            if (nextIndex < 0) {
                return;
            }

            if (nextIndex >= tutorialSteps.length) {
                endTutorial();
                return;
            }

            playTutorialStep(nextIndex);
        }


        function playTutorialStep(index) {
            clearTutorialTimers();
            closeTutorialDropdown();
            closeTutorialComboboxes();
            resetTutorialDemoInputs();

            if (!tutorialRuntime.active) {
                return;
            }

            if (index >= tutorialSteps.length) {
                endTutorial();
                return;
            }

            const step = tutorialSteps[index];
            tutorialRuntime.currentStepIndex = index;
            if (typeof step.prepare === 'function') {
                step.prepare();
            }

            scheduleTutorialTimer(() => {
                if (!tutorialRuntime.active) {
                    return;
                }

                const target = resolveTutorialTarget(step);
                if (!target) {
                    playTutorialStep(index + 1);
                    return;
                }

                    revealTutorialTarget(target);

                    scheduleTutorialTimer(() => {
                        if (!tutorialRuntime.active) {
                        return;
                    }

                    positionTutorialStep(step, target, index, {
                        showExample: !step.showExampleAfterAction
                    });
                    speakTutorialStep(step);
                    runTutorialStepDemo(step, index);

                    if ((step.click || typeof step.action === 'function') && !step.runActionOnAdvance) {
                        scheduleTutorialTimer(() => {
                            triggerTutorialClick(step, target, index);
                        }, step.clickDelay || 220);
                    }
                }, TUTORIAL_PREPARE_DELAY);
            }, 0);
        }


        function resolveTutorialTarget(step) {
            if (!step) {
                return null;
            }

            if (typeof step.target === 'function') {
                return step.target();
            }

            if (typeof step.target === 'string') {
                return document.querySelector(step.target);
            }

            return step.target || null;
        }


        function revealTutorialTarget(target) {
            if (!target || typeof target.scrollIntoView !== 'function') {
                return;
            }

            target.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'center'
            });
        }


        function positionTutorialStep(step, target, index, options = {}) {
            const rect = target.getBoundingClientRect();
            const padding = step.padding || 12;
            const spotlightTop = Math.max(TUTORIAL_VIEWPORT_MARGIN, rect.top - padding);
            const spotlightLeft = Math.max(TUTORIAL_VIEWPORT_MARGIN, rect.left - padding);
            const spotlightWidth = Math.min(window.innerWidth - (TUTORIAL_VIEWPORT_MARGIN * 2), rect.width + (padding * 2));
            const spotlightHeight = Math.min(window.innerHeight - (TUTORIAL_VIEWPORT_MARGIN * 2), rect.height + (padding * 2));

            elements.tutorialSpotlight.style.top = `${spotlightTop}px`;
            elements.tutorialSpotlight.style.left = `${spotlightLeft}px`;
            elements.tutorialSpotlight.style.width = `${spotlightWidth}px`;
            elements.tutorialSpotlight.style.height = `${spotlightHeight}px`;
            elements.tutorialSpotlight.style.borderRadius = `${step.radius || 22}px`;

            elements.tutorialStepCount.textContent = `Step ${index + 1} of ${tutorialSteps.length}`;
            elements.tutorialTitle.textContent = step.title;
            elements.tutorialText.innerHTML = step.body;
            syncTutorialNavigation(index);

            positionTutorialCursor(rect, step);
            positionTutorialBubble(rect, step);
            renderTutorialExample(options.showExample === false ? null : step);
            positionTutorialExamplePanel(rect);
            resolveTutorialPanelOverlap(rect, step);
        }


        function syncTutorialNavigation(index) {
            const stepNumber = index + 1;
            const progress = (stepNumber / tutorialSteps.length) * 100;

            if (elements.tutorialProgress) {
                elements.tutorialProgress.setAttribute('aria-valuenow', String(stepNumber));
                elements.tutorialProgress.setAttribute('aria-valuemax', String(tutorialSteps.length));
                elements.tutorialProgress.setAttribute('aria-valuetext', `Step ${stepNumber} of ${tutorialSteps.length}`);
            }
            if (elements.tutorialProgressBar) {
                elements.tutorialProgressBar.style.width = `${progress}%`;
            }
            if (elements.tutorialBackBtn) {
                elements.tutorialBackBtn.disabled = index === 0;
            }
            if (elements.tutorialNextBtn) {
                const isLastStep = index === tutorialSteps.length - 1;
                elements.tutorialNextBtn.textContent = isLastStep ? 'Finish' : 'Next';
                elements.tutorialNextBtn.setAttribute('aria-label', isLastStep ? 'Finish tutorial' : 'Next tutorial step');
            }
        }


        function positionTutorialCursor(rect, step) {
            const anchorX = typeof step.cursorX === 'number' ? step.cursorX : 0.55;
            const anchorY = typeof step.cursorY === 'number' ? step.cursorY : 0.55;
            const cursorLeft = clamp(rect.left + (rect.width * anchorX) - TUTORIAL_CURSOR_OFFSET, TUTORIAL_VIEWPORT_MARGIN, window.innerWidth - 48);
            const cursorTop = clamp(rect.top + (rect.height * anchorY) - TUTORIAL_CURSOR_OFFSET, TUTORIAL_VIEWPORT_MARGIN, window.innerHeight - 48);

            elements.tutorialCursor.style.left = `${cursorLeft}px`;
            elements.tutorialCursor.style.top = `${cursorTop}px`;
        }


        function positionTutorialBubble(rect, step) {
            const bubble = elements.tutorialBubble;
            const bubbleWidth = Math.min(bubble.offsetWidth || 360, window.innerWidth - (TUTORIAL_VIEWPORT_MARGIN * 2));
            const bubbleHeight = bubble.offsetHeight || 180;
            const placement = step.placement || 'right';
            let left = rect.right + TUTORIAL_BUBBLE_GAP;
            let top = rect.top + (rect.height / 2) - (bubbleHeight / 2);

            if (placement === 'left') {
                left = rect.left - bubbleWidth - TUTORIAL_BUBBLE_GAP;
            }

            if (placement === 'top') {
                left = rect.left + (rect.width / 2) - (bubbleWidth / 2);
                top = rect.top - bubbleHeight - TUTORIAL_BUBBLE_GAP;
            }

            if (placement === 'bottom') {
                left = rect.left + (rect.width / 2) - (bubbleWidth / 2);
                top = rect.bottom + TUTORIAL_BUBBLE_GAP;
            }

            bubble.style.left = `${clamp(left, TUTORIAL_VIEWPORT_MARGIN, window.innerWidth - bubbleWidth - TUTORIAL_VIEWPORT_MARGIN)}px`;
            bubble.style.top = `${clamp(top, TUTORIAL_VIEWPORT_MARGIN, window.innerHeight - bubbleHeight - TUTORIAL_VIEWPORT_MARGIN)}px`;
        }


        function triggerTutorialClick(step, target, index) {
            elements.tutorialCursor.classList.add('is-clicking');

            scheduleTutorialTimer(() => {
                elements.tutorialCursor.classList.remove('is-clicking');
            }, 280);

            if (typeof step.action === 'function') {
                step.action(target);
            }

            if (typeof step.postActionTarget === 'function') {
                scheduleTutorialTimer(() => {
                    const nextTarget = step.postActionTarget();
                    if (!nextTarget) {
                        return;
                    }

                    revealTutorialTarget(nextTarget);
                    scheduleTutorialTimer(() => {
                        positionTutorialStep(step, nextTarget, index, {
                            showExample: true
                        });
                        runTutorialStepDemo(step, index);
                    }, 260);
                }, 120);
            }
        }


        function renderTutorialExample(step) {
            const panel = elements.tutorialExamplePanel;
            const body = elements.tutorialExampleBody;
            const example = step?.example;

            if (!panel || !body) {
                return;
            }

            if (!example) {
                body.innerHTML = '';
                panel.classList.add('hide');
                panel.classList.remove('has-multiple-sheets');
                panel.setAttribute('aria-hidden', 'true');
                return;
            }

            panel.classList.toggle('has-multiple-sheets', (example.sheets || []).length > 1);
            body.innerHTML = buildTutorialExampleMarkup(example);
            panel.classList.remove('hide');
            panel.setAttribute('aria-hidden', 'false');
        }


        function buildTutorialExampleMarkup(example) {
            const sheetsMarkup = (example.sheets || []).map((sheet) => {
                const excelHeaders = [''].concat((sheet.headers || []).map((_, index) => getTutorialExampleColumnLabel(index)));
                const excelHeaderCells = excelHeaders.map((header) => {
                    const className = header ? 'tutorial-example-col-header' : 'tutorial-example-corner';
                    return `<th class="${className}">${escapeTutorialExampleValue(header)}</th>`;
                }).join('');
                const rows = (sheet.rows || []).map((row, rowIndex) => {
                    const isMatchRow = (sheet.matchRows || []).includes(rowIndex);
                    const cells = row.map((cell, columnIndex) => {
                        const isMatchCell = (sheet.matchCells || []).some((pair) => pair[0] === rowIndex && pair[1] === columnIndex);
                        const classNames = [
                            'tutorial-example-grid-cell',
                            isMatchRow ? 'tutorial-example-match-row' : '',
                            isMatchCell ? 'tutorial-example-match-cell' : ''
                        ].filter(Boolean).join(' ');
                        return `<td class="${classNames}">${escapeTutorialExampleValue(cell)}</td>`;
                    }).join('');

                    return `
                        <tr>
                            <th class="tutorial-example-row-header">${rowIndex + 2}</th>
                            ${cells}
                        </tr>
                    `;
                }).join('');
                const fieldHeaders = (sheet.headers || []).map((header) => `<td class="tutorial-example-field-header">${escapeTutorialExampleValue(header)}</td>`).join('');

                return `
                    <section class="tutorial-example-sheet">
                        <div class="tutorial-example-sheet-header">
                            <div class="tutorial-example-sheet-title">${escapeTutorialExampleValue(sheet.title)}</div>
                            <div class="tutorial-example-sheet-match">${escapeTutorialExampleValue(sheet.matchLabel)}</div>
                        </div>
                        <div class="tutorial-example-sheet-toolbar">
                            <div class="tutorial-example-toolbar-dots">
                                <span></span><span></span><span></span>
                            </div>
                            <div class="tutorial-example-formula-bar">${escapeTutorialExampleValue(example.query || '')}</div>
                        </div>
                        <table class="tutorial-example-grid">
                            <thead>
                                <tr>${excelHeaderCells}</tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <th class="tutorial-example-row-header">1</th>
                                    ${fieldHeaders}
                                </tr>
                                ${rows}
                            </tbody>
                        </table>
                    </section>
                `;
            }).join('');

            return `
                <div class="tutorial-example-head">
                    <div class="tutorial-example-kicker">Dummy CSV Example</div>
                    <div class="tutorial-example-source">${escapeTutorialExampleValue(example.sourceLabel || '')}</div>
                </div>
                <p class="tutorial-example-note">${escapeTutorialExampleValue(example.note || '')}</p>
                <div class="tutorial-example-query">
                    <span>Demo query</span>
                    <strong>${escapeTutorialExampleValue(example.query || '')}</strong>
                </div>
                <div class="tutorial-example-sheets${(example.sheets || []).length > 1 ? ' is-split' : ''}">${sheetsMarkup}</div>
                <div class="tutorial-example-footer">${escapeTutorialExampleValue(example.footer || '')}</div>
            `;
        }


        function getTutorialExampleColumnLabel(index) {
            let value = index + 1;
            let label = '';
            while (value > 0) {
                const remainder = (value - 1) % 26;
                label = String.fromCharCode(65 + remainder) + label;
                value = Math.floor((value - 1) / 26);
            }
            return label;
        }


        function escapeTutorialExampleValue(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }


        function positionTutorialExamplePanel(targetRect) {
            const panel = elements.tutorialExamplePanel;
            if (!panel || panel.classList.contains('hide')) {
                return;
            }

            const bubbleRect = elements.tutorialBubble.getBoundingClientRect();
            const sidebarRect = getTutorialSidebarRect();
            const panelWidth = Math.min(panel.offsetWidth || 520, window.innerWidth - (TUTORIAL_VIEWPORT_MARGIN * 2));
            const panelHeight = panel.offsetHeight || 220;
            const candidates = [
                {
                    left: bubbleRect.right + TUTORIAL_EXAMPLE_GAP,
                    top: bubbleRect.top
                },
                {
                    left: bubbleRect.left - panelWidth - TUTORIAL_EXAMPLE_GAP,
                    top: bubbleRect.top
                },
                {
                    left: bubbleRect.left,
                    top: bubbleRect.bottom + TUTORIAL_EXAMPLE_GAP
                },
                {
                    left: bubbleRect.left,
                    top: bubbleRect.top - panelHeight - TUTORIAL_EXAMPLE_GAP
                },
                {
                    left: targetRect.right + TUTORIAL_EXAMPLE_GAP,
                    top: targetRect.top
                },
                {
                    left: targetRect.left - panelWidth - TUTORIAL_EXAMPLE_GAP,
                    top: targetRect.top
                }
            ];

            const avoidTargetRect = expandTutorialRect(targetRect, 12);
            const fittingCandidate = candidates.find((candidate) =>
                isTutorialPanelPositionValid(candidate.left, candidate.top, panelWidth, panelHeight, [bubbleRect, avoidTargetRect, sidebarRect])
            );
            if (fittingCandidate) {
                panel.style.left = `${fittingCandidate.left}px`;
                panel.style.top = `${fittingCandidate.top}px`;
                return;
            }

            const bestFallback = candidates
                .map((candidate) => clampTutorialPanelPosition(candidate.left, candidate.top, panelWidth, panelHeight))
                .sort((leftCandidate, rightCandidate) => {
                    const leftOverlap = getTutorialPanelOverlapScore(leftCandidate.left, leftCandidate.top, panelWidth, panelHeight, [bubbleRect, avoidTargetRect, sidebarRect]);
                    const rightOverlap = getTutorialPanelOverlapScore(rightCandidate.left, rightCandidate.top, panelWidth, panelHeight, [bubbleRect, avoidTargetRect, sidebarRect]);
                    if (leftOverlap !== rightOverlap) {
                        return leftOverlap - rightOverlap;
                    }

                    const leftDistance = getTutorialPanelDistance(leftCandidate.left, leftCandidate.top, panelWidth, panelHeight, bubbleRect);
                    const rightDistance = getTutorialPanelDistance(rightCandidate.left, rightCandidate.top, panelWidth, panelHeight, bubbleRect);
                    return rightDistance - leftDistance;
                })[0];

            panel.style.left = `${bestFallback.left}px`;
            panel.style.top = `${bestFallback.top}px`;
        }


        function isTutorialPanelPositionValid(left, top, width, height, avoidRects = []) {
            if (left < TUTORIAL_VIEWPORT_MARGIN || top < TUTORIAL_VIEWPORT_MARGIN) {
                return false;
            }

            if (left + width > window.innerWidth - TUTORIAL_VIEWPORT_MARGIN) {
                return false;
            }

            if (top + height > window.innerHeight - TUTORIAL_VIEWPORT_MARGIN) {
                return false;
            }

            const panelRect = {
                left,
                top,
                right: left + width,
                bottom: top + height
            };

            return avoidRects.filter(Boolean).every((avoidRect) => !doTutorialRectsOverlap(panelRect, avoidRect));
        }


        function resolveTutorialPanelOverlap(targetRect, step) {
            const panel = elements.tutorialExamplePanel;
            const bubble = elements.tutorialBubble;
            if (!panel || !bubble || panel.classList.contains('hide')) {
                return;
            }

            const bubbleRect = bubble.getBoundingClientRect();
            const panelRect = panel.getBoundingClientRect();
            if (!doTutorialRectsOverlap(bubbleRect, panelRect)) {
                return;
            }

            const avoidTargetRect = expandTutorialRect(targetRect, 12);
            const sidebarRect = getTutorialSidebarRect();
            const bubbleWidth = Math.min(bubble.offsetWidth || 380, window.innerWidth - (TUTORIAL_VIEWPORT_MARGIN * 2));
            const bubbleHeight = bubble.offsetHeight || 180;
            const candidates = [
                {
                    left: bubbleRect.left,
                    top: panelRect.bottom + TUTORIAL_BUBBLE_GAP
                },
                {
                    left: bubbleRect.left,
                    top: panelRect.top - bubbleHeight - TUTORIAL_BUBBLE_GAP
                },
                {
                    left: panelRect.left - bubbleWidth - TUTORIAL_BUBBLE_GAP,
                    top: bubbleRect.top
                },
                {
                    left: panelRect.right + TUTORIAL_BUBBLE_GAP,
                    top: bubbleRect.top
                },
                {
                    left: targetRect.right + TUTORIAL_BUBBLE_GAP,
                    top: targetRect.top
                },
                {
                    left: targetRect.left - bubbleWidth - TUTORIAL_BUBBLE_GAP,
                    top: targetRect.top
                }
            ];

            const nextBubblePosition = candidates.find((candidate) =>
                isTutorialPanelPositionValid(candidate.left, candidate.top, bubbleWidth, bubbleHeight, [panelRect, avoidTargetRect, sidebarRect])
            );
            if (nextBubblePosition) {
                bubble.style.left = `${nextBubblePosition.left}px`;
                bubble.style.top = `${nextBubblePosition.top}px`;
                return;
            }

            const bestFallback = candidates
                .map((candidate) => clampTutorialPanelPosition(candidate.left, candidate.top, bubbleWidth, bubbleHeight))
                .sort((leftCandidate, rightCandidate) => {
                    const leftOverlap = getTutorialPanelOverlapScore(leftCandidate.left, leftCandidate.top, bubbleWidth, bubbleHeight, [panelRect, avoidTargetRect, sidebarRect]);
                    const rightOverlap = getTutorialPanelOverlapScore(rightCandidate.left, rightCandidate.top, bubbleWidth, bubbleHeight, [panelRect, avoidTargetRect, sidebarRect]);
                    if (leftOverlap !== rightOverlap) {
                        return leftOverlap - rightOverlap;
                    }

                    const leftDistance = getTutorialPanelDistance(leftCandidate.left, leftCandidate.top, bubbleWidth, bubbleHeight, panelRect);
                    const rightDistance = getTutorialPanelDistance(rightCandidate.left, rightCandidate.top, bubbleWidth, bubbleHeight, panelRect);
                    return rightDistance - leftDistance;
                })[0];

            bubble.style.left = `${bestFallback.left}px`;
            bubble.style.top = `${bestFallback.top}px`;
        }


        function doTutorialRectsOverlap(leftRect, rightRect) {
            return !(
                leftRect.right <= rightRect.left ||
                leftRect.left >= rightRect.right ||
                leftRect.bottom <= rightRect.top ||
                leftRect.top >= rightRect.bottom
            );
        }


        function clampTutorialPanelPosition(left, top, width, height) {
            return {
                left: clamp(left, TUTORIAL_VIEWPORT_MARGIN, window.innerWidth - width - TUTORIAL_VIEWPORT_MARGIN),
                top: clamp(top, TUTORIAL_VIEWPORT_MARGIN, window.innerHeight - height - TUTORIAL_VIEWPORT_MARGIN)
            };
        }


        function getTutorialPanelOverlapArea(left, top, width, height, avoidRect) {
            const overlapWidth = Math.max(0, Math.min(left + width, avoidRect.right) - Math.max(left, avoidRect.left));
            const overlapHeight = Math.max(0, Math.min(top + height, avoidRect.bottom) - Math.max(top, avoidRect.top));
            return overlapWidth * overlapHeight;
        }


        function getTutorialPanelOverlapScore(left, top, width, height, avoidRects) {
            return avoidRects
                .filter(Boolean)
                .reduce((total, avoidRect) => total + getTutorialPanelOverlapArea(left, top, width, height, avoidRect), 0);
        }


        function getTutorialPanelDistance(left, top, width, height, avoidRect) {
            const panelCenterX = left + (width / 2);
            const panelCenterY = top + (height / 2);
            const bubbleCenterX = avoidRect.left + (avoidRect.width / 2);
            const bubbleCenterY = avoidRect.top + (avoidRect.height / 2);
            return Math.hypot(panelCenterX - bubbleCenterX, panelCenterY - bubbleCenterY);
        }


        function expandTutorialRect(rect, padding) {
            return {
                left: rect.left - padding,
                top: rect.top - padding,
                right: rect.right + padding,
                bottom: rect.bottom + padding,
                width: rect.width + (padding * 2),
                height: rect.height + (padding * 2)
            };
        }


        function getTutorialSidebarRect() {
            const sidebar = document.querySelector('.config-panel');
            if (!sidebar) {
                return null;
            }

            const rect = sidebar.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) {
                return null;
            }

            return rect;
        }


        function runTutorialStepDemo(step, index) {
            if (!tutorialRuntime.active || tutorialRuntime.currentStepIndex !== index) {
                return;
            }

            const demoInputs = Array.isArray(step.demoInputs) ? step.demoInputs : [];
            if (!demoInputs.length) {
                return;
            }

            let cumulativeDelay = 260;
            demoInputs.forEach((demo) => {
                const input = typeof demo.element === 'function' ? demo.element() : null;
                if (!input) {
                    return;
                }

                const startDelay = cumulativeDelay + (demo.delayMs || 0);
                scheduleTutorialTimer(() => {
                    animateTutorialInputTyping(input, demo.value || '');
                }, startDelay);

                cumulativeDelay = startDelay + Math.max((demo.value || '').length * 50, 480);
            });

            if (typeof step.demoButton === 'function') {
                scheduleTutorialTimer(() => {
                    pulseTutorialButton(step.demoButton());
                }, cumulativeDelay + 180);
            }
        }


        function animateTutorialInputTyping(input, value) {
            if (!input || !tutorialRuntime.active) {
                return;
            }

            const inputRect = input.getBoundingClientRect();
            moveTutorialCursorTo(inputRect, 0.42, 0.5);
            elements.tutorialCursor.classList.add('is-clicking');
            scheduleTutorialTimer(() => {
                elements.tutorialCursor.classList.remove('is-clicking');
            }, 220);

            input.focus({ preventScroll: true });
            input.value = '';
            let currentValue = '';

            Array.from(value).forEach((character, characterIndex) => {
                scheduleTutorialTimer(() => {
                    currentValue += character;
                    input.value = currentValue;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }, 180 + (characterIndex * 80));
            });
        }


        function pulseTutorialButton(button) {
            if (!button || !tutorialRuntime.active) {
                return;
            }

            const buttonRect = button.getBoundingClientRect();
            moveTutorialCursorTo(buttonRect, 0.5, 0.5);
            elements.tutorialCursor.classList.add('is-clicking');
            scheduleTutorialTimer(() => {
                elements.tutorialCursor.classList.remove('is-clicking');
            }, 260);
        }


        function moveTutorialCursorTo(rect, anchorX = 0.55, anchorY = 0.55) {
            if (!rect) {
                return;
            }

            const cursorLeft = clamp(rect.left + (rect.width * anchorX) - TUTORIAL_CURSOR_OFFSET, TUTORIAL_VIEWPORT_MARGIN, window.innerWidth - 48);
            const cursorTop = clamp(rect.top + (rect.height * anchorY) - TUTORIAL_CURSOR_OFFSET, TUTORIAL_VIEWPORT_MARGIN, window.innerHeight - 48);
            elements.tutorialCursor.style.left = `${cursorLeft}px`;
            elements.tutorialCursor.style.top = `${cursorTop}px`;
        }


        function resetTutorialDemoInputs() {
            [
                elements.searchInput,
                elements.accEmployeeSearchInput,
                elements.accAssetSearchInput,
                elements.tdaAssetSearchInput,
                elements.tdaEmployeeSearchInput
            ].forEach((input) => {
                if (input) {
                    input.value = '';
                }
            });
        }


        function endTutorial(options = {}) {
            const dismissGlow = options.dismissGlow !== false;

            clearTutorialTimers();
            closeTutorialDropdown();
            closeComboboxOptions();

            elements.tutorialCursor.classList.remove('is-clicking');
            elements.tutorialOverlay.classList.remove('is-visible');
            elements.tutorialOverlay.classList.add('hide');
            elements.tutorialOverlay.setAttribute('aria-hidden', 'true');
            elements.tutorialOverlay.setAttribute('inert', '');
            elements.tutorialSkipBtn.classList.add('hide');
            elements.tutorialExamplePanel?.classList.add('hide');
            elements.tutorialExamplePanel?.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('tutorial-active');

            const snapshot = tutorialRuntime.snapshot;
            const previousFocus = tutorialRuntime.previousFocus;
            tutorialRuntime.active = false;
            tutorialRuntime.currentStepIndex = -1;
            tutorialRuntime.snapshot = null;
            tutorialRuntime.previousFocus = null;
            cancelTutorialSpeech();

            if (dismissGlow) {
                setTutorialGlowDismissed(true);
            }

            if (snapshot) {
                restoreTutorialState(snapshot);
            }

            if (previousFocus && typeof previousFocus.focus === 'function') {
                window.requestAnimationFrame(() => previousFocus.focus());
            }
        }


        function captureTutorialState() {
            return {
                currentFormType,
                currentAccountabilityPrintMode,
                currentReturnPrintMode,
                configScrollTop: document.querySelector('.config-panel') ? document.querySelector('.config-panel').scrollTop : 0,
                mainScrollTop: document.querySelector('.main-content') ? document.querySelector('.main-content').scrollTop : 0,
                windowScrollX: window.scrollX,
                windowScrollY: window.scrollY,
                accountabilityAssets: typeof serializeAccountabilityAssetRows === 'function' ? serializeAccountabilityAssetRows() : [],
                returnRows: typeof serializeReturnSanitizationTableRows === 'function' ? serializeReturnSanitizationTableRows(document.getElementById('returnForm')) : [],
                sanitizationRows: typeof serializeReturnSanitizationTableRows === 'function' ? serializeReturnSanitizationTableRows(document.getElementById('sanitizationForm')) : [],
                fields: captureTutorialFields()
            };
        }


        function captureTutorialFields() {
            const seen = new Map();

            document.querySelectorAll('input[id], textarea[id], select[id]').forEach((element) => {
                seen.set(element.id, {
                    id: element.id,
                    kind: 'value',
                    value: element.type === 'checkbox' ? String(element.checked) : element.value
                });
            });

            document.querySelectorAll('[id^="f_"]').forEach((element) => {
                if (seen.has(element.id)) {
                    return;
                }
                if (element.id.endsWith('_options') || element.id.endsWith('Combobox')) {
                    return;
                }
                if (element.querySelector('input, textarea, select')) {
                    return;
                }

                seen.set(element.id, {
                    id: element.id,
                    kind: 'text',
                    value: element.textContent
                });
            });

            TUTORIAL_EXTRA_FIELD_IDS.forEach((id) => {
                const element = document.getElementById(id);
                if (!element || seen.has(id)) {
                    return;
                }

                seen.set(id, {
                    id,
                    kind: element.matches('input, textarea, select') ? 'value' : 'text',
                    value: element.matches('input, textarea, select') ? element.value : element.textContent
                });
            });

            return Array.from(seen.values());
        }


        function restoreTutorialState(snapshot) {
            activateTutorialForm(snapshot.currentFormType);
            setAccountabilityPrintMode(snapshot.currentAccountabilityPrintMode);
            setReturnPrintMode(snapshot.currentReturnPrintMode, false);

            if (typeof renderAccountabilityAssetRows === 'function') {
                renderAccountabilityAssetRows(snapshot.accountabilityAssets || []);
            }
            if (typeof renderReturnSanAssetRows === 'function') {
                renderReturnSanAssetRows('return', snapshot.returnRows || []);
                renderReturnSanAssetRows('sanitization', snapshot.sanitizationRows || []);
            }

            snapshot.fields.forEach((field) => {
                const element = document.getElementById(field.id);
                if (!element) {
                    return;
                }

                if (field.kind === 'value' && element.matches('input, textarea, select')) {
                    if (element.type === 'checkbox') {
                        element.checked = field.value === 'true';
                    } else {
                        element.value = field.value;
                    }
                    return;
                }

                element.textContent = field.value;
            });

            bindComboboxes();
            bindDateInputs();
            bindTextareaAutoResize();
            syncPrintModeVisibility();
            updatePrintDocumentTitle();
            if (typeof markPrintPreparationDirty === 'function') {
                markPrintPreparationDirty();
            }
            syncSourceStatusPanel();

            const configPanel = document.querySelector('.config-panel');
            const mainContent = document.querySelector('.main-content');
            if (configPanel) {
                configPanel.scrollTop = snapshot.configScrollTop;
            }
            if (mainContent) {
                mainContent.scrollTop = snapshot.mainScrollTop;
            }

            window.scrollTo({
                left: snapshot.windowScrollX,
                top: snapshot.windowScrollY,
                behavior: 'auto'
            });
        }


        function activateTutorialForm(formType) {
            closeTutorialDropdown();

            if (formType === 'accountability' || formType === 'test_device_accountability') {
                const button = document.querySelector(`.form-btn[data-form="${formType}"]`);
                button?.click();
                return;
            }

            if (formType === 'sanitization_laptop' || formType === 'sanitization_test') {
                openTutorialDropdown();
                const button = document.querySelector(`.sub-btn[data-form="${formType}"]`);
                button?.click();
                closeTutorialDropdown();
            }
        }


        function openTutorialDropdown() {
            const wrapper = document.getElementById('sanitizationDropdownBtn')
                ? document.getElementById('sanitizationDropdownBtn').closest('.dropdown-wrapper')
                : null;
            wrapper?.classList.add('tutorial-open');
        }


        function closeTutorialDropdown() {
            document.querySelectorAll('.dropdown-wrapper.tutorial-open').forEach((wrapper) => {
                wrapper.classList.remove('tutorial-open');
            });
        }


        function closeTutorialComboboxes() {
            closeComboboxOptions();
        }


        function closeComboboxOptions() {
            document.querySelectorAll('.combobox-options.open').forEach((options) => {
                options.classList.remove('open');
            });
        }


        function scheduleTutorialTimer(callback, delayMs) {
            const timerId = window.setTimeout(callback, delayMs);
            tutorialRuntime.timers.push(timerId);
            return timerId;
        }


        function clearTutorialTimers() {
            tutorialRuntime.timers.forEach((timerId) => {
                window.clearTimeout(timerId);
            });
            tutorialRuntime.timers = [];
        }


        function clamp(value, min, max) {
            return Math.min(Math.max(value, min), max);
        }


        function handleTutorialGlowResetClick() {
            const now = Date.now();
            tutorialRuntime.glowResetClicks = tutorialRuntime.glowResetClicks.filter((timestamp) =>
                now - timestamp <= TUTORIAL_GLOW_RESET_WINDOW_MS
            );
            tutorialRuntime.glowResetClicks.push(now);

            if (tutorialRuntime.glowResetClicks.length >= 3) {
                tutorialRuntime.glowResetClicks = [];
                setTutorialGlowDismissed(false);
            }
        }


        function isTutorialGlowDismissed() {
            try {
                return localStorage.getItem(TUTORIAL_GLOW_STORAGE_KEY) === '1';
            } catch (error) {
                return false;
            }
        }


        function setTutorialGlowDismissed(value) {
            try {
                localStorage.setItem(TUTORIAL_GLOW_STORAGE_KEY, value ? '1' : '0');
            } catch (error) {
                // Ignore storage issues; the glow still updates for the current session.
            }

            applyTutorialGlowState();
        }


        function applyTutorialGlowState() {
            elements.tutorialBtn?.classList.toggle('is-glowing', !isTutorialGlowDismissed());
        }


        function bindTutorialVoice() {
            tutorialRuntime.speech.enabled = !isTutorialVoiceMuted();
            loadTutorialVoices();
            syncTutorialVoiceControls();

            elements.tutorialVoiceToggleBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                tutorialRuntime.speech.enabled = !tutorialRuntime.speech.enabled;
                setTutorialVoiceMuted(!tutorialRuntime.speech.enabled);
                syncTutorialVoiceControls();

                if (!tutorialRuntime.speech.enabled) {
                    cancelTutorialSpeech();
                    return;
                }

                replayTutorialSpeech();
            });

            elements.tutorialReplayBtn?.addEventListener('click', (event) => {
                event.stopPropagation();
                replayTutorialSpeech();
            });
        }


        function loadTutorialVoices() {
            if (!tutorialRuntime.speech.supported) {
                syncTutorialVoiceControls();
                return;
            }

            const updateVoices = () => {
                const voices = window.speechSynthesis.getVoices();
                tutorialRuntime.speech.selectedVoice = chooseTutorialVoice(voices);
                tutorialRuntime.speech.voicesLoaded = voices.length > 0;
                syncTutorialVoiceControls();
            };

            updateVoices();
            if (!tutorialRuntime.speech.voicesLoaded) {
                window.speechSynthesis.addEventListener('voiceschanged', updateVoices, { once: true });
            }
        }


        function chooseTutorialVoice(voices) {
            if (!Array.isArray(voices) || !voices.length) {
                return null;
            }

            return voices
                .slice()
                .sort((left, right) => scoreTutorialVoice(right) - scoreTutorialVoice(left))[0] || null;
        }


        function scoreTutorialVoice(voice) {
            const name = `${voice.name || ''} ${voice.voiceURI || ''}`.toLowerCase();
            const lang = (voice.lang || '').toLowerCase();
            let score = 0;

            if (lang.startsWith('en-ph')) {
                score += 45;
            } else if (lang.startsWith('en-gb')) {
                score += 42;
            } else if (lang.startsWith('en-us')) {
                score += 40;
            } else if (lang.startsWith('en')) {
                score += 30;
            }

            if (name.includes('natural') || name.includes('neural')) {
                score += 120;
            }

            if (name.includes('premium') || name.includes('enhanced')) {
                score += 90;
            }

            if (name.includes('online')) {
                score += 45;
            }

            if (voice.default) {
                score += 12;
            }

            if (voice.localService) {
                score += 8;
            }

            if (name.includes('google')) {
                score += 8;
            }

            if (name.includes('microsoft')) {
                score += 10;
            }

            return score;
        }


        function speakTutorialStep(step) {
            if (!tutorialRuntime.speech.supported || !tutorialRuntime.speech.enabled || !step) {
                return;
            }

            const spokenText = buildTutorialSpeechText(step);
            if (!spokenText) {
                return;
            }

            cancelTutorialSpeech();

            const utterance = new window.SpeechSynthesisUtterance(spokenText);
            utterance.rate = TUTORIAL_VOICE_RATE;
            utterance.pitch = TUTORIAL_VOICE_PITCH;
            utterance.volume = 1;
            utterance.lang = tutorialRuntime.speech.selectedVoice?.lang || 'en-US';
            if (tutorialRuntime.speech.selectedVoice) {
                utterance.voice = tutorialRuntime.speech.selectedVoice;
            }

            window.speechSynthesis.speak(utterance);
        }


        function buildTutorialSpeechText(step) {
            if (step?.narration) {
                return step.narration.replace(/\s+/g, ' ').trim();
            }

            const parser = document.createElement('div');
            parser.innerHTML = `${step.title}. ${step.body}`;
            return parser.textContent.replace(/\s+/g, ' ').trim();
        }


        function replayTutorialSpeech() {
            if (!tutorialRuntime.active) {
                return;
            }

            const step = tutorialSteps[tutorialRuntime.currentStepIndex];
            if (!step) {
                return;
            }

            speakTutorialStep(step);
        }


        function cancelTutorialSpeech() {
            if (!tutorialRuntime.speech.supported) {
                return;
            }

            window.speechSynthesis.cancel();
        }


        function isTutorialVoiceMuted() {
            try {
                return localStorage.getItem(TUTORIAL_VOICE_MUTE_STORAGE_KEY) === '1';
            } catch (error) {
                return false;
            }
        }


        function setTutorialVoiceMuted(value) {
            try {
                localStorage.setItem(TUTORIAL_VOICE_MUTE_STORAGE_KEY, value ? '1' : '0');
            } catch (error) {
                // Ignore storage issues; audio controls still work for the current session.
            }
        }


        function syncTutorialVoiceControls() {
            const unsupported = !tutorialRuntime.speech.supported;
            const muted = !tutorialRuntime.speech.enabled;

            if (elements.tutorialReplayBtn) {
                elements.tutorialReplayBtn.disabled = unsupported;
            }

            if (elements.tutorialVoiceToggleBtn) {
                elements.tutorialVoiceToggleBtn.disabled = unsupported;
                elements.tutorialVoiceToggleBtn.classList.toggle('is-muted', muted);
                elements.tutorialVoiceToggleBtn.setAttribute('aria-label', muted ? 'Unmute tutorial voice' : 'Mute tutorial voice');
                elements.tutorialVoiceToggleBtn.innerHTML = muted
                    ? '<i class="fa-solid fa-volume-xmark"></i>'
                    : '<i class="fa-solid fa-volume-high"></i>';
            }
        }

        Object.assign(scope, {
            bindTutorial,
            startTutorial,
            endTutorial
        });
        Object.assign(App, {
            bindTutorial,
            startTutorial,
            endTutorial
        });
    }
})();
