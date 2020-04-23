'use strict';
import { window } from 'vscode';
import { Commands, OpenInRemoteCommandArgs } from '../commands';
import { GlyphChars } from '../constants';
import {
	getNameFromRemoteResource,
	GitRemote,
	GitRevision,
	RemoteProvider,
	RemoteResource,
	RemoteResourceType,
} from '../git/git';
import { GitUri } from '../git/gitUri';
import { CommandQuickPickItem, getQuickPickIgnoreFocusOut } from '../quickpicks';

export class CopyOrOpenRemoteCommandQuickPickItem extends CommandQuickPickItem {
	constructor(
		private readonly remote: GitRemote<RemoteProvider>,
		private readonly resource: RemoteResource,
		private readonly clipboard?: boolean,
	) {
		super(
			{
				label: clipboard
					? `$(clippy) Copy ${remote.provider.name} ${getNameFromRemoteResource(resource)} Url`
					: `$(link-external) Open ${getNameFromRemoteResource(resource)} on ${remote.provider.name}`,
				description: `$(repo) ${remote.provider.path}`,
			},
			undefined,
			undefined,
		);
	}

	execute(): Thenable<{} | undefined> {
		return this.clipboard ? this.remote.provider.copy(this.resource) : this.remote.provider.open(this.resource);
	}
}

export class CopyOrOpenRemotesCommandQuickPickItem extends CommandQuickPickItem {
	constructor(
		remotes: GitRemote<RemoteProvider>[],
		resource: RemoteResource,
		clipboard?: boolean,
		goBackCommand?: CommandQuickPickItem,
	) {
		const name = getNameFromRemoteResource(resource);

		let description;
		switch (resource.type) {
			case RemoteResourceType.Branch:
				description = `$(git-branch) ${resource.branch}`;
				break;

			case RemoteResourceType.Branches:
				description = '$(git-branch) Branches';
				break;

			case RemoteResourceType.Commit:
				description = `$(git-commit) ${GitRevision.shorten(resource.sha)}`;
				break;

			case RemoteResourceType.File:
				description = GitUri.getFormattedPath(resource.fileName);
				break;

			case RemoteResourceType.Repo:
				description = '$(repo) Repository';
				break;

			case RemoteResourceType.Revision:
				if (resource.commit !== undefined && resource.commit.isFile) {
					if (resource.commit.status === 'D') {
						resource.sha = resource.commit.previousSha;
						description = `${GitUri.getFormattedPath(resource.fileName)} from ${
							GlyphChars.Space
						}$(git-commit) ${resource.commit.previousShortSha} (deleted in ${
							GlyphChars.Space
						}$(git-commit) ${resource.commit.shortSha})`;
					} else {
						resource.sha = resource.commit.sha;
						description = `${GitUri.getFormattedPath(resource.fileName)} from ${
							GlyphChars.Space
						}$(git-commit) ${resource.commit.shortSha}`;
					}
				} else {
					const shortFileSha = resource.sha === undefined ? '' : GitRevision.shorten(resource.sha);
					description = `${GitUri.getFormattedPath(resource.fileName)}${
						shortFileSha ? ` from ${GlyphChars.Space}$(git-commit) ${shortFileSha}` : ''
					}`;
				}
				break;

			default:
				description = '';
				break;
		}

		const providers = GitRemote.getHighlanderProviders(remotes);
		const commandArgs: OpenInRemoteCommandArgs = {
			remotes: remotes,
			resource: resource,
			clipboard: clipboard,
			goBackCommand: goBackCommand,
		};
		super(
			{
				label: clipboard
					? `$(clippy) Copy ${
							providers?.length === 1
								? providers[0].name
								: `${providers?.length ? providers[0].name : 'Remote'}`
					  } ${getNameFromRemoteResource(resource)} Url${providers?.length === 1 ? '' : GlyphChars.Ellipsis}`
					: `$(link-external) Open ${name} on ${
							providers?.length === 1
								? providers[0].name
								: `${providers?.length ? providers[0].name : 'Remote'}${GlyphChars.Ellipsis}`
					  }`,
				// description: `${description} in ${GlyphChars.Space}$(repo) ${remote.provider.path}`,
				description: description, // providers?.length === 1 ? providers[0].path : undefined,
			},
			Commands.OpenInRemote,
			[undefined, commandArgs],
			{
				onDidPressKey: async (key, result) => {
					await result;
					window.showInformationMessage('Url copied to the clipboard');
				},
			},
		);
	}
}

export class RemotesQuickPick {
	static async show(
		remotes: GitRemote<RemoteProvider>[],
		placeHolder: string,
		resource: RemoteResource,
		clipboard?: boolean,
		goBackCommand?: CommandQuickPickItem,
	): Promise<CopyOrOpenRemoteCommandQuickPickItem | CommandQuickPickItem | undefined> {
		const items = remotes.map(r => new CopyOrOpenRemoteCommandQuickPickItem(r, resource, clipboard)) as (
			| CopyOrOpenRemoteCommandQuickPickItem
			| CommandQuickPickItem
		)[];

		if (goBackCommand) {
			items.splice(0, 0, goBackCommand);
		}

		// const scope = await Container.keyboard.beginScope({ left: goBackCommand });

		const pick = await window.showQuickPick(items, {
			placeHolder: placeHolder,
			ignoreFocusOut: getQuickPickIgnoreFocusOut(),
		});
		if (pick === undefined) return undefined;

		// await scope.dispose();

		return pick;
	}
}
