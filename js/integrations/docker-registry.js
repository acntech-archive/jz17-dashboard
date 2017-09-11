var axios = require('axios');

var config = require('../util/config').loadConfig();

exports.findBranchesOfApp = function (appName, callback) {

  axios.get(config.registry.url + '/_catalog?n=10000', {
    timeout: 5000,
    headers: {
      'Connection': 'keep-alive'
    }
  })
  .then(function (response) {

    var repositories = response.data.repositories.map(function (repository) {
      return mapRepositoryToObject(repository);
    });

    var appRepositories = repositories.filter(function(repository) { return repository.app === appName });
    // Sort with develop first
    var appBranches = appRepositories.map(function(repository) { return repository.branch })
      .sort((n1, n2) => n1.replace('develop', '0').localeCompare(n2.replace('develop', '0')));

    callback(null, appBranches);
  })
  .catch(function (error) {
    callback(error);
  });
};

function mapRepositoryToObject(repository) {
  return {
    app: repository.split('/')[0],
    branch: repository.split('/')[1]
  }
}

exports.findRepositoryTags = function (repoName, callback) {
  axios.get(config.registry.url + '/' + repoName + '/tags/list')
  .then(function (response) {
    callback(null, response.data.tags.sort(function (a, b) { return b-a; }));
  })
  .catch(function (error) {
    callback(error);
  });
};