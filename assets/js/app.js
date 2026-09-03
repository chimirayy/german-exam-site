(function () {
  "use strict";

  const cfg = window.EXAM_CONFIG;
  const root = document.getElementById("exam-root");
  if (!cfg || !root) return;

  const STORAGE_KEY = `telc-b1-task-${cfg.level}-${cfg.practiceId}`;
  let DATA = null;
  let state = loadState();
  let tickHandle = null;

  function defaultState() {
    return {
      started: false,
      currentTaskIndex: 0,
      reviewingTaskIndex: null,
      taskMeta: {},
      answers: {},
      writing: {},
      finished: false,
      unlocked: false
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const p = JSON.parse(raw);
      const d = defaultState();
      return {
        ...d,
        ...p,
        taskMeta: p.taskMeta || {},
        answers: p.answers || {},
        writing: p.writing || {}
      };
    } catch (_) { return defaultState(); }
  }

  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  function taskMinutes() {
    if (cfg.practiceId === "hoeren") return 5;
    const title = (DATA?.sections?.[0]?.title || "").toLowerCase();
    if (title.includes("schreiben") || title.includes("schriftlicher")) return 30;
    return 15;
  }

  fetch(cfg.dataUrl)
    .then(r => { if (!r.ok) throw new Error("Datendatei nicht gefunden: " + cfg.dataUrl); return r.json(); })
    .then(json => {
      if (!json || !Array.isArray(json.sections) || !json.sections[0]?.parts?.length) {
        throw new Error("Die Prüfungsdatei enthält keine gültigen Aufgaben.");
      }
      DATA = json;
      normalizeState();
      render();
    })
    .catch(err => {
      root.innerHTML = `<div class="page"><div class="card error-card"><strong>Fehler beim Laden der Prüfung.</strong><p>${escapeHtml(err.message)}</p><p>Prüfen Sie, ob die Datei <code>${escapeHtml(cfg.dataUrl)}</code> existiert und gültiges JSON enthält.</p></div></div>`;
    });

  function normalizeState() {
    const count = DATA.sections[0].parts.length;
    if (!Number.isInteger(state.currentTaskIndex) || state.currentTaskIndex < 0 || state.currentTaskIndex >= count) state.currentTaskIndex = 0;
    // Migrate old single-section state by discarding incompatible timer metadata.
    if (state.sectionMeta && !state.taskMeta) state.taskMeta = {};
    saveState();
  }

  function tasks() { return DATA.sections[0].parts; }
  function currentTask() { return tasks()[state.currentTaskIndex]; }
  function metaFor(part) {
    if (!state.taskMeta[part.id]) state.taskMeta[part.id] = { startedAt: null, spentSeconds: 0, submitted: false, timedOut: false, plays: 0 };
    if (state.taskMeta[part.id].plays === undefined) state.taskMeta[part.id].plays = 0;
    return state.taskMeta[part.id];
  }

  function render() {
    clearInterval(tickHandle);
    normalizeState();
    if (!state.started) return renderStart();
    if (state.finished) return renderFinished();
    if (state.reviewingTaskIndex !== null && state.reviewingTaskIndex !== undefined) return renderTaskReview(state.reviewingTaskIndex);
    return renderTask();
  }

  function renderStart() {
    const mins = taskMinutes();
    const total = tasks().length;
    const category = DATA.sections[0].title;
    root.innerHTML = `
      <main class="page intro-page">
        <div class="intro-kicker">${escapeHtml(DATA.levelName)} · B1</div>
        <h1>${escapeHtml(category)}</h1>
        <p class="intro-lead">${total} Aufgaben · ${mins} Minuten pro Aufgabe</p>
        <div class="intro-meta"><span>${total} Einzelaufgaben</span><span>⏱ ${mins}:00 je Aufgabe</span><span>Automatische Abgabe bei 0:00</span></div>
        <button class="btn intro-start" id="btn-start">Training beginnen</button>
        <a class="back-link" href="../index.html">← Zur Übersicht</a>
      </main>`;
    document.getElementById("btn-start").addEventListener("click", () => {
      state.started = true;
      startTaskTimer(currentTask());
      saveState();
      render();
    });
  }

  function startTaskTimer(part) {
    const meta = metaFor(part);
    if (!meta.startedAt && !meta.submitted) meta.startedAt = Date.now();
  }

  function remainingSeconds(part) {
    const meta = metaFor(part);
    if (meta.submitted) return 0;
    if (!meta.startedAt) return taskMinutes() * 60;
    return Math.max(0, taskMinutes() * 60 - Math.floor((Date.now() - meta.startedAt) / 1000));
  }

  function renderTask() {
    const part = currentTask();
    startTaskTimer(part);
    saveState();
    const mins = taskMinutes();
    const n = tasks().length;
    const tabs = tasks().map((p, i) => {
      const m = metaFor(p);
      const cls = i === state.currentTaskIndex ? "active" : (m.submitted ? "done" : "");
      return `<button class="task-tab ${cls}" data-task-index="${i}" type="button"><span>${i + 1}</span>${m.timedOut ? "<b>!</b>" : ""}</button>`;
    }).join("");

    root.innerHTML = `
      <div class="exam-bar">
        <div class="exam-bar-inner">
          <div class="section-name"><span class="lvl">B1</span> · ${escapeHtml(DATA.sections[0].title)}</div>
          <div class="task-counter">Aufgabe ${state.currentTaskIndex + 1} / ${n}</div>
          <div class="timer" id="timer">--:--</div>
        </div>
        <div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>
      </div>
      <nav class="task-tabs" aria-label="Aufgabennavigation">${tabs}</nav>
      <main class="page task-page task-${state.currentTaskIndex % 2 === 0 ? "even" : "odd"}">
        <div class="task-head">
          <div><span class="task-label">${part.categoryLabel ? escapeHtml(part.categoryLabel) : "Aufgabe " + (state.currentTaskIndex + 1)}</span><h1>${escapeHtml(part.title)}</h1></div>
          <span class="task-time-note">${mins} Min. für diese Aufgabe</span>
        </div>
        <div class="instructions">${escapeHtml(part.instructions || "Bearbeiten Sie die Aufgabe.")}</div>
        <div id="task-container"></div>
      </main>
      <div class="action-bar"><div class="action-bar-inner">
        <span class="answered-count" id="answered-count"></span>
        <button class="btn" id="btn-next">${state.currentTaskIndex === n - 1 ? "Aufgabe abgeben & Auswertung" : "Einreichen & Überprüfen →"}</button>
      </div></div>`;

    document.getElementById("task-container").appendChild(renderPart(part));
    updateAnsweredCount(part);
    if (metaFor(part).submitted) {
      document.querySelectorAll("#task-container input, #task-container select, #task-container textarea, #task-container button").forEach(el => el.disabled = true);
    }
    document.querySelectorAll(".task-tab").forEach(btn => btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.taskIndex);
      if (idx === state.currentTaskIndex && !metaFor(tasks()[idx]).submitted) return;
      switchTask(idx);
    }));
    document.getElementById("btn-next").addEventListener("click", () => advanceTask(part, false));
    tick(part);
    tickHandle = setInterval(() => tick(part), 250);
  }

  function switchTask(idx) {
    const target = tasks()[idx];
    if (!target) return;
    state.currentTaskIndex = idx;
    state.reviewingTaskIndex = metaFor(target).submitted ? idx : null;
    if (!metaFor(target).submitted) startTaskTimer(target);
    saveState();
    render();
  }

  function tick(part) {
    const remaining = remainingSeconds(part);
    const el = document.getElementById("timer");
    const fill = document.getElementById("progress-fill");
    if (!el) return;
    const mm = Math.floor(remaining / 60).toString().padStart(2, "0");
    const ss = Math.floor(remaining % 60).toString().padStart(2, "0");
    el.textContent = `${mm}:${ss}`;
    el.classList.toggle("low", remaining <= 60);
    if (fill) fill.style.width = `${100 - Math.round((remaining / (taskMinutes() * 60)) * 100)}%`;
    if (remaining <= 0) {
      clearInterval(tickHandle);
      advanceTask(part, true);
    }
  }

  function advanceTask(part, timedOut) {
    const meta = metaFor(part);
    if (meta.submitted) return;
    meta.spentSeconds = taskMinutes() * 60 - remainingSeconds(part);
    meta.submitted = true;
    meta.timedOut = !!timedOut;
    state.reviewingTaskIndex = state.currentTaskIndex;
    saveState();
    render();
  }

  function continueAfterReview() {
    const idx = state.reviewingTaskIndex;
    if (idx === null || idx === undefined) return;
    if (idx >= tasks().length - 1) {
      state.reviewingTaskIndex = null;
      state.finished = true;
    } else {
      state.currentTaskIndex = idx + 1;
      state.reviewingTaskIndex = null;
      startTaskTimer(tasks()[state.currentTaskIndex]);
    }
    saveState();
    render();
  }

  function renderTaskReview(idx) {
    const part = tasks()[idx];
    const score = scorePart(part);
    const meta = metaFor(part);
    root.innerHTML = `
      <div class="exam-bar review-bar">
        <div class="exam-bar-inner">
          <div class="section-name"><span class="lvl">B1</span> · ${escapeHtml(DATA.sections[0].title)}</div>
          <div class="task-counter">Aufgabe ${idx + 1} / ${tasks().length}</div>
          <div class="timer review-timer">${meta.timedOut ? "00:00" : formatSeconds(meta.spentSeconds)}</div>
        </div>
      </div>
      <nav class="task-tabs" aria-label="Aufgabennavigation">${tasks().map((p,i)=>{const m=metaFor(p);return `<button class="task-tab ${i===idx?'active':''} ${m.submitted?'done':''}" data-task-index="${i}" type="button"><span>${i+1}</span>${m.timedOut?'<b>!</b>':''}</button>`}).join('')}</nav>
      <main class="page task-page task-review ${idx % 2 === 0 ? 'even' : 'odd'}">
        <div class="review-banner"><div class="task-label">Aufgabe abgegeben</div><h1>${escapeHtml(part.title)}</h1><div class="review-score">${score.total ? `<strong>${score.correct} / ${score.total}</strong> richtig` : 'Textaufgabe abgegeben'}${meta.timedOut ? ' · Zeit abgelaufen' : ''}</div></div>
        <div class="review-answer" id="review-answer-slot"></div>
      </main>
      <div class="action-bar"><div class="action-bar-inner"><span class="answered-count">${meta.timedOut ? 'Automatisch abgegeben' : 'Auswertung verfügbar'}</span><button class="btn" id="btn-review-next">${idx === tasks().length - 1 ? 'Gesamtauswertung →' : 'Nächste Aufgabe →'}</button></div></div>`;
    document.getElementById('review-answer-slot').appendChild(renderPartAnswers(part));
    document.querySelectorAll('.task-tab').forEach(btn=>btn.addEventListener('click',()=>switchTask(Number(btn.dataset.taskIndex))));
    document.getElementById('btn-review-next').addEventListener('click',continueAfterReview);
  }

  function renderPart(part) {
    const wrap = document.createElement("div");
    wrap.className = "part";
    if (!state.answers[part.id]) state.answers[part.id] = {};
    const h = document.createElement("div");
    h.className = "part-title-row";
    h.innerHTML = `<span class="part-type-dot"></span><div><h2>${escapeHtml(part.title)}</h2></div>`;
    wrap.appendChild(h);
    switch (part.type) {
      case "true_false": renderTrueFalse(wrap, part); break;
      case "multiple_choice": renderMultipleChoice(wrap, part); break;
      case "matching": renderMatching(wrap, part); break;
      case "matching_ads": renderMatchingAds(wrap, part); break;
      case "speaker_matching": renderSpeakerMatching(wrap, part); break;
      case "cloze_mc": renderClozeMc(wrap, part); break;
      case "cloze_wordbank": renderClozeWordbank(wrap, part); break;
      case "writing": renderWriting(wrap, part); break;
      case "listening": renderListening(wrap, part); break;
      default: wrap.innerHTML += `<p>Unbekannter Aufgabentyp: ${escapeHtml(part.type)}</p>`;
    }
    return wrap;
  }

  function audioBlock(wrap, part) {
    if (!part.audio && !part.transcript) return;
    const block = document.createElement("div"); block.className = "audio-block";
    block.innerHTML = part.audio ? `<audio controls preload="none" src="${escapeAttr(resolveAudioPath(part.audio))}"></audio>` : `<span>Kein Audio hinterlegt.</span>`;
    if (part.transcript) block.innerHTML += `<button class="transcript-toggle" type="button">Transkript anzeigen</button>`;
    wrap.appendChild(block);
    if (part.transcript) {
      const t = document.createElement("div"); t.className = "transcript-box"; t.textContent = part.transcript; wrap.appendChild(t);
      block.querySelector(".transcript-toggle").addEventListener("click", () => t.classList.toggle("open"));
    }
  }
  function resolveAudioPath(p) { return cfg.assetPrefix ? cfg.assetPrefix + p : "../" + p; }

  function renderListening(wrap, part) {
    const meta = metaFor(part);
    const maxPlays = part.maxPlays || 2;
    const locked = meta.submitted;
    const block = document.createElement("div");
    block.className = "audio-block listening-audio";
    block.innerHTML = `<audio controls preload="none" controlsList="nodownload" src="${escapeAttr(resolveAudioPath(part.audio))}"></audio><span class="play-counter"></span>`;
    wrap.appendChild(block);
    const audioEl = block.querySelector("audio");
    const counterEl = block.querySelector(".play-counter");
    let activeSession = false;

    function updateCounter() {
      const remaining = Math.max(0, maxPlays - meta.plays);
      counterEl.textContent = locked
        ? "Aufgabe abgegeben"
        : remaining > 0
          ? `▶ ${remaining} von ${maxPlays} Wiedergabe${maxPlays === 1 ? "" : "n"} übrig`
          : "Keine Wiedergaben mehr übrig";
      counterEl.classList.toggle("used-up", !locked && remaining === 0);
      audioEl.classList.toggle("exhausted", locked || remaining === 0);
    }
    updateCounter();

    if (locked) audioEl.setAttribute("disabled", "true");

    audioEl.addEventListener("play", () => {
      if (locked) { audioEl.pause(); return; }
      if (!activeSession) {
        if (meta.plays >= maxPlays) {
          audioEl.pause();
          audioEl.currentTime = 0;
          updateCounter();
          return;
        }
        meta.plays += 1;
        activeSession = true;
        saveState();
        updateCounter();
      }
    });
    audioEl.addEventListener("ended", () => { activeSession = false; });

    part.questions.forEach((q, qi) => {
      const num = qi + 1;
      if (q.type === "true_false") {
        const row = document.createElement("div"); row.className = "q-item";
        row.innerHTML = `<div><span class="q-num">${num}</span><span class="q-statement">${escapeHtml(q.statement)}</span></div><div class="tf-choices"><button class="choice-btn" data-val="true" type="button">Richtig</button><button class="choice-btn" data-val="false" type="button">Falsch</button></div>`;
        const stored = state.answers[part.id][q.id];
        row.querySelectorAll(".choice-btn").forEach(b => {
          if (stored !== undefined && String(stored) === b.dataset.val) b.classList.add("selected");
          b.addEventListener("click", () => {
            state.answers[part.id][q.id] = b.dataset.val === "true";
            row.querySelectorAll(".choice-btn").forEach(x => x.classList.remove("selected"));
            b.classList.add("selected");
            saveState();
            updateAnsweredCount(part);
          });
        });
        wrap.appendChild(row);
      } else if (q.type === "multiple_choice") {
        const row = document.createElement("div"); row.className = "q-item";
        row.innerHTML = `<div><span class="q-num">${num}</span><span class="q-statement">${escapeHtml(q.question)}</span></div><div class="mc-options">${q.options.map((o, i) => `<label class="mc-option ${state.answers[part.id][q.id] === i ? "selected" : ""}" data-idx="${i}"><input type="radio" name="${part.id}-${q.id}" ${state.answers[part.id][q.id] === i ? "checked" : ""}><span>${String.fromCharCode(97 + i)}) ${escapeHtml(o)}</span></label>`).join("")}</div>`;
        row.querySelectorAll(".mc-option").forEach(l => l.addEventListener("click", () => {
          const i = Number(l.dataset.idx);
          state.answers[part.id][q.id] = i;
          row.querySelectorAll(".mc-option").forEach(x => x.classList.remove("selected"));
          l.classList.add("selected");
          saveState();
          updateAnsweredCount(part);
        }));
        wrap.appendChild(row);
      }
    });
  }

  function renderTrueFalse(wrap, part) {
    if (part.text) { const p = document.createElement("p"); p.className="reading-text"; p.textContent=part.text; wrap.appendChild(p); }
    audioBlock(wrap, part);
    part.questions.forEach(q => {
      const row=document.createElement("div"); row.className="q-item";
      row.innerHTML=`<div><span class="q-num">${q.id}</span><span class="q-statement">${escapeHtml(q.statement)}</span></div><div class="tf-choices"><button class="choice-btn" data-val="true" type="button">Richtig</button><button class="choice-btn" data-val="false" type="button">Falsch</button></div>`;
      const stored=state.answers[part.id][q.id];
      row.querySelectorAll(".choice-btn").forEach(b=>{if(stored!==undefined&&String(stored)===b.dataset.val)b.classList.add("selected");b.addEventListener("click",()=>{state.answers[part.id][q.id]=b.dataset.val==="true";row.querySelectorAll(".choice-btn").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");saveState();updateAnsweredCount(part);});});
      wrap.appendChild(row);
    });
  }
  function renderMultipleChoice(wrap, part) {
    audioBlock(wrap, part);
    part.questions.forEach(q=>{const row=document.createElement("div");row.className="q-item";row.innerHTML=`<div><span class="q-num">${q.id}</span><span class="q-statement">${escapeHtml(q.question)}</span></div><div class="mc-options">${q.options.map((o,i)=>`<label class="mc-option ${state.answers[part.id][q.id]===i?"selected":""}" data-idx="${i}"><input type="radio" name="${part.id}-${q.id}" ${state.answers[part.id][q.id]===i?"checked":""}><span>${escapeHtml(o)}</span></label>`).join("")}</div>`;row.querySelectorAll(".mc-option").forEach(l=>l.addEventListener("click",()=>{const i=Number(l.dataset.idx);state.answers[part.id][q.id]=i;row.querySelectorAll(".mc-option").forEach(x=>x.classList.remove("selected"));l.classList.add("selected");saveState();updateAnsweredCount(part);}));wrap.appendChild(row);});
  }
  function optionsLegend(options) { const d=document.createElement("div");d.className="options-legend";d.innerHTML=(options||[]).map(o=>`<strong>${escapeHtml(o.key)}</strong> ${escapeHtml(o.text)}`).join(" · ");return d; }
  function renderMatching(wrap,part){wrap.appendChild(optionsLegend(part.options));part.items.forEach(i=>{const row=document.createElement("div");row.className="match-row";row.innerHTML=`<div><span class="q-num">${i.id}</span>${escapeHtml(i.text)}</div><select class="match-select"><option value="">— wählen —</option>${part.options.map(o=>`<option value="${escapeAttr(o.key)}" ${state.answers[part.id][i.id]===o.key?"selected":""}>${escapeHtml(o.key)}</option>`).join("")}</select>`;row.querySelector("select").addEventListener("change",e=>{state.answers[part.id][i.id]=e.target.value;saveState();updateAnsweredCount(part);});wrap.appendChild(row);});}
  function renderMatchingAds(wrap,part){wrap.appendChild(optionsLegend(part.ads));part.scenarios.forEach(s=>{const row=document.createElement("div");row.className="match-row";row.innerHTML=`<div><span class="q-num">${s.id}</span>${escapeHtml(s.text)}</div><select class="match-select"><option value="">— wählen —</option>${part.ads.map(o=>`<option value="${escapeAttr(o.key)}" ${state.answers[part.id][s.id]===o.key?"selected":""}>${escapeHtml(o.key)}</option>`).join("")}</select>`;row.querySelector("select").addEventListener("change",e=>{state.answers[part.id][s.id]=e.target.value;saveState();updateAnsweredCount(part);});wrap.appendChild(row);});}
  function renderSpeakerMatching(wrap,part){audioBlock(wrap,part);wrap.appendChild(optionsLegend(part.options));part.speakers.forEach((sid,i)=>{const row=document.createElement("div");row.className="match-row";row.innerHTML=`<div><span class="q-num">${sid}</span>Person ${i+1}</div><select class="match-select"><option value="">— wählen —</option>${part.options.map(o=>`<option value="${escapeAttr(o.key)}" ${state.answers[part.id][sid]===o.key?"selected":""}>${escapeHtml(o.key)}</option>`).join("")}</select>`;row.querySelector("select").addEventListener("change",e=>{state.answers[part.id][sid]=e.target.value;saveState();updateAnsweredCount(part);});wrap.appendChild(row);});}
  function renderClozeMc(wrap,part){const p=document.createElement("p");p.className="cloze-text";let html=escapeHtml(part.textBefore||"");part.blanks.forEach(b=>{html+=escapeHtml(b.before||"");const sel=state.answers[part.id][b.id];html+=`<select class="cloze-blank-select" data-blank="${escapeAttr(b.id)}"><option value="">${escapeHtml(b.id)}</option>${b.options.map((o,i)=>`<option value="${i}" ${sel===i?"selected":""}>${String.fromCharCode(97+i)}) ${escapeHtml(o)}</option>`).join("")}</select>`;html+=escapeHtml(b.after||"");});html+=escapeHtml(part.textAfter||"");p.innerHTML=html;wrap.appendChild(p);p.querySelectorAll("select").forEach(s=>s.addEventListener("change",e=>{state.answers[part.id][e.target.dataset.blank]=e.target.value===""?undefined:Number(e.target.value);saveState();updateAnsweredCount(part);}));}
  function renderClozeWordbank(wrap,part){const words = part.wordBank || part.wordbank || []; if(words.length){const d=document.createElement("div");d.className="wordbank";d.innerHTML=words.map(w=>`<span>${escapeHtml(w)}</span>`).join("");wrap.appendChild(d);}const p=document.createElement("p");p.className="cloze-text";let html=escapeHtml(part.textBefore||"");part.blanks.forEach(b=>{html+=escapeHtml(b.before||"");html+=`<select class="cloze-blank-select" data-blank="${escapeAttr(b.id)}"><option value="">${escapeHtml(b.id)}</option>${words.map(w=>`<option value="${escapeAttr(w)}" ${state.answers[part.id][b.id]===w?"selected":""}>${escapeHtml(w)}</option>`).join("")}</select>`;html+=escapeHtml(b.after||"");});html+=escapeHtml(part.textAfter||"");p.innerHTML=html;wrap.appendChild(p);p.querySelectorAll("select").forEach(s=>s.addEventListener("change",e=>{state.answers[part.id][e.target.dataset.blank]=e.target.value;saveState();updateAnsweredCount(part);}));}
  function renderWriting(wrap,part){const p=document.createElement("p");p.className="writing-prompt";p.textContent=part.prompt;wrap.appendChild(p);const ul=document.createElement("ul");ul.className="writing-points";ul.innerHTML=(part.points||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("");wrap.appendChild(ul);const ta=document.createElement("textarea");ta.className="writing-area";ta.placeholder=`Mindestens ca. ${part.minWords||80} Wörter …`;ta.value=state.writing[part.id]||"";wrap.appendChild(ta);const wc=document.createElement("div");wc.className="wordcount";wrap.appendChild(wc);function update(){const words=ta.value.trim()?ta.value.trim().split(/\s+/).length:0;wc.textContent=`${words} Wörter · Ziel: ca. ${part.minWords||80}+`;wc.classList.toggle("ok",words>=(part.minWords||80));state.answers[part.id][part.id]=words?"written":"";}update();ta.addEventListener("input",()=>{state.writing[part.id]=ta.value;update();saveState();updateAnsweredCount(part);});}

  function questionIds(part){switch(part.type){case"true_false":case"multiple_choice":case"listening":return part.questions.map(q=>q.id);case"matching":return part.items.map(i=>i.id);case"matching_ads":return part.scenarios.map(s=>s.id);case"speaker_matching":return part.speakers;case"cloze_mc":case"cloze_wordbank":return part.blanks.map(b=>b.id);case"writing":return [part.id];default:return[];}}
  function updateAnsweredCount(part){const ids=questionIds(part);const stored=state.answers[part.id]||{};const n=ids.filter(id=>stored[id]!==undefined&&stored[id]!==null&&stored[id]!=="").length;const el=document.getElementById("answered-count");if(el)el.textContent=`${n} / ${ids.length} beantwortet`;}

  function renderFinished(){
    state.unlocked = true;
    saveState();
    renderAnswerSheet();
  }

  function renderAnswerSheet(){
    let total=0,correct=0;
    const rows=tasks().map((p,i)=>{const s=scorePart(p);total+=s.total;correct+=s.correct;return {p,i,s,m:metaFor(p)};});
    const pct=total?Math.round(correct/total*100):0;
    root.innerHTML=`<main class="page result-page"><div class="result-kicker">B1 · separate Auswertung</div><h1>Auswertung</h1><div class="score-summary"><div class="score-box"><div class="num">${correct}/${total}</div><div class="lbl">Richtige Antworten</div></div><div class="score-box"><div class="num">${pct}%</div><div class="lbl">Gesamtergebnis</div></div><div class="score-box"><div class="num">${formatSeconds(totalSpent())}</div><div class="lbl">Gesamtzeit</div></div></div><div class="task-results">${rows.map(r=>`<div class="task-result"><div class="task-result-head"><strong>Aufgabe ${r.i+1}</strong><span>${r.s.total?r.s.correct+"/"+r.s.total+" · ":""}${formatSeconds(r.m.spentSeconds)}${r.m.timedOut?" · Zeit abgelaufen":""}</span></div><div class="task-result-title">${escapeHtml(r.p.title)}</div></div>`).join("")}</div><div id="answer-sections"></div><button class="btn ghost" id="btn-restart2">Neuen Versuch starten</button></main>`;
    const c=document.getElementById("answer-sections");tasks().forEach((p,i)=>{const block=document.createElement("section");block.className="answer-task";block.innerHTML=`<h2>Aufgabe ${i+1} · ${escapeHtml(p.title)}</h2>`;block.appendChild(renderPartAnswers(p));c.appendChild(block);});
    document.getElementById("btn-restart2").addEventListener("click",restart);
  }

  function totalSpent(){return tasks().reduce((s,p)=>s+(metaFor(p).spentSeconds||0),0);}
  function formatSeconds(s){const mm=Math.floor((s||0)/60).toString().padStart(2,"0");const ss=Math.floor((s||0)%60).toString().padStart(2,"0");return `${mm}:${ss}`;}
  function scorePart(part){const a=state.answers[part.id]||{};let total=0,correct=0;switch(part.type){case"true_false":part.questions.forEach(q=>{total++;if(a[q.id]===q.answer)correct++;});break;case"multiple_choice":part.questions.forEach(q=>{total++;if(a[q.id]===q.answer)correct++;});break;case"matching":part.items.forEach(i=>{total++;if(a[i.id]===part.answer[i.id])correct++;});break;case"matching_ads":part.scenarios.forEach(s=>{total++;if(a[s.id]===part.answer[s.id])correct++;});break;case"speaker_matching":part.speakers.forEach(id=>{total++;if(a[id]===part.answer[id])correct++;});break;case"cloze_mc":case"cloze_wordbank":part.blanks.forEach(b=>{total++;if(a[b.id]===b.answer)correct++;});break;case"listening":part.questions.forEach(q=>{total++;if(a[q.id]===q.answer)correct++;});break;}return{total,correct};}
  function renderPartAnswers(part){const w=document.createElement("div");w.className="answer-part";const a=state.answers[part.id]||{};if(part.type==="writing"){const text=state.writing[part.id]||"";w.innerHTML=`<p><strong>Ihr Text</strong></p><div class="model-answer">${escapeHtml(text||"— kein Text eingegeben —")}</div><p><strong>Musterlösung</strong></p><div class="model-answer">${escapeHtml(part.modelAnswer||"")}</div>`;return w;}
    let prefixHtml="";
    if(part.type==="listening"){
      prefixHtml+=`<div class="audio-block review-audio"><audio controls preload="none" src="${escapeAttr(resolveAudioPath(part.audio))}"></audio><span class="play-counter">Unbegrenztes Nachhören in der Auswertung</span></div>`;
      if(part.transcript)prefixHtml+=`<button class="transcript-toggle" type="button">Transkript anzeigen</button><div class="transcript-box">${escapeHtml(part.transcript)}</div>`;
    }
    const arr=[];const add=(id,label,y,c)=>arr.push(answerRow(y===c,id,label,y,c));if(part.type==="true_false")part.questions.forEach(q=>add(q.id,q.statement,fmtBool(a[q.id]),fmtBool(q.answer)));else if(part.type==="multiple_choice")part.questions.forEach(q=>add(q.id,q.question,optLabel(q.options,a[q.id]),optLabel(q.options,q.answer)));else if(part.type==="matching")part.items.forEach(i=>add(i.id,i.text,a[i.id]||"–",part.answer[i.id]));else if(part.type==="matching_ads")part.scenarios.forEach(s=>add(s.id,s.text,a[s.id]||"–",part.answer[s.id]));else if(part.type==="speaker_matching")part.speakers.forEach(id=>add(id,"Person",a[id]||"–",part.answer[id]));else if(part.type==="cloze_mc")part.blanks.forEach(b=>add(b.id,"Lücke",optLabel(b.options,a[b.id]),optLabel(b.options,b.answer)));else if(part.type==="cloze_wordbank")part.blanks.forEach(b=>add(b.id,"Lücke",a[b.id]||"–",b.answer));else if(part.type==="listening")part.questions.forEach(q=>{if(q.type==="true_false")add(q.id,q.statement,fmtBool(a[q.id]),fmtBool(q.answer));else if(q.type==="multiple_choice")add(q.id,q.question,optLabel(q.options,a[q.id]),optLabel(q.options,q.answer));});
    w.innerHTML=prefixHtml+arr.join("");
    if(part.type==="listening"&&part.transcript){const t=w.querySelector(".transcript-box");const btn=w.querySelector(".transcript-toggle");if(btn&&t)btn.addEventListener("click",()=>t.classList.toggle("open"));}
    return w;}
  function answerRow(ok,num,label,y,c){return `<div class="answer-row"><span class="mark ${ok?"correct":"incorrect"}">${ok?"✓":"✗"}</span><div class="answer-detail"><div><strong>${escapeHtml(String(num))}.</strong> ${escapeHtml(String(label))}</div><div class="yours">Ihre Antwort: ${escapeHtml(String(y))}</div>${ok?"":`<div class="correct-answer">Richtige Antwort: ${escapeHtml(String(c))}</div>`}</div></div>`;}
  function fmtBool(v){return v===true?"Richtig":v===false?"Falsch":"–";}
  function optLabel(opts,i){return i===undefined||i===null||i===""||!opts||!opts[i]?"–":opts[i];}
  function restart(){if(!confirm("Neuen Versuch starten? Die Antworten dieses Aufgabentyps werden gelöscht."))return;localStorage.removeItem(STORAGE_KEY);state=defaultState();render();}
  function escapeHtml(s){return s==null?"":String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
  function escapeAttr(s){return escapeHtml(s).replace(/"/g,"&quot;");}

  window.addEventListener("beforeunload",e=>{if(state.started&&!state.finished){e.preventDefault();e.returnValue="";}});
})();
