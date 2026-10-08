# What already exists, and where Fly Colony fits

Research date: 8 Oct 2026. Sources are listed at the end. I looked at the three repositories in `ref2/` and ran two web searches. This is a quick survey, not a literature review, so "I found no X" below means "not in what I found".

## Existing fly simulations

| Project | What it is | Learning? |
|---|---|---|
| **Shiu et al. 2024, whole-brain LIF model** (`ref2/Drosophila_brain_model`, `ref2/fly-brain`) | Leaky integrate-and-fire network of ~125k-140k neurons and ~50M synapses built from FlyWire, with predicted neurotransmitter signs. Activate or silence neurons and read spike rates. No body. | No |
| **NeuroMechFly / NeuroMechFly v2** | Open-source MuJoCo fly body with walking and other behaviours; the usual body for connectome-driven work. | Body controllers are often trained with RL |
| **flybody** (Vaxenburg et al., bioRxiv 2024) | Anatomically detailed fly in MuJoCo, walking and flight, trained with reinforcement learning to steer. | Yes, RL |
| **FlyGM** (Jin, Zhu, Zhang, Sui, arXiv Feb 2026) | Uses the adult connectome as the *structure* of an RL controller (message passing from sensors to motors) driving a biomechanical fly. Beats rewired, random and MLP baselines in sample efficiency on gait, turning, flight. | Yes, RL on connectome structure |
| **Eon Systems embodied demo** (2026) | Connectome-based brain emulation (from Shiu et al.) plus NeuroMechFly v2; the virtual fly walks, grooms and feeds in a sandbox. Shown in a company video, and I found no peer-reviewed paper for the embodied demo. | No |
| **lulzx `fly-brain`** (`ref2/fly`, MIT) | In-browser arena: 165k-neuron male-CNS connectome in a physics body with a trained compound eye. Its own docs list what the wiring does not give you (coordinated walking, spontaneous behaviour, synaptic strengths, neuromodulation). | No |
| An eLife reviewed preprint | Cautionary: a *C. elegans* connectome driving a fly body with a DRL map produced realistic walking that is biologically meaningless. | Yes |

## What I did not find

An embodied connectome brain whose **unknown parameters are selected by survival across a competing population**, and that anyone can poke in the browser. Existing work either runs the wiring unchanged (Shiu, Eon, `fly-brain`), or trains a controller by RL (flybody, FlyGM). The `ref2/fly` docs state plainly that the connectome gives wiring, not synaptic strengths or neuromodulation, which is exactly the gap an evolutionary outer loop can fill.

## What Fly Colony does with that

* **Real, fixed:** the wiring. 28 flies each run their own live copy of a 6,484-neuron, 193k-connection pathway subgraph of the male-CNS connectome, with neurotransmitter signs.
* **Learned (neuroevolution):** 8 numbers per fly that the wiring does not specify: excitatory strength scale, inhibitory strength scale, shadow-detector gain, food-signal gain, flee threshold, approach threshold, speed, and wander. A genetic algorithm selects them by survival (hunger, swatting hands, competition for berries).
* **Supplied by code, as in the other simulators:** the body (2D movement, a hop) and the steering direction. The brain decides *whether* to flee, approach or eat.

## Honest limits

* It is a rate model on a pathway subgraph, not a spiking whole-brain emulation, and the body is not physics-based. It is a sandbox for the idea, not a competitor to NeuroMechFly, flybody or Eon.
* Evolving 8 scalings is much smaller than training synaptic weights. It shows that "what the connectome leaves open" can be searched, not that these particular values are biologically correct.
* The "ML brain" here is neuroevolution of parameters on top of fixed real wiring. It is not a neural network trained to imitate the fly.

## Sources

* Shiu et al., *A leaky integrate-and-fire computational model based on the connectome of the entire adult Drosophila brain* (bioRxiv 2023; Nature 2024), as packaged in `ref2/Drosophila_brain_model`.
* Vaxenburg et al., *Whole-body physics simulation of fruit fly locomotion* (flybody), bioRxiv 2024: https://www.biorxiv.org/content/10.1101/2024.03.11.584515v1.full.pdf
* Jin, Zhu, Zhang, Sui, *Whole-Brain Connectomic Graph Model Enables Whole-Body Locomotion Control in Fruit Fly* (FlyGM), arXiv 2602.17997: https://arxiv.org/abs/2602.17997 and project page https://sites.google.com/view/flygm
* Eon Systems embodied demo coverage: https://letsdatascience.com/news/researchers-simulate-fruit-fly-brain-controlling-virtual-bod-55db9549 and https://ispr.info/2026/04/21/researchers-upload-model-of-flys-brain-to-matrix-let-it-control-virtual-body/ (company claims; treat as unreviewed)
* Critique of embodiment shortcuts (eLife reviewed preprint 111516): https://elifesciences.org/reviewed-preprints/111516.pdf
* `ref2/fly` docs: `docs/guide/what-the-wiring-gives.md`, `docs/19-limitations.md`.
