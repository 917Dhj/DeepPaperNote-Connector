/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2024 Corporation for Digital Scholarship
	Copyright © 2026 DeepPaperNote contributors

	This file is part of DeepPaperNote Connector.

	DeepPaperNote Connector is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	***** END LICENSE BLOCK *****
*/

let ItemSaver = function(options) {
	this._proxy = options.proxy;
	this._baseURI = options.baseURI;
	this._promptForMetadata = !!options.promptForMetadata;
};

ItemSaver.prototype = {
	async saveItems(items, attachmentCallback=()=>0, itemsDoneCallback=()=>0) {
		Zotero.debug(`ItemSaver.saveItems: Archiving ${items.length} items`);
		for (let item of items) {
			let pdfs = (item.attachments || []).filter(attachment =>
				attachment.snapshot !== false
				&& attachment.mimeType?.toLowerCase() === 'application/pdf'
			);
			if (pdfs.length !== 1) {
				let error = new Error(`DeepPaperNote requires exactly one PDF attachment; found ${pdfs.length}`);
				await Zotero.DeepPaperNotePanel.showError(error, item);
				throw error;
			}

			let attachment = pdfs[0];
			this._setAttachmentReferer(attachment);
			let overrides;
			try {
				overrides = await this._confirmDeepPaperNoteArchive(item);
			}
			catch (error) {
				if (error.code !== 'cancelled') {
					await Zotero.DeepPaperNotePanel.showError(error, item);
				}
				throw error;
			}

			attachment.id = attachment.id || Zotero.Utilities.randomString(8);
			attachmentCallback(attachment, 0);
			Zotero.DeepPaperNotePanel.update({status: 'saving', statusText: 'Saving PDF…'});
			try {
				item.deepPaperNote = await Zotero.DeepPaperNote.save(item, overrides);
				attachmentCallback(attachment, 100);
				Zotero.DeepPaperNotePanel.complete(item.deepPaperNote);
			}
			catch (error) {
				attachmentCallback(attachment, false, error);
				Zotero.DeepPaperNotePanel.fail(error);
				throw error;
			}
		}
		itemsDoneCallback(items);
		return items;
	},

	async _confirmDeepPaperNoteArchive(item) {
		let authors = (item.creators || []).filter(creator =>
			creator.creatorType === 'author' && (creator.lastName || creator.name)
		);
		let year = `${item.date || ''}`.match(/(?:19|20)\d{2}/)?.[0] || '';
		let domains = await Zotero.DeepPaperNote.listDomains();
		let savedDomain = await Zotero.Prefs.getAsync('deepPaperNote.domain').catch(() => '');
		let values = {
			title: item.title || '',
			authorShortName: '',
			year,
			domain: domains.includes(savedDomain) ? savedDomain : (domains[0] || ''),
		};
		let preview = null;
		if (values.title.trim() && authors.length && year) {
			preview = await Zotero.DeepPaperNote.preview(item, values);
		}
		values.target_directory = preview?.target_directory || '';
		let overrides = await Zotero.DeepPaperNotePanel.open({
			values,
			domains,
			authors: authors.map(author => author.lastName || author.name),
			editableMetadata: this._promptForMetadata || !item.title?.trim() || !authors.length || !year,
			previewPath: preview?.path || '',
			candidates: preview?.candidates || [],
			confidence: preview?.confidence || '',
			previewError: '',
			previewLoading: false,
			status: 'confirm',
			statusText: '',
		}, updatedValues => Zotero.DeepPaperNote.preview(item, updatedValues));
		if (!overrides.target_directory) await Zotero.Prefs.set('deepPaperNote.domain', overrides.domain);
		return overrides;
	},

	_setAttachmentReferer(attachment) {
		let pageURL = new URL(document.location.href);
		try {
			let attachmentURL = new URL(attachment.url);
			attachment.referrer = attachmentURL.origin === pageURL.origin ? pageURL.href : pageURL.origin;
		}
		catch (e) {
			attachment.referrer = pageURL.origin;
		}
	},
};

Zotero.ItemSaver = ItemSaver;
