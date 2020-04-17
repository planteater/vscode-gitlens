'use strict';
import { commands, Disposable, Terminal, TerminalLinkHandler, window } from 'vscode';
import {
	Commands,
	ShowQuickBranchHistoryCommandArgs,
	ShowQuickCommitDetailsCommandArgs,
	ShowQuickCurrentBranchHistoryCommandArgs,
} from '../commands';
import { Container } from '../container';

export const shaishRegex = /^[0-9a-f]{7,40}$/;

export class GitTerminalLinkHandler implements Disposable, TerminalLinkHandler {
	private disposable: Disposable;

	constructor() {
		this.disposable = window.registerTerminalLinkHandler(this);
	}

	dispose() {
		this.disposable.dispose();
	}

	async handleLink(terminal: Terminal, link: string): Promise<boolean> {
		const repoPath = Container.git.getHighlanderRepoPath();
		if (repoPath == null) return false;

		if (shaishRegex.test(link)) {
			const commit = await Container.git.getCommit(repoPath, link);
			if (commit == null) return false;

			const args: ShowQuickCommitDetailsCommandArgs = {
				commit: commit,
				sha: commit.sha,
			};
			commands.executeCommand(Commands.ShowQuickCommitDetails, args);

			return true;
		}

		if (link === 'HEAD') {
			const args: ShowQuickCurrentBranchHistoryCommandArgs = {
				repoPath: repoPath,
			};
			commands.executeCommand(Commands.ShowQuickCurrentBranchHistory, args);

			return true;
		}

		if (await Container.git.validateBranchOrTagName(link, repoPath)) {
			const branchesAndTags = await Container.git.getBranchesAndOrTags(repoPath, {
				include: 'all',
				filterBranches: b => b.name === link,
				filterTags: t => t.name === link,
			});
			if (branchesAndTags?.length) {
				const args: ShowQuickBranchHistoryCommandArgs = {
					branch: branchesAndTags[0].name,
					repoPath: repoPath,
				};
				commands.executeCommand(Commands.ShowQuickBranchHistory, args);

				return true;
			}
		}

		return false;
	}
}
