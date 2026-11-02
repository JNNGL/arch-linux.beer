import { DummyInputPipe, type InputPipe, type OutputPipe } from '#lib/pipe.ts';

export type VirtualFile = {
	name: string;
	in: InputPipe;
	exec: ((args: Array<string>, output: OutputPipe) => number) | null;
	webPath: string | null;
	mode?: string;
};

export const dummyFile: VirtualFile = {
	name: "",
	in: DummyInputPipe,
	exec: null,
	webPath: null,
}

export type Directory = {
	name: string;
	children: Array<Directory>;
	files: Array<VirtualFile>;
};
