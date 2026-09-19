(function () {
    const STORAGE_KEY = 'yonduThemePreferences';
    const GRADIENT_MODES = new Set(['blend', 'solid']);
    const DEFAULT_THEME = {
        primaryColor: '#172d67',
        secondaryColor: '#00a8e0',
        gradientMode: 'blend',
        formToneEnabled: false,
        formToneLevel: 0,
        formDarkMode: false
    };

    const PERSIST_DELAY_MS = 120;
    let currentTheme = normalizeTheme(readTheme());
    let settingsControls = null;
    let themeRenderFrame = 0;
    let persistTimer = 0;
    let persistPending = false;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
    } else {
        initTheme();
    }

    function initTheme() {
        if (!document.body) {
            return;
        }

        applyTheme(currentTheme);
        bindSettingsControls();
        syncPageVisibility();

        document.addEventListener('visibilitychange', syncPageVisibility);
        window.addEventListener('pagehide', flushThemePersistence);

        window.addEventListener('storage', (event) => {
            if (event.key !== STORAGE_KEY || !event.newValue) {
                return;
            }

            try {
                cancelThemePersistence();
                currentTheme = normalizeTheme(JSON.parse(event.newValue));
                applyTheme(currentTheme);
                syncSettingsControls();
            } catch (error) {
                console.warn('Failed to sync theme from storage event:', error);
            }
        });
    }

    function bindSettingsControls() {
        const settingsRoot = document.querySelector('[data-theme-settings]');
        if (!settingsRoot) {
            return;
        }

        settingsControls = collectSettingsControls();
        const {
            primaryInput,
            secondaryInput,
            gradientOnBtn,
            gradientOffBtn,
            formToneOnBtn,
            formDarkModeBtn,
            formToneLevel,
            resetBtn
        } = settingsControls;

        primaryInput?.addEventListener('input', (event) => {
            updateTheme({ primaryColor: event.target.value });
        });

        secondaryInput?.addEventListener('input', (event) => {
            updateTheme({ secondaryColor: event.target.value });
        });

        gradientOnBtn?.addEventListener('click', () => {
            updateTheme({ gradientMode: 'blend' });
        });

        gradientOffBtn?.addEventListener('click', () => {
            updateTheme({ gradientMode: 'solid' });
        });

        formToneOnBtn?.addEventListener('click', () => {
            updateTheme({ formToneEnabled: true });
        });

        formDarkModeBtn?.addEventListener('click', () => {
            updateTheme({ formDarkMode: !currentTheme.formDarkMode });
        });

        formToneLevel?.addEventListener('input', (event) => {
            updateTheme({
                formToneEnabled: true,
                formToneLevel: Number.parseInt(event.target.value, 10)
            });
        });

        resetBtn?.addEventListener('click', () => {
            updateTheme(DEFAULT_THEME);
        });

        syncSettingsControls();
    }

    function updateTheme(nextValues) {
        currentTheme = normalizeTheme({
            ...currentTheme,
            ...nextValues
        });

        scheduleThemePersistence();
        scheduleThemeRender();
    }

    function syncSettingsControls() {
        if (!settingsControls) {
            return;
        }

        const {
            primaryInput,
            secondaryInput,
            primaryValue,
            secondaryValue,
            gradientOnBtn,
            gradientOffBtn,
            formToneOnBtn,
            formDarkModeBtn,
            formToneLevel,
            formToneLevelValue,
            formToneHelperText,
            previewMode
        } = settingsControls;

        if (primaryInput) {
            primaryInput.value = currentTheme.primaryColor;
        }
        if (secondaryInput) {
            secondaryInput.value = currentTheme.secondaryColor;
        }
        if (primaryValue) {
            primaryValue.textContent = currentTheme.primaryColor.toUpperCase();
        }
        if (secondaryValue) {
            secondaryValue.textContent = currentTheme.secondaryColor.toUpperCase();
        }
        if (gradientOnBtn) {
            gradientOnBtn.classList.toggle('active', currentTheme.gradientMode === 'blend');
        }
        if (gradientOffBtn) {
            gradientOffBtn.classList.toggle('active', currentTheme.gradientMode === 'solid');
        }
        if (formToneOnBtn) {
            formToneOnBtn.classList.toggle('active', currentTheme.formToneEnabled);
        }
        if (formDarkModeBtn) {
            formDarkModeBtn.classList.toggle('active', currentTheme.formDarkMode);
            formDarkModeBtn.textContent = currentTheme.formDarkMode ? 'Dark Mode On' : 'Dark Mode Off';
        }
        if (formToneLevel) {
            formToneLevel.value = String(currentTheme.formToneLevel);
            formToneLevel.disabled = !currentTheme.formToneEnabled || currentTheme.formDarkMode;
        }
        if (formToneLevelValue) {
            formToneLevelValue.textContent = `${currentTheme.formToneLevel}%`;
        }
        if (formToneHelperText) {
            if (currentTheme.formDarkMode) {
                formToneHelperText.textContent = 'Turn Dark Mode off to adjust the blue light filter.';
                formToneHelperText.classList.remove('hide');
            } else if (!currentTheme.formToneEnabled) {
                formToneHelperText.textContent = 'Turn on Comfort to adjust the blue light filter.';
                formToneHelperText.classList.remove('hide');
            } else {
                formToneHelperText.textContent = '';
                formToneHelperText.classList.add('hide');
            }
        }
        if (previewMode) {
            const gradientLabel = currentTheme.gradientMode === 'blend' ? 'Blend' : 'Solid';
            const filterLabel = currentTheme.formToneEnabled ? ` / Filter ${currentTheme.formToneLevel}%` : ' / Filter Off';
            const darkLabel = currentTheme.formDarkMode ? ' / Dark On' : ' / Dark Off';
            previewMode.textContent = `${gradientLabel}${filterLabel}${darkLabel}`;
        }
    }

    function collectSettingsControls() {
        return {
            primaryInput: document.getElementById('themePrimaryColor'),
            secondaryInput: document.getElementById('themeSecondaryColor'),
            primaryValue: document.getElementById('themePrimaryValue'),
            secondaryValue: document.getElementById('themeSecondaryValue'),
            gradientOnBtn: document.getElementById('themeGradientOnBtn'),
            gradientOffBtn: document.getElementById('themeGradientOffBtn'),
            formToneOnBtn: document.getElementById('formToneOnBtn'),
            formDarkModeBtn: document.getElementById('formDarkModeBtn'),
            formToneLevel: document.getElementById('formToneLevel'),
            formToneLevelValue: document.getElementById('formToneLevelValue'),
            formToneHelperText: document.getElementById('formToneHelperText'),
            previewMode: document.getElementById('themePreviewMode'),
            resetBtn: document.getElementById('themeResetBtn')
        };
    }

    function scheduleThemeRender() {
        if (themeRenderFrame) {
            return;
        }

        themeRenderFrame = window.requestAnimationFrame(() => {
            themeRenderFrame = 0;
            applyTheme(currentTheme);
            syncSettingsControls();
        });
    }

    function scheduleThemePersistence() {
        persistPending = true;
        if (persistTimer) {
            window.clearTimeout(persistTimer);
        }
        persistTimer = window.setTimeout(flushThemePersistence, PERSIST_DELAY_MS);
    }

    function flushThemePersistence() {
        if (persistTimer) {
            window.clearTimeout(persistTimer);
            persistTimer = 0;
        }
        if (!persistPending) {
            return;
        }

        persistPending = false;
        persistTheme(currentTheme);
    }

    function cancelThemePersistence() {
        if (persistTimer) {
            window.clearTimeout(persistTimer);
            persistTimer = 0;
        }
        persistPending = false;
    }

    function syncPageVisibility() {
        document.body?.classList.toggle('ncs-page-hidden', document.hidden);
    }

    function applyTheme(theme) {
        const root = document.documentElement;
        const body = document.body;
        const accentMix = mixHex(theme.primaryColor, theme.secondaryColor, 0.5);
        const accentForeground = pickBestContrastColor([theme.primaryColor, theme.secondaryColor, accentMix]);
        const glowMix = lighten(accentMix, 0.12);
        const bgBase = darken(mixHex(theme.primaryColor, '#0b1220', 0.84), 0.1);
        const bgMid = darken(mixHex(accentMix, '#121a2d', 0.74), 0.08);
        const bgDeep = darken(mixHex(theme.secondaryColor, '#040812', 0.88), 0.06);
        const panelBase = mixHex(theme.primaryColor, '#0f172a', 0.82);
        const cardBase = mixHex(accentMix, '#111827', 0.76);
        const formTone = theme.formToneEnabled ? theme.formToneLevel / 100 : 0;
        const filterOverlay = theme.formDarkMode ? rgba('#ffd89a', 0) : rgba('#ffd89a', Math.min(0.34, formTone * 0.34));
        const filterBorder = theme.formDarkMode
            ? rgba('#ffffff', 0.12)
            : rgba(mixHex('#ffffff', '#d7c39a', formTone * 0.45), 0.14);
        const formScreenFilter = theme.formDarkMode
            ? 'invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.95)'
            : 'none';

        const cssVars = {
            '--bg-color': bgBase,
            '--card-bg': rgba(cardBase, 0.72),
            '--border-color': rgba(lighten(glowMix, 0.12), 0.18),
            '--text-primary': '#f8fafc',
            '--text-secondary': lighten(glowMix, 0.28),
            '--accent-blue': theme.primaryColor,
            '--accent-blue-hover': darken(theme.primaryColor, 0.14),
            '--accent-purple': theme.secondaryColor,
            '--theme-accent-foreground': accentForeground,
            '--form-preview-overlay': filterOverlay,
            '--form-preview-border': filterBorder,
            '--form-preview-filter': formScreenFilter,
            '--theme-base-gradient': [
                `linear-gradient(145deg, ${bgBase} 0%, ${bgMid} 54%, ${bgDeep} 100%)`
            ].join(',')
        };

        Object.entries(cssVars).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });

        body.setAttribute('data-theme-gradient', theme.gradientMode);
        body.setAttribute('data-form-dark', theme.formDarkMode ? 'on' : 'off');
        body.style.setProperty('--theme-panel-tint', rgba(panelBase, 0.88));
    }

    function persistTheme(theme) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
        } catch (error) {
            console.warn('Failed to persist theme settings:', error);
        }
    }

    function readTheme() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || DEFAULT_THEME;
        } catch (error) {
            console.warn('Failed to read stored theme settings:', error);
            return DEFAULT_THEME;
        }
    }

    function normalizeTheme(theme) {
        return {
            primaryColor: sanitizeHex(theme?.primaryColor, DEFAULT_THEME.primaryColor),
            secondaryColor: sanitizeHex(theme?.secondaryColor, DEFAULT_THEME.secondaryColor),
            gradientMode: GRADIENT_MODES.has(theme?.gradientMode) ? theme.gradientMode : DEFAULT_THEME.gradientMode,
            formToneEnabled: Boolean(theme?.formToneEnabled),
            formToneLevel: sanitizeRange(theme?.formToneLevel, DEFAULT_THEME.formToneLevel, 0, 100),
            formDarkMode: Boolean(theme?.formDarkMode)
        };
    }

    function sanitizeHex(value, fallback) {
        if (typeof value !== 'string') {
            return fallback;
        }

        const match = value.trim().match(/^#?([0-9a-fA-F]{6})$/);
        return match ? `#${match[1].toLowerCase()}` : fallback;
    }

    function sanitizeRange(value, fallback, min, max) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return fallback;
        }

        return Math.min(max, Math.max(min, Math.round(numeric)));
    }

    function rgba(hex, alpha) {
        const { r, g, b } = hexToRgb(hex);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function lighten(hex, amount) {
        return mixHex(hex, '#ffffff', amount);
    }

    function darken(hex, amount) {
        return mixHex(hex, '#000000', amount);
    }

    function mixHex(firstHex, secondHex, amount) {
        const first = hexToRgb(firstHex);
        const second = hexToRgb(secondHex);

        return rgbToHex({
            r: Math.round(first.r + (second.r - first.r) * amount),
            g: Math.round(first.g + (second.g - first.g) * amount),
            b: Math.round(first.b + (second.b - first.b) * amount)
        });
    }

    function hexToRgb(hex) {
        const normalized = sanitizeHex(hex, '#000000').slice(1);

        return {
            r: Number.parseInt(normalized.slice(0, 2), 16),
            g: Number.parseInt(normalized.slice(2, 4), 16),
            b: Number.parseInt(normalized.slice(4, 6), 16)
        };
    }

    function rgbToHex({ r, g, b }) {
        const toChannel = (value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
        return `#${toChannel(r)}${toChannel(g)}${toChannel(b)}`;
    }

    function pickBestContrastColor(colors) {
        const light = '#ffffff';
        const dark = '#0b1220';
        const lightScore = Math.min(...colors.map((color) => contrastRatio(color, light)));
        const darkScore = Math.min(...colors.map((color) => contrastRatio(color, dark)));

        return darkScore >= lightScore ? dark : light;
    }

    function contrastRatio(backgroundHex, foregroundHex) {
        const background = relativeLuminance(hexToRgb(backgroundHex));
        const foreground = relativeLuminance(hexToRgb(foregroundHex));
        const lighter = Math.max(background, foreground);
        const darker = Math.min(background, foreground);

        return (lighter + 0.05) / (darker + 0.05);
    }

    function relativeLuminance({ r, g, b }) {
        const normalize = (channel) => {
            const value = channel / 255;
            return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        };

        return (0.2126 * normalize(r)) + (0.7152 * normalize(g)) + (0.0722 * normalize(b));
    }
})();
