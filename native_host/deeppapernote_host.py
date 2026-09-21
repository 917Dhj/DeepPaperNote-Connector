#!/usr/bin/env python3
"""Chrome native-messaging host that archives validated PDFs into an Obsidian vault."""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import json
import os
import platform
import re
import secrets
import shlex
import shutil
import struct
import sys
from dataclasses import dataclass
from pathlib import Path, PureWindowsPath
from typing import BinaryIO

try:
    from .paper_archive import (
        ArchiveError,
        admit_directory,
        archive_location,
        archive_lock,
        directory_candidates,
        record_work_evidence,
        register_source,
        safe_path,
        select_directory,
        source_details,
        verify_pdf,
        write_record,
    )
except ImportError:
    from paper_archive import (
        ArchiveError,
        admit_directory,
        archive_location,
        archive_lock,
        directory_candidates,
        record_work_evidence,
        register_source,
        safe_path,
        select_directory,
        source_details,
        verify_pdf,
        write_record,
    )


HOST_NAME = "com.deeppapernote.connector"
PROTOCOL_VERSION = 1
MAX_MESSAGE_BYTES = 2 * 1024 * 1024
MAX_CHUNK_BYTES = 1024 * 1024


class ProtocolError(RuntimeError):
    pass


def _safe_relative_parts(value: str, field: str) -> tuple[str, ...]:
    raw = value.strip()
    windows_path = PureWindowsPath(raw)
    if (
        not raw
        or Path(raw).is_absolute()
        or windows_path.is_absolute()
        or windows_path.drive
        or windows_path.root
    ):
        raise ProtocolError(f"Unsafe {field}: expected a relative path")
    parts = tuple(part for part in re.split(r"[\\/]+", raw) if part and part != ".")
    if not parts or ".." in parts:
        raise ProtocolError(f"Unsafe {field}: expected a relative path")
    return parts


def _safe_segment(value: str, field: str) -> str:
    raw = value.strip()
    if len(_safe_relative_parts(raw, field)) != 1 or re.search(r'[<>:"|?*\x00-\x1f]', raw):
        raise ProtocolError(f"Unsafe {field}: expected one portable path segment")
    return raw.rstrip(". ")


def _canonical_title(value: object) -> str:
    title = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", str(value or ""))
    title = re.sub(r"\s+", " ", title).strip(". ")
    if not title:
        raise ProtocolError("Missing title")
    return title[:160].rstrip(". ")


