# The Daily Banana 🍌

*A small newsroom for turning an idea into an editable comic.*

> The news makes us want to cry, but we choose to laugh.

**[Make a comic](https://whatifqu3stion.github.io/daily-banana/)** · [Install and run The Daily Banana](#install-and-run-the-daily-banana)

Making an AI image is one thing. Making a comic with a point, a joke, and characters who still look like themselves in the next panel is another. I wanted to explore that gap, while giving people room to make the result their own.

The Daily Banana starts with a topic or sourced headline and takes it through a story outline, an opening-panel review, and an editable strip. It began as a hackathon project from a Google AI Studio export, received award recognition, and has grown through AI-assisted development. It is still a prototype, with plenty to learn about what makes a generated comic worth sharing.

**Bring your own Gemini API key.** Requests use your Google project's access, quota, and billing.

## A couple of editions

<p align="center">
  <a href="docs/portfolio/data-deluge-fusion-edition.png"><img src="docs/portfolio/data-deluge-fusion-preview.jpg" width="360" alt="Data Deluge: scientists overwhelmed by paperwork"></a>
</p>

**[Data Deluge: Fusion Edition](docs/portfolio/data-deluge-fusion-edition.png)** turns promised efficiency into a mountain of paperwork, using stark black-and-white artwork and yellow sound effects.

<p align="center">
  <a href="docs/portfolio/the-vc-jenga-tower.png"><img src="docs/portfolio/vc-jenga-tower-preview.jpg" width="360" alt="The VC Jenga Tower: an executive beside a precarious stack of AI products"></a>
</p>

**[The VC Jenga Tower](docs/portfolio/the-vc-jenga-tower.png)** takes financial dependence rather literally, with warm color and expressive characters. Select either preview to see the full comic. These are finished exports, separate from the staged interface example below.

## From idea to comic

These captures follow one fictional comic through the real interface, using a scripted story and saved artwork. No new generation was run for the walkthrough. [Examples and capture notes](docs/portfolio/README.md).

### 1. Set the brief

<p align="center">
  <img src="docs/portfolio/walkthrough-01-setup.jpg" width="780" alt="Topic, stance, and humor controls with optional details collapsed">
</p>

Start with the topic and angle. References, models, and illustration settings stay available without crowding the first step. The newspaper identity gives the process some character: paper tones, halftone texture, a masthead, and banana-yellow actions.

<p align="center">
  <img src="docs/portfolio/detail-reference.jpg" width="620" alt="Uploaded character reference with a note specifying silver hair, navy suit, and office palette">
</p>

*A reference needs a purpose. The accompanying note says what should carry over: a character, an object, or a visual direction.*

### 2. Choose the story

<p align="center">
  <img src="docs/portfolio/walkthrough-02-story.jpg" width="780" alt="Story selection with a premise, panel outline, and write-your-own option">
</p>

Read the joke before paying to illustrate it. Accept the outline, request another, or supply your own angle. This gives the creator a chance to catch a bad interpretation while it is still just a plan.

<details>
  <summary><b>Writing an original angle</b></summary>
  <p align="center">
    <img src="docs/portfolio/detail-custom-angle.jpg" width="620" alt="Write Your Own Angle tab with a creator-authored premise">
  </p>
  <p>The planner can work around a premise the creator supplies. The example here is entered but not submitted.</p>
</details>

### 3. Review the opening panel

<p align="center">
  <img src="docs/portfolio/walkthrough-03-proof.jpg" width="780" alt="Opening-panel review beside its story plan, with refinement and regeneration controls">
</p>

Compare the image with the plan, then refine or regenerate it. Later panels can already be generating to reduce waiting. That is a real tradeoff: changing direction may discard work that has used API credits.

### 4. Edit the strip

<p align="center">
  <img src="docs/portfolio/walkthrough-04-editor.jpg" width="780" alt="Finished comic editor with editable dialogue and export controls">
</p>

Change the words, move bubbles, revise individual images, and export a PNG. A small correction should not mean starting again.

<p align="center">
  <img src="docs/portfolio/detail-panel-edit.jpg" width="440" alt="Panel close-up with dialogue changed to Already budgeted and the original artwork retained">
</p>

*“Routine expenses” becomes “Already budgeted” without another image request. Text and placement edits are local; image refinement and regeneration use credits. Lettering painted into an image remains part of that image. [Exported walkthrough comic](docs/portfolio/walkthrough-export.jpg).*

<details>
  <summary><b>The mobile layout</b></summary>
  <p align="center">
    <img src="docs/portfolio/02-setup-mobile.jpg" width="240" alt="Earlier mobile setup capture with stacked inputs and a large generate button">
  </p>
  <p>The inputs stack on a phone. This earlier capture uses a separate office-automation example.</p>
</details>

## Things I've learned along the way

An early source-number review interrupted comic-making with approvals. That became one optional notice, keeping concerns inspectable without blocking editing or export. Adding more checks had made the process harder to enjoy. The current checks compare text; they are not independent fact-checking. [Quality notes](docs/comic-generation-quality.md) · [Source-number checks](docs/numeric-source-consistency.md).

Visual continuity is another ongoing problem. Reference images, recurring character descriptions, and previous panels help, but a consistent-looking character can still perform the wrong action. A neat outline and polished artwork can also produce a thoroughly unfunny comic. Human judgment is still doing important work here.

## How the app is put together

React and TypeScript handle the interface; Vite and Tailwind CSS handle the build and styling. Google's GenAI SDK handles generation, and html-to-image exports the finished comic.

The [generation hook](hooks/useComicGeneration.ts) coordinates a multi-step job rather than one request. A structured story plan becomes individual panels. References and previous artwork carry context forward; dialogue remains a separate editable layer. Shared in-flight work, per-panel recovery, and stale-response protection keep a failed or outdated request from undoing useful progress.

The [generation service](services/geminiService.ts) handles plans and image direction. News suggestions retain source links, and later research stays separate from the original brief so it is clear what informed each stage. News timeouts offer a manual retry rather than silently starting another potentially billable request.

The [connection layer](services/geminiConnection.ts) supports two ways to host the app. GitHub Pages calls Google directly; a supplied key stays in tab memory for up to 30 minutes and clears on refresh, close, or removal. Page scripts and extensions may access it during use. The Node-hosted version instead uses temporary server sessions. Neither requires a publisher-funded fallback key. [Deployment and key handling](docs/deployment.md).

## Install and run The Daily Banana

You need Git, npm, and a Node.js version allowed by the [`engines` field](package.json). Node 24.22.1 or a later 24.x release satisfies the current requirement.

1. **Clone the project and open its folder.**

   ```bash
   git clone https://github.com/whatifqu3stion/daily-banana.git
   cd daily-banana
   ```

2. **Install dependencies.**

   ```bash
   npm ci
   ```

3. **Start the local development server.**

   ```bash
   npm run dev -- --local-test-http
   ```

   This flag permits plain HTTP on loopback for local testing. Production requires HTTPS.

4. **Open the local URL printed in the terminal.** Add your Gemini key through **API settings**, then enter a topic. No key belongs in a committed file or `.env.local`.

For static hosting, use `npm run build:pages`. For the Node-hosted production version, use `npm run build` followed by `npm start`. See the [deployment guide](docs/deployment.md) for configuration and validation commands.

## What I'd test next

Can a new creator connect a key, make a strip, and improve one weak panel without help? Does another reader get the joke without an explanation? I want to observe where people hesitate, what they choose to revise, and how much time and API usage it takes to make something they would share.

Automated server and browser checks cover the workflow, key handling, asset paths, and news selection using simulated provider responses. They check application behavior, not live output quality. Usability and comedy still need that human test.
