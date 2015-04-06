var Promise = require('bluebird');
var whereis = require('whereis');
var ssh = require('./ssh');

exports.formatExcludes = formatExcludes;
exports.formatCommand = formatCommand;
exports.isAvailable = isAvailable;

/**
 * Format RSync command.
 *
 * @param {string} src Source
 * @param {string} dest Destination
 * @param {object} [options] options
 */

function formatCommand(src, dest, options) {
  return ['rsync']
    .concat('-az')
    .concat(formatArgs(options))
    .concat(src, dest)
    .join(' ');
}

/**
 * Test if rsync is available.
 *
 * @returns {Promise.<boolean>}
 */

function isAvailable() {
  return new Promise(function (resolve) {
    whereis('rsync', function (err) {
      resolve(!err);
    });
  });
}

/**
 * Format arguments.
 *
 * @param {object} [options]
 * @param {object} [options.ssh]
 * @param {string[]} [options.excludes]
 * @param {string|string[]} [options.raw] Additional raw params
 * @returns {string[]}
 */

function formatArgs(options) {
  options = options || {};

  var args = [];

  if (options.excludes)
    args = args.concat(formatExcludes(options.excludes));

  if (options.ssh)
    args = args.concat(['-e', '"ssh' + ssh.formatArgs(options.ssh) + '"']);

  if (options.raw)
    args = args.concat(options.raw);

  return args;
}

/**
 * Format excludes to rsync excludes.
 *
 * @param {string[]} excludes
 * @returns {string[]}
 */

function formatExcludes(excludes) {
  return excludes.reduce(function (prev, current) {
    return prev.concat(['--exclude', '"' + current + '"']);
  }, []);
}
