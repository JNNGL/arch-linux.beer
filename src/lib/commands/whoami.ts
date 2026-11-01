import { dummyFile, type VirtualFile } from '#lib/file.ts';
import type { OutputPipe } from '#lib/pipe.ts';

export const whoamiCommandFile: VirtualFile = {
	...dummyFile,
	name: 'whoami',
	exec: (_: string[], output: OutputPipe) => {
		output('root\n');
		return 0;
	}
};
