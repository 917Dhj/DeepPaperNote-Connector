# DeepPaperNote Connector

DeepPaperNote Connector is a Chrome extension that uses Zotero's Translator and attachment-acquisition code to archive one validated source PDF per paper into an Obsidian vault:

```text
Research/Papers/<领域>/<paper_slug>/
└── <作者短名> - <年份> - <规范标题>.pdf
```

It does not save to Zotero or zotero.org and does not create Markdown notes, snapshots, `images/`, or `metadata.json`. Existing PDFs are never overwritten: identical SHA-256 content is idempotent, while conflicting content fails closed after one deterministic DOI/arXiv suffix.

## Setup

```sh
git submodule update --init
npm ci
./build.sh -d
```

Load `build/manifestv3` from `chrome://extensions` with Developer Mode enabled. Then install the native host using the generated extension ID:

```sh
python3 native_host/deeppapernote_host.py install \
  --vault "/absolute/path/to/your/Obsidian vault" \
  --extension-id "<32-character Chrome extension ID>"
```

Reload the extension. On a detected paper page, confirm the extracted title, authors, year, existing domain, and final path before saving. A directly opened PDF asks for missing metadata.

## Product boundary

- Chrome Manifest V3 and the macOS native host are supported.
- Exactly one PDF attachment is required.
- PDF bytes retain browser cookies and referrer handling, then pass PDF magic-byte and SHA-256 validation.
- The host writes only below the configured `Research/Papers` directory and never creates a domain folder.
- Firefox, Edge, Safari, Zotero library/cloud saving, Google Docs, snapshots, OCR, notes, and batch capture are not included.

## Development

`./build.sh` creates the production artifact at `build/manifestv3`; `./build.sh -d` includes browser test support.

```sh
npm test
python3 -m unittest test/native_host/test_deeppapernote_host.py
```

The retained Zotero-derived code is limited to Translator execution, metadata schemas, proxy-aware HTTP handling, and PDF acquisition. This standalone repository is not affiliated with or endorsed by Zotero and remains licensed under AGPLv3; see [`COPYING`](COPYING).
