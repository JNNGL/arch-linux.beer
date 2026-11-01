import { dummyFile, type VirtualFile } from '#lib/file.ts';
import type { OutputPipe } from '#lib/pipe.ts';

export const unameCommandFile: VirtualFile = {
	...dummyFile,
	name: 'uname',
	exec: (_: string[], output: OutputPipe) => {
		output('Linux\n');
		return 0;
	}
};
