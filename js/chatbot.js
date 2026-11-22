/* Lovely Animals — Chatbot (2 chatbot độc lập).
   Con chatbot này HOÀN TOÀN ĐỘC LẬP — không liên quan NightZone, Garden 303
   hay Lumia 909. Không tư vấn quán/menu/giá/đặt bàn. Không thanh toán/ví Pi.
   - Tab Nội bộ: bot từ khóa (mẫu NightZone/Lumia) — NGƯỜI GIỚI THIỆU.
     Giới thiệu LovelyAnimals (là gì, nội dung, mục đích), giới thiệu Pi
     Network (tích cực, có cơ sở, không bịa thành tựu), trả lời câu hỏi cơ
     bản về web/dự án. Khi khách muốn tâm sự/trò chuyện sâu/chủ đề rộng
     thì chủ động dẫn sang tab AI. Trả lời ngắn gọn, thân thiện; không giả
     làm AI tổng quát; không có kho kiến thức lớn.
     Thứ tự ý định (intent) — ý cụ thể kiểm tra trước, ý chung kiểm tra sau
     (để "Pi Network là gì?" không bị nhận nhầm thành giới thiệu Lovely):
     1) Pi Network, 2) LovelyAnimals, 3) Nội dung web, 4) Dẫn sang AI,
     5) Fallback thành thật.
   - Tab AI: nhúng Pi Studio app Lovely Animals (chaalanh11064.pinet.com).
     Chỉ chạy trong Pi Browser (cần tài khoản Pi). Ngoài Pi Browser thì
     hiện thông báo thân thiện + link trực tiếp (không loading vô hạn,
     không báo lỗi). Iframe tạo lười khi bấm tab AI và gỡ khỏi DOM khi
     quay lại tab Nội bộ (mẫu Lumia 909).
   Không gọi API thanh toán/ví, không đặt bàn, không log/Supabase. */
(function () {
  "use strict";

  var PI_AI_URL = "https://chaalanh11064.pinet.com";
  var SITE_URL = "https://tnkh160389.github.io";

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  function safeHttps(url) {
    return typeof url === "string" && /^https:\/\//.test(url) ? url : null;
  }
  function isPiBrowser() {
    return /PiBrowser/i.test(navigator.userAgent || "");
  }

  /* ---------- language detection (VI / EN / CN) ---------- */
  function detectLang(q) {
    var s = q || "";
    if (/[\u4e00-\u9fff]/.test(s)) return "cn";
    var lower = s.toLowerCase();
    if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/.test(lower)) return "vi";
    if (/\b(lovely|animals|pi|network|pioneer|browser|chat|hello|hi|hey|what|how|who|website|site|content|animals|cat|corgi|panda|talk|friend|sad|happy|stress|pictures|picture|photos|photo)\b/.test(lower)) return "en";
    return "vi";
  }

  /* ---------- Tier 1 answers ----------
     T(q) returns { text, actions, ai? }.
     text: plain string (rendered with textContent). actions: optional
     [{label, href}] rendered as link buttons (href must be https).
     ai: true -> also show the "Chat với AI Pi" button. */
  function T(q) {
    var lang = detectLang(q);
    var s = (q || "").toLowerCase();
    var has = function () {
      for (var i = 0; i < arguments.length; i++) {
        if (s.indexOf(arguments[i]) !== -1) return true;
      }
      return false;
    };
    var siteActs = [{ label: "Website Lovely Animals ↗", href: SITE_URL }];
    /* "pi" phải là từ độc lập (\bpi\b) — tránh nhận nhầm "pictures". */
    var isPiWord = /\bpi\b/.test(s);

    /* ---- Intent 1: Pi Network intro (positive, factual, no fabrication).
       Checked FIRST so "Pi Network là gì?" is not mistaken for Lovely. ---- */
    if (isPiWord || has("pi network", "pi browser", "pioneer", "tiền mã hoá", "tien ma hoa", "tiền ảo", "tien ao", "crypto", "blockchain", "khai thác", "khai thac", "đào pi", "dao pi", "app studio", "派", "区块链", "加密货币", "挖矿", "先锋")) {
      if (lang === "cn") return { text: "Pi Network 是一个加密货币网络，拥有全球数千万用户——大家可以直接在手机上挖掘 Pi。Pi App Studio 可以用 AI 创建应用，Pi Browser 是使用 Pi 应用的浏览器。Lovely 的 AI 聊天机器人就运行在 Pi 的基础设施上，这就是为什么您可以和它聊天。想体验 AI，请切换到 AI 标签页（需要 Pi Browser）。", actions: siteActs };
      if (lang === "en") return { text: "Pi Network is a cryptocurrency network with a community of tens of millions of users around the world — people can mine Pi right on their phone. Pi App Studio lets anyone build apps with AI, and Pi Browser is the browser for using Pi apps. Lovely's AI chatbot runs on this Pi infrastructure — that's why you can chat with it. Want to try the AI? Switch to the AI tab (you'll need Pi Browser).", actions: siteActs };
      return { text: "Pi Network là mạng lưới tiền mã hoá với cộng đồng hàng chục triệu người dùng trên toàn thế giới — mọi người có thể khai thác Pi ngay trên điện thoại. Pi App Studio giúp tạo ứng dụng với AI, và Pi Browser là trình duyệt để dùng các ứng dụng Pi. Con chatbot AI của Lovely chạy trên hạ tầng Pi này — đó là lý do bạn có thể tâm sự với nó. Muốn trải nghiệm AI thì qua tab AI nhé (cần Pi Browser).", actions: siteActs };
    }

    /* ---- Intent 2: what is LovelyAnimals ---- */
    if (has("lovely", "là gì", "la gi", "giới thiệu", "gioi thieu", "website", "web này", "web nay", "dự án", "du an", "project", "what is", "about", "this site", "this website", "介绍", "这是什么", "这个网站", "项目")) {
      if (lang === "cn") return { text: "Lovely Animals 是一个治愈内容网站：大自然、可爱动物、播客和视频。您可以在这里看照片、短视频，放松心情，找回积极能量。网站有“瞬间”画廊，里面是可爱动物的照片和短视频。Lovely Animals 是一个独立的内容项目。想聊天、倾诉的话，请切换到 AI 标签页，和 Pi AI 聊聊吧。", actions: siteActs };
      if (lang === "en") return { text: "Lovely Animals is a healing content website — nature, cute animals, podcasts and vlogs. Come here to look at photos and short clips, relax, and recharge your positive energy. The site has a 'Khoảnh khắc' (Moments) gallery with photos and short clips of cute animals. Lovely Animals is an independent content project. Want to chat or confide? Switch to the AI tab and talk with the Pi AI.", actions: siteActs };
      return { text: "Lovely Animals là website nội dung chữa lành — thiên nhiên, động vật dễ thương, podcast và vlog. Bạn vào đây để xem ảnh, clip, thư giãn và tìm lại năng lượng tích cực. Web có gallery 'Khoảnh khắc' với ảnh và clip ngắn về các bé động vật. Lovely Animals là một dự án nội dung độc lập. Muốn tâm sự, trò chuyện thì qua tab AI nhé, con AI Pi đang chờ bạn đó.", actions: siteActs };
    }

    /* ---- Intent 3: what's on the website / content ---- */
    if (has("có gì", "co gi", "xem gì", "xem gi", "gallery", "khoảnh khắc", "khoanh khac", "ảnh", "anh", "clip", "video", "động vật", "dong vat", "mèo", "meo", "corgi", "gấu trúc", "gau truc", "panda", "vịt", "vit", "thỏ", "tho", "cáo", "cao", "nai", "nhím", "nhim", "chim ruồi", "chim ruoi", "cún", "cun", "nội dung", "noi dung", "podcast", "vlog", "content", "photos", "pictures", "animals", "cat", "dog", "duck", "rabbit", "fox", "有什么", "图片", "视频", "动物", "内容", "猫", "熊猫")) {
      if (lang === "cn") return { text: "Lovely 网站有“瞬间”画廊——11 个内容：可爱动物的照片和短视频，有橘猫、柯基、熊猫宝宝、鸭宝宝、白兔子、红狐狸、小鹿、刺猬、蜂鸟、白猫、小狗……往下滚动就能看。网站还有关于大自然和动物的播客和视频。想聊天、倾诉的话，请切换到 AI 标签页。", actions: siteActs };
      if (lang === "en") return { text: "The Lovely site has a 'Khoảnh khắc' (Moments) gallery — 11 items: photos and short clips of cute animals — orange cat, corgi, baby panda, duckling, white rabbit, red fox, fawn, hedgehog, hummingbird, white cat, puppy... Just scroll down to see them. The site also has podcasts and vlogs about nature and animals. Want to chat or confide? Switch to the AI tab.", actions: siteActs };
      return { text: "Web Lovely có gallery 'Khoảnh khắc' — 11 mục: ảnh và clip ngắn về mèo cam, corgi, gấu trúc, vịt con, thỏ trắng, cáo đỏ, nai con, nhím, chim ruồi, mèo trắng, cún con... Bạn cứ cuộn xuống xem nhé. Web còn có podcast và vlog về thiên nhiên, động vật. Muốn tâm sự thì qua tab AI nhé.", actions: siteActs };
    }

    /* ---- Intent 4: chat / confide / broader topics -> route to Pi AI ---- */
    if (has("tâm sự", "tam su", "trò chuyện", "tro chuyen", "nói chuyện", "noi chuyen", "chat", "buồn", "buon", "vui", "stress", "xả stress", "xa stress", "mệt", "met", "chán", "chan", "khóc", "khoc", "yêu", "yeu", "tình cảm", "tinh cam", "bạn", "ban", "friend", "talk", "sad", "happy", "tired", "lonely", "love", "feel", "聊", "谈心", "难过", "开心", "压力", "累", "朋友")) {
      if (lang === "cn") return { text: "想倾诉、聊天的话，请切换到 AI 标签页——Pi AI 正在等你。它会倾听你的开心事和烦心事，陪你闲聊、讲笑话、缓解压力。点下面的“与 Pi AI 聊天”按钮吧。", actions: [], ai: true };
      if (lang === "en") return { text: "Want to confide or chat? Switch to the AI tab — the Pi AI is waiting for you. It listens to happy and sad stories, chats about anything, jokes around, and helps you de-stress. Tap the 'Chat with Pi AI' button below.", actions: [], ai: true };
      return { text: "Muốn tâm sự thì qua tab AI nhé — con AI Pi đang chờ bạn đó. Nó lắng nghe chuyện vui buồn, tán gẫu đủ thứ, pha trò hài hước để bạn xả stress. Bấm nút 'Chat với AI Pi' ở dưới nè.", actions: [], ai: true };
    }

    /* ---- Intent 5: honest fallback (not a general AI) ---- */
    if (lang === "cn") return { text: "这个我不太清楚。我只负责介绍 Lovely Animals 和 Pi Network，不是什么都知道的 AI。您可以问我：\n• Lovely Animals 是什么？\n• Pi Network 是什么？\n• 网站有什么？\n想聊天、倾诉的话，请切换到 AI 标签页，和 Pi AI 聊聊吧。", actions: siteActs };
    if (lang === "en") return { text: "I'm not sure about that. I only introduce Lovely Animals and Pi Network — I'm not a know-it-all AI. You can ask me:\n• What is Lovely Animals?\n• What is Pi Network?\n• What's on the website?\nWant to chat or confide? Switch to the AI tab and talk with the Pi AI.", actions: siteActs };
    return { text: "Cái này mình chưa rõ ạ. Mình chỉ giới thiệu về Lovely Animals và Pi Network thôi — không phải AI biết hết mọi thứ. Bạn có thể hỏi mình:\n• Lovely Animals là gì?\n• Pi Network là gì?\n• Web có gì?\nMuốn tâm sự thì qua tab AI nhé, con AI Pi trò chuyện được đủ thứ.", actions: siteActs };
  }

  /* ---------- modal UI ---------- */
  var modal = null;
  var chatBody = null;
  var chatInput = null;
  var chipsRow = null;
  var inputRow = null;
  var aiPanel = null;
  var aiFrame = null;   // lazy iframe, created only inside Pi Browser

  /* Lời chào: giới thiệu Lovely + Pi (tích cực, có cơ sở) + dẫn sang AI. */
  function greetingText() {
    return "Chào bạn! Mình là chatbot của Lovely Animals — website nội dung chữa lành về thiên nhiên và động vật dễ thương. Chatbot này chạy trên hạ tầng AI của Pi Network (Pi App Studio) — mạng lưới hàng chục triệu Pioneer khắp thế giới. Bạn muốn tìm hiểu về Lovely hay Pi Network? Muốn tâm sự thì qua tab AI nhé!\nHi! I'm the Lovely Animals chatbot — a healing content website about nature and cute animals. This chatbot runs on Pi Network's AI infrastructure (Pi App Studio) — a global network of tens of millions of Pioneers. Want to learn about Lovely or Pi Network? Want to chat? Switch to the AI tab!\n你好！我是 Lovely Animals 聊天机器人——一个关于大自然和可爱动物的治愈内容网站。这个机器人运行在 Pi Network 的 AI 基础设施（Pi App Studio）上——全球数千万先锋者的网络。想了解 Lovely 或 Pi Network 吗？想聊天？切换到 AI 标签页！";
  }

  function addMsg(text, who) {
    var m = document.createElement("div");
    m.className = "lv-msg " + who;
    m.textContent = text;
    chatBody.appendChild(m);
    chatBody.scrollTop = chatBody.scrollHeight;
    return m;
  }
  function addActions(actions) {
    if (!actions || !actions.length) return;
    var row = document.createElement("div");
    row.className = "lv-msg-actions";
    actions.forEach(function (a) {
      if (!safeHttps(a.href)) return;
      var link = document.createElement("a");
      link.className = "lv-msg-link";
      link.href = a.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = a.label;
      row.appendChild(link);
    });
    if (row.childNodes.length) {
      chatBody.appendChild(row);
      chatBody.scrollTop = chatBody.scrollHeight;
    }
  }
  function addAiButton() {
    var row = document.createElement("div");
    row.className = "lv-msg-actions";
    var b = document.createElement("button");
    b.type = "button";
    b.className = "lv-msg-ai-btn";
    b.textContent = "💬 Chat với AI Pi";
    b.addEventListener("click", function () { switchTab("ai"); });
    row.appendChild(b);
    chatBody.appendChild(row);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function ask(q) {
    var userQ = (q || "").trim();
    if (!userQ) return;
    addMsg(userQ, "user");
    setTimeout(function () {
      var ans = T(userQ);
      addMsg(ans.text, "bot");
      addActions(ans.actions);
      if (ans.ai) addAiButton();
    }, 400);
  }

  /* ---------- AI tab: Pi Browser detection + lazy iframe ---------- */
  function ensureAiFrame() {
    if (aiFrame) return;
    if (!isPiBrowser()) return;
    aiFrame = document.createElement("iframe");
    aiFrame.className = "lv-ai-frame";
    aiFrame.src = PI_AI_URL;
    aiFrame.setAttribute("allow", "camera; microphone");
    aiFrame.title = "Lovely Animals — Chatbot AI Pi";
    var holder = document.getElementById("lv-ai-holder");
    if (holder) holder.appendChild(aiFrame);
  }
  function dropAiFrame() {
    if (aiFrame) { aiFrame.remove(); aiFrame = null; }
  }

  function switchTab(which) {
    var tabIn = document.getElementById("lv-tab-internal");
    var tabAi = document.getElementById("lv-tab-ai");
    if (!tabIn || !tabAi) return;
    if (which === "ai") {
      tabAi.classList.add("active");
      tabIn.classList.remove("active");
      chatBody.style.display = "none";
      chipsRow.style.display = "none";
      inputRow.style.display = "none";
      aiPanel.style.display = "";
      if (isPiBrowser()) {
        document.getElementById("lv-ai-warn").style.display = "none";
        document.getElementById("lv-ai-holder").style.display = "";
        ensureAiFrame();
      } else {
        document.getElementById("lv-ai-warn").style.display = "";
        document.getElementById("lv-ai-holder").style.display = "none";
      }
    } else {
      tabIn.classList.add("active");
      tabAi.classList.remove("active");
      dropAiFrame();
      aiPanel.style.display = "none";
      chatBody.style.display = "";
      chipsRow.style.display = "";
      inputRow.style.display = "";
      if (chatInput) chatInput.focus();
    }
  }

  function openChat() {
    if (document.getElementById("lv-chat-modal")) return;
    modal = el(
      '<div class="lv-chat-backdrop" id="lv-chat-modal">' +
        '<div class="lv-chat-modal" role="dialog" aria-label="Lovely Animals — Chatbot">' +
          '<div class="lv-chat-head">' +
            '<span class="lv-chat-avatar">💬</span>' +
            '<span class="lv-chat-title">Lovely Animals — Chatbot</span>' +
            '<button type="button" class="lv-chat-close" id="lv-chat-close" aria-label="Đóng">✕</button>' +
          '</div>' +
          '<div class="lv-chat-tabs">' +
            '<button type="button" class="lv-chat-tab active" id="lv-tab-internal">Nội bộ</button>' +
            '<button type="button" class="lv-chat-tab" id="lv-tab-ai">AI</button>' +
          '</div>' +
          '<div class="lv-chat-body" id="lv-chat-body"></div>' +
          '<div class="lv-chat-ai" id="lv-chat-ai" style="display:none;">' +
            '<div id="lv-ai-warn" style="display:none;">' +
              '<p><b>Chat với AI Pi cần Pi Browser.</b></p>' +
              '<p>Bạn đang dùng trình duyệt thường — tính năng này cần Pi Browser với tài khoản Pi. Mở web Lovely Animals bằng Pi Browser để trò chuyện với AI nhé. Không có Pi Browser cũng không sao, bạn vẫn dùng web và chatbot Nội bộ bình thường.</p>' +
              '<p><a class="lv-ai-link" href="' + PI_AI_URL + '" target="_blank" rel="noopener noreferrer">' + PI_AI_URL + '</a></p>' +
              '<p class="lv-chat-ai-en">You are on a regular browser — this feature needs Pi Browser with a Pi account. Open Lovely Animals in Pi Browser to chat with the AI. No Pi Browser? No problem — the website and the Internal chatbot still work normally.</p>' +
              '<button type="button" class="lv-chat-ai-back" id="lv-ai-back">← Quay lại tab Nội bộ</button>' +
            '</div>' +
            '<div id="lv-ai-holder" style="display:none;"></div>' +
          '</div>' +
          '<div class="lv-chat-chips" id="lv-chat-chips">' +
            '<button type="button" data-q="Lovely Animals là gì?">Lovely Animals là gì?</button>' +
            '<button type="button" data-q="Pi Network là gì?">Pi Network là gì?</button>' +
            '<button type="button" data-ai="1">💬 Chat với AI Pi</button>' +
          '</div>' +
          '<div class="lv-chat-input-row" id="lv-chat-input-row">' +
            '<input id="lv-chat-input" type="text" placeholder="Nhắn cho Lovely..." autocomplete="off">' +
            '<button type="button" class="lv-chat-send" id="lv-chat-send">Gửi</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    document.body.appendChild(modal);

    chatBody = document.getElementById("lv-chat-body");
    chatInput = document.getElementById("lv-chat-input");
    chipsRow = document.getElementById("lv-chat-chips");
    inputRow = document.getElementById("lv-chat-input-row");
    aiPanel = document.getElementById("lv-chat-ai");

    addMsg(greetingText(), "bot");
    addActions([{ label: "Website Lovely Animals ↗", href: SITE_URL }]);

    document.getElementById("lv-chat-send").addEventListener("click", function () {
      ask(chatInput.value);
      chatInput.value = "";
      chatInput.focus();
    });
    chatInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { ask(chatInput.value); chatInput.value = ""; }
    });
    chipsRow.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("button") : null;
      if (!b) return;
      if (b.hasAttribute("data-ai")) { switchTab("ai"); return; }
      var q = b.getAttribute("data-q");
      if (q) ask(q);
    });
    document.getElementById("lv-tab-internal").addEventListener("click", function () { switchTab("internal"); });
    document.getElementById("lv-tab-ai").addEventListener("click", function () { switchTab("ai"); });
    document.getElementById("lv-ai-back").addEventListener("click", function () { switchTab("internal"); });

    function close() {
      dropAiFrame();
      if (modal) { modal.remove(); modal = null; }
    }
    document.getElementById("lv-chat-close").addEventListener("click", close);
    modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
    document.addEventListener("keydown", function escClose(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", escClose); }
    });
    chatInput.focus();
  }

  function init() {
    var fab = document.getElementById("lv-chat-fab");
    if (!fab) return;
    fab.addEventListener("click", openChat);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* Test/debug handle (harmless): lets a render test call T() directly. */
  window.LovelyChat = { T: T, detectLang: detectLang, isPiBrowser: isPiBrowser, PI_AI_URL: PI_AI_URL };
})();
