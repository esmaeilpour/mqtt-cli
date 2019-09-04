const vorpal = require('vorpal')();
const mqtt = require('mqtt');
const clc = require('cli-color');
const Table = require('cli-table');
const figlet = require('figlet');
const fs = require('fs');

const colors = ['green', 'yellow', 'blue', 'magenta', 'cyan'];
const state = {
  current: undefined,
  connections: []
};

async function init() {

  function dupConnection(options) {
    return state.connections.some(({ url, clientId, username, status }) =>
      url == options.url &&
      clientId == options.clientId &&
      username == options.username &&
      status != 'backoff' &&
      status != 'kill'
    );
  }

  function addConnection(options) {
    var index = state.connections.length;
    var color = clc[colors[index % 6]];
    var client = mqtt.connect(options.url, { reconnectPeriod: 5000, ...options });
    var connection = { index, color, client, reconnect: 0, status: 'connecting', ...options };
    client.on('connect', () => {
      state.connections[index].status = 'connected';
    });
    client.on('error', (err) => {
      state.connections[index].status = 'error';
      state.connections[index].error = err.message;
    });
    client.on('close', () => {
      if (state.connections[index].status == 'kill') {
        return;
      }
      if (state.connections[index].reconnect >= 3) {
        state.connections[index].status = 'backoff';
        return client.end(true);
      }
      state.connections[index].status = 'reconnect';
      state.connections[index].reconnect++;
    });
    client.on('message', (topic, message, packet) => {
      if (connection.silent) {
        return false;
      }
      vorpal.log(color(`${index}> delivered to ${options.username}/${options.clientId} ${topic} ${message.toString()}`));
    });
    state.connections.push(connection);
    return connection;
  }

  function lsConnections() {
    var table = new Table({
      head: ['#', 'url', 'clientId', 'user', 'pass', 'status', 'error']
    });
    state.connections.forEach((con, i) => {
      let status = clc.blue('connecting');
      if (con.status == 'connected') {
        status = clc.green(con.status);
      } else if (con.status == 'reconnect') {
        status = clc.yellow(`${con.status} (${con.reconnect})`);
      } else if (con.status == 'error' || con.status == 'backoff') {
        status = clc.red(con.status);
      } else if (con.status == 'kill') {
        return;
      }
      var row = [`${i}${state.current == i ? '*' : ''}`, con.url, con.clientId, con.username, con.password, status, con.error || ''];
      if (!con.save) {
        row = row.map(c => clc.inverse(c));
      }
      table.push(row);
    })
    vorpal.log(table.toString());
  }

  function checkConnection(index) {
    return state.connections.length > index &&
      state.connections[index].status == 'connected';
  }

  function saveConnection({ url, clientId, username, password }) {
    var connections = JSON.parse(vorpal.localStorage.getItem('connections') || '[]');
    connections.push({ url, clientId, username, password });
    vorpal.localStorage.setItem('connections', JSON.stringify(connections));
  }

  function reloadConnections() {
    try {
      JSON.parse(vorpal.localStorage.getItem('connections') || '[]').forEach(opts => addConnection({ save: true, ...opts }));
      JSON.parse(fs.readFileSync('./connections.json').toString()).filter(opts => !dupConnection(opts)).forEach(opts => addConnection({ save: true, ...opts }));
    } catch (e) {
      void (0);
    }
    lsConnections();
  }

  vorpal
    .command('connect', 'Connect to mqtt.')
    .option('-h, --url <url>', 'the host required for connecting to your broker.')
    .option('-c, --clientId <clientId>', 'the clientId required by your broker, if any.')
    .option('-u, --username <username>', 'the username required by your broker, if any.')
    .option('-p, --password <password>', 'the password required by your broker, if any.')
    .option('--clean <clean>', 'set to false to receive QoS 1 and 2 messages while offline.')
    .option('--save', 'save connection.')
    .types({
      string: ['u', 'username', 'p', 'password']
    })
    .validate((args) => {
      var { options } = args;
      if (!options.url) {
        return 'the host required for connecting to your broker';
      } else if (!options.clientId) {
        return 'the clientId required by your broker';
      } else if (!options.username) {
        return 'the username required by your broker';
      } else if (!options.password) {
        return 'the password required by your broker';
      }
      return true;
    })
    .action((args, callback) => {
      if (!dupConnection(args.options)) {
        var { index, save } = addConnection(args.options);
        if (save) {
          saveConnection(args.options);
        }
        state.current = index;
      }
      lsConnections();
      callback();
    });

  vorpal
    .command('ls', 'List of available connections.')
    .action((args, callback) => {
      lsConnections();
      callback();
    });

  vorpal
    .command('use [number]', 'Use a mqtt connections.')
    .autocomplete({
      data: () => state.connections.map((v, i) => `${i}`)
    })
    .validate((args) => {
      if ('number' in args && checkConnection(args.number)) {
        return true
      }
      return clc.red('please check connection status');
    })
    .action((args, callback) => {
      state.current = args.number;
      callback();
    });

  vorpal
    .command('silent [number]', 'Silent a mqtt connections.')
    .option('--off', 'disable silent.')
    .autocomplete({
      data: () => state.connections.map((v, i) => `${i}`)
    })
    .validate((args) => {
      if ('number' in args && state.connections.length > args.number) {
        return true
      }
      return clc.red('invalid connection number');
    })
    .action((args, callback) => {
      var { number, options: { off } } = args;
      if (off) {
        delete state.connections[number].silent;
      } else {
        state.connections[number].silent = true;
      }
      callback();
    });

  vorpal
    .command('pub', 'Publish message to the topic.')
    .option('-t, --topic <topic>', 'the topic to publish.')
    .option('-p, --payload <payload>', 'the message to publish.')
    .option('-q, --qos <qos>', 'the QoS.')
    .option('--js2json', 'convert payload to json before publishing.')
    .types({
      string: ['t', 'topic']
    })
    .validate((args) => {
      var { options } = args;
      if (!checkConnection(state.current)) {
        return 'please check connection status';
      } else if (!options.topic) {
        return 'the topic to publish';
      } else if (!options.payload) {
        return 'the message to publish';
      }
      return true;
    })
    .action((args, callback) => {
      var { options: { topic, payload, qos } } = args;
      var client = state.connections[state.current].client;
      if (args.options.js2json) {
        try {
          payload = JSON.stringify(eval('(' + payload + ')'));
        } catch (e) {
          vorpal.log(e);
        }
      }
      client.publish(topic, Buffer.from(payload), { qos }, () => callback());
    });

  vorpal
    .command('sub', 'Subscribe topic.')
    .option('-t, --topic <topic>', 'the topic to subscribe.')
    .option('-q, --qos <qos>', 'the QoS.')
    .types({
      string: ['t', 'topic']
    })
    .validate((args) => {
      var { options } = args;
      if (!checkConnection(state.current)) {
        return 'please check connection status';
      } else if (!options.topic) {
        return 'the topic to subscribe';
      }
      return true;
    })
    .action((args, callback) => {
      var { options: { topic, qos } } = args;
      var client = state.connections[state.current].client;
      client.subscribe(topic, { qos: qos || 1 }, () => callback());
    });

  vorpal
    .command('unsub', 'Unsubscribe topic.')
    .option('-t, --topic <topic>', 'the topic to unsubscribe.')
    .types({
      string: ['t', 'topic']
    })
    .validate((args) => {
      var { options } = args;
      if (!checkConnection(state.current)) {
        return 'please check connection status';
      } else if (!options.topic) {
        return 'the topic to subscribe';
      }
      return true;
    })
    .action((args, callback) => {
      var { options: { topic, qos } } = args;
      var client = state.connections[state.current].client;
      client.unsubscribe(topic, () => callback());
    });

  vorpal
    .command('save', 'Save current connection.')
    .validate((args) => {
      if (checkConnection(state.current)) {
        return true
      }
      return clc.red('please use a connection and check its status');
    })
    .action((args, callback) => {
      var connection = state.connections[state.current];
      saveConnection(connection);

      state.connections[state.current].save = true;
      callback();
    });

  vorpal
    .command('kill [number]', 'Kill a mqtt connections.')
    .autocomplete({
      data: () => state.connections.map((v, i) => `${i}`)
    })
    .validate((args) => {
      if ('number' in args && state.connections.length > args.number) {
        return true
      }
      return clc.red('invalid connection number');
    })
    .action((args, callback) => {
      var { number } = args;
      state.connections[number].client.end(true);
      state.connections[number].status = 'kill';
      var connections = state.connections.filter(con => con.status != 'kill')
        .map(({ url, clientId, username, password }) => ({ url, clientId, username, password }));
      vorpal.localStorage.setItem('connections', JSON.stringify(connections));
      if (number == state.current) {
        state.current == undefined;
      }
      lsConnections();
      callback();
    });

  vorpal
    .command('restart', 'Restart.')
    .action((args, callback) => {
      state.connections.forEach(con => con.client.end(true));
      state.connections.length = 0;
      state.state = undefined;
      reloadConnections();
      callback();
    });

  figlet('Mqtt Cli', function (err, data) {
    if (err) return
    vorpal
      .history('mqtt-cli')
      .localStorage('mqtt-cli')
      .log(data)
      .delimiter('mqtt$')
      .show();
    reloadConnections();
  });
}

init();

process.on('uncaughtException', function (error) {
  vorpal.log(error);
});