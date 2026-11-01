export type OutputPipe = ((data: string) => void) & {
	clearTerminal?: () => void;
	getTerminalColumns?: () => number;
};
export type InputPipe = () => string | null;

export const DummyInputPipe = () => "";
