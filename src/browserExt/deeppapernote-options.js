const DOMAIN_PREF = 'deepPaperNote.domain';
const HOST_NAME = 'com.deeppapernote.connector';
const domainInput = document.querySelector('#domain');
const status = document.querySelector('#status');

document.querySelector('#extension-id').textContent = browser.runtime.id;

function getPref() {
	return browser.runtime.sendMessage(['Prefs.getAsync', [DOMAIN_PREF]]);
}

function setPref(value) {
	return browser.runtime.sendMessage(['Prefs.set', [DOMAIN_PREF, value]]);
}

async function loadDomains() {
	let [response, savedDomain] = await Promise.all([
		browser.runtime.sendNativeMessage(HOST_NAME, {type: 'list_domains', version: 1}),
		getPref(),
	]);
	if (!response?.ok) throw new Error(response?.error?.message || 'Native host did not respond');
	domainInput.replaceChildren(...response.domains.map(domain => new Option(domain, domain)));
	domainInput.disabled = response.domains.length === 0;
	if (!response.domains.length) {
		status.textContent = 'No domain folders found in Research/Papers.';
		return;
	}
	domainInput.value = response.domains.includes(savedDomain) ? savedDomain : response.domains[0];
}

loadDomains().catch(error => {
	domainInput.replaceChildren(new Option('Domains unavailable', ''));
	status.textContent = `Could not load domains: ${error.message}`;
});

document.querySelector('#save').addEventListener('click', () => {
	let domain = domainInput.value;
	if (!domain) return;
	status.textContent = 'Default domain saved.';
	setPref(domain).catch(error => {
		status.textContent = `Could not save default domain: ${error.message}`;
	});
});

document.querySelector('#check').addEventListener('click', async () => {
	status.textContent = 'Checking native host…';
	try {
		let response = await browser.runtime.sendNativeMessage(HOST_NAME, {
			type: 'preview',
			version: 1,
			item: {
				title: 'Connection Test',
				creators: [{creatorType: 'author', lastName: 'DeepPaperNote'}],
				date: String(new Date().getFullYear()),
				domain: domainInput.value,
			},
		});
		if (!response?.ok) throw new Error(response?.error?.message || 'Native host did not respond');
		status.textContent = `Native host connected. Preview: ${response.path}`;
	}
	catch (error) {
		status.textContent = `Native host unavailable: ${error.message}`;
	}
});
