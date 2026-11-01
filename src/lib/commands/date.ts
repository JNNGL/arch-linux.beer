import { dummyFile, type VirtualFile } from '#lib/file.ts';
import type { OutputPipe } from '#lib/pipe.ts';

export const dateCommandFile: VirtualFile = {
	...dummyFile,
	name: 'date',
	exec: (_: string[], output: OutputPipe) => {
		output(`${new Date().toString()}\n`);
		return 0;
	}
};
