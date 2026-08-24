/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2024 Corporation for Digital Scholarship
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

// Used to display a different message for failing translations on pages
// with site-access limits
const SITE_ACCESS_LIMIT_TRANSLATORS = new Set([
	"57a00950-f0d1-4b41-b6ba-44ff0fc30289" // GoogleScholar
]);

function determineAttachmentIcon(attachment) {
	if(attachment.linkMode === "linked_url") {
		return Zotero.ItemTypes.getImageSrc("attachment-web-link");
	}
	var contentType = attachment.contentType || attachment.mimeType;
	return Zotero.ItemTypes.getImageSrc(
		contentType === "application/pdf" ? "attachment-pdf" : "attachment-snapshot"
	);
}

function determineAttachmentType(attachment) {
	if (attachment.linkMode === "linked_url") return Zotero.getString("itemType_link");
	var contentType = attachment.contentType || attachment.mimeType;
	if (contentType == "application/pdf") return Zotero.getString("itemType_pdf");
	if (contentType == "application/epub+zip") return Zotero.getString("itemType_epub");
	if (contentType == "text/html") return Zotero.getString("itemType_snapshot");
	return Zotero.getString("itemType_attachment");
}

/**
 * Namespace for page saving related functions injected into pages by the connector
 */
let PageSaving = {
	sessionDetails: {},
	translators: [],
	
	/**
	 * @param itemType
	 * @returns {Promise<Zotero.Translate.Web>}
	 * @private
	 */
	async _initTranslate(itemType=null) {
		let translate;
		if (Zotero.isManifestV3) {
			try {
				translate = await Zotero.VirtualOffscreenTranslate.create();
			} catch (e) {
				Zotero.logError(new Error(`Inject: Initializing translate failed at ${document.location.href}`));
				Zotero.logError(e);
				throw e;
			}
		}
		else {
			translate = new Zotero.Translate.Web();
		}
		translate.setHandler('pageModified', () => {
			Zotero.Messaging.sendMessage("pageModified", true);
		});
		// Async in MV3
		if (Zotero.isManifestV3) {
			await translate.setDocument(document, itemType === 'multiple');
		}
		else {
			translate.setDocument(document);
		}
		return translate;
	},

	/**
	 * Checks for valid page translators and notifies background page
	 * @param force
	 * @returns {Promise<void|*>}
	 */
	async onPageLoad(force) {
		if (document.location == "about:blank") return;

		// Reset session on every init so a new save is triggered after JS-based changes
		// (monitorDOMChanges/ZoteroItemUpdated)
		this.sessionDetails = {};

		// wrap this in try/catch so that errors will reach logError
		try {
			if (this.translators.length) {
				if (force) {
					this.translators = [];
				}
				else {
					return;
				}
			}

			let translate = await this._initTranslate();
			let translators = await Zotero.TranslateWeb.detect({ translate });
			this.translators = translators;
			Zotero.Connector_Browser.onTranslators(translators, instanceID, document.contentType);
		} catch (e) {
			Zotero.logError(e);
		}
	},

	_initSession(translatorID, saveOptions) {
		if (!saveOptions.resave && this.sessionDetails.id) {
			return this.sessionDetails.id;
		}
		const sessionID = Zotero.Utilities.randomString();
		this.sessionDetails = {
			id: sessionID,
			url: document.location.href,
			translatorID,
			saveOptions
		};
		return sessionID;
	},

	_clearSession() {
		this.sessionDetails = {};
	},

	_shouldReopenProgressWindow(translatorID, options, itemType=null) {
		// We have already saved something on this page
		return this.sessionDetails.id
			// Same page (no history push)
			&& document.location.href == this.sessionDetails.url
			// Same translator
			&& translatorID == this.sessionDetails.translatorID
			// Not a multiple page
			&& itemType != 'multiple'
			// Not "Create Zotero Item and Note from Selection"
			&& !options.note
			// Not from the context menu, which always triggers a resave
			&& !options.resave
	},

	/**
	 * Handles saving when highlighting text on the page and saving via right-click
	 * option "Create Zotero Item and Note from Selection"
	 * @param items
	 */	
	_processNote(items) {
		const saveOptions = this.sessionDetails.saveOptions;
		if (saveOptions && saveOptions.note && items.length == 1) {
			if (items[0].notes) {
				items[0].notes.push({note: saveOptions.note})
			} else {
				items[0].notes = {note: saveOptions.note};
			}
		}
		return items;
	},
	
	_onAttachmentProgress(attachment, progress) {
		const sessionID = PageSaving.sessionDetails.id;
		Zotero.Messaging.sendMessage(
			"progressWindow.itemProgress",
			{
				sessionID,
				id: attachment.id,
				iconSrc: determineAttachmentIcon(attachment),
				title: attachment.title,
				parentItem: attachment.parentItem,
				progress,
				itemType: determineAttachmentType(attachment)
			}
		);
	},

	/**
	 * Runs translation and attempts to save items to Zotero or Zotero account
	 * @param translators {Array}
	 * @returns {Promise<*>}
	 */
	async translateAndSave(translators, fallbackOnFailure = false) {
		const sessionID = this.sessionDetails.id;
		let itemsTotal = 0;
		let itemsSaved = 0;
		
		// Translate handlers
		const onSelect = (obj, items, callback) => {
			// Close the progress window before displaying Select Items
			Zotero.Messaging.sendMessage("progressWindow.close", null);

			// If the handler returns a non-undefined value then it is passed
			// back to the callback due to backwards compat code in translate.js
			(async () => {
				var returnItems = await Zotero.Connector_Browser.onSelect(items);

				// If items were selected, reopen the save popup
				if (returnItems && !Zotero.Utilities.isEmpty(returnItems)) {
					let sessionID = this.sessionDetails.id;
					// Record how many items are being saved so that progress window can know
					// when all top-level items are loaded
					itemsTotal = Object.keys(returnItems).length;
					itemsSaved = 0;
					Zotero.Messaging.sendMessage("progressWindow.show", [sessionID]);
				}
				callback(returnItems);
			})();
		};
		const onItemSaving = (obj, item) => {
			itemsSaved += 1;
			// this relays an item from this tab to the top level of the window
			Zotero.Messaging.sendMessage(
				"progressWindow.itemProgress",
				{
					sessionID,
					id: item.id,
					iconSrc: Zotero.ItemTypes.getImageSrc(item.itemType),
					title: item.title,
					itemsLoaded: itemsSaved >= itemsTotal ? itemsSaved : false,
					itemType: item.itemType
				}
			);
		};
		const onTranslatorFallback = (oldTranslator, newTranslator) => {
			Zotero.debug(`Saving with ${oldTranslator.label} failed. Trying ${newTranslator.label}`);
			Zotero.Messaging.sendMessage("progressWindow.error",
				['fallback', oldTranslator.label, newTranslator.label]);
		}
		
		// Item saver handlers
		const onItemsSaved = () => {
			for (let item of items) {
				// this relays an item from this frame to the top level of the window
				Zotero.Messaging.sendMessage(
					"progressWindow.itemProgress",
					{
						sessionID,
						id: item.id,
						iconSrc: Zotero.ItemTypes.getImageSrc(item.itemType),
						title: item.title,
						progress: 100,
						itemsLoaded: items.length,
						itemType: item.itemType
					}
				);
				
				if (item.notes) {
					for (let note of item.notes) {
						Zotero.Messaging.sendMessage(
							'progressWindow.itemProgress',
							{
								sessionID,
								id: null,
								iconSrc: Zotero.getExtensionURL("images/treeitem-note.png"),
								title: Zotero.Utilities.cleanTags(note.note),
								parentItem: item.id,
								progress: 100,
								itemType: Zotero.getString("itemType_note")
							}
						)
					}
				}
			}
		}

		let translate = await this._initTranslate(translators[0].itemType);
		let options = { translate, translators: translators.slice(), onSelect, onItemSaving, onTranslatorFallback };
		try {
			var { items, proxy } = await Zotero.TranslateWeb.translate(options);
		} catch (e) {
			if (translators[0].itemType != 'multiple' && fallbackOnFailure) {
				Zotero.Messaging.sendMessage("progressWindow.error", ['fallback', this.translators.at(-1).label, "Save as Webpage"]);
				Zotero.debug(`Saving with ${translators[0].label} failed. Falling back to saving as webpage`);
				return this.saveAsWebpage({ snapshot: true });
			}
			throw e;
		}
		if (Zotero.isManifestV3) {
			proxy = await translate.getProxy();
			if (proxy) proxy = new Zotero.Proxy(proxy);
		}
		items = this._processNote(items);
		this.sessionDetails.items = items;
		let itemType = translators[0].itemType;
		let itemSaver = new Zotero.ItemSaver({ sessionID, itemType, baseURI: document.location.href, proxy });
		this.sessionDetails.itemSaver = itemSaver;
		return itemSaver.saveItems(items, PageSaving._onAttachmentProgress, onItemsSaved)
	},

	async saveAsWebpage({title=document.title} = {}) {
		return this._saveAsStandaloneAttachment({title});
	},

	async _saveAsStandaloneAttachment({ title=document.title } = {}) {
		const sessionID = this.sessionDetails.id;
		if (!title) {
			title = new URL(document.location.href).pathname.split('/').pop();
		}
		title = title.replace(/\.pdf$/i, '');
		if (document.contentType !== 'application/pdf') {
			throw new Error('DeepPaperNote Connector currently supports PDF attachments only');
		}
		let standaloneAttachment = {
			url: document.location.toString(),
			mimeType: document.contentType,
			title,
			linkMode: "imported_url",
			referrer: document.referrer
		}

		try {
			let itemSaver = new Zotero.ItemSaver({sessionID, promptForMetadata: true});
			this.sessionDetails.itemSaver = itemSaver;
			await itemSaver.saveItems([{
				itemType: 'document',
				title,
				creators: [],
				date: '',
				url: document.location.toString(),
				attachments: [standaloneAttachment],
			}]);
			Zotero.Messaging.sendMessage("progressWindow.done", [true]);
			Object.assign(this.sessionDetails, {
				id: sessionID,
				url: document.location.href,
			});
		} catch (e) {
			if (e.code !== 'cancelled') {
				Zotero.Messaging.sendMessage("progressWindow.done", [false, 'unexpectedError']);
			}
			throw e;
		}
	},

	/**
	 * Entry point for translation initiated by clicking on the Zotero button or via the
	 * browser extension context menu by selecting a specific translator or saving
	 * with selection as a note.
	 */
	async onTranslate(translatorID, options={}) {
		let translatorIndex = this.translators.findIndex(t => t.translatorID === translatorID);
		let translator = this.translators[translatorIndex];
		Zotero.debug(`PageSaving.onTranslate: Translating with ${translator.label}, ${JSON.stringify(options)}`);
		
		// Always resave if a different translator/mode
		if (this.sessionDetails.translatorID && translatorID != this.sessionDetails.translatorID) {
			options.resave = true;
		}
		
		// Each save on multiple should be a new session (do not reopen the popup)
		if (translator.itemType === 'multiple' && this.sessionDetails.id && !options.resave) {
			options.resave = true;
		}

		const sessionID = this._initSession(translatorID, options);

		try {
			let translators = this.translators.slice(translatorIndex);
			// If no fallback on failure, only provide the selected translator
			if (!options.fallbackOnFailure) {
				translators = translators.slice(0, 1)
			}
			let items = await this.translateAndSave(translators, options.fallbackOnFailure);
			Zotero.Messaging.sendMessage("progressWindow.done", [true]);
			return items;
		} catch (e) {
			Zotero.logError(e);
			// Clear session details on failure, so another save click tries again
			this._clearSession();
			if (e.code === 'cancelled') return;
			await Zotero.Promise.delay(500);
			const isAccessLimitingTranslator = SITE_ACCESS_LIMIT_TRANSLATORS.has(translator.translatorID);
			const errorMessage = e.toString();
			let statusCode = '';
			try {
				statusCode = errorMessage.match(/status code ([0-9]{3})/)[1];
			} catch (e) {}
			const isHTTPErrorForbidden = statusCode == '403';
			const isHTTPErrorTooManyRequests = statusCode == '429';
			if ((isAccessLimitingTranslator && isHTTPErrorForbidden) || isHTTPErrorTooManyRequests) {
				Zotero.Messaging.sendMessage("progressWindow.done", [false, 'siteAccessLimits', translator.label]);
			}
			else {
				Zotero.Messaging.sendMessage("progressWindow.done", [false]);
			}
		}
	},

	async onSaveAsWebpage([title=document.title]) {
		this._initSession('pdf');
		return this._saveAsStandaloneAttachment({title});
	}
}

Zotero.PageSaving = PageSaving;
