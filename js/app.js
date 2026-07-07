(function () {
  "use strict";

  var STORAGE_KEY = "focoEmPassos.routines.v1";
  var NOTES_STORAGE_KEY = "focoEmPassos.notes.v1";
  var SESSION_LOG_KEY = "focoEmPassos.sessionLog.v1";
  var SCHEDULE_KEY = "focoEmPassos.schedule.v1";

  var views = {
    home: document.getElementById("view-home"),
    editor: document.getElementById("view-editor"),
    run: document.getElementById("view-run"),
    notes: document.getElementById("view-notes"),
    history: document.getElementById("view-history"),
    schedule: document.getElementById("view-schedule"),
  };

  function showView(name) {
    Object.keys(views).forEach(function (key) {
      views[key].hidden = key !== name;
    });
  }

  // ---------- Persistence ----------

  function loadRoutines() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveRoutines(routines) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routines));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function loadNotes() {
    try {
      var raw = localStorage.getItem(NOTES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveNotes(notes) {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  }

  function loadSessionLog() {
    try {
      var raw = localStorage.getItem(SESSION_LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveSessionLog(log) {
    localStorage.setItem(SESSION_LOG_KEY, JSON.stringify(log));
  }

  function loadSchedule() {
    try {
      var raw = localStorage.getItem(SCHEDULE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveSchedule(schedule) {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule));
  }

  // Seed data imported from the user's "Rotina MVP" weekly spreadsheet.
  // Rows are [start, end, spec] where spec is either a string (same label
  // every day) or an object keyed by day (seg/ter/qua/qui/sex/sab/dom) with
  // "default" as the fallback and null meaning "no block that day".
  var SCHEDULE_SEED_ROWS = [
    ["23:30", "07:30", "Sono (mínimo 7h)"],
    ["07:30", "08:10", "Acordar + higiene + café"],
    ["08:10", "08:20", "Organização da casa"],
    ["08:20", "09:20", { seg: "Atividade física (mínimo 30 min) + Story + Planejamento semanal", default: "Atividade física (mínimo 30 min) + Story" }],
    ["09:20", "09:50", { seg: "Planejamento semanal", default: "Banho" }],
    ["09:50", "10:00", "Abertura do dia"],
    ["10:00", "12:00", { sab: "Leads / prospecção", dom: "Descanso", default: "Clientes / operacional" }],
    ["12:00", "13:00", { dom: "Almoço (Família)", default: "Almoço + descanso" }],
    ["13:00", "14:00", { sab: "Organização das refeições da semana", dom: "Lazer (Família)", default: "Contato clientes" }],
    ["14:00", "15:00", { sab: null, dom: "Lazer (Família)", default: "Leads / prospecção" }],
    ["15:00", "15:15", "Pausa"],
    ["15:15", "16:15", { sab: "Livre", dom: "Livre", default: "Follow-up" }],
    ["16:15", "17:15", { sab: "Livre", dom: "Livre", default: "Onboarding" }],
    ["17:15", "17:30", "Pausa"],
    ["17:30", "18:30", { sab: "Livre", dom: "Planejamento semanal", default: "Criação de manuais" }],
    ["18:30", "19:30", { sex: "Gestão estratégica", sab: "Livre", dom: "Livre", default: "Estudo" }],
    ["19:30", "20:30", "Jantar + descanso"],
    ["20:30", "21:00", "Descanso cognitivo"],
    ["21:00", "21:10", "Organização da casa"],
    ["21:10", "21:40", "Encerramento do dia"],
    ["21:40", "22:40", "Desacelerar"],
    ["22:40", "23:00", "Deitar"],
  ];

  var SCHEDULE_DAY_KEY_TO_INDEX = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };

  function buildSeedSchedule() {
    var schedule = [[], [], [], [], [], [], []];
    Object.keys(SCHEDULE_DAY_KEY_TO_INDEX).forEach(function (dayKey) {
      SCHEDULE_SEED_ROWS.forEach(function (row) {
        var start = row[0];
        var end = row[1];
        var spec = row[2];
        var label = typeof spec === "string" ? spec : Object.prototype.hasOwnProperty.call(spec, dayKey) ? spec[dayKey] : spec.default;
        if (!label) return;
        schedule[SCHEDULE_DAY_KEY_TO_INDEX[dayKey]].push({ id: uid(), start: start, end: end, label: label, routineId: null });
      });
    });
    return schedule;
  }

  function ensureScheduleSeeded() {
    var schedule = loadSchedule();
    if (!schedule) {
      schedule = buildSeedSchedule();
      saveSchedule(schedule);
    }
    return schedule;
  }

  // ---------- Speech ----------

  var speechUnlocked = false;
  var bestVoice = null;

  function pickBestVoice() {
    if (!("speechSynthesis" in window)) return;
    var voices = window.speechSynthesis.getVoices();
    var ptVoices = voices.filter(function (v) {
      return v.lang && v.lang.toLowerCase().indexOf("pt") === 0;
    });
    if (ptVoices.length === 0) {
      bestVoice = null;
      return;
    }
    // Prefer higher-quality voices (iOS labels downloaded ones "Enhanced"/"Premium").
    var enhanced = ptVoices.find(function (v) {
      return /enhanced|premium|neural/i.test(v.name);
    });
    var ptBR = ptVoices.find(function (v) {
      return v.lang.toLowerCase() === "pt-br";
    });
    bestVoice = enhanced || ptBR || ptVoices[0];
  }

  if ("speechSynthesis" in window) {
    pickBestVoice();
    window.speechSynthesis.onvoiceschanged = pickBestVoice;
  }

  function unlockSpeech() {
    if (speechUnlocked || !("speechSynthesis" in window)) return;
    var u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
    speechUnlocked = true;
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    var utter = new SpeechSynthesisUtterance(text);
    utter.lang = "pt-BR";
    if (bestVoice) utter.voice = bestVoice;
    utter.rate = 0.98;
    utter.pitch = 1;
    window.speechSynthesis.speak(utter);
  }

  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {
      /* ignore */
    }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }

  // ---------- Home view ----------

  var routinesListEl = document.getElementById("routines-list");
  var routinesEmptyEl = document.getElementById("routines-empty");

  function renderHome() {
    renderNowCard();
    var routines = loadRoutines();
    routinesListEl.innerHTML = "";
    routinesEmptyEl.hidden = routines.length > 0;

    routines.forEach(function (routine) {
      var card = document.createElement("div");
      card.className = "routine-card";

      var totalSeconds = routine.tasks.reduce(function (sum, t) {
        return sum + t.durationSeconds;
      }, 0);

      card.innerHTML =
        '<div class="info">' +
        '<div class="name"></div>' +
        '<div class="meta"></div>' +
        "</div>" +
        '<button class="edit" aria-label="Editar">✎</button>' +
        '<button class="play" aria-label="Iniciar">▶</button>';

      var extraCount = routine.tasks.filter(function (t) {
        return t.isExtra;
      }).length;
      var mvpCount = routine.tasks.length - extraCount;
      var mvpSeconds = routine.tasks
        .filter(function (t) {
          return !t.isExtra;
        })
        .reduce(function (sum, t) {
          return sum + t.durationSeconds;
        }, 0);
      var metaText =
        routine.tasks.length +
        (routine.tasks.length === 1 ? " tarefa · " : " tarefas · ") +
        formatDuration(totalSeconds) +
        " no total";
      if (extraCount > 0) {
        metaText += " (" + mvpCount + " MVP + " + extraCount + " ideal) · " + formatDuration(mvpSeconds) + " no MVP";
      }
      card.querySelector(".name").textContent = routine.name;
      card.querySelector(".meta").textContent = metaText;

      card.querySelector(".edit").addEventListener("click", function () {
        openEditor(routine);
      });
      card.querySelector(".play").addEventListener("click", function () {
        requestStart(routine.tasks, routine.name);
      });

      routinesListEl.appendChild(card);
    });
  }

  document.getElementById("btn-new-routine").addEventListener("click", function () {
    openEditor(null, { quick: false });
  });
  document.getElementById("btn-quick-list").addEventListener("click", function () {
    openEditor(null, { quick: true });
  });
  document.getElementById("btn-open-notes").addEventListener("click", function () {
    renderNotesView();
    showView("notes");
  });
  document.getElementById("btn-open-history").addEventListener("click", function () {
    renderHistoryView();
    showView("history");
  });
  document.getElementById("btn-open-schedule").addEventListener("click", function () {
    openScheduleView();
    showView("schedule");
  });

  document.getElementById("btn-export-routines").addEventListener("click", function () {
    var routines = loadRoutines();
    if (routines.length === 0) {
      alert("Você ainda não tem rotinas salvas para exportar.");
      return;
    }
    var json = JSON.stringify(routines, null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "rotinas-foco-em-passos.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  var importFileInput = document.getElementById("import-file-input");

  document.getElementById("btn-import-routines").addEventListener("click", function () {
    importFileInput.value = "";
    importFileInput.click();
  });

  importFileInput.addEventListener("change", function () {
    var file = importFileInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var imported;
      try {
        imported = JSON.parse(reader.result);
      } catch (e) {
        alert("Arquivo inválido. Não foi possível ler o JSON.");
        return;
      }
      if (!Array.isArray(imported)) {
        alert("Arquivo inválido. Esperado uma lista de rotinas.");
        return;
      }
      var current = loadRoutines();
      var ok = confirm(
        "Isso vai substituir suas " + current.length + " rotinas atuais por " + imported.length + " rotinas importadas. Continuar?"
      );
      if (!ok) return;
      saveRoutines(imported);
      renderHome();
      alert("Rotinas importadas com sucesso!");
    };
    reader.readAsText(file);
  });

  // ---------- Editor view ----------

  var editorTitleEl = document.getElementById("editor-title");
  var editorNameEl = document.getElementById("editor-name");
  var editorNameHintEl = document.getElementById("editor-name-hint");
  var tasksListEl = document.getElementById("tasks-list");

  var editorState = null; // { id, quick, tasks: [{id,name,durationSeconds}] }

  function openEditor(routine, opts) {
    opts = opts || {};
    if (routine) {
      editorState = {
        id: routine.id,
        quick: false,
        tasks: routine.tasks.map(function (t) {
          return { id: t.id, name: t.name, durationSeconds: t.durationSeconds, isExtra: !!t.isExtra };
        }),
      };
      editorTitleEl.textContent = "Editar rotina";
      editorNameEl.value = routine.name;
      editorNameHintEl.textContent = "";
    } else {
      editorState = { id: null, quick: !!opts.quick, tasks: [] };
      editorTitleEl.textContent = opts.quick ? "Lista rápida" : "Nova rotina";
      editorNameEl.value = "";
      editorNameHintEl.textContent = opts.quick ? "(opcional, só se quiser salvar depois)" : "";
      addTaskRow(); // start with one empty task for convenience
    }
    renderTasksList();
    showView("editor");
  }

  function addTaskRow() {
    editorState.tasks.push({ id: uid(), name: "", durationSeconds: 300, isExtra: false });
    renderTasksList();
  }

  function renderTasksList() {
    tasksListEl.innerHTML = "";
    editorState.tasks.forEach(function (task) {
      var row = document.createElement("div");
      row.className = "task-row";
      row.innerHTML =
        '<input class="task-name" type="text" placeholder="Nome da tarefa" maxlength="80">' +
        '<input class="task-duration" type="number" min="1" max="240" inputmode="numeric">' +
        '<span class="task-unit">min</span>' +
        '<label class="task-extra-toggle"><input type="checkbox" class="task-extra"> Ideal</label>' +
        '<button class="remove-task" aria-label="Remover">✕</button>';

      var nameInput = row.querySelector(".task-name");
      var durationInput = row.querySelector(".task-duration");
      var extraCheckbox = row.querySelector(".task-extra");

      nameInput.value = task.name;
      durationInput.value = Math.round((task.durationSeconds / 60) * 10) / 10;
      extraCheckbox.checked = !!task.isExtra;

      nameInput.addEventListener("input", function () {
        task.name = nameInput.value;
      });
      durationInput.addEventListener("input", function () {
        var minutes = parseFloat(durationInput.value);
        if (isNaN(minutes) || minutes <= 0) minutes = 1;
        task.durationSeconds = Math.round(minutes * 60);
      });
      extraCheckbox.addEventListener("change", function () {
        task.isExtra = extraCheckbox.checked;
      });
      row.querySelector(".remove-task").addEventListener("click", function () {
        editorState.tasks = editorState.tasks.filter(function (t) {
          return t.id !== task.id;
        });
        renderTasksList();
      });

      tasksListEl.appendChild(row);
    });
  }

  document.getElementById("btn-add-task").addEventListener("click", addTaskRow);

  document.getElementById("btn-cancel-editor").addEventListener("click", function () {
    renderHome();
    showView("home");
  });

  function validEditorTasks() {
    return editorState.tasks
      .map(function (t) {
        return { id: t.id, name: t.name.trim() || "Tarefa sem nome", durationSeconds: t.durationSeconds, isExtra: !!t.isExtra };
      })
      .filter(function (t) {
        return t.durationSeconds > 0;
      });
  }

  document.getElementById("btn-save-routine").addEventListener("click", function () {
    var tasks = validEditorTasks();
    if (tasks.length === 0) {
      alert("Adicione pelo menos uma tarefa antes de salvar.");
      return;
    }
    var name = editorNameEl.value.trim() || "Rotina sem nome";
    var routines = loadRoutines();

    if (editorState.id) {
      routines = routines.map(function (r) {
        return r.id === editorState.id ? { id: r.id, name: name, tasks: tasks } : r;
      });
    } else {
      routines.push({ id: uid(), name: name, tasks: tasks });
    }
    saveRoutines(routines);
    renderHome();
    showView("home");
  });

  document.getElementById("btn-start-now").addEventListener("click", function () {
    var tasks = validEditorTasks();
    if (tasks.length === 0) {
      alert("Adicione pelo menos uma tarefa antes de iniciar.");
      return;
    }
    requestStart(tasks, editorNameEl.value.trim() || "Lista rápida");
  });

  // ---------- Mode select (MVP vs Ideal) ----------

  var modeOverlayEl = document.getElementById("mode-select-overlay");
  var pendingStart = null; // { tasks, routineName }

  function requestStart(tasks, routineName) {
    var hasExtras = tasks.some(function (t) {
      return t.isExtra;
    });
    if (!hasExtras) {
      unlockSpeech();
      startRun(tasks, routineName, null);
      return;
    }
    pendingStart = { tasks: tasks, routineName: routineName };
    modeOverlayEl.hidden = false;
  }

  document.getElementById("btn-mode-mvp").addEventListener("click", function () {
    if (!pendingStart) return;
    var tasks = pendingStart.tasks.filter(function (t) {
      return !t.isExtra;
    });
    var name = pendingStart.routineName;
    modeOverlayEl.hidden = true;
    pendingStart = null;
    if (tasks.length === 0) {
      alert("Essa rotina não tem nenhuma tarefa MVP definida.");
      return;
    }
    unlockSpeech();
    startRun(tasks, name, "Modo MVP");
  });

  document.getElementById("btn-mode-ideal").addEventListener("click", function () {
    if (!pendingStart) return;
    var tasks = pendingStart.tasks.slice();
    var name = pendingStart.routineName;
    modeOverlayEl.hidden = true;
    pendingStart = null;
    unlockSpeech();
    startRun(tasks, name, "Modo Ideal");
  });

  document.getElementById("btn-mode-cancel").addEventListener("click", function () {
    modeOverlayEl.hidden = true;
    pendingStart = null;
  });

  // ---------- Run view ----------

  var runState = null;
  var timerInterval = null;

  var runProgressEl = document.getElementById("run-progress");
  var runRoutineNameEl = document.getElementById("run-routine-name");
  var runTaskNameEl = document.getElementById("run-task-name");
  var runTimerEl = document.getElementById("run-timer");
  var runStatusEl = document.getElementById("run-status");
  var controlsActiveEl = document.getElementById("run-controls-active");
  var controlsWaitingEl = document.getElementById("run-controls-waiting");
  var controlsFinishedEl = document.getElementById("run-controls-finished");
  var pauseResumeBtn = document.getElementById("btn-pause-resume");
  var notePanelEl = document.getElementById("note-panel");
  var noteTextEl = document.getElementById("note-text");

  document.getElementById("btn-toggle-note").addEventListener("click", function () {
    if (!runState) return;
    notePanelEl.hidden = !notePanelEl.hidden;
    if (!notePanelEl.hidden) noteTextEl.focus();
  });
  document.getElementById("btn-cancel-note").addEventListener("click", function () {
    noteTextEl.value = "";
    notePanelEl.hidden = true;
  });
  document.getElementById("btn-save-note").addEventListener("click", function () {
    var text = noteTextEl.value.trim();
    if (text) addNote(text);
    noteTextEl.value = "";
    notePanelEl.hidden = true;
  });

  function addNote(text) {
    var notes = loadNotes();
    notes.push({
      id: uid(),
      ts: Date.now(),
      routineName: runState ? runState.routineName : "",
      taskName: runState ? runState.tasks[runState.index].name : "",
      text: text,
    });
    saveNotes(notes);
  }

  function startRun(tasks, routineName, modeLabel) {
    runState = {
      routineName: routineName,
      modeLabel: modeLabel || null,
      tasks: tasks,
      index: 0,
      remainingSeconds: 0,
      endTimestamp: null,
      paused: false,
      waiting: false,
    };
    showView("run");
    beginTask(0, { announce: true });
  }

  function beginTask(index, opts) {
    opts = opts || {};
    runState.index = index;
    var task = runState.tasks[index];
    runState.remainingSeconds = task.durationSeconds;
    runState.endTimestamp = Date.now() + task.durationSeconds * 1000;
    runState.taskStartedAt = Date.now();
    runState.paused = false;
    runState.waiting = false;

    controlsActiveEl.hidden = false;
    controlsWaitingEl.hidden = true;
    controlsFinishedEl.hidden = true;
    pauseResumeBtn.textContent = "⏸ Pausar";
    runTimerEl.classList.remove("time-up");
    runStatusEl.textContent = "";
    noteTextEl.value = "";
    notePanelEl.hidden = true;

    updateRunHeader();

    if (opts.announce) {
      speak("Próxima tarefa: " + task.name + ". " + formatDuration(task.durationSeconds) + ".");
    }

    clearInterval(timerInterval);
    timerInterval = setInterval(tick, 250);
    tick();
  }

  function updateRunHeader() {
    var task = runState.tasks[runState.index];
    runRoutineNameEl.textContent = runState.routineName + (runState.modeLabel ? " · " + runState.modeLabel : "");
    runProgressEl.textContent = "Tarefa " + (runState.index + 1) + " de " + runState.tasks.length;
    runTaskNameEl.textContent = task.name;
  }

  function tick() {
    if (runState.paused) return;
    var now = Date.now();

    if (!runState.waiting) {
      var remaining = Math.max(0, Math.round((runState.endTimestamp - now) / 1000));
      runState.remainingSeconds = remaining;
      runTimerEl.textContent = formatClock(remaining);
      if (remaining <= 0) {
        onTaskTimeUp();
      }
    } else {
      var overtimeSeconds = Math.max(0, Math.round((now - runState.endTimestamp) / 1000));
      runTimerEl.textContent = "+" + formatClock(overtimeSeconds);
    }
  }

  function onTaskTimeUp() {
    runState.waiting = true;
    runTimerEl.classList.add("time-up");
    controlsActiveEl.hidden = true;
    controlsWaitingEl.hidden = false;
    runStatusEl.textContent = "Tempo esgotado — cronômetro extra em andamento";

    var task = runState.tasks[runState.index];
    beep();
    speak("Tempo esgotado para " + task.name + ". Toque em concluir quando estiver pronta para a próxima.");
  }

  document.getElementById("btn-pause-resume").addEventListener("click", function () {
    if (!runState || runState.waiting) return;
    if (runState.paused) {
      runState.endTimestamp = Date.now() + runState.remainingSeconds * 1000;
      runState.paused = false;
      pauseResumeBtn.textContent = "⏸ Pausar";
      runStatusEl.textContent = "";
    } else {
      runState.paused = true;
      pauseResumeBtn.textContent = "▶ Retomar";
      runStatusEl.textContent = "Pausado";
    }
  });

  document.getElementById("btn-skip").addEventListener("click", function () {
    if (!runState) return;
    advanceTask("skipped");
  });

  document.getElementById("btn-complete-now").addEventListener("click", function () {
    if (!runState) return;
    advanceTask("completed");
  });

  document.getElementById("btn-next").addEventListener("click", function () {
    advanceTask("completed");
  });

  function logTaskEvent(task, status, startedAt, endedAt) {
    var log = loadSessionLog();
    log.push({
      id: uid(),
      routineName: runState.routineName,
      modeLabel: runState.modeLabel,
      taskName: task.name,
      plannedSeconds: task.durationSeconds,
      actualSeconds: Math.max(0, Math.round((endedAt - startedAt) / 1000)),
      status: status,
      startedAt: startedAt,
      endedAt: endedAt,
    });
    saveSessionLog(log);
  }

  function advanceTask(status) {
    var task = runState.tasks[runState.index];
    var endedAt = Date.now();
    logTaskEvent(task, status, runState.taskStartedAt, endedAt);

    clearInterval(timerInterval);
    var nextIndex = runState.index + 1;
    if (nextIndex >= runState.tasks.length) {
      finishRun();
    } else {
      beginTask(nextIndex, { announce: true });
    }
  }

  function finishRun() {
    notePanelEl.hidden = true;
    controlsActiveEl.hidden = true;
    controlsWaitingEl.hidden = true;
    controlsFinishedEl.hidden = false;
    runTaskNameEl.textContent = "Rotina concluída!";
    runTimerEl.textContent = "🎉";
    runTimerEl.classList.remove("time-up");
    runStatusEl.textContent = "";
    runProgressEl.textContent = "";
    beep();
    speak("Rotina concluída! Parabéns.");
  }

  document.getElementById("btn-stop-run").addEventListener("click", function () {
    if (runState && !confirm("Parar a rotina agora?")) return;
    clearInterval(timerInterval);
    window.speechSynthesis && window.speechSynthesis.cancel();
    notePanelEl.hidden = true;
    runState = null;
    renderHome();
    showView("home");
  });

  document.getElementById("btn-finish-home").addEventListener("click", function () {
    runState = null;
    renderHome();
    showView("home");
  });

  // ---------- Notes view ----------

  var notesDaysEl = document.getElementById("notes-days");
  var notesEmptyEl = document.getElementById("notes-empty");

  document.getElementById("btn-back-from-notes").addEventListener("click", function () {
    renderHome();
    showView("home");
  });

  function dateKeyOf(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function formatDateLabel(key) {
    var parts = key.split("-");
    return parts[2] + "/" + parts[1] + "/" + parts[0];
  }

  function formatTime(ts) {
    var d = new Date(ts);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function renderNotesView() {
    var notes = loadNotes().slice().sort(function (a, b) {
      return b.ts - a.ts;
    });
    notesDaysEl.innerHTML = "";
    notesEmptyEl.hidden = notes.length > 0;

    var dayMap = {};
    var dayOrder = [];
    notes.forEach(function (n) {
      var key = dateKeyOf(n.ts);
      if (!dayMap[key]) {
        dayMap[key] = [];
        dayOrder.push(key);
      }
      dayMap[key].push(n);
    });

    dayOrder.forEach(function (key) {
      var dayNotes = dayMap[key];
      var dayEl = document.createElement("div");
      dayEl.className = "notes-day";

      var header = document.createElement("div");
      header.className = "notes-day-header";
      header.innerHTML =
        '<span class="day-label"></span>' +
        '<button class="copy-day">Copiar</button>' +
        '<button class="share-day">Compartilhar</button>';
      header.querySelector(".day-label").textContent = formatDateLabel(key) + " (" + dayNotes.length + ")";
      header.querySelector(".copy-day").addEventListener("click", function () {
        copyDay(key);
      });
      header.querySelector(".share-day").addEventListener("click", function () {
        shareDay(key);
      });
      dayEl.appendChild(header);

      dayNotes.forEach(function (n) {
        var card = document.createElement("div");
        card.className = "note-card";
        card.innerHTML = '<button class="delete-note" aria-label="Excluir">✕</button><div class="meta"></div><div class="text"></div>';
        card.querySelector(".meta").textContent = formatTime(n.ts) + " · " + n.routineName + (n.taskName ? " – " + n.taskName : "");
        card.querySelector(".text").textContent = n.text;
        card.querySelector(".delete-note").addEventListener("click", function () {
          deleteNote(n.id);
        });
        dayEl.appendChild(card);
      });

      notesDaysEl.appendChild(dayEl);
    });
  }

  function deleteNote(id) {
    var notes = loadNotes().filter(function (n) {
      return n.id !== id;
    });
    saveNotes(notes);
    renderNotesView();
  }

  function textForDay(key) {
    var notes = loadNotes()
      .filter(function (n) {
        return dateKeyOf(n.ts) === key;
      })
      .sort(function (a, b) {
        return a.ts - b.ts;
      });
    var lines = ["Notas — " + formatDateLabel(key), ""];
    notes.forEach(function (n) {
      lines.push("• [" + formatTime(n.ts) + "] " + n.routineName + (n.taskName ? " – " + n.taskName : ""));
      lines.push("  " + n.text);
      lines.push("");
    });
    return lines.join("\n").trim();
  }

  function copyTextToClipboard(text, successMessage) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(function () {
          alert(successMessage);
        })
        .catch(function () {
          prompt("Copie o texto abaixo:", text);
        });
    } else {
      prompt("Copie o texto abaixo:", text);
    }
  }

  function shareOrCopyText(title, text, successMessage) {
    if (navigator.share) {
      navigator.share({ title: title, text: text }).catch(function () {});
    } else {
      copyTextToClipboard(text, successMessage);
    }
  }

  function copyDay(key) {
    copyTextToClipboard(textForDay(key), "Notas copiadas! Cole no Notion.");
  }

  function shareDay(key) {
    shareOrCopyText("Notas do dia", textForDay(key), "Notas copiadas! Cole no Notion.");
  }

  // ---------- History view ----------

  var historyDaysEl = document.getElementById("history-days");
  var historyEmptyEl = document.getElementById("history-empty");

  document.getElementById("btn-back-from-history").addEventListener("click", function () {
    renderHome();
    showView("home");
  });

  function statusLabel(status) {
    return status === "completed" ? "✅ Concluída" : "⏭ Pulada";
  }

  function renderHistoryView() {
    var entries = loadSessionLog()
      .slice()
      .sort(function (a, b) {
        return b.startedAt - a.startedAt;
      });
    historyDaysEl.innerHTML = "";
    historyEmptyEl.hidden = entries.length > 0;

    var dayMap = {};
    var dayOrder = [];
    entries.forEach(function (e) {
      var key = dateKeyOf(e.startedAt);
      if (!dayMap[key]) {
        dayMap[key] = [];
        dayOrder.push(key);
      }
      dayMap[key].push(e);
    });

    dayOrder.forEach(function (key) {
      var dayEntries = dayMap[key];
      var completedCount = dayEntries.filter(function (e) {
        return e.status === "completed";
      }).length;
      var skippedCount = dayEntries.length - completedCount;

      var dayEl = document.createElement("div");
      dayEl.className = "notes-day";

      var header = document.createElement("div");
      header.className = "notes-day-header";
      header.innerHTML =
        '<span class="day-label"></span>' +
        '<button class="copy-day">Copiar</button>' +
        '<button class="share-day">Compartilhar</button>';
      header.querySelector(".day-label").textContent =
        formatDateLabel(key) + " (" + completedCount + " concluídas, " + skippedCount + " puladas)";
      header.querySelector(".copy-day").addEventListener("click", function () {
        copyHistoryDay(key);
      });
      header.querySelector(".share-day").addEventListener("click", function () {
        shareHistoryDay(key);
      });
      dayEl.appendChild(header);

      dayEntries.forEach(function (e) {
        var card = document.createElement("div");
        card.className = "note-card";
        card.innerHTML = '<button class="delete-note" aria-label="Excluir">✕</button><div class="meta"></div><div class="text"></div>';
        card.querySelector(".meta").textContent =
          formatTime(e.startedAt) + "–" + formatTime(e.endedAt) + " · " + e.routineName + (e.modeLabel ? " (" + e.modeLabel + ")" : "");
        card.querySelector(".text").textContent =
          statusLabel(e.status) +
          " — " +
          e.taskName +
          " · Planejado: " +
          formatDuration(e.plannedSeconds) +
          " · Real: " +
          formatDuration(e.actualSeconds);
        card.querySelector(".delete-note").addEventListener("click", function () {
          deleteHistoryEntry(e.id);
        });
        dayEl.appendChild(card);
      });

      historyDaysEl.appendChild(dayEl);
    });
  }

  function deleteHistoryEntry(id) {
    var log = loadSessionLog().filter(function (e) {
      return e.id !== id;
    });
    saveSessionLog(log);
    renderHistoryView();
  }

  function textForHistoryDay(key) {
    var entries = loadSessionLog()
      .filter(function (e) {
        return dateKeyOf(e.startedAt) === key;
      })
      .sort(function (a, b) {
        return a.startedAt - b.startedAt;
      });
    var lines = ["Histórico — " + formatDateLabel(key), ""];
    entries.forEach(function (e) {
      lines.push(
        "• [" + formatTime(e.startedAt) + "–" + formatTime(e.endedAt) + "] " + e.routineName + (e.modeLabel ? " (" + e.modeLabel + ")" : "") + " – " + e.taskName
      );
      lines.push("  Status: " + statusLabel(e.status) + " · Planejado: " + formatDuration(e.plannedSeconds) + " · Real: " + formatDuration(e.actualSeconds));
      lines.push("");
    });
    return lines.join("\n").trim();
  }

  function copyHistoryDay(key) {
    copyTextToClipboard(textForHistoryDay(key), "Histórico copiado! Cole no Notion.");
  }

  function shareHistoryDay(key) {
    shareOrCopyText("Histórico do dia", textForHistoryDay(key), "Histórico copiado! Cole no Notion.");
  }

  // ---------- Weekly schedule view ----------

  var DAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  var DAY_LABELS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  var scheduleDayTabsEl = document.getElementById("schedule-day-tabs");
  var scheduleBlocksEl = document.getElementById("schedule-blocks");
  var selectedScheduleDay = new Date().getDay();

  document.getElementById("btn-back-from-schedule").addEventListener("click", function () {
    renderHome();
    showView("home");
  });

  function blockToRanges(block) {
    var s = timeToMinutes(block.start);
    var e = timeToMinutes(block.end);
    if (e > s) return [[s, e]];
    if (e === s) return [[0, 1440]];
    return [
      [s, 1440],
      [0, e],
    ];
  }

  function rangesOverlap(r1, r2) {
    return r1[0] < r2[1] && r2[0] < r1[1];
  }

  function blocksOverlap(a, b) {
    var rangesA = blockToRanges(a);
    var rangesB = blockToRanges(b);
    for (var i = 0; i < rangesA.length; i++) {
      for (var j = 0; j < rangesB.length; j++) {
        if (rangesOverlap(rangesA[i], rangesB[j])) return true;
      }
    }
    return false;
  }

  function findOverlappingBlock(blocks, target) {
    return blocks.find(function (b) {
      return b.id !== target.id && blocksOverlap(b, target);
    });
  }

  function warnIfOverlapping(blocks, target) {
    var conflict = findOverlappingBlock(blocks, target);
    if (!conflict) return true;
    return confirm('Esse horário sobrepõe com "' + conflict.label + '" (' + conflict.start + "–" + conflict.end + "). Deseja manter mesmo assim?");
  }

  document.getElementById("btn-export-schedule").addEventListener("click", function () {
    var schedule = ensureScheduleSeeded();
    var json = JSON.stringify(schedule, null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "agenda-foco-em-passos.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  var importScheduleFileInput = document.getElementById("import-schedule-file-input");

  document.getElementById("btn-import-schedule").addEventListener("click", function () {
    importScheduleFileInput.value = "";
    importScheduleFileInput.click();
  });

  importScheduleFileInput.addEventListener("change", function () {
    var file = importScheduleFileInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var imported;
      try {
        imported = JSON.parse(reader.result);
      } catch (e) {
        alert("Arquivo inválido. Não foi possível ler o JSON.");
        return;
      }
      if (!Array.isArray(imported) || imported.length !== 7) {
        alert("Arquivo inválido. Esperado uma agenda com 7 dias.");
        return;
      }
      var ok = confirm("Isso vai substituir sua agenda semanal atual pela importada. Continuar?");
      if (!ok) return;
      saveSchedule(imported);
      renderScheduleView();
      alert("Agenda importada com sucesso!");
    };
    reader.readAsText(file);
  });

  function openScheduleView() {
    selectedScheduleDay = new Date().getDay();
    renderScheduleView();
  }

  function renderScheduleView() {
    scheduleDayTabsEl.innerHTML = "";
    DAY_LABELS_SHORT.forEach(function (label, index) {
      var btn = document.createElement("button");
      btn.textContent = label;
      if (index === selectedScheduleDay) btn.classList.add("active");
      btn.addEventListener("click", function () {
        selectedScheduleDay = index;
        renderScheduleView();
      });
      scheduleDayTabsEl.appendChild(btn);
    });

    renderScheduleBlocksList();
  }

  function renderScheduleBlocksList() {
    var schedule = ensureScheduleSeeded();
    var blocks = schedule[selectedScheduleDay] || [];
    var routines = loadRoutines();

    scheduleBlocksEl.innerHTML = "";
    blocks.forEach(function (block) {
      var row = document.createElement("div");
      row.className = "schedule-block-row";

      var routineOptions = '<option value="">— nenhuma rotina —</option>';
      routines.forEach(function (r) {
        routineOptions += '<option value="' + r.id + '">' + r.name + "</option>";
      });

      row.innerHTML =
        '<input class="block-time block-start" type="time">' +
        '<span class="block-time-sep">–</span>' +
        '<input class="block-time block-end" type="time">' +
        '<input class="block-label" type="text" placeholder="Nome do bloco" maxlength="80">' +
        '<select class="block-routine">' +
        routineOptions +
        "</select>" +
        '<button class="remove-block" aria-label="Remover">✕</button>';

      row.querySelector(".block-start").value = block.start;
      row.querySelector(".block-end").value = block.end;
      row.querySelector(".block-label").value = block.label;
      row.querySelector(".block-routine").value = block.routineId || "";

      if (selectedScheduleDay === new Date().getDay()) {
        var conflicts = findCalendarConflictsForBlock(block);
        if (conflicts.length > 0) {
          var warn = document.createElement("div");
          warn.className = "block-calendar-conflict";
          warn.textContent = conflicts
            .map(function (ev) {
              return "⚠️ Conflito: " + ev.summary + " (" + ev.startLabel + "–" + ev.endLabel + ")";
            })
            .join(" · ");
          row.appendChild(warn);
        }
      }

      row.querySelector(".block-start").addEventListener("change", function (e) {
        var previous = block.start;
        block.start = e.target.value;
        if (!warnIfOverlapping(blocks, block)) {
          block.start = previous;
          e.target.value = previous;
          return;
        }
        persistScheduleBlocks();
      });
      row.querySelector(".block-end").addEventListener("change", function (e) {
        var previous = block.end;
        block.end = e.target.value;
        if (!warnIfOverlapping(blocks, block)) {
          block.end = previous;
          e.target.value = previous;
          return;
        }
        persistScheduleBlocks();
      });
      row.querySelector(".block-label").addEventListener("input", function (e) {
        block.label = e.target.value;
        persistScheduleBlocks();
      });
      row.querySelector(".block-routine").addEventListener("change", function (e) {
        block.routineId = e.target.value || null;
        persistScheduleBlocks();
      });
      row.querySelector(".remove-block").addEventListener("click", function () {
        blocks = blocks.filter(function (b) {
          return b.id !== block.id;
        });
        schedule[selectedScheduleDay] = blocks;
        saveSchedule(schedule);
        renderScheduleBlocksList();
      });

      scheduleBlocksEl.appendChild(row);
    });

    function persistScheduleBlocks() {
      schedule[selectedScheduleDay] = blocks;
      saveSchedule(schedule);
    }
  }

  document.getElementById("btn-add-block").addEventListener("click", function () {
    var schedule = ensureScheduleSeeded();
    var blocks = schedule[selectedScheduleDay];
    var newBlock = { id: uid(), start: "08:00", end: "09:00", label: "", routineId: null };
    blocks.push(newBlock);
    if (!warnIfOverlapping(blocks, newBlock)) {
      blocks.pop();
      return;
    }
    saveSchedule(schedule);
    renderScheduleBlocksList();
  });

  // ---------- Google Calendar integration ----------

  var GOOGLE_CLIENT_ID = "482420068622-3voa6i7o43dhqkjfvdj1losmaj36vo0r.apps.googleusercontent.com";
  var GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

  var googleTokenClient = null;
  var googleAccessToken = null;
  var todayCalendarEvents = []; // [{ summary, startMinutes, endMinutes, startLabel, endLabel }]

  var calendarStatusTextEl = document.getElementById("calendar-status-text");
  var connectCalendarBtn = document.getElementById("btn-connect-calendar");

  function initGoogleTokenClient() {
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) return null;
    if (googleTokenClient) return googleTokenClient;
    googleTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_CALENDAR_SCOPE,
      callback: function (response) {
        if (response.error) {
          calendarStatusTextEl.textContent = "Não foi possível conectar ao Google Calendar.";
          return;
        }
        googleAccessToken = response.access_token;
        connectCalendarBtn.textContent = "🔄 Atualizar eventos";
        fetchTodayCalendarEvents();
      },
    });
    return googleTokenClient;
  }

  connectCalendarBtn.addEventListener("click", function () {
    var client = initGoogleTokenClient();
    if (!client) {
      alert("O Google ainda não carregou. Tente novamente em alguns segundos.");
      return;
    }
    client.requestAccessToken();
  });

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function fetchTodayCalendarEvents() {
    if (!googleAccessToken) return;
    calendarStatusTextEl.textContent = "Buscando eventos de hoje...";

    var now = new Date();
    var startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    var endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    var url =
      "https://www.googleapis.com/calendar/v3/calendars/primary/events" +
      "?timeMin=" + encodeURIComponent(startOfDay.toISOString()) +
      "&timeMax=" + encodeURIComponent(endOfDay.toISOString()) +
      "&singleEvents=true&orderBy=startTime";

    fetch(url, { headers: { Authorization: "Bearer " + googleAccessToken } })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        todayCalendarEvents = (data.items || [])
          .filter(function (ev) {
            return ev.start && ev.start.dateTime;
          })
          .map(function (ev) {
            var start = new Date(ev.start.dateTime);
            var end = new Date(ev.end.dateTime);
            return {
              summary: ev.summary || "(sem título)",
              startMinutes: start.getHours() * 60 + start.getMinutes(),
              endMinutes: end.getHours() * 60 + end.getMinutes(),
              startLabel: pad2(start.getHours()) + ":" + pad2(start.getMinutes()),
              endLabel: pad2(end.getHours()) + ":" + pad2(end.getMinutes()),
            };
          });
        calendarStatusTextEl.textContent = "✅ Conectado — " + todayCalendarEvents.length + " evento(s) hoje.";
        renderNowCard();
        if (!views.schedule.hidden) renderScheduleBlocksList();
      })
      .catch(function (err) {
        calendarStatusTextEl.textContent = "Erro ao buscar eventos: " + err.message;
      });
  }

  function minutesRangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function findCalendarConflictsForBlock(block) {
    if (!todayCalendarEvents.length) return [];
    var blockRanges = blockToRanges(block);
    return todayCalendarEvents.filter(function (ev) {
      return blockRanges.some(function (r) {
        return minutesRangesOverlap(r[0], r[1], ev.startMinutes, ev.endMinutes);
      });
    });
  }

  // ---------- Now card (current/next schedule block) ----------

  var nowBlockTextEl = document.getElementById("now-block-text");
  var nextBlockTextEl = document.getElementById("next-block-text");
  var startNowBlockBtn = document.getElementById("btn-start-now-block");
  var nowCalendarWarningEl = document.getElementById("now-calendar-warning");
  var pendingNowBlockRoutineId = null;

  function timeToMinutes(hhmm) {
    var parts = hhmm.split(":");
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  function blockContainsMinutes(block, minutes) {
    var start = timeToMinutes(block.start);
    var end = timeToMinutes(block.end);
    if (end > start) return minutes >= start && minutes < end;
    return minutes >= start || minutes < end;
  }

  function getCurrentAndNextBlock() {
    var schedule = ensureScheduleSeeded();
    var now = new Date();
    var dayIndex = now.getDay();
    var minutes = now.getHours() * 60 + now.getMinutes();
    var todayBlocks = schedule[dayIndex] || [];

    var current = todayBlocks.find(function (b) {
      return blockContainsMinutes(b, minutes);
    });

    var upcoming = todayBlocks
      .filter(function (b) {
        return timeToMinutes(b.start) > minutes;
      })
      .sort(function (a, b) {
        return timeToMinutes(a.start) - timeToMinutes(b.start);
      });

    var next = null;
    if (upcoming.length > 0) {
      next = { block: upcoming[0], dayPrefix: "" };
    } else {
      var tomorrowIndex = (dayIndex + 1) % 7;
      var tomorrowBlocks = (schedule[tomorrowIndex] || []).slice().sort(function (a, b) {
        return timeToMinutes(a.start) - timeToMinutes(b.start);
      });
      if (tomorrowBlocks.length > 0) {
        next = { block: tomorrowBlocks[0], dayPrefix: "Amanhã " };
      }
    }

    return { current: current, next: next };
  }

  function renderNowCard() {
    var result = getCurrentAndNextBlock();

    if (result.current) {
      nowBlockTextEl.textContent = result.current.label + " · " + result.current.start + "–" + result.current.end;
      if (result.current.routineId) {
        pendingNowBlockRoutineId = result.current.routineId;
        startNowBlockBtn.hidden = false;
      } else {
        pendingNowBlockRoutineId = null;
        startNowBlockBtn.hidden = true;
      }

      var conflicts = findCalendarConflictsForBlock(result.current);
      if (conflicts.length > 0) {
        nowCalendarWarningEl.textContent =
          "⚠️ Conflito com o calendário: " +
          conflicts
            .map(function (ev) {
              return ev.summary + " (" + ev.startLabel + "–" + ev.endLabel + ")";
            })
            .join(", ");
        nowCalendarWarningEl.hidden = false;
      } else {
        nowCalendarWarningEl.hidden = true;
      }
    } else {
      nowBlockTextEl.textContent = "Sem bloco definido agora";
      pendingNowBlockRoutineId = null;
      startNowBlockBtn.hidden = true;
      nowCalendarWarningEl.hidden = true;
    }

    if (result.next) {
      nextBlockTextEl.textContent = "Próximo: " + result.next.dayPrefix + result.next.block.label + " às " + result.next.block.start;
    } else {
      nextBlockTextEl.textContent = "";
    }
  }

  startNowBlockBtn.addEventListener("click", function () {
    if (!pendingNowBlockRoutineId) return;
    var routine = loadRoutines().find(function (r) {
      return r.id === pendingNowBlockRoutineId;
    });
    if (!routine) {
      alert("A rotina vinculada a este bloco não existe mais.");
      return;
    }
    requestStart(routine.tasks, routine.name);
  });

  setInterval(renderNowCard, 30000);

  // ---------- Formatting ----------

  function formatClock(totalSeconds) {
    var m = Math.floor(totalSeconds / 60);
    var s = totalSeconds % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function formatDuration(totalSeconds) {
    var m = Math.round(totalSeconds / 60);
    if (m < 1) return totalSeconds + " s";
    return m + (m === 1 ? " minuto" : " minutos");
  }

  // ---------- Init ----------

  renderHome();
  showView("home");
})();
