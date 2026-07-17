/**
 * script.js
 * All frontend logic — no framework, just fetch() calls to the Flask API.
 * Organized by page: navigation, Generate, Flashcards, Study Mode,
 * Quiz Mode, History, and the shared Edit modal.
 */

const MAX_FILES = 10;
let selectedFiles = [];
let allSubjects = [];

// ---------------- Dark mode ----------------
(function () {
  const root = document.documentElement;
  const saved = localStorage.getItem("theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  root.setAttribute("data-theme", saved);

  document.addEventListener("DOMContentLoaded", () => {
    updateToggleLabel(saved);
    document.getElementById("theme-toggle").addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
      updateToggleLabel(next);
    });
  });

  function updateToggleLabel(theme) {
    document.getElementById("theme-toggle").textContent = theme === "dark" ? "☀ Light Mode" : "◐ Dark Mode";
  }
})();

// ---------------- Init ----------------
document.addEventListener("DOMContentLoaded", () => {
  setupNav();
  setupTabs();
  setupDropzone();
  setupForms();
  setupFilters();
  setupModal();
  setupStudyMode();
  setupQuizMode();
  loadSubjects();
  loadFlashcards();
});

// ---------------- Page navigation ----------------
function setupNav() {
  const buttons = document.querySelectorAll(".nav-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
      document.getElementById(btn.dataset.page).classList.add("active");

      if (btn.dataset.page === "study-page") loadStudyCards();
      if (btn.dataset.page === "history-page") loadHistory();
      if (btn.dataset.page === "quiz-page") resetQuizSetup();
    });
  });
}

// ---------------- Generate: tabs ----------------
function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      panels.forEach((p) => (p.style.display = p.id === btn.dataset.tab ? "block" : "none"));
    });
  });
}

// ---------------- Generate: multi-file dropzone ----------------
function setupDropzone() {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");

  dropzone.addEventListener("click", () => fileInput.click());
  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("drag-over"); })
  );
  dropzone.addEventListener("drop", (e) => {
    addFiles(Array.from(e.dataTransfer.files));
  });
  fileInput.addEventListener("change", () => {
    addFiles(Array.from(fileInput.files));
    fileInput.value = ""; // allow re-selecting the same file later
  });
}

function addFiles(newFiles) {
  for (const f of newFiles) {
    if (selectedFiles.length >= MAX_FILES) {
      showStatus(`You can upload at most ${MAX_FILES} files at a time.`, "error");
      break;
    }
    if (!selectedFiles.some((f2) => f2.name === f.name && f2.size === f.size)) {
      selectedFiles.push(f);
    }
  }
  renderFileList();
}

function renderFileList() {
  const list = document.getElementById("file-list");
  const label = document.getElementById("dropzone-text");
  label.textContent = selectedFiles.length
    ? `${selectedFiles.length} file(s) selected — drop more or click to add`
    : "Drag & drop up to 10 files here, or click to browse";

  list.innerHTML = selectedFiles.map((f, i) => `
    <li>
      <span>${escapeHtml(f.name)} <span style="color:var(--text-muted);">(${(f.size / 1024).toFixed(0)} KB)</span></span>
      <button type="button" class="file-remove" onclick="removeFile(${i})">&times;</button>
    </li>
  `).join("");
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFileList();
}

// ---------------- Generate: forms ----------------
function setupForms() {
  document.getElementById("file-tab").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selectedFiles.length) return showStatus("Please choose at least one file.", "error");

    const formData = new FormData();
    selectedFiles.forEach((f) => formData.append("files", f));
    formData.append("subject", document.getElementById("subject-file").value.trim());
    formData.append("mode", document.querySelector('input[name="upload-mode"]:checked').value);

    await runGeneration("file-submit-btn", () =>
      fetch("/api/upload", { method: "POST", body: formData }), true
    );
  });

  document.getElementById("paste-tab").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = document.getElementById("pasted-text").value.trim();
    if (text.length < 40) return showStatus("Please paste at least a few sentences.", "error");

    await runGeneration("paste-submit-btn", () =>
      fetch("/api/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, subject: document.getElementById("subject-paste").value.trim() }),
      }), false
    );
  });
}

