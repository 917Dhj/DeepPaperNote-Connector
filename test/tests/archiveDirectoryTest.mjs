import { Tab, getExtensionURL } from '../support/utils.mjs';

describe('Archive directory selection', function() {
    let tab = new Tab();
    before(async () => tab.init(getExtensionURL('test/data/journalArticle-single.html')));
    after(async () => tab.close());

    it('shows existing directories and submits the explicitly selected destination', async function() {
        await tab.run(() => {
            let candidates = [
                {path: 'Existing/Paper', confidence: 'verified', pdf_count: 1, note_count: 1},
                {path: 'Other/Paper', confidence: 'candidate', pdf_count: 2, note_count: 0},
                {path: 'Broken/Paper', confidence: 'invalid', pdf_count: 1, note_count: 0},
            ];
            window.archiveSelection = null;
            Zotero.DeepPaperNotePanel.open({
                values: {title: 'Paper', authorShortName: 'Author', year: '2026', domain: 'New', target_directory: ''},
                domains: ['New'], authors: ['Author'], editableMetadata: false,
                candidates, confidence: 'candidate', previewPath: '', previewLoading: false,
                previewError: '', status: 'confirm', statusText: '',
            }, async values => ({path: values.target_directory + '/paper.pdf',
                target_directory: values.target_directory, candidates, confidence: 'verified'}))
                .then(values => { window.archiveSelection = values; });
        });
        let frame = await tab.page.waitForFrame(f => f.url().includes('progressWindow/progressWindow.html'));
        await frame.waitForSelector('select[name="target_directory"]');
        assert.isTrue(await frame.$eval('button.is-primary', button => button.disabled));
        assert.isNull(await frame.$('select[name="domain"]'));
        assert.include(await frame.$eval('select[name="target_directory"]', node => node.textContent), 'Title-only candidate');
        assert.isTrue(await frame.$eval('option[value="Broken/Paper"]', node => node.disabled));
        await frame.select('select[name="target_directory"]', 'Other/Paper');
        await frame.waitForFunction(() => !document.querySelector('button.is-primary').disabled);
        assert.include(await frame.$eval('.DeepPaperNote-existing', node => node.textContent), 'Existing paper directory');
        await frame.click('button.is-primary');
        await tab.page.waitForFunction(() => window.archiveSelection !== null);
        assert.equal(await tab.run(() => window.archiveSelection.target_directory), 'Other/Paper');
    });
});
