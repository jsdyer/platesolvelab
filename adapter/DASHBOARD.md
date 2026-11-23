# Owner photo uploads using only the Cloudflare dashboard

The quickest first test uses the Worker's own **workers.dev** address. You do not need to move DNS, add a CNAME, install Wrangler, expose an API key to the public site, or configure cross-origin cookies.

The Worker includes a sign-in-protected upload page. Open that page directly, submit a photo, download its receipt, and import it into [Plate Solve Lab](https://coolcode.ca/platesolvelab/). The public viewer remains available to everyone; your upload service is owner-only.

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

For an explicit owner-only sign-in policy, open **Zero Trust → Access controls → Applications**, edit the application created for `platesolvelab-owner`, and set an **Allow** policy whose **Include → Emails** rule is your exact owner email. Use that same email for `OWNER_EMAIL` below. The adapter also checks this exact email independently, so another account member cannot use your Astrometry key.

In that Access application's **Additional settings**, copy its **Application Audience (AUD) Tag**. This is configuration, not an API key. Find your team's `YOUR-TEAM.cloudflareaccess.com` domain in Zero Trust settings; do not include `https://` in `CF_ACCESS_TEAM_DOMAIN`.

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

1. Open the `workers.dev` address in a normal top-level browser tab. Sign in through Access as the owner.
2. The **Owner connection** page should appear. Under **Existing solved job ID**, enter **1493115** and choose **Read existing job**. You should get the real Leo Triplet calibration. This proves routing/authentication/result retrieval without uploading anything.
3. Under **Upload a sky photograph**, choose your JPEG, PNG or FITS file (up to 10 MB), or provide one public HTTPS image URL. Use a photograph with a recognizable star field, and leave width bounds blank unless you know them.
4. Confirm your permission to send it to Astrometry.net, then **Upload and solve**. The code sends non-public visibility and disallows commercial reuse/modifications. Those provider settings are not a confidentiality guarantee.
5. Keep the returned submission ID. If the page finishes its bounded wait before solving completes, use **Check submission** later; that never reuploads the photo.
6. When solved, **Download receipt JSON**. Open CoolCode's Plate Solve Lab and **Import receipt JSON**. Your image is not committed to GitHub, and neither this portal nor its metadata download publishes a public capture.

No CORS configuration or `web/config.json` edit is needed for this direct owner-portal flow: the page and API share the same origin. Keep public `adapterUrl` empty until an authenticated cross-origin connection is deliberately configured and tested.

## Optional: a custom API hostname later

A CNAME from `platesolve-api.coolcode.ca` to `coolcode.ca` only aliases the existing website; it does not deploy or route a Worker. It is not needed for the workers.dev test.

Cloudflare Workers **Custom Domains** require an active zone in the same Cloudflare account. Do not migrate working DNS merely to test this tool. If your zone is eligible later:

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
