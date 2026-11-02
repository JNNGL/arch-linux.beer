export let frame = 0;
export let time = 0;
export let deltaTime = 0.0015;
export const gLevel = $state({ value: 0 });
export const gTargetLevel = $state({ value: 0 });
export let powR = 2.0,
	powG = 1.0,
	powB = 0.5;
export let targetPowR = 2.0,
	targetPowG = 1.0,
	targetPowB = 0.5;

export function setErrorBackground() {
	deltaTime = 0.04;
	targetPowR = 0.5;
	targetPowG = 2.0;
	targetPowB = 2.5;
}

const lerp = (a: number, b: number, t: number): number => {
	return a + t * (b - a);
};

export const colorLevels = 128;
export let colorPalette: Array<string> = [];

export function generatePalette() {
	colorPalette = Array.from({ length: colorLevels + 1 }, (_, index) => {
		const shade = index / colorLevels;
		let r = Math.pow(shade, powR) * 0.33;
		let g = Math.pow(shade, powG) * 0.33;
		let b = Math.pow(shade, powB) * 0.33;

		let gr, gg, gb;
		if (shade < 0.4) {
			gr = shade;
			gg = shade;
			gb = shade;
		} else if (shade < 0.6) {
			gr = 0.05 * 0.5;
			gg = 0.1 * 0.5;
			gb = 0.5 * 0.5;
		} else {
			gb = 0.05 * 0.5;
			gg = 0.1 * 0.5;
			gr = 0.5 * 0.5;
		}

		r = lerp(r, gr, gLevel.value);
		g = lerp(g, gg, gLevel.value);
		b = lerp(b, gb, gLevel.value);

		return `rgb(${r * 100}% ${g * 100}% ${b * 100}%)`;
	});
}

export function setTargetG(g: number) {
	if (gTargetLevel.value == g) {
		return;
	}

	gTargetLevel.value = g;
	deltaTime = 0.04;
}

export function tickBackground() {
	frame++;
	time += deltaTime;
	generatePalette();

	gLevel.value = lerp(gLevel.value, gTargetLevel.value, 0.1);

	deltaTime = lerp(deltaTime, 0.0015, 0.1);
	powR = lerp(powR, targetPowR, 0.3);
	powG = lerp(powG, targetPowG, 0.3);
	powB = lerp(powB, targetPowB, 0.3);

	targetPowR = lerp(targetPowR, 2.0, 0.006);
	targetPowG = lerp(targetPowG, 1.0, 0.006);
	targetPowB = lerp(targetPowB, 0.5, 0.006);
}