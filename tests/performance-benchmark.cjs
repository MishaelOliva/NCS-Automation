const { performance } = require('node:perf_hooks');
const { loadApp } = require('./load-app');

const rowCount = Number.parseInt(process.argv[2] || '10000', 10);
const { app } = loadApp();
const sourceKind = app.scope.SOURCE_KIND.MASTER;
const rows = Array.from({ length: rowCount }, (_, index) => ({
    'EE NUMBER': `NCS-${String(index).padStart(6, '0')}`,
    'EMPLOYEE NAME': `EMPLOYEE, SAMPLE ${index}`,
    'ASSET TAG': `LT-${String(index).padStart(6, '0')}`,
    'SERIAL NO': `SN${String(index).padStart(10, '0')}`,
    MODEL: `Laptop Model ${index}`,
    POSITION: 'Business Systems Analyst',
    'COST CENTER': 'IT-OPS',
    'BUSINESS UNIT': 'Technology Operations',
    EMAIL: `employee${index}@example.com`,
    STATUS: 'ACTIVE'
}));
const source = {
    id: 'benchmark-master',
    name: 'master.csv',
    matchKind: sourceKind,
    effectiveKind: sourceKind,
    rows
};
const targetIndex = rowCount - 1;
const employeeId = `NCS-${String(targetIndex).padStart(6, '0')}`;
const assetTag = `LT-${String(targetIndex).padStart(6, '0')}`;

const employee = timed('employee-cold', () => app.findMasterEmployeeRecord(
    [source],
    app.buildSearchQuery(employeeId),
    employeeId
));
const asset = timed('asset-cold', () => app.findMasterDeviceRecord(
    [source],
    app.normalizeIdentifier(assetTag),
    assetTag
));
const warmStart = performance.now();
for (let index = Math.max(0, rowCount - 6); index < rowCount; index += 1) {
    const query = `LT-${String(index).padStart(6, '0')}`;
    app.findMasterDeviceRecord([source], app.normalizeIdentifier(query), query);
}

console.log(JSON.stringify({
    rows: rowCount,
    employee,
    asset,
    sixAssetsWarmMs: millisecondsSince(warmStart)
}, null, 2));

function timed(label, callback) {
    const start = performance.now();
    const value = callback();
    return {
        label,
        milliseconds: millisecondsSince(start),
        matched: Boolean(value?.match)
    };
}

function millisecondsSince(start) {
    return Number((performance.now() - start).toFixed(2));
}
