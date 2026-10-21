const expo = require('eslint-config-expo/flat');

module.exports = [
  ...expo,
  { ignores: ['dist/*', 'node_modules/*', '.expo/*', 'test/*', 'scripts/*', 'public/sw.js'] },
];
