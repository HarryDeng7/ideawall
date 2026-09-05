"use strict";

/* ============ elements ============ */
const wall = document.getElementById("wall");
const canvas = document.getElementById("drawCanvas");
const ctx = canvas.getContext("2d");
const notesLayer = document.getElementById("notesLayer");
const emptyHint = document.getElementById("emptyHint");
const emptyTitle = document.getElementById("emptyTitle");
const wallBar = document.getElementById("wallBar");
const modal = document.getElementById("noteModal");
const modalNote = document.getElementById("modalNote");
const modalText = document.getElementById("modalText");
const modalEdit = document.getElementById("modalEdit");
const editBtn = document.getElementById("editBtn");
const saveBtn = document.getElementById("saveBtn");
const deleteBtn = document.getElementById("deleteBtn");
const closeBtn = document.getElementById("closeBtn");
const penBtn = document.getElementById("penBtn");
const eraserBtn = document.getElementById("eraserBtn");
const toolCursor = document.getElementById("toolCursor");
const penPanel = document.getElementById("penPanel");
const eraserPanel = document.getElementById("eraserPanel");
const eraserRange = document.getElementById("eraserRange");
const eraserSizeLabel = document.getElementById("eraserSizeLabel");
const eraserRing = document.getElementById("eraserRing");

/* ============ constants ============ */
const STORAGE_WALLS = "ideaWall.walls";
const STORAGE_CURRENT = "ideaWall.current";
const STORAGE_NOTES = "ideaWall.notes";     // legacy keys (single-wall era)
const STORAGE_DRAWING = "ideaWall.drawing";
const NOTE_COLOR = "#fff176";               // classic sticky-note yellow
const DRAG_THRESHOLD = 5; // px of movement before a press becomes a stroke

/* ============ state ============ */
let walls = [];          // { id, name, notes: [...], drawing: dataURL|null }
let currentWallId = null;
let activeTool = null;   // null | "draw" | "eraser" (picked in the toolbar)
let pressed = null;      // press point { x, y, button }
let strokeActive = false; // a drag has become a stroke
let addBox = null;       // current add-note input element
let currentNoteId = null; // note id shown in the modal
let penMode = "free";     // "free" | "line" | "arrow"
let penColor = "#2b1b0d"; // current ink color
let penWidth = 4;         // current ink width
let eraserWidth = 42;     // current eraser size
let strokeStart = null;   // line/arrow anchor (buffer coords)
let strokeSnap = null;    // snapshot used for line/arrow preview

/* ============ walls ============ */
function currentWall() {
  return walls.find(function (w) { return w.id === currentWallId; }) || null;
}

function newId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function saveWalls() {
  localStorage.setItem(STORAGE_WALLS, JSON.stringify(walls));
  localStorage.setItem(STORAGE_CURRENT, currentWallId);
}

function loadWalls() {
  try {
    const raw = localStorage.getItem(STORAGE_WALLS);
    walls = raw ? JSON.parse(raw) : [];
  } catch (err) {
    walls = [];
  }
  currentWallId = localStorage.getItem(STORAGE_CURRENT) || null;

  if (!walls.length) {
    // migrate legacy single-wall data if it exists
    let legacyNotes = [];
    try {
      const raw = localStorage.getItem(STORAGE_NOTES);
      legacyNotes = raw ? JSON.parse(raw) : [];
    } catch (err) {
      legacyNotes = [];
    }
    const legacyDrawing = localStorage.getItem(STORAGE_DRAWING) || null;
    walls.push({ id: newId("w"), name: "My Wall", notes: legacyNotes, drawing: legacyDrawing });
  }
  if (!currentWall()) currentWallId = walls[0].id;
  saveWalls();
}

/* ============ drawing layer ============ */
function resizeCanvas() {
  const rect = wall.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  // inline size keeps the canvas exactly on the wall even if the CSS is stale
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redrawDrawing(rect.width, rect.height);
}

