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

describe('Save progress panel form', function() {
	this.timeout(15000);
	let tab = new Tab();
	let frame;

	before(async function() {
		await tab.init(getExtensionURL('test/data/journalArticle-single.html'));
	});

	after(async function() {
		await tab.page.emulateMediaFeatures([]);
		await tab.close();
	});

	async function openEditablePanel(year) {
		await tab.run((year) => {
			Zotero.DeepPaperNotePanel.open({
				values: {title: 'Paper', authorShortName: 'Author', year, domain: 'New', target_directory: ''},
				domains: ['New'], authors: [], editableMetadata: true,
				candidates: [], confidence: '', previewPath: 'New/paper/paper.pdf', previewLoading: false,
				previewError: '', status: 'confirm', statusText: '',
			}, async () => ({path: 'New/paper/paper.pdf'})).catch(() => {});
		}, year);
		frame = await tab.page.waitForFrame(f => f.url().includes('progressWindow/progressWindow.html'));
		await frame.waitForFunction(year => document.querySelector('input[name="year"]')?.value === year, {}, year);
		await frame.evaluate(() => {
			window.sentMessages = [];
			let sendMessage = Zotero.Messaging.sendMessage;
			Zotero.Messaging.sendMessage = function(name, ...args) {
				window.sentMessages.push(name);
				return sendMessage.call(this, name, ...args);
			};
		});
	}

	it('submits with Enter from a field', async function() {
		await openEditablePanel('2026');
		await frame.focus('input[name="title"]');
		await tab.page.keyboard.press('Enter');
		await frame.waitForFunction(() => window.sentMessages.includes('progressWindowIframe.deepPaperNoteSubmit'));
	});

	it('flags an invalid year only after the field is left, and clears it once fixed', async function() {
		await openEditablePanel('');
		let state = () => frame.$eval('input[name="year"]', input => ({
			invalid: input.getAttribute('aria-invalid'),
			describedBy: input.getAttribute('aria-describedby') || '',
			errorShown: getComputedStyle(document.getElementById(input.dataset.error)).display !== 'none',
		}));
		// React applies the aria state asynchronously, so wait for it before reading it
		let settle = invalid => frame.waitForFunction(
			invalid => document.querySelector('input[name="year"]').getAttribute('aria-invalid') === invalid,
			{timeout: 2000}, invalid);
		assert.deepEqual(await state(), {invalid: 'false', describedBy: '', errorShown: false});

		await frame.type('input[name="year"]', '20');
		assert.equal((await state()).invalid, 'false');
		await frame.focus('input[name="title"]');
		await settle('true');
		let left = await state();
		assert.equal(left.invalid, 'true');
		assert.isTrue(left.errorShown);
		assert.include(left.describedBy, 'year-error');

		await frame.$eval('input[name="year"]', input => input.select());
		await frame.type('input[name="year"]', '2026');
		assert.equal(await frame.$eval('input[name="year"]', input => input.value), '2026');
		await settle('false');
		assert.deepEqual(await state(), {invalid: 'false', describedBy: '', errorShown: false});
	});

	it('keeps what the user typed when an older preview result arrives', async function() {
		await openEditablePanel('2026');
		await frame.$eval('input[name="title"]', input => input.select());
		await frame.type('input[name="title"]', 'Paper Two');
		// A preview requested before the last keystrokes reports the values it was asked about
		await tab.run(() => Zotero.DeepPaperNotePanel.update({
			previewLoading: false, previewPath: 'New/paper/paper.pdf',
			values: {title: 'Paper', authorShortName: 'Author', year: '2026', domain: 'New', target_directory: ''},
		}));
		await frame.waitForFunction(() => document.querySelector('.DeepPaperNote-path div').textContent === 'New/paper/paper.pdf');
		assert.equal(await frame.$eval('input[name="title"]', input => input.value), 'Paper Two');
	});

	it('follows the dark color scheme on pages that do not declare one', async function() {
		await tab.page.emulateMediaFeatures([{name: 'prefers-color-scheme', value: 'light'}]);
		await openEditablePanel('2026');
		let light = await frame.$eval('.ProgressWindow-box', box => getComputedStyle(box).backgroundColor);
		await tab.page.emulateMediaFeatures([{name: 'prefers-color-scheme', value: 'dark'}]);
		await frame.waitForFunction(light => getComputedStyle(document.querySelector('.ProgressWindow-box')).backgroundColor !== light, {timeout: 2000}, light);
	});
});
