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

import { background, delay } from '../support/utils.mjs';

// Runs fn in the service worker with fake timers and a spy on the keep-alive ping.
// fn receives ({clock, pings}) where pings() returns how many pings have happened.
function withFakeTimers(fn) {
	return background(async (fnSource) => {
		let clock = sinon.useFakeTimers({toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout']});
		let ping = sinon.stub(browser.runtime, 'getPlatformInfo').resolves({});
		try {
			let fn = eval(`(${fnSource})`);
			return await fn({clock, pings: () => ping.callCount});
		}
		finally {
			ping.restore();
			clock.restore();
		}
	}, fn.toString());
}

describe('Service worker keep-alive', function() {
	this.timeout(60000);

	// Startup work (such as the translator metadata update) legitimately keeps the worker alive
	beforeEach(async function() {
		while (await background(() => Zotero.Connector_Browser.isKeepingServiceWorkerAlive())) {
			await delay(250);
		}
	});

	it('pings only while work is pending', async function() {
		let result = await withFakeTimers(async ({clock, pings}) => {
			let idle = (clock.tick(60e3), pings());
			Zotero.Connector_Browser.setKeepServiceWorkerAlive(true);
			Zotero.Connector_Browser.setKeepServiceWorkerAlive(true);
			clock.tick(20e3);
			Zotero.Connector_Browser.setKeepServiceWorkerAlive(false);
			clock.tick(20e3);
			let busy = pings();
			Zotero.Connector_Browser.setKeepServiceWorkerAlive(false);
			clock.tick(60e3);
			return {idle, busy, done: pings()};
		});
		assert.equal(result.idle, 0);
		assert.equal(result.busy, 2);
		assert.equal(result.done, 2);
	});

	it('keeps pinging when work starts long after startup', async function() {
		let result = await withFakeTimers(async ({clock, pings}) => {
			clock.tick(15 * 60e3);
			Zotero.Connector_Browser.setKeepServiceWorkerAlive(true);
			clock.tick(40e3);
			Zotero.Connector_Browser.setKeepServiceWorkerAlive(false);
			return pings();
		});
		assert.equal(result, 2);
	});

	it('does not release other work when a header rule is removed twice', async function() {
		let result = await withFakeTimers(async ({clock, pings}) => {
			let restore = sinon.stub(browser.declarativeNetRequest, 'updateSessionRules').resolves();
			try {
				Zotero.Connector_Browser.setKeepServiceWorkerAlive(true);
				let ruleID = await Zotero.WebRequestIntercept.replaceHeadersDNR('https://example.com/', [{name: 'Referer', value: 'https://example.com/'}]);
				await Zotero.WebRequestIntercept.removeRuleDNR(ruleID);
				await Zotero.WebRequestIntercept.removeRuleDNR(ruleID);
				clock.tick(20e3);
				let stillPinging = pings();
				Zotero.Connector_Browser.setKeepServiceWorkerAlive(false);
				return stillPinging;
			}
			finally {
				restore.restore();
			}
		});
		assert.equal(result, 1);
	});
});