function redrawDrawing(w, h) {
  ctx.clearRect(0, 0, w, h);
  const wl = currentWall();
  if (!wl || !wl.drawing) return;
  const d = wl.drawing;
  const img = new Image();
  img.onload = function () {
    if (typeof d === "string") {
      // legacy plain dataURL: fill the current size once
      ctx.drawImage(img, 0, 0, w, h);
    } else {
      // draw at the size the ink was saved at, so it never stretches
      ctx.drawImage(img, 0, 0, d.w, d.h);
    }
  };
  img.src = (typeof d === "string") ? d : d.url;
}

/* maps a mouse event to canvas buffer coordinates, so ink lands
   exactly under the cursor regardless of zoom or display scaling */
function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function applyTool(t) {
  if (t === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = eraserWidth;
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
  }
}

function saveDrawing() {
  const wl = currentWall();
  if (!wl) return;
  wl.drawing = {
    url: canvas.toDataURL(),
    w: canvas.clientWidth,
    h: canvas.clientHeight
  };
  saveWalls();
}

/* snapshots and shape drawing for line / arrow preview */
function snapshotCanvas() {
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  c.getContext("2d").drawImage(canvas, 0, 0);
  return c;
}

function restoreSnapshot(snap) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(snap, 0, 0);
  ctx.restore();
}

function drawShape(a, b) {
  if (penMode === "arrow") {
    drawArrow(a.x, a.y, b.x, b.y);
  } else {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawArrow(x1, y1, x2, y2) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const scale = canvas.width / canvas.getBoundingClientRect().width;
  const headLen = Math.max(12, penWidth * 4) * scale;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const a1 = angle + Math.PI / 6.2;
  const a2 = angle - Math.PI / 6.2;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(a1), y2 - headLen * Math.sin(a1));
  ctx.lineTo(x2 - headLen * Math.cos(a2), y2 - headLen * Math.sin(a2));
  ctx.closePath();
  ctx.fillStyle = penColor;
  ctx.fill();
  ctx.stroke();
}

/* ============ notes ============ */
function renderNotes() {
  notesLayer.innerHTML = "";
  const wl = currentWall();
  if (!wl) return;
  wl.notes.forEach(function (note) {
    const el = document.createElement("div");
    el.className = "note";
    el.dataset.id = note.id;
    el.style.left = note.x + "px";
    el.style.top = note.y + "px";
    el.style.background = NOTE_COLOR;
    el.style.transform = "rotate(" + note.rot + "deg)";
    const p = document.createElement("p");
    p.className = "note-text";
    p.textContent = note.text;
    el.appendChild(p);
    notesLayer.appendChild(el);
  });
  emptyHint.classList.toggle("hidden", wl.notes.length > 0);
  emptyTitle.textContent = wl.name + " is empty";
}

function addNote(x, y, text) {
  const wl = currentWall();
  if (!wl) return;
  const note = {
    id: newId("n"),
    x: Math.round(Math.max(8, Math.min(wall.clientWidth - 160, x - 76))),
    y: Math.round(Math.max(64, Math.min(wall.clientHeight - 120, y - 60))),
    text: text,
    rot: (Math.random() * 8 - 4).toFixed(1)
  };
  wl.notes.push(note);
  saveWalls();
  renderNotes();
}

/* ============ add-note input ============ */
function openAddBox(x, y) {
  if (addBox) addBox.remove();
  const box = document.createElement("div");
  box.className = "add-note";
  const ta = document.createElement("textarea");
  ta.placeholder = "Type your idea... (Enter to stick it)";
  box.appendChild(ta);
  wall.appendChild(box);

  const W = 184, H = 128;
  box.style.left = Math.max(8, Math.min(wall.clientWidth - W - 8, x - W / 2)) + "px";
  box.style.top = Math.max(64, Math.min(wall.clientHeight - H - 8, y - H / 2)) + "px";
  addBox = box;
  ta.focus();

  function commit() {
    const text = ta.value.trim();
    if (text) addNote(x, y, text);
    cleanup();
  }
  function cleanup() {
    if (addBox !== box) return;
    ta.removeEventListener("keydown", onKey);
    box.remove();
    addBox = null;
  }
  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      cleanup();
    }
  }
  ta.addEventListener("keydown", onKey);
  ta.addEventListener("blur", cleanup);
}