def _slugify(value: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", value, flags=re.UNICODE)
    slug = re.sub(r"[-\s]+", "_", slug).strip("_")
    return (slug or "paper")[:120].rstrip("_")


def _year(item: dict) -> str:
    explicit = str(item.get("year") or "").strip()
    if explicit:
        if not re.fullmatch(r"(?:19|20)\d{2}", explicit):
            raise ProtocolError("Missing or invalid publication year")
        return explicit
    match = re.search(r"(?:19|20)\d{2}", str(item.get("date") or ""))
    if not match:
        raise ProtocolError("Missing or invalid publication year")
    return match.group(0)


def _author_short_name(item: dict) -> str:
    override = str(item.get("authorShortName") or "").strip()
    if override:
        return _canonical_title(override)[:60]
    creators = item.get("creators") or []
    authors = [
        creator
        for creator in creators
        if isinstance(creator, dict) and creator.get("creatorType", "author") == "author"
    ]
    names = []
    for author in authors:
        name = str(author.get("lastName") or author.get("name") or "").strip()
        if name:
            names.append(_canonical_title(name))
    if not names:
        raise ProtocolError("Missing author")
    if len(names) == 1:
        return names[0][:60]
    if len(names) == 2:
        return f"{names[0]}和{names[1]}"[:60]
    return f"{names[0]}等"[:60]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@dataclass
class Upload:
    stream: BinaryIO
    part_path: Path
    target_path: Path
    item: dict
    next_sequence: int = 0
    size: int = 0
    digest: object = None

    def __post_init__(self) -> None:
        self.digest = hashlib.sha256()


class ArchiveStore:
    def __init__(self, vault: str | Path, papers_dir: str = "Research/Papers") -> None:
        self.vault = Path(vault).expanduser().resolve()
        if not self.vault.is_dir():
            raise ProtocolError("Vault directory does not exist")
        self.papers_parts = _safe_relative_parts(papers_dir, "papers_dir")
        self.papers_root = self.vault.joinpath(*self.papers_parts)
        self._require_papers_root_within_vault()
        self.uploads: dict[str, Upload] = {}

    def _require_papers_root_within_vault(self) -> None:
        try:
            self.papers_root.resolve().relative_to(self.vault)
        except ValueError as exc:
            raise ProtocolError("Unsafe papers_dir: path escapes the vault") from exc

    def _domain_path(self, value: object) -> Path:
        domain = _safe_segment(str(value or ""), "domain")
        path = self.papers_root / domain
        if path.is_symlink() or not path.is_dir():
            raise ProtocolError("Domain directory does not exist")
        try:
            path.resolve().relative_to(self.papers_root.resolve())
        except ValueError as exc:
            raise ProtocolError("Unsafe domain: path escapes papers_dir") from exc
        return path

    def _list_domains(self) -> dict:
        self._require_papers_root_within_vault()
        if not self.papers_root.is_dir():
            return {"ok": True, "domains": []}
        domains = [
            path.name
            for path in self.papers_root.iterdir()
            if not path.name.startswith(".") and not path.is_symlink() and path.is_dir()
        ]
        return {"ok": True, "domains": sorted(domains, key=str.casefold)}

    def _relative(self, path: Path) -> str:
        return path.relative_to(self.vault).as_posix()

    def _preview(self, item: dict) -> dict:
        title = _canonical_title(item.get("title"))
        candidates = directory_candidates(self.vault, item, name=_slugify(title))
        selected = item.get("target_directory", "")
        if selected:
            selected = str(safe_path(self.vault, selected))
        choices = [
            {**candidate, "path": self._relative(Path(candidate["path"]))}
            for candidate in candidates
        ]
        if len(candidates) > 1 and not selected:
            return {
                "ok": True,
                "path": "",
                "target_directory": "",
                "candidates": choices,
                "requires_selection": True,
                "confidence": "candidate",
            }
        existing = select_directory(candidates, selected)
        directory = existing or self._domain_path(item.get("domain")) / _slugify(title)
        filename = f"{_author_short_name(item)} - {_year(item)} - {title}.pdf"
        target = safe_path(self.vault, self._relative(directory / filename))
        return {
            "ok": True,
            "path": self._relative(target),
            "target_directory": self._relative(existing) if existing else "",
            "candidates": choices,
            "requires_selection": False,
            "confidence": next(
                (c["confidence"] for c in candidates if Path(c["path"]) == existing), ""
            ),
        }

    def _start(self, item: dict) -> dict:
        self._require_papers_root_within_vault()
        preview = self._preview(item)
        if preview.get("requires_selection"):
            raise ProtocolError("Select an existing paper directory before saving")
        target = safe_path(self.vault, preview["path"])
        item = dict(item, target_directory=preview["target_directory"])
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.parent.resolve().is_relative_to(self.vault):
            raise ProtocolError("Unsafe archive path: path escapes papers_dir")
        upload_id = secrets.token_hex(16)
        part_path = target.parent / f".deeppapernote-{upload_id}.part"
        stream = part_path.open("xb")
        self.uploads[upload_id] = Upload(stream, part_path, target, item)
        return {"ok": True, "upload_id": upload_id, "path": self._relative(target)}

    def _abort(self, upload_id: str) -> None:
        upload = self.uploads.pop(upload_id, None)
        if not upload:
            return
        upload.stream.close()
        upload.part_path.unlink(missing_ok=True)
        self._cleanup_dirs(upload.target_path)

    def _cleanup_dirs(self, target_path: Path) -> None:
        try:
            target_path.parent.rmdir()
        except OSError:
            pass

    def _chunk(self, request: dict) -> dict:
        upload_id = str(request.get("upload_id") or "")
        upload = self.uploads.get(upload_id)
        if not upload:
            raise ProtocolError("Unknown upload_id")
        if request.get("sequence") != upload.next_sequence:
            self._abort(upload_id)
            raise ProtocolError("Invalid chunk sequence")
        try:
            data = base64.b64decode(str(request.get("data") or ""), validate=True)
        except (binascii.Error, ValueError) as exc:
            self._abort(upload_id)
            raise ProtocolError("Invalid base64 chunk") from exc
        if not data or len(data) > MAX_CHUNK_BYTES:
            self._abort(upload_id)
            raise ProtocolError("Invalid chunk size")
        upload.stream.write(data)
        upload.digest.update(data)
        upload.size += len(data)
        upload.next_sequence += 1
        return {"ok": True, "upload_id": upload_id, "sequence": upload.next_sequence}

    def _destination(self, upload: Upload, digest: str) -> tuple[Path, str]:
        target = upload.target_path
        for path in target.parent.iterdir():
            if path.suffix.lower() == ".pdf" and path.is_file():
                safe_path(target.parent, path.name)
                if _sha256(path) == digest:
                    return path, "existing"
        if not target.exists():
            return target, "saved"
        details = source_details(upload.item, upload.part_path)
        version = re.search(r"v\d+$", details.get("arxiv_id", ""))
        label = "arxiv-" + version[0] if version else "source"
        target = target.with_name(f"{target.stem[:140]} [{label}-{digest[:12]}].pdf")
        if target.exists():
            if not target.is_file() or _sha256(target) != digest:
                raise ProtocolError("Archive path conflict: source filename already occupied")
            return target, "existing"
        return target, "saved"

    def _finish(self, request: dict) -> dict:
        upload_id = str(request.get("upload_id") or "")
        upload = self.uploads.pop(upload_id, None)
        if not upload:
            raise ProtocolError("Unknown upload_id")
        upload.stream.flush()
        os.fsync(upload.stream.fileno())
        upload.stream.close()
        try:
            expected = str(request.get("sha256") or "").lower()
            actual = upload.digest.hexdigest()
            if not re.fullmatch(r"[0-9a-f]{64}", expected) or expected != actual:
                raise ProtocolError("PDF SHA-256 mismatch")
            with upload.part_path.open("rb") as stream:
                if b"%PDF-" not in stream.read(1024):
                    raise ProtocolError("Downloaded content is not a PDF")
            observed = verify_pdf(upload.part_path, upload.item, exact_version=True)
            with archive_lock(self.vault):
                if _sha256(upload.part_path) != actual:
                    raise ProtocolError("PDF changed before archive save")
                preview = self._preview(upload.item)
                if (
                    preview.get("requires_selection")
                    or safe_path(self.vault, preview["path"]).parent != upload.target_path.parent
                ):
                    raise ProtocolError("Archive destination changed; select the directory again")
                registry = admit_directory(upload.target_path.parent, upload.item, actual)
                record_work_evidence(registry["work"], actual, observed)
                destination, status = self._destination(upload, actual)
                if status == "saved":
                    try:
                        os.link(upload.part_path, destination)
                    except FileExistsError:
                        if _sha256(destination) != actual:
                            raise ProtocolError("Archive path conflict during save")
                        status = "existing"
                    else:
                        os.chmod(destination, 0o644)
                details = source_details(upload.item, destination)
                details["pdf_path"] = destination.name
                register_source(registry, actual, details)
                try:
                    write_record(destination.parent, registry)
                except (OSError, ArchiveError) as exc:
                    raise ProtocolError(
                        f"PDF retained at {self._relative(destination)}; identity registration incomplete: {exc}"
                    ) from exc
                return {
                    "ok": True,
                    "status": status,
                    "path": self._relative(destination),
                    "sha256": actual,
                    "bytes": upload.size,
                }

        finally:
            upload.part_path.unlink(missing_ok=True)
            self._cleanup_dirs(upload.target_path)

    def handle(self, request: dict) -> dict:
        try:
            return self._handle(request)
        except ArchiveError as exc:
            raise ProtocolError(str(exc)) from exc

    def _handle(self, request: dict) -> dict:
        if not isinstance(request, dict) or request.get("version") != PROTOCOL_VERSION:
            raise ProtocolError("Unsupported protocol version")
        request_type = request.get("type")
        if request_type == "list_domains":
            return self._list_domains()
        if request_type == "preview":
            return self._preview(request.get("item") or {})
        if request_type == "start":
            return self._start(request.get("item") or {})
        if request_type == "chunk":
            return self._chunk(request)
        if request_type == "finish":
            return self._finish(request)
        if request_type == "abort":
            self._abort(str(request.get("upload_id") or ""))
            return {"ok": True}
        raise ProtocolError("Unsupported request type")

    def close(self) -> None:
        for upload_id in list(self.uploads):
            self._abort(upload_id)


def _read_exact(stream: BinaryIO, size: int) -> bytes:
    chunks = []
    remaining = size
    while remaining:
        chunk = stream.read(remaining)
        if not chunk:
            raise EOFError
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def _read_message(stream: BinaryIO) -> dict | None:
    header = stream.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise ProtocolError("Truncated native message header")
    size = struct.unpack("<I", header)[0]
    if not 0 < size <= MAX_MESSAGE_BYTES:
        raise ProtocolError("Invalid native message size")
    try:
        message = json.loads(_read_exact(stream, size).decode("utf-8"))
    except (EOFError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProtocolError("Invalid native JSON message") from exc
    if not isinstance(message, dict):
        raise ProtocolError("Native message must be a JSON object")
    return message


def _write_message(stream: BinaryIO, message: dict) -> None:
    payload = json.dumps(message, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    stream.write(struct.pack("<I", len(payload)))
    stream.write(payload)
    stream.flush()


def run_host(config_path: Path, origin: str = "") -> int:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    expected_origin = f"chrome-extension://{config['extension_id']}/"
    if origin and origin != expected_origin:
        raise ProtocolError("Native host origin is not allowed")
    try:
        vault, papers_dir = archive_location()
    except ArchiveError as exc:
        _write_message(
            sys.stdout.buffer,
            {
                "ok": False,
                "error": {
                    "code": exc.code,
                    "message": f"Configure DeepPaperNote's shared Obsidian location: {exc}",
                },
            },
        )
        return 1
    store = ArchiveStore(vault, papers_dir)
    try:
        while True:
            try:
                request = _read_message(sys.stdin.buffer)
            except ProtocolError as exc:
                _write_message(
                    sys.stdout.buffer,
                    {
                        "ok": False,
                        "error": {"code": "invalid_message", "message": str(exc)},
                    },
                )
                return 1
            if request is None:
                return 0
            try:
                response = store.handle(request)
            except ProtocolError as exc:
                response = {
                    "ok": False,
                    "error": {"code": "invalid_request", "message": str(exc)},
                }
            except OSError as exc:
                response = {
                    "ok": False,
                    "error": {
                        "code": "io_error",
                        "message": f"Archive write failed: {exc}",
                    },
                }
            _write_message(sys.stdout.buffer, response)
    finally:
        store.close()


def install(vault: str, extension_id: str, papers_dir: str) -> dict:
    if platform.system() != "Darwin":
        raise ProtocolError("Automatic installation currently supports macOS Chrome only")
    if not re.fullmatch(r"[a-p]{32}", extension_id):
        raise ProtocolError("Invalid Chrome extension ID")
    vault_path, shared_papers_dir = archive_location()
    if vault and Path(vault).expanduser().resolve() != vault_path:
        raise ProtocolError(
            "The shared Skill Vault differs from --vault; update Skill preferences explicitly"
        )
    if papers_dir and papers_dir != shared_papers_dir:
        raise ProtocolError("The shared Skill papers directory differs from --papers-dir")

    support_dir = Path.home() / "Library/Application Support/DeepPaperNote Connector"
    manifest_dir = Path.home() / "Library/Application Support/Google/Chrome/NativeMessagingHosts"
    support_dir.mkdir(parents=True, exist_ok=True)
    manifest_dir.mkdir(parents=True, exist_ok=True)
    host_path = support_dir / "deeppapernote_host.py"
    config_path = support_dir / "config.json"
    launcher_path = support_dir / "deeppapernote_host"
    shutil.copy2(Path(__file__).resolve(), host_path)
    shutil.copy2(Path(__file__).with_name("paper_archive.py"), support_dir / "paper_archive.py")
    config_path.write_text(
        json.dumps(
            {"extension_id": extension_id},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    launcher_path.write_text(
        "#!/bin/sh\nexec "
        f"{shlex.quote(sys.executable)} {shlex.quote(str(host_path))} "
        f'--config {shlex.quote(str(config_path))} "$@"\n',
        encoding="utf-8",
    )
    launcher_path.chmod(0o755)
    manifest_path = manifest_dir / f"{HOST_NAME}.json"
    manifest_path.write_text(
        json.dumps(
            {
                "name": HOST_NAME,
                "description": "DeepPaperNote PDF archive host",
                "path": str(launcher_path),
                "type": "stdio",
                "allowed_origins": [f"chrome-extension://{extension_id}/"],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return {"host_manifest": str(manifest_path), "config": str(config_path)}


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    try:
        if argv[:1] == ["install"]:
            parser = argparse.ArgumentParser(description="Install the DeepPaperNote native host")
            parser.add_argument(
                "--vault",
                default="",
                help="Optional assertion against the shared Skill Vault",
            )
            parser.add_argument("--extension-id", required=True)
            parser.add_argument("--papers-dir", default="")
            args = parser.parse_args(argv[1:])
            print(
                json.dumps(
                    install(args.vault, args.extension_id, args.papers_dir),
                    ensure_ascii=False,
                )
            )
            return 0
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument("--config", default=str(Path(__file__).with_name("config.json")))
        parser.add_argument("origin", nargs="?", default="")
        args = parser.parse_args(argv)
        return run_host(Path(args.config).expanduser().resolve(), args.origin)
    except (OSError, KeyError, ValueError, json.JSONDecodeError, ProtocolError) as exc:
        print(f"DeepPaperNote native host: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
