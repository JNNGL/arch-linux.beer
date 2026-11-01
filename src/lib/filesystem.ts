import { type Directory, dummyFile, type VirtualFile } from '#lib/file.ts';
import { helloCommandFile } from '#lib/commands/hello.ts';
import { cdCommandFile } from '#lib/commands/cd.ts';
import { openCommandFile } from '#lib/commands/open.ts';
import staticFiles from '#lib/static_web.json'

export const fsRoot: Directory = {
	name: '',
	children: [
		{
			name: 'bin',
			children: [],
			files: [
				helloCommandFile,
				cdCommandFile,
				openCommandFile,
			]
		},
		{
			name: 'dev',
			children: [],
			files: []
		},
		{
			name: 'lib',
			children: [],
			files: []
		},
		{
			name: 'root',
			children: [],
			files: []
		},
		{
			name: 'var',
			children: [],
			files: []
		}
	],
	files: []
};

export let currentWorkingDirectory = '/root';

export function getDisplayCWD() {
	return currentWorkingDirectory.replace(/^\/root(?=\/|$)/, '~');
}

export const FIND_FILE = 1;
export const FIND_DIR = 2;

export type FindQueryResult = {
	type: number;
	result: VirtualFile | Directory | null;
	directory: string;
};

export function loadStaticWebFiles() {
	for (const path of staticFiles) {
		fetch(path).then((response: Response) => {
			response.text().then((data) => {
				const parts = path.split('/');
				const dirs = parts.slice(1, -1);

				let directory = fsRoot;
				for (const dir of dirs) {
					let child = directory.children.find((candidate) => candidate.name === dir);
					if (!child) {
						child = {
							name: dir,
							children: [],
							files: [],
						};
						directory.children.push(child);
					}
					directory = child;
				}

				directory.files = directory.files.filter((file) => file.name != parts[parts.length - 1]);

				directory.files.push({
					...dummyFile,
					name: parts[parts.length - 1],
					in: () => data,
					webPath: path,
				})
			})
		});
	}
}

export function find(path: string, wd: string, type: number): FindQueryResult {
	let parts = path.split('/');
	if (parts[0] == '~') {
		parts = ['', 'root'].concat(parts.slice(1));
	} else if (parts[0] != '') {
		parts = wd.split('/').concat(parts);
	}

	let isFile = false;
	const stack: Array<Directory> = [fsRoot];
	let node: Directory | VirtualFile = fsRoot;
	for (const part of parts) {
		if (isFile) {
			return { type: 0, result: null, directory: '' };
		}

		if (part == '' || part == '.') {
			continue;
		}

		if (part == '..') {
			if (stack.length <= 1) {
				node = fsRoot;
			} else {
				stack.pop();
				node = stack[stack.length - 1];
			}

			continue;
		}

		const files: VirtualFile[] = (node as Directory).files;
		for (const child of files) {
			if (child.name == part) {
				node = child;
				isFile = true;
				break;
			}
		}

		let found = isFile;

		if (!isFile) {
			const children: Directory[] = (node as Directory).children;
			for (const child of children) {
				if (child.name == part) {
					found = true;
					stack.push(child as Directory);
					node = child;
					break;
				}
			}
		}

		if (!found) {
			return { type: 0, result: null, directory: '' };
		}
	}

	const directory = stack.length == 1 ? '/' :
		stack.map((directory) => directory.name).join('/');

	if (isFile && (type & FIND_FILE) != 0) {
		return { type: FIND_FILE, result: node, directory: directory };
	}
	if (!isFile && (type & FIND_DIR) != 0) {
		return { type: FIND_DIR, result: node, directory: directory };
	}
	return { type: -1, result: null, directory: '' };
}

export function changeDirectory(directory: string): string | null {
	const queryResult = find(directory, currentWorkingDirectory, FIND_DIR);
	if (queryResult.type == 0) {
		return "no such file or directory";
	} else if (queryResult.type == -1) {
		return "not a directory";
	}

	currentWorkingDirectory = queryResult.directory;

	return null;
}

export type CompletionCandidate = {
	value: string;
	label: string;
	isDirectory: boolean;
	executable: boolean;
};

export function getPathCompletions(prefix: string, wd = currentWorkingDirectory): CompletionCandidate[] {
	if (prefix.startsWith("~") && !prefix.includes("/")) {
		return "~/".startsWith(prefix)
			? [{ value: "~/", label: "~/", isDirectory: true, executable: false }]
			: [];
	}

	const slashIndex = prefix.lastIndexOf("/");
	const directoryPrefix = slashIndex >= 0 ? prefix.slice(0, slashIndex + 1) : "";
	const namePrefix = slashIndex >= 0 ? prefix.slice(slashIndex + 1) : prefix;
	const directoryPath = directoryPrefix || wd;
	const query = find(directoryPath, wd, FIND_DIR);
	if (query.type !== FIND_DIR || !query.result) return [];

	const directory = query.result as Directory;
	const entries: CompletionCandidate[] = [
		...directory.children.map((child) => ({
			value: `${directoryPrefix}${child.name}/`,
			label: `${child.name}/`,
			isDirectory: true,
			executable: false
		})),
		...directory.files.map((file) => ({
			value: `${directoryPrefix}${file.name}`,
			label: file.name,
			isDirectory: false,
			executable: file.exec !== null
		}))
	];

	return entries
		.filter((entry) => entry.label.startsWith(namePrefix))
		.sort((a, b) => a.label.localeCompare(b.label));
}

export function getCommandCompletions(prefix: string, wd = currentWorkingDirectory): CompletionCandidate[] {
	const directories = [find("/bin", wd, FIND_DIR), find(wd, wd, FIND_DIR)];
	const commands = new Map<string, CompletionCandidate>();

	for (const query of directories) {
		if (query.type !== FIND_DIR || !query.result) continue;
		for (const file of (query.result as Directory).files) {
			if (file.exec !== null) {
				commands.set(file.name, {
					value: file.name,
					label: file.name,
					isDirectory: false,
					executable: true
				});
			}
		}
	}

	return [...commands.values()]
		.filter((command) => command.label.startsWith(prefix))
		.sort((a, b) => a.label.localeCompare(b.label));
}
