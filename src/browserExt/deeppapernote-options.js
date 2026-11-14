const DOMAIN_PREF = 'deepPaperNote.domain';
const domainInput = document.querySelector('#domain');
const status = document.querySelector('#status');

document.querySelector('#extension-id').textContent = browser.runtime.id;

async function callBackground(name, ...args) {
	let response = await browser.runtime.sendMessage([name, args]);
	if (Array.isArray(response) && response[0] === 'error') {
		throw new Error(JSON.parse(response[1]).message);
	}
	return response;
}

async function loadDomains() {
	let [domains, savedDomain] = await Promise.all([
		callBackground('DeepPaperNote.listDomains'),
		callBackground('Prefs.getAsync', DOMAIN_PREF),
	]);
	domainInput.replaceChildren(...domains.map(domain => new Option(domain, domain)));
	domainInput.disabled = domains.length === 0;
	if (!domains.length) {
		status.textContent = 'No domain folders found in Research/Papers.';
		return;
	}
	domainInput.value = domains.includes(savedDomain) ? savedDomain : domains[0];
}

loadDomains().catch(error => {
	domainInput.replaceChildren(new Option('Domains unavailable', ''));
	status.textContent = `Could not load domains: ${error.message}`;
});

document.querySelector('#save').addEventListener('click', async () => {
	let domain = domainInput.value;
	if (!domain) return;
	try {
		await callBackground('Prefs.set', DOMAIN_PREF, domain);
		status.textContent = 'Default domain saved.';
	}
	catch (error) {
		status.textContent = `Could not save default domain: ${error.message}`;
	}
});

document.querySelector('#check').addEventListener('click', async () => {
	status.textContent = 'Checking native host…';
	try {
		let response = await callBackground('DeepPaperNote.preview', {
			title: 'Connection Test',
			creators: [{creatorType: 'author', lastName: 'DeepPaperNote'}],
			date: String(new Date().getFullYear()),
		}, {domain: domainInput.value});
		status.textContent = `Native host connected. Preview: ${response.path}`;
	}
	catch (error) {
		status.textContent = `Native host unavailable: ${error.message}`;
	}
});
