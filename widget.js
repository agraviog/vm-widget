var Webflow = Webflow || [];
Webflow.push(function () {
  //autoplay 0 for lottie record animation
  var lotRecord = document.getElementById("lottie_countdown--vm-widget");
  lotRecord.setAttribute("data-autoplay", "0");

  //change active buttons
  $(".vm-widget--btn").on("click", function () {
    $(".active").removeClass("active");
    $(this).addClass("active");
  });

  //remove webflow badge
  $(document).ready(function () {
    $(".w-webflow-badge").removeClass("w-webflow-badge").empty();
  });
});
