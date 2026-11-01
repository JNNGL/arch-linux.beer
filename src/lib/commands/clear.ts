import { dummyFile, type VirtualFile } from '#lib/file.ts';
import type { OutputPipe } from '#lib/pipe.ts';

export const clearCommandFile: VirtualFile = {
	...dummyFile,
	name: 'clear',
	exec: (_: string[], output: OutputPipe) => {
		output.clearTerminal?.();
		return 0;
	}
};
