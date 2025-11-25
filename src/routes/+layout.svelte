<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Satomata Shiki AI Chat</title>
</svelte:head>

{@render children()}
