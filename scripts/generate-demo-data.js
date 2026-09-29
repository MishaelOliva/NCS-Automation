#!/usr/bin/env node
/**
 * Generates the synthetic demo datasets in assets/demo-data/.
 *
 * Every value in these files is invented by this script. No production,
 * customer, or personal data is read, transformed, or written. The script has
 * no network access and no external dependencies.
 *
 * Synthetic conventions used throughout:
 *   - Names        : reserved example names (Doe, Smith, Johnson, ...)
 *   - Emails       : RFC 2606 reserved domain example.com / example.org
 *   - Phones       : 000-series placeholder numbers
 *   - MAC addresses: 02:00:00:xx:xx:xx (locally administered, unassigned OUI)
 *   - IMEI         : 350000xx TAC block, not allocated to any real vendor
 *   - Hardware IDs : SYN- prefixed serials, LT- asset tags, EMP- employee IDs
 *   - Vendors      : "Example ..." placeholder companies
 *   - Money        : derived from the seeded PRNG, not from any price list
 *
 * Usage:  node scripts/generate-demo-data.js
 * Output: assets/demo-data/demo-*.csv
 */

'use strict';

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'demo-data');

const ROW_COUNTS = {
    master: 600,
    taskAssignment: 2500,
    newHire: 60,
    testDevice: 90
};

/* ------------------------------------------------------------------ */
/* Deterministic PRNG so regenerating the data produces identical files */
/* ------------------------------------------------------------------ */

