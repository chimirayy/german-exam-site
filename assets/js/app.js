/* ==========================================================================
   telc-style Übungsprüfung — exam engine
   Reads a level's question set from /data/<level>.json and renders a
   timed, section-by-section exam with a locked answer sheet at the end.

   To update questions later: edit the JSON file only. Nothing in this
   file needs to change unless you add a brand-new QUESTION TYPE.
   See /docs/data-format.md for the schema.
   ========================================================================== */

(function () {
  "use strict";

  const cfg = window.EXAM_CONFIG;
  if (!cfg) { console.error("EXAM_CONFIG missing on this page."); return; }

  const STORAGE_KEY = `telc-exam-state-${cfg.level}`;
  const root = document.getElementById("exam-root");

  let DATA = null;
  let state = loadState();
  let tickHandle = null;

  // ---------------------------------------------------------------------
  // State persistence
  // ---------------------------------------------------------------------

  function defaultState() {
    return {
      started: false,
      currentSectionIndex: 0,
      sectionMeta: {},      // { [sectionId]: { startedAt, spentSeconds, submitted } }
      answers: {},          // { [partId]: { [qId]: value } }
      writing: {},           // { [partId]: text }
      finished: false,
      finishedAt: null,
      unlocked: false
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed);
    } catch (e) {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------

  fetch(cfg.dataUrl)
    .then((r) => {
      if (!r.ok) throw new Error("Datendatei nicht gefunden: " + cfg.dataUrl);
      return r.json();
    })
    .then((json) => {
      DATA = json;
      render();
    })
    .catch((err) => {
      root.innerHTML = `<div class="card"><p><strong>Fehler beim Laden der Prüfung.</strong></p>
        <p>${escapeHtml(err.message)}</p>
        <p>Prüfen Sie, ob die Datei <code>${escapeHtml(cfg.dataUrl)}</code> existiert und gültiges JSON enthält.</p></div>`;
    });

  // ---------------------------------------------------------------------
  // Top-level render dispatcher
  // ---------------------------------------------------------------------

  function render() {
    clearInterval(tickHandle);
    if (!state.started) return renderStart();
    if (state.finished) return renderFinished();
    return renderSection();
  }

  // ---------------------------------------------------------------------
  // Start screen
  // ---------------------------------------------------------------------

  function renderStart() {
    const totalMinutes = DATA.sections.reduce((s, sec) => s + sec.timeMinutes, 0);
    root.innerHTML = `
      <div class="start-screen">
        <span class="badge">${DATA.levelName}</span>
        <h1 style="margin-top:10px">Übungsprüfung starten</h1>
        <p class="prose" style="margin:0 auto 22px;color:var(--ink-soft)">${DATA.introduction}</p>
        <div class="card">
          <h3>Ablauf der Prüfung</h3>
          <ul class="timeline">
            ${DATA.sections.map(sec => `
              <li><span class="t-name">${sec.title}</span><span class="t-time">${sec.timeMinutes} Min.</span></li>
            `).join("")}
          </ul>
          <ul class="timeline" style="margin-top:14px;border-top:1px solid var(--rule);padding-top:10px">
            <li><span class="t-name">Gesamtdauer</span><span class="t-time">${totalMinutes} Min.</span></li>
          </ul>
        </div>
        <div class="card" style="margin-top:16px">
          <h3>Hinweise</h3>
          <ul style="color:var(--ink-soft);font-size:.92rem;margin:0 0 0 1.1em">
            <li>Jeder Teil ist einzeln zeitlich begrenzt. Die Zeit läuft weiter, auch wenn Sie die Seite neu laden.</li>
            <li>Ist ein Teil abgegeben, können Sie nicht mehr dorthin zurückkehren — wie in der echten Prüfung.</li>
            <li>Die Lösungen werden erst freigeschaltet, nachdem Sie alle Teile abgeschlossen haben.</li>
            <li>Beim Hörverstehen: Ist keine Audiodatei hinterlegt, können Sie das Transkript einblenden.</li>
          </ul>
        </div>
        <button class="btn" style="margin-top:24px" id="btn-start">Prüfung beginnen</button>
      </div>
    `;
    document.getElementById("btn-start").addEventListener("click", () => {
      state.started = true;
      startSectionTimer(DATA.sections[0].id);
      saveState();
      render();
    });
  }

  // ---------------------------------------------------------------------
  // Section runner
  // ---------------------------------------------------------------------

  function startSectionTimer(sectionId) {
    if (!state.sectionMeta[sectionId]) {
      state.sectionMeta[sectionId] = { startedAt: Date.now(), spentSeconds: 0, submitted: false };
    } else if (!state.sectionMeta[sectionId].submitted && !state.sectionMeta[sectionId].startedAt) {
      state.sectionMeta[sectionId].startedAt = Date.now();
    }
  }

  function remainingSeconds(section) {
    const meta = state.sectionMeta[section.id];
    if (!meta) return section.timeMinutes * 60;
    const elapsed = Math.floor((Date.now() - meta.startedAt) / 1000);
    return Math.max(0, section.timeMinutes * 60 - elapsed);
  }

  function renderSection() {
    const section = DATA.sections[state.currentSectionIndex];
    startSectionTimer(section.id);
    saveState();

    const stepsHtml = DATA.sections.map((sec, i) => {
      const cls = i < state.currentSectionIndex ? "done" : (i === state.currentSectionIndex ? "current" : "");
      return `<span class="step-pill ${cls}">${sec.title}</span>`;
    }).join("");

    root.innerHTML = `
      <div class="exam-bar">
        <div class="exam-bar-inner">
          <div class="section-name"><span class="lvl">${DATA.level}</span> · ${section.title}</div>
          <div class="timer" id="timer">--:--</div>
        </div>
        <div class="progress-track"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
      </div>
      <div class="step-rail">${stepsHtml}</div>
      <div class="page">
        <div class="section-head">
          <p class="eyebrow-time">Zeit für diesen Teil: ${section.timeMinutes} Minuten</p>
        </div>
        <div class="instructions">${escapeHtml(section.instructions)}</div>
        <div id="parts-container"></div>
      </div>
      <div class="action-bar">
        <div class="action-bar-inner">
          <span class="answered-count" id="answered-count"></span>
          <button class="btn" id="btn-next">${isLastSection(section) ? "Prüfung abschließen" : "Teil abgeben & weiter"}</button>
        </div>
      </div>
    `;

    const container = document.getElementById("parts-container");
    section.parts.forEach((part) => container.appendChild(renderPart(section, part)));

    updateAnsweredCount(section);

    document.getElementById("btn-next").addEventListener("click", () => confirmAdvance(section));

    tick(section);
    tickHandle = setInterval(() => tick(section), 1000);
  }

  function isLastSection(section) {
    return DATA.sections[DATA.sections.length - 1].id === section.id;
  }

  function tick(section) {
    const remaining = remainingSeconds(section);
    const timerEl = document.getElementById("timer");
    const fillEl = document.getElementById("progress-fill");
    if (!timerEl) return;
    const mm = Math.floor(remaining / 60).toString().padStart(2, "0");
    const ss = Math.floor(remaining % 60).toString().padStart(2, "0");
    timerEl.textContent = `${mm}:${ss}`;
    timerEl.classList.toggle("low", remaining <= 60);
    const pct = 100 - Math.round((remaining / (section.timeMinutes * 60)) * 100);
    if (fillEl) fillEl.style.width = pct + "%";
    if (remaining <= 0) {
      clearInterval(tickHandle);
      advanceSection(section, true);
    }
  }

  function confirmAdvance(section) {
    const last = isLastSection(section);
    const msg = last
      ? "Möchten Sie die Prüfung jetzt abschließen? Sie können danach nichts mehr ändern."
      : `Möchten Sie „${section.title}“ abgeben? Sie können zu diesem Teil nicht zurückkehren.`;
    if (window.confirm(msg)) advanceSection(section, false);
  }

  function advanceSection(section, timedOut) {
    const meta = state.sectionMeta[section.id];
    if (meta && !meta.submitted) {
      meta.spentSeconds = section.timeMinutes * 60 - remainingSeconds(section);
      meta.submitted = true;
      meta.timedOut = timedOut;
    }
    if (isLastSection(section)) {
      state.finished = true;
      state.finishedAt = Date.now();
    } else {
      state.currentSectionIndex += 1;
    }
    saveState();
    render();
  }

  function updateAnsweredCount(section) {
    let total = 0, answered = 0;
    section.parts.forEach((part) => {
      const ids = questionIdsForPart(part);
      total += ids.length;
      const stored = state.answers[part.id] || {};
      ids.forEach((id) => { if (stored[id] !== undefined && stored[id] !== null && stored[id] !== "") answered++; });
    });
    const el = document.getElementById("answered-count");
    if (el) el.textContent = `${answered} / ${total} Fragen beantwortet`;
  }

  function questionIdsForPart(part) {
    switch (part.type) {
      case "true_false": return part.questions.map(q => q.id);
      case "multiple_choice": return part.questions.map(q => q.id);
      case "matching": return part.items.map(i => i.id);
      case "matching_ads": return part.scenarios.map(s => s.id);
      case "speaker_matching": return part.speakers;
      case "cloze_mc": return part.blanks.map(b => b.id);
      case "cloze_wordbank": return part.blanks.map(b => b.id);
      case "writing": return [part.id];
      default: return [];
    }
  }

  // ---------------------------------------------------------------------
  // Part renderers
  // ---------------------------------------------------------------------

  function renderPart(section, part) {
    const wrap = document.createElement("div");
    wrap.className = "part";
    wrap.id = "part-" + part.id;

    const header = document.createElement("div");
    header.innerHTML = `<h3>${escapeHtml(part.title)}</h3><p class="part-instructions">${escapeHtml(part.instructions)}</p>`;
    wrap.appendChild(header);

    if (!state.answers[part.id]) state.answers[part.id] = {};

    switch (part.type) {
      case "true_false": renderTrueFalse(wrap, section, part); break;
      case "multiple_choice": renderMultipleChoice(wrap, section, part); break;
      case "matching": renderMatching(wrap, section, part); break;
      case "matching_ads": renderMatchingAds(wrap, section, part); break;
      case "speaker_matching": renderSpeakerMatching(wrap, section, part); break;
      case "cloze_mc": renderClozeMc(wrap, section, part); break;
      case "cloze_wordbank": renderClozeWordbank(wrap, section, part); break;
      case "writing": renderWriting(wrap, section, part); break;
      default: wrap.innerHTML += `<p>Unbekannter Aufgabentyp: ${part.type}</p>`;
    }
    return wrap;
  }

  function audioBlock(wrap, part) {
    if (!part.audio && !part.transcript) return;
    const block = document.createElement("div");
    block.className = "audio-block";
    const audioTag = part.audio
      ? `<audio controls preload="none" src="${escapeAttr(resolveAudioPath(part.audio))}"></audio>`
      : `<span class="audio-missing">Kein Audio hinterlegt — bitte Transkript nutzen.</span>`;
    block.innerHTML = `${audioTag}
      ${part.transcript ? `<button class="transcript-toggle" type="button">Transkript anzeigen</button>` : ""}`;
    wrap.appendChild(block);
    if (part.transcript) {
      const tbox = document.createElement("div");
      tbox.className = "transcript-box";
      tbox.textContent = part.transcript;
      wrap.appendChild(tbox);
      block.querySelector(".transcript-toggle").addEventListener("click", () => {
        tbox.classList.toggle("open");
      });
    }
  }

  function resolveAudioPath(p) {
    // audio paths in JSON are relative to the site root ("audio/...");
    // pages live in /pages/, so prefix with ../
    return cfg.assetPrefix ? cfg.assetPrefix + p : "../" + p;
  }

  function renderTrueFalse(wrap, section, part) {
    if (part.text) {
      const t = document.createElement("p");
      t.className = "reading-text";
      t.textContent = part.text;
      wrap.appendChild(t);
    }
    audioBlock(wrap, part);
    const list = document.createElement("div");
    part.questions.forEach((q) => {
      const row = document.createElement("div");
      row.className = "q-item";
      row.innerHTML = `<div><span class="q-num">${q.id}</span><span class="q-statement">${escapeHtml(q.statement)}</span></div>
        <div class="tf-choices">
          <button class="choice-btn" data-val="true" type="button">Richtig</button>
          <button class="choice-btn" data-val="false" type="button">Falsch</button>
        </div>`;
      const stored = state.answers[part.id][q.id];
      row.querySelectorAll(".choice-btn").forEach((btn) => {
        if (stored !== undefined && String(stored) === btn.dataset.val) btn.classList.add("selected");
        btn.addEventListener("click", () => {
          state.answers[part.id][q.id] = btn.dataset.val === "true";
          row.querySelectorAll(".choice-btn").forEach(b => b.classList.remove("selected"));
          btn.classList.add("selected");
          saveState();
          updateAnsweredCount(section);
        });
      });
      list.appendChild(row);
    });
    wrap.appendChild(list);
  }

  function renderMultipleChoice(wrap, section, part) {
    audioBlock(wrap, part);
    part.questions.forEach((q) => {
      const row = document.createElement("div");
      row.className = "q-item";
      const optsHtml = q.options.map((opt, idx) => `
        <label class="mc-option" data-idx="${idx}">
          <input type="radio" name="${part.id}-${q.id}" value="${idx}" ${state.answers[part.id][q.id] === idx ? "checked" : ""}>
          <span>${escapeHtml(opt)}</span>
        </label>`).join("");
      row.innerHTML = `<div><span class="q-num">${q.id}</span><span class="q-statement">${escapeHtml(q.question)}</span></div>
        <div class="mc-options">${optsHtml}</div>`;
      list_bindMc(row, part, q, section);
      wrap.appendChild(row);
    });
  }

  function list_bindMc(row, part, q, section) {
    row.querySelectorAll(".mc-option").forEach((label) => {
      const idx = Number(label.dataset.idx);
      if (state.answers[part.id][q.id] === idx) label.classList.add("selected");
      label.addEventListener("click", () => {
        state.answers[part.id][q.id] = idx;
        row.querySelectorAll(".mc-option").forEach(l => l.classList.remove("selected"));
        label.classList.add("selected");
        saveState();
        updateAnsweredCount(section);
      });
    });
  }

  function optionsLegend(options) {
    const div = document.createElement("div");
    div.className = "options-legend";
    div.innerHTML = options.map(o => `<strong>${o.key}</strong> ${escapeHtml(o.text)}`).join(" &nbsp;·&nbsp; ");
    return div;
  }

  function renderMatching(wrap, section, part) {
    wrap.appendChild(optionsLegend(part.options));
    part.items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "match-row";
      row.innerHTML = `<div><span class="q-num">${item.id}</span>${escapeHtml(item.text)}</div>
        <select class="match-select" data-q="${item.id}">
          <option value="">— wählen —</option>
          ${part.options.map(o => `<option value="${o.key}" ${state.answers[part.id][item.id] === o.key ? "selected" : ""}>${o.key}</option>`).join("")}
        </select>`;
      row.querySelector("select").addEventListener("change", (e) => {
        state.answers[part.id][item.id] = e.target.value;
        saveState();
        updateAnsweredCount(section);
      });
      wrap.appendChild(row);
    });
  }

  function renderMatchingAds(wrap, section, part) {
    wrap.appendChild(optionsLegend(part.ads));
    part.scenarios.forEach((sc) => {
      const row = document.createElement("div");
      row.className = "match-row";
      row.innerHTML = `<div><span class="q-num">${sc.id}</span>${escapeHtml(sc.text)}</div>
        <select class="match-select" data-q="${sc.id}">
          <option value="">— wählen —</option>
          ${part.ads.map(o => `<option value="${o.key}" ${state.answers[part.id][sc.id] === o.key ? "selected" : ""}>${o.key}</option>`).join("")}
        </select>`;
      row.querySelector("select").addEventListener("change", (e) => {
        state.answers[part.id][sc.id] = e.target.value;
        saveState();
        updateAnsweredCount(section);
      });
      wrap.appendChild(row);
    });
  }

  function renderSpeakerMatching(wrap, section, part) {
    audioBlock(wrap, part);
    wrap.appendChild(optionsLegend(part.options));
    part.speakers.forEach((sid, i) => {
      const row = document.createElement("div");
      row.className = "match-row";
      row.innerHTML = `<div><span class="q-num">${sid}</span>Person ${i + 1}</div>
        <select class="match-select" data-q="${sid}">
          <option value="">— wählen —</option>
          ${part.options.map(o => `<option value="${o.key}" ${state.answers[part.id][sid] === o.key ? "selected" : ""}>${o.key}</option>`).join("")}
        </select>`;
      row.querySelector("select").addEventListener("change", (e) => {
        state.answers[part.id][sid] = e.target.value;
        saveState();
        updateAnsweredCount(section);
      });
      wrap.appendChild(row);
    });
  }

  function renderClozeMc(wrap, section, part) {
    const p = document.createElement("p");
    p.className = "cloze-text";
    let html = escapeHtml(part.textBefore || "");
    part.blanks.forEach((b) => {
      html += escapeHtml(b.before || "");
      const sel = state.answers[part.id][b.id];
      html += `<select class="cloze-blank-select" data-part="${part.id}" data-blank="${b.id}">
        <option value="">${b.id}</option>
        ${b.options.map((opt, idx) => `<option value="${idx}" ${sel === idx ? "selected" : ""}>${String.fromCharCode(97 + idx)}) ${escapeHtml(opt)}</option>`).join("")}
      </select>`;
      html += escapeHtml(b.after || "");
    });
    html += escapeHtml(part.textAfter || "");
    p.innerHTML = html;
    wrap.appendChild(p);
    p.querySelectorAll("select").forEach((sel) => {
      sel.addEventListener("change", (e) => {
        state.answers[part.id][e.target.dataset.blank] = e.target.value === "" ? undefined : Number(e.target.value);
        saveState();
        updateAnsweredCount(section);
      });
    });
  }

  function renderClozeWordbank(wrap, section, part) {
    const bank = document.createElement("div");
    bank.className = "wordbank";
    bank.innerHTML = part.wordbank.map(w => `<span>${escapeHtml(w)}</span>`).join("");
    wrap.appendChild(bank);

    const p = document.createElement("p");
    p.className = "cloze-text";
    let html = escapeHtml(part.textBefore || "");
    part.blanks.forEach((b) => {
      html += escapeHtml(b.before || "");
      const sel = state.answers[part.id][b.id];
      html += `<select class="cloze-blank-select" data-part="${part.id}" data-blank="${b.id}">
        <option value="">${b.id}</option>
        ${part.wordbank.map(w => `<option value="${w}" ${sel === w ? "selected" : ""}>${escapeHtml(w)}</option>`).join("")}
      </select>`;
      html += escapeHtml(b.after || "");
    });
    p.innerHTML = html;
    wrap.appendChild(p);
    p.querySelectorAll("select").forEach((sel) => {
      sel.addEventListener("change", (e) => {
        state.answers[part.id][e.target.dataset.blank] = e.target.value === "" ? undefined : e.target.value;
        saveState();
        updateAnsweredCount(section);
      });
    });
  }

  function renderWriting(wrap, section, part) {
    const promptEl = document.createElement("p");
    promptEl.className = "writing-prompt";
    promptEl.textContent = part.prompt;
    wrap.appendChild(promptEl);

    const pts = document.createElement("ul");
    pts.className = "writing-points";
    pts.innerHTML = part.points.map(pt => `<li>${escapeHtml(pt)}</li>`).join("");
    wrap.appendChild(pts);

    const ta = document.createElement("textarea");
    ta.className = "writing-area";
    ta.placeholder = `Mindestens ca. ${part.minWords} Wörter …`;
    ta.value = state.writing[part.id] || "";
    wrap.appendChild(ta);

    const wc = document.createElement("div");
    wc.className = "wordcount";
    wrap.appendChild(wc);

    function updateWc() {
      const words = ta.value.trim().length ? ta.value.trim().split(/\s+/).length : 0;
      wc.textContent = `${words} Wörter (Ziel: ca. ${part.minWords}+)`;
      wc.classList.toggle("ok", words >= part.minWords);
      state.answers[part.id][part.id] = words > 0 ? "written" : "";
    }
    updateWc();

    ta.addEventListener("input", () => {
      state.writing[part.id] = ta.value;
      updateWc();
      saveState();
      updateAnsweredCount(section);
    });
  }

  // ---------------------------------------------------------------------
  // Finished / locked results screen
  // ---------------------------------------------------------------------

  function renderFinished() {
    if (!state.unlocked) {
      root.innerHTML = `
        <div class="result-screen">
          <div class="lock-icon">🔒</div>
          <h1>Prüfung abgeschlossen</h1>
          <p style="color:var(--ink-soft)">Alle Teile wurden abgegeben. Der Auswertungsbogen ist jetzt verfügbar.</p>
          <div class="card">
            <h3>Bearbeitungszeit je Teil</h3>
            <ul class="timeline">
              ${DATA.sections.map(sec => {
                const meta = state.sectionMeta[sec.id] || {};
                const spent = meta.spentSeconds || 0;
                return `<li><span class="t-name">${sec.title}${meta.timedOut ? " (Zeit abgelaufen)" : ""}</span><span class="t-time">${formatMs(spent)} / ${sec.timeMinutes}:00</span></li>`;
              }).join("")}
            </ul>
          </div>
          <button class="btn" id="btn-unlock" style="margin-top:22px">Auswertung freischalten</button>
          <div style="margin-top:14px">
            <button class="btn ghost" id="btn-restart">Neuen Versuch starten</button>
          </div>
        </div>`;
      document.getElementById("btn-unlock").addEventListener("click", () => {
        state.unlocked = true;
        saveState();
        render();
      });
      document.getElementById("btn-restart").addEventListener("click", restart);
      return;
    }
    renderAnswerSheet();
  }

  function formatMs(seconds) {
    const mm = Math.floor(seconds / 60).toString().padStart(2, "0");
    const ss = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function restart() {
    if (!window.confirm("Neuen Versuch starten? Ihre aktuellen Antworten werden gelöscht.")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    render();
  }

  // ---------------------------------------------------------------------
  // Answer sheet + scoring
  // ---------------------------------------------------------------------

  function renderAnswerSheet() {
    let totalQ = 0, totalCorrect = 0;
    const sectionScores = [];

    DATA.sections.forEach((sec) => {
      let secQ = 0, secCorrect = 0;
      sec.parts.forEach((part) => {
        const r = scorePart(part);
        secQ += r.total;
        secCorrect += r.correct;
      });
      totalQ += secQ;
      totalCorrect += secCorrect;
      sectionScores.push({ sec, secQ, secCorrect });
    });

    const pct = totalQ ? Math.round((totalCorrect / totalQ) * 100) : 0;

    root.innerHTML = `
      <div class="page">
        <span class="badge">${DATA.levelName} · Auswertungsbogen</span>
        <h1 style="margin-top:10px">Auswertung</h1>
        <div class="score-summary">
          <div class="score-box"><div class="num">${totalCorrect}/${totalQ}</div><div class="lbl">Richtige Antworten (auswertbar)</div></div>
          <div class="score-box"><div class="num">${pct}%</div><div class="lbl">Gesamtergebnis</div></div>
          <div class="score-box"><div class="num">${formatMs(totalTimeSpent())}</div><div class="lbl">Gesamtbearbeitungszeit</div></div>
        </div>
        <div class="card">
          <h3>Ergebnis je Teil</h3>
          <ul class="timeline">
            ${sectionScores.map(s => `<li><span class="t-name">${s.sec.title}</span><span class="t-time">${s.secCorrect}/${s.secQ} · ${formatMs((state.sectionMeta[s.sec.id]||{}).spentSeconds||0)}</span></li>`).join("")}
          </ul>
        </div>
        <div id="answer-sections" style="margin-top:30px"></div>
        <div style="margin-top:30px;display:flex;gap:12px;flex-wrap:wrap">
          <button class="btn ghost" id="btn-restart2">Neuen Versuch starten</button>
        </div>
      </div>
    `;

    const container = document.getElementById("answer-sections");
    DATA.sections.forEach((sec) => {
      const secBlock = document.createElement("div");
      secBlock.innerHTML = `<h2 style="margin-top:26px">${sec.title}</h2>`;
      sec.parts.forEach((part) => secBlock.appendChild(renderPartAnswers(part)));
      container.appendChild(secBlock);
    });

    document.getElementById("btn-restart2").addEventListener("click", restart);
  }

  function totalTimeSpent() {
    return Object.values(state.sectionMeta).reduce((s, m) => s + (m.spentSeconds || 0), 0);
  }

  function scorePart(part) {
    const stored = state.answers[part.id] || {};
    let total = 0, correct = 0;
    switch (part.type) {
      case "true_false":
        part.questions.forEach((q) => { total++; if (stored[q.id] === q.answer) correct++; });
        break;
      case "multiple_choice":
        part.questions.forEach((q) => { total++; if (stored[q.id] === q.answer) correct++; });
        break;
      case "matching":
        part.items.forEach((i) => { total++; if (stored[i.id] === part.answer[i.id]) correct++; });
        break;
      case "matching_ads":
        part.scenarios.forEach((s) => { total++; if (stored[s.id] === part.answer[s.id]) correct++; });
        break;
      case "speaker_matching":
        part.speakers.forEach((sid) => { total++; if (stored[sid] === part.answer[sid]) correct++; });
        break;
      case "cloze_mc":
        part.blanks.forEach((b) => { total++; if (stored[b.id] === b.answer) correct++; });
        break;
      case "cloze_wordbank":
        part.blanks.forEach((b) => { total++; if (stored[b.id] === b.answer) correct++; });
        break;
      case "writing":
        break; // not auto-graded
      default: break;
    }
    return { total, correct };
  }

  function renderPartAnswers(part) {
    const wrap = document.createElement("div");
    wrap.className = "part";
    const stored = state.answers[part.id] || {};
    let bodyHtml = `<h3>${escapeHtml(part.title)}</h3>`;

    if (part.type === "writing") {
      const text = state.writing[part.id] || "";
      const words = text.trim().length ? text.trim().split(/\s+/).length : 0;
      bodyHtml += `<p class="part-instructions">Freier Text — nicht automatisch bewertbar. Vergleichen Sie mit dem Musterlösungsvorschlag.</p>
        <p><strong>Ihr Text</strong> (${words} Wörter):</p>
        <div class="model-answer">${escapeHtml(text || "— kein Text eingegeben —")}</div>
        <p style="margin-top:14px"><strong>Musterlösung</strong></p>
        <div class="model-answer">${escapeHtml(part.modelAnswer)}</div>`;
      wrap.innerHTML = bodyHtml;
      return wrap;
    }

    const rows = [];
    if (part.type === "true_false") {
      part.questions.forEach((q) => {
        const ok = stored[q.id] === q.answer;
        rows.push(answerRow(ok, q.id, q.statement, fmtBool(stored[q.id]), fmtBool(q.answer)));
      });
    } else if (part.type === "multiple_choice") {
      part.questions.forEach((q) => {
        const ok = stored[q.id] === q.answer;
        rows.push(answerRow(ok, q.id, q.question, optLabel(q.options, stored[q.id]), optLabel(q.options, q.answer)));
      });
    } else if (part.type === "matching") {
      part.items.forEach((i) => {
        const ok = stored[i.id] === part.answer[i.id];
        rows.push(answerRow(ok, i.id, i.text, stored[i.id] || "–", part.answer[i.id]));
      });
    } else if (part.type === "matching_ads") {
      part.scenarios.forEach((s) => {
        const ok = stored[s.id] === part.answer[s.id];
        rows.push(answerRow(ok, s.id, s.text, stored[s.id] || "–", part.answer[s.id]));
      });
    } else if (part.type === "speaker_matching") {
      part.speakers.forEach((sid, idx) => {
        const ok = stored[sid] === part.answer[sid];
        rows.push(answerRow(ok, sid, "Person " + (idx + 1), stored[sid] || "–", part.answer[sid]));
      });
    } else if (part.type === "cloze_mc") {
      part.blanks.forEach((b) => {
        const ok = stored[b.id] === b.answer;
        rows.push(answerRow(ok, b.id, "Lücke " + b.id, optLabel(b.options, stored[b.id]), optLabel(b.options, b.answer)));
      });
    } else if (part.type === "cloze_wordbank") {
      part.blanks.forEach((b) => {
        const ok = stored[b.id] === b.answer;
        rows.push(answerRow(ok, b.id, "Lücke " + b.id, stored[b.id] || "–", b.answer));
      });
    }

    wrap.innerHTML = bodyHtml + rows.join("");
    return wrap;
  }

  function fmtBool(v) {
    if (v === true) return "Richtig";
    if (v === false) return "Falsch";
    return "–";
  }
  function optLabel(options, idx) {
    if (idx === undefined || idx === null || idx === "" || !options[idx]) return "–";
    return options[idx];
  }

  function answerRow(ok, num, label, yours, correctAns) {
    return `<div class="answer-row">
      <span class="mark ${ok ? "correct" : "incorrect"}">${ok ? "✓" : "✗"}</span>
      <div class="answer-detail">
        <div><strong>${num}.</strong> ${escapeHtml(String(label))}</div>
        <div class="yours">Ihre Antwort: ${escapeHtml(String(yours))}</div>
        ${ok ? "" : `<div class="correct-answer">Richtige Antwort: ${escapeHtml(String(correctAns))}</div>`}
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------

  function escapeHtml(str) {
    if (str === undefined || str === null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escapeAttr(str) { return escapeHtml(str).replace(/"/g, "&quot;"); }

  window.addEventListener("beforeunload", (e) => {
    if (state.started && !state.finished) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
})();
