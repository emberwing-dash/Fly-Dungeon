# Fly Dungeon

*Tagline: Send fruit flies through a dungeon. Each one that dies teaches the next, and every brain is wired like the real fly connectome.*

## Problem Statement

Neuroscience now has a complete wiring diagram of an adult fruit fly's nervous system: 165,122 neurons and about 10 million connections. But a wiring diagram is not a working brain. The connectome does not give synaptic strengths, neuromodulation or decision thresholds, and existing connectome simulators either run the wiring as-is or train a controller with reinforcement learning. They are also hard for the public, students and most programmers to open, so the question "what does the wiring leave open, and can a search fill it in?" stays out of reach for most people.

## Solution Overview

Fly Dungeon turns that question into a game. From a main menu you press Play, choose a fly type (fruit fly, house fly, gnat), spend stat points, and send a group of flies into a 3D dungeon. They must find a golden key and reach the exit while dodging patrolling creatures, slimes, a chasing bird, spike traps and swatting humans, eating honey to stay alive.

Every fly runs a live copy of a 6,484-neuron slice of the real connectome. Looming enemies drive the real shadow detectors (LC4, LPLC2) and then the escape neurons (DNp01/02/04), which trigger a dash. The smell of the objective drives the walking neurons (DNp09, DNg97, DNg100). Honey drives the taste cells and the proboscis neuron (MN9), which must fire for the fly to eat. The wiring is identical in every fly. What the wiring does not give, eight numbers per fly (excitation and inhibition strength, sensory gains, flee and approach thresholds, speed, wander), is evolved: when a fly dies, the next one hatches from the best brains so far, mutated, so each one is smarter than the last. Levels get harder and the brains carry over.

Measured result: after 30 simulated minutes (about 2,000 flies), evolved brains get about twice as far through dungeons they have never seen as random brains (mean progress to the exit 0.50 against 0.28 at level 3, 0.51 against 0.24 at level 5, 0.49 against 0.20 at level 7).

## Key Features

* **Main menu, fly selection and stats**, 3 fly types with different 3D bodies, stat allocation, dungeon size, flies at once, naive or pre-evolved brains.
* **Multiple flies at once, each with a live connectome brain.** Select one to watch its escape, approach and feeding neurons and its evolved genes.
* **Evolution as the game loop:** a learning curve shows every fly's progress in hatch order; gold dots are escapes.
* **Switch between flies** with `Q`, open a **full-dungeon map** with `M` (a corner minimap always shows the key and exit), and **take control** of any fly (`P`); its real brain still dashes away from enemies and eats honey for you.
* **Brain switches** (`L`, `K`) silence the shadow detectors or the taste relay in every fly, so you can see what the wiring does.
* **3D toon-shaded menu and fly chooser** (the fly follows your mouse; the turntable fly changes with your type and stats), then a **3D dungeon** (three.js) with brick walls, fog and light around the flies, 3D fly models, 3D enemies (spiders, slimes, a bird, a giant fly swatter with a telegraphed slam), and CC0 Block Land art for the brick texture, key and honey.
* **Also included:** a 3D colony, a solo 3D Fly Pilot and the original Puzzle Lab.
* **Honest framing:** the brain slice is a rate model (validated against the full connectome at r = 0.994), not a spiking whole-brain emulation. The path through the dungeon and the body are supplied by the game, as in other embodied fly simulators. Research notes: `docs/RESEARCH.md`.
* **No account, no server, no API key.**

## Proof it is the real fly brain

The game has an in-app proof screen and a verification script. The brain is a 6,484-neuron, 193,169-connection slice of the FlyEM male-CNS connectome as packaged by the open Lulzx/fly-brain project. The proof screen shows the source repository and commit, SHA-256 hashes of the source files, the real neurons drawn at their real positions, FlyEM body ids for the neurons that fire, and real synapse counts recomputed (for example 537 synapses from DNp70 to the giant fibre DNp01). `python tools/verify_source.py` rebuilds every shipped synapse weight from the raw source graph and prints ALL CHECKS PASSED only on an exact match.

## Technologies Used

* Data: FlyEM male-CNS connectome v1.0 (CC-BY 4.0) via the open `fly-brain` project tables; NumPy/SciPy for pathway selection.
* Simulation: neuron-level rate network with event-driven updates, one brain step per 0.15 s per fly; procedural dungeon generator, Dijkstra flow fields, enemy AI.
* Machine learning: neuroevolution (tournament selection, Gaussian mutation, elitist archive); a from-scratch NumPy MLP hint model in the Puzzle Lab.
* Front end: plain JavaScript modules, three.js (vendored) for the 3D dungeon, colony and pilot modes, Canvas 2D for menus, minimap and charts. No frameworks, no build step.
* Art: Block Land 16x16 pack by VEXED (CC0) for brick texture, key and honey icons; flies and enemies are 3D models built in code.

## Target Users

* Anyone who likes roguelike or dungeon games and would enjoy watching a swarm learn.
* Curious people who want to see a real brain wiring diagram at work without a neuroscience background.
* Computational-neuroscience and AI-for-science groups looking for a lightweight sandbox for "what does the wiring leave open".

## Team

Solo submission: *add your name and role here.*

## Links

* Live demo: *add the published URL* (the folder `web/` is the whole site; any static host works)
* Repository: *add the repo URL*
