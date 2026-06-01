'use strict'

const path = require('path')

module.exports = {
  serverDir: path.join(__dirname, 'server'),
  pagesDir: path.join(__dirname, 'pages'),
  pagesMountPath: 'admin',
  version: require('../package.json').version,
}
