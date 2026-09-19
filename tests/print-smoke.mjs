import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '..');
const appUrl = pathToFileURL(path.join(root, 'index.html')).href;
const outputDirectory = mkdtempSync(path.join(tmpdir(), 'ncs-print-smoke-'));
const browserPath = findBrowserPath();
const cases = [
    {
        name: 'accountability',
        selector: '[data-form="accountability"]',
        pages: 1,
        templates: ['template-accountability'],
        fields: {
            '#f_empName': 'DELA CRUZ, ALEXANDER SANTOS',
            '#f_position': 'Senior Business Systems Analyst',
            '#f_empId': 'NCS-012345',
            '#f_costCenter': 'IT-OPS',
            '#f_remarks': 'Laptop with bag and charger'
        }
    },
    {
        name: 'test-device',
        selector: '[data-form="test_device_accountability"]',
        pages: 1,
        templates: ['template-test-device-accountability'],
        fields: {
            '#f_tdaEmpName': 'DELA CRUZ, ALEXANDER SANTOS',
            '#f_tdaBusinessUnit': 'Technology Operations',
            '#f_tdaEmpId': 'NCS-012345',
            '#f_tdaEmploymentStatus': 'ACTIVE',
            '#f_tdaPosition': 'Senior Business Systems Analyst',
            '#f_tdaSupervisor': 'SANTOS, MARIA',
            '#f_tdaAssetTag': 'TD-001234',
            '#f_tdaModel': 'Apple iPhone 15 Pro Max 256 GB',
            '#f_tdaSerial': 'SN1234567890',
            '#f_tdaImei': '351234567890123'
        }
    },
    {
        name: 'laptop-return-sanitation',
        selector: '[data-form="sanitization_laptop"]',
        pages: 2,
        templates: ['template-return', 'template-sanitization'],
        fields: pairedWorkflowFields('Laptop')
    },
    {
        name: 'test-device-return-sanitation',
        selector: '[data-form="sanitization_test"]',
        pages: 2,
        templates: ['template-return', 'template-sanitization'],
        fields: pairedWorkflowFields('Test Device')
    }
];
const accountabilityMatrixScenarios = [
    {
        name: 'realistic',
        maximumAssetCount: 20,
        expectedSinglePageMaximum: 6,
        buildAsset: buildRealisticAccountabilityAsset
    },
    {
        name: 'high-wrap',
        maximumAssetCount: 10,
        expectedSinglePageMaximum: 3,
        buildAsset: buildHighWrapAccountabilityAsset
    }
];

const browser = await chromium.launch({ executablePath: browserPath, headless: true });
const results = [];

