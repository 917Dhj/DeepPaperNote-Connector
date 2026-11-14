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

import { background, delay, Tab, getExtensionURL } from '../support/utils.mjs';

describe('Tab info', function() {
	it('is cleared when its tab closes', async function() {
		let tab = new Tab();
		await tab.init(getExtensionURL('test/data/journalArticle-single.html'));
		let tabId = tab.tabId;
		await background(tabId => { Zotero.Connector_Browser.getTabInfo(tabId); }, tabId);
		assert.isTrue(await background(tabId => tabId in Zotero.Connector_Browser._tabInfo, tabId));
		await tab.close();
		let cleared = false;
		for (let i = 0; i < 20 && !cleared; i++) {
			cleared = await background(tabId => !(tabId in Zotero.Connector_Browser._tabInfo), tabId);
			if (!cleared) await delay(100);
		}
		assert.isTrue(cleared);
	});
});
