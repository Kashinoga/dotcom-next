<!--
	THE SHAPE OF WHAT IS COMING, while it comes. Only for a wait that is real — a
	folder or a document on the other end of a network — and never between pages,
	which are written at build time and have nothing to wait for.
-->
<script lang="ts">
	let {
		label,
		shape,
		widths,
		depth = 0,
	}: {
		/* Said to a reader who cannot see the bars, and it is the same sentence a
		 * rail used to show in their place. */
		label: string;
		/* `rows` stands in for the rail's rows, `lines` for a document's. */
		shape: 'rows' | 'lines';
		/* Each bar's width, as a percentage. Uneven, because a column of equal bars
		 * reads as a table and not as names or a paragraph. */
		widths: number[];
		depth?: number;
	} = $props();
</script>

<div class="placeholder {shape}" role="status" style="--depth: {depth}">
	<span class="visually-hidden">{label}</span>
	{#each widths as width, i (i)}
		<span class="bar" style="--width: {width}%" aria-hidden="true"></span>
	{/each}
</div>

<style>
	/*
	 * NOTHING FOR THE FIRST 200ms. A wait shorter than that reads as instant, and
	 * bars that come and go inside it are a flicker and not a courtesy. `backwards`
	 * holds the first keyframe through the delay.
	 */
	.placeholder {
		display: grid;
		animation: appear var(--motion-morph) ease-out 200ms backwards;
	}

	@keyframes appear {
		from {
			opacity: 0;
		}
	}

	.bar {
		inline-size: var(--width);
		border-radius: var(--radius-s);
		background-color: color-mix(in oklab, var(--fg) 10%, transparent);
		/* At 0ms, under reduced motion, a loop draws nothing and the bars stand
		 * still at full strength. */
		animation: breathe var(--motion-breathe) ease-in-out infinite alternate;
	}

	/* A breath and not a sweep. A sweep says "loading" louder than the wait
	 * deserves, and this is somebody's notes arriving. */
	@keyframes breathe {
		to {
			opacity: 0.5;
		}
	}

	/*
	 * THE RAIL'S OWN MEASURE: a row's height, the list's step above and between,
	 * and the indent a folder's children take, so the names land where the bars
	 * were and the pane does not move when they do. 0.75em of bar is about the
	 * height of a name's lowercase.
	 */
	.rows {
		margin-block-start: var(--space-4);
		gap: var(--space-4);
		padding-inline-start: calc(var(--depth) * var(--space-16));
		font-size: var(--text-label1);
	}

	.rows .bar {
		block-size: 0.75em;
		margin-block: calc((var(--rail-control-block-size) - 0.75em) / 2);
		margin-inline: var(--space-4);
	}

	/* A DOCUMENT'S MEASURE: the sheet's type and leading, so a line of bar is a
	 * line of text, capped where the column caps. */
	.lines {
		max-inline-size: 52rem;
		font-size: var(--text-label1);
		line-height: var(--leading-prose);
	}

	.lines .bar {
		block-size: 0.75em;
		margin-block: calc((var(--leading-prose) * 1em - 0.75em) / 2);
	}
</style>