try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

    for (const printCase of cases) {
        await page.emulateMedia({ media: 'screen' });
        await page.goto(appUrl, { waitUntil: 'load' });
        await page.evaluate(async () => {
            await Promise.resolve(window.YonduApp?.scope?.initPromise);
        });
        await page.locator(printCase.selector).dispatchEvent('click');
        for (const [selector, value] of Object.entries(printCase.fields || {})) {
            await page.locator(selector).fill(value);
        }
        await page.evaluate(() => document.activeElement?.blur());
        await page.evaluate(() => new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        }));
        await page.emulateMedia({ media: 'print' });
        await page.evaluate(() => window.YonduApp.preparePrintOutput());

        const visibleTemplates = await page.evaluate(() => Array.from(
            document.querySelectorAll('.form-template[data-print-visible="true"]'),
            (template) => template.id
        ));
        const pdfPath = path.join(outputDirectory, `${printCase.name}.pdf`);
        await page.pdf({
            path: pdfPath,
            format: 'A4',
            landscape: true,
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' }
        });

        const pageCount = countPdfPages(pdfPath);
        assertEqual(pageCount, printCase.pages, `${printCase.name} PDF page count`);
        assertEqual(visibleTemplates, printCase.templates, `${printCase.name} visible print templates`);
        results.push({ name: printCase.name, pages: pageCount, visibleTemplates, pdfPath });
    }

    for (const scenario of accountabilityMatrixScenarios) {
        await page.emulateMedia({ media: 'screen' });
        await page.goto(appUrl, { waitUntil: 'load' });
        await page.evaluate(async () => {
            await Promise.resolve(window.YonduApp?.scope?.initPromise);
        });
        await page.locator('[data-form="accountability"]').dispatchEvent('click');
        await page.emulateMedia({ media: 'print' });

        const matrix = [];
        for (let assetCount = 1; assetCount <= scenario.maximumAssetCount; assetCount += 1) {
            const assets = Array.from(
                { length: assetCount },
                (_, index) => scenario.buildAsset(index)
            );
            const layout = await page.evaluate(({ nextAssets }) => {
                const app = window.YonduApp;
                app.scope.currentFormType = 'accountability';

                const values = {
                    f_refNo: 'CTRL-PRINT-QA',
                    f_empName: 'PRINT LAYOUT QA USER',
                    f_empId: 'QA-001',
                    f_position: 'Asset Management Specialist',
                    f_costCenter: 'NCS-IT',
                    f_sigEmpName: 'PRINT LAYOUT QA USER',
                    f_sigPosition: 'Asset Management Specialist',
                    f_dateIssued_text: '05/14/2026',
                    f_issuedName: 'PADUA, RUZZEL MICKO GARCIA',
                    f_issuedPos: 'IT Asset Specialist / Custodian',
                    f_issuedDate_text: '05/14/2026',
                    f_approvedName: 'MENDEZ, PAUL ALDRIN',
                    f_approvedPos: 'ITSM Lead and Asset Management Lead'
                };

                for (const [id, value] of Object.entries(values)) {
                    const element = document.getElementById(id);
                    if (element) {
                        element.value = value;
                    }
                }

                app.renderAccountabilityAssetRows(nextAssets);
                app.markPrintPreparationDirty();
                app.preparePrintOutput();

                const template = document.getElementById('template-accountability');
                return {
                    declaredPages: Number(template.dataset.printPageCount || '1'),
                    generatedPageCount: template.querySelectorAll('.accountability-print-page').length,
                    paged: template.classList.contains('is-paged-print')
                };
            }, { nextAssets: assets });
            const pdfPath = path.join(
                outputDirectory,
                `accountability-${scenario.name}-${String(assetCount).padStart(2, '0')}.pdf`
            );

            await page.pdf({
                path: pdfPath,
                format: 'A4',
                landscape: true,
                printBackground: true,
                preferCSSPageSize: true,
                margin: { top: '0', right: '0', bottom: '0', left: '0' }
            });

            const pageCount = countPdfPages(pdfPath);
            assertEqual(
                pageCount,
                layout.declaredPages,
                `${scenario.name} ${assetCount}-asset physical PDF page count`
            );
            assertEqual(
                layout.generatedPageCount,
                layout.paged ? layout.declaredPages : 0,
                `${scenario.name} ${assetCount}-asset generated page count`
            );
            matrix.push({ assets: assetCount, pages: pageCount });
        }

        assertEqual(
            matrix[scenario.expectedSinglePageMaximum - 1].pages,
            1,
            `${scenario.name} single-page maximum`
        );
        if (matrix[scenario.expectedSinglePageMaximum].pages <= 1) {
            throw new Error(
                `${scenario.name} overflow boundary did not activate after ${scenario.expectedSinglePageMaximum} assets. Artifacts: ${outputDirectory}`
            );
        }

        results.push({
            name: `accountability-${scenario.name}-matrix`,
            pageRanges: summarizePageRanges(matrix)
        });
    }
} finally {
    await browser.close();
}

console.log(JSON.stringify({ browserPath, outputDirectory, results }, null, 2));

function findBrowserPath() {
    const candidates = [
        process.env.NCS_BROWSER_PATH,
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ].filter(Boolean);
    const match = candidates.find((candidate) => existsSync(candidate));
    if (!match) {
        throw new Error('No supported Chromium-family browser was found. Set NCS_BROWSER_PATH and retry.');
    }
    return match;
}

function countPdfPages(pdfPath) {
    const pdfText = readFileSync(pdfPath).toString('latin1');
    return pdfText.match(/\/Type\s*\/Page\b/g)?.length || 0;
}

