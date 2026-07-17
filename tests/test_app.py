"""
test_app.py
-------------------------------------------------------------------
Lightweight smoke tests for the Flask backend. Run with:

    cd backend && pytest ../tests -v

No live Gemini key is required — GEMINI_API_KEY is intentionally left
unset so these tests exercise the offline fallback generator, which
also doubles as a regression test for "the app must never completely
fail even if the AI provider is unreachable."
-------------------------------------------------------------------
"""

import os
import sys
import io

os.environ.setdefault("GEMINI_API_KEY", "")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
import app as flask_app  # noqa: E402


import pytest


@pytest.fixture()
def client(tmp_path):
    flask_app.DB_PATH = str(tmp_path / "test.db")
    flask_app.init_db()
    flask_app.app.config["TESTING"] = True
    with flask_app.app.test_client() as c:
        yield c


SAMPLE_TEXT = (
    "Newtons second law states that force equals mass times acceleration. "
    "Gravity is the force that attracts two bodies toward each other. "
    "Energy cannot be created or destroyed, only converted between forms."
)


def test_paste_generates_flashcards_via_fallback(client):
    resp = client.post("/api/paste", json={"text": SAMPLE_TEXT, "subject": "Physics"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["count"] > 0
    assert data["used_fallback"] is True  # no API key set -> offline generator


def test_paste_rejects_short_text(client):
    resp = client.post("/api/paste", json={"text": "too short"})
    assert resp.status_code == 400


def test_upload_txt_file(client):
    data = {
        "files": (io.BytesIO(SAMPLE_TEXT.encode()), "notes.txt"),
        "subject": "Physics",
        "mode": "combined",
    }
    resp = client.post("/api/upload", data=data, content_type="multipart/form-data")
    assert resp.status_code == 200
    assert resp.get_json()["count"] > 0


def test_upload_rejects_unsupported_extension(client):
    data = {"files": (io.BytesIO(b"binary junk"), "malware.exe")}
    resp = client.post("/api/upload", data=data, content_type="multipart/form-data")
    assert resp.status_code == 422
    assert resp.get_json()["results"][0]["status"] == "failed"


def test_flashcard_crud_and_favorite(client):
    client.post("/api/paste", json={"text": SAMPLE_TEXT, "subject": "Physics"})
    card_id = client.get("/api/flashcards").get_json()[0]["id"]

    fav = client.patch(f"/api/flashcards/{card_id}/favorite")
    assert fav.get_json()["favorite"] is True

    edit = client.put(f"/api/flashcards/{card_id}", json={"answer": "Updated"})
    assert edit.status_code == 200

    delete = client.delete(f"/api/flashcards/{card_id}")
    assert delete.status_code == 200

    missing = client.delete(f"/api/flashcards/{card_id}")
    assert missing.status_code == 404


def test_exports_return_valid_content_types(client):
    client.post("/api/paste", json={"text": SAMPLE_TEXT, "subject": "Physics"})
    assert client.get("/api/export/csv").status_code == 200
    assert client.get("/api/export/json").status_code == 200
    assert client.get("/api/export/pdf").status_code == 200


def test_quiz_returns_404_when_no_eligible_cards(client):
    resp = client.get("/api/quiz")
    assert resp.status_code == 404


def test_offline_fallback_generator_never_raises():
    # Garbage input should degrade gracefully to an empty list, not crash.
    assert flask_app.generate_basic_flashcards("") == []
    assert flask_app.generate_basic_flashcards("   \n\n   ") == []
