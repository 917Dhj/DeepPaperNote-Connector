from __future__ import annotations

import base64
import hashlib
import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from native_host.deeppapernote_host import ArchiveStore, ProtocolError


PDF = b"%PDF-1.7\n% DeepPaperNote test PDF\n%%EOF\n"


class ArchiveStoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.vault = Path(self.temp_dir.name) / "vault"
        self.vault.mkdir()
        self.store = ArchiveStore(self.vault, "Research/Papers")
        self.item = {
            "title": "Mental World Modeling: A Test?",
            "creators": [
                {"creatorType": "author", "lastName": "Fei"},
                {"creatorType": "author", "lastName": "Zhao"},
            ],
            "date": "2026-07-01",
            "DOI": "10.1000/example",
            "domain": "长视频理解",
        }

    def tearDown(self) -> None:
        self.store.close()
        self.temp_dir.cleanup()

    def save(self, data: bytes = PDF) -> dict:
        started = self.store.handle({"type": "start", "version": 1, "item": self.item})
        upload_id = started["upload_id"]
        self.store.handle(
            {
                "type": "chunk",
                "version": 1,
                "upload_id": upload_id,
                "sequence": 0,
                "data": base64.b64encode(data).decode("ascii"),
            }
        )
        return self.store.handle(
            {
                "type": "finish",
                "version": 1,
                "upload_id": upload_id,
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        )

    def test_preview_and_save_match_archive_contract(self) -> None:
        preview = self.store.handle({"type": "preview", "version": 1, "item": self.item})
        expected = (
            "Research/Papers/长视频理解/Mental_World_Modeling_A_Test/"
            "Fei和Zhao - 2026 - Mental World Modeling A Test.pdf"
        )
        self.assertEqual(preview["path"], expected)

        saved = self.save()

        self.assertEqual(saved["status"], "saved")
        self.assertEqual(saved["path"], expected)
        self.assertEqual((self.vault / expected).read_bytes(), PDF)
        self.assertFalse((self.vault / expected).with_suffix(".md").exists())
        self.assertFalse((self.vault / expected).parent.joinpath("images").exists())
        self.assertFalse((self.vault / expected).parent.joinpath("metadata.json").exists())

    def test_same_pdf_is_idempotent_and_never_overwritten(self) -> None:
        first = self.save()
        second = self.save()

        self.assertEqual(first["status"], "saved")
        self.assertEqual(second["status"], "existing")
        self.assertEqual(second["path"], first["path"])
        self.assertEqual(len(list((self.vault / first["path"]).parent.glob("*.pdf"))), 1)

    def test_conflict_uses_stable_identifier_then_fails_closed(self) -> None:
        first = self.save()
        different_pdf = b"%PDF-1.7\nsecond PDF\n%%EOF\n"
        second = self.save(different_pdf)

        self.assertEqual(first["status"], "saved")
        self.assertEqual(second["status"], "saved")
        self.assertIn("doi_10.1000_example", second["path"])

        with self.assertRaisesRegex(ProtocolError, "conflict"):
            self.save(b"%PDF-1.7\nthird PDF\n%%EOF\n")

    def test_rejects_path_traversal_non_pdf_and_out_of_order_chunks(self) -> None:
        unsafe = dict(self.item, domain="../outside")
        with self.assertRaisesRegex(ProtocolError, "Unsafe domain"):
            self.store.handle({"type": "preview", "version": 1, "item": unsafe})

        started = self.store.handle({"type": "start", "version": 1, "item": self.item})
        with self.assertRaisesRegex(ProtocolError, "sequence"):
            self.store.handle(
                {
                    "type": "chunk",
                    "version": 1,
                    "upload_id": started["upload_id"],
                    "sequence": 1,
                    "data": base64.b64encode(b"not a pdf").decode("ascii"),
                }
            )

        with self.assertRaisesRegex(ProtocolError, "not a PDF"):
            self.save(b"<html>login required</html>")
        self.assertFalse(
            (self.vault / "Research/Papers/长视频理解/Mental_World_Modeling_A_Test").exists()
        )

    def test_rejects_papers_directory_symlink_outside_vault(self) -> None:
        self.store.close()
        outside = Path(self.temp_dir.name) / "outside"
        outside.mkdir()
        (self.vault / "Research").mkdir()
        (self.vault / "Research/Papers").symlink_to(outside, target_is_directory=True)

        with self.assertRaisesRegex(ProtocolError, "papers_dir"):
            ArchiveStore(self.vault, "Research/Papers")

    def test_native_stdio_protocol_returns_preview_to_allowed_origin(self) -> None:
        config = Path(self.temp_dir.name) / "config.json"
        extension_id = "a" * 32
        config.write_text(
            json.dumps(
                {"vault": str(self.vault), "papers_dir": "Research/Papers", "extension_id": extension_id}
            ),
            encoding="utf-8",
        )
        request = json.dumps(
            {"type": "preview", "version": 1, "item": self.item}, ensure_ascii=False
        ).encode("utf-8")
        completed = subprocess.run(
            [
                sys.executable,
                str(Path(__file__).parents[2] / "native_host/deeppapernote_host.py"),
                "--config",
                str(config),
                f"chrome-extension://{extension_id}/",
            ],
            input=struct.pack("<I", len(request)) + request,
            capture_output=True,
            check=True,
        )
        size = struct.unpack("<I", completed.stdout[:4])[0]
        response = json.loads(completed.stdout[4 : 4 + size])
        self.assertTrue(response["ok"])
        self.assertIn("Mental_World_Modeling_A_Test", response["path"])


if __name__ == "__main__":
    unittest.main()
