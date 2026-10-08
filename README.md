# Fly Dungeon

Four ways to play with one real fruit-fly connectome (all in the browser, no API, no server):

* **Fly Dungeon** (`web/index.html`, the main game). Main menu, then **Play**, then choose a **fly type** (fruit fly, house fly, gnat) and spend stat points (speed, stamina, senses, reflex), the dungeon size, how many flies fly at once, and whether brains start **naive** or **pre-evolved**. The front end has a **3D toon-shaded main menu** with a fly that follows your mouse, a fly chooser with a turntable that updates as you pick a type or spend points, and a rounded glass HUD (design language borrowed from the author's earlier jam game Tiding Ocean). Flies go through a **3D dungeon** (brick walls, 3D fly models, and 3D enemies: spiders, slimes, a bird and a giant fly swatter that telegraphs its slam): grab the golden key, reach the green door, avoid patrolling critters, slimes, a chasing bird, spike traps and swatting humans, and eat honey. **Every fly has a live copy of the connectome brain. When a fly dies, the next fly hatches from the best brains so far, mutated, so each generation is smarter.** Three escapes open a bigger dungeon and the brains carry over. Controls: `Q` (or Tab) switches to the next fly, `M` opens the full dungeon map (the corner minimap always shows the key and exit), `P` takes control of the selected fly with WASD relative to the camera (its brain still dashes away from enemies for you), `L`/`K` switch parts of every brain off, drag to orbit, wheel to zoom, `Space` pauses, **`Esc` opens a pause menu (Resume / Quit to menu)** and freezes the simulation, and **holding the right mouse button + WASD pans the camera freely over the map** (it works while paused too; `F` or selecting a fly re-attaches the camera). On the chooser and brain screens, the round **`<` button at the top left** (or `Esc`) goes back.
* **3D Colony** (`web/colony.html`): 28 flies in a 3D arena that evolve against swatting hands.
* **Fly Pilot** (`web/pilot.html`): fly one fly yourself in 3D.
* **Puzzle Lab** (`web/lab.html`): the original puzzle game, *Brain Surgeon*, described further down.

## Fly Dungeon: what is learned and what is real

| Part | Status |
|---|---|
| Wiring: 6,484 neurons, 193,169 connections, neurotransmitter signs | **real** (FlyEM male-CNS v1.0), identical in every fly of every type |
| Shadow detectors LC4/LPLC2 to escape neurons DNp01/02/04 | **real pathway**, triggers the dash when enemies loom |
| Smell of key and door to approach neurons DNp09/DNg97/DNg100 | **real pathway**, decides whether the fly pushes toward the objective |
| Taste cells to proboscis neuron MN9 | **real pathway**, must fire for the fly to eat honey |
| 8 genes per fly: excitation scale, inhibition scale, shadow gain, food gain, flee threshold, approach threshold, speed, wander | **evolved**: when a fly dies, the next hatches from the best past brains, mutated (tournament selection, Gaussian mutation, 8% random gene resets) |
| Fly type and stats | **body only** (speed, energy, senses, dash, hit box). Every type uses the same Drosophila brain |
| The path through the dungeon (flow field), enemy behaviour, the dungeon itself | **supplied by the game**, like the steering and body in other embodied fly simulators. The brain decides whether to flee, push on or eat |

Measured with `tools/dungeon-evolve.mjs` + `tools/dungeon-bench.mjs`: after 30 minutes of simulated dungeon time (about 2,000 flies hatched), a population of the 24 best brains versus 24 random brains, each run on 4 fixed dungeons the training never saw (average over 96 flies per row):

| Dungeon level | Naive brains: mean progress to the exit | Evolved brains | Evolved escape rate |
|---|---|---|---|
| 3 | 0.28 | 0.50 | about 0% |
| 5 | 0.24 | 0.51 | 6% |
| 7 | 0.20 | 0.49 | 3% |

Evolved flies get about twice as far, but they still mostly die on the way (they die to enemies more, because they get further). The game is hard on purpose, and "smarter" here means a better-tuned brain, not a solved dungeon. Fonts: Chewy (Apache 2.0) and Fredoka (OFL), served locally from `web/assets/fonts/`. Wall brick texture and the key and honey icons come from Block Land by VEXED (CC0, from `N:\GameJams\CookieJam`, copied to `web/assets/blockland/` with its licence); flies and enemies are 3D models built in code. Test URLs: `index.html?play=house&brain=evolved&warp=40&map=1` skips the menu and fast-forwards 40 simulated seconds, `?screen=setup` opens the fly chooser.

Rebuild the pre-evolved brains: `cd tools && node dungeon-evolve.mjs 1800 1` (about a minute).

**Sound:** all audio is synthesised live with the Web Audio API (no audio files, nothing to license): a generative dungeon music loop whose tempo and intensity rise as enemies close in, wing hum for the selected fly (it follows your mouse in the menu), and effects with distance fall-off and stereo panning for dashes, honey, the key, hurt, death, the swatter wind-up and slam, the bird alert and escapes. `N` or the speaker button mutes; music and effects sliders are in the pause menu.

## Proof that it is the real fly brain

The brain in every game is a slice of the connectome packaged by **Lulzx/fly-brain** (`ref2/fly`, MIT), which itself packs the **FlyEM male-CNS v1.0** wiring diagram (CC-BY 4.0): 165,122 neurons, 10,511,038 connections. The game ships 6,484 of those neurons and 193,169 of those connections, chosen by tracing the shadow, smell and taste pathways through the full graph (`tools/select_sub.py`).

* **In the game:** the main menu has a **Proof: the real fly brain** screen. It shows the source repository, the commit, the SHA-256 of each source file, a rotating 3D cloud of the real neurons drawn at their real soma positions, and buttons that stimulate real neurons and run the real wiring. It lists the neurons that fire by their FlyEM instance names and body ids (for example `DNp01(GF)_R`, body id 10001, the giant fibre), and shows real synapses recomputed: for example `DNp70(CL305)_R` to `DNp01(GF)_R` is 537 synapses in the raw connectome and becomes weight 0.034052. While you play, the selected fly's panel also lists the real neurons firing in its brain right now. 1,090 neurons have no soma position in the source data, so the 3D cloud scatters those.
* **From the command line:** `cd tools && python verify_source.py` re-hashes the source files and rebuilds all 193,169 shipped synapse weights directly from the raw source graph. It prints `ALL CHECKS PASSED` only if the structure is identical and the maximum weight difference is below 1e-6 (it is 0).
* `tools/make_provenance.py` generates the data behind that screen (`web/data/provenance.json`, `web/data/brain_ids.json`).

## 3D Colony: what is learned and what is real

| Part | Status |
|---|---|
| Wiring: 6,484 neurons, 193,169 connections, neurotransmitter signs | **real** (FlyEM male-CNS v1.0), identical in every fly |
| 8 genes per fly: excitation scale, inhibition scale, shadow gain, food gain, flee threshold, approach threshold, speed, wander | **evolved** by selection on survival (hunger, swatting hands, competition for 8 berries) |
| Body (2D movement, a hop) and steering direction | **supplied**, like in the other embodied fly simulators; the brain decides *whether* to flee, approach or eat |

Brain readouts: looming shadow drives LC4/LPLC2, then the escape neurons DNp01/02/04 trigger a hop; a visible berry drives LC9/LC31/LPC1, then the walking neurons DNp09/DNg97/DNg100 trigger approach; touching a berry drives the labellar taste cells, then MN9 (proboscis) must fire for the fly to eat.

Measured with `tools/compare.mjs` (8 fresh rounds each, 28 flies, 60 s):

| Colony | Mean seconds survived | Survivors of 28 | Swatted | Starved |
|---|---|---|---|---|
| naive (random genes) | 14.0 | 1.0 | 4.1 | 22.9 |
| evolved (40 generations, `tools/evolve.mjs`) | 41.2 | 11.6 | 3.4 | 13.0 |
| evolved, shadow detectors LC4+LPLC2 off (`L`) | 23.4 | 0.6 | 26.5 | 0.9 |
| evolved, taste relay GNG117 cut (`K`) | 34.8 | 7.4 | 3.3 | 17.4 |

Evolution is noisy generation to generation (see the chart in the app). The trend is clear but the plateau is not a global optimum, and swapping off a cell type does not zero a behaviour completely because the network has redundant paths. This is neuroevolution of 8 scalings on top of fixed real wiring, not a trained imitation of the fly. See `docs/RESEARCH.md` for how this compares with NeuroMechFly, flybody, FlyGM, Eon and the `ref2` simulators.

Controls (3D colony): drag to orbit, wheel to zoom, double-click to reset the view, click a fly to inspect its genes and live neuron activity, click ground to drop a swatter, Shift+click to drop a berry, `Space` pause, `L`/`K` lesions, "Naive colony" + "Keep evolving" to watch it learn from scratch (3x speed is comfortable), "Skip round" to fast-forward.

Rebuild the evolved population: `cd tools && node evolve.mjs 40 1` (about 3 minutes), then `node compare.mjs 8`.

## Fly Pilot (solo) controls

`W`/`S` faster/slower, `A`/`D` turn, `Space` up, `Shift` down, `L` blind the looming detectors (LC4, LPLC2), `K` cut the taste relay (GNG117). Desktop keyboard only. The looming size of the hand drives LC4/LPLC2 in the simulator; when the escape neurons (DNp01/02/04) reach 50% activity the fly gets an automatic escape jump. 3D uses three.js r160 (MIT), vendored in `web/vendor/`.

# Fly Dungeon Lab: Brain Surgeon (Puzzle Lab)

**A puzzle game where you repair a fruit fly's broken behaviour by operating on its real connectome wiring.**

The complete wiring diagram of a fruit fly's central nervous system (165,122 neurons, 10.5 million connections) is public.
Knowing the wiring is not the same as knowing which cells make which behaviour. The Puzzle Lab turns that open question into a game:
a fly's brain has been damaged, and you get five operation points to rewire the circuit so it behaves normally again,
without waking up the wrong behaviours.

> Submission for the ML Empowerment Build Challenge 3.0. Everything runs in the browser, with no API key and no server.

## Play it

```bash
cd web
python -m http.server 8765      # any static server works
# open http://localhost:8765
```

Six cases, ordered from easy to expert:

| Case | Stimulus | Healthy behaviour | What is broken |
|---|---|---|---|
| Eyes on the Prize | a berry rolls by | approach (walk toward it) | six visual-to-motor relays |
| The Shadow | looming shadow | giant-fibre escape jump | LPLC2 looming detectors |
| Dusty Antennae | dust on antennae | front-leg grooming | three groups of antennal mechanosensors |
| Sweet Tooth | sugar on the mouth | proboscis extension | the key relay GNG117 |
| Love Is Blind | another fly in view | courtship (wing song) | two visual-to-courtship relays |
| The Shadow II | faint shadow | escape | LC4 detectors (the second looming channel) |

How a turn works:

1. Read the case. The patient panel shows the fly reacting (or failing to). Bars show each behaviour relative to a healthy fly.
2. Click any node on the **circuit map**. Every node is a real cell type from the connectome; every line is a real synapse bundle (green excites, red inhibits).
3. Choose **Nudge +** (1 point), **Drive ++** (2 points) or **Silence −** (1 point). Sensors and relays are fair game. The final command neurons are read-only.
4. Score = accuracy to the healthy level (overshooting is penalised too) − collateral behaviours − 2 per operation. Stars are earned against the "par" fix found by an automated search.
5. **Save fix** keeps your best, and **Export case file** downloads your solutions as JSON.

## Screenshots

`screenshots/` has full-resolution captures: a damaged patient, the same patient after a fix, and several cases. Handy URL flags while testing or capturing: `?case=mate`, `&fix=1` (apply the reference fix), `&intro=0` (skip the how-to dialog).

## What is real, what is a model

| Layer | What it is |
|---|---|
| Wiring | FlyEM male-CNS connectome v1.0 (165,122 neurons, 10.5 M synapse-type edges, predicted neurotransmitter signs), read from the `ref2/fly` tables |
| Game brain | A rate model on a pathway subgraph: 353 cell types, 6,484 neurons, 193,169 connections. Update rule: `x <- (1-a)x + a*clip(g*W x + I - theta, 0, 1)`, where `W[post,pre] = sign(pre) * synapses / total_inputs(post)` |
| Where the subgraph comes from | For each scenario, neurons are scored by (reach from the stimulus) x (influence on the behaviour's command neurons) over 5 hops of the full graph; the top types are kept |
| Stimulus and behaviour sets | Looming → DNp01/02/04 (giant fibre), antennal Johnston's-organ cells → DNg07/08 (grooming), LC10 + ORN_DA1 → pIP10/DNp13 (courtship), LC9/LPC1 → DNp09/DNg97/DNg100 (walking), labellar taste → MN9 (proboscis). The full-connectome screen reproduces these known circuits |

It is a teaching and exploration tool, not a prediction of living-fly behaviour. Rate models ignore spike timing, synaptic strength variation,
neuromodulation and plasticity.

### Checks that the model deserves the data

* **JS = Python.** `tools/parity.mjs` shows the browser simulator matches the numpy reference to 1e-7 on all six cases.
* **Subgraph = whole brain.** `tools/validate_full.py` re-runs every case's healthy, damaged and fixed condition on the *full* 165,122-neuron graph
  with the same rule. Pearson r = **0.994** across 18 conditions, mean absolute difference 0.017 of activity.
  The reference fixes are less portable than the baselines: re-run on the full graph, Eyes on the Prize, The Shadow and Dusty Antennae land at 98%, 97% and 94% of healthy,
  but Sweet Tooth lands at 51%, Love Is Blind overshoots to 120% and The Shadow II reaches 77%. Truncating the circuit removes some of the inhibition that those fixes were leaning on.
  The game prints this "reality check" on every case card instead of hiding it, and it is the reason exported fixes are called hypotheses.
* **Solvable by construction.** Every case ships with a par fix found by greedy search over all operations, so no puzzle is impossible. Difficulty is tuned by lesion depth, and the case card reports how many of the single operations come close.

## The AI parts

1. **Neural-network "AI Resident".** One small MLP per case (96-96 hidden units, written from scratch in numpy; `tools/mlp.py`), trained on 10,500 simulated operations per case. It predicts the behaviour vector for *any* set of operations in microseconds, so the in-game hint can score ~160 candidate moves instantly instead of running ~160 simulations. The game shows its prediction next to the simulator's answer, so players see where the model is wrong. On 1,500 held-out plans per case its predicted target level has R² 0.998–1.0 (mean absolute error 0.002–0.007 of the healthy level); the simulator stays the referee. Numbers: `tools/resident_report.json`, plus `tools/resident_check.mjs`, which re-checks the exported JavaScript network against the JavaScript simulator.
2. **Automated level design.** A greedy search authors each lesion (silence the types that hurt the target most, deeper until the behaviour drops below a threshold) and verifies a solution exists. That is how six solvable puzzles come out of 11,752 cell types.
3. **Pathway discovery.** Graph propagation over the real connectome picks which 353 of 11,752 cell types matter to each case, instead of hand-drawing circuits.

Course concepts used: data and bias (Lesson 5), algorithms (6), neural networks and training/testing/feedback loops (3, 7), and responsible use, verifying model output (11). The Resident proposes and the simulator decides.

## Why it matters

* **Citizen science.** Fixes are logged as candidate circuits (`flyfix-case-file/1` JSON). In a real deployment they become a ranked list of silencing/activation experiments for the full spiking models, a Foldit-style human-in-the-loop search that the connectome simulators in the reference repositories do not have.
* **Public engagement.** Anyone can see, in two minutes, that behaviour is a wiring problem, and that damage, redundancy and compensation are the same ideas behind deep-brain stimulation and neural prosthetics.
* **Open.** No accounts, no tracking, no network calls after load. Progress is stored only in your browser's local storage.

## Layout

```
web/                     static game (HTML, CSS, ES modules, data)
  js/sim.js              the brain simulator (port of tools/gsim.py)
  js/graph.js            circuit-map canvas
  js/fly.js              procedural fly + stage animations
  js/resident.js         MLP inference
  js/main.js             puzzle-lab logic, scoring, UI
  js/dungeon.js          Fly Dungeon: screens, 3D dungeon renderer, HUD, brain proof screen
  js/stage3d.js          3D menu / fly chooser / neuron-cloud stage
  js/flymodel.js         toon-shaded 3D fly models shared by every screen
  js/dungeon-core.js     dungeon generator, enemies, fly bodies/stats, brain-driven AI, evolution
  js/colony-core.js      shared connectome wiring + per-fly brain; 3D colony simulation
  js/colony.js, pilot.js 3D colony and Fly Pilot
  assets/blockland/      Block Land pixel art by VEXED (CC0)
  index.html             Fly Dungeon (main menu is the front page)
  colony.html, pilot.html, lab.html   other games
  vendor/three.module.min.js   three.js r160, MIT
  data/                  brain.bin/json, cases.json, resident.json (generated)
tools/                   data pipeline (Python)
  load.py                reads the connectome tables from ../ref2/fly/public/data
  prop.py, screen.py     full-connectome propagation + sensory screens
  select_sub.py, build_sub.py   pick the pathway subgraph
  gsim.py, moves.py      the game's reference simulator and move/score definitions
  make_cases.py          build levels, par fixes, layouts, brain export
  train_resident.py, mlp.py     train and export the AI Resident
  parity.mjs, resident_check.mjs, validate_full.py  verification
  dungeon-evolve.mjs, dungeon-bench.mjs, dungeon-test.mjs  headless dungeon evolution + benchmark
  make_provenance.py, verify_source.py  proof that the shipped brain is the real connectome
  evolve.mjs, compare.mjs  3D colony evolution + comparison
  explore/               throwaway probes used while tuning the cases (kept for the record, not part of the pipeline)
```

Rebuild everything: `cd tools && python select_sub.py && python build_sub.py 70 && python make_cases.py && python train_resident.py` (needs only `numpy` and `scipy`; the connectome tables are read from `ref2/fly/public/data`. `train_resident.py` takes about 15 minutes on a laptop CPU).

## Credits and licences

* Connectome: FlyEM / Janelia male-CNS v1.0 (CC-BY 4.0), packed tables from the *fly-brain* project (`ref2/fly`, MIT) by lulzx.
* Circuit background: Shiu et al., *A leaky integrate-and-fire computational model based on the connectome of the entire adult Drosophila brain*.
* Code in this folder: MIT.
