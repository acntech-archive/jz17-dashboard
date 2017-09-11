'use strict';

const axios = require('axios');
const async = require('async');
const moment = require('moment');
const todoAppDomain = require('../domain/todoapp')
const config = require('../util/config').loadConfig();

function fetchEnvironmentsForServer(serverName, environmentType, callback) {
  let server = config.servers[ serverName ];

  var labelFilters = [ 'jz17demo.dashboard.include=true' ];
  if (environmentType) {
    labelFilters.push('jz17demo.dashboard.environment.type=' + environmentType);
  }
  let filters = JSON.stringify({ label: labelFilters });

  let url = server.dockerApi + '/containers/json?all=1&filters=' + filters;
  axios.get(url, {
    timeout: 3000,
    headers: {
      'Connection': 'keep-alive'
    }
  })
    .then(function (response) {
      if (typeof response.data !== 'object') {
        callback('Parsing av respons fra Docker daemon feilet. Host url: ' + server.dockerApi);
        return;
      }

      let environmentContainers = findAndMapTeamEnvironmentContainers(response.data);
      let teamEnvironments = mapEnvironments(environmentContainers, server);
      
      if (environmentType === 'todoapp') {
        todoAppDomain.populateServiceUrls(teamEnvironments);
      }

      callback(null, teamEnvironments);
    })
    .catch(function (err) {
      var error = 'ERROR: Could not retrieve or parse containers from docker host: ' + serverName;
      console.log(error);
      callback(error, null);
    });
}

function findAndMapTeamEnvironmentContainers(lotsOfContainers) {
  let mappedContainers = lotsOfContainers.map(function (container) {
    let mapped = {};
    mapped.id = container.Id;
    mapped.image = container.Image;
    mapped.version = container.Image.replace(/registry.jz17demo.acntech.no:5000\/.+?\//, '');
    mapped.name = container.Names[ 0 ];
    mapped.projectName = container[ 'Labels' ][ 'com.docker.compose.project' ];
    mapped.serviceName = container[ 'Labels' ][ 'com.docker.compose.service' ];
    mapped.commitHash = container[ 'Labels' ][ 'jz17demo.git.commitHash' ];
    mapped.environmentType = container[ 'Labels' ][ 'jz17demo.dashboard.environment.type' ];
    mapped.state = container.State;
    mapped.created = container.Created;
    mapped.status = container.Status;
    mapped.ports = container.Ports
      .filter(port => port[ 'PublicPort' ])
      .sort((p1, p2) => p1.PrivatePort - p2.PrivatePort);

    return mapped;
  });

  return mappedContainers.sort(function (c1, c2) {
    if (c1.databaseName && !c2.databaseName) {
      return -1;
    } else if (!c1.databaseName && c2.databaseName) {
      return 1;
    }
    return c1.serviceName.localeCompare(c2.serviceName);
  });
}

function mapEnvironments(teamServerContainers, teamServer) {

  let envContainerArrays = {};
  teamServerContainers.forEach(function (container) {
    let environmentName = container.projectName;
    envContainerArrays[ environmentName ] = envContainerArrays[ environmentName ] || [];
    envContainerArrays[ environmentName ].push(container);
  });

  let environmentNames = Object.keys(envContainerArrays);

  let environments = [];
  environmentNames.forEach(function (envName) {
    let containers = envContainerArrays[ envName ];
    let frontendContainer = getFrontendContainer(containers);

    let sortedContainers = containers.sort((c1, c2) => c1.created - c2.created);
    let newestContainer = sortedContainers[ sortedContainers.length - 1 ];
    let oldestContainer = sortedContainers[ 0 ];

    let environment = {};
    environment.name = envName;
    environment.serverName = teamServer.name;
    environment.serverIp = teamServer.ip;
    environment.serverUrl = teamServer.baseUrl;
    environment.containers = containers;
    environment.environmentType = frontendContainer.environmentType;
    environment.frontendContainer = frontendContainer;

    environment.created = moment(oldestContainer.created * 1000);
    environment.modified = moment(newestContainer.created * 1000);
    environment.createdFormattedTimestamp = environment.created.format('DD/MM HH:mm');
    environment.modifiedFormattedTimestamp = environment.modified.format('DD/MM HH:mm');
    environment.modifiedAge = environment.modified.fromNow();
    environment.state = aggregateState(containers);
    let isWarn = environment.modified.isBefore(moment().subtract(3, 'days'));
    let isDanger = environment.modified.isBefore(moment().subtract(7, 'days'));
    environment.freshness = !isWarn ? 'success' : isDanger ? 'danger' : 'warning';

    environments.push(environment);
  });

  return environments.sort(function (a, b) {
    {
      return a.name.localeCompare(b.name);
    }
  });
}

function aggregateState(containers) {
  let states = containers.map(c => c.state);
  return states.every(state => state === 'running') ? 'success' :
    states.every(state => state === 'exited') ? 'danger' : 'warning';
}

function getFrontendContainer(containers) {
  const containerMapping = {
    todoapp: 'frontend'
  };

  return containers.find(function (container) {
    return container.serviceName === containerMapping[ container.environmentType ];
  }) || {};
}

function fetchEnvironmentsForEnvironmentType(environmentType, callback) {
  let serverNames = config.servers.dockerEnvs;
  let done = 0;
  let envs = [];
  let serverStatus = [];

  let q = async.queue(function (serverName) {
    fetchEnvironmentsForServer(serverName, environmentType, function (err, data) {
      if (data) {
        envs = [ ...envs, ...data ];
      }
      serverStatus.push({
        name: serverName,
        up: !err,
        containers: data ? data.map(env => env.containers.length).reduce((r, c) => r + c, 0) : 0
      });
      if (++done === serverNames.length) {
        callback(null, {
          envs: envs,
          serverStatus
        });
      }
    });
  }, serverNames.length);

  serverNames.forEach(serverName => q.push(serverName));
}

function changeRunningState(params, action, callback) {
  let serverName = params.server;
  let containerId = params.container;

  let dockerApiCallUrl = config.servers[serverName].dockerApi + '/containers/' + containerId + '/' + action;

  axios.post(dockerApiCallUrl)
    .then(function () {
      callback();
    })
    .catch(function (error) {
      callback(error);
    });
}

module.exports = {
  fetchEnvironmentsForServer,
  fetchEnvironmentsForEnvironmentType,
  changeRunningState
};