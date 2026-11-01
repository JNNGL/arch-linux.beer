import { dummyFile, type VirtualFile } from '#lib/file.ts';
import type { OutputPipe } from '#lib/pipe.ts';
import { currentWorkingDirectory, find, FIND_DIR, FIND_FILE } from '#lib/filesystem.ts';

export const catCommandFile: VirtualFile = {
	...dummyFile,
	name: 'cat',
	exec: (paths: string[], output: OutputPipe) => {
		if (paths.length === 0) {
			output('cat: missing file operand\n');
			return -1;
		}

		let result = '';
		let failed = false;
		for (const path of paths) {
			const query = find(path, currentWorkingDirectory, FIND_FILE | FIND_DIR);
			if (query.type === FIND_DIR) {
				if (result && !result.endsWith('\n')) result += '\n';
				result += `cat: ${path}: is a directory\n`;
				failed = true;
			} else if (query.type !== FIND_FILE || !query.result) {
				if (result && !result.endsWith('\n')) result += '\n';
				result += `cat: ${path}: no such file or directory\n`;
				failed = true;
			} else {
				result += (query.result as VirtualFile).in() ?? '';
			}
		}

		if (result) output(result);
		return failed ? -1 : 0;
	}
};
