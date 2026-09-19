const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { randomUUID } = require('crypto');

function createClassList() {
    const tokens = new Set();
    return {
        add(...values) {
            values.forEach((value) => tokens.add(value));
        },
        remove(...values) {
            values.forEach((value) => tokens.delete(value));
        },
        toggle(value, force) {
            if (force === true) {
                tokens.add(value);
                return true;
            }
            if (force === false) {
                tokens.delete(value);
                return false;
            }
            if (tokens.has(value)) {
                tokens.delete(value);
                return false;
            }
            tokens.add(value);
            return true;
        },
        contains(value) {
            return tokens.has(value);
        }
    };
}

function createElement(id = '') {
    return {
        id,
        textContent: '',
        innerHTML: '',
        disabled: false,
        parentElement: null,
        parentNode: null,
        dataset: {},
        style: {
            setProperty() {}
        },
        children: [],
        classList: createClassList(),
        appendChild(child) {
            child.parentElement = this;
            child.parentNode = this;
            this.children.push(child);
            return child;
        },
        replaceChildren(...children) {
            this.children = [];
            children.forEach((child) => {
                this.appendChild(child);
            });
        },
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        },
        setAttribute(name, value) {
            this[name] = String(value);
        },
        getAttribute(name) {
            return Object.prototype.hasOwnProperty.call(this, name) ? this[name] : null;
        },
        addEventListener() {},
        dispatchEvent() {},
        closest(selector) {
            if (selector && this.className && selector === '.tda-asset-search-row' && String(this.className).split(/\s+/).includes('tda-asset-search-row')) {
                return this;
            }
            if (this.parentElement && typeof this.parentElement.closest === 'function') {
                return this.parentElement.closest(selector);
            }
            return null;
        },
        focus() {
            this.focused = true;
        },
        select() {},
        remove() {
            if (this.parentElement && Array.isArray(this.parentElement.children)) {
                const index = this.parentElement.children.indexOf(this);
                if (index !== -1) {
                    this.parentElement.children.splice(index, 1);
                }
            }
            this.parentElement = null;
            this.parentNode = null;
        }
    };
}

function loadScript(filePath, context) {
    const code = fs.readFileSync(filePath, 'utf8');
    vm.runInContext(code, context, { filename: filePath });
}

function createDocumentStub() {
    const elements = new Map();
    return {
        title: 'YONDU Form Auto-Filler',
        readyState: 'complete',
        body: createElement('body'),
        documentElement: {
            style: {
                setProperty() {}
            }
        },
        getElementById(id) {
            if (!elements.has(id)) {
                elements.set(id, createElement(id));
            }
            return elements.get(id);
        },
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        },
        createElement(tagName) {
            return createElement(tagName);
        },
        createDocumentFragment() {
            return createElement('fragment');
        },
        addEventListener() {}
    };
}

function createLocalStorage() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        }
    };
}

function loadApp(options = {}) {
    const { includeBootstrap = false } = options;
    const document = createDocumentStub();
    const localStorage = createLocalStorage();
    const context = vm.createContext({
        console,
        document,
        localStorage,
        indexedDB: null,
        Event: class Event {
            constructor(type, init = {}) {
                this.type = type;
                this.bubbles = Boolean(init.bubbles);
            }
        },
        setTimeout,
        clearTimeout,
        Date,
        Math,
        JSON,
        Promise,
        Map,
        Set,
        Number,
        String,
        Boolean,
        RegExp,
        Array,
        Object
    });

    context.window = context;
    context.globalThis = context;
    context.crypto = {
        randomUUID
    };
    context.requestAnimationFrame = (callback) => callback();
    context.addEventListener = () => {};
    context.removeEventListener = () => {};

    const root = path.resolve(__dirname, '..');
    [
        path.join(root, 'assets/vendor/papaparse/papaparse.min.js'),
        path.join(root, 'assets/js/config.js'),
        path.join(root, 'assets/js/helpers.js'),
        path.join(root, 'assets/js/signer-rosters.js'),
        path.join(root, 'assets/js/source-management.js'),
        path.join(root, 'assets/js/search.js'),
        path.join(root, 'assets/js/form-fill.js'),
        path.join(root, 'assets/js/print.js'),
        path.join(root, 'assets/js/sheet-copy.js')
    ].forEach((filePath) => loadScript(filePath, context));

    if (includeBootstrap) {
        context.window.YonduApp.scope.resetForm = () => {};
        context.window.YonduApp.resetForm = () => {};
        loadScript(path.join(root, 'assets/js/app.js'), context);
    }

    return {
        app: context.window.YonduApp,
        context,
        document
    };
}

module.exports = {
    loadApp
};
