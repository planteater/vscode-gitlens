'use strict';
import { Container } from '../../container';
import { GitLogCommit, GitReference, Repository } from '../../git/git';
import { GitCommandsCommand } from '../gitCommands';
import {
	PartialStepState,
	pickBranchOrTagStep,
	pickCommitStep,
	pickRepositoryStep,
	QuickCommand,
	StepGenerator,
	StepResult,
	StepState,
} from '../quickCommand';

interface Context {
	repos: Repository[];
	selectedBranchOrTag: GitReference | undefined;
	title: string;
}

interface State {
	repo: string | Repository;
	reference: GitReference;
}

type LogStepState<T extends State = State> = ExcludeSome<StepState<T>, 'repo', string>;

export interface LogGitCommandArgs {
	readonly command: 'log';
	state?: Partial<State>;
}

export class LogGitCommand extends QuickCommand<State> {
	constructor(args?: LogGitCommandArgs) {
		super('history', 'history', 'Commits', {
			description: 'aka log, shows commit history',
		});

		let counter = 0;
		if (args?.state?.repo != null) {
			counter++;
		}

		if (args?.state?.reference != null) {
			counter++;
			if (GitReference.isRevision(args.state.reference)) {
				counter++;
			}
		}

		this.initialState = {
			counter: counter,
			confirm: false,
			...args?.state,
		};
	}

	get canConfirm(): boolean {
		return false;
	}

	isMatch(name: string) {
		return super.isMatch(name) || name === 'log';
	}

	protected async *steps(state: PartialStepState<State>): StepGenerator {
		const context: Context = {
			repos: [...(await Container.git.getOrderedRepositories())],
			selectedBranchOrTag: undefined,
			title: this.title,
		};

		while (this.canStepsContinue(state)) {
			if (state.counter < 1 || state.repo == null || typeof state.repo === 'string') {
				if (context.repos.length === 1) {
					state.counter++;
					state.repo = context.repos[0];
				} else {
					const result = yield* pickRepositoryStep(state, context);
					// Always break on the first step (so we will go back)
					if (result === StepResult.Break) break;

					state.repo = result;
				}
			}

			if (state.counter < 2 || state.reference == null) {
				const result = yield* pickBranchOrTagStep(state as LogStepState, context, {
					placeholder: 'Choose a branch or tag to show its commit history',
					picked: context.selectedBranchOrTag?.ref,
					value: context.selectedBranchOrTag == null ? state.reference?.ref : undefined,
				});
				if (result === StepResult.Break) {
					// If we skipped the previous step, make sure we back up past it
					if (context.repos.length === 1) {
						state.counter--;
					}

					continue;
				}

				state.reference = result;
				context.selectedBranchOrTag = undefined;
			}

			if (!GitReference.isRevision(state.reference)) {
				context.selectedBranchOrTag = state.reference;
			}

			if (state.counter < 3 && context.selectedBranchOrTag != null) {
				const result = yield* pickCommitStep(state as LogStepState, context, {
					log: await Container.git.getLog(state.repo.path, { ref: context.selectedBranchOrTag.ref }),
					placeholder: (context, log) =>
						log == null
							? `No commits found in ${GitReference.toString(context.selectedBranchOrTag)}`
							: 'Choose a commit',
					picked: state.reference?.ref,
				});
				if (result === StepResult.Break) continue;

				state.reference = result;
			}

			if (!(state.reference instanceof GitLogCommit)) {
				state.reference = await Container.git.getCommit(state.repo.path, state.reference.ref);
			}

			const result = yield* GitCommandsCommand.getSteps(
				{
					command: 'show',
					state: {
						repo: state.repo,
						reference: state.reference as GitLogCommit,
					},
				},
				this.pickedVia,
			);
			state.counter--;
			if (result === StepResult.Break) {
				QuickCommand.endSteps(state);
			}
		}

		return state.counter < 0 ? StepResult.Break : undefined;
	}
}
