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

window.Zotero = window.Zotero || {};
Zotero.UI = Zotero.UI || {};

Zotero.UI.ProgressWindow = class ProgressWindow extends React.PureComponent {
	constructor(props) {
		super(props);
		this.state = {data: null};
		this.onInput = this.onInput.bind(this);
		this.notifyChanged = this.notifyChanged.bind(this);
		this.submit = this.submit.bind(this);
		this.cancel = this.cancel.bind(this);
	}

	componentDidMount() {
		this.listen('progressWindowIframe.reset', () => this.setState({data: null}));
		this.listen('progressWindowIframe.showDeepPaperNote', data => this.setState({data}));
		this.listen('progressWindowIframe.updateDeepPaperNote', update => {
			this.setState(state => ({data: {...state.data, ...update}}));
		});
		document.addEventListener('keydown', event => {
			if (event.key === 'Escape') this.cancel();
		});
		this.send('registered');
	}

	componentDidUpdate() {
		window.requestAnimationFrame(() => {
			this.send('resized', {height: this.rootNode.scrollHeight});
		});
	}

	listen(name, handler) {
		return Zotero.Messaging.addMessageListener(name, handler);
	}

	send(name, data={}) {
		return Zotero.Messaging.sendMessage(`progressWindowIframe.${name}`, data);
	}

	onInput(event) {
		let {name, value} = event.target;
		this.setState(state => ({
			data: {...state.data, previewLoading: true,
				values: {...state.data.values, target_directory: name === 'target_directory' ? value : '', [name]: value}},
		}), () => {
			this.notifyChanged();
		});
	}

	notifyChanged() {
		this.send('deepPaperNoteChanged', this.state.data.values);
	}

	submit() {
		this.setState(state => ({
			data: {...state.data, status: 'saving', statusText: 'Saving PDF…'},
		}));
		this.send('deepPaperNoteSubmit', this.state.data.values);
	}

	cancel() {
		this.send('deepPaperNoteCancel');
	}

	render() {
		let data = this.state.data;
		if (!data) return <div ref={node => { this.rootNode = node; }}/>;
		let values = data.values;
		let candidates = data.candidates || [];
		let busy = data.status === 'saving' || data.status === 'saved';
		let complete = values.title.trim()
			&& (values.authorShortName.trim() || data.authors.length)
			&& /^(?:19|20)\d{2}$/.test(values.year)
			&& (values.target_directory || values.domain) && data.previewPath
			&& !data.previewLoading && !data.previewError;

		return (
			<div ref={node => { this.rootNode = node; }} className="ProgressWindow-box">
				<div className="DeepPaperNote-panel">
					<div className="DeepPaperNote-headline">Save to DeepPaperNote</div>
					<div className="DeepPaperNote-row DeepPaperNote-pdfRow">
						<img src={Zotero.getExtensionURL('images/pdf.png')} alt=""/>
						<span title={values.title}>{values.title || 'Untitled PDF'}</span>
					</div>
					{data.editableMetadata ? <React.Fragment>
						<label className="DeepPaperNote-field">Title
							<input name="title" value={values.title} onChange={this.onInput}
								onBlur={this.notifyChanged}/>
						</label>
						<label className="DeepPaperNote-field">Author
							<input name="authorShortName" value={values.authorShortName}
								onChange={this.onInput} onBlur={this.notifyChanged}/>
						</label>
						<label className="DeepPaperNote-field">Year
							<input name="year" inputMode="numeric" maxLength="4" value={values.year}
								onChange={this.onInput} onBlur={this.notifyChanged}/>
						</label>
					</React.Fragment> : <div className="DeepPaperNote-metadata">
						<div><strong>Author:</strong> {data.authors.join(', ')}</div>
						<div><strong>Year:</strong> {values.year}</div>
					</div>}
					{candidates.length > 0 ? <React.Fragment>
						<div className="DeepPaperNote-existing" role="status" aria-live="polite">
							{data.confidence === 'verified' ? 'Existing paper directory found. The PDF will be verified before saving.' : 'Title-matched candidate directory. Paper identity will be verified before saving.'}
						</div>
						<label className="DeepPaperNote-field">Existing paper directory
							<select name="target_directory" value={values.target_directory || ''}
								onChange={this.onInput} disabled={busy}>
								{!values.target_directory && <option value="">Choose a directory</option>}
								{candidates.map(candidate => <option key={candidate.path} value={candidate.path} disabled={candidate.confidence === 'invalid'}>
									{candidate.path} — {candidate.pdf_count} PDFs, {candidate.note_count} notes — {candidate.confidence === 'verified' ? 'Verified match' : candidate.confidence === 'invalid' ? 'Invalid record — repair required' : 'Title-only candidate'}
								</option>)}
							</select>
						</label>
					</React.Fragment> : <label className="DeepPaperNote-field">Domain
						<select name="domain" value={values.domain} onChange={this.onInput} disabled={busy}>
							{data.domains.map(domain => <option key={domain} value={domain}>{domain}</option>)}
						</select>
					</label>}
					<div className={`DeepPaperNote-path${data.previewError && !data.previewLoading ? ' is-error' : ''}`}>
						<strong>Final path</strong>
						<div>{data.previewLoading ? 'Checking path…' : data.previewPath || data.previewError}</div>
					</div>
					{data.statusText && <div className={`DeepPaperNote-status is-${data.status}`}
							role={data.status === 'error' ? 'alert' : 'status'} aria-live="polite">
						{data.statusText}
					</div>}
					<div className="DeepPaperNote-actions">
						<button onClick={this.cancel} disabled={busy && data.status !== 'saved'}>
							{data.status === 'saved' || data.status === 'error' ? 'Close' : 'Cancel'}
						</button>
						{data.status !== 'saved' && data.status !== 'error' &&
							<button className="is-primary" onClick={this.submit} disabled={!complete || busy}>
								Save PDF
							</button>}
					</div>
				</div>
			</div>
		);
	}
};
