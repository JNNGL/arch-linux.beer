import { dummyFile, type VirtualFile } from '#lib/file.ts';
import { changeDirectory } from '#lib/filesystem.ts';
import type { OutputPipe } from '#lib/pipe.ts';

export const cdCommandFile: VirtualFile = {
	...dummyFile,
	name: 'cd',
	exec: (args: string[], print: OutputPipe) => {
		if (args.length == 0) {
			return 0;
		}
		const error = changeDirectory(args[0]);
		if (error != null) {
			print('cd: ' + error + ': ' + args[0]);
			return -1;
		}
		return 0;
	}
};