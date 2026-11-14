/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2018 Center for History and New Media
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

// We cannot display the save panel if the page CSP sets a sandbox without scripts
// (e.g. GitHub gists), so mark the tab and explain on the toolbar button instead
Zotero.WebRequestIntercept.addListener('headersReceived', function(details) {
	// Proxy login is a POST method that gets redirected to the final destination via a 302
	if (details.method != "GET" && details.statusCode < 300 && details.statusCode >= 400) return;
	
	const contentType = details.responseHeadersObject['content-type']?.split(';')[0]?.trim();
	const csp = details.responseHeadersObject['content-security-policy'];
	const isCSPProtected = csp && csp.includes("sandbox") && !csp.includes("allow-scripts");
	if (!isCSPProtected) return;
	
	// Somehow browser.webNavigation.onCommitted runs later than headersReceived
	setTimeout(async function() {
		var tab = await browser.tabs.get(details.tabId);
		let tabInfo = Zotero.Connector_Browser.getTabInfo(tab.id);
		tabInfo.uninjectable = true;
		tabInfo.contentType = contentType;
		Zotero.Connector_Browser._updateExtensionUI(tab);
	}, 100);
});

Zotero.Utilities.saveWithoutProgressWindow = async function (tab, frameId) {
	await browser.action.setBadgeBackgroundColor({tabId: tab.id, color: '#d73a4a'});
	await browser.action.setBadgeText({tabId: tab.id, text: '!'});
	await browser.action.setTitle({
		tabId: tab.id,
		title: "DeepPaperNote Connector cannot run on this page. Open the paper's PDF in a normal tab to save it."
	});
}
