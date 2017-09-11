(function () {
  $(document).on('mouseenter', '.ellipsed', function () {
    var $this = $(this);
    if (this.offsetWidth < this.scrollWidth) {
      $this.tooltip({
        title: $this.text(),
        placement: 'top'
      });
      $this.tooltip('show');
    }
  });
})();