/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2026 DeepPaperNote contributors

	This file is part of DeepPaperNote Connector.

	DeepPaperNote Connector is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	***** END LICENSE BLOCK *****
*/

import { Tab, getExtensionURL } from '../support/utils.mjs';

describe('Save progress panel', function() {
	this.timeout(15000);
	let tab = new Tab();
	let frame;

	before(async function() {
		await tab.init(getExtensionURL('test/data/journalArticle-single.html'));
	});

	after(async function() {
		await tab.close();
	});

	async function openPanel() {
		await tab.run(() => {
			Zotero.DeepPaperNotePanel.open({
				values: {title: 'Paper', authorShortName: 'Author', year: '2026', domain: 'New', target_directory: ''},
				domains: ['New'], authors: ['Author'], editableMetadata: false,
				candidates: [], confidence: '', previewPath: 'New/paper/paper.pdf', previewLoading: false,
				previewError: '', status: 'confirm', statusText: '',
			}, async () => ({path: 'New/paper/paper.pdf'})).catch(() => {});
		});
		frame = await tab.page.waitForFrame(f => f.url().includes('progressWindow/progressWindow.html'));
		await frame.waitForSelector('button.is-primary');
		await frame.evaluate(() => {
			window.sentMessages = [];
			let sendMessage = Zotero.Messaging.sendMessage;
			Zotero.Messaging.sendMessage = function(name, ...args) {
				window.sentMessages.push(name);
				return sendMessage.call(this, name, ...args);
			};
		});
	}

	function pressEscape() {
		return frame.evaluate(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
			return window.sentMessages;
		});
	}

	it('cancels on Escape while confirming', async function() {
		await openPanel();
		let sent = await pressEscape();
		assert.include(sent, 'progressWindowIframe.deepPaperNoteCancel');
	});

	it('ignores Escape while the PDF is saving', async function() {
		await openPanel();
		await tab.run(() => Zotero.DeepPaperNotePanel.update({status: 'saving', statusText: 'Saving PDF…'}));
		await frame.waitForSelector('.DeepPaperNote-status.is-saving');
		let sent = await pressEscape();
		assert.notInclude(sent, 'progressWindowIframe.deepPaperNoteCancel');
	});
});
