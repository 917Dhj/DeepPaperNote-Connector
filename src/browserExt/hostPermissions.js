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

Zotero.HostPermissions = {
	onPageLoad() {},

	async checkChromiumActionPermissions(tab) {
		try {
			if (await browser.permissions.contains({origins: ['https://*/*']})) return true;
			let result = await Zotero.Messaging.sendMessage('confirm', {
				title: Zotero.getString('permissions_siteAccess_title'),
				button1Text: Zotero.getString('permissions_siteAccess_openPreferences'),
				button2Text: Zotero.getString('general_cancel'),
				button3Text: Zotero.getString('general_continueAnyway'),
				message: Zotero.getString('permissions_siteAccess_message_intro')
					+ Zotero.getString('permissions_siteAccess_message'),
			}, tab);
			if (result?.button === 1) {
				browser.tabs.create({url: `chrome://extensions/?id=${browser.runtime.id}`});
			}
			return result?.button === 3;
		}
		catch (error) {
			Zotero.debug(`Error checking Chromium permissions: ${error.message}`);
			return true;
		}
	},
};
