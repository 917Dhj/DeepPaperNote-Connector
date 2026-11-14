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

describe('Modal prompt', function() {
	this.timeout(15000);
	let tab = new Tab();

	before(async function() {
		await tab.init(getExtensionURL('test/data/journalArticle-single.html'));
	});

	after(async function() {
		await tab.close();
	});

	async function confirmAndClick(button1Text) {
		await tab.run((button1Text) => {
			window.promptResult = null;
			Zotero.ModalPrompt.confirm({title: 'Prompt', message: 'Message', button1Text})
				.then(result => { window.promptResult = result; });
		}, button1Text);
		let frame = await tab.page.waitForFrame(f => f.url().includes('modalPrompt/modalPrompt.html'));
		await frame.waitForFunction(text => document.querySelector('input[name="1"]')?.value === text, {}, button1Text);
		let focused = await frame.waitForFunction(() => document.activeElement?.name === '1').then(() => true, () => false);
		await frame.click('input[name="1"]');
		await tab.page.waitForFunction(() => window.promptResult !== null);
		return {focused, result: await tab.run(() => window.promptResult)};
	}

	it('focuses the primary button and resolves with the clicked button', async function() {
		let {focused, result} = await confirmAndClick('Continue');
		assert.isTrue(focused);
		assert.equal(result.button, 1);
	});

	it('can be shown again after closing', async function() {
		let {result} = await confirmAndClick('Again');
		assert.equal(result.button, 1);
	});
});