function assertEqual(actual, expected, label) {
    const same = Array.isArray(expected)
        ? JSON.stringify(actual) === JSON.stringify(expected)
        : actual === expected;
    if (!same) {
        throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}. Artifacts: ${outputDirectory}`);
    }
}

function pairedWorkflowFields(deviceType) {
    const description = deviceType === 'Laptop'
        ? 'Lenovo ThinkPad T14 Gen 4 with charger and carrying bag'
        : 'Apple iPhone 15 Pro Max 256 GB with charging cable';
    return {
        '#f_retName': 'DELA CRUZ, ALEXANDER SANTOS',
        '#f_retEmail': 'alexander.delacruz@example.com',
        '#f_retEmpNo': 'NCS-012345',
        '#f_retBU': 'Technology Operations',
        '#f_retTag': deviceType === 'Laptop' ? 'LT-001234' : 'TD-001234',
        '#f_retDesc': description,
        '#f_retSerial': 'SN1234567890',
        '#f_sanName': 'DELA CRUZ, ALEXANDER SANTOS',
        '#f_sanEmail': 'alexander.delacruz@example.com',
        '#f_sanEmpNo': 'NCS-012345',
        '#f_sanBU': 'Technology Operations',
        '#f_sanTag': deviceType === 'Laptop' ? 'LT-001234' : 'TD-001234',
        '#f_sanDesc': description,
        '#f_sanSerial': 'SN1234567890'
    };
}

function buildRealisticAccountabilityAsset(index) {
    const descriptions = [
        '13-INCH MACBOOK AIR; APPLE M2 CHIP WITH 8 CORE CPU, 16GB, 512GB',
        'LENOVO THINKBOOK 14S, PROCESSOR I7, 16GB RAM, 512 SSD',
        'LENOVO E14, GEN 6, ULTRA 7, 16GB RAM, 1TB SSD'
    ];
    const description = descriptions[index % descriptions.length];

    return {
        particulars: 'Laptop',
        assetTag: `NCS-${String(index + 1).padStart(5, '0')}`,
        description,
        serial: `SN${String(index + 1).padStart(8, '0')}`,
        setupDate: '2026-05-14',
        remarks: description.includes('MACBOOK')
            ? 'LAPTOP WITH BOX AND CHARGER'
            : 'LAPTOP WITH BAG AND CHARGER'
    };
}

function buildHighWrapAccountabilityAsset(index) {
    return {
        particulars: 'Laptop',
        assetTag: `NCS-LONG-${String(index + 1).padStart(3, '0')}`,
        description: index % 2 === 0
            ? '13-INCH MACBOOK AIR; APPLE M2 CHIP WITH 8 CORE CPU, 16GB RAM, 512GB SSD, CORPORATE BUILD WITH ENDPOINT PROTECTION, VPN, AND FULL ACCESSORY KIT'
            : 'LENOVO THINKBOOK 14S; INTEL CORE I7; 16GB RAM; 512GB SSD; CORPORATE SECURITY BUILD WITH ENDPOINT PROTECTION, VPN, AND STANDARD BUSINESS APPLICATIONS',
        serial: `SN-LONG-${String(index + 1).padStart(3, '0')}`,
        setupDate: '2026-05-14',
        remarks: index % 2 === 0
            ? 'LAPTOP WITH BOX, BAG, CHARGER, ADAPTER, AND COMPLETE ACCESSORY SET'
            : 'LAPTOP WITH BAG, CHARGER, DOCKING STATION, AND COMPLETE ACCESSORY SET'
    };
}

function summarizePageRanges(matrix) {
    const ranges = [];
    let rangeStart = matrix[0].assets;
    let currentPageCount = matrix[0].pages;

    for (let index = 1; index <= matrix.length; index += 1) {
        const item = matrix[index];
        if (item && item.pages === currentPageCount) {
            continue;
        }

        const rangeEnd = matrix[index - 1].assets;
        ranges.push({
            assets: rangeStart === rangeEnd
                ? String(rangeStart)
                : `${rangeStart}-${rangeEnd}`,
            pages: currentPageCount
        });

        if (item) {
            rangeStart = item.assets;
            currentPageCount = item.pages;
        }
    }

    return ranges;
}
