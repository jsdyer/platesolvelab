# Plate Solve Lab

A static, useful Astrometry.net result viewer plus an owner workflow for new sky-image solves. Inspect celestial coordinates, calibrated field width/height, orientation, pixel scale and named objects; retain dated JSON receipts and compare two frames. No frontend secret and no automatic photo upload.

<!-- coolcode:guide -->
Open **Open real example** to explore a genuine Leo Triplet solve. Use **Import receipt JSON** to load one or more workflow receipts; **Save receipts JSON** downloads your session. Receipts stay only in the tab until saved. Comparison reports centre separation, orientation change and pixel-scale change.

To solve your own image, open **Owner solve workflow**, choose **Run workflow**, supply a public HTTPS photo URL and confirm your permission to submit it. After completion download the **plate-solve-receipt** artifact, unzip it and import `receipt.json`. The existing repository secret `ASTROMETRY_API_KEY` is used only by Actions. For an existing Astrometry job, enter its numeric **job ID** in the workflow instead of uploading. Submission IDs and image IDs are different; use the separate **submission_id** input to resume a queued submission.

The public page does not ask for your API key. Astrometry's API lacks cross-origin permission for direct browser calls. Arbitrary job inspection therefore uses the owner workflow, or the optional authenticated adapter. Visitors can upload directly at Astrometry.net and inspect its native results. Edit `web/config.json` to connect a dedicated adapter; instructions below. The real example works immediately with no service setup.
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

## Optional live upload: dedicated authenticated Worker

Nothing here changes your existing Cloudflare router or `toolList`. The public app is useful without this adapter. This optional path lets the owner inspect arbitrary jobs and upload local files directly through their own service, without exposing the Astrometry key.

1. Choose a **dedicated custom hostname**, ideally `platesolve-api.coolcode.ca`. In Cloudflare Zero Trust, create a self-hosted **Access application** for that hostname, with an Allow policy restricted to your own email identity. Do not create a public Bypass policy.
2. Set `CF_ACCESS_TEAM_DOMAIN`, the Access application's `CF_ACCESS_AUD`, and `OWNER_EMAIL` in `adapter/wrangler.jsonc`. `ALLOWED_ORIGIN` is `https://coolcode.ca`. Keep `workers_dev: false`; add the dedicated hostname as a custom-domain route. Example `routes: [{"pattern":"platesolve-api.coolcode.ca","custom_domain":true}]` only after that hostname and its Access policy are ready. The adapter fails closed until issuer, audience and owner are configured.
3. In the adapter directory run `npx wrangler secret put ASTROMETRY_API_KEY`, entering your key at the prompt. GitHub Actions secrets do not automatically transfer to Workers. Then `npx wrangler deploy`. Never put the key in JSON, frontend config or source control.
4. Configure Access CORS to allow `https://coolcode.ca`, credentials, methods GET/POST/OPTIONS and Content-Type. Allow unauthenticated **OPTIONS preflight only** to reach the Worker; its preflight handler permits no API data. Requests still require a signed Access JWT. Log in by opening the adapter hostname in a top-level browser tab; then return to Plate Solve Lab. A same-site custom hostname helps avoid third-party-cookie restrictions.
5. Set `web/config.json` `adapterUrl` to `https://platesolve-api.coolcode.ca`, commit, rebuild. The existing-job form now fetches through the adapter and the local-file upload panel appears. It accepts JPEG, PNG or FITS up to 10 MB, explicit submission consent, optional field-width bounds, and resumable bounded polling. If auth expires, reopen owner sign-in and retry.

Deployment guidance follows [Cloudflare Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) and [custom domain configuration](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/). Logs and sampled traces are enabled, with no custom logging of image data, API keys or sessions.

The Worker independently validates RS256 signature, issuer, audience, expiry and exact owner email against Cloudflare Access signing keys, rejects other origins, exposes only fixed Astrometry routes, caps file/response size, and never returns sessions or API keys. It does not fetch arbitrary destinations itself or offer an open proxy. No malware/sample-file downloads or local execution are involved. Do not remove Access authentication to make this an anonymous shared-key service. A multi-user service needs per-user account handling and explicit quota management.

## Expand and run

- `web/config.json`: adapter URL, workflow URL, example receipt path, upload limit (maximum 10 MB), poll interval/count. Nothing requires a fixed celestial-object list.
- Any valid successful Astrometry job can become a receipt. Import up to 100 at once and retain up to 300 per tab. JSON imports are validated, external text uses textContent, and links are derived only from numeric IDs.
- `scripts/solve.py --job-id 1493115` exports an existing public solve with no key needed. `--check-key` validates the environment secret only. `--image-url` requires the secret; use the consent-aware workflow for regular owner use.
- Optional CLI bounds: `--lower 1 --upper 3`; `--submission-id` resumes a job; `--output` changes the receipt output directory.

## Checks and publication

```
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -v
python3 scripts/build.py
```

GitHub Pages CI runs those checks plus a Chromium smoke test at a project subpath, screenshots, import/comparison/export and mobile overflow checks. Browser tests mock external API calls; they never submit photos or need secrets. `dist/`, receipt artifacts and source images are not committed. Pages deploys from main; no CNAME file is used. No scheduled scan or image upload is configured.
