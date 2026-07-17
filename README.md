# 🧠 AI Flashcard Generator

A full-stack web app that converts study material (PDF, DOCX, TXT, PPTX,
images, or pasted text) into flashcards using the Gemini API — with search,
filtering, favorites, Study Mode, Quiz Mode, upload history, and CSV/JSON/PDF
export. Built with **Flask + vanilla JS + SQLite** — no frontend framework,
no build step, no Docker.

> ⚠️ **If you're setting this up from an older clone**: an earlier version of
> this repo accidentally committed a real Gemini API key inside
> `backend/.env.example`. If you ever used that key, **revoke it immediately**
> at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
> and generate a new one — API keys should never be committed to source
> control, even as a "just an example" placeholder.

## Project Structure

```
flashcard-ai/
├── backend/
│   ├── app.py             # Flask app: routes, DB, text extraction, Gemini pipeline
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── tests/
│   └── test_app.py        # pytest smoke tests (run without any API key)
├── Procfile                # gunicorn entrypoint for deployment
├── LICENSE
└── README.md
```

Just one backend file — routes, SQLite access, text extraction, prompt
engineering, Gemini calls, and validation all live in `backend/app.py`,
organized into clearly commented sections rather than split into many
small files.

## Features

- Upload up to **10 files** at once (PDF / DOCX / TXT / PPTX / images with OCR), or paste text
- Two upload modes: merge all files into one deck (with duplicate-paragraph removal) or generate a separate deck per file
- Per-file error handling — one bad/corrupted file never blocks the rest
- AI pipeline: clean → de-duplicate → chunk → prompt → Gemini → validate → store (duplicate/near-duplicate cards are rejected too)
- **Offline fallback**: if Gemini is unreachable (no key, quota exceeded, network error) the app automatically falls back to a lightweight heuristic flashcard generator instead of failing the upload
- 6 flashcard types: Definition, Q&A, Fill-in-the-Blank, MCQ, Formula, True/False
- Flip-card UI, search & filter, favorites (⭐), inline edit/delete
- **Study Mode**: sequential flip-through with previous/next/shuffle
- **Quiz Mode**: auto-generated from your MCQ / True-False / Fill-in-the-Blank cards, with live scoring, accuracy, and weak-topic detection
- **Upload History**: every past upload with its status (ready/failed) and card count
- Export to CSV / JSON / PDF
- Dark mode

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # add your GEMINI_API_KEY
```

Install Tesseract OCR (needed for image uploads):
- macOS: `brew install tesseract`
- Ubuntu: `sudo apt install tesseract-ocr`
- Windows: [installer here](https://github.com/UB-Mannheim/tesseract/wiki)

Run it:

```bash
python app.py
```

Open **http://localhost:5000** — the Flask backend serves the frontend directly,
so there's no separate frontend server or build step.

Without a `GEMINI_API_KEY`, the app still works end-to-end using the offline
fallback generator — handy for trying it out or for CI, though real Gemini
flashcards are noticeably higher quality.

## Testing

```bash
pip install pytest   # already listed if you installed requirements.txt
cd backend && pytest ../tests -v
```

The test suite deliberately runs with no `GEMINI_API_KEY` set, so it also
verifies the offline fallback path never breaks.

## Deployment

A `Procfile` is included for platforms like Render, Railway, or Heroku:

```
web: cd backend && gunicorn --bind 0.0.0.0:$PORT app:app
```

Set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) as environment variables
on your host — never in a committed file. `FLASK_DEBUG` defaults to `false`;
leave it that way in any public deployment, since Flask's debugger allows
remote code execution if left on.

## How it works

1. You upload up to 10 files or paste text, optionally naming a subject.
2. The backend extracts raw text per file (PyMuPDF/python-docx/python-pptx/Tesseract
   depending on file type). A file that fails (corrupted, empty, unreadable) is
   recorded with a clear error and skipped — the rest keep processing.
3. In "combined" mode, all successfully extracted text is merged with
   paragraph-level de-duplication before being sent to the AI; in "separate"
   mode each file gets its own deck.
4. Text is cleaned and split into ~2200-character chunks.
5. Each chunk is sent to Gemini with a prompt that enforces a strict JSON
   schema, forbids hallucination, and asks the model to avoid repeating facts.
   If every chunk fails (e.g. no API key, quota exceeded, network error), the
   app falls back to a heuristic offline generator instead of failing outright.
6. Returned cards are validated (rejecting malformed types, MCQs with a
   missing correct option, empty answers, and duplicates of existing cards)
   before being saved to SQLite alongside a record in the `documents` table
   (used by the History page).
7. The frontend's Flashcards, Study Mode, and Quiz Mode pages all read from
   `/api/flashcards` (and `/api/quiz` for quiz-eligible types), so search,
   filter, favorite, edit, or delete actions are reflected everywhere.

## Tech notes

- Uses the current [Google GenAI SDK](https://ai.google.dev/gemini-api/docs/libraries) (`google-genai`) and `gemini-2.5-flash` by default — the older `google-generativeai` package and `gemini-1.5-flash` model are both fully retired.
- Uploaded files are saved with a random prefix and deleted immediately after text extraction, so nothing from a user's upload lingers on disk.
- All SQL is parameterized; all card content rendered in the frontend goes through `escapeHtml()` before hitting the DOM.
