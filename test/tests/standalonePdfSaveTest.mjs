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

describe('Standalone PDF save', function() {
	it('starts saving a PDF that no translator recognizes', async function() {
		let tab = new Tab();
		await tab.init(getExtensionURL('test/data/journalArticle-single.html'));
		try {
			let saved = await tab.run(async () => {
				Object.defineProperty(document, 'contentType', {value: 'application/pdf', configurable: true});
				let stub = sinon.stub(Zotero.ItemSaver.prototype, 'saveItems').callsFake(async items => items);
				try {
					// Same arguments the background sends: [tab.title, options]
					await Zotero.PageSaving.onSaveAsWebpage(['Dropout.pdf', {}]);
					let [items] = stub.firstCall.args;
					return {title: items[0].title, mimeType: items[0].attachments[0].mimeType};
				}
				catch (e) {
					return {error: e.message};
				}
				finally {
					stub.restore();
					delete document.contentType;
				}
			});
			assert.deepEqual(saved, {title: 'Dropout', mimeType: 'application/pdf'});
		}
		finally {
			await tab.close();
		}
	});
});
