'use strict';

module.exports.apps = [
  'frontend',
  'backend',
];

module.exports.populateServiceUrls = function (environments) {
  environments.forEach(function (environment) {
    
    let frontendContainer = environment.containers.find((container) => container.serviceName === 'frontend');
    if (frontendContainer) {
      let port = frontendContainer.ports.find((port) => port.PrivatePort === 3000) || {};
      frontendContainer.serviceUrl = environment.serverUrl + ':' + port.PublicPort;
    }

    let backendContainer = environment.containers.find((container) => container.serviceName === 'backend');
    if (backendContainer) {
      let port = backendContainer.ports.find((port) => port.PrivatePort === 8080) || {};
      backendContainer.serviceUrl = environment.serverUrl + ':' + port.PublicPort;
    }
  });
};