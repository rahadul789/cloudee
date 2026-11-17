// Friend quiz player (foodbela.com/q/:code): name → questions with instant reactions → score,
// funny title, leaderboard, and "make your own" (opens the app, or Play Store when not installed).
(function () {
  "use strict";
  var dataEl = document.getElementById("qz-data");
  if (!dataEl) return;
  var boot;
  try { boot = JSON.parse(dataEl.textContent || "{}"); } catch (e) { return; }
  var quiz = boot.quiz;
  var code = boot.code;
  var playStoreUrl = boot.playStoreUrl || "/download";

  // "Make your own": Android → open the app's Hype tab (Play Store if not installed).
  function makeOwnUrl() {
    if (/Android/i.test(navigator.userAgent) && /^https?:/i.test(playStoreUrl)) {
      return "intent://hype#Intent;scheme=foodbela;package=com.foodbela.app;S.browser_fallback_url=" +
        encodeURIComponent(playStoreUrl) + ";end";
    }
    return playStoreUrl;
  }
  function bindMakeOwn(root) {
    var links = (root || document).querySelectorAll("[data-make-own]");
    for (var i = 0; i < links.length; i++) {
      links[i].setAttribute("href", makeOwnUrl());
      links[i].addEventListener("click", function () {
        if (code) post("make-own", {}).catch(function () {});
      });
    }
  }
  bindMakeOwn(document);

  var app = document.getElementById("qz-app");
  if (!app || !quiz || quiz.status !== "active") return;

  var state = {
    me: quiz.me,
    result: quiz.result,
    leaderboard: quiz.leaderboard || [],
    index: quiz.me ? quiz.me.answered : 0,
    busy: false,
  };
  // Every text is admin-editable (Friend Quiz → texts); these are only fallbacks.
  var copy = quiz.copy || {};
  function text(key, fallback) { return copy[key] || fallback; }
  var GOOD = (copy.correctReactions && copy.correctReactions.length) ? copy.correctReactions : ["বাহ, আসল দোস্ত! ✅", "একদম ঠিক! 🔥", "তুই তো সব জানিস 😎", "সেরা! 🎯"];
  var BAD = (copy.wrongReactions && copy.wrongReactions.length) ? copy.wrongReactions : ["😱 তুই ওকে চিনিসই না!", "ভুল! 🙈", "এটাও জানতি না? 🙄", "উফ, হলো না 😅"];
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function bn(num) {
    return String(num).replace(/\d/g, function (d) { return "০১২৩৪৫৬৭৮৯"[d]; });
  }

  function post(action, body) {
    return fetch("/shop-api/quiz/" + encodeURIComponent(code) + "/" + action, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", "X-Foodbela-Web": "1" },
      body: JSON.stringify(body || {}),
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok) throw new Error(payload.message || "কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করো।");
        return payload.data;
      });
    });
  }

  function boardHtml(rows, total) {
    if (!rows.length) return '<p class="qz-empty">এখনো কেউ খেলেনি — তুমিই প্রথম হও! 🥇</p>';
    var medals = ["🥇", "🥈", "🥉"];
    return rows.map(function (row) {
      return '<div class="qz-row' + (row.isMe ? " me" : "") + '">' +
        '<div class="qz-pos">' + (medals[row.rank - 1] || bn(row.rank)) + "</div>" +
        '<div class="qz-who"><b>' + esc(row.name) + (row.isMe ? " (তুমি)" : "") + "</b><small>" +
        esc(row.titleEmoji + " " + row.title) + "</small></div>" +
        '<div class="qz-pts">' + bn(row.score) + "/" + bn(total) + "</div></div>";
    }).join("");
  }

  function renderIntro() {
    var played = quiz.playCount || 0;
    app.innerHTML =
      '<section class="qz-card qz-center">' +
      '<img class="qz-bela" src="/images/bela-quiz.webp" alt="" width="132" height="132" />' +
      "<h1>" + esc(text("introTitle", quiz.ownerName + "-কে তুমি কতটা চেনো? 😏")) + "</h1>" +
      '<p class="qz-muted">' + esc(text("introText", bn(quiz.total) + "টা মজার খাবারের প্রশ্ন। দেখি তুমি আসল দোস্ত, নাকি শুধু ফেসবুক ফ্রেন্ড!")) + "</p>" +
      '<form id="qz-start" autocomplete="off">' +
      '<input class="qz-input" id="qz-name" maxlength="24" placeholder="তোমার নাম লেখো" aria-label="তোমার নাম" required />' +
      '<p class="qz-error" id="qz-err"></p>' +
      '<button class="qz-btn" type="submit">' + esc(text("startButton", "খেলা শুরু করো 🚀")) + "</button>" +
      "</form></section>" +
      '<section class="qz-card"><div class="qz-board-title">🏆 Leaderboard <span>' +
      (played ? bn(played) + " জন খেলেছে" : "") + "</span></div>" +
      boardHtml(state.leaderboard.slice(0, 10), quiz.total) + "</section>";
    var form = document.getElementById("qz-start");
    var input = document.getElementById("qz-name");
    var err = document.getElementById("qz-err");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (state.busy) return;
      var name = input.value.trim();
      if (name.length < 2) { err.textContent = "অন্তত ২ অক্ষরের নাম লেখো।"; return; }
      state.busy = true;
      form.querySelector("button").disabled = true;
      post("start", { name: name }).then(function (data) {
        state.me = data.me;
        state.index = data.me ? data.me.answered : 0;
        state.busy = false;
        if (data.me && data.me.completed) return reloadResult();
        renderQuestion();
      }).catch(function (error) {
        state.busy = false;
        form.querySelector("button").disabled = false;
        err.textContent = error.message;
      });
    });
  }

  function renderQuestion() {
    var question = quiz.questions[state.index];
    if (!question) return reloadResult();
    var pct = Math.round((state.index / quiz.total) * 100);
    app.innerHTML =
      '<section class="qz-card">' +
      '<div class="qz-progress"><div class="qz-bar"><span style="width:' + pct + '%"></span></div>' +
      '<div class="qz-count">' + bn(state.index + 1) + "/" + bn(quiz.total) + "</div></div>" +
      "<h2>" + esc(question.text) + "</h2>" +
      (question.authorName ? '<p class="qz-author">✍️ প্রশ্ন: ' + esc(question.authorName) + "</p>" : "") +
      '<div class="qz-options">' +
      question.options.map(function (option) {
        return '<button class="qz-option" type="button" data-id="' + esc(option.id) + '">' + esc(option.label) + "</button>";
      }).join("") +
      '</div><div class="qz-react" id="qz-react"></div></section>';
    var buttons = app.querySelectorAll(".qz-option");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", onAnswer);
    }
  }

  function onAnswer(event) {
    if (state.busy) return;
    state.busy = true;
    var chosen = event.currentTarget.getAttribute("data-id");
    var buttons = app.querySelectorAll(".qz-option");
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;
    post("answer", { index: state.index, optionId: chosen }).then(function (data) {
      var react = document.getElementById("qz-react");
      for (var j = 0; j < buttons.length; j++) {
        var id = buttons[j].getAttribute("data-id");
        if (id === data.correctOptionId) buttons[j].classList.add("is-correct");
        else if (id === chosen) buttons[j].classList.add("is-wrong");
      }
      if (react) {
        react.className = "qz-react " + (data.correct ? "good" : "bad");
        react.textContent = data.correct ? pick(GOOD) : pick(BAD);
      }
      state.me = data.me;
      setTimeout(function () {
        state.busy = false;
        if (data.result) {
          state.result = data.result;
          return renderResult(true);
        }
        state.index = data.me ? data.me.answered : state.index + 1;
        renderQuestion();
      }, 1100);
    }).catch(function (error) {
      state.busy = false;
      for (var k = 0; k < buttons.length; k++) buttons[k].disabled = false;
      var react = document.getElementById("qz-react");
      if (react) { react.className = "qz-react bad"; react.textContent = error.message; }
    });
  }

  function reloadResult() {
    // Finished on another tab or a double tap: refresh state from the page.
    window.location.reload();
  }

  function confetti() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var box = document.createElement("div");
    box.className = "qz-confetti";
    var colors = ["#FFB84C", "#FF9F2E", "#E5484D", "#16A34A", "#1A1A1A", "#4F8BFF"];
    for (var i = 0; i < 70; i++) {
      var piece = document.createElement("i");
      piece.style.left = Math.random() * 100 + "%";
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = Math.random() * 0.6 + "s";
      piece.style.animationDuration = 1.8 + Math.random() * 1.4 + "s";
      box.appendChild(piece);
    }
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 4200);
  }

  function renderResult(fresh) {
    var result = state.result;
    var shareText = text("resultShareText", quiz.ownerName + "-কে আমি {score}/{total} চিনি! তুমি কতটা চেনো? 😏")
      .replace(/\{score\}/g, bn(result.score))
      .replace(/\{total\}/g, bn(result.total))
      .replace(/\{name\}/g, quiz.ownerName);
    app.innerHTML =
      '<section class="qz-card qz-center">' +
      '<img class="qz-bela" src="/images/bela-quiz.webp" alt="" width="132" height="132" />' +
      '<div class="qz-muted" style="margin:0">' + esc(quiz.ownerName) + "-কে তুমি চেনো</div>" +
      '<div class="qz-score">' + bn(result.score) + "<small>/" + bn(result.total) + "</small></div>" +
      '<div class="qz-title">' + esc(result.titleEmoji + " " + result.title) + "</div>" +
      '<div class="qz-rank">Leaderboard-এ তুমি #' + bn(result.rank) + "</div>" +
      '<a class="qz-btn" href="' + esc(playStoreUrl) + '" data-make-own>' + esc(text("makeOwnButton", "এবার তোমারটা বানাও → বন্ধুদের চ্যালেঞ্জ দাও")) + "</a>" +
      '<button class="qz-btn qz-btn-ghost" type="button" id="qz-share">' + esc(text("shareFriendsButton", "অন্য বন্ধুদেরও খেলাও 📤")) + "</button>" +
      "</section>" +
      '<section class="qz-card"><div class="qz-board-title">🏆 Leaderboard</div>' +
      boardHtml(result.leaderboard || [], result.total) + "</section>";
    bindMakeOwn(app);
    var share = document.getElementById("qz-share");
    share.addEventListener("click", function () {
      var url = window.location.href.split("?")[0];
      var message = shareText;
      if (navigator.share) {
        navigator.share({ title: document.title, text: message, url: url }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(message + " " + url).then(function () { share.textContent = "লিংক কপি হয়েছে ✅"; });
      }
    });
    if (fresh && result.score / Math.max(1, result.total) >= 0.7) confetti();
  }

  if (state.result) renderResult(false);
  else if (state.me && !state.me.completed) renderQuestion();
  else renderIntro();
})();
