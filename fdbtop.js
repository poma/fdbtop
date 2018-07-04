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
const sorts = ['ip', 'port', 'cpu%', 'mem%', 'iops', 'net', 'class', 'roles'];
const descending = ['cpu%', 'mem%', 'iops', 'net'];
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
    return _(status.cluster.processes).values().map(x => ({
        'ip': x.address.split(':')[0],
        'port': x.address.split(':')[1],
        'cpu%': x.cpu ? Math.round(x.cpu.usage_cores * 100) : '???',
        'mem%': x.memory && x.memory.limit_bytes ? Math.round(x.memory.used_bytes / x.memory.limit_bytes * 100) : '???',
        'iops': x.disk ? Math.round(x.disk.reads.hz + x.disk.writes.hz) : '???',
        'net': x.network ? Math.round(x.network.megabits_sent.hz + x.network.megabits_received.hz) : '???',
        'class': x.class_type,
        'roles': x.roles.map(z => z.role).sort().join(),
    }));
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
            if (key === sorts[sortIndex]) {
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
    let group = sort === 'ip';
    if (sort === 'ip') {
        sort = ['ip', 'port'];
    }
    data = data.sortBy(sort);
    if (descending.includes(sort)) {
        data = data.reverse();
    }
    return formatTable(data, group);
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
    for(let line of buffer.split('\n')) {
        lines.push(termKit.truncateString(line, term.width));
        if (lines.length >= term.height) {
            break;
        }
    }
    while (lines.length < term.height) {
        lines.push('');
    }
    return lines.join('\n');
}

async function loop() {
    try {
        const {stdout, stderr} = await exec(command);
        const output = crop(processData(stdout));
        term.moveTo(1, 1);
        term(output);
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
    process.on('exit', x => { term.fullscreen(false); term.hideCursor(false); term.styleReset(); });
    loop();
} else {
    const inputChunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => inputChunks.push(chunk));
    process.stdin.on('end', () => process.stdout.write(processData(inputChunks.join(''))));
}