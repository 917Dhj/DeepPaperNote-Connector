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

(function() {
	let isTopWindow = false;
	try {
		isTopWindow = window.top === window;
	}
	catch (e) {}
	if (!isTopWindow) return;

	let frame;
	let frameReady = Zotero.Promise.defer();
	let initialized = false;
	let closeTimer;
	let changeHandler;
	let resolveOpen;
	let rejectOpen;

	function send(name, data={}) {
		return Zotero.Messaging.sendToZoteroFrames(name, data);
	}

	function listen(name, handler) {
		return Zotero.Messaging.addMessageListener(name, handler);
	}

	function addEvent(name, data) {
		frameReady.promise.then(() => send(`progressWindowIframe.${name}`, data));
	}

	function hide() {
		if (frame?.frame) frame.frame.style.display = 'none';
	}

	function scheduleHide(delay=3000) {
		clearTimeout(closeTimer);
		closeTimer = setTimeout(hide, delay);
	}

	function cancel() {
		if (rejectOpen) {
			let error = new Error('DeepPaperNote save cancelled');
			error.code = 'cancelled';
			rejectOpen(error);
		}
		resolveOpen = rejectOpen = null;
		hide();
	}

	async function initFrame() {
		frame = new Zotero.Frame({
			id: 'deeppapernote-progress-window-frame',
			src: Zotero.getExtensionURL('progressWindow/progressWindow.html'),
			title: 'Save to DeepPaperNote',
		}, {
			position: 'fixed',
			top: '15px',
			right: '8px',
			left: 'unset',
			width: '351px',
			maxWidth: '95%',
			height: '120px',
			maxHeight: '90vh',
			border: 'none',
			margin: 'initial',
			zIndex: 2147483647,
			display: 'none',
		});
		let iframe = frame.frame;

		listen('progressWindowIframe.registered', () => frameReady.resolve(iframe));
		listen('progressWindowIframe.resized', data => {
			iframe.style.height = `${data.height + 33}px`;
		});
		let previewRevision = 0;
		listen('progressWindowIframe.deepPaperNoteChanged', async values => {
			let revision = ++previewRevision;
			let handler = changeHandler;
			if (!changeHandler) return;
			addEvent('updateDeepPaperNote', {previewLoading: true, previewError: ''});
			try {
				let preview = await handler(values);
				if (revision !== previewRevision || handler !== changeHandler) return;
				addEvent('updateDeepPaperNote', {
					previewLoading: false,
					previewError: '',
					previewPath: preview.path,
					candidates: preview.candidates || [],
					confidence: preview.confidence || '',
					values: {...values, target_directory: preview.target_directory || ''},
				});
			}
			catch (error) {
				if (revision !== previewRevision || handler !== changeHandler) return;
				addEvent('updateDeepPaperNote', {
					previewLoading: false,
					previewError: error.message,
					previewPath: '',
				});
			}
		});
		listen('progressWindowIframe.deepPaperNoteSubmit', values => {
			if (resolveOpen) resolveOpen(values);
			resolveOpen = rejectOpen = null;
		});
		listen('progressWindowIframe.deepPaperNoteCancel', cancel);

		await frameReady.promise;
		return iframe;
	}

	async function show() {
		let iframe;
		if (!initialized) {
			initialized = true;
			iframe = await initFrame();
		}
		else {
			iframe = await frameReady.promise;
		}
		clearTimeout(closeTimer);
		iframe.style.display = 'block';
		return iframe;
	}

	Zotero.DeepPaperNotePanel = {
		async open(data, onChange) {
			changeHandler = onChange;
			addEvent('reset');
			await show();
			addEvent('showDeepPaperNote', data);
			return new Promise((resolve, reject) => {
				resolveOpen = resolve;
				rejectOpen = reject;
			});
		},

		update(data) {
			addEvent('updateDeepPaperNote', data);
		},

		complete(result) {
			addEvent('updateDeepPaperNote', {
				status: 'saved',
				statusText: result.status === 'existing' ? 'PDF already archived' : 'PDF saved',
				previewPath: result.path,
			});
			scheduleHide();
		},

		fail(error) {
			addEvent('updateDeepPaperNote', {status: 'error', statusText: error.message});
		},

		async showError(error, item={}) {
			addEvent('reset');
			await show();
			addEvent('showDeepPaperNote', {
				values: {
					title: item.title || '',
					authorShortName: '',
					year: `${item.date || ''}`.match(/(?:19|20)\d{2}/)?.[0] || '',
					domain: '',
				},
				domains: [],
				authors: [],
				editableMetadata: false,
				previewPath: '',
				previewError: '',
				previewLoading: false,
				status: 'error',
				statusText: error.message,
			});
		},
	};
})();
