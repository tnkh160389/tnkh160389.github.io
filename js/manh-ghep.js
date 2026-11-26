/* Mảnh ghép — Lovely Animals, gallery "Khoảnh khắc" (8 ảnh tĩnh).
   Mỗi ảnh ghép lại từ 20 mảnh (5 cột x 4 hàng; mobile 4 x 3) bay vào từ
   vị trí lệch ngẫu nhiên + mờ dần, lệch nhau ~35ms, tổng ~1 giây.
   Chạy 1 lần khi ảnh lần đầu vào viewport (IntersectionObserver,
   rootMargin 80px). 3 clip video không đụng tới.
   Không JS / không IntersectionObserver / prefers-reduced-motion:
   ảnh hiện bình thường, không hiệu ứng. */
(function () {
  "use strict";

  var DESK_COLS = 5, DESK_ROWS = 4;   /* desktop: 20 mảnh */
  var MOB_COLS = 4, MOB_ROWS = 3;     /* mobile: 12 mảnh, nhẹ máy hơn */
  var STAGGER_MS = 35;                /* lệch nhau giữa 2 mảnh liên tiếp */
  var TILE_MS = 380;                  /* thời gian bay của 1 mảnh */
  var LOAD_TIMEOUT_MS = 2500;         /* chờ ảnh load tối đa rồi hiện thường */

  /* Bỏ qua toàn bộ nếu không hỗ trợ hoặc người dùng giảm chuyển động. */
  function showNormal(fig) { fig.classList.add("mg-done"); }
  if (!("IntersectionObserver" in window) ||
      (window.matchMedia &&
       window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
    var all = document.querySelectorAll(".mg-tiles");
    for (var k = 0; k < all.length; k++) { showNormal(all[k]); }
    return;
  }

  var isMobile = window.matchMedia &&
    window.matchMedia("(max-width: 699px)").matches;
  var COLS = isMobile ? MOB_COLS : DESK_COLS;
  var ROWS = isMobile ? MOB_ROWS : DESK_ROWS;
  var TOTAL_MS = (COLS * ROWS - 1) * STAGGER_MS + TILE_MS;

  /* Dựng lớp tiles cho 1 figure. Ảnh gốc phải load xong mới dựng được
     (tiles dùng chính URL ảnh làm background). */
  function buildTiles(fig, img) {
    if (fig.querySelector(".mg-layer")) { return true; }
    var src = img.currentSrc || img.src;
    if (!src) { return false; }
    var layer = document.createElement("div");
    layer.className = "mg-layer";
    layer.setAttribute("aria-hidden", "true");
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var t = document.createElement("div");
        t.className = "mg-tile";
        t.style.left = (c * 100 / COLS) + "%";
        t.style.top = (r * 100 / ROWS) + "%";
        /* +1px để không lòi khe hở giữa các mảnh khi bay. */
        t.style.width = "calc(" + (100 / COLS) + "% + 1px)";
        t.style.height = "calc(" + (100 / ROWS) + "% + 1px)";
        t.style.backgroundImage = 'url("' + src + '")';
        t.style.backgroundSize = (COLS * 100) + "% " + (ROWS * 100) + "%";
        t.style.backgroundPosition =
          (COLS > 1 ? (c / (COLS - 1)) * 100 : 0) + "% " +
          (ROWS > 1 ? (r / (ROWS - 1)) * 100 : 0) + "%";
        /* Lệch ngẫu nhiên nhỏ + xoay nhẹ, bay về đúng chỗ. */
        t.style.setProperty("--dx", ((Math.random() * 2 - 1) * 26).toFixed(1) + "px");
        t.style.setProperty("--dy", ((Math.random() * 2 - 1) * 26).toFixed(1) + "px");
        t.style.setProperty("--rot", ((Math.random() * 2 - 1) * 3).toFixed(1) + "deg");
        /* Lệch theo thứ tự mảnh + jitter nhỏ cho tự nhiên. */
        t.style.setProperty("--delay",
          ((r * COLS + c) * STAGGER_MS + Math.random() * 12).toFixed(0) + "ms");
        layer.appendChild(t);
      }
    }
    fig.insertBefore(layer, fig.firstChild);
    fig.classList.add("mg-ready");
    return true;
  }

  function finish(fig, layer) {
    fig.classList.add("mg-done");
    /* Đợi ảnh gốc mờ vào xong rồi gỡ lớp tiles. */
    setTimeout(function () {
      if (layer && layer.parentNode) { layer.parentNode.removeChild(layer); }
    }, 450);
  }

  function play(fig) {
    var layer = fig.querySelector(".mg-layer");
    if (!layer) { showNormal(fig); return; }
    /* Ép trình duyệt nhận trạng thái đầu rồi mới thêm class phát. */
    void layer.offsetWidth;
    layer.classList.add("mg-play");
    setTimeout(function () { finish(fig, layer); }, TOTAL_MS + 60);
  }

  var figs = document.querySelectorAll(".mg-tiles");
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) { return; }
      var fig = entry.target;
      io.unobserve(fig);
      var img = fig.querySelector("img");
      if (!img) { showNormal(fig); return; }
      /* Ảnh đã load xong (cache / đã vào viewport): dựng + phát ngay. */
      if (img.complete && img.naturalWidth > 0) {
        if (buildTiles(fig, img)) { play(fig); } else { showNormal(fig); }
        return;
      }
      /* Ảnh lazy chưa load: đợi load rồi dựng + phát, quá hạn thì hiện thường. */
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; showNormal(fig); }
      }, LOAD_TIMEOUT_MS);
      img.addEventListener("load", function onLoad() {
        img.removeEventListener("load", onLoad);
        if (done) { return; }
        done = true;
        clearTimeout(timer);
        if (buildTiles(fig, img)) { play(fig); } else { showNormal(fig); }
      });
      img.addEventListener("error", function onErr() {
        img.removeEventListener("error", onErr);
        if (done) { return; }
        done = true;
        clearTimeout(timer);
        showNormal(fig);
      });
    });
  }, { rootMargin: "80px", threshold: 0.12 });

  /* Dựng tiles sớm cho ảnh đã load (kể cả ngoài viewport) để lúc cuộn tới
     là phát ngay; ảnh lazy chưa load thì đợi tới lúc IntersectionObserver
     gọi mới dựng. */
  figs.forEach(function (fig) {
    var img = fig.querySelector("img");
    if (!img) { showNormal(fig); return; }
    if (img.complete && img.naturalWidth > 0) {
      buildTiles(fig, img);
    } else {
      img.addEventListener("load", function onEarly() {
        img.removeEventListener("load", onEarly);
        buildTiles(fig, img);
      });
    }
    io.observe(fig);
  });
})();
