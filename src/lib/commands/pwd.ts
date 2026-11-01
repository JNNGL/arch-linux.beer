import { dummyFile, type VirtualFile } from '#lib/file.ts';
import type { OutputPipe } from '#lib/pipe.ts';
import { currentWorkingDirectory } from '#lib/filesystem.ts';

export const pwdCommandFile: VirtualFile = {
	...dummyFile,
	name: 'pwd',
	exec: (_: string[], output: OutputPipe) => {
		output(`${currentWorkingDirectory}\n`);
		return 0;
	}
};
