'use strict';

import { configuration } from './configuration';

export function getQuickPickIgnoreFocusOut() {
	return !configuration.get('advanced', 'quickPick', 'closeOnFocusOut');
}

export * from './quickpicks/quickPicksItems';
export * from './quickpicks/gitQuickPickItems';

export * from './quickpicks/branchHistoryQuickPick';
// export * from './quickpicks/commitFileQuickPick';
export * from './quickpicks/commitQuickPickItems';
export * from './quickpicks/fileHistoryQuickPick';
export * from './quickpicks/modesQuickPick';
export * from './quickpicks/referencesQuickPick';
export * from './quickpicks/remotesQuickPick';
export * from './quickpicks/repositoriesQuickPick';
export * from './quickpicks/repoStatusQuickPick';
