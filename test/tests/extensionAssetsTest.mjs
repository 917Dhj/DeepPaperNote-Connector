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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { background, Tab, getExtensionURL } from '../support/utils.mjs';

const BUILD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../build/manifestv3');
const SKIP_DIRS = new Set(['lib', 'test']);

function* sourceFiles(dir) {
	for (let entry of fs.readdirSync(dir, {withFileTypes: true})) {
		let fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!SKIP_DIRS.has(entry.name)) yield* sourceFiles(fullPath);
		}
		else if (/\.(js|html|css)$/.test(entry.name)) {
			yield fullPath;
		}
	}
}

describe('Extension assets', function() {
	it('ships every image the extension code references', function() {
		let missing = [];
		for (let file of sourceFiles(BUILD_DIR)) {
			let text = fs.readFileSync(file, 'utf8');
			for (let [image] of text.matchAll(/images\/[\w@.-]+\.(?:png|svg)/g)) {
				if (!fs.existsSync(path.join(BUILD_DIR, image))) {
					missing.push(`${path.relative(BUILD_DIR, file)} -> ${image}`);
				}
			}
		}
		assert.deepEqual(missing, []);
	});
});

describe('On-demand content script injection', function() {
	it('injects the same scripts the manifest runs on page load', function() {
		let manifest = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, 'manifest.json'), 'utf8'));
		let background = fs.readFileSync(path.join(BUILD_DIR, 'background.js'), 'utf8');
		let list = background.match(/_injectTranslationScripts = \[([\s\S]*?)\]/)[1];
		let injected = [...list.matchAll(/"([^"]+)"/g)].map(match => match[1]);
		assert.deepEqual(injected, manifest.content_scripts[0].js);
	});
});

describe('Saving on an uninjectable page', function() {
	it('marks the toolbar button instead of throwing', async function() {
		let tab = new Tab();
		await tab.init(getExtensionURL('test/data/journalArticle-single.html'));
		try {
			let result = await background(async (tabId) => {
				let tab = await browser.tabs.get(tabId);
				await Zotero.Utilities.saveWithoutProgressWindow(tab, 0);
				let marked = {
					badge: await browser.action.getBadgeText({tabId}),
					title: await browser.action.getTitle({tabId}),
				};
				await Zotero.Connector_Browser._updateExtensionUI(tab);
				return {...marked, badgeAfterUpdate: await browser.action.getBadgeText({tabId})};
			}, tab.tabId);
			assert.equal(result.badge, '!');
			assert.include(result.title, 'cannot run on this page');
			assert.equal(result.badgeAfterUpdate, '');
		}
		finally {
			await tab.close();
		}
	});
});
