'use strict';
import { CancellationTokenSource, commands, QuickPickItem, window } from 'vscode';
import { Commands } from '../commands';
import { Container } from '../container';
import { GitReference, GitRevisionReference, GitStashCommit, SearchPattern } from '../git/git';
import { GitUri } from '../git/gitUri';
import { KeyMapping, Keys } from '../keyboard';
import { ReferencesQuickPick, ReferencesQuickPickItem } from './referencesQuickPick';
import { GlyphChars } from '../constants';
import { getQuickPickIgnoreFocusOut } from '../quickpicks';

declare module 'vscode' {
	interface QuickPickItem {
		onDidSelect?(): void;
		onDidPressKey?(key: Keys): Promise<void>;
	}
}

export interface QuickPickItemOfT<T = any> extends QuickPickItem {
	readonly item: T;
}

export enum Directive {
	Back,
	Cancel,
	Noop,
}

export namespace Directive {
	export function is<T>(value: Directive | T): value is Directive {
		return typeof value === 'number' && Directive[value] != null;
	}
}

export interface DirectiveQuickPickItem extends QuickPickItem {
	directive: Directive;
}

export namespace DirectiveQuickPickItem {
	export function create(
		directive: Directive,
		picked?: boolean,
		options: { label?: string; description?: string; detail?: string } = {},
	) {
		let label = options.label;
		if (label == null) {
			switch (directive) {
				case Directive.Back:
					label = 'Back';
					break;
				case Directive.Cancel:
					label = 'Cancel';
					break;
				case Directive.Noop:
					label = 'Try Again';
					break;
			}
		}

		const item: DirectiveQuickPickItem = {
			label: label,
			description: options.description,
			detail: options.detail,
			alwaysShow: true,
			picked: picked,
			directive: directive,
		};

		return item;
	}

	export function is(item: QuickPickItem): item is DirectiveQuickPickItem {
		return item != null && 'directive' in item;
	}
}

export class CommandQuickPickItem<Arguments extends any[] = any[]> implements QuickPickItem {
	static fromCommand<T>(label: string, command: Commands, args: T): CommandQuickPickItem;
	static fromCommand<T>(item: QuickPickItem, command: Commands, args: T): CommandQuickPickItem;
	static fromCommand<T>(labelOrItem: string | QuickPickItem, command: Commands, args: T): CommandQuickPickItem {
		return new CommandQuickPickItem(
			typeof labelOrItem === 'string' ? { label: labelOrItem } : labelOrItem,
			command,
			[args],
		);
	}

	label!: string;
	description?: string;
	detail?: string | undefined;

	constructor(
		label: string,
		command?: Commands,
		args?: Arguments,
		options?: {
			onDidPressKey?: (key: Keys, result: Thenable<unknown>) => void;
			suppressKeyPress?: boolean;
		},
	);
	constructor(
		item: QuickPickItem,
		command?: Commands,
		args?: Arguments,
		options?: {
			onDidPressKey?: (key: Keys, result: Thenable<unknown>) => void;
			suppressKeyPress?: boolean;
		},
	);
	constructor(
		labelOrItem: string | QuickPickItem,
		command?: Commands,
		args?: Arguments,
		options?: {
			onDidPressKey?: (key: Keys, result: Thenable<unknown>) => void;
			suppressKeyPress?: boolean;
		},
	);
	constructor(
		labelOrItem: string | QuickPickItem,
		protected readonly command?: Commands,
		protected readonly args?: Arguments,
		protected readonly options?: {
			// onDidExecute?: (
			// 	options: { preserveFocus?: boolean; preview?: boolean } | undefined,
			// 	result: Thenable<unknown>,
			// ) => void;
			onDidPressKey?: (key: Keys, result: Thenable<unknown>) => void;
			suppressKeyPress?: boolean;
		},
	) {
		this.command = command;
		this.args = args;

		if (typeof labelOrItem === 'string') {
			this.label = labelOrItem;
		} else {
			Object.assign(this, labelOrItem);
		}
	}

	execute(options?: { preserveFocus?: boolean; preview?: boolean }): Thenable<unknown | undefined> {
		if (this.command === undefined) return Promise.resolve(undefined);

		const result = commands.executeCommand(this.command, ...(this.args || []));
		// this.options?.onDidExecute?.(options, result);
		return result;
	}

	async onDidPressKey(key: Keys): Promise<void> {
		if (this.options?.suppressKeyPress) return;

		const result = this.execute({ preserveFocus: true, preview: false });
		this.options?.onDidPressKey?.(key, result);
		void (await result);
	}
}

export interface FlagsQuickPickItem<T> extends QuickPickItemOfT<T[]> {}
export namespace FlagsQuickPickItem {
	export function create<T>(flags: T[], item: T[], options: QuickPickItem) {
		return { ...options, item: item, picked: hasFlags(flags, item) };
	}
}

function hasFlags<T>(flags: T[], has?: T | T[]): boolean {
	if (has === undefined) return flags.length === 0;
	if (!Array.isArray(has)) return flags.includes(has);

	return has.length === 0 ? flags.length === 0 : has.every(f => flags.includes(f));
}

export class KeyCommandQuickPickItem extends CommandQuickPickItem {
	constructor(command: Commands, args?: any[]) {
		super({ label: '', description: '' }, command, args);
	}
}

export class MessageQuickPickItem extends CommandQuickPickItem {
	constructor(message: string) {
		super({ label: message, description: '' });
	}
}

export class OpenInSearchCommitsViewQuickPickItem extends CommandQuickPickItem {
	constructor(
		private readonly reference: GitRevisionReference,
		item: QuickPickItem = {
			label: '$(search) Show Commit',
			description: 'in Search Commits view',
		},
	) {
		super(item, undefined, undefined);
	}

	async execute(options?: { preserveFocus?: boolean; preview?: boolean }): Promise<{} | undefined> {
		void (await Container.searchView.search(
			this.reference.repoPath,
			{
				pattern: SearchPattern.fromCommit(this.reference),
			},
			{
				label: {
					label: `for ${GitReference.toString(this.reference, { icon: false })}`,
				},
			},
		));

		return undefined;
	}
}

export class OpenInFileHistoryViewQuickPickItem extends CommandQuickPickItem {
	constructor(
		public readonly uri: GitUri,
		public readonly baseRef: string | undefined,
		item: QuickPickItem = {
			label: '$(eye) Show in File History View',
			description: 'shows the file history in the File History view',
		},
	) {
		super(item, undefined, undefined);
	}

	async execute(options?: { preserveFocus?: boolean; preview?: boolean }): Promise<{} | undefined> {
		return void (await Container.fileHistoryView.showHistoryForUri(this.uri, this.baseRef));
	}
}

export class RevealInRepositoriesViewQuickPickItem extends CommandQuickPickItem {
	constructor(
		private readonly reference: GitRevisionReference,
		item: QuickPickItem = {
			label: `$(eye) Reveal ${GitReference.isStash(reference) ? 'Stash' : 'Commit'}`,
			description: `in Repositories view ${
				GitReference.isStash(reference) ? '' : `${GlyphChars.Dash} this can take a while`
			}`,
		},
	) {
		super(item, undefined, undefined);
	}

	async execute(options?: { preserveFocus?: boolean; preview?: boolean }): Promise<{} | undefined> {
		if (GitStashCommit.is(this.reference)) {
			void (await Container.repositoriesView.revealStash(this.reference, {
				select: true,
				focus: !(options?.preserveFocus ?? false),
				expand: true,
			}));
		} else {
			void (await Container.repositoriesView.revealCommit(this.reference, {
				select: true,
				focus: !(options?.preserveFocus ?? false),
				expand: true,
			}));
		}

		return undefined;
	}
}

export class ShowFileHistoryFromQuickPickItem extends CommandQuickPickItem {
	constructor(
		private readonly repoPath: string,
		private readonly placeHolder: string,
		private readonly _goBack?: CommandQuickPickItem,
		item: QuickPickItem = {
			label: '$(history) Show File History from...',
			description: 'shows an alternate file history',
		},
	) {
		super(item, undefined, undefined);
	}

	execute(): Promise<CommandQuickPickItem | ReferencesQuickPickItem | undefined> {
		return new ReferencesQuickPick(this.repoPath).show(this.placeHolder, {
			allowEnteringRefs: true,
			checkmarks: false,
			goBack: this._goBack,
		});
	}
}

export function showQuickPickProgress(message: string, mapping?: KeyMapping): CancellationTokenSource {
	const cancellation = new CancellationTokenSource();
	void _showQuickPickProgress(message, cancellation, mapping);
	return cancellation;
}

async function _showQuickPickProgress(message: string, cancellation: CancellationTokenSource, mapping?: KeyMapping) {
	const scope = mapping && (await Container.keyboard.beginScope(mapping));

	try {
		await window.showQuickPick(
			_getInfiniteCancellablePromise(cancellation),
			{
				placeHolder: message,
				ignoreFocusOut: getQuickPickIgnoreFocusOut(),
			},
			cancellation.token,
		);
	} catch (ex) {
		// Not sure why this throws
	} finally {
		cancellation.cancel();
		scope && scope.dispose();
	}
}

function _getInfiniteCancellablePromise(cancellation: CancellationTokenSource) {
	return new Promise<QuickPickItem[]>((resolve, reject) => {
		const disposable = cancellation.token.onCancellationRequested(() => {
			disposable.dispose();
			resolve([]);
		});
	});
}
