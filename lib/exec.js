var LineWrapper = require('stream-line-wrapper');
var exec = require('child_process').exec;
var Promise = require('bluebird');

/**
 * Execute a command and return a promise.
 *
 * @param {string} command
 * @param {string} host
 * @param {object} [options]
 */

module.exports = function (command, host, options) {
  return new Promise(function (resolve, reject) {
    options = options || [];

    var child = exec(command, options, function (err, stdout, stderr) {
      if (err) reject(err);
      else
        resolve({
          child: child,
          stdout: stdout,
          stderr: stderr
        });
    });

    if (options.stdout)
      child.stdout
        .pipe(new LineWrapper({prefix: '@' + host + ' '}))
        .pipe(options.stdout);

    if (options.stderr)
      child.stderr
        .pipe(new LineWrapper({prefix: '@' + host + '-err '}))
        .pipe(options.stderr);
  });
};
