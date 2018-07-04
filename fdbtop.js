#!/usr/bin/env node

const _ = require('lodash');
const Table = require('easy-table');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const commandLineArgs = require('command-line-args');
const commandLineUsage = require('command-line-usage');
const termKit = require('terminal-kit');
const term = termKit.terminal;

let command = 'fdbcli --exec "status json" --timeout=15';
const sorts = [
    {sort: ['ip', 'port'], order: 'asc',  numeric: false, group: true},
    {sort: 'port',         order: 'asc',  numeric: false, group: false},
    {sort: 'cpu%',         order: 'desc', numeric: true,  group: false},
    {sort: 'mem%',         order: 'desc', numeric: true,  group: false},
    {sort: 'iops',         order: 'desc', numeric: true,  group: false},
    {sort: 'net',          order: 'desc', numeric: true,  group: false},
    {sort: 'class',        order: 'asc',  numeric: false, group: false},
    {sort: 'roles',        order: 'asc',  numeric: false, group: false}
];
let sortIndex = 0;

const optionDefinitions = [
    { 
        name: 'help',
        alias: 'h', 
        type: Boolean, 
        description: 'Displays this help' 
    },
    { 
        name: 'interval', 
        alias: 'i', 
        type: Number, 
        defaultValue: 1,
        typeLabel: '<sec>',
        description: 'Refresh interval in seconds' 
    },
    {
        name: 'showStatelessIops',
        type: Boolean,
        description: 'Show disk usage for all roles (otherwise shown only for storage and log)',
    },
];
const help = [
    {
        header: 'Name',
        content: '{bold fdbtop} - display and update sorted information about FoundationDB processes'
    },
    {
        header: 'Synopsis',
        content: '{bold fdbtop [OPTIONS]}'
    },
    {
        header: 'Examples',
        content: 
            '{bold fdbtop}\n' +
            '{bold fdbtop -i 10 -- -C fdb.cluster --tls_certificate_file cert}\n' +
            '{bold ssh foo "fdbcli --exec \'status json\'" | fdbtop}'
    },
    {
        header: 'Usage',
        content: "You can use '<' and '>' to change the sort column.\n" +
            "Press ESC or CRTL-C to exit.\n" +
            "Can be used in non-interactive mode if you pipe an fdb status json to it.\n" +
            "Arguments that come after '--' will be passed to the fdbcli."
    },
    {
        header: 'Options',
        optionList: optionDefinitions,
    },
]
const options = commandLineArgs(optionDefinitions, { stopAtFirstUnknown: true });

function getProcessData(status) {
    let data = _(status.cluster.processes).values().map(x => ({
        'ip': x.address.split(':')[0],
        'port': x.address.split(':')[1],
        'cpu%': x.cpu ? Math.round(x.cpu.usage_cores * 100) : '???',
        'mem%': x.memory && x.memory.limit_bytes ? Math.round(x.memory.used_bytes / x.memory.limit_bytes * 100) : '???',
        'iops': x.disk ? Math.round(x.disk.reads.hz + x.disk.writes.hz) : '???',
        'net': x.network ? Math.round(x.network.megabits_sent.hz + x.network.megabits_received.hz) : '???',
        'class': x.class_type,
        'roles': x.roles.map(z => z.role).sort().join(),
    })).commit();
    if (!options.showStatelessIops) {
        data.filter(x => !x.roles.includes('log') && !x.roles.includes('storage')).each(x => x.iops = '-');
    }
    return data;
}

function formatTable(data, groupMachines = true) {
    let t = new Table;
    let lastIp = null;
    data.each(process => {
        _(process).each((value, key) => {
            if (groupMachines && key === 'ip') {
                if (lastIp && value !== lastIp) {
                    t.pushDelimeter();
                }
                if (value === lastIp) {
                    value = '';
                } else {
                    lastIp = value;
                }
            }
            if (key === sorts[sortIndex].sort) {
                key = `<${key}>`;
            }
            t.cell(key, ' ' + value + ' ');
        });
        t.newRow();
    });
    return t.toString();
}

function processData(json) {
    let status = JSON.parse(json);
    let data = getProcessData(status);
    let sort = sorts[sortIndex];
    let val;
    if (sort.numeric) {
        // non digits go last
        val = x => (_.isInteger(x[sort.sort]) ? x[sort.sort] : 0);
    } else if (_.isString(sort.sort)) {
        // empty strings go last
        val = x => x[sort.sort] === '' ? '\uffff' : x[sort.sort];
    } else {
        val = sort.sort;
    }
    data = data.orderBy(val, sort.order);
    return formatTable(data, sort.group);
}

function processInput(key, matches, data) {
    switch(key) {
        case 'CTRL_C':
        case 'ESCAPE':
        case 'q':
            term.processExit();
            break;
        case '>':
            sortIndex = (sortIndex + 1) % sorts.length;
            loop(); // instant refresh
            break;
        case '<':
            sortIndex = (sortIndex - 1) % sorts.length;
            loop(); // instant refresh
            break;
    }
}

function crop(buffer) {
    let lines = [];
    let padding = ' '.repeat(term.width);
    for(let line of buffer.split('\n')) {
        lines.push(termKit.truncateString(line + padding, term.width));
        if (lines.length >= term.height) {
            break;
        }
    }
    return lines.join('\n');
}

async function loop() {
    try {
        const {stdout, stderr} = await exec(command, {maxBuffer: 1024 * 1024});
        const output = crop(processData(stdout));
        term.moveTo(1, 1);
        term(output);
        term.eraseDisplayBelow();
    } catch (err) {
        term.clear();
        term(err);
        term(err.stdout);
        // term(err.stderr); // already included in stdout?
    }
    setTimeout(loop, 1000 * options.interval);
}

if (options.help || options._unknown && options._unknown[0] !== '--') {
    console.log(commandLineUsage(help));
    process.exit();
}
if (options._unknown) {
    options._unknown.shift(); // remove the '--'
    command += ' ' + options._unknown.join(' ');
}

if (process.stdin.isTTY) {
    term.grabInput();
    term.on('key', processInput);
    term.fullscreen();
    term.hideCursor();
    term.windowTitle('fdbtop');
    process.on('exit', x => { term.fullscreen(false); term.hideCursor(false); term.styleReset(); });
    loop();
} else {
    const inputChunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => inputChunks.push(chunk));
    process.stdin.on('end', () => process.stdout.write(processData(inputChunks.join(''))));
}