'use strict';

var express = require('express');
var favicon = require('serve-favicon');
var axios = require('axios');
var async = require('async');
var bodyParser = require('body-parser');
var request = require('request'); // Foretrekker bruk av axios, brukes når axios bugger(!)
var escapeHtml = require('escape-html');
require('moment').locale('nb');

// dashboard deps
var todoApp = require('./js/domain/todoapp')
var config = require('./js/util/config').loadConfig();
var Rundeck = require('./js/integrations/rundeck');
var registry = require('./js/integrations/docker-registry');
var dockerDaemon = require('./js/integrations/docker-daemon');

var app = new express();
app.set('view engine', 'pug');
app.use(express.static('public'));
app.use(favicon(__dirname + '/public/images/favicon.png'));
app.use(bodyParser.urlencoded({extended: true}));

const rundeck = new Rundeck();

app.get('/', function (req, res) {
  res.render('index', {});
});

app.get('/environments/:EnvironmentType', function (req, res) {
  var selectedEnvironmentType = req.params.EnvironmentType;

  dockerDaemon.fetchEnvironmentsForEnvironmentType(selectedEnvironmentType, function (err, fetchedData) {
    if (err) return res.status(500).send(err.message);

    res.render('list-miljo', {
      envs: fetchedData.envs.sort((e1, e2) => e2.modified - e1.modified),
      environmentType: selectedEnvironmentType
    });
  });
});

app.get('/environment/:environmentType?/:server?/:environment?', function (req, res) {

  var selectedEnvironmentType = req.params.environmentType;
  var selectedServerName = req.params.server;
  var selectedEnvironmentName = req.params.environment;

  async.parallel({
    envs: function (callback) {
      dockerDaemon.fetchEnvironmentsForEnvironmentType(selectedEnvironmentType, callback);
    }
  }, function(err, fetchedData) {
    if(err)
    {
      res.status(500).send(err.message);
      return;
    }

    var selectedEnvironment = undefined;
    if (selectedServerName && selectedEnvironmentName && fetchedData.envs) {
      selectedEnvironment = fetchedData.envs.envs.filter(function (environment) {
        return environment.name === selectedEnvironmentName && environment.serverName === selectedServerName;
      })[0];
    }

    var envTitle = selectedEnvironment ? selectedServerName.toUpperCase() + ': ' + selectedEnvironmentName : 'Velg miljø...';

    res.render('miljo', {
      dbservers: config.dbservers,
      envTitle,
      selectedEnvironment,
      branches: fetchedData['branches'],
      environmentType: selectedEnvironmentType
    });

  });
});

app.get('/miljo/todoapp/opprett', function (req, res) {

  findAvailableTodoAppBranches(function(err, data) {
    if(err) {res.status(500).send('Feilet i oppslag av images fra registry'); return}

    res.render('nytt-todoapp-miljo', {
      apps: data,
      servers: config.servers.dockerEnvs
    });  
  })
});

app.post('/miljo/todoapp/opprett', function (req, res) {
  var params = req.body;
  rundeck.deployTodoApp(params, function (err, status) {
    if (err) {
      return res.render('error', { message: status });
    }

    res.redirect('/environment/todoapp/' + params.Server + '/' + params.Miljo );
  });
});

app.get('/miljo/slett/:environmentType/:server/:miljo', function (req, res) {

  let environmentType = req.params.environmentType;
  let params = { Server: req.params.server, Miljo: req.params.miljo };

  var deleteCallback = function (err, status) {
    if (err) {
      console.log(err);
      res.redirect('/environment/' + environmentType + '/' + params.Server + '/' + params.Miljo);
      return;
    }

    res.redirect('/environments/' + environmentType );
  };

  if (environmentType === 'todoapp') {
    rundeck.deleteTodoApp(params, deleteCallback);
  }
});


app.get('/stop/:environmentType/:server/:environment/:container', function (req, res) {
  changeRunningState(req, res, 'stop?t=30');
});

