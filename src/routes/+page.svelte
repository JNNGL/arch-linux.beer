<script lang="ts">
    import "@fontsource/jetbrains-mono";

    import {onMount} from "svelte";

    let innerWidth = $state(0);
    let innerHeight = $state(0);

    let rows = $state(0);
    let columns = $state(0);

    type SymbolData = {
        color: {
            r: number;
            g: number;
            b: number;
        };
        content: string;
    }

    let data: Array<Array<SymbolData>> = $state([]);

    let measurer: HTMLSpanElement;

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

    type Vec2 = readonly [number, number];

    const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
    const fract = (x: number): number => x - Math.floor(x);
    const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];

    const transformAndScale = (p: Vec2, scale: number): Vec2 => [
        (0.8 * p[0] - 0.6 * p[1]) * scale,
        (0.6 * p[0] + 0.8 * p[1]) * scale,
    ];

    function rand(n: Vec2): number {
        return fract(Math.sin(dot(n, [12.9898, 4.1414])) * 43758.5453);
    }

    function noise(p: Vec2): number {
        const ip: Vec2 = [Math.floor(p[0]), Math.floor(p[1])];
        let u: Vec2 = [fract(p[0]), fract(p[1])];

        u = [
            u[0] * u[0] * (3 - 2 * u[0]),
            u[1] * u[1] * (3 - 2 * u[1]),
        ];

        const a = rand(ip);
        const b = rand([ip[0] + 1, ip[1]]);
        const c = rand([ip[0], ip[1] + 1]);
        const d = rand([ip[0] + 1, ip[1] + 1]);

        const lower = a * (1 - u[0]) + b * u[0];
        const upper = c * (1 - u[0]) + d * u[0];
        const result = lower * (1 - u[1]) + upper * u[1];

        return result * result;
    }

    function fbm(p: Vec2, iTime: number): number {
        let f = 0;

        f += 0.5 * noise([p[0] + iTime, p[1] + iTime]);
        p = transformAndScale(p, 2.02);

        f += 0.03125 * noise(p);
        p = transformAndScale(p, 2.01);

        f += 0.25 * noise(p);
        p = transformAndScale(p, 2.03);

        f += 0.125 * noise(p);
        p = transformAndScale(p, 2.01);

        f += 0.0625 * noise(p);
        p = transformAndScale(p, 2.04);

        f += 0.015625 * noise([
            p[0] + Math.sin(iTime),
            p[1] + Math.sin(iTime),
        ]);

        return f / 0.96875;
    }

    function pattern(p: Vec2, iTime: number): number {
        const base = fbm(p, iTime);
        const warped = fbm(add(p, [base, base]), iTime);
        return fbm(add(p, [warped, warped]), iTime);
    }

    let time = 0.0;

    const chars: string = "@B%8&WM#*oahkbdpqwmzcvunxrjft/|()1{}[]?-_+~<>i!;:,^`'. ";

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
        if (!measurer || innerWidth === 0 || innerHeight === 0) return;

        const rect = measurer.getBoundingClientRect();
        const charWidth = rect.width;
        const charHeight = rect.height;

        columns = Math.floor(innerWidth / charWidth);
        rows = Math.floor(innerHeight / charHeight);

        data = Array.from({length: rows});
        for (let i = 0; i < rows; i++) {
            data[i] = Array.from({length: columns});
            for (let j = 0; j < columns; j++) {
                let u = j / columns;
                let v = i / rows;

                let shade = pattern([u, v], time);
                let shadeScaled = Math.min(1.0, shade * 1.5);
                let cb = shademap(shade);

                data[i][j] = {
                    color: {
                        r: shadeScaled * shadeScaled * 0.33,
                        g: shadeScaled * 0.33,
                        b: Math.pow(shadeScaled, 1.0 / 2.0) * 0.33
                    },
                    content: mapChar(Math.sqrt(cb))
                };
            }
        }

        time += 0.01;
    }

    onMount(() => {
        renderGrid();

        addEventListener("resize", renderGrid);

        let id = setInterval(renderGrid, 100);

        return () => {
            clearInterval(id);
            removeEventListener("resize", renderGrid);
        }
    });
</script>

<svelte:window bind:innerWidth={innerWidth} bind:innerHeight={innerHeight} />

<span class="grid-item measure-box" bind:this={measurer}>&nbsp;</span>

<div class="fullscreen-grid justify-center bg-neutral-950">
    {#each { length: rows }, r}
        <div class="grid-row justify-between">
            {#each { length: columns }, c}
                <span style:color="rgb({data[r][c].color.r * 100}%
                                       {data[r][c].color.g * 100}%
                                       {data[r][c].color.b * 100}%)"
                      class="grid-item">{data[r][c].content}</span>
            {/each}
        </div>
    {/each}
</div>

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
        display: flex;
        flex-direction: column;
    }

    .grid-row {
        display: flex;
        flex-direction: row;
        white-space: nowrap;
    }

    .grid-item {
        font-size: 0.8rem;
        line-height: 1.4;
        display: inline-block;
    }

    .measure-box {
        position: absolute;
        visibility: hidden;
        pointer-events: none;
    }
</style>
