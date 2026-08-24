/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2025 Corporation for Digital Scholarship
					Vienna, Virginia, USA
					http://zotero.org
	
	This file is part of Zotero.
	
	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.

	You should have received a copy of the GNU Affero General Public License
	along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
	
	***** END LICENSE BLOCK *****
*/

import { Tab, background, getExtensionURL, delay } from '../support/utils.mjs';

describe("ItemSaver", function() {
	var tab = new Tab();

	before(async function() {
		await tab.init(getExtensionURL('test/data/journalArticle-single.html'))
	});

	after(async function () {
		await tab.close();
	});

	describe('_executeSingleFile', function() {
		it('sets data.url to item.url when item has url defined', async function() {
			const testUrl = 'https://example.com/test-article';

			const capturedData = await tab.run(async function (testUrl) {
				try {
					const ItemSaver = Zotero.ItemSaver;
					let capturedData = null;

					// Stub the required functions
					sinon.stub(Zotero.SingleFile, "retrievePageData").resolves("test content");
					sinon.stub(Zotero.Connector, "saveSingleFile").callsFake(async (options, data) => {
						capturedData = data;
					});

					// Create ItemSaver instance with test data
					const itemSaver = new ItemSaver({
						sessionID: 'test-session',
					});

					// Set up test data
					itemSaver._items = [{
						url: testUrl,
					}];
					itemSaver._snapshotAttachment = {
						title: 'Test Snapshot',
					};
					itemSaver._sessionID = 'test-session';

					await itemSaver._executeSingleFile(() => 0);

					return capturedData;
				}
				finally {
					Zotero.SingleFile.retrievePageData.restore();
					Zotero.Connector.saveSingleFile.restore();
				}
			}, testUrl);

			// Verify data.url is set to item.url
			assert.isNotNull(capturedData);
			assert.equal(capturedData.url, testUrl);
		});

		it('sets data.url to document.location.href when item has no url defined', async function() {
			const documentUrl = getExtensionURL('test/data/journalArticle-single.html');
			const capturedData = await tab.run(async function () {
				try {
					const ItemSaver = Zotero.ItemSaver;
					let capturedData = null;

					// Stub the required functions
					sinon.stub(Zotero.SingleFile, "retrievePageData").resolves("test content");
					sinon.stub(Zotero.Connector, "saveSingleFile").callsFake(async (options, data) => {
						capturedData = data;
					});

					// Create ItemSaver instance with test data
					const itemSaver = new ItemSaver({
						sessionID: 'test-session',
					});

					// Set up test data
					itemSaver._items = [{
						// No url
					}];
					itemSaver._snapshotAttachment = {
						title: 'Test Snapshot',
					};
					itemSaver._sessionID = 'test-session';

					await itemSaver._executeSingleFile(() => 0);

					return capturedData;
				}
				finally {
					Zotero.SingleFile.retrievePageData.restore();
					Zotero.Connector.saveSingleFile.restore();
				}
			});

			// Verify data.url is set to document.location.href
			assert.isNotNull(capturedData);
			assert.equal(capturedData.url, documentUrl);
		});
	});

	describe('DeepPaperNote save boundary', function() {
		it('renders the DeepPaperNote confirmation UI in the progress window', async function() {
			await tab.run(function() {
				Zotero.DeepPaperNotePanel.open({
					values: {title: 'Paper', authorShortName: '', year: '2026', domain: '长视频理解'},
					domains: ['视觉理解', '长视频理解'],
					authors: ['Fei'],
					editableMetadata: false,
					previewPath: 'Research/Papers/长视频理解/Paper/Fei - 2026 - Paper.pdf',
					previewError: '',
					previewLoading: false,
					status: 'confirm',
					statusText: '',
				}, () => 0).catch(() => 0);
			});
			let frame = await tab.page.waitForFrame(
				frame => frame.url().includes('progressWindow/progressWindow.html'),
				{timeout: 2000}
			);
			await delay(100);

			let panel = await frame.evaluate(function() {
				return {
					headline: document.querySelector('.DeepPaperNote-headline')?.textContent,
					ariaLabel: document.querySelector('#progress-window')?.getAttribute('aria-label'),
					domain: document.querySelector('select[name="domain"]')?.value,
					path: document.querySelector('.DeepPaperNote-path div')?.textContent,
					text: document.body.textContent,
				};
			});

			assert.equal(panel.headline, 'Save to DeepPaperNote');
			assert.equal(panel.ariaLabel, 'Save to DeepPaperNote');
			assert.equal(panel.domain, '长视频理解');
			assert.include(panel.path, 'Research/Papers/长视频理解');
			assert.notInclude(panel.text, 'Zotero');

			await tab.run(function() {
				Zotero.DeepPaperNotePanel.fail(new Error('Native host unavailable'));
			});
			await delay(50);
			assert.equal(
				await frame.$eval('.DeepPaperNote-status', node => node.textContent),
				'Native host unavailable'
			);

			await tab.run(function() {
				Zotero.DeepPaperNotePanel.complete({
					status: 'saved',
					path: 'Research/Papers/长视频理解/Paper/Fei - 2026 - Paper.pdf',
				});
			});
			await delay(50);
			assert.equal(await frame.$eval('.DeepPaperNote-status', node => node.textContent), 'PDF saved');

			await frame.evaluate(function() {
				document.querySelector('.DeepPaperNote-actions button').click();
			});
		});

		it('uses the current default domain and saves through the unified panel', async function() {
			const result = await tab.run(async function() {
				try {
					sinon.stub(Zotero.Prefs, 'getAsync').resolves('长视频理解');
					sinon.stub(Zotero.Prefs, 'set');
					sinon.stub(Zotero.DeepPaperNote, 'listDomains').resolves(['视觉理解', '长视频理解']);
					sinon.stub(Zotero.DeepPaperNote, 'preview').resolves({
						path: 'Research/Papers/长视频理解/Paper/Fei - 2026 - Paper.pdf'
					});
					sinon.stub(Zotero.DeepPaperNote, 'save').resolves({
						status: 'saved',
						path: 'Research/Papers/长视频理解/Paper/Fei - 2026 - Paper.pdf',
					});
					let panelData;
					sinon.stub(Zotero.DeepPaperNotePanel, 'open').callsFake(async data => {
						panelData = data;
						return data.values;
					});
					sinon.stub(Zotero.DeepPaperNotePanel, 'update');
					sinon.stub(Zotero.DeepPaperNotePanel, 'complete');
					sinon.stub(Zotero.DeepPaperNotePanel, 'fail');

					let itemsDone = false;
					let attachmentProgress = [];
					let item = {
						itemType: 'journalArticle',
						title: 'Paper',
						date: '2026',
						creators: [{creatorType: 'author', lastName: 'Fei'}],
						attachments: [{title: 'Full Text PDF', mimeType: 'application/pdf', url: 'https://example.com/paper.pdf'}],
					};
					let saver = new Zotero.ItemSaver({sessionID: 'test-session'});
					await saver.saveItems(
						[item],
						(attachment, progress) => attachmentProgress.push([attachment.title, progress]),
						() => itemsDone = true
					);
					return {
						domain: Zotero.DeepPaperNote.save.firstCall.args[1].domain,
						previewPath: panelData.previewPath,
						domains: panelData.domains,
						itemsDone,
						attachmentProgress,
						archiveStatus: item.deepPaperNote.status,
						referrer: item.attachments[0].referrer,
						documentOrigin: document.location.origin,
					};
				}
				finally {
					Zotero.Prefs.getAsync.restore();
					Zotero.Prefs.set.restore();
					Zotero.DeepPaperNote.listDomains.restore();
					Zotero.DeepPaperNote.preview.restore();
					Zotero.DeepPaperNote.save.restore();
					Zotero.DeepPaperNotePanel.open.restore();
					Zotero.DeepPaperNotePanel.update.restore();
					Zotero.DeepPaperNotePanel.complete.restore();
					Zotero.DeepPaperNotePanel.fail.restore();
				}
			});

			assert.equal(result.domain, '长视频理解');
			assert.include(result.previewPath, 'Research/Papers/长视频理解/Paper/Fei - 2026 - Paper.pdf');
			assert.deepEqual(result.domains, ['视觉理解', '长视频理解']);
			assert.isTrue(result.itemsDone);
			assert.deepEqual(result.attachmentProgress, [['Full Text PDF', 0], ['Full Text PDF', 100]]);
			assert.equal(result.archiveStatus, 'saved');
			assert.equal(result.referrer, result.documentOrigin);
		});
	});

	describe('_saveToServer', function() {
		async function saveWithAutomaticTags(automaticTags) {
			return tab.run(async function (automaticTags) {
				let submittedItems;
				try {
					sinon.stub(Zotero.Prefs, 'getAsync').callsFake(async pref => {
						if (pref === 'automaticTags') return automaticTags;
						return {
							downloadAssociatedFiles: false,
							automaticSnapshots: false,
						};
					});
					sinon.stub(Zotero.API, 'createItem').callsFake(async items => {
						submittedItems = items;
						return JSON.stringify({ success: [1] });
					});

					let item = {
						itemType: 'journalArticle',
						title: 'Tagged Item',
						tags: [
							{ tag: 'Automatic', type: 1 },
							{ tag: 'Manual', type: 0 },
						],
						attachments: [],
					};
					let itemSaver = new Zotero.ItemSaver({ sessionID: 'test-session' });
					await itemSaver._saveToServer([item], () => 0);

					return { submittedItems, originalTags: item.tags };
				}
				finally {
					Zotero.Prefs.getAsync.restore();
					Zotero.API.createItem.restore();
				}
			}, automaticTags);
		}

		it('omits automatic tags from server saves when automatic tagging is disabled', async function() {
			let { submittedItems, originalTags } = await saveWithAutomaticTags(false);

			assert.deepEqual(submittedItems[0].tags, [{ tag: 'Manual', type: 1 }]);
			assert.deepEqual(originalTags, [
				{ tag: 'Automatic', type: 1 },
				{ tag: 'Manual', type: 0 },
			]);
		});

		it('includes automatic tags in server saves when automatic tagging is enabled', async function() {
			let { submittedItems } = await saveWithAutomaticTags(true);

			assert.deepEqual(submittedItems[0].tags, [
				{ tag: 'Automatic', type: 1 },
				{ tag: 'Manual', type: 1 },
			]);
		});
	});
});
