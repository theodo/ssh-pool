var _ = require('lodash');
var path = require('path');
var Promise = require('bluebird');
var sprintf = require('sprintf-js').sprintf;
var exec = require('./exec');
var remote = require('./remote');
var ssh = require('./ssh');
var rsync = require('./rsync');

// Expose connection.
module.exports = Connection;

/**
 * Initialize a new `Connection` with `options`.
 *
 * @param {object} options Options
 * @param {string|object} options.remote Remote
 * @param {object} [options.ssh] SSH options
 * @param {object} [options.rsync] Rsync options
 * @param {object} [options.exec] Exec options
 * @param {Stream} [options.stdout] Stdout stream
 * @param {Stream} [options.stderr] Stderr stream
 * @param {function} [options.log] Log method
 */

function Connection(options) {
  this.options = _.merge({}, {
    ssh: {},
    rsync: {},
    exec: {
      maxBuffer: 1000 * 1024
    }
  }, options);

  this.remote = _.isString(this.options.remote) ?
    remote.parse(this.options.remote) :
    this.options.remote;
}

/**
 * Log using the logger.
 */

Connection.prototype.log = function () {
  if (this.options.log)
    this.options.log.apply(null, arguments);
};

/**
 * Run a new SSH command.
 *
 * @param {string} command Command
 * @param {object} [options] Options
 * @param {string|string[]} [options.ssh] SSH arguments
 * @param {string|string[]} [options.exec] Exec options
 * @param {function} [cb] Callback
 * @returns {Promise}
 */

Connection.prototype.run = function (command, options, cb) {
  // run(command, cb)
  if (_.isFunction(options)) {
    cb = options;
    options = undefined;
  }

  options = _.merge({}, this.options, options);

  this.log('Running "%s" on host "%s".', command, this.remote.host);

  command = ssh.formatSSHCommand(
    remote.format(this.remote),
    command,
    options.ssh
  );

  return exec(command, this.remote.host, options.exec)
    .nodeify(cb);
};

/**
 * Remote file copy.
 *
 * @param {string} src Source
 * @param {string} dest Destination
 * @param {object} [options] Options
 * @param {object} [options.direction] Direction of copy
 * @param {function} [cb] Callback
 * @returns {Promise}
 */

Connection.prototype.copy = function (src, dest, options, cb) {
  // function (src, dest, cb)
  if (_.isFunction(options)) {
    cb = options;
    options = {};
  }

  options = _.merge({}, this.options, options, {direction: 'localToRemote'});

  var connection = this;

  return rsync.isAvailable()
    .then(function (available) {
      var handler = available ? copyViaRsync : copyViaScp;
      return handler(connection, src, dest, options);
    })
    .nodeify(cb);
};


/**
 * Performs the copy operation via rsync
 *
 * @param {Connection} connection
 * @param {object} options
 * @param {string} options.direction Direction
 * @param {object} [options.rsync] RSync options
 * @param {object} [options.ssh] SSH options
 * @param {object} [options.exec] Exec options
 * @param {string} src
 * @param {string} dest
 * @returns {Promise}
 */

function copyViaRsync(connection, src, dest, options) {
  options = _.merge({}, connection.options, options);

  src = options.direction === 'remoteToLocal' ?
    remote.format(connection.remote) + ':' + src :
    src;

  dest = options.direction === 'localToRemote' ?
    remote.format(connection.remote) + ':' + dest :
    dest;

  connection.log('Copy "%s" to "%s" via rsync', src, dest);

  var command = rsync.formatCommand(
    src,
    dest,
    _.extend({}, options.rsync, {ssh: options.ssh})
  );

  return exec(command, this.remote.host, options.exec);
}

/**
 * Generates an array of commands to use when copying over scp
 * @param {Connection} connection
 * @param {string} src
 * @param {string} dest
 * @param {Object} options
 * @returns {string[]}
 */

function generateScpCommands(connection, src, dest, options) {
  function generateCommand(cmd, dest) {
    return options.direction === 'remoteToLocal' &&
      dest === 'dest' ||
      options.direction === 'localToRemote' &&
      dest === 'src' ?
      cmd :
      ssh.formatCommand(cmd, options.ssh);
  }

  function generatePath(path, dest) {
    return options.direction === 'remoteToLocal' &&
      dest === 'dest' ||
      options.direction === 'localToRemote' &&
      dest === 'src' ?
      path :
      remote.format(connection.remote) + ':' + path;
  }

  var packageFile = sprintf('%s.tmp.tar.gz', path.basename(src));
  var fromPath = generatePath(path.dirname(src) + '/' + packageFile, 'src');
  var toPath = generatePath(dest, 'dest');

  var cdSource = ['cd', path.dirname(src)].join(' ');
  var cdDest = ['cd', dest].join(' ');

  var excludes = rsync.formatExcludes(options.rsync.excludes);

  var tar = generateCommand(
    [
      cdSource,
      ['tar']
        .concat(excludes)
        .concat('-czf', packageFile, path.basename(src))
        .join(' ')
    ]
    .join(' && '),
    'src'
  );

  var createDestDir = generateCommand(
    ['mkdir', '-p', dest]
      .join(' '),
    'dest'
  );

  var copy = ssh.formatSCPCommand(fromPath, toPath, options.ssh);

  var rmSrcPackage = generateCommand(
    [
      cdSource,
      ['rm', packageFile]
        .join(' ')
    ]
      .join(' && '),
    'src'
  );

  var untar = generateCommand(
    [
      cdDest,
      ['tar']
        .concat('--strip-components', '1', '-xzf', packageFile)
        .join(' ')
    ]
      .join(' && '),
    'dest'
  );

  var rmDestPackage = generateCommand(
    [
      cdDest,
      'rm ' + packageFile
    ].join(' && '),
    'dest'
  );

  return [
    tar,
    createDestDir,
    copy,
    rmSrcPackage,
    untar,
    rmDestPackage
  ];
}

/**
 * Performs the copy operation via tar+scp
 * @param {Connection} connection
 * @param {string} src
 * @param {string} dest
 * @param {object} options
 * @returns {Promise}
 */

function copyViaScp(connection, src, dest, options) {
  var commands = generateScpCommands(connection, src, dest, options);

  // Executes an array of commands in series
  return Promise.reduce(commands, function (results, cmd) {
    return exec(cmd, connection.remote.host, options.exec)
      .then(function (res) {
        results.stdout += res.stdout;
        results.stderr += res.stderr;
        return results;
      });
  }, {
    stdout: '',
    stderr: ''
  });

}
