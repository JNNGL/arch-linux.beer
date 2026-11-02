import { dummyFile, type VirtualFile } from '#lib/file.ts';
import type { OutputPipe } from '#lib/pipe.ts';

export const zovCommandFile: VirtualFile = {
	...dummyFile,
	name: '.zov',
	exec: (_: string[], print: OutputPipe) => {
		print('Hello, world!');
		return 0;
	}
};
