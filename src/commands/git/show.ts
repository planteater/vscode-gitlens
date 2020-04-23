'use strict';
import { Container } from '../../container';
import { GitFile, GitLogCommit, GitStashCommit, Repository } from '../../git/git';
import {
	PartialStepState,
	pickCommitStep,
	pickRepositoryStep,
	QuickCommand,
	showCommitOrStashChangedFilesStep as showCommitOrStashFilesStep,
	showCommitOrStashChangedFileStep as showCommitOrStashFileStep,
	showCommitOrStashStep,
	StepGenerator,
	StepResult,
	StepState,
} from '../quickCommand';
import { CommandQuickPickItem, CommitFilesQuickPickItem, GitCommandQuickPickItem } from '../../quickpicks';

interface Context {
	repos: Repository[];
	title: string;
}

interface State<File = string | GitFile | GitLogCommit | GitStashCommit> {
	repo: string | Repository;
	reference: GitLogCommit | GitStashCommit;
	file: File;
}

export interface ShowGitCommandArgs {
	readonly command: 'show';
	state?: Partial<State>;
}

type ShowStepState<T extends State = State> = ExcludeSome<StepState<T>, 'repo', string>;

export class ShowGitCommand extends QuickCommand<State> {
	constructor(args?: ShowGitCommandArgs) {
		super('show', 'show', 'Show', {
			description: 'shows information about a git reference',
		});

		let counter = 0;
		if (args?.state?.repo != null) {
			counter++;
		}

		if (args?.state?.reference != null) {
			counter++;
		}

		if (args?.state?.file != null) {
			// Skip past the commit show
			counter += 2;
		}

		this.initialState = {
			counter: counter,
			confirm: false,
			...args?.state,
		};
	}

	get canConfirm() {
		return false;
	}

	protected getStepState(limitBackNavigation: boolean): PartialStepState<State> {
		// This command is special since we want to allow backing up all the way to the commit,
		// so ensure the startingStep is at most 1
		const state = super.getStepState(limitBackNavigation);
		return {
			...state,
			startingStep: limitBackNavigation ? Math.min(state.startingStep ?? 0, 1) : 0,
		};
	}

	protected async *steps(state: PartialStepState<State>): StepGenerator {
		const context: Context = {
			repos: [...(await Container.git.getOrderedRepositories())],
			title: this.title,
		};

		while (this.canStepsContinue(state)) {
			context.title = this.title;

			if (
				state.counter < 1 ||
				state.repo == null ||
				typeof state.repo === 'string' ||
				!context.repos.includes(state.repo)
			) {
				if (context.repos.length === 1) {
					if (state.repo == null) {
						state.counter++;
					}
					state.repo = context.repos[0];
				} else {
					const result = yield* pickRepositoryStep(state, context);
					// Always break on the first step (so we will go back)
					if (result === StepResult.Break) break;

					state.repo = result;
				}
			}

			if (state.counter < 2 || state.reference == null) {
				const result = yield* pickCommitStep(state as ShowStepState, context, {
					log: {
						repoPath: state.repo.path,
						authors: new Map(),
						commits: new Map(),
						sha: undefined,
						range: undefined,
						count: 0,
						limit: undefined,
						hasMore: false,
					},
					placeholder: 'Enter a reference or commit id ',
					picked: state.reference?.ref,
				});
				if (result === StepResult.Break) {
					// If we skipped the previous step, make sure we back up past it
					if (context.repos.length === 1) {
						state.counter--;
					}

					continue;
				}

				state.reference = result;
			}

			if (state.counter < 3) {
				const result = yield* showCommitOrStashStep(state as ShowStepState, context);
				if (result === StepResult.Break) continue;

				if (result instanceof GitCommandQuickPickItem) {
					yield* result.executeSteps(this.pickedVia);
					state.counter--;

					continue;
				}

				if (result instanceof CommandQuickPickItem && !(result instanceof CommitFilesQuickPickItem)) {
					void (await result.execute());

					QuickCommand.endSteps(state);

					break;
				}
			}

			if (state.file != null && !(state.file instanceof GitLogCommit)) {
				state.file = state.reference.toFileCommit(state.file);
			}

			if (state.counter < 4 || state.file == null) {
				const result = yield* showCommitOrStashFilesStep(state as ShowStepState, context, {
					picked: state.file?.fileName,
				});
				if (result === StepResult.Break) continue;

				if (result instanceof CommitFilesQuickPickItem) {
					// Since this is a sort of toggle button, back up 2 steps
					state.counter -= 2;

					continue;
				}

				state.file = result.commit;
			}

			const result = yield* showCommitOrStashFileStep(
				state as ShowStepState<State<GitLogCommit | GitStashCommit>>,
				context,
			);
			if (result === StepResult.Break) continue;

			if (result instanceof CommitFilesQuickPickItem) {
				// Since this is a sort of toggle button, back up 2 steps
				state.counter -= 2;

				continue;
			}

			if (result instanceof GitCommandQuickPickItem) {
				yield* result.executeSteps(this.pickedVia);
				state.counter--;

				continue;
			}

			if (result instanceof CommandQuickPickItem) {
				void (await result.execute());

				QuickCommand.endSteps(state);
				break;
			}
		}
	}
}
