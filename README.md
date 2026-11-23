# Plate Solve Lab

A static, useful Astrometry.net result viewer plus an owner workflow for new sky-image solves. Inspect celestial coordinates, calibrated field width/height, orientation, pixel scale and named objects; retain dated JSON receipts and compare two frames. No frontend secret and no automatic photo upload.

<!-- coolcode:guide -->
Open **Open real example** to explore a genuine Leo Triplet solve. Use **Import receipt JSON** to load one or more receipts; **Save receipts JSON** downloads your session. Receipts stay only in the tab until saved. Comparison reports centre separation, orientation change and pixel-scale change.

To solve your own image, follow the owner upload link to https://platesolve-api.hackme.ca/, which opens in a separate tab. Sign in as the allowed owner, choose a local JPEG, PNG or FITS sky photo (up to 10 MB), confirm your permission to send it to Astrometry.net, then upload and solve. Download the completed JSON receipt, return to Plate Solve Lab and choose **Import receipt JSON**. If solving is still queued, keep the submission ID and use **Check submission** in the portal later. The portal also reads existing Astrometry job IDs. The public viewer stays open to everyone; the linked upload portal requires the owner's Access sign-in.

The **Owner solve workflow** remains an alternative for public HTTPS image URLs and existing jobs. Choose **Run workflow**, supply exactly one input, then download the **plate-solve-receipt** artifact, unzip it and import `receipt.json`. Use **submission_id** to resume a queued submission without uploading again. The repository secret `ASTROMETRY_API_KEY` is used only by Actions; the portal has its own Worker Secret.

The public page never asks for your API key. Its owner link is configurable through `web/config.json` → `ownerPortalUrl`; this simply opens the protected page. The separate `adapterUrl` setting remains empty because inline cross-origin upload is not enabled. Visitors can also upload through Astrometry.net using their own account and inspect its native results. The real example works immediately with no service setup.
<!-- /coolcode:guide -->

## Source and provenance