function createPrng(seed) {
    let state = seed >>> 0;
    return function next() {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const prng = createPrng(20260929);

function pick(list) {
    return list[Math.floor(prng() * list.length)];
}

function intBetween(min, max) {
    return min + Math.floor(prng() * (max - min + 1));
}

function chance(probability) {
    return prng() < probability;
}

/* ------------------------------------------------------------------ */
/* Synthetic vocabulary                                                */
/* ------------------------------------------------------------------ */

const FIRST_NAMES = [
    'Alex', 'Blair', 'Casey', 'Dana', 'Ellis', 'Frankie', 'Gray', 'Harper',
    'Indigo', 'Jamie', 'Kai', 'Lee', 'Morgan', 'Noel', 'Oakley', 'Parker',
    'Quinn', 'Reese', 'Sawyer', 'Tatum'
];

const LAST_NAMES = [
    'Doe', 'Smith', 'Johnson', 'Brown', 'Williams', 'Clark', 'Miller',
    'Sample', 'Tester', 'Placeholder'
];

const VENDORS = [
    'Example Vendor Co.', 'Sample Supplier Ltd.', 'Demo Distributor Inc.',
    'Placeholder Hardware Inc.'
];

const BUSINESS_UNITS = [
    'Engineering', 'Finance', 'Operations', 'Customer Support',
    'Marketing', 'Product', 'Human Resources', 'Field Services'
];

const DEPARTMENTS = [
    'IT Operations', 'Application Support', 'Infrastructure Services',
    'Service Desk', 'Systems Administration'
];

const POSITIONS = [
    'Systems Engineer', 'Support Analyst', 'Operations Specialist',
    'Software Engineer', 'Account Manager', 'Team Lead'
];

const LAPTOP_MODELS = [
    'ExampleBook Pro 14 (i5, 16GB, 512GB SSD)',
    'ExampleBook Air 13 (i7, 8GB, 256GB SSD)',
    'ExampleStation 15 (i5, 16GB, 1TB HDD)',
    'ExamplePad 11 Tablet (8GB, 128GB)'
];

const DESKTOP_MODELS = [
    'ExampleTower SFF (i5, 16GB, 512GB SSD)',
    'ExampleTower Mini (i7, 32GB, 1TB SSD)'
];

const MONITOR_MODELS = [
    'ExampleView 24" IPS Monitor',
    'ExampleView 27" QHD Monitor'
];

const PHONE_MODELS = [
    'ExamplePhone A11',
    'ExamplePhone S24',
    'ExamplePhone 8',
    'ExamplePad Tab 4'
];

const OPERATING_SYSTEMS = ['Windows 11 Pro', 'Windows 10 Pro', 'Windows 11 Home'];

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const REMARK_TEMPLATES = [
    'Laptop replacement - hardware fault on SYN-{tag}',
    'Scheduled refresh of legacy device SYN-{tag}',
    'New starter onboarding - device SYN-{tag}',
    'Temporary loan for coverage period - SYN-{tag}',
    'Offboarding return and sanitization - SYN-{tag}',
    'Broken screen replacement - SYN-{tag}'
];

const TECH_OWNERS = ['Support Technician A', 'Support Technician B', 'IT Support Queue'];

const DELIVERY_METHODS = [
    'Courier Pickup', 'Branch Pickup', 'Office Delivery', 'Internal Mail'
];

/* ------------------------------------------------------------------ */
/* Synthetic value builders                                            */
/* ------------------------------------------------------------------ */

const SERIAL_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function serial(prefix, length) {
    let body = '';
    for (let i = 0; i < length; i += 1) {
        body += SERIAL_ALPHABET[Math.floor(prng() * SERIAL_ALPHABET.length)];
    }
    return `${prefix}${body}`;
}

function employeeId(index) {
    return `EMP-${String(index).padStart(4, '0')}`;
}

function assetTag(index) {
    return `LT-${String(100000 + index)}`;
}

function macAddress() {
    const octets = ['02', '00', '00'];
    for (let i = 0; i < 3; i += 1) {
        octets.push(String(intBetween(0, 255)).padStart(2, '0'));
    }
    return octets.join(':');
}

function imei(tacIndex) {
    // TAC 350000xx is not allocated to any real manufacturer.
    const body = `350000${String(tacIndex).padStart(2, '0')}${String(intBetween(1000000, 9999999))}`;
    return body;
}

function exampleEmail(firstName, lastName, index) {
    return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}@example.com`;
}

function placeholderPhone(index) {
    return `+63 900 ${String(index % 1000).padStart(3, '0')} ${String(intBetween(0, 9999)).padStart(4, '0')}`;
}

function exampleAddress(index) {
    const buildings = intBetween(1, 90);
    const units = intBetween(1, 40);
    return `Unit ${units}02, ${buildings} Example Street, Example District, Example City`;
}

function money(min, max) {
    const value = intBetween(min, max);
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isoDate(minYear, maxYear) {
    const year = intBetween(minYear, maxYear);
    const month = intBetween(1, 12);
    const day = intBetween(1, 28);
    return `${month}/${day}/${year}`;
}

function remark(tag) {
    return pick(REMARK_TEMPLATES).replace('{tag}', tag);
}

/* ------------------------------------------------------------------ */
/* CSV writer (RFC 4180 quoting)                                       */
/* ------------------------------------------------------------------ */

function toCsv(rows) {
    return rows
        .map((row) =>
            row
                .map((cell) => {
                    const value = cell === null || cell === undefined ? '' : String(cell);
                    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
                })
                .join(',')
        )
        .join('\r\n');
}

/* ------------------------------------------------------------------ */
/* Shared person/asset registry so records join across the four files  */
/* ------------------------------------------------------------------ */

const employees = [];

for (let i = 0; i < ROW_COUNTS.master + 200; i += 1) {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    employees.push({
        id: employeeId(i + 1),
        firstName,
        lastName,
        name: `${lastName.toUpperCase()}, ${firstName.toUpperCase()}`,
        email: exampleEmail(firstName, lastName, i + 1),
        phone: placeholderPhone(i + 1),
        position: pick(POSITIONS),
        businessUnit: pick(BUSINESS_UNITS),
        department: pick(DEPARTMENTS)
    });
}

/* ------------------------------------------------------------------ */
/* 1. Asset master tracker                                             */
/* ------------------------------------------------------------------ */

function buildMasterTracker() {
    // Header values are written unquoted here so the CSV writer emits exactly
    // one level of quoting, matching the schema the parser expects.
    const rows = [
        [
            'EE ID', 'SAP', 'ASSET TAG', ' Host Name', ' MAC Address', ' EMPLOYEE NAME',
            'STATUS', 'Month', 'Year', 'DEPLOYED DATE', ' POSITION', 'BUSINESS UNIT',
            'Operating System', 'Storage Location', 'REVISED MODEL 1', ' DESCRIPTION',
            'SERIAL NO.', 'ACQUISITION DATE', 'WARRANTY EXPIRE', 'ACQUISITION COST',
            'PURCHASED PRICE', 'ACCOUNTABILITY FORM', 'PO# / SI#', 'LAST USER',
            'VENDOR NAME', ''
        ]
    ];

    for (let i = 0; i < ROW_COUNTS.master; i += 1) {
        const person = employees[i];
        const isMonitor = chance(0.25);
        const tag = isMonitor ? `MON-${String(200000 + i)}` : assetTag(i);
        const model = isMonitor ? pick(MONITOR_MODELS) : pick(LAPTOP_MODELS);
        const hostSerial = isMonitor ? serial('SN-', 8) : serial('SYN-', 8);
        const acquired = isoDate(2021, 2025);
        const warrantyYear = Number(acquired.split('/')[2]) + 3;

        rows.push([
            person.id,
            String(900000 + i),
            tag,
            tag.toLowerCase(),
            macAddress(),
            person.name,
            pick(['Deployed', 'Deployed', 'Deployed', 'In Repair', 'Unreturned Asset', 'Available']),
            pick(MONTHS),
            String(intBetween(2021, 2026)),
            isoDate(2022, 2026),
            person.position,
            person.businessUnit,
            isMonitor ? 'N/A' : pick(OPERATING_SYSTEMS),
            isMonitor ? 'N/A' : 'Office',
            model,
            model,
            hostSerial,
            acquired,
            `1/1/${warrantyYear}`,
            money(25000, 95000),
            money(1250, 4800),
            `SYNTHETIC-ACCOUNTABILITY-${person.id}.pdf`,
            `PO-SYN-${String(500000 + i)}`,
            person.name,
            pick(VENDORS),
            ''
        ]);
    }

    return rows;
}

/* ------------------------------------------------------------------ */
/* 2. ITSM task assignment                                             */
/* ------------------------------------------------------------------ */

function buildTaskAssignments() {
    const rows = [
        [
            'xr', 'EE Name', 'Laptop Description', 'Asset Tag', 'Serial Number', '',
            'Laptop Hostname', 'Host Name', 'MAC Address', 'Remarks', 'ADDRESS',
            'Contact No.', 'Status', 'Tech POC',
            'Updated to Master Tracker (Yes or No)', '', '', '', ''
        ]
    ];

    for (let i = 0; i < ROW_COUNTS.taskAssignment; i += 1) {
        const person = employees[intBetween(0, employees.length - 1)];
        const hasDevice = chance(0.8);
        const tag = hasDevice ? assetTag(intBetween(0, ROW_COUNTS.master)) : '';

        rows.push([
            person.id,
            person.name,
            hasDevice ? pick([...LAPTOP_MODELS, ...DESKTOP_MODELS, ...MONITOR_MODELS]) : '',
            tag,
            hasDevice ? serial('SYN-', 8) : '',
            '',
            hasDevice ? tag.toLowerCase() : '',
            hasDevice ? tag.toLowerCase() : '',
            hasDevice ? macAddress() : '',
            hasDevice ? remark(tag) : 'Pending device allocation',
            exampleAddress(i),
            person.phone,
            pick(['Deployed', 'Deployed', 'For Pickup', 'For Repair', 'Ready for Release', 'Retracted']),
            pick(TECH_OWNERS),
            hasDevice && chance(0.6) ? 'Y' : 'N',
            '',
            '',
            '',
            ''
        ]);
    }

    return rows;
}

/* ------------------------------------------------------------------ */
/* 3. New hire attendance (two header rows, as the parser expects)     */
/* ------------------------------------------------------------------ */

function buildNewHireAttendance() {
    const columnHeader = [
        'Demo Asset Account Status',
        'ASSET STATUS',
        'Created Email Address',
        'Strong Start Arrangement',
        'DATE ENDORSED',
        'EE NUMBER3.0',
        'EMPLOYEE NAME',
        'NEW HEADCOUNT OR REPLACEMENT HEADCOUNT OF RESIGNED EEs',
        'POSITION',
        'DEPT/GROUP/UNIT',
        'SUB Unit',
        'IS',
        'Day O.N.E Strong Start',
        'Email',
        'Date of Birth',
        'TIN NUMBER',
        'DISTRO',
        'Remarks',
        'START DATE',
        'ADDRESS',
        'CONTACT NUMBER',
        'PICTURE',
        'ASSET STATUS',
        'REMARKS',
        'NOTES',
        'SERVICE UNIT (FOR FINANCE)',
        'For KIAH',
        'Demo Asset Account Status'
    ];

    // Dropdown/validation row above the real header. Padded to the same width
    // as columnHeader so the parser sees a rectangular block.
    const dropdownHeader = new Array(columnHeader.length).fill('');
    dropdownHeader[6] = 'Retracted';
    dropdownHeader[7] = DELIVERY_METHODS[0];
    dropdownHeader[8] = DELIVERY_METHODS[1];
    dropdownHeader[9] = DELIVERY_METHODS[2];
    dropdownHeader[10] = 'Preparing';
    dropdownHeader[11] = 'Waiting confirmation from People Ops';
    dropdownHeader[12] = 'Email Only';

    const rows = [dropdownHeader, columnHeader];

    for (let i = 0; i < ROW_COUNTS.newHire; i += 1) {
        const person = employees[ROW_COUNTS.master + i];
        const startDate = isoDate(2025, 2026);
        rows.push([
            pick(['Created', 'Pending', 'Retracted']),
            pick(['Demo Windows Image', 'Demo macOS Image', 'Email Only']),
            person.email,
            pick(['Face to Face Orientation', 'Virtual Orientation', 'Self Serve']),
            startDate,
            person.id,
            person.name,
            'NEW',
            person.position,
            person.department,
            person.department,
            pick(['Pending', 'Confirmed']),
            startDate,
            person.email,
            '',
            '',
            pick(['Corporate', 'Retail', 'Field']),
            '',
            startDate,
            exampleAddress(i),
            person.phone,
            '',
            pick(['Deployed', 'Pending', 'Delivered']),
            '',
            '',
            'Synthetic Sample Unit',
            person.email
        ]);
    }

    return rows;
}

/* ------------------------------------------------------------------ */
/* 4. Test device pool                                                 */
/* ------------------------------------------------------------------ */

function buildTestDevicePool() {
    const rows = [
        [
            '', 'TAGGING', 'TAGGING', 'STATUS', 'EE No.', 'ASSIGNEE', 'Project',
            'Accountability Form', 'Issued Date', 'SAP Document Number', 'Posting Date',
            'ACQUISITION COST', 'MOBILE UNIT', 'Serial No.', 'IMEI NO',
            'PREVIOUS OWNER', 'Status', 'LOCATION', 'Notes', 'PREVIOUS OWNER', 'Notes'
        ]
    ];

    for (let i = 0; i < ROW_COUNTS.testDevice; i += 1) {
        const person = employees[intBetween(0, employees.length - 1)];
        const tagNumber = String(i + 1).padStart(5, '0');

        rows.push([
            '',
            `TD${String(i + 1).padStart(4, '0')}`,
            `TD-${tagNumber}`,
            pick(['ASSIGNED', 'ASSIGNED', 'AVAILABLE', 'FOR REPAIR']),
            person.id,
            person.name,
            pick(['Mobile QA', 'Android QA', 'Device Lab', 'Field Pilot']),
            `SYNTHETIC-ACCOUNTABILITY-TD-${tagNumber}.pdf`,
            isoDate(2021, 2025),
            `SYN-DOC-${800000 + i}`,
            isoDate(2021, 2025),
            money(8000, 40000),
            pick(PHONE_MODELS),
            serial('SYN-', 8),
            imei(i + 1),
            chance(0.4) ? pick(employees).name : '',
            pick(['Deployed', 'In Lab', 'Returned']),
            'Example Office - Device Lab',
            '',
            '',
            ''
        ]);
    }

    return rows;
}

/* ------------------------------------------------------------------ */

function write(name, rows) {
    const target = path.join(OUTPUT_DIR, name);
    fs.writeFileSync(target, `${toCsv(rows)}\r\n`, 'utf8');
    console.log(`wrote ${name} (${rows.length} rows)`);
}

function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    write('demo-asset-master-tracker.csv', buildMasterTracker());
    write('demo-itsm-task-assignments.csv', buildTaskAssignments());
    write('demo-new-hire-attendance.csv', buildNewHireAttendance());
    write('demo-test-device-pool.csv', buildTestDevicePool());
    console.log('All demo datasets regenerated from synthetic values.');
}

main();
