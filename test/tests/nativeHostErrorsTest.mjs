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

function nativeError(chromeMessage) {
	return background(async (chromeMessage) => {
		let stub = sinon.stub(browser.runtime, 'sendNativeMessage').rejects(new Error(chromeMessage));
		try {
			await Zotero.DeepPaperNote.listDomains();
			return null;
		}
		catch (error) {
			return error.message;
		}
		finally {
			stub.restore();
		}
	}, chromeMessage);
}

describe('Native host errors', function() {
	// The test browser has no native host installed, so this exercises Chrome's real error text
	it('maps the real error Chrome reports for an absent host', async function() {
		let message = await background(() => Zotero.DeepPaperNote.listDomains().then(() => null, error => error.message));
		assert.include(message, 'not installed');
	});

	it('explains how to install a missing host', async function() {
		let message = await nativeError('Specified native messaging host not found.');
		assert.include(message, 'not installed');
		assert.include(message, 'deeppapernote_host.py install');
	});

	it('names the extension ID when the host forbids it', async function() {
		let message = await nativeError('Access to the specified native messaging host is forbidden.');
		assert.include(message, 'fcbddigbhoibmokafhgaooekekobjbbf');
		assert.include(message, 'deeppapernote_host.py install');
	});

	it('points at the Python environment when the host cannot run', async function() {
		for (let chromeMessage of ['Native host has exited.', 'Failed to start native messaging host.']) {
			let message = await nativeError(chromeMessage);
			assert.include(message, 'Python environment');
		}
	});

	it('passes other errors through unchanged', async function() {
		assert.equal(
			await nativeError('Error when communicating with the native messaging host.'),
			'Error when communicating with the native messaging host.'
		);
	});

	it('keeps errors reported by the host itself', async function() {
		let message = await background(async () => {
			let stub = sinon.stub(browser.runtime, 'sendNativeMessage').resolves({
				ok: false,
				error: {code: 'config', message: "Configure DeepPaperNote's shared Obsidian location"},
			});
			try {
				await Zotero.DeepPaperNote.listDomains();
			}
			catch (error) {
				return error.message;
			}
			finally {
				stub.restore();
			}
		});
		assert.equal(message, "Configure DeepPaperNote's shared Obsidian location");
	});
});