Provider: [Astrometry.net API](https://astrometry.net/doc/net/api.html), [official source](https://github.com/dstndstn/astrometry.net/blob/main/net/api.py). `web/data/example.json` is a genuine read-only capture of public job **1493115**, the job shown in the provider API documentation. It was retrieved on 2026-11-23. No sample photo was copied, relicensed or resubmitted. The original image's rights are not asserted by this project; open provider result links to inspect it. Calibration width/height come from `/api/jobs/1493115/calibration/`; `/info/` alone omits these fields. The provider returns JSON with `text/plain`, which is supported here. A normal API GET was verified; `Access-Control-Allow-Origin` was absent.

A capture timestamp is the metadata retrieval time, not photo exposure time. Provider orientation is shown as supplied; historical solver changes can alter its convention. Frame comparison is a positional comparison, not photometric analysis, plate-solve confidence, sharpness or tracking-error measurement. The diagram is deliberately a labelled orientation schematic, not a synthetic sky image. Field radius is not treated as width.

## Owner workflow and key

1. Repository → **Settings → Secrets and variables → Actions**: save **`ASTROMETRY_API_KEY`**. The user already has this configured.
2. Actions → **Plate Solve · Owner receipt** → Run workflow. Exactly one of `job_id`, `submission_id`, `image_url`, or `check_key_only` is required. Key check authenticates without submitting anything.
3. `image_url` must point to a public JPEG/PNG/FITS sky image. URL inputs in a public Actions repository and downloadable artifacts are visible to others; never use confidential source URLs or private photos here. The URL is sent to Astrometry to fetch; image bytes are not retained in the repository. No URL, session or key is deliberately logged by the client, although workflow inputs themselves are public.
4. Photo submissions explicitly set `publicly_visible=n`, `allow_commercial_use=n`, `allow_modifications=n`. These provider controls are not a confidentiality guarantee. The workflow requires an affirmative permission checkbox. It does not select a Creative Commons licence on your behalf.
5. Optional width bounds in degrees can improve solving. Set both, e.g. `1` and `3`, based on your lens/sensor. Other tuning is in `scripts/solve.py: solve_options`; defaults use downsampling 2. Do not invent bounds for an unknown image.
6. The client polls at most 36 times, 10 seconds apart, with request timeouts. A slow solve leaves `submission.json` in the artifact and a provider link in the summary. Rerun with its `submission_id` to continue without uploading again. A successful result adds `receipt.json`. Retention is 30 days: download receipts you want to keep.

Image solving is manual and read-only for repository contents. The Pages workflow also validates the saved API key on trusted main-branch pushes or manual main-branch runs in `jsdyer/platesolvelab`; it calls only the login endpoint and submits no photos. A failed key validation blocks that Pages build so the owner can correct the saved key. Pull-request runs never receive the secret or perform the authentication check. API error bodies are intentionally omitted from logs because they can contain sensitive request data. New observations are not automatically published to the public site.

## Owner upload portal and optional inline adapter

The linked owner portal is **[https://platesolve-api.hackme.ca/](https://platesolve-api.hackme.ca/)**. Open it in a separate top-level tab, sign in through Cloudflare Access, and use its upload, existing-job and submission-status controls. After solving, download the receipt and import it into the public viewer. The portal page and its API share one origin, so this flow does not depend on cross-site cookies or CORS permissions from CoolCode.

`web/config.json` keeps two separate settings:

| Setting | Current value | Purpose |
| --- | --- | --- |
| `ownerPortalUrl` | `https://platesolve-api.hackme.ca/` | Destination of the owner upload link; opens the protected portal in a new tab. |
| `adapterUrl` | `""` | Optional direct API connection for job lookup and upload inside the public viewer. Leave empty for the linked-portal flow. |

Changing `ownerPortalUrl` only changes a navigation link; it does not change Cloudflare, DNS, Access policy or the upload service. Keep the Astrometry key in the Worker's **`ASTROMETRY_API_KEY` Secret**. GitHub Actions secrets do not transfer to Cloudflare, and neither key belongs in public configuration.

For a fresh deployment or updates, follow the [dashboard-only setup guide](adapter/DASHBOARD.md) and use the complete [single-file Worker](adapter/worker-dashboard.mjs). A protected `workers.dev` address is also supported without moving DNS. No change to the existing CoolCode router or `toolList` is needed.

Inline integration through `adapterUrl` is a separate optional setup. It needs a tested authenticated cross-origin connection and Access preflight configuration; a link to the portal does not establish that connection. In particular, `hackme.ca` and `coolcode.ca` are different sites, so the current top-level portal flow avoids relying on third-party cookies. See the setup guide before enabling an inline adapter.

Deployment guidance follows [Cloudflare Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) and [custom domain configuration](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/). Logs and sampled traces are enabled, with no custom logging of image data, API keys or sessions.

The Worker independently validates RS256 signature, issuer, audience, expiry and exact owner email against Cloudflare Access signing keys, rejects other origins, exposes only fixed Astrometry routes, caps file/response size, and never returns sessions or API keys. It does not fetch arbitrary destinations itself or offer an open proxy. No malware/sample-file downloads or local execution are involved. Do not remove Access authentication to make this an anonymous shared-key service. A multi-user service needs per-user account handling and explicit quota management.

## Expand and run

- `web/config.json`: `ownerPortalUrl` for the separate owner upload page; optional `adapterUrl` for inline API access; workflow URL, example receipt path, upload limit (maximum 10 MB), poll interval/count. Nothing requires a fixed celestial-object list.
- Any valid successful Astrometry job can become a receipt. Import up to 100 at once and retain up to 300 per tab. JSON imports are validated, external text uses textContent, and links are derived only from numeric IDs.
- `scripts/solve.py --job-id 1493115` exports an existing public solve with no key needed. `--check-key` validates the environment secret only. `--image-url` requires the secret; use the consent-aware workflow for regular owner use.
- Optional CLI bounds: `--lower 1 --upper 3`; `--submission-id` resumes a job; `--output` changes the receipt output directory.

## Checks and publication

```
python3 scripts/build_adapter.py
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
```

GitHub Pages CI runs those checks plus a Chromium smoke test at a project subpath, screenshots, import/comparison/export and mobile overflow checks. Browser tests mock external API calls; they never submit photos or need secrets. `dist/`, receipt artifacts and source images are not committed. Pages deploys from main; no CNAME file is used. No scheduled scan or image upload is configured.
