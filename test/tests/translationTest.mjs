/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2017 Center for History and New Media
					George Mason University, Fairfax, Virginia, USA
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

import {
	Tab,
	background,
	getExtensionURL,
	stubHTTPRequest
} from '../support/utils.mjs';

describe("Translation", function() {
	var tab = new Tab();

	before(async function () {
		// Make sure translators initialized
		let translators = await background(async function() {
			return Promise.all([
				Zotero.Translators.get('05d07af9-105a-4572-99f6-a8e231c0daef'),
				Zotero.Translators.get('c159dcfe-8a53-4301-a499-30f6549c340d'),
				Zotero.Translators.get('951c027d-74ac-47d4-a107-9c3069ab7b48')
			]);
		});
		assert.equal(3, translators.length);
	});
	
	describe('In the top frame', function() {
		before(async function() {
			await tab.init(getExtensionURL('test/data/journalArticle-single.html'))
		});
		after(async function () {
			await tab.close();
		});
		afterEach(async function () {
			await tab.run(() => Zotero.Inject.sessionDetails = {});
		});
		
		describe("Detection", function() {
			it('detects expected translators', async function () {
				try {
					const translatorsPromise = background(() => {
						return new Promise((resolve) => {
							sinon.stub(Zotero.Connector_Browser, 'onTranslators').callThrough().onFirstCall().callsFake((...args) => {
								resolve(args[0].map(t => t.label));
								Zotero.Connector_Browser.onTranslators.wrappedMethod.apply(Zotero.Connector_Browser, args);
							});
						});
					});
					await tab.page.reload();
					const translators = await translatorsPromise;
					assert.deepEqual(['COinS', 'DOI'], translators);
				} finally {
					await background(() => {
						Zotero.Connector_Browser.onTranslators.restore();
					});
				}
			});
		});
		
		describe("Saving", function() {
			async function navigateAndWaitForTranslators(tab, url) {
				let translatorsLoaded = background(() => {
					return new Promise((resolve) => {
						sinon.stub(Zotero.Connector_Browser, 'onTranslators').callsFake((...args) => {
							resolve(args[0].map(t => t.label));
							Zotero.Connector_Browser.onTranslators.wrappedMethod.apply(Zotero.Connector_Browser, args);
							Zotero.Connector_Browser.onTranslators.restore();
						});
					});
				});
				await tab.navigate(url);
				await translatorsLoaded;
			}

			beforeEach(async function() {
				await navigateAndWaitForTranslators(tab, getExtensionURL('test/data/journalArticle-single.html'));
			});
			
			describe("To the DeepPaperNote save boundary", function() {
				it('saves with a translator', async function () {
					await tab.run(() => sinon.stub(Zotero.ItemSaver.prototype, 'saveItems').callsFake(async items => items));
					try {
						var items = await background(async function(tabId) {
							let tab = await browser.tabs.get(tabId);
							return Zotero.Connector_Browser.saveWithTranslator(tab, 0);
						}, tab.tabId);
					}
					finally {
						await tab.run(() => Zotero.ItemSaver.prototype.saveItems.restore());
					}
					assert.equal(items.length, 1);
					assert.equal(items[0].itemType, 'journalArticle');
				});
				
				it('saves with a translator that uses the select dialog', async function () {
					await tab.run(() => sinon.stub(Zotero.ItemSaver.prototype, 'saveItems').callsFake(async items => items));
					let restoreHTTPStub = await stubHTTPRequest({
						'doi.org/10.1086%2F529596': {
							DOI: '10.1086/529596',
							type: 'article-journal',
							title: 'Scarcity or Abundance? Preserving the Past in a Digital Era',
							author: [{ given: 'Roy', family: 'Rosenzweig' }],
							page: '735-762',
							'container-title': 'The American Historical Review',
							issued: { 'date-parts': [[2003]] }
						}
					});
					try {
						var items = await background(async function(tabId) {
							var stub = sinon.stub(Zotero.Connector_Browser, "onSelect").callsFake(function(items) {
								return items;
							});
							
							try {
								var tab = await browser.tabs.get(tabId);
								return await Zotero.Connector_Browser.saveWithTranslator(tab, 1);
							}
							finally {
								stub.restore();
							}
						}, tab.tabId);
						assert.equal(items.length, 1);
						assert.equal(items[0].itemType, 'journalArticle');
					}
					finally {
						await restoreHTTPStub();
						await tab.run(() => Zotero.ItemSaver.prototype.saveItems.restore());
					}
				});
			
			});
		});
		
	});

	describe("In a child frame", function() {
		describe('Detection', function() {
			it('Sets the frame with higher priority translator as the translation target', async function() {
				try {
					let bgTranslatorsLoadedPromise = background(function() {
						let onTranslators = Zotero.Connector_Browser.onTranslators;
						let deferred = Zotero.Promise.defer();
						sinon.stub(Zotero.Connector_Browser, 'onTranslators').callsFake(function(translators) {
							if (translators.length >= 2) deferred.resolve();
							return onTranslators.apply(Zotero.Connector_Browser, arguments);
						});
						return deferred.promise;
					});
					await tab.init(getExtensionURL('test/data/top-DOI-frame-COInS.html'));
					await bgTranslatorsLoadedPromise;
					
					var [translators, instanceID] = await background(async function(tabId) {
						Zotero.Connector_Browser.onTranslators.restore();
						
						let translators = Zotero.Connector_Browser._tabInfo[tabId].translators.map(t => t.label);
						let instanceID = Zotero.Connector_Browser._tabInfo[tabId].instanceID;
						return [translators, instanceID];
					}, tab.tabId);
					
					assert.notEqual(instanceID, 0);
					assert.deepEqual(['COinS', 'DOI'], translators);
				} finally {
					await tab.close();
				}
			});
		});
	});
});
