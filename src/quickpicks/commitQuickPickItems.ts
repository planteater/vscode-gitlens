'use strict';
import * as paths from 'path';
import { commands, QuickPickItem, TextEditor, Uri } from 'vscode';
import {
	Commands,
	DiffWithPreviousCommandArgs,
	findOrOpenEditor,
	GitActions,
	OpenWorkingFileCommandArgs,
} from '../commands';
import { CommitFormatter, GitFile, GitLogCommit } from '../git/git';
import { GitUri } from '../git/gitUri';
import { Strings } from '../system';
import { CommandQuickPickItem } from './quickPicksItems';
import { GlyphChars } from '../constants';
import { Container } from '../container';

export class CommitFilesQuickPickItem extends CommandQuickPickItem {
	constructor(readonly commit: GitLogCommit, picked: boolean = true) {
		super(
			{
				label: commit.getShortMessage(),
				// eslint-disable-next-line no-template-curly-in-string
				description: CommitFormatter.fromTemplate('${author}, ${ago}  $(git-commit)  ${id}', commit),
				detail: `$(files) ${commit.getFormattedDiffStatus({ expand: true, separator: ', ' })}`,
				picked: picked,
			},
			undefined,
			undefined,
			{ suppressKeyPress: true },
		);
	}

	get sha(): string {
		return this.commit.sha;
	}
}

export class CommitFileQuickPickItem extends CommandQuickPickItem {
	constructor(readonly commit: GitLogCommit, private readonly file: GitFile, picked?: boolean) {
		super({
			label: `${Strings.pad(GitFile.getStatusCodicon(file.status), 0, 2)}${paths.basename(file.fileName)}`,
			description: GitFile.getFormattedDirectory(file, true),
			picked: picked,
		});

		this.commit = commit.toFileCommit(file)!;
		// TODO@eamodio
		// this.detail = this.commit.getFormattedDiffStatus({ expand: true });
	}

	get sha(): string {
		return this.commit.sha;
	}

	execute(options?: { preserveFocus?: boolean; preview?: boolean }) {
		if (this.commit.previousSha === undefined) {
			return findOrOpenEditor(GitUri.toRevisionUri(this.commit.sha, this.file, this.commit.repoPath), options);
		}

		const commandArgs: DiffWithPreviousCommandArgs = {
			commit: this.commit,
			showOptions: options,
		};
		return commands.executeCommand(Commands.DiffWithPrevious, this.commit.toGitUri(), commandArgs);
	}
}

export class CommitOpenAllChangesCommandQuickPickItem extends CommandQuickPickItem {
	constructor(private readonly commit: GitLogCommit, item?: QuickPickItem) {
		super(item ?? '$(git-compare) Open All Changes');
	}

	execute(options: { preserveFocus?: boolean; preview?: boolean }): Promise<unknown> {
		return GitActions.Commit.openAllChanges(this.commit, options);
	}
}

export class CommitOpenAllChangesWithWorkingCommandQuickPickItem extends CommandQuickPickItem {
	constructor(private readonly commit: GitLogCommit, item?: QuickPickItem) {
		super(item ?? '$(git-compare) Open All Changes with Working Tree');
	}

	execute(options: { preserveFocus?: boolean; preview?: boolean }): Promise<unknown> {
		return GitActions.Commit.openAllChangesWithWorking(this.commit, options);
	}
}

export class CommitOpenFilesCommandQuickPickItem extends CommandQuickPickItem {
	constructor(private readonly commit: GitLogCommit, item?: QuickPickItem) {
		super(item ?? '$(files) Open Files');
	}

	async execute(options: { preserveFocus?: boolean; preview?: boolean }): Promise<unknown> {
		return GitActions.Commit.openFiles(this.commit, options);
	}
}

export class CommitOpenFileCommandQuickPickItem extends CommandQuickPickItem {
	constructor(private readonly commit: GitLogCommit, item?: QuickPickItem) {
		super(
			item || {
				label: '$(file) Open File',
				description: `${commit.getFormattedPath()}`,
			},
		);
	}

	execute(options?: { preserveFocus?: boolean; preview?: boolean }): Thenable<TextEditor | undefined> {
		const uri = this.commit.toGitUri();
		const args: OpenWorkingFileCommandArgs = {
			uri: uri,
			showOptions: options,
		};
		return commands.executeCommand(Commands.OpenWorkingFile, undefined, args);
	}
}

export class CommitOpenRevisionsCommandQuickPickItem extends CommandQuickPickItem {
	constructor(private readonly commit: GitLogCommit, item?: QuickPickItem) {
		super(item ?? '$(files) Open Revisions');
	}

	async execute(options: { preserveFocus?: boolean; preview?: boolean }): Promise<unknown | undefined> {
		return GitActions.Commit.openRevisions(this.commit, options);
	}
}

export class CommitOpenRevisionCommandQuickPickItem extends CommandQuickPickItem {
	private readonly uri: Uri;

	constructor(commit: GitLogCommit, item?: QuickPickItem) {
		let description: string;
		let uri: Uri;
		if (commit.status === 'D') {
			uri = GitUri.toRevisionUri(commit.previousFileSha, commit.previousUri.fsPath, commit.repoPath);
			description = `${commit.getFormattedPath()} from ${GlyphChars.Space}$(git-commit) ${
				commit.previousShortSha
			} (deleted in ${GlyphChars.Space}$(git-commit) ${commit.shortSha})`;
		} else {
			uri = GitUri.toRevisionUri(commit.sha, commit.uri.fsPath, commit.repoPath);
			description = `${commit.getFormattedPath()} from ${GlyphChars.Space}$(git-commit) ${commit.shortSha}`;
		}

		super(
			item || {
				label: '$(file) Open Revision',
				description: description,
			},
		);

		this.uri = uri;
	}

	execute(options?: { preserveFocus?: boolean; preview?: boolean }): Thenable<TextEditor | undefined> {
		return findOrOpenEditor(this.uri, options);
	}
}

export class CommitApplyFileChangesCommandQuickPickItem extends CommandQuickPickItem {
	constructor(private readonly commit: GitLogCommit, item?: QuickPickItem) {
		super(
			item || {
				label: 'Apply Changes',
				description: `${commit.getFormattedPath()} from ${GlyphChars.Space}$(git-commit) ${commit.shortSha}`,
			},
			undefined,
			undefined,
		);
	}

	async execute(): Promise<{} | undefined> {
		const uri = this.commit.toGitUri();

		// Open the working file to ensure undo will work
		const args: OpenWorkingFileCommandArgs = {
			uri: uri,
			showOptions: { preserveFocus: true, preview: false },
		};
		void (await commands.executeCommand(Commands.OpenWorkingFile, undefined, args));

		void (await Container.git.applyChangesToWorkingFile(uri));

		return undefined;
	}
}

export class CommitRestoreFileChangesCommandQuickPickItem extends CommandQuickPickItem {
	constructor(private readonly commit: GitLogCommit, private readonly file: string | GitFile, item?: QuickPickItem) {
		super(
			item || {
				label: 'Restore',
				description: 'aka checkout',
			},
			undefined,
			undefined,
		);
	}

	async execute(): Promise<{} | undefined> {
		return GitActions.Commit.restoreFile(this.commit, this.file);
	}
}
