import { dummyFile, type VirtualFile } from '#lib/file.ts';
import type { OutputPipe } from '#lib/pipe.ts';
import { processCommand } from '#lib/command.ts';
import { currentWorkingDirectory, find, FIND_DIR, FIND_FILE } from '#lib/filesystem.ts';

export const openCommandFile: VirtualFile = {
	...dummyFile,
	name: 'open',
	exec: (args: string[], print: OutputPipe) => {
		if (args.length == 0) {
			print("Usage: open [filename]");
			return 0;
		}

		const query = find(args[0], currentWorkingDirectory, FIND_FILE | FIND_DIR);
		if (query.type == 0) {
			print("open: no such file or directory: " + args[0]);
			return -1;
		}

		const filePath = '"' + args[0].replace('"', '\\"') + '"';

		if (query.type == FIND_DIR) {
			return processCommand("cd " + filePath, print);
		}

		if ((query.result as VirtualFile).exec != null) {
			return (query.result as VirtualFile).exec!([], print);
		}

		if ((query.result as VirtualFile).webPath != null) {
			window.open((query.result as VirtualFile).webPath!, "_blank")?.focus();
			return 0;
		}

		return processCommand("cat " + filePath, print);
	}
};