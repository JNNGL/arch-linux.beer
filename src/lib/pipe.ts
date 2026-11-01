export type OutputPipe = (data: string) => void;
export type InputPipe = () => string | null;

export const DummyInputPipe = () => "";