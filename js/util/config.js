"use strict";

const yaml = require('js-yaml');
const fs = require('fs');

let config = undefined;

exports.loadConfig = function() {
  if (config) return config;
  try {
    console.log("INFO: Laster config fra app-config.yml");
    config = yaml.safeLoad(fs.readFileSync(__dirname + '/../../app-config.yml', 'utf8'));
    return config;
  } catch (e) {
    console.log("ERROR: Lasting av app-config feilet!");
    throw e;
  }
};