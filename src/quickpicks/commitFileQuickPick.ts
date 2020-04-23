// 'use strict';
// import { QuickPickItem, Uri, window } from 'vscode';
// import {
// 	Commands,
// 	CopyMessageToClipboardCommandArgs,
// 	CopyRemoteFileUrlToClipboardCommandArgs,
// 	CopyShaToClipboardCommandArgs,
// 	DiffWithPreviousCommandArgs,
// 	ShowQuickCommitCommandArgs,
// 	ShowQuickCommitFileCommandArgs,
// 	ShowQuickFileHistoryCommandArgs,
// } from '../commands';
// import { GlyphChars } from '../constants';
// import { Container } from '../container';
// import { GitLog, GitLogCommit, GitRevision, RemoteResourceType } from '../git/git';
// import { GitUri } from '../git/gitUri';
// import { KeyCommand, KeyNoopCommand } from '../keyboard';
// import {
// 	CommandQuickPickItem,
// 	CopyOrOpenRemotesCommandQuickPickItem,
// 	getQuickPickIgnoreFocusOut,
// 	KeyCommandQuickPickItem,
// } from '../quickpicks';
// import { Strings } from '../system';

// export interface CommitFileQuickPickOptions {
// 	currentCommand?: CommandQuickPickItem;
// 	goBackCommand?: CommandQuickPickItem;
// 	fileLog?: GitLog;
// }

// export class CommitFileQuickPick {
// 	static async show(
// 		commit: GitLogCommit,
// 		uri: Uri,
// 		options: CommitFileQuickPickOptions = {},

// 		// goBackCommand?: CommandQuickPickItem,
// 		// currentCommand?: CommandQuickPickItem,
// 		// fileLog?: GitLog,
// 	): Promise<CommandQuickPickItem | undefined> {
// 		if (commit.isUncommitted) {
// 			// Since we can't trust the previous sha on an uncommitted commit, find the last commit for this file
// 			const c = await Container.git.getCommitForFile(undefined, commit.uri.fsPath);
// 			if (c === undefined) return undefined;

// 			commit = c;
// 		}

// 		let previousCommand: KeyCommand | (() => Promise<KeyCommand>) | undefined = undefined;
// 		let nextCommand: KeyCommand | (() => Promise<KeyCommand>) | undefined = undefined;
// 		if (!commit.isStash) {
// 			previousCommand = async () => {
// 				const previousUri = await Container.git.getPreviousUri(commit.repoPath, uri, commit.sha);
// 				if (previousUri === undefined || previousUri.sha === undefined) return KeyNoopCommand;

// 				const previousCommandArgs: ShowQuickCommitFileCommandArgs = {
// 					// If we have the full file history, reuse it
// 					fileLog:
// 						options.fileLog !== undefined && !options.fileLog.hasMore && options.fileLog.sha === undefined
// 							? options.fileLog
// 							: undefined,
// 					sha: previousUri.sha,
// 					goBackCommand: options.goBackCommand,
// 				};
// 				return new KeyCommandQuickPickItem(Commands.ShowQuickCommitFile, [previousUri, previousCommandArgs]);
// 			};

// 			nextCommand = async () => {
// 				const nextUri = await Container.git.getNextUri(commit.repoPath, uri, commit.sha);
// 				if (nextUri === undefined || nextUri.sha === undefined) return KeyNoopCommand;

// 				const nextCommandArgs: ShowQuickCommitFileCommandArgs = {
// 					// If we have the full file history, reuse it
// 					fileLog:
// 						options.fileLog !== undefined && !options.fileLog.hasMore && options.fileLog.sha === undefined
// 							? options.fileLog
// 							: undefined,
// 					sha: nextUri.sha,
// 					goBackCommand: options.goBackCommand,
// 				};
// 				return new KeyCommandQuickPickItem(Commands.ShowQuickCommitFile, [nextUri, nextCommandArgs]);
// 			};
// 		}

// 		const scope = await Container.keyboard.beginScope({
// 			'alt+left': options.goBackCommand,
// 			'alt+,': previousCommand,
// 			'alt+.': nextCommand,
// 		});

// 		const pick = await window.showQuickPick(CommitFileQuickPick.getItems(commit, uri, options), {
// 			matchOnDescription: true,
// 			placeHolder: `${commit.getFormattedPath()} ${Strings.pad(GlyphChars.Dot, 1, 1)} ${
// 				commit.isUncommitted ? `Uncommitted ${GlyphChars.ArrowRightHollow} ` : ''
// 			}${commit.shortSha} ${Strings.pad(GlyphChars.Dot, 1, 1)} ${commit.author}, ${
// 				commit.formattedDate
// 			} ${Strings.pad(GlyphChars.Dot, 1, 1)} ${commit.getShortMessage()}`,
// 			ignoreFocusOut: getQuickPickIgnoreFocusOut(),
// 			onDidSelectItem: (item: QuickPickItem) => {
// 				void scope.setKeyCommand('alt+right', item as KeyCommand);
// 			},
// 		});

// 		await scope.dispose();

// 		return pick;
// 	}

// 	static async getItems(commit: GitLogCommit, uri: Uri, options: CommitFileQuickPickOptions = {}) {
// 		const items: CommandQuickPickItem[] = [];

// 		const stash = commit.isStash;
// 		if (stash) {
// 			items.push(new CommitApplyFileChangesCommandQuickPickItem(commit));
// 		}

// 		if (commit.previousFileSha) {
// 			const previousSha = await Container.git.resolveReference(
// 				commit.repoPath,
// 				commit.previousFileSha,
// 				commit.previousUri,
// 			);

// 			const commandArgs: DiffWithPreviousCommandArgs = {
// 				commit: commit,
// 			};

// 			items.push(
// 				new CommandQuickPickItem(
// 					{
// 						label: '$(git-compare) Open Changes',
// 						description: `$(git-commit) ${GitRevision.shorten(previousSha)} ${
// 							GlyphChars.Space
// 						} $(git-compare) ${GlyphChars.Space} $(git-commit) ${commit.shortSha}`,
// 					},
// 					Commands.DiffWithPrevious,
// 					[commit.uri, commandArgs],
// 				),
// 			);
// 		}

// 		const workingUri = await commit.getWorkingUri();
// 		if (workingUri) {
// 			items.push(
// 				new CommandQuickPickItem(
// 					{
// 						label: '$(git-compare) Open Changes with Working File',
// 						description: `$(git-commit) ${commit.shortSha} ${GlyphChars.Space} $(git-compare) ${
// 							GlyphChars.Space
// 						} ${GitUri.getFormattedPath(workingUri, { relativeTo: commit.repoPath })}`,
// 					},
// 					Commands.DiffWithWorking,
// 					[GitUri.fromCommit(commit)],
// 				),
// 			);
// 		}

// 		if (workingUri && commit.status !== 'D') {
// 			items.push(new CommitOpenFileCommandQuickPickItem(commit));
// 		}
// 		items.push(new CommitOpenRevisionCommandQuickPickItem(commit));

// 		const remotes = await Container.git.getRemotes(commit.repoPath, { sort: true });
// 		if (remotes.length) {
// 			if (workingUri && commit.status !== 'D') {
// 				const branch = await Container.git.getBranch(commit.repoPath);
// 				if (branch !== undefined) {
// 					items.push(
// 						new CopyOrOpenRemotesCommandQuickPickItem(
// 							remotes,
// 							{
// 								type: RemoteResourceType.File,
// 								fileName: GitUri.relativeTo(workingUri, commit.repoPath),
// 								branch: branch.name,
// 							},
// 							false,
// 							options.currentCommand,
// 						),
// 					);
// 				}
// 			}

// 			if (!stash) {
// 				items.push(
// 					new CopyOrOpenRemotesCommandQuickPickItem(
// 						remotes,
// 						{
// 							type: RemoteResourceType.Revision,
// 							fileName: commit.fileName,
// 							commit: commit,
// 						},
// 						false,
// 						options.currentCommand,
// 					),
// 				);
// 			}
// 		}

// 		if (!stash) {
// 			items.push(new CommitApplyFileChangesCommandQuickPickItem(commit));

// 			const copyShaCommandArgs: CopyShaToClipboardCommandArgs = {
// 				sha: commit.sha,
// 			};
// 			items.push(
// 				new CommandQuickPickItem(
// 					{
// 						label: '$(clippy) Copy Commit ID to Clipboard',
// 						description: '',
// 					},
// 					Commands.CopyShaToClipboard,
// 					[uri, copyShaCommandArgs],
// 				),
// 			);

// 			const copyMessageCommandArgs: CopyMessageToClipboardCommandArgs = {
// 				message: commit.message,
// 				sha: commit.sha,
// 			};
// 			items.push(
// 				new CommandQuickPickItem(
// 					{
// 						label: `$(clippy) Copy ${commit.isStash ? 'Stash' : 'Commit'} Message to Clipboard`,
// 						description: '',
// 					},
// 					Commands.CopyMessageToClipboard,
// 					[uri, copyMessageCommandArgs],
// 				),
// 			);

// 			if (remotes.length) {
// 				const copyRemoteUrlCommandArgs: CopyRemoteFileUrlToClipboardCommandArgs = {
// 					sha: commit.sha,
// 				};
// 				items.push(
// 					new CommandQuickPickItem(
// 						{
// 							label: '$(clippy) Copy Remote Url to Clipboard',
// 						},
// 						Commands.CopyRemoteFileUrlToClipboard,
// 						[uri, copyRemoteUrlCommandArgs],
// 					),
// 				);
// 			}
// 		}

// 		if (workingUri) {
// 			const commandArgs: ShowQuickFileHistoryCommandArgs = {
// 				log: options.fileLog,
// 				goBackCommand: options.currentCommand,
// 			};
// 			items.push(
// 				new CommandQuickPickItem(
// 					{
// 						label: '$(history) Show File History',
// 						description: `of ${commit.getFormattedPath()}`,
// 					},
// 					Commands.ShowQuickFileHistory,
// 					[workingUri, commandArgs],
// 				),
// 			);
// 		}

// 		if (!stash) {
// 			const fileHistoryCommandArgs: ShowQuickFileHistoryCommandArgs = {
// 				goBackCommand: options.currentCommand,
// 			};
// 			items.push(
// 				new CommandQuickPickItem(
// 					{
// 						label: `$(history) Show ${
// 							GitUri.relativeTo(workingUri || commit.uri, commit.repoPath) ? 'Previous ' : ''
// 						}File History`,
// 						description: `of ${commit.getFormattedPath()} from ${GlyphChars.Space}$(git-commit) ${
// 							commit.shortSha
// 						}`,
// 					},
// 					Commands.ShowQuickFileHistory,
// 					[commit.toGitUri(), fileHistoryCommandArgs],
// 				),
// 			);

// 			const commitDetailsCommandArgs: ShowQuickCommitCommandArgs = {
// 				commit: commit,
// 				sha: commit.sha,
// 				goBackCommand: options.currentCommand,
// 			};
// 			items.push(
// 				new CommandQuickPickItem(
// 					{
// 						label: '$(git-commit) Show Commit Details',
// 						description: `$(git-commit) ${commit.shortSha}`,
// 					},
// 					Commands.ShowQuickCommit,
// 					[commit.toGitUri(), commitDetailsCommandArgs],
// 				),
// 			);
// 		}

// 		if (options.goBackCommand) {
// 			items.splice(0, 0, options.goBackCommand);
// 		}

// 		return items;
// 	}
// }
