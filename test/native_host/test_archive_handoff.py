import base64
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import fitz

from native_host.deeppapernote_host import ArchiveStore


def paper(version=1):
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text(
            (72, 72),
            f"Archive Handoff Paper\nAlice Example\narXiv:2601.12345v{version}\nAbstract\nPaper archives.",
        )
        return doc.tobytes()


def save(store, item, data):
    upload = store.handle({"version": 1, "type": "start", "item": item})["upload_id"]
    store.handle(
        {
            "version": 1,
            "type": "chunk",
            "upload_id": upload,
            "sequence": 0,
            "data": base64.b64encode(data).decode(),
        }
    )
    return store.handle(
        {
            "version": 1,
            "type": "finish",
            "upload_id": upload,
            "sha256": hashlib.sha256(data).hexdigest(),
        }
    )


class HandoffTest(unittest.TestCase):
    def test_preview_reuses_existing_directory_and_registers_versions(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = Path(tmp)
            (vault / "Research/Papers/New").mkdir(parents=True)
            existing = vault / "Elsewhere/Archive_Handoff_Paper"
            existing.mkdir(parents=True)
            (vault / 'Other/Archive_Handoff_Paper').mkdir(parents=True)
            original = paper(1)
            (existing / "original.pdf").write_bytes(original)
            item = {
                "title": "Archive Handoff Paper",
                "authorShortName": "Example",
                "year": "2026",
                "domain": "New",
                "arXiv": "2601.12345v2",
                "url": "https://arxiv.org/abs/2601.12345v2",
            }
            store = ArchiveStore(vault)
            try:
                preview = store.handle({"version": 1, "type": "preview", "item": item})
                self.assertEqual(preview["target_directory"], "Elsewhere/Archive_Handoff_Paper")
                saved = save(
                    store,
                    dict(item, target_directory=preview["target_directory"]),
                    paper(2),
                )
                self.assertEqual((vault / saved["path"]).parent, existing)
                record = json.loads((existing / ".deeppapernote.json").read_text())
                self.assertEqual(len(record["sources"]), 2)
                again = save(
                    store,
                    dict(
                        item,
                        arXiv="2601.12345v1",
                        url="https://arxiv.org/abs/2601.12345v1",
                    ),
                    original,
                )
                self.assertEqual(again["status"], "existing")
                self.assertEqual(Path(again["path"]).name, "original.pdf")
            finally:
                store.close()

    def test_note_only_directory_receives_pdf_without_rewriting_note(self):
        from native_host.paper_archive import new_record, register_source, write_record

        with tempfile.TemporaryDirectory() as tmp:
            vault = Path(tmp)
            folder = vault / "Notes/Archive_Handoff_Paper"
            folder.mkdir(parents=True)
            note = folder / "My-note.en.md"
            note.write_text("My edits stay intact.")
            data = paper(1)
            digest = hashlib.sha256(data).hexdigest()
            item = {
                "title": "Archive Handoff Paper",
                "authorShortName": "Example",
                "year": "2026",
                "arXiv": "2601.12345v1",
            }
            record = new_record(item["title"], "My-note", item)
            source = register_source(record, digest, {"arxiv_id": item["arXiv"]})
            source["notes"]["en"] = {
                "filename": note.name,
                "note_sha256": hashlib.sha256(note.read_bytes()).hexdigest(),
            }
            record["custom_field"] = "retained"
            write_record(folder, record)
            store = ArchiveStore(vault)
            try:
                result = save(store, item, data)
                updated = json.loads((folder / ".deeppapernote.json").read_text())
                self.assertEqual(Path(result["path"]).parent, Path("Notes/Archive_Handoff_Paper"))
                self.assertEqual(updated["sources"][digest]["notes"], source["notes"])
                self.assertEqual(updated["custom_field"], "retained")
                self.assertEqual(note.read_text(), "My edits stay intact.")
            finally:
                store.close()

    def test_mismatch_and_wrong_explicit_revision_never_place_pdf(self):
        from native_host.deeppapernote_host import ProtocolError

        with tempfile.TemporaryDirectory() as tmp:
            vault = Path(tmp)
            folder = vault / "Research/Papers/New/Archive_Handoff_Paper"
            folder.mkdir(parents=True)
            original = paper(1)
            (folder / "original.pdf").write_bytes(original)
            item = {
                "title": "Archive Handoff Paper",
                "authorShortName": "Example",
                "year": "2026",
                "domain": "New",
                "arXiv": "2601.12345v2",
            }
            store = ArchiveStore(vault)
            try:
                with self.assertRaisesRegex(ProtocolError, "pdf_version_mismatch"):
                    save(store, item, original)
                with self.assertRaisesRegex(ProtocolError, "pdf_work_identity_mismatch"):
                    save(store, dict(item, arXiv="2601.99999v1"), original)
                self.assertEqual(list(folder.iterdir()), [folder / "original.pdf"])
            finally:
                store.close()

    def test_registration_failure_retains_pdf_and_reports_incomplete(self):
        from unittest.mock import patch

        from native_host.deeppapernote_host import ProtocolError

        with tempfile.TemporaryDirectory() as tmp:
            vault = Path(tmp)
            (vault / "Research/Papers/New").mkdir(parents=True)
            item = {
                "title": "Archive Handoff Paper",
                "authorShortName": "Example",
                "year": "2026",
                "domain": "New",
                "arXiv": "2601.12345v1",
            }
            store = ArchiveStore(vault)
            data = paper(1)
            try:
                with patch(
                    "native_host.deeppapernote_host.write_record",
                    side_effect=OSError("disk error"),
                ):
                    with self.assertRaisesRegex(ProtocolError, "registration incomplete"):
                        save(store, item, data)
                retained = list(vault.rglob("*.pdf"))
                self.assertEqual(len(retained), 1)
                self.assertEqual(retained[0].read_bytes(), data)
                recovered = save(store, item, data)
                self.assertEqual(recovered["status"], "existing")
                self.assertTrue(retained[0].with_name(".deeppapernote.json").exists())
            finally:
                store.close()

    def test_invalid_shared_config_does_not_fall_back_or_change_preferences(self):
        import os
        from unittest.mock import patch

        from native_host.paper_archive import ArchiveError, archive_location

        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / "shared.json"
            original = json.dumps(
                {
                    "obsidian_vault": tmp,
                    "papers_dir": "../escape",
                    "output_language": "en",
                    "custom": "retain",
                }
            )
            config.write_text(original)
            with patch.dict(os.environ, {"DEEPPAPERNOTE_CONFIG_PATH": str(config)}):
                with self.assertRaises(ArchiveError):
                    archive_location()
            self.assertEqual(config.read_text(), original)

    def test_concurrent_uploads_preserve_both_source_records(self):
        from concurrent.futures import ThreadPoolExecutor

        with tempfile.TemporaryDirectory() as tmp:
            vault = Path(tmp)
            (vault / "Research/Papers/New").mkdir(parents=True)
            stores = [ArchiveStore(vault), ArchiveStore(vault)]
            item = {
                "title": "Archive Handoff Paper",
                "authorShortName": "Example",
                "year": "2026",
                "domain": "New",
            }
            data = [paper(1), paper(2)]
            try:
                with ThreadPoolExecutor(max_workers=2) as pool:
                    jobs = [
                        pool.submit(save, store, dict(item, arXiv=f"2601.12345v{i + 1}"), data[i])
                        for i, store in enumerate(stores)
                    ]
                    results = [job.result() for job in jobs]
                directory = (vault / results[0]["path"]).parent
                record = json.loads((directory / ".deeppapernote.json").read_text())
                self.assertEqual(
                    set(record["sources"]), {hashlib.sha256(d).hexdigest() for d in data}
                )
                self.assertEqual(len(list(directory.glob("*.pdf"))), 2)
            finally:
                for store in stores:
                    store.close()
