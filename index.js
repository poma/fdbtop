#!/usr/bin/env node

const _ = require('lodash');
const Table = require('easy-table')

function getProcessData(status) {
    return _(status.cluster.processes).values().map(x => ({
        'ip': x.address.split(':')[0],
        'port': x.address.split(':')[1],
        'class': x.class_type,
        'roles': x.roles.map(z => z.role).join(),
        'cpu': Math.round(x.cpu.usage_cores * 100) + '%',
        'iops': Math.round((x.disk.reads.hz + x.disk.writes.hz) / 1000),
        'mem': Math.round(100 * x.memory.used_bytes / x.memory.limit_bytes) + '%',
        'net': Math.round(x.network.megabits_sent.hz + x.network.megabits_received.hz),
    }));
}

function formatTable(data) {
    const groupMachines = true;

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
            t.cell(key, ' ' + value + ' ');
        });
        t.newRow();
    });
    return t.toString();
}

if (process.stdin.isTTY) {
    console.log('todo')
} else {
    const inputChunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => inputChunks.push(chunk));
    process.stdin.on('end', function () {
        let parsedData = JSON.parse(inputChunks.join(''));
        let data = getProcessData(parsedData);
        data = data.sortBy(['ip', 'port']);
        let result = formatTable(data);
        process.stdout.write(result);
    });
}