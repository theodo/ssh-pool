exports.formatArgs = formatArgs;
exports.formatSSHCommand = formatSSHCommand;
exports.formatScpCommand = formatSCPCommand;

/**
 * Format SSH command.
 *
 * @param {string} remote Remote
 * @param {string} command Command to execute
 * @param {options} [options] Options
 * @returns {string}
 */

function formatSSHCommand(remote, command, options) {
  // Escape double quotes in command.
  command = command.replace(/"/g, '\\"');
  command = '"' + command + '"';

  return ['ssh']
    .concat(formatArgs(options, 'ssh'))
    .concat(command)
    .join(' ');
}

/**
 * Build SCP command.
 *
 * @param {string} src Source
 * @param {string} dest Destination
 * @param {object} [options] Options
 * @see formatArgs
 * @returns {string}
 */

function formatSCPCommand(src, dest, options) {
  return ['scp']
    .concat(formatArgs(options, 'scp'))
    .concat(src, dest)
    .join(' ');
}

/**
 * Format SSH args.
 *
 * @param {object} [options]
 * @param {string} [options.key] Key
 * @param {string} [options.port] Port
 * @param {string} [options.strict] StrictHostKeyChecking
 * @param {string|string[]} [options.raw] Additional raw args
 * @param {string} type Type
 * @returns {string[]}
 */

function formatArgs(options, type) {
  options = options || {};

  var args = [];

  if (options.port)
    args = args.concat([type === 'scp' ? '-P' : '-p', options.port]);

  if (options.key)
    args = args.concat(['-i', options.key]);

  if (options.strict)
    args = args.concat(['-o', 'StrictHostKeyChecking=' + options.strict]);

  if (options.raw)
    args = args.concat(options.raw);

  return args;
}
