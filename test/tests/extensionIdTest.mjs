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

import { background } from '../support/utils.mjs';

describe('Extension ID', function() {
	// Must match EXTENSION_ID in native_host/deeppapernote_host.py
	it('is fixed by the manifest key regardless of the load path', async function() {
		assert.equal(await background(() => browser.runtime.id), 'fcbddigbhoibmokafhgaooekekobjbbf');
	});
});
