# DeepPaperNote Connector

DeepPaperNote Connector is a Chrome extension that uses Zotero's Translator and attachment-acquisition code to archive paper PDFs into the same Obsidian directories used by DeepPaperNote:

```text
Research/Papers/<领域>/<paper_slug>/
├── <作者短名> - <年份> - <规范标题>.pdf
└── .deeppapernote.json
```

It does not save to Zotero or zotero.org and does not create Markdown notes, snapshots, `images/`, or `metadata.json`. Existing PDFs are never overwritten: identical SHA-256 content is reused regardless of filename; verified versions and different-byte source variants coexist. The shared identity record preserves existing notes and lets DeepPaperNote continue in this directory.

## Setup

```sh
git submodule update --init
npm ci
./build.sh -d
```

Load `build/manifestv3` from `chrome://extensions` with Developer Mode enabled. Configure DeepPaperNote's persistent Obsidian location first (`obsidian_vault` and `papers_dir` in `~/.deeppapernote/config.json`). Connector uses this location even if an older native-host configuration points elsewhere. Then install the native host using the generated extension ID:

```sh
python3 -m pip install -r native_host/requirements.txt
python3 native_host/deeppapernote_host.py install \
  --extension-id "<32-character Chrome extension ID>"
```

Reload the extension. On a detected paper page, confirm the extracted title, authors, year, existing domain, and final path before saving. A directly opened PDF asks for missing metadata. A matching existing directory is shown and preselected, with its PDF/note counts; title-only matches are labelled as candidates. Multiple matches require one destination choice. The PDF is downloaded and verified after confirmation, as before. Reinstall the native host after updating its code and reload the extension build.

## Product boundary

- Chrome Manifest V3 and the macOS native host are supported.
- Exactly one PDF attachment is required.
- PDF bytes retain browser cookies and referrer handling, then pass PDF magic-byte, SHA-256, work-identity, and explicit revision validation.
- The host searches the configured Vault for matching directories and reuses them in place. New directories stay under the configured papers root; it never creates a domain folder. Missing or invalid shared configuration blocks saving instead of reverting to an old destination.
- Firefox, Edge, Safari, Zotero library/cloud saving, Google Docs, snapshots, OCR, notes, and batch capture are not included.

## Development

`./build.sh` creates the production artifact at `build/manifestv3`; `./build.sh -d` includes browser test support.

```sh
npm test
python3 -m unittest discover -s test/native_host
```

The retained Zotero-derived code is limited to Translator execution, metadata schemas, proxy-aware HTTP handling, and PDF acquisition. This standalone repository is not affiliated with or endorsed by Zotero and remains licensed under AGPLv3; see [`COPYING`](COPYING).

The shared archive module `native_host/paper_archive.py` is vendored unchanged from DeepPaperNote `skills/deeppapernote/scripts/paper_archive.py` under MIT; see `native_host/PAPER_ARCHIVE_LICENSE`. Update both copies together. Native and browser tests cover the archive protocol and directory-selection dialog.
