(function () {
  "use strict";

  var STORAGE_KEY = "focoEmPassos.routines.v1";
  var NOTES_STORAGE_KEY = "focoEmPassos.notes.v1";

  var views = {
    home: document.getElementById("view-home"),
    editor: document.getElementById("view-editor"),
    run: document.getElementById("view-run"),
    notes: document.getElementById("view-notes"),
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
      var metaText =
        routine.tasks.length +
        (routine.tasks.length === 1 ? " tarefa · " : " tarefas · ") +
        formatDuration(totalSeconds) +
        " no total";
      if (extraCount > 0) {
        metaText += " (" + mvpCount + " MVP + " + extraCount + " ideal)";
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
    var remaining = Math.max(0, Math.round((runState.endTimestamp - Date.now()) / 1000));
    runState.remainingSeconds = remaining;
    runTimerEl.textContent = formatClock(remaining);

    if (remaining <= 0) {
      onTaskTimeUp();
    }
  }

  function onTaskTimeUp() {
    clearInterval(timerInterval);
    runState.waiting = true;
    runTimerEl.classList.add("time-up");
    controlsActiveEl.hidden = true;
    controlsWaitingEl.hidden = false;
    runStatusEl.textContent = "Tempo esgotado";

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
    advanceTask();
  });

  document.getElementById("btn-next").addEventListener("click", function () {
    advanceTask();
  });

  function advanceTask() {
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

  function copyDay(key) {
    var text = textForDay(key);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(function () {
          alert("Notas copiadas! Cole no Notion.");
        })
        .catch(function () {
          prompt("Copie o texto abaixo:", text);
        });
    } else {
      prompt("Copie o texto abaixo:", text);
    }
  }

  function shareDay(key) {
    var text = textForDay(key);
    if (navigator.share) {
      navigator.share({ title: "Notas do dia", text: text }).catch(function () {});
    } else {
      copyDay(key);
    }
  }

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
