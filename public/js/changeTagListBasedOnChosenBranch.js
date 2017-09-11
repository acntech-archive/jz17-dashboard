// Register listener on document ready (yeah yeah, I know)
$(document).ready(function () {
  let $branchSelects = $('select.branch');
  let $pdbSelects = $('select.db-server');

  $branchSelects.each(reloadBranchOptionsForTag);
  $branchSelects.change(function () {
    reloadBranchOptionsForTag(0, this);
  });
});

function reloadBranchOptionsForTag(idx, select) {
  var $select = $(select);
  var selectedBranch = $select.val();
  var branchApp = $select.data('branch-app');

  $.getJSON('/rest/' + branchApp + '/' + selectedBranch + '/tags', function (data) {

    var tagsDropdown = $('#branch-tag-' + branchApp);
    tagsDropdown.empty();
    var deployedTag = tagsDropdown.attr('data-deployed-tag');

    $.each(data, function (index, value) {
      var selected = value === deployedTag ? 'selected=selected' : '';
      var newOption = $('<option ' + selected + '>' + value + '</option>');
      tagsDropdown.append(newOption);
    });
  });
}

