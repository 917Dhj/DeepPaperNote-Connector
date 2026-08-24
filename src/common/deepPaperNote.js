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

Zotero.DeepPaperNote = {
	HOST_NAME: 'com.deeppapernote.connector',
	PROTOCOL_VERSION: 1,
	CHUNK_SIZE: 768 * 1024,

	_archiveItem(item, overrides={}) {
		let arXiv = '';
		let match = `${item.extra || ''} ${item.url || ''}`.match(/arxiv[:./\s]+(\d{4}\.\d{4,5})(?:v\d+)?/i);
		if (match) arXiv = match[1];
		return {
			title: overrides.title || item.title || '',
			creators: (item.creators || []).map(creator => ({
				creatorType: creator.creatorType || 'author',
				firstName: creator.firstName || '',
				lastName: creator.lastName || '',
				name: creator.name || '',
			})),
			date: item.date || '',
			year: overrides.year || '',
			DOI: item.DOI || '',
			arXiv,
			domain: overrides.domain || '',
			authorShortName: overrides.authorShortName || '',
		};
	},

	_checkResponse(response) {
		if (response && response.ok) return response;
		throw new Error(response?.error?.message || 'DeepPaperNote native host did not respond');
	},

	async listDomains() {
		let response = await browser.runtime.sendNativeMessage(this.HOST_NAME, {
			type: 'list_domains',
			version: this.PROTOCOL_VERSION,
		});
		return this._checkResponse(response).domains;
	},

	async preview(item, overrides) {
		let response = await browser.runtime.sendNativeMessage(this.HOST_NAME, {
			type: 'preview',
			version: this.PROTOCOL_VERSION,
			item: this._archiveItem(item, overrides),
		});
		return this._checkResponse(response);
	},

	_selectPDF(item) {
		let attachments = (item.attachments || []).filter(attachment =>
			attachment.snapshot !== false && attachment.mimeType?.toLowerCase() === 'application/pdf'
		);
		if (attachments.length !== 1) {
			throw new Error(`DeepPaperNote requires exactly one PDF attachment; found ${attachments.length}`);
		}
		return attachments[0];
	},

	_isPDF(arrayBuffer) {
		let bytes = new Uint8Array(arrayBuffer, 0, Math.min(arrayBuffer.byteLength, 1024));
		for (let i = 0; i <= bytes.length - 5; i++) {
			if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44
					&& bytes[i + 3] === 0x46 && bytes[i + 4] === 0x2D) {
				return true;
			}
		}
		return false;
	},

	_openNativePort() {
		let port = browser.runtime.connectNative(this.HOST_NAME);
		let waiting = null;
		port.onMessage.addListener(response => {
			if (!waiting) return;
			let {resolve, reject} = waiting;
			waiting = null;
			try {
				resolve(this._checkResponse(response));
			}
			catch (error) {
				reject(error);
			}
		});
		port.onDisconnect.addListener(() => {
			if (!waiting) return;
			let {reject} = waiting;
			waiting = null;
			reject(new Error(browser.runtime.lastError?.message || 'DeepPaperNote native host disconnected'));
		});
		return {
			send: message => {
				if (waiting) throw new Error('DeepPaperNote native protocol request already pending');
				return new Promise((resolve, reject) => {
					waiting = {resolve, reject};
					port.postMessage(message);
				});
			},
			disconnect: () => port.disconnect(),
		};
	},

	async save(item, overrides, tab) {
		let attachment = this._selectPDF(item);
		let data = await Zotero.ItemSaver._fetchAttachment(attachment, tab);
		if (!this._isPDF(data)) {
			throw new Error('Downloaded content is not a PDF');
		}
		let digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
		let sha256 = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
		let native = this._openNativePort();
		let uploadID = '';
		try {
			let started = await native.send({
				type: 'start',
				version: this.PROTOCOL_VERSION,
				item: this._archiveItem(item, overrides),
			});
			uploadID = started.upload_id;
			let bytes = new Uint8Array(data);
			let sequence = 0;
			for (let offset = 0; offset < bytes.length; offset += this.CHUNK_SIZE) {
				let chunk = bytes.slice(offset, offset + this.CHUNK_SIZE);
				await native.send({
					type: 'chunk',
					version: this.PROTOCOL_VERSION,
					upload_id: uploadID,
					sequence: sequence++,
					data: Zotero.Utilities.Connector.arrayBufferToBase64(chunk.buffer),
				});
			}
			return await native.send({
				type: 'finish',
				version: this.PROTOCOL_VERSION,
				upload_id: uploadID,
				sha256,
			});
		}
		catch (error) {
			if (uploadID) {
				try {
					await native.send({type: 'abort', version: this.PROTOCOL_VERSION, upload_id: uploadID});
				}
				catch (e) {}
			}
			throw error;
		}
		finally {
			native.disconnect();
		}
	},
};
