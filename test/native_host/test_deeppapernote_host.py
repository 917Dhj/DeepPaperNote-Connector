from __future__ import annotations

import base64
import hashlib
import json
import os
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import fitz

from native_host.deeppapernote_host import ArchiveStore, ProtocolError


def pdf(variant="first"):
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text(
            (72, 72),
            f"Mental World Modeling: A Test?\nFei and Zhao\ndoi:10.1000/example\n{variant}",
        )
        return doc.tobytes()


PDF = pdf()


class ArchiveStoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.vault = Path(self.temp_dir.name) / "vault"
        self.vault.mkdir()
        (self.vault / "Research/Papers/长视频理解").mkdir(parents=True)
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

    def test_different_source_bytes_are_preserved_as_variants(self) -> None:
        first = self.save()
        different_pdf = pdf("second")
        second = self.save(different_pdf)

        self.assertEqual(first["status"], "saved")
        self.assertEqual(second["status"], "saved")
        self.assertIn("source-", second["path"])

        third = self.save(pdf("third"))
        self.assertEqual(third["status"], "saved")
        self.assertEqual(len({first["path"], second["path"], third["path"]}), 3)

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
        self.assertTrue((self.vault / "Research/Papers/长视频理解").is_dir())

    def test_rejects_papers_directory_symlink_outside_vault(self) -> None:
        self.store.close()
        outside = Path(self.temp_dir.name) / "outside"
        outside.mkdir()
        (self.vault / "Research/Papers/长视频理解").rmdir()
        (self.vault / "Research/Papers").rmdir()
        (self.vault / "Research/Papers").symlink_to(outside, target_is_directory=True)

        with self.assertRaisesRegex(ProtocolError, "papers_dir"):
            ArchiveStore(self.vault, "Research/Papers")

    def test_lists_only_safe_existing_domain_directories(self) -> None:
        papers = self.vault / "Research/Papers"
        (papers / "视觉理解").mkdir()
        (papers / ".hidden").mkdir()
        (papers / "README.md").write_text("not a domain", encoding="utf-8")
        outside = Path(self.temp_dir.name) / "outside-domain"
        outside.mkdir()
        (papers / "unsafe-link").symlink_to(outside, target_is_directory=True)

        response = self.store.handle({"type": "list_domains", "version": 1})

        self.assertEqual(response, {"ok": True, "domains": ["视觉理解", "长视频理解"]})
        with self.assertRaisesRegex(ProtocolError, "Domain directory does not exist"):
            self.store.handle(
                {
                    "type": "preview",
                    "version": 1,
                    "item": dict(self.item, domain="不存在"),
                }
            )

    def test_native_stdio_protocol_returns_preview_to_allowed_origin(self) -> None:
        config = Path(self.temp_dir.name) / "config.json"
        extension_id = "a" * 32
        config.write_text(
            json.dumps(
                {
                    "vault": "/nonexistent/legacy-vault",
                    "papers_dir": "Legacy",
                    "extension_id": extension_id,
                }
            ),
            encoding="utf-8",
        )
        shared = Path(self.temp_dir.name) / "shared.json"
        shared.write_text(
            json.dumps({"obsidian_vault": str(self.vault), "papers_dir": "Research/Papers"})
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
            env={**os.environ, "DEEPPAPERNOTE_CONFIG_PATH": str(shared)},
        )
        size = struct.unpack("<I", completed.stdout[:4])[0]
        response = json.loads(completed.stdout[4 : 4 + size])
        self.assertTrue(response["ok"])
        self.assertIn("Mental_World_Modeling_A_Test", response["path"])


if __name__ == "__main__":
    unittest.main()
