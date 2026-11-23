# Owner photo uploads using only the Cloudflare dashboard

The current owner portal is [https://platesolve-api.hackme.ca/](https://platesolve-api.hackme.ca/), linked from Plate Solve Lab in a separate tab. Sign in there, upload and solve, then download the receipt and import it into the public viewer. The public link uses `web/config.json` → `ownerPortalUrl`; `adapterUrl` remains empty. No additional DNS or cross-origin setup is required to use this linked portal.

For a fresh deployment, the quickest first test uses the Worker's own **workers.dev** address. You do not need to move DNS, add a CNAME, install Wrangler, expose an API key to the public site, or configure cross-origin cookies.

The Worker includes a sign-in-protected upload page. Open that page directly, submit a photo, download its receipt, and import it into [Plate Solve Lab](https://coolcode.ca/platesolvelab/). The public viewer remains available to everyone; your upload service is owner-only.

GitHub Pages publishes the viewer's HTML, CSS and JavaScript. The browser runs its receipt display and comparison code, but Pages cannot run a private API handler or keep an API key secret from visitors. The Cloudflare Worker supplies that server-side handler: after your Access sign-in, it uses the stored Astrometry key to submit a photo and retrieve the result. Astrometry.net performs the plate solving. The Worker is an additional part of the tool, not a replacement for its GitHub Pages website.

## 1. Create the dedicated Worker

Open **Cloudflare dashboard → Workers & Pages → Create application → Create Worker** (a Hello World starter is sufficient). Name it **`platesolvelab-owner`**, then select **Deploy**. Open **Edit code**.

Replace the starter's entire JavaScript with [worker-dashboard.mjs](worker-dashboard.mjs), then **Save and deploy**. Use this generated single file, not `worker.mjs`, which imports other project modules. No secrets are included in either file. The code refuses API calls until its owner Access settings are configured.

Keep the generated `workers.dev` address enabled. It will look like:

```
https://platesolvelab-owner.YOUR-WORKERS-SUBDOMAIN.workers.dev/
```

You can copy the exact address from this Worker's **Settings → Domains & Routes**. Change settings for this dedicated Worker only; your existing CoolCode router needs no edits.

## 2. Protect this Worker with Access

On **this Worker's Access tab**, select **Protect this Worker behind Access**, choose **All traffic** (production and previews), choose **Cloudflare account** for the initial authentication policy, and select **Apply Access**. This is the single-Worker setting; do not use the account-wide Protect all Workers setting.

The Worker's quick Access dialog offers broad account/domain choices. To allow one exact email, use the full **Zero Trust** policy editor:

1. Open **Zero Trust → Access controls → Policies → Add a policy**. Name it `Plate Solve owner` and choose **Action: Allow**.
2. Under **Rules**, add **Include → Emails**, and enter your full owner email. Choose **Emails**, not **Emails ending in** or **Email domain**.
3. Save the policy. Open **Access controls → Applications**, edit the **current** application protecting `platesolvelab-owner` (usually named `platesolvelab-owner - Cloudflare Workers`), and open **Policies**.
4. Attach the `Plate Solve owner` policy. Remove the broader `gmail.com`/email-domain or account-wide Allow policy from **this application's policy list**. Do not delete a shared policy used by other applications. Include rules and separate Allow policies can grant access independently; merely adding your exact email beside an existing Gmail-domain allowance does not narrow that allowance.
5. Save the application. Use the same exact email for `OWNER_EMAIL` below. The adapter also checks this email independently.

After completing this Access setup, open **this current application's Additional settings** and copy its **Application Audience (AUD) Tag** into `CF_ACCESS_AUD`. Copy the AUD value, not the application UUID or policy ID. If the application was recreated or replaced while configuring Access, an AUD copied from the older application will no longer match. This is configuration, not an API key. Find your team's `YOUR-TEAM.cloudflareaccess.com` domain in Zero Trust settings; do not include `https://` in `CF_ACCESS_TEAM_DOMAIN`.

If you prefer creating Access manually: **Zero Trust → Access controls → Applications → Create new application → Self-hosted and private**, select this Worker as the protected destination, and attach the same exact-email Allow policy. A hostname-specific application for its exact `workers.dev` hostname also works, but then every additional hostname needs equivalent protection.

## 3. Add four text settings and one secret

Open **Workers & Pages → platesolvelab-owner → Settings → Variables and Secrets → Add**.

| Type | Name | Value |
| --- | --- | --- |
| Text | `ALLOWED_ORIGIN` | `https://coolcode.ca` |
| Text | `CF_ACCESS_TEAM_DOMAIN` | Your existing `YOUR-TEAM.cloudflareaccess.com` domain, without `https://` |
| Text | `CF_ACCESS_AUD` | The new Access application's Application Audience (AUD) Tag |
| Text | `OWNER_EMAIL` | The exact email allowed in step 2 |
| **Secret** | `ASTROMETRY_API_KEY` | Your Astrometry.net API key |

Select **Deploy** to apply these bindings. GitHub Actions secrets do not transfer to Cloudflare: enter your saved key again into this Worker's Secret field. Do not put it into the code editor or a Text binding.

## 4. Run the first check and upload

1. Select **Deploy** after saving code and bindings, then open the production `workers.dev` address using **Visit** in a normal top-level browser tab. Sign in through Access as the owner. Test the deployed site, not an older editor-preview tab or an undeployed draft.
2. The **Owner connection** page should appear. Under **Existing solved job ID**, enter **1493115** and choose **Read existing job**. You should get the real Leo Triplet calibration. This proves routing/authentication/result retrieval without uploading anything.
3. Under **Upload a sky photograph**, choose your JPEG, PNG or FITS file (up to 10 MB), or provide one public HTTPS image URL. Use a photograph with a recognizable star field, and leave width bounds blank unless you know them.
4. Confirm your permission to send it to Astrometry.net, then **Upload and solve**. The code sends non-public visibility and disallows commercial reuse/modifications. Those provider settings are not a confidentiality guarantee.
5. Keep the returned submission ID. If the page finishes its bounded wait before solving completes, use **Check submission** later; that never reuploads the photo.
6. When solved, **Download receipt JSON**. Open CoolCode's Plate Solve Lab and **Import receipt JSON**. Your image is not committed to GitHub, and neither this portal nor its metadata download publishes a public capture.

No CORS configuration or `web/config.json` edit is needed for this direct owner-portal flow: the page and API share the same origin. Keep public `adapterUrl` empty until an authenticated cross-origin connection is deliberately configured and tested.

## Troubleshooting sign-in and upload setup

### Email login succeeds, then the page says “Access identity is not authorized for this owner adapter.”

The Access sign-in succeeded, but the adapter rejected the application's identity claims. This happens before the Astrometry API key is used.

1. In **Zero Trust → Access controls → Applications**, open the current application that protects this Worker. Copy **Additional settings → Application Audience (AUD) Tag** again.
2. In **Workers & Pages → platesolvelab-owner → Settings → Variables and Secrets**, replace **`CF_ACCESS_AUD`** with that current AUD, with no surrounding quotes or spaces. Check `CF_ACCESS_TEAM_DOMAIN` and `OWNER_EMAIL` against the same organization and signed-in owner.
3. Select **Deploy** so the production Worker receives the new binding. Reopen its production **Visit** URL. If an old Access session remains after changing the application, sign out at `https://YOUR-WORKER-HOSTNAME/cdn-cgi/access/logout`, then sign in again.

Worker-level Access still uses an Access application audience. There is no separate Astrometry audience or special Worker API key to enter here. Creating a new Access application instead of editing the existing one can change the AUD.

### The Astrometry key was added as a Text variable

Replace **`ASTROMETRY_API_KEY`** with a binding of type **Secret**, using the same name. If the editor cannot change the binding's type, remove the Text entry and add it again as **Secret**, then **Deploy**. The Worker receives both binding types through `env`, so storing it as Text does not explain the Access-identity error; the difference is that a Secret's saved value is hidden from the Dashboard and Wrangler.

Use your existing Astrometry key for the **Secret** binding. Astrometry's published API documentation does not describe a self-service key-reset operation, and its published profile-editing code excludes the API key from editable fields. Do not assume there is a regeneration button or that you must create a new account. If a key replacement is needed, ask the Astrometry maintainers through the [official support forum](https://groups.google.com/g/astrometry) how they can reset your account's key; never post the key there. If they issue a replacement, update both the Worker Secret and GitHub Actions secret.

### The editor warns about file types or an upload fails validation

Replace the entire editor contents with the latest [worker-dashboard.mjs](worker-dashboard.mjs) and **Deploy**. The generated bundle includes the current upload type checks and all required modules; do not patch isolated lines from older versions into it. Editor file/type warnings and upload validation are separate from an Access-audience mismatch. First confirm the production page opens and **Read existing job** works, then test a photo upload.

### Sign-in works, but both reading a job and uploading return a generic error

Deploy the latest complete [worker-dashboard.mjs](worker-dashboard.mjs), then reopen the production **Visit** URL and retry **Read existing job** with `1493115`. An earlier adapter used `redirect: "error"` for provider requests. Cloudflare Workers does not support that option and throws before sending a request; the updated adapter uses `manual` and rejects redirect responses explicitly. This runtime error does not mean your Astrometry key is wrong, and reading an existing public job does not use that key. If reading works but an upload fails, retain the displayed error or submission ID to distinguish a provider rejection from a still-pending solve.

## Optional: a custom API hostname later

A CNAME from `platesolve-api.coolcode.ca` to `coolcode.ca` only aliases the existing website; it does not deploy or route a Worker. It is not needed for the workers.dev test.

Cloudflare Workers **Custom Domains** require an active zone in the same Cloudflare account. A domain whose authoritative DNS remains at CanSpace is not made eligible by creating an ordinary CNAME to `coolcode.ca` or to a `workers.dev` address. Keep using the protected `workers.dev` upload page for now; no DNS migration is needed. Cloudflare's CNAME/partial-zone setup can retain an external DNS provider, but is a separate Business/Enterprise feature, not a basic CNAME edit. If your zone is deliberately made eligible later:

1. Remove the conflicting CNAME at **only** `platesolve-api.coolcode.ca` immediately before configuring the new custom domain. Do not alter the main site's DNS records.
2. In this Worker, open **Settings → Domains & Routes → Add → Custom Domain**, enter `platesolve-api.coolcode.ca`, and add it. Cloudflare creates the associated DNS record and certificate. Keep Access protection on the entire Worker.
3. The top-level owner page works at the custom hostname with no CORS change. To use the upload form embedded in the public CoolCode viewer as well, edit the Access application's **Advanced settings → Cross-Origin Resource Sharing (CORS) settings**, then enable **Bypass OPTIONS requests to origin**. This forwards unauthenticated preflight only; GET/POST still need owner authentication. The Worker already sends exact-origin credentialed CORS headers, permits GET/POST/OPTIONS and Content-Type, and rejects other origins. Do not create a Bypass policy for all traffic.
4. Sign in by visiting the adapter hostname directly. Confirm `GET /api/job/1493115` works there and that the public viewer's credentialed request succeeds. Then set `web/config.json` `adapterUrl` to `https://platesolve-api.coolcode.ca` and publish the viewer.

## Updating the code

Edit `adapter/worker.mjs`, `adapter/owner-page.mjs` or `web/model.mjs`, then regenerate the paste-ready file with `python3 scripts/build_adapter.py`. Tests verify the generated file matches its inputs. Dashboard deploys use the generated file; Wrangler deploys use the source modules. With Wrangler, keep `workers_dev` enabled for the first-test portal, configure Access and bindings, and use the secret prompt as documented in the main README.

## Official references

- [Create and edit a Worker in the dashboard](https://developers.cloudflare.com/cloudflare-one/tutorials/access-workers/)
- [Protect one Worker with Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/#protect-one-worker)
- [workers.dev routing and Access](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Add secrets](https://developers.cloudflare.com/workers/configuration/secrets/#via-the-dashboard)
- [Add text variables](https://developers.cloudflare.com/workers/configuration/environment-variables/#add-environment-variables-via-the-dashboard)
- [Access preflight settings](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/#bypass-options-requests-to-origin)
- [Custom Domain prerequisites](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Exact-email policy selectors](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/#cloudflare-access-selectors)
- [Manage and attach Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/policy-management/)
- [Partial DNS setup availability](https://developers.cloudflare.com/dns/zone-setups/partial-setup/)
- [GitHub Pages serves static site files](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Workers supported request redirect modes](https://developers.cloudflare.com/workers/runtime-apis/request/#parameters)
- [Astrometry API documentation](https://astrometry.net/doc/net/api.html)
- [Astrometry profile-editing source](https://github.com/dstndstn/astrometry.net/blob/main/net/views/user.py)
