"use strict";

/* ============ elements ============ */
const wall = document.getElementById("wall");
const canvas = document.getElementById("drawCanvas");
const ctx = canvas.getContext("2d");
const notesLayer = document.getElementById("notesLayer");
const emptyHint = document.getElementById("emptyHint");
const modal = document.getElementById("noteModal");
const modalNote = document.getElementById("modalNote");
const modalText = document.getElementById("modalText");
const modalEdit = document.getElementById("modalEdit");
const editBtn = document.getElementById("editBtn");
const saveBtn = document.getElementById("saveBtn");
const deleteBtn = document.getElementById("deleteBtn");
const closeBtn = document.getElementById("closeBtn");
const drawBtn = document.getElementById("drawBtn");
const eraserBtn = document.getElementById("eraserBtn");

/* ============ constants ============ */
const STORAGE_NOTES = "ideaWall.notes";
const STORAGE_DRAWING = "ideaWall.drawing";
const NOTE_COLOR = "#fff176"; // classic sticky-note yellow
const PEN_COLOR = "rgba(43, 27, 13, 0.88)"; // dark marker on the wood wall
const PEN_WIDTH = 3;
const ERASER_WIDTH = 42;
const DRAG_THRESHOLD = 5; // px of movement before a right-press becomes drawing

/* ============ state ============ */
let notes = [];           // { id, x, y, text, color, rot }
let tool = "draw";        // "draw" | "eraser"
let savedDrawing = null;  // last drawing snapshot (dataURL)
let pressed = null;       // press point { x, y, button }
let strokeActive = false; // right-drag has become a stroke
let addBox = null;        // current add-note input element
let currentId = null;     // note id shown in the modal

/* ============ drawing layer ============ */
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(wall.clientWidth * dpr);
  canvas.height = Math.round(wall.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redrawDrawing();
}

function redrawDrawing() {
  ctx.clearRect(0, 0, wall.clientWidth, wall.clientHeight);
  if (!savedDrawing) return;
  const img = new Image();
  img.onload = function () {
    ctx.drawImage(img, 0, 0, wall.clientWidth, wall.clientHeight);
  };
  img.src = savedDrawing;
}

function saveDrawing() {
  savedDrawing = canvas.toDataURL();
  localStorage.setItem(STORAGE_DRAWING, savedDrawing);
}

/* ============ notes ============ */
function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_NOTES);
    notes = raw ? JSON.parse(raw) : [];
  } catch (err) {
    notes = [];
  }
}

function saveNotes() {
  localStorage.setItem(STORAGE_NOTES, JSON.stringify(notes));
}

function renderNotes() {
  notesLayer.innerHTML = "";
  notes.forEach(function (note) {
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
  emptyHint.classList.toggle("hidden", notes.length > 0);
}

function addNote(x, y, text) {
  const note = {
    id: "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    x: Math.round(Math.max(8, Math.min(wall.clientWidth - 160, x - 76))),
    y: Math.round(Math.max(64, Math.min(wall.clientHeight - 120, y - 60))),
    text: text,
    rot: (Math.random() * 8 - 4).toFixed(1)
  };
  notes.push(note);
  saveNotes();
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
  const note = notes.find(function (n) { return n.id === el.dataset.id; });
  if (note) openModal(note);
});

function openModal(note) {
  currentId = note.id;
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
  currentId = null;
}

editBtn.addEventListener("click", function () {
  modalText.classList.add("hidden");
  modalEdit.classList.remove("hidden");
  editBtn.classList.add("hidden");
  saveBtn.classList.remove("hidden");
  modalEdit.focus();
});

saveBtn.addEventListener("click", function () {
  const note = notes.find(function (n) { return n.id === currentId; });
  const text = modalEdit.value.trim();
  if (note && text) {
    note.text = text;
    saveNotes();
    renderNotes();
  }
  closeModal();
});

deleteBtn.addEventListener("click", function () {
  notes = notes.filter(function (n) { return n.id !== currentId; });
  saveNotes();
  renderNotes();
  closeModal();
});

closeBtn.addEventListener("click", closeModal);
modal.addEventListener("mousedown", function (e) {
  if (e.target === modal) closeModal();
});
modalEdit.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveBtn.click();
});

/* ============ tools ============ */
function setTool(t) {
  tool = t;
  drawBtn.classList.toggle("active", t === "draw");
  eraserBtn.classList.toggle("active", t === "eraser");
}
drawBtn.addEventListener("click", function () { setTool("draw"); });
eraserBtn.addEventListener("click", function () { setTool("eraser"); });

/* ============ drawing: quick right-click = add note, drag (left or right) = draw ============ */
wall.addEventListener("contextmenu", function (e) { e.preventDefault(); });

wall.addEventListener("mousedown", function (e) {
  if (e.button !== 0 && e.button !== 2) return;
  if (e.target.closest(".note") || e.target.closest(".add-note")) return;
  if (e.button === 2) e.preventDefault();
  pressed = { x: e.clientX, y: e.clientY, button: e.button };
  strokeActive = false;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(e.clientX, e.clientY);
});

wall.addEventListener("mousemove", function (e) {
  if (!pressed) return;
  if (!strokeActive) {
    const moved = Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > DRAG_THRESHOLD;
    if (!moved) return;
    strokeActive = true;
    if (addBox) { addBox.remove(); addBox = null; }
    if (tool === "draw") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = PEN_COLOR;
      ctx.lineWidth = PEN_WIDTH;
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = ERASER_WIDTH;
    }
  }
  ctx.lineTo(e.clientX, e.clientY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(e.clientX, e.clientY);
});

window.addEventListener("mouseup", function (e) {
  if (!pressed || e.button !== pressed.button) return;
  const wasDrawing = strokeActive;
  const button = pressed.button;
  pressed = null;
  strokeActive = false;
  if (wasDrawing) saveDrawing();
  else if (button === 2) openAddBox(e.clientX, e.clientY);
});

window.addEventListener("blur", function () {
  pressed = null;
  strokeActive = false;
});

/* ============ keyboard ============ */
document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape") return;
  if (!modal.classList.contains("hidden")) closeModal();
  else if (addBox) { addBox.remove(); addBox = null; }
});

/* ============ init ============ */
function init() {
  loadNotes();
  savedDrawing = localStorage.getItem(STORAGE_DRAWING) || null;
  resizeCanvas();
  renderNotes();
  window.addEventListener("resize", resizeCanvas);
}
init();
