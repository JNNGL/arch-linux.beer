import { dummyFile, type VirtualFile } from '#lib/file.ts';
import type { OutputPipe } from '#lib/pipe.ts';
import { setTargetG } from '#lib/background.svelte.ts';

export const zovCommandFile: VirtualFile = {
	...dummyFile,
	name: '.zov',
	exec: (_: string[], print: OutputPipe) => {
		setTargetG(1.0);
		return 0;
	}
};