async function runGeneration(buttonId, requestFn, showProgress) {
  const btn = document.getElementById(buttonId);
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating flashcards…';

  const progressWrap = document.getElementById("upload-progress");
  const progressFill = document.getElementById("progress-bar-fill");
  const resultsWrap = document.getElementById("upload-results");
  resultsWrap.innerHTML = "";
  if (showProgress) {
    progressWrap.style.display = "block";
    progressFill.style.width = "40%";
  }

  try {
    const res = await requestFn();
    if (showProgress) progressFill.style.width = "100%";
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong.");

    showStatus(data.message, "success");

    if (data.results) {
      resultsWrap.innerHTML = data.results.map((r) => `
        <div class="upload-result-row">
          <span>${escapeHtml(r.filename)}</span>
          <span class="file-status ${r.status === "ready" ? "ready" : "failed"}">
            ${r.status === "ready" ? `✓ ${r.card_count !== undefined ? r.card_count + " cards" : "ready"}` : `✗ ${escapeHtml(r.error || "failed")}`}
          </span>
        </div>
      `).join("");
    }

    selectedFiles = [];
    renderFileList();
    await loadSubjects();
    await loadFlashcards();
  } catch (err) {
    showStatus(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
    setTimeout(() => { progressWrap.style.display = "none"; progressFill.style.width = "0%"; }, 800);
  }
}

function showStatus(message, type) {
  const el = document.getElementById("status-message");
  el.textContent = message;
  el.className = type;
  setTimeout(() => { el.textContent = ""; el.className = ""; }, 7000);
}

// ---------------- Flashcards: filters ----------------
function setupFilters() {
  ["search-input", "subject-filter", "type-filter", "difficulty-filter", "favorite-filter"].forEach((id) => {
    const el = document.getElementById(id);
    const evt = el.type === "checkbox" ? "change" : (el.tagName === "SELECT" ? "change" : "input");
    let debounce;
    el.addEventListener(evt, () => {
      clearTimeout(debounce);
      debounce = setTimeout(loadFlashcards, 250);
    });
  });
}

async function loadSubjects() {
  try {
    const res = await fetch("/api/subjects");
    allSubjects = await res.json();
    const options = '<option value="">All Subjects</option>' +
      allSubjects.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    ["subject-filter", "study-subject-filter", "quiz-subject-filter"].forEach((id) => {
      const select = document.getElementById(id);
      const current = select.value;
      const placeholder = id === "quiz-subject-filter" ? '<option value="">All Subjects (mixed)</option>' : '<option value="">All Subjects</option>';
      select.innerHTML = placeholder + allSubjects.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
      select.value = current;
    });
  } catch (e) { /* non-critical */ }
}

// ---------------- Flashcards: load + render ----------------
async function loadFlashcards() {
  const params = new URLSearchParams({
    q: document.getElementById("search-input").value.trim(),
    subject: document.getElementById("subject-filter").value,
    card_type: document.getElementById("type-filter").value,
    difficulty: document.getElementById("difficulty-filter").value,
  });
  if (document.getElementById("favorite-filter").checked) params.set("favorite", "true");

  const res = await fetch(`/api/flashcards?${params.toString()}`);
  const cards = await res.json();
  renderCards(cards);
}

function renderCards(cards) {
  const grid = document.getElementById("card-grid");
  const empty = document.getElementById("empty-state");
  document.getElementById("card-count").textContent = `My Flashcards (${cards.length})`;

  if (!cards.length) {
    grid.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  grid.innerHTML = cards.map((card) => `
    <div class="flip-card" data-id="${card.id}">
      <div class="flip-card-inner">
        <div class="flip-card-front" onclick="this.closest('.flip-card').classList.toggle('flipped')">
          <div class="flip-card-meta">
            <span class="badge badge-type">${formatType(card.card_type)}</span>
            <span class="badge badge-${card.difficulty}">${card.difficulty}</span>
          </div>
          <div class="flip-card-body"><strong>${escapeHtml(card.term || card.question || "")}</strong></div>
          <p class="flip-card-hint">Click to reveal answer</p>
        </div>
        <div class="flip-card-back" onclick="this.closest('.flip-card').classList.toggle('flipped')">
          <div class="flip-card-body">
            ${escapeHtml(card.answer)}
            ${card.card_type === "mcq" && card.options.length ? renderOptions(card) : ""}
            ${card.explanation ? `<p style="margin-top:8px; font-size:0.78rem; color:var(--text-secondary);">${escapeHtml(card.explanation)}</p>` : ""}
          </div>
          <div class="flip-card-actions" onclick="event.stopPropagation()">
            <button class="favorite-star ${card.favorite ? "active" : ""}" onclick="toggleFavorite(${card.id}, this)">★</button>
            <button class="btn btn-secondary btn-sm" onclick='openEditModal(${JSON.stringify(card)})'>Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteCard(${card.id})">Delete</button>
          </div>
        </div>
      </div>
    </div>
  `).join("");
}

function renderOptions(card) {
  const items = card.options.map((opt) =>
    `<li class="${opt === card.answer ? "correct-option" : ""}">${escapeHtml(opt)}</li>`
  ).join("");
  return `<ul class="mcq-options">${items}</ul>`;
}

function formatType(type) {
  return type.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---------------- Favorites ----------------
async function toggleFavorite(id, btnEl) {
  try {
    const res = await fetch(`/api/flashcards/${id}/favorite`, { method: "PATCH" });
    const data = await res.json();
    btnEl.classList.toggle("active", data.favorite);
  } catch (e) {
    console.error("Failed to toggle favorite", e);
  }
}

// ---------------- Delete ----------------
async function deleteCard(id) {
  if (!confirm("Delete this flashcard?")) return;
  await fetch(`/api/flashcards/${id}`, { method: "DELETE" });
  loadFlashcards();
}

// ---------------- Edit modal ----------------
function setupModal() {
  document.getElementById("modal-close-btn").addEventListener("click", closeEditModal);
  document.getElementById("edit-modal").addEventListener("click", (e) => {
    if (e.target.id === "edit-modal") closeEditModal();
  });
  document.getElementById("edit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("edit-id").value;
    const payload = {
      term: document.getElementById("edit-term").value,
      question: document.getElementById("edit-question").value,
      answer: document.getElementById("edit-answer").value,
      explanation: document.getElementById("edit-explanation").value,
      topic: document.getElementById("edit-topic").value,
      difficulty: document.getElementById("edit-difficulty").value,
    };
    await fetch(`/api/flashcards/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    closeEditModal();
    loadFlashcards();
  });
}

function openEditModal(card) {
  document.getElementById("edit-id").value = card.id;
  document.getElementById("edit-term").value = card.term || "";
  document.getElementById("edit-question").value = card.question || "";
  document.getElementById("edit-answer").value = card.answer || "";
  document.getElementById("edit-explanation").value = card.explanation || "";
  document.getElementById("edit-topic").value = card.topic || "";
  document.getElementById("edit-difficulty").value = card.difficulty || "medium";
  document.getElementById("edit-modal").classList.add("open");
}

function closeEditModal() {
  document.getElementById("edit-modal").classList.remove("open");
}

// ================================================================
// STUDY MODE — sequential viewer with prev/next/shuffle
// ================================================================
let studyCards = [];
let studyIndex = 0;

function setupStudyMode() {
  document.getElementById("study-subject-filter").addEventListener("change", loadStudyCards);
  document.getElementById("study-prev").addEventListener("click", () => moveStudy(-1));
  document.getElementById("study-next").addEventListener("click", () => moveStudy(1));
  document.getElementById("study-shuffle").addEventListener("click", () => {
    studyCards = shuffleArray(studyCards);
    studyIndex = 0;
    renderStudyCard();
  });
}

async function loadStudyCards() {
  const subject = document.getElementById("study-subject-filter").value;
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  const res = await fetch(`/api/flashcards?${params.toString()}`);
  studyCards = await res.json();
  studyIndex = 0;

  const empty = document.getElementById("study-empty");
  const stage = document.getElementById("study-stage");
  if (!studyCards.length) {
    empty.style.display = "block";
    stage.style.display = "none";
    return;
  }
  empty.style.display = "none";
  stage.style.display = "flex";
  renderStudyCard();
}

function renderStudyCard() {
  if (!studyCards.length) return;
  const card = studyCards[studyIndex];
  const flipCard = document.getElementById("study-flip-card");
  flipCard.classList.remove("flipped");
  document.getElementById("study-question").innerHTML = `<strong>${escapeHtml(card.term || card.question || "")}</strong>`;
  let answerHtml = escapeHtml(card.answer);
  if (card.explanation) answerHtml += `<div style="margin-top:10px; font-size:0.82rem; color:var(--text-secondary);">${escapeHtml(card.explanation)}</div>`;
  document.getElementById("study-answer").innerHTML = answerHtml;
  document.getElementById("study-progress-label").textContent = `Card ${studyIndex + 1} of ${studyCards.length}`;
}

function moveStudy(delta) {
  if (!studyCards.length) return;
  studyIndex = (studyIndex + delta + studyCards.length) % studyCards.length;
  renderStudyCard();
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ================================================================
// QUIZ MODE — MCQ / True-False / Fill-in-the-Blank with scoring
// ================================================================

function setupQuizMode() {
  document.getElementById("start-quiz-btn").addEventListener("click", startQuiz);
}

function resetQuizSetup() {
  document.getElementById("quiz-setup").style.display = "block";
  document.getElementById("quiz-app").innerHTML = "";
}

async function startQuiz() {
  const subject = document.getElementById("quiz-subject-filter").value;
  const params = new URLSearchParams({ count: "10" });
  if (subject) params.set("subject", subject);

  const btn = document.getElementById("start-quiz-btn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Loading quiz…';

  try {
    const res = await fetch(`/api/quiz?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not start quiz.");

    document.getElementById("quiz-setup").style.display = "none";
    runQuiz(data, subject);
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Start Quiz";
  }
}

function runQuiz(cards, subject) {
  const app = document.getElementById("quiz-app");
  let index = 0, correctCount = 0;
  const weakTopics = new Set();

  function renderQuestion() {
    const card = cards[index];
    let bodyHtml = "";

    if (card.card_type === "mcq") {
      bodyHtml = card.options.map((opt) =>
        `<button class="quiz-option" data-value="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`
      ).join("");
    } else if (card.card_type === "true_false") {
      bodyHtml = `<button class="quiz-option" data-value="True">True</button><button class="quiz-option" data-value="False">False</button>`;
    } else {
      bodyHtml = `
        <input type="text" class="input" id="free-answer" placeholder="Type your answer..." autocomplete="off">
        <button class="btn btn-primary" id="submit-free-answer" style="margin-top:12px;">Submit</button>`;
    }

    app.innerHTML = `
      <div class="quiz-progress-header">
        <span>Question ${index + 1} of ${cards.length}</span>
        <span>${subject || "Mixed Subjects"}</span>
      </div>
      <div class="card quiz-question-card">
        <p class="quiz-question-text">${escapeHtml(card.question || card.term)}</p>
        <div id="options-wrap">${bodyHtml}</div>
        <div id="feedback-wrap"></div>
      </div>`;

    if (card.card_type === "mcq" || card.card_type === "true_false") {
      document.querySelectorAll(".quiz-option").forEach((b) => b.addEventListener("click", () => submitAnswer(b.dataset.value, b)));
    } else {
      document.getElementById("submit-free-answer").addEventListener("click", () => {
        const val = document.getElementById("free-answer").value.trim();
        if (val) submitAnswer(val, null);
      });
    }
  }

  function submitAnswer(value, clickedBtn) {
    const card = cards[index];
    document.querySelectorAll(".quiz-option").forEach((b) => (b.disabled = true));
    const submitBtn = document.getElementById("submit-free-answer");
    if (submitBtn) submitBtn.disabled = true;

    const isCorrect = value.trim().toLowerCase() === card.answer.trim().toLowerCase();
    if (isCorrect) correctCount += 1;
    else if (card.topic) weakTopics.add(card.topic);

    if (clickedBtn) {
      clickedBtn.classList.add(isCorrect ? "correct" : "incorrect");
      if (!isCorrect) {
        document.querySelectorAll(".quiz-option").forEach((b) => {
          if (b.dataset.value.toLowerCase() === card.answer.toLowerCase()) b.classList.add("correct");
        });
      }
    }

    document.getElementById("feedback-wrap").innerHTML = `
      <div class="quiz-feedback ${isCorrect ? "correct" : "incorrect"}">
        ${isCorrect ? "✓ Correct!" : `✗ Not quite — correct answer: ${escapeHtml(card.answer)}`}
      </div>
      <button class="btn btn-primary btn-block" style="margin-top:14px;" id="next-question-btn">
        ${index + 1 < cards.length ? "Next Question →" : "See Results"}
      </button>`;

    document.getElementById("next-question-btn").addEventListener("click", () => {
      index += 1;
      if (index < cards.length) renderQuestion();
      else showResults();
    });
  }

  function showResults() {
    const scorePercent = Math.round((correctCount / cards.length) * 100);
    app.innerHTML = `
      <div class="card quiz-summary">
        <div class="quiz-score-circle" style="--score:${scorePercent}"><span>${scorePercent}%</span></div>
        <h2>${correctCount} / ${cards.length} correct</h2>
        <div class="quiz-stats-row">
          <span>✓ Correct: ${correctCount}</span>
          <span>✗ Wrong: ${cards.length - correctCount}</span>
          <span>🎯 Accuracy: ${scorePercent}%</span>
        </div>
        <p style="color:var(--text-secondary); margin-top:4px;">
          ${weakTopics.size ? `Focus areas: ${Array.from(weakTopics).join(", ")}` : "Great work across all topics!"}
        </p>
        <button class="btn btn-primary" style="margin-top:20px;" onclick="resetQuizSetup()">Take Another Quiz</button>
      </div>`;
  }

  renderQuestion();
}

// ================================================================
// HISTORY — past uploads and their status
// ================================================================

async function loadHistory() {
  const res = await fetch("/api/documents");
  const docs = await res.json();
  const list = document.getElementById("history-list");
  const empty = document.getElementById("history-empty");

  if (!docs.length) {
    list.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  list.innerHTML = docs.map((d) => `
    <div class="history-row">
      <div>
        <strong>${escapeHtml(d.filename)}</strong>
        <div class="history-meta">${d.source_type.toUpperCase()} · ${d.subject ? escapeHtml(d.subject) : "No subject"} · ${new Date(d.created_at).toLocaleString()}</div>
        ${d.status === "failed" ? `<div class="history-meta" style="color:var(--color-danger);">${escapeHtml(d.error_message || "Failed")}</div>` : ""}
      </div>
      <span class="badge ${d.status === "ready" ? "badge-easy" : d.status === "failed" ? "badge-hard" : "badge-medium"}">
        ${d.status}${d.card_count ? ` · ${d.card_count} cards` : ""}
      </span>
    </div>
  `).join("");
}