app.get('/start/:environmentType/:server/:environment/:container', function (req, res) {
  changeRunningState(req, res, 'start');
});

app.get('/restart/:environmentType/:server/:environment/:container', function (req, res) {
  changeRunningState(req, res, 'restart?t=30');
});

app.get('/kill/:environmentType/:server/:environment/:container', function (req, res) {
  changeRunningState(req, res, 'kill');
});

function changeRunningState (req, res, action) {
  let params = req.params;
  dockerDaemon.changeRunningState(params, action, function (error) {
    if (error) {
      res.status(error.response.status).send(error.response.statusText);
    } else {
      // Tilbake til miljøoversikten for valgt miljø
      res.redirect('/environment/' + params.environmentType + '/' + params.server + '/' + params.environment);
    }
  });
}

app.get('/logs/:environmentType/:server/:environment/:container', function (req, res) {

  var serverName = req.params.server;
  var environmentName = req.params.environment;
  var containerId = req.params.container;
  var environmentType = req.params.environmentType;

  var tailSize = req.query.linjer === undefined ? '200' : req.query.linjer;
  var dockerApiCallUrl = config.servers[serverName].dockerApi + '/containers/' + containerId + '/logs?stdout=1&tail=' + tailSize;

  request(dockerApiCallUrl, function (error, response, body) {
    if (error || response.statusCode !== 200) {
      res.render('error', { message: error || 'Henting av Docker logs feilet! Melding: ' + JSON.parse(body).message });
      return;
    }

    var dataUtenKontrolltegn = removeControlCharsFromDockerLog(body);

    var htmlEscapedDataUtenKontrolltegn = escapeHtml(dataUtenKontrolltegn);
    var cleanData = htmlEscapedDataUtenKontrolltegn.replace(/\n/g, '<br>');

    res.render('logs', { logs: cleanData, environmentName, serverName, environmentType });
  });
});

function removeControlCharsFromDockerLog(str) {
  var bytes = [];
  var control = true;
  for (var i = 0; i < str.length; ++i) {
    if (control) {
      i += 7;
      control = false;
    } else {
      var charCode = str.charCodeAt(i);
      control = charCode === 0x0A;
      bytes.push(charCode);
    }
  }
  return bytes.map(b => String.fromCharCode(b)).join('');
}

function findAvailableTodoAppBranches(callback) {
  async.map(todoApp.apps,
    function (appName, asyncCallback) {
      findTodoAppAndBranches(appName, asyncCallback);
    },
    function (err, data) {
      callback(err, data);
    });
}

function findTodoAppAndBranches(appName, asyncCallback) {
  let repoName = 'jz17-' + appName + '-app';
  registry.findBranchesOfApp(repoName, function (err, data) {
    asyncCallback(err, {
      name: appName,
      repoName: repoName,
      nameCapitalized: appName.replace(/^(.)|-(.)/g, (str, g1, g2) => (g1 || g2).toUpperCase()),
      branches: data
    });
  });
}

/*
 * API part of the application, providing REST endpoints
 */
 app.get('/rest/:application/branches', function (req, res) {
  var application = req.params.application;

  registry.findBranchesOfApp(application, function (error, branches) {
    if (error) {
      res.status(500).send('Noe feilet under henting av brancher i Docker registry');
    } else {
      res.send(branches);
    }
  });
});

app.get('/rest/:application/:branch/tags', function (req, res) {
  var application = req.params.application;
  var branch = req.params.branch;

  let url = config.registry.url + '/' + application + '/' + branch + '/tags/list';
  axios.get(url)
  .then(function (response) {
    res.send(response.data.tags.sort(function (a, b) { return b-a; })); // Sorter med nyeste først
  })
  .catch(function (error) {
    res.status(error.response.status).send(error.response.statusText);
  });
});

app.listen(3000, function () {
  console.log('Dashboard listening on port 3000!');
});