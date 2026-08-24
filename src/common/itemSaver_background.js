/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2024 Corporation for Digital Scholarship
	Copyright © 2026 DeepPaperNote contributors

	This file is part of DeepPaperNote Connector.

	DeepPaperNote Connector is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	***** END LICENSE BLOCK *****
*/

Zotero.ItemSaver = Zotero.ItemSaver || {};

Zotero.ItemSaver._fetchAttachment = async function(attachment, tab, attemptBotProtectionBypass=true) {
	let options = {responseType: 'arraybuffer', timeout: 60000, successCodes: false};
	let cookies;
	try {
		cookies = await Zotero.Connector_Browser.getAllCookies({
			url: attachment.url,
			partitionKey: {},
		}, tab?.id);
	}
	catch (e) {
		Zotero.debug(`Error getting cookies for ${attachment.url} with partitionKey.`);
		cookies = await Zotero.Connector_Browser.getAllCookies({url: attachment.url}, tab?.id);
	}
	options.headers = {
		Cookie: cookies.filter(cookie => cookie.partitionKey)
			.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
	};
	options.referrer = attachment.referrer;

	let xhr = await Zotero.HTTP.request('GET', attachment.url, options);
	let validationError = this._validateResponse(attachment, xhr);
	if (xhr.status >= 200 && xhr.status < 400 && !validationError) {
		return xhr.response;
	}

	let bypassType = Zotero.BotBypass.BYPASS_TYPE.NONE;
	if (attemptBotProtectionBypass) {
		bypassType = Zotero.BotBypass.canBotBypass(attachment.url, xhr);
	}
	let errorMessage = `Attachment download failed with HTTP status ${xhr.status}`
		+ (validationError ? ` (${validationError})` : '');
	if (!tab || bypassType === Zotero.BotBypass.BYPASS_TYPE.NONE) {
		throw new Error(errorMessage);
	}
	Zotero.debug(`${errorMessage}. Attempting bot protection bypass`);
	if (bypassType === Zotero.BotBypass.BYPASS_TYPE.AMAZON_CAPTCHA) {
		return Zotero.BotBypass.bypassAmazonCaptcha(attachment, options);
	}

	let originalURL = attachment.url;
	try {
		attachment.url = await Zotero.BotBypass.passJSDetectionViaHiddenIframe(attachment.url, tab);
		return await this._fetchAttachment(attachment, tab, false);
	}
	catch (error) {
		Zotero.debug(error);
		attachment.url = await Zotero.BotBypass.passJSDetectionViaWindowPrompt(originalURL, tab);
		return this._fetchAttachment(attachment, tab, false);
	}
};

Zotero.ItemSaver._validateResponse = function(attachment, xhr, contentType) {
	let contentLength = xhr.getResponseHeader('Content-Length');
	if (contentLength !== null && parseInt(contentLength) === 0) {
		return 'empty response';
	}
	contentType = contentType || Zotero.Utilities.Connector.getContentTypeFromXHR(xhr).contentType;
	if (!attachment.mimeType) {
		attachment.mimeType = contentType;
		if (!xhr.getResponseHeader('Content-Type')) {
			attachment.mimeType = Zotero.Utilities.Connector.guessAttachmentMimeType(attachment.url);
		}
		return null;
	}
	if (attachment.mimeType.toLowerCase() === contentType.toLowerCase()
			|| contentType.toLowerCase() === 'application/octet-stream') {
		return null;
	}
	return `Attachment MIME type ${contentType} does not match specified type ${attachment.mimeType}`;
};
