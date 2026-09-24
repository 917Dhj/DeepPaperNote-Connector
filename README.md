<div align="center">

# DeepPaperNote Connector

**Save papers from your browser straight to Obsidian.**

[English](./README.md) | [简体中文](./README.zh-CN.md)

[Get started](#quick-start) · [Read deeply with DeepPaperNote](https://github.com/917Dhj/DeepPaperNote) · [AGPLv3](./COPYING)

</div>

Found a paper you want to keep? DeepPaperNote Connector helps you capture its PDF, confirm the paper details and destination, and save it into your Obsidian paper library—without manually moving and renaming the download.

When you are ready to study it, hand the saved PDF to [DeepPaperNote](https://github.com/917Dhj/DeepPaperNote). It can generate a deep-reading note in the same paper directory, keeping the source and your understanding together.

**Open a paper → click the extension → confirm the details and folder → find the PDF in Obsidian.**

## Why use Connector?

- **Spend less time filing PDFs.** Capture a PDF from a supported paper page and review its title, authors, year, and destination before saving.
- **Keep a paper's materials together.** Connector helps you find existing paper directories in your Vault. If several directories match, you choose the destination.
- **Keep versions without overwriting.** Identical PDFs are reused; different PDF versions of the same paper can coexist. Existing PDFs and notes are preserved.
- **Collect now, read deeply later.** Save the source while browsing, then use DeepPaperNote when you want an evidence-based note with methods, figures, results, and limitations.

## Quick Start

This setup uses **Chrome on macOS**, a browser extension, and a **local saving component** that writes PDFs into your Vault. You will also need Git, Node.js **22.12+** with npm, and Python **3.10+**. The steps below build the extension from source and load it through Chrome's Developer Mode.

### 1. Choose your Obsidian location

Connector uses the same saved Obsidian location as DeepPaperNote. If you have already configured it, keep that location and continue to step 2.

Otherwise, follow [DeepPaperNote's Quick Start](https://github.com/917Dhj/DeepPaperNote#-quick-start), then ask your agent:

```text
Configure DeepPaperNote's saved Obsidian location for future use:
Vault: <absolute path to my existing Vault>
Papers folder inside the Vault: Research/Papers
Only configure the location for now; do not read a paper yet.
```

Inside that papers folder, create at least one research-domain folder, such as `Research/Papers/Machine Learning`. Connector uses existing domain folders for new papers; it does not create domains itself.

The location is stored in DeepPaperNote's device-local preferences. For manual configuration and troubleshooting, see [User Configuration](https://github.com/917Dhj/DeepPaperNote/blob/develop/skills/deeppapernote/references/user-configuration.md).

### 2. Build and load the extension

```sh
git clone --recurse-submodules https://github.com/917Dhj/DeepPaperNote-Connector.git
cd DeepPaperNote-Connector
npm ci
./build.sh
```

In Chrome:

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this repository's `build/manifestv3` folder.
3. Copy the extension's **ID** for the next step.

### 3. Install the local saving component

Run these commands from the same repository directory, replacing the placeholder with the ID shown by Chrome:

```sh
python3 -m pip install -r native_host/requirements.txt
python3 native_host/deeppapernote_host.py install \
  --extension-id "<32-character Chrome extension ID>"
```

Use the same Python environment for both commands; the installed host uses that interpreter. If you use a virtual environment, keep it available after installation.

Reload the extension in `chrome://extensions`. Open its options, choose a **Default research domain**, and click **Save**. Use **Check native host** to verify the connection and preview a destination without saving a PDF.

### 4. Save your first paper

Open a supported paper page and click the extension. Review the title, authors, year, domain, and final path, then confirm the save. A directly opened PDF asks you to supply missing paper details.

If the paper is already in your Vault, the dialog shows matching directories and their PDF/note counts. Check the suggested destination before saving, especially when papers have similar titles.

After a successful save, open the displayed destination in Obsidian. The PDF is named using the author, year, and paper title.

## From a saved PDF to a deep-reading note

Connector handles collection. [DeepPaperNote](https://github.com/917Dhj/DeepPaperNote) handles the deep read, using Claude Code or Codex to turn one paper into a durable Obsidian note.

Give your agent the saved PDF, for example:

```text
Use DeepPaperNote to generate a deep-reading note for <absolute path to the saved PDF>.
Save the note in the same Obsidian paper directory.
```

Different PDF versions can have their own corresponding notes; existing notes remain protected. Collecting a PDF does not automatically start an agent or generate a note.

## Supported scope and common questions

**Do I need Zotero installed?** No. Connector saves papers directly to your Obsidian Vault and does not require a Zotero account or desktop app.

**Can I just collect PDFs?** Yes. You do not need to generate a note for every paper. You do need the shared Obsidian location configured before saving.

**Which browsers and platforms are supported?** Chrome on macOS, with the local saving component installed. Firefox, Edge, Safari, Windows, and Linux are outside the current supported setup.

**Does it work on every paper page?** Capture depends on page recognition and PDF availability. Exactly one PDF attachment is required per paper. Batch capture, web snapshots, Google Docs integration, and OCR are not included.

**Does it generate notes or extract figures?** No. Connector collects PDFs. Use DeepPaperNote when you want a deep-reading note with figures.

**What if the host cannot connect or no domains appear?** Check that the shared Vault and papers folder are configured, a domain folder exists under that papers folder, and the host was installed with this extension's ID. Missing or invalid shared configuration blocks saving instead of using an older destination. For configuration help, see [User Configuration](https://github.com/917Dhj/DeepPaperNote/blob/develop/skills/deeppapernote/references/user-configuration.md).

**How do I update?** After updating the checkout, run `git submodule update --init --recursive`, `npm ci`, and `./build.sh`. Repeat step 3 to update the installed host and its dependencies, then reload the extension. If Chrome assigns a different extension ID, use that ID when reinstalling the host.

## Development and contributions

Bug reports and pull requests are welcome. For capture problems, include the page URL, Chrome/macOS versions, and error message; remove personal paths and private paper details before sharing.

`./build.sh` produces the extension at `build/manifestv3`. Build with test support before running the browser suite:

```sh
./build.sh -d
npm test
python3 -m unittest discover -s test/native_host
```

The shared archive module, [`native_host/paper_archive.py`](./native_host/paper_archive.py), is vendored from DeepPaperNote's `skills/deeppapernote/scripts/paper_archive.py`. Keep both copies aligned when changing the protocol. Native and browser tests cover archive behavior and directory selection.

## Acknowledgments and license

DeepPaperNote Connector is derived from [Zotero Connector](https://github.com/zotero/zotero-connectors). It builds on Zotero’s work in recognizing paper pages, collecting paper details, and retrieving PDFs. Thank you to the Zotero project and its contributors for this foundation.

This is a standalone project, not affiliated with or endorsed by Zotero. The repository remains licensed under **AGPLv3**; see [`COPYING`](./COPYING). The shared archive module retains its **MIT** license from DeepPaperNote; see [`native_host/PAPER_ARCHIVE_LICENSE`](./native_host/PAPER_ARCHIVE_LICENSE). Third-party notices remain applicable to their respective components.
