import { dummyFile, type VirtualFile, type Directory } from '#lib/file.ts';
import type { OutputPipe } from '#lib/pipe.ts';
import { currentWorkingDirectory, find, FIND_DIR, FIND_FILE } from '#lib/filesystem.ts';
import { wrapTerminalItems } from '#lib/terminal.ts';

type ListingEntry = {
	name: string;
	directory: boolean;
	executable: boolean;
};

function formatEntry(entry: ListingEntry, longFormat: boolean): string {
	if (!longFormat) {
		return entry.name + (entry.directory && entry.name !== '.' && entry.name !== '..' ? '/' : '');
	}

	const mode = entry.directory ? 'drwxr-xr-x' : entry.executable ? '-rwxr-xr-x' : '-rw-r--r--';
	return `${mode}  ${entry.name}`;
}

function getDirectoryEntries(directory: Directory, showAll: boolean): ListingEntry[] {
	const entries: ListingEntry[] = [
		...directory.children.map((child) => ({ name: child.name, directory: true, executable: false })),
		...directory.files.map((file) => ({
			name: file.name,
			directory: false,
			executable: file.exec !== null
		}))
	].filter((entry) => showAll || !entry.name.startsWith('.'));

	entries.sort((a, b) => a.name.localeCompare(b.name));
	if (showAll) {
		entries.unshift(
			{ name: '.', directory: true, executable: false },
			{ name: '..', directory: true, executable: false }
		);
	}

	return entries;
}

export const lsCommandFile: VirtualFile = {
	...dummyFile,
	name: 'ls',
	exec: (args: string[], output: OutputPipe) => {
		let showAll = false;
		let longFormat = false;
		let parsingOptions = true;
		const paths: string[] = [];

		for (const arg of args) {
			if (parsingOptions && arg === '--') {
				parsingOptions = false;
				continue;
			}

			if (parsingOptions && arg.startsWith('-') && arg !== '-') {
				for (const option of arg.slice(1)) {
					if (option === 'a') showAll = true;
					else if (option === 'l') longFormat = true;
					else {
						output(`ls: invalid option -- '${option}'`);
						return -1;
					}
				}
				continue;
			}

			paths.push(arg);
		}

		const targets = paths.length > 0 ? paths : [currentWorkingDirectory];
		const sections: string[] = [];
		let failed = false;

		for (const path of targets) {
			const query = find(path, currentWorkingDirectory, FIND_FILE | FIND_DIR);
			if (!query.result || query.type === 0) {
				sections.push(`ls: cannot access '${path}': no such file or directory`);
				failed = true;
				continue;
			}

			const multipleTargets = targets.length > 1;
			if (query.type === FIND_DIR) {
				const entries = getDirectoryEntries(query.result as Directory, showAll);
				const formattedEntries = entries.map((entry) => formatEntry(entry, longFormat));
				const contents = longFormat
					? formattedEntries.join('\n')
					: wrapTerminalItems(formattedEntries, output.getTerminalColumns?.() ?? 80).join('\n');
				sections.push(multipleTargets ? `${path}:${contents ? `\n${contents}` : ''}` : contents);
			} else {
				const file = query.result as VirtualFile;
				const entry = { name: file.name, directory: false, executable: file.exec !== null };
				const line = formatEntry(entry, longFormat);
				sections.push(multipleTargets ? `${path}:\n${line}` : line);
			}
		}

		if (sections.length > 0) output(sections.join('\n\n'));
		return failed ? -1 : 0;
	}
};
