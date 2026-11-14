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
import { background } from '../support/utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Extension version', function() {
	it('comes from package.json', async function() {
		let {version} = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
		assert.equal(await background(() => browser.runtime.getManifest().version), version);
	});

	// repo.zotero.org routes versions below 3.0 to a retired repository,
	// which breaks translator metadata and code downloads.
	it('stays at or above 3.0 for the translator repository', async function() {
		let major = await background(() => parseInt(browser.runtime.getManifest().version));
		assert.isAtLeast(major, 3);
	});
});
