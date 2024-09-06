// Grabs data from the config json
const fs = require('fs');
const path = require('path');

const configFilePath = path.join(__dirname, 'config.json');
const configFile = fs.readFileSync(configFilePath, 'utf-8');
const config = JSON.parse(configFile);

module.exports = config;