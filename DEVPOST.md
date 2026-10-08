## Inspiration

Scientists have now mapped every neuron and synapse in the brain of an adult fruit fly: about 165,000 neurons and 10 million connections. The wiring diagram is public, but almost nobody outside a lab can touch it. It is also not a working brain. The diagram says what is connected to what. It does not say how strong each synapse is, or when the animal should act. The open fly simulators we found either run the wiring as it is, or train a controller with reinforcement learning.

We wanted to ask a simple question that anyone could play with: **what if flies had to survive, and their brains had to learn the parts the wiring leaves open?** And we wanted people to be able to see, with their own eyes, that the brain in the game is the real one.

## What it does

**Fly Dungeon** is a 3D dungeon game. From a 3D main menu you press Play, choose a fly (fruit fly, house fly or gnat), spend stat points, and send a group of flies into a dungeon. They have to find a golden key and reach the exit while avoiding spiders, slimes, a chasing bird, spike traps and a giant fly swatter, and eating honey to stay alive.

Every fly has its own live copy of a slice of the real fruit-fly connectome. When a fly dies, the next one hatches from the best brains so far, slightly mutated, so each one is smarter than the last. A learning curve shows it happening.

**Problem Statement.** The fly connectome is one of the biggest datasets in neuroscience, and it is locked behind specialist tools and papers. Students and the public cannot explore it, and nobody gets to see how the missing numbers (synapse strengths, decision thresholds) could be filled in by learning. Understanding how brains and AI relate is also hard to teach without something to play with.

**Solution Overview.** We put the real connectome in a browser game. Players watch real neurons drive real behaviour (a shadow fires the escape neurons, the smell of food fires the approach neurons, taste fires the feeding neuron), and watch an evolutionary search fill in what the wiring does not specify. A proof screen lets anyone check that the brain really comes from the published connectome. No account, no server and no API key are needed.

**Key Features**
- 3D toon-style main menu with a fly that follows your mouse, and a fly chooser with a turntable. The big fly changes as you pick a type or spend stat points (bigger eyes, longer legs, faster wings).
- Multiple flies at once, each running its own connectome brain. Select any fly with `Q` or a click and see its real firing neurons, its evolved genes and its brain activity live.
- Evolution as the game loop: dying flies are replaced by mutated copies of the best brains, with a learning curve and a hatch counter.
- Take control of a fly (`P`). Its real brain still dashes away from enemies and eats honey for you.
- Brain switches (`L`, `K`) that cut real cell types (the shadow detectors LC4/LPLC2, the taste relay GNG117) in every fly so you can see what the wiring does.
- A minimap and full map (`M`), a pause menu (`Esc`), and a free camera (hold right mouse + `WASD`).
- A **proof screen**: source repository and commit, SHA-256 hashes of the source files, a 3D cloud of the real neurons at their real positions, real neuron names and FlyEM ids, and real synapse counts recomputed.
- Extra modes: a 3D colony, a solo 3D Fly Pilot, and a puzzle lab (repair a damaged fly brain with hints from a small neural network).

**Technologies Used** are listed below, and **Target Users** are the last section.

## How we built it

- **The brain.** We took the FlyEM male-CNS connectome (165,122 neurons, 10,511,038 connections) as packaged by the open [Lulzx/fly-brain](https://github.com/Lulzx/fly-brain) project, and traced the shadow, smell and taste pathways through it with graph propagation (NumPy and SciPy). That gave a slice of 6,484 neurons and 193,169 connections. Each fly runs a neuron-level rate network on that wiring in the browser, using the connectome's predicted neurotransmitter signs.
- **What is learned.** The wiring is fixed. Eight numbers per fly are evolved: excitatory and inhibitory strength, shadow gain, smell gain, flee threshold, approach threshold, speed and wander. The evolution uses tournament selection, Gaussian mutation and an archive of the best brains.
- **What is supplied.** As in other embodied fly simulators, the game supplies the body and the path through the dungeon. The brain decides whether to flee, push on or eat.
- **The game.** Plain JavaScript modules and three.js for the 3D dungeon, menu and models (toon-shaded with outlines). The enemies, flies and models are built in code. The art style borrows from our earlier game jam work. Brick, key and honey art is Block Land by VEXED (CC0).
- **The neural network.** For the puzzle lab we wrote a small neural network from scratch in NumPy and trained it on thousands of simulated operations, so it can score hundreds of moves instantly.
- **Checks.** We wrote scripts to check the browser simulator against a NumPy reference, the slice against the full connectome, and the shipped brain against the raw source files.

## Challenges we ran into

- **A wiring diagram is not a brain.** The connectome gives no synaptic strengths or thresholds. We had to decide honestly what is real (the wiring and the pathways), what is learned (eight numbers) and what is supplied (the body and the path). The in-game proof screen and the README say exactly this.
- **Keeping the model honest.** Our slice of the brain agrees with the full connectome at r = 0.994 across 18 conditions. But three of the six reference fixes in the puzzle lab do not carry over to the full wiring (for example one lands at 51% of healthy instead of about 100%). We show that warning in the game instead of hiding it.
- **Speed.** Running a live brain for every fly in a browser is expensive. We made each brain step only touch the neurons that are active, and step every third tick, which made the colony about three times faster.
- **Making it feel like a game.** Our first versions were too technical and too generic. We redesigned the interface around a 3D menu, chunky buttons, glass panels and a turntable fly picker, and replaced flat sprites with 3D models.

## Accomplishments that we're proud of

- **Evolution works.** After 30 simulated minutes (about 2,000 flies hatched), evolved brains got about twice as far through dungeons they had never seen as random brains: mean progress to the exit 0.50 against 0.28 at level 3, 0.51 against 0.24 at level 5, and 0.49 against 0.20 at level 7. In the 3D colony, survival went from 14 s with 1 survivor out of 28 to 41 s with 11.6 survivors. With the shadow detectors switched off the evolved colony drops to 23 s, because 26.5 flies get swatted. So the real escape pathway matters.
- **A checkable proof.** `python tools/verify_source.py` rebuilds all 193,169 shipped synapse weights from the raw source graph and prints ALL CHECKS PASSED only on an exact match (the maximum difference is 0). In the game you can see, for example, 537 raw synapses from DNp70 onto the giant fibre DNp01 become weight 0.034052.
- **The browser simulator matches the NumPy reference to about 1e-7**, and runs with no server and no API key.
- **A game people want to look at**, built in two days, with a menu where the fly follows your mouse.

## What we learned

- **Course ideas, in practice:** data and bias (why a subgraph can mislead), algorithms, neural networks and training and testing (the small hint network and its held-out accuracy), and responsible use. The game keeps the simulator as the referee of the hint network and says plainly when a fix does not hold on the full wiring.
- Neuroevolution can fill in "what the wiring leaves open", but only the parts you choose to expose. Eight numbers are far smaller than a full set of synaptic weights.
- Honest framing matters. This is a rate model on a pathway slice with a supplied body, not a spiking whole-brain emulation.
- Research notes are in `docs/RESEARCH.md`. In the sources we found (NeuroMechFly and flybody, FlyGM, Eon's embodied demo, Shiu et al. 2024 and the `fly-brain` arena), we did not find one that evolves an embodied connectome brain by survival across a competing population. That was a quick survey and not a full literature review.

## What's next for Fly Dungeon

- Expose more of the brain to evolution, such as per-cell-type gains, and compare against reinforcement learning on the same wiring.
- Add more behaviours and pathways (grooming, courtship, flight) as new dungeon rooms and enemies.
- Replace the supplied path-finding with a brain-driven navigation circuit, such as the central complex.
- Export the best evolved brains as candidate experiments for full spiking models.
- Add shareable seeds and a leaderboard, and a classroom mode.

## Technologies Used

JavaScript (ES modules), three.js r160, HTML5 Canvas, Python (NumPy, SciPy) for graph propagation and training the hint network, Node.js for headless evolution and tests. Data: FlyEM male-CNS connectome v1.0 through the open Lulzx/fly-brain project. Art and fonts: Block Land by VEXED (CC0), Chewy (Apache 2.0) and Fredoka (OFL).

## Target Users

- People who like dungeon and survival games and enjoy watching a swarm learn.
- Students and the curious public who want to see a real brain wiring diagram and the idea of AI learning, without a neuroscience background.
- Computational-neuroscience and AI-for-science groups who want a small, inspectable sandbox for the question of what a connectome leaves open.

## Team

Solo submission: **Rishav Goswami** (game design, 3D and UI, simulation, machine learning, data pipeline).

## Links

- Repository: https://github.com/emberwing-dash/Fly-Dungeon
- Live demo: *add the Netlify URL here*
- Screenshots to upload: `screenshots/08-main-menu.png`, `09-choose-your-fly.png`, `10-brain-proof.png`, `11-gameplay.png`
