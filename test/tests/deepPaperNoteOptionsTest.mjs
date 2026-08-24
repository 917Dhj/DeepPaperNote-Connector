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

import { background, getExtensionURL } from '../support/utils.mjs';

function within(label, promise) {
	return Promise.race([
		promise,
		new Promise((resolve, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), 2000)),
	]);
}

describe('DeepPaperNote Settings', function() {
	this.timeout(15000);
	let page;
	let previousDomain;

	before(async function() {
		previousDomain = await background(() => Zotero.Prefs.get('deepPaperNote.domain'));
		await background(() => Zotero.Prefs.set('deepPaperNote.domain', '视觉理解'));
		page = await browser.newPage();
		await page.goto(getExtensionURL('deeppapernote-options.html'));
		await page.evaluate(async () => {
			browser.runtime.sendNativeMessage = async () => ({
				ok: true,
				domains: ['视觉理解', '长视频理解'],
			});
			await loadDomains();
		});
		await page.waitForSelector('#domain:not([disabled])');
	});

	after(async function() {
		await page.close();
		await background(value => Zotero.Prefs.set('deepPaperNote.domain', value), previousDomain);
	});

	it('selects an existing folder and updates the live background preference', async function() {
		let initial = await within('read selector', page.$eval('#domain', select => ({
			value: select.value,
			options: [...select.options].map(option => option.value),
		})));
		assert.equal(initial.value, '视觉理解');
		assert.deepEqual(initial.options, ['视觉理解', '长视频理解']);

		await within('select domain', page.select('#domain', '长视频理解'));
		await within('click save', page.$eval('#save', button => button.click()));
		await within('saved status', page.waitForFunction(
			() => document.querySelector('#status').textContent.includes('saved')
		));

		assert.equal(
			await within('background preference', background(
				() => Zotero.Prefs.getAsync('deepPaperNote.domain')
			)),
			'长视频理解'
		);
	});
});
