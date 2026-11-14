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

const YEAR_PATTERN = '(?:19|20)\\d{2}';
const FIELD_ERRORS = {
	title: 'Error: Enter the paper title.',
	authorShortName: "Error: Enter the first author's last name.",
	year: 'Error: Enter a four-digit year from 1900 to 2099.',
};
// :user-invalid needs Chrome 119; before that, fall back to :invalid when a field is left
const USER_INVALID = CSS.supports('selector(:user-invalid)') ? ':user-invalid' : ':invalid';

Zotero.UI.ProgressWindow = class ProgressWindow extends React.PureComponent {
	constructor(props) {
		super(props);
		// formKey remounts the form for each paper, so the browser's
		// user-interaction state for :user-invalid does not carry over
		this.state = {data: null, formKey: 0, invalid: {}, announcement: ''};
		this.onInput = this.onInput.bind(this);
		this.onFieldBlur = this.onFieldBlur.bind(this);
		this.onSubmit = this.onSubmit.bind(this);
		this.notifyChanged = this.notifyChanged.bind(this);
		this.submit = this.submit.bind(this);
		this.cancel = this.cancel.bind(this);
	}

	componentDidMount() {
		this.listen('progressWindowIframe.reset', () => this.setState({data: null}));
		this.listen('progressWindowIframe.showDeepPaperNote', data => this.setState(state => ({
			data, formKey: state.formKey + 1, invalid: {}, announcement: '',
		})));
		this.listen('progressWindowIframe.updateDeepPaperNote', ({values, ...update}) => {
			this.setState(state => ({data: {
				...state.data,
				...update,
				// Preview results echo the values they were requested with; keep newer edits
				...(values && {values: {...state.data.values, target_directory: values.target_directory}}),
			}}));
		});
		document.addEventListener('keydown', event => {
			if (event.key === 'Escape' && this.state.data?.status !== 'saving') this.cancel();
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
		if (this.state.invalid[name]) this.syncValidity(event.target);
		this.setState(state => ({
			data: {...state.data, previewLoading: true,
				values: {...state.data.values, target_directory: name === 'target_directory' ? value : '', [name]: value}},
		}), () => {
			this.notifyChanged();
		});
	}

	onFieldBlur(event) {
		this.syncValidity(event.target, true);
		this.notifyChanged();
	}

	// Mirror the visual :user-invalid state into aria-invalid and aria-describedby
	syncValidity(input, announce=false) {
		let {name} = input;
		let invalid = input.matches(USER_INVALID);
		if (invalid === !!this.state.invalid[name]) return;
		this.setState(state => ({invalid: {...state.invalid, [name]: invalid}}));
		clearTimeout(this.announceTimer);
		if (invalid && announce) {
			let label = input.labels?.[0]?.textContent || name;
			// Wait until the screen reader has announced the next focused field
			this.announceTimer = setTimeout(() => this.setState({announcement: `${label}: ${FIELD_ERRORS[name]}`}), 500);
		}
		else if (!invalid) {
			this.setState({announcement: ''});
		}
	}

	onSubmit(event) {
		event.preventDefault();
		if (this.isComplete() && !this.isBusy()) this.submit();
	}

	isBusy() {
		return this.state.data.status === 'saving' || this.state.data.status === 'saved';
	}

	isComplete() {
		let {data} = this.state;
		let {values} = data;
		return values.title.trim()
			&& (values.authorShortName.trim() || data.authors.length)
			&& new RegExp(`^${YEAR_PATTERN}$`).test(values.year)
			&& (values.target_directory || values.domain) && data.previewPath
			&& !data.previewLoading && !data.previewError;
	}

	renderTextField(name, label, props={}) {
		let id = `deeppapernote-${name}`;
		let errorID = `${id}-error`;
		let invalid = !!this.state.invalid[name];
		return <div className="DeepPaperNote-field">
			<label htmlFor={id}>{label}</label>
			<input id={id} name={name} value={this.state.data.values[name]} data-error={errorID}
				aria-invalid={invalid ? 'true' : 'false'} aria-describedby={invalid ? errorID : undefined}
				onChange={this.onInput} onBlur={this.onFieldBlur} {...props}/>
			<div id={errorID} className="DeepPaperNote-fieldError">{FIELD_ERRORS[name]}</div>
		</div>;
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
		let busy = this.isBusy();
		let complete = this.isComplete();

		return (
			<div ref={node => { this.rootNode = node; }} className="ProgressWindow-box">
				<form key={this.state.formKey} className="DeepPaperNote-panel" onSubmit={this.onSubmit}>
					<div className="DeepPaperNote-headline">Save to DeepPaperNote</div>
					{(!data.messageOnly || values.title) && <div className="DeepPaperNote-row DeepPaperNote-pdfRow">
						<img src={Zotero.getExtensionURL('images/pdf.png')} alt=""/>
						<span title={values.title}>{values.title || 'Untitled PDF'}</span>
					</div>}
					{!data.messageOnly && <React.Fragment>
						{data.editableMetadata ? <React.Fragment>
							{this.renderTextField('title', 'Title', {required: true})}
							{this.renderTextField('authorShortName', 'Author', {required: !data.authors.length})}
							{this.renderTextField('year', 'Year', {required: true, pattern: YEAR_PATTERN,
								inputMode: 'numeric', maxLength: 4})}
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
					</React.Fragment>}
					{data.statusText && <div className={`DeepPaperNote-status is-${data.status}`}
							role={data.status === 'error' ? 'alert' : 'status'} aria-live="polite">
						{data.statusText}
					</div>}
					<div className="DeepPaperNote-actions">
						<button type="button" onClick={this.cancel} disabled={busy && data.status !== 'saved'}>
							{data.status === 'saved' || data.status === 'error' ? 'Close' : 'Cancel'}
						</button>
						{data.status !== 'saved' && data.status !== 'error' &&
							<button type="submit" className="is-primary" disabled={!complete || busy}>
								Save PDF
							</button>}
					</div>
					<div className="visually-hidden" aria-live="polite">{this.state.announcement}</div>
				</form>
			</div>
		);
	}
};
