(function () {
  "use strict";

  var STORAGE_KEY = "focoEmPassos.routines.v1";

  var views = {
    home: document.getElementById("view-home"),
    editor: document.getElementById("view-editor"),
    run: document.getElementById("view-run"),
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

  // ---------- Speech ----------

  var speechUnlocked = false;

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
    utter.rate = 1;
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

      card.querySelector(".name").textContent = routine.name;
      card.querySelector(".meta").textContent =
        routine.tasks.length +
        (routine.tasks.length === 1 ? " tarefa · " : " tarefas · ") +
        formatDuration(totalSeconds) +
        " no total";

      card.querySelector(".edit").addEventListener("click", function () {
        openEditor(routine);
      });
      card.querySelector(".play").addEventListener("click", function () {
        unlockSpeech();
        startRun(routine.tasks, routine.name);
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
          return { id: t.id, name: t.name, durationSeconds: t.durationSeconds };
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
    editorState.tasks.push({ id: uid(), name: "", durationSeconds: 300 });
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
        '<button class="remove-task" aria-label="Remover">✕</button>';

      var nameInput = row.querySelector(".task-name");
      var durationInput = row.querySelector(".task-duration");

      nameInput.value = task.name;
      durationInput.value = Math.round((task.durationSeconds / 60) * 10) / 10;

      nameInput.addEventListener("input", function () {
        task.name = nameInput.value;
      });
      durationInput.addEventListener("input", function () {
        var minutes = parseFloat(durationInput.value);
        if (isNaN(minutes) || minutes <= 0) minutes = 1;
        task.durationSeconds = Math.round(minutes * 60);
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
        return { id: t.id, name: t.name.trim() || "Tarefa sem nome", durationSeconds: t.durationSeconds };
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
    unlockSpeech();
    startRun(tasks, editorNameEl.value.trim() || "Lista rápida");
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

  function startRun(tasks, routineName) {
    runState = {
      routineName: routineName,
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
    runRoutineNameEl.textContent = runState.routineName;
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
    runState = null;
    renderHome();
    showView("home");
  });

  document.getElementById("btn-finish-home").addEventListener("click", function () {
    runState = null;
    renderHome();
    showView("home");
  });

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
