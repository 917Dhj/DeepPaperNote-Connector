const DOMAIN_PREF = 'deepPaperNote.domain';
const HOST_NAME = 'com.deeppapernote.connector';
const domainInput = document.querySelector('#domain');
const status = document.querySelector('#status');

document.querySelector('#extension-id').textContent = browser.runtime.id;

browser.storage.local.get(DOMAIN_PREF).then(prefs => {
	domainInput.value = prefs[DOMAIN_PREF] || '未分类';
});

document.querySelector('#save').addEventListener('click', async () => {
	let domain = domainInput.value.trim() || '未分类';
	domainInput.value = domain;
	await browser.storage.local.set({[DOMAIN_PREF]: domain});
	status.textContent = 'Default domain saved.';
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
				domain: domainInput.value.trim() || '未分类',
			},
		});
		if (!response?.ok) throw new Error(response?.error?.message || 'Native host did not respond');
		status.textContent = `Native host connected. Preview: ${response.path}`;
	}
	catch (error) {
		status.textContent = `Native host unavailable: ${error.message}`;
	}
});