/* ============ note modal ============ */
notesLayer.addEventListener("click", function (e) {
  const el = e.target.closest(".note");
  if (!el) return;
  const wl = currentWall();
  if (!wl) return;
  const note = wl.notes.find(function (n) { return n.id === el.dataset.id; });
  if (note) openModal(note);
});

function openModal(note) {
  currentNoteId = note.id;
  modalText.textContent = note.text;
  modalEdit.value = note.text;
  modalNote.style.background = NOTE_COLOR;
  modalText.classList.remove("hidden");
  modalEdit.classList.add("hidden");
  editBtn.classList.remove("hidden");
  saveBtn.classList.add("hidden");
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  currentNoteId = null;
}

editBtn.addEventListener("click", function () {
  modalText.classList.add("hidden");
  modalEdit.classList.remove("hidden");
  editBtn.classList.add("hidden");
  saveBtn.classList.remove("hidden");
  modalEdit.focus();
});

saveBtn.addEventListener("click", function () {
  const wl = currentWall();
  const text = modalEdit.value.trim();
  if (wl && text) {
    const note = wl.notes.find(function (n) { return n.id === currentNoteId; });
    if (note) {
      note.text = text;
      saveWalls();
      renderNotes();
    }
  }
  closeModal();
});

deleteBtn.addEventListener("click", function () {
  const wl = currentWall();
  if (wl) {
    wl.notes = wl.notes.filter(function (n) { return n.id !== currentNoteId; });
    saveWalls();
    renderNotes();
  }
  closeModal();
});

closeBtn.addEventListener("click", closeModal);
modal.addEventListener("mousedown", function (e) {
  if (e.target === modal) closeModal();
});
modalEdit.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveBtn.click();
});

/* ============ wall tabs ============ */
function renderWallBar() {
  wallBar.innerHTML = "";
  walls.forEach(function (w) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "wall-tab" + (w.id === currentWallId ? " active" : "");
    tab.title = "Double-click to rename";

    const name = document.createElement("span");
    name.className = "wall-tab-name";
    name.textContent = w.name;
    tab.appendChild(name);

    if (walls.length > 1) {
      const del = document.createElement("span");
      del.className = "wall-tab-del";
      del.textContent = "\u00d7";
      del.title = "Delete wall";
      del.addEventListener("click", function (e) {
        e.stopPropagation();
        deleteWall(w.id);
      });
      tab.appendChild(del);
    }

    tab.addEventListener("click", function () { switchWall(w.id); });
    tab.addEventListener("dblclick", function () {
      const name2 = window.prompt("Rename this wall", w.name);
      if (name2 && name2.trim()) {
        w.name = name2.trim();
        saveWalls();
        renderWallBar();
      }
    });
    wallBar.appendChild(tab);
  });

  const add = document.createElement("button");
  add.type = "button";
  add.className = "wall-add";
  add.textContent = "+ Add wall";
  add.title = "Add a new wall";
  add.addEventListener("click", function () {
    const name = window.prompt("Name your new wall", "Wall " + (walls.length + 1));
    if (name && name.trim()) {
      const w = { id: newId("w"), name: name.trim(), notes: [], drawing: null };
      walls.push(w);
      saveWalls();
      switchWall(w.id);
    }
  });
  wallBar.appendChild(add);
}

function switchWall(id) {
  if (id === currentWallId) return;
  saveDrawing(); // snapshot the current canvas into the current wall
  currentWallId = id;
  saveWalls();
  redrawDrawing(wall.clientWidth, wall.clientHeight);
  renderNotes();
  renderWallBar();
}

