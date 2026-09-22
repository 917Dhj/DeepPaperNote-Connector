import { Tab, offscreen, getExtensionURL, delay } from '../support/utils.mjs';

describe('Extension error reporting', function() {
	it('does not report inline styles while parsing a paper page', async function() {
		let messages = [];
		let onConsole = message => messages.push(message.text());
		offscreenPage.on('console', onConsole);
		try {
			await offscreen(() => new DOMParser().parseFromString(
				'<html><head><style>p { color: red }</style></head><body><p style="color: red">Paper</p></body></html>',
				'text/html'
			));
			await delay(100);
			assert.isFalse(messages.some(message => message.includes('Applying inline style violates')));
		}
		finally {
			offscreenPage.off('console', onConsole);
		}
	});

	it('does not log a cancelled save as an error', async function() {
		let tab = new Tab();
		await tab.init(getExtensionURL('test/data/journalArticle-single.html'));
		try {
			let logged = await tab.run(async () => {
				let saver = Object.create(Zotero.PageSaving);
				saver.translators = [{translatorID: 'test', label: 'Test'}];
				saver.sessionDetails = {};
				saver._initSession = () => 'test';
				saver._clearSession = () => {};
				saver.translateAndSave = async () => {
					throw Object.assign(new Error('Save cancelled'), {code: 'cancelled'});
				};
				let logError = sinon.spy(Zotero, 'logError');
				try {
					await saver.onTranslate('test');
					return logError.called;
				}
				finally {
					logError.restore();
				}
			});
			assert.isFalse(logged);
		}
		finally {
			await tab.close();
		}
	});
});
