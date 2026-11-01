import { dummyFile, type VirtualFile } from '#lib/file.ts';
import type { OutputPipe } from '#lib/pipe.ts';

export const echoCommandFile: VirtualFile = {
	...dummyFile,
	name: 'echo',
	exec: (args: string[], output: OutputPipe) => {
		const noNewline = args[0] === '-n';
		const values = noNewline ? args.slice(1) : args;
		output(values.join(' ') + (noNewline ? '' : '\n'));
		return 0;
	}
};
