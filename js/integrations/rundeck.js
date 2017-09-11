exports = module.exports = Rundeck;

const axiosLib = require('axios');
const util = require('util');
var async = require('async');

var config = require('../util/config').loadConfig();

const errorStatus = 'failed';
const successStatus = 'succeeded';
const runningStatus = 'running';
const pollInterval = 100;

function Rundeck() {
  this.baseUrl = config.rundeck.url + 'api/' + config.rundeck.apiVersion + '/';
  this.deployJobTodoAppUrl = util.format('job/%s/run', config.rundeck.todoapp.deployJob);
  this.deleteJobTodoAppUrl = util.format('job/%s/run', config.rundeck.todoapp.deleteJob);

  this.axios = axiosLib.create({
    baseURL: this.baseUrl,
    timeout: config.rundeck.timeout,
    headers: {
      'X-Rundeck-Auth-Token': config.rundeck.authToken
    }
  });
}

Rundeck.prototype.deployTodoApp = function (args, callback) {
  this.executeJob(this.deployJobTodoAppUrl, args, callback);
};

Rundeck.prototype.deleteTodoApp = function (args, callback) {
  this.executeJob(this.deleteJobTodoAppUrl, args, callback);
};

Rundeck.prototype.executeJob = function (jobUrl, args, callback) {
  var self = this;

  function get(url, pollCb) {
    self.axios.get(url)
      .then(function (response) {
        pollCb(null, response);
      })
      .catch(function (error) {
        pollCb(error);
      });
  }

  self.axios.post(jobUrl, {
    filter: 'name: ' + args.Server,
    options: args
  })
    .then(function (response) {
      var executionId = response.data.id;
      var status = response.data;
      var tries = 0;

      async.until(function () {
          tries++;
          return status.status !== runningStatus || tries*pollInterval > 30000; // Stop polling after 30 sec
        },
        function (next) {
          get(statusUrl(executionId), function (err, response) {
            if (err) {
              next(err);
              return;
            }
            status = response.data;
            setTimeout(next, pollInterval);
          });
        },
        function (err) {

          if(!err && status.status !== successStatus) {
            err = true;
          }

          var errorMessage;
          if (status && status.permalink) {
            errorMessage = 'Noe gikk galt under kjøring av Rundeck-jobb, sjekk loggene her: ' + status.permalink;
          } else {
            errorMessage = 'Ukjent feil under kjøring av Rundeck-jobb';
          }

          callback(err, errorMessage);
        });
    })
    .catch(function (error) {
      console.log(error)
      callback(error, 'Opprettelse av miljø feilet! Sjekk at du har angitt et gyldig navn på miljøet, og se deretter i loggene på Rundeck.');
    });
};

const statusUrl = function (id) {
  return util.format('execution/%d', id);
};