'use strict';
import { GitActions } from '../commands';
import { GitStashCommit, GitStashReference } from '../git/git';
import { CommandQuickPickItem } from '../quickpicks';
import { command, Command, CommandContext, Commands, isCommandViewContextWithCommit } from './common';

export interface StashDeleteCommandArgs {
	repoPath?: string;
	stashItem?: GitStashReference;

	goBackCommand?: CommandQuickPickItem;
}

@command()
export class StashDeleteCommand extends Command {
	constructor() {
		super(Commands.StashDelete);
	}

	protected preExecute(context: CommandContext, args?: StashDeleteCommandArgs) {
		if (isCommandViewContextWithCommit<GitStashCommit>(context)) {
			args = { ...args };
			args.stashItem = context.node.commit;
		}

		return this.execute(args);
	}

	async execute(args?: StashDeleteCommandArgs) {
		return GitActions.Stash.drop(args?.repoPath ?? args?.stashItem?.repoPath, args?.stashItem);
	}
}
