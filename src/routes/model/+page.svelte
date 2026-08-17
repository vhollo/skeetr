<script lang="ts">
	import { ACTIVITY, ADULT, BREEDING, DEGREE_DAY } from '$lib/model/params';
</script>

<svelte:head><title>How it works · Skeetr</title></svelte:head>

<header class="pt-6 pb-5">
	<p class="eyebrow">Skeetr</p>
	<h1 class="display mt-0.5 mb-0 text-3xl">How it works</h1>
</header>

<div class="space-y-8 text-sm leading-relaxed text-(--color-bone-dim)">
	<section>
		<p class="text-base text-(--color-bone)">
			Two things decide whether you get bitten: how many mosquitoes are around, and whether they are
			flying right now. Skeetr works them out separately and multiplies them.
		</p>
	</section>

	<section>
		<p class="eyebrow">How many are around</p>
		<p class="mt-2">
			Rain does not create mosquitoes — it floods eggs that were already laid. That batch needs
			warmth before it can fly, so Skeetr counts <em>degree-days</em>: every hour above
			{DEGREE_DAY.baseTempC}°C adds to a running total, and the batch emerges once it reaches the
			threshold for the species.
		</p>
		<p class="mt-2">
			This is why the familiar "worse about a week after rain" rule holds in ordinary summer weather
			but breaks in a heat wave. Warmth is what is really being counted, and the delay stretches or
			shrinks to match. Adults then die off with a half-life of about {ADULT.halfLifeDays} days, faster
			above {ADULT.heatStressTempC}°C.
		</p>
		<p class="mt-2">
			Ground conditions matter too. Rain onto already-wet ground pools and breeds; the same rain onto
			baked ground soaks away. A downpour over {BREEDING.flushingRainMmPerHour} mm in an hour washes
			larvae out of containers and sets that batch back.
		</p>
	</section>

	<section>
		<p class="eyebrow">Whether they are flying</p>
		<p class="mt-2">Five conditions, each able to shut biting down on its own:</p>
		<ul class="mt-2 space-y-1.5 pl-5">
			<li>
				<strong class="text-(--color-bone)">Temperature.</strong> Nothing below {ACTIVITY.temp
					.floorC}°C, best between {ACTIVITY.temp.optimalLowC}–{ACTIVITY.temp.optimalHighC}°C, and
				they shelter from real heat.
			</li>
			<li>
				<strong class="text-(--color-bone)">Wind.</strong> They are weak fliers, and stop flying
				around {ACTIVITY.wind.groundedKmh} km/h. Forecasts report wind high up in the open, so
				Skeetr reads it down to what is felt at ankle height among hedges and furniture —
				otherwise every breezy evening would wrongly show as no risk.
			</li>
			<li>
				<strong class="text-(--color-bone)">Humidity.</strong> Dry air dries them out, so below
				{ACTIVITY.humidity.dryPct}% they stay in sheltered damp corners.
			</li>
			<li>
				<strong class="text-(--color-bone)">Rain.</strong> Falling rain keeps them under cover, which
				is why a wet evening is quiet and the one after it is not.
			</li>
			<li>
				<strong class="text-(--color-bone)">Time of day.</strong> The dusk and dawn peaks are set from
				the real sunrise and sunset where you are, not from the clock.
			</li>
		</ul>
	</section>

	<section>
		<p class="eyebrow">What it is not</p>
		<p class="mt-2">
			This is an estimate built from weather data and published mosquito biology. Nobody is counting
			mosquitoes in your garden. Local conditions — a pond next door, a blocked gutter, a
			well-screened house — move the real answer more than the weather does.
		</p>
		<p class="mt-2">
			Advice is given by active ingredient, never by brand or dose. For how much to use, how often to
			reapply, and whether a product suits children or pregnancy, read the label.
		</p>
	</section>

	<section class="border-t border-(--color-slate-line) pt-5">
		<p class="text-xs text-(--color-bone-faint)">
			Weather from <a href="https://open-meteo.com" class="underline">Open-Meteo</a>. Your places and
			settings are stored on this device only — there is no account and nothing is uploaded.
		</p>
	</section>
</div>
