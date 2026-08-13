<script lang="ts">
	import Letter from '$lib/components/Letter.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { site } from '$lib/site';
</script>

<!-- No title given, so this page takes the site's own. -->
<Seo />

<!--
	THE HOME PAGE.

	-0.042em is measured, not chosen: at 72px the K carries 3px of side bearing
	and the italic S under it carries 0, so the title comes left by the 3px
	difference to sit level.

	It was -0.028em first, from a reading that put the S at 1px. The browser
	rounds a bearing to whole pixels, so 0 and 1 cannot be told apart there and
	both readings are honest. This one was chosen by eye, which is the only
	instrument left at that size.

	The signoff uses <br> rather than two paragraphs, because "Take care," and the
	name are one closing and not two thoughts.
-->
<Letter title={site.name} tagline={site.tagline} optical="-0.042em">
	<!--
		An em dash, and not the two hyphens a keyboard offers. `--` is what a
		typewriter did when it had no dash key. A browser has the character, so
		it should print it.
	-->
	<p>Hi, my name is Andrew Nguyen — aka Kashinoga.</p>

	<p>
		This is my corner of the Internet. Here, you'll find the things that I've
		created. These things are meant to be shared with you and your community for
		a better digital well-being.
	</p>

	<p>
		I hope that you find that these things are indeed helpful, and if so, please
		do share them with your friends!
	</p>

	<p>
		If you have any questions, comments, or concerns, please contact me at
		<a href="mailto:contact@kashinoga.com">contact@kashinoga.com</a>.
	</p>

	<p>
		Take care,<br />
		Andrew Nguyen
	</p>
</Letter>