function deleteWall(id) {
  const w = walls.find(function (x) { return x.id === id; });
  if (!w) return;
  if (!window.confirm('Delete wall "' + w.name + '" with everything on it?')) return;
  const idx = walls.indexOf(w);
  walls.splice(idx, 1);
  if (!walls.length) {
    walls.push({ id: newId("w"), name: "My Wall", notes: [], drawing: null });
  }
  if (currentWallId === id) {
    currentWallId = walls[Math.min(idx, walls.length - 1)].id;
    redrawDrawing(wall.clientWidth, wall.clientHeight);
    renderNotes();
  }
  saveWalls();
  renderWallBar();
}

/* ============ tools ============ */
function setTool(t) {
  activeTool = (activeTool === t) ? null : t;
  penBtn.classList.toggle("active", activeTool === "draw");
  eraserBtn.classList.toggle("active", activeTool === "eraser");
  // hide the OS cursor over the wall; the pencil/eraser overlay replaces it
  wall.style.cursor = activeTool ? "none" : "default";
  toolCursor.classList.toggle("mode-draw", activeTool === "draw");
  toolCursor.classList.toggle("mode-eraser", activeTool === "eraser");
  if (!activeTool) toolCursor.classList.add("hidden");
}
penBtn.addEventListener("click", function () { setTool("draw"); });
eraserBtn.addEventListener("click", function () { setTool("eraser"); });

/* cursor overlay: the pencil tip / eraser range follows the pointer */
document.addEventListener("mousemove", function (e) {
  if (!activeTool || !e.target || !e.target.closest) return;
  const overWall = e.target.closest(".wall");
  const blocked = e.target.closest(".note") || e.target.closest(".add-note");
  if (!overWall || blocked) {
    toolCursor.classList.add("hidden");
    return;
  }
  toolCursor.classList.remove("hidden");
  // anchor the icon to the exact point the ink will land on, computed
  // through the same buffer mapping the drawing itself uses
  const crect = canvas.getBoundingClientRect();
  const point = canvasPoint(e);
  const wrect = wall.getBoundingClientRect();
  toolCursor.style.left = (crect.left + point.x * (crect.width / canvas.width) - wrect.left) + "px";
  toolCursor.style.top = (crect.top + point.y * (crect.height / canvas.height) - wrect.top) + "px";
});
document.documentElement.addEventListener("mouseleave", function () {
  toolCursor.classList.add("hidden");
});

/* ============ tool option panels (right-click the pen / eraser icon) ============ */
function hidePanels() {
  penPanel.classList.add("hidden");
  eraserPanel.classList.add("hidden");
}

function placePanel(panel, btn) {
  const r = btn.getBoundingClientRect();
  const pw = panel.offsetWidth;
  const ph = panel.offsetHeight;
  let left = Math.min(r.right - pw, window.innerWidth - pw - 8);
  left = Math.max(8, left);
  let top = r.bottom + 8;
  if (top + ph > window.innerHeight - 8) top = r.top - ph - 8;
  top = Math.max(8, top);
  panel.style.left = left + "px";
  panel.style.top = top + "px";
}

function syncPenPanel() {
  penPanel.querySelectorAll("[data-mode]").forEach(function (b) {
    b.classList.toggle("active", b.dataset.mode === penMode);
  });
  penPanel.querySelectorAll("[data-width]").forEach(function (b) {
    b.classList.toggle("active", Number(b.dataset.width) === penWidth);
  });
  penPanel.querySelectorAll("[data-color]").forEach(function (b) {
    b.classList.toggle("active", b.dataset.color === penColor);
  });
}

function togglePanel(panel, btn) {
  const wasHidden = panel.classList.contains("hidden");
  hidePanels();
  if (!wasHidden) return;
  panel.classList.remove("hidden");
  placePanel(panel, btn);
  if (panel === penPanel) syncPenPanel();
}

