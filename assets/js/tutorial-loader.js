(function () {
    const loaderScript = document.currentScript;
    const tutorialSrc = loaderScript?.dataset.tutorialSrc || 'assets/js/tutorial.js';
    const glowStorageKey = 'yonduTutorialGlowDismissed';
    const tutorialButton = document.getElementById('tutorialBtn');
    const glowResetButton = document.getElementById('tutorialGlowResetBtn');
    let loadPromise = null;
    let pendingGlowResetClicks = 0;

    syncTutorialGlow();
    tutorialButton?.addEventListener('click', handleTutorialClick);
    glowResetButton?.addEventListener('click', handleGlowResetClick);

    function syncTutorialGlow() {
        let dismissed = false;
        try {
            dismissed = localStorage.getItem(glowStorageKey) === '1';
        } catch (error) {
            // Storage can be unavailable; the in-session glow still works.
        }
        tutorialButton?.classList.toggle('is-glowing', !dismissed);
    }

    function loadTutorial() {
        if (window.YonduApp?.startTutorial) {
            window.YonduApp.bindTutorial?.();
            return Promise.resolve(window.YonduApp);
        }

        if (loadPromise) {
            return loadPromise;
        }

        loadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = tutorialSrc;
            script.async = true;
            script.addEventListener('load', () => {
                window.YonduApp?.bindTutorial?.();
                resolve(window.YonduApp);
            }, { once: true });
            script.addEventListener('error', () => {
                loadPromise = null;
                reject(new Error('Tutorial resources could not be loaded.'));
            }, { once: true });
            document.head.appendChild(script);
        });

        return loadPromise;
    }

    async function handleTutorialClick(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        tutorialButton?.setAttribute('aria-busy', 'true');

        try {
            const tutorial = await loadTutorial();
            removeLoaderListeners();
            await tutorial?.startTutorial?.();
        } catch (error) {
            console.error(error);
        } finally {
            tutorialButton?.removeAttribute('aria-busy');
        }
    }

    async function handleGlowResetClick(event) {
        event.stopImmediatePropagation();
        pendingGlowResetClicks += 1;

        try {
            await loadTutorial();
            const clicksToReplay = pendingGlowResetClicks;
            pendingGlowResetClicks = 0;
            removeLoaderListeners();
            for (let index = 0; index < clicksToReplay; index += 1) {
                glowResetButton?.click();
            }
        } catch (error) {
            pendingGlowResetClicks = 0;
            console.error(error);
        }
    }

    function removeLoaderListeners() {
        tutorialButton?.removeEventListener('click', handleTutorialClick);
        glowResetButton?.removeEventListener('click', handleGlowResetClick);
    }
})();
