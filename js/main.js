/* Lovely Animals — front-end only: reveal on scroll + hero sparkles */
(function () {
  "use strict";

  // Reveal gallery items on scroll
  var items = document.querySelectorAll(".item");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("in"); });
  }

  // Floating sparkles over the hero (decorative dots only)
  var box = document.getElementById("sparkles");
  if (box) {
    var n = 22;
    for (var i = 0; i < n; i++) {
      var s = document.createElement("span");
      s.className = "sparkle";
      var size = 4 + Math.random() * 9;
      s.style.width = size + "px";
      s.style.height = size + "px";
      s.style.left = (Math.random() * 96) + "%";
      s.style.top = (Math.random() * 92) + "%";
      s.style.animationDelay = (Math.random() * 2.8).toFixed(2) + "s";
      s.style.animationDuration = (2.2 + Math.random() * 2).toFixed(2) + "s";
      box.appendChild(s);
    }
  }
})();