penBtn.addEventListener("contextmenu", function (e) {
  e.preventDefault();
  togglePanel(penPanel, penBtn);
});
eraserBtn.addEventListener("contextmenu", function (e) {
  e.preventDefault();
  togglePanel(eraserPanel, eraserBtn);
});

penPanel.addEventListener("click", function (e) {
  const modeBtn = e.target.closest("[data-mode]");
  if (modeBtn) { penMode = modeBtn.dataset.mode; syncPenPanel(); return; }
  const widthBtn = e.target.closest("[data-width]");
  if (widthBtn) { penWidth = Number(widthBtn.dataset.width); syncPenPanel(); return; }
  const colorBtn = e.target.closest("[data-color]");
  if (colorBtn) { penColor = colorBtn.dataset.color; syncPenPanel(); return; }
});

eraserRange.addEventListener("input", function () {
  eraserWidth = Number(eraserRange.value);
  eraserSizeLabel.textContent = String(eraserWidth);
  updateEraserRing();
});

function updateEraserRing() {
  eraserRing.style.width = eraserWidth + "px";
  eraserRing.style.height = eraserWidth + "px";
  eraserRing.style.left = (-eraserWidth / 2) + "px";
  eraserRing.style.top = (-eraserWidth / 2) + "px";
}

document.addEventListener("mousedown", function (e) {
  if (e.target.closest(".context-panel")) return;
  if (e.target.closest("#penBtn") || e.target.closest("#eraserBtn")) return;
  hidePanels();
});

/* ============ drawing: quick right-click = add note, left-drag with a picked tool = draw or erase ============ */
wall.addEventListener("contextmenu", function (e) { e.preventDefault(); });

wall.addEventListener("mousedown", function (e) {
  if (e.button !== 0 && e.button !== 2) return;
  if (e.target.closest(".note") || e.target.closest(".add-note")) return;
  if (e.button === 2) {
    e.preventDefault();
    pressed = { x: e.clientX, y: e.clientY, button: 2 };
    return; // right button only adds a note on quick click
  }
  if (!activeTool) return; // left button needs a picked tool
  pressed = { x: e.clientX, y: e.clientY, button: 0 };
  strokeActive = false;
  applyTool(activeTool);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const start = canvasPoint(e);
  if (activeTool === "draw" && penMode !== "free") {
    strokeStart = start;
    strokeSnap = snapshotCanvas();
  } else {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
  }
});

wall.addEventListener("mousemove", function (e) {
  if (!pressed) return;
  if (pressed.button !== 0) return;
  if (!strokeActive) {
    const moved = Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > DRAG_THRESHOLD;
    if (!moved) return;
    strokeActive = true;
    if (addBox) { addBox.remove(); addBox = null; }
  }
  const point = canvasPoint(e);
  if (activeTool === "draw" && penMode !== "free") {
    // live preview: restore the snapshot then draw the shape from the anchor
    restoreSnapshot(strokeSnap);
    drawShape(strokeStart, point);
    return;
  }
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
});

window.addEventListener("mouseup", function (e) {
  if (!pressed || e.button !== pressed.button) return;
  const wasDrawing = strokeActive;
  const button = pressed.button;
  pressed = null;
  strokeActive = false;
  strokeStart = null;
  strokeSnap = null;
  if (wasDrawing) saveDrawing();
  else if (button === 2) openAddBox(e.clientX, e.clientY);
});

window.addEventListener("blur", function () {
  pressed = null;
  strokeActive = false;
  strokeStart = null;
  strokeSnap = null;
});

/* ============ keyboard ============ */
document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape") return;
  hidePanels();
  if (!modal.classList.contains("hidden")) closeModal();
  else if (addBox) { addBox.remove(); addBox = null; }
});

/* ============ init ============ */
function init() {
  loadWalls();
  resizeCanvas();
  renderNotes();
  renderWallBar();
  updateEraserRing();
  window.addEventListener("resize", resizeCanvas);
}
init();
