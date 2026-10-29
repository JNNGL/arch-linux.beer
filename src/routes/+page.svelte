<script lang="ts">
    import "@fontsource/jetbrains-mono";

    import {onMount} from "svelte";

    let canvas: HTMLCanvasElement;

    const fontSize = 12.8;
    const lineHeight = fontSize * 1.4;
    const maxCells = 12000;
    const colorLevels = 128;

    let time = 0.0;

    const chars: string = "@B%8&WM#*oahkbdpqwmzcvunxrjft/|()1{}[]?-_+~<>i!;:,^`'. ";


    const colorPalette = Array.from({ length: colorLevels + 1 }, (_, index) => {
        const shade = index / colorLevels;
        const r = shade * shade * 0.33;
        const g = shade * 0.33;
        const b = Math.sqrt(shade) * 0.33;
        return `rgb(${r * 100}% ${g * 100}% ${b * 100}%)`;
    });

    function shademap(x: number): number {
        if (x < 0.0) {
            return 54.0 / 255.0;
        } else if (x < 7249.0 / 82979.0) {
            return (829.79 * x + 54.51) / 255.0;
        } else if (x < 20049.0 / 82979.0) {
            return 127.0 / 255.0;
        } else if (x < 327013.0 / 810990.0) {
            return (792.022493413 * x - 64.3647907356) / 255.0;
        } else {
            return 1.0;
        }
    }

    const fract = (x: number): number => x - Math.floor(x);

    function rand(x: number, y: number): number {
        return fract(Math.sin(x * 12.9898 + y * 4.1414) * 43758.5453);
    }

    function noise(x: number, y: number): number {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        let u = fract(x);
        let v = fract(y);

        u = u * u * (3 - 2 * u);
        v = v * v * (3 - 2 * v);

        const a = rand(ix, iy);
        const b = rand(ix + 1, iy);
        const c = rand(ix, iy + 1);
        const d = rand(ix + 1, iy + 1);

        const lower = a * (1 - u) + b * u;
        const upper = c * (1 - u) + d * u;
        const result = lower * (1 - v) + upper * v;

        return result * result;
    }

    function fbm(x: number, y: number, iTime: number): number {
        let f = 0;
        let px = x;
        let py = y;
        const timeOffset = Math.sin(iTime);

        f += 0.5 * noise(px + iTime, py + iTime);
        let nextX = (0.8 * px - 0.6 * py) * 2.02;
        py = (0.6 * px + 0.8 * py) * 2.02;
        px = nextX;

        f += 0.03125 * noise(px, py);
        nextX = (0.8 * px - 0.6 * py) * 2.01;
        py = (0.6 * px + 0.8 * py) * 2.01;
        px = nextX;

        f += 0.25 * noise(px, py);
        nextX = (0.8 * px - 0.6 * py) * 2.03;
        py = (0.6 * px + 0.8 * py) * 2.03;
        px = nextX;

        f += 0.125 * noise(px, py);
        nextX = (0.8 * px - 0.6 * py) * 2.01;
        py = (0.6 * px + 0.8 * py) * 2.01;
        px = nextX;

        f += 0.0625 * noise(px, py);
        nextX = (0.8 * px - 0.6 * py) * 2.04;
        py = (0.6 * px + 0.8 * py) * 2.04;
        px = nextX;

        f += 0.015625 * noise(px + timeOffset, py + timeOffset);

        return f / 0.96875;
    }

    function pattern(x: number, y: number, iTime: number): number {
        const base = fbm(x, y, iTime);
        const warped = fbm(x + base, y + base, iTime);
        return fbm(x + warped, y + warped, iTime);
    }

    function mapChar(x: number): string {
        if (x <= 0.0) {
            return chars[chars.length - 1];
        } else if (x >= 1.0) {
            return chars[0];
        } else {
            let index = (1.0 - x) * (chars.length - 1);
            return chars[Math.round(index)];
        }
    }

    function renderGrid() {
        const ctx = canvas?.getContext("2d");
        if (!ctx) return;

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const dpr = window.devicePixelRatio || 1;

        if (canvas.width !== Math.round(width * dpr) ||
            canvas.height !== Math.round(height * dpr)) {
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";

        const charWidth = ctx.measureText("@").width;
        const baseColumns = Math.floor(width / charWidth);
        const baseRows = Math.floor(height / lineHeight);
        if (!baseColumns || !baseRows) return;

        const cellScale = Math.min(1, Math.sqrt(maxCells / (baseColumns * baseRows)));
        const columns = Math.max(1, Math.floor(baseColumns * cellScale));
        const rows = Math.max(1, Math.floor(baseRows * cellScale));
        const cellWidth = width / columns;
        const cellHeight = height / rows;
        const frameFontSize = fontSize / cellScale;
        ctx.font = `${frameFontSize}px "JetBrains Mono", monospace`;

        ctx.fillStyle = "#0A0A0A";
        ctx.fillRect(0, 0, width, height);

        const aspect = columns / rows;
        let currentColor = "";

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < columns; j++) {
                let u = 0.5 * aspect * j / columns;
                let v = i / rows;

                let shade = pattern(u, v, time);
                let shadeScaled = Math.min(1.0, shade * 1.5);
                let cb = shademap(shade);

                const colorIndex = Math.round(shadeScaled * colorLevels);
                const color = colorPalette[colorIndex];
                if (color !== currentColor) {
                    ctx.fillStyle = color;
                    currentColor = color;
                }

                ctx.fillText(mapChar(Math.sqrt(cb)), (j + 0.5) * cellWidth, (i + 0.5) * cellHeight);
            }
        }

        time += 0.01;
    }

    onMount(() => {
        renderGrid();
        void document.fonts.ready.then(renderGrid);

        addEventListener("resize", renderGrid);

        let id = setInterval(() => {
            if (!document.hidden) renderGrid();
        }, 100);

        return () => {
            clearInterval(id);
            removeEventListener("resize", renderGrid);
        }
    });
</script>

<canvas bind:this={canvas} class="fullscreen-grid" aria-hidden="true"></canvas>

<style>
    :global(html, body) {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        font-family: "JetBrains Mono", monospace;

        -webkit-user-select: none;
        user-select: none;
    }

    .fullscreen-grid {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        display: block;
    }
</style>
