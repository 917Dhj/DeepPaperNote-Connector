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

import { background, Tab, getExtensionURL } from '../support/utils.mjs';

describe('Toolbar button on pages without a detected paper', function() {
	this.timeout(15000);
	let tab = new Tab();

	before(async function() {
		await tab.init(getExtensionURL('test/data/journalArticle-single.html'));
	});

	after(async function() {
		await tab.close();
	});

	it('stays clickable when no paper was detected', async function() {
		let enabled = await background(async tabId => {
			let tabInfo = Zotero.Connector_Browser.getTabInfo(tabId);
			tabInfo.translators = [];
			tabInfo.isPDF = false;
			await Zotero.Connector_Browser._updateExtensionUI(await browser.tabs.get(tabId));
			return browser.action.isEnabled(tabId);
		}, tab.tabId);
		assert.isTrue(enabled);
	});

	// After the extension reloads, content scripts in open tabs are orphaned and
	// the tab has never reported detection results to the new service worker
	it('detects on click in a tab that never reported detection results', async function() {
		let saved = await background(async tabId => {
			let tab = await browser.tabs.get(tabId);
			Zotero.Connector_Browser.resetTabInfo(tabId);
			let inject = sinon.stub(Zotero.Connector_Browser, 'injectTranslationScripts').callsFake(async () => {
				setTimeout(() => Zotero.Connector_Browser.onTranslators(
					[{translatorID: 'test', label: 'Test', priority: 100, itemType: 'journalArticle'}], 'instance', 'text/html', tab, 0
				), 200);
			});
			let save = sinon.stub(Zotero.Connector_Browser, 'saveWithTranslator').resolves();
			try {
				await Zotero.Connector_Browser.onZoteroButtonElementClick(tab);
				return {injected: inject.called, saved: save.called};
			}
			finally {
				inject.restore();
				save.restore();
			}
		}, tab.tabId);
		assert.deepEqual(saved, {injected: true, saved: true});
	});

	it('explains in the save panel when no paper is found', async function() {
		await background(async tabId => {
			let tabInfo = Zotero.Connector_Browser.getTabInfo(tabId);
			tabInfo.translators = [];
			tabInfo.isPDF = false;
			await Zotero.Connector_Browser.onZoteroButtonElementClick(await browser.tabs.get(tabId));
		}, tab.tabId);
		let frame = await tab.page.waitForFrame(f => f.url().includes('progressWindow/progressWindow.html'));
		await frame.waitForSelector('.DeepPaperNote-status.is-error');
		assert.include(await frame.$eval('.DeepPaperNote-status', node => node.textContent), 'No paper detected');
		let panel = await frame.$eval('.ProgressWindow-box', node => node.textContent);
		assert.notInclude(panel, 'Untitled PDF');
		assert.notInclude(panel, 'Final path');
	});
});
