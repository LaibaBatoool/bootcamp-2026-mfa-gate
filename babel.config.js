// babel.config.js
//
// Needed so Jest can transform ESM-only packages (specifically @scure/base
// and @noble/hashes, which otplib depends on internally) into CommonJS
// before running tests. Without this, Jest's default transform can't
// parse their `export`/`import` syntax and throws a SyntaxError.
//
// This only affects the test environment — your actual app code runs
// fine without this, since Node itself already handles otplib correctly.

module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};