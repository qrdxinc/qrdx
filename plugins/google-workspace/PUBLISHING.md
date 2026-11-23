# Publishing the add-on

The owner's steps, in order, to get the add-on from this folder onto the Google Workspace Marketplace. All of it happens under the Google account that owns the Cloud project `qrdx-491208` (the owner's second Google account). Nothing here has been done yet.

Two reviews stand between a test deployment and a public listing: Google's **OAuth verification** (because `script.external_request` is a sensitive scope; Google says up to 10 days) and the **Marketplace review** of the listing. Until OAuth verification passes, people who install it see an "unverified app" screen, and the add-on can take at most 100 new users in total.

## 1. Turn on the Apps Script API for the account

https://script.google.com/home/usersettings → Google Apps Script API: On. clasp needs it.

## 2. Create the Apps Script project and push the code

1. At https://script.google.com, **New project**. Rename it "QRdx – QR Code Generator".
2. **Project Settings** → copy the **Script ID**.
3. On your machine:

   ```bash
   cd plugins/google-workspace
   bunx @google/clasp login                # sign in with the account that owns qrdx-491208
   cp .clasp.example.json .clasp.json      # paste the Script ID into "scriptId"
   bunx @google/clasp push --force         # replaces the default manifest with src/appsscript.json
   ```

4. In the editor, **Project Settings** → tick **Show "appsscript.json" manifest file in editor** and check it's ours (four scopes, `urlFetchWhitelist`, the name "QRdx – QR Code Generator").

## 3. Configure the OAuth consent screen in qrdx-491208

Google Cloud console → project `qrdx-491208` → Google Auth Platform (the OAuth consent screen).

- **Branding:** app name `QRdx – QR Code Generator` (the same as the manifest and the listing); user support email (the console offers the signed-in account and Google Groups it manages); logo `assets/icon-128.png` (uploading a logo starts brand verification); home page `https://qrdx.dev`; privacy policy `https://qrdx.dev/legal/privacy-policy`; terms `https://qrdx.dev/legal/terms-of-service`; authorized domain `qrdx.dev`; developer contact email.
- **Audience:** External. Leave it in **Testing** for now and add your own Google accounts as test users.
- **Data access:** add exactly the manifest's four scopes:
  - `https://www.googleapis.com/auth/documents.currentonly`
  - `https://www.googleapis.com/auth/presentations.currentonly`
  - `https://www.googleapis.com/auth/spreadsheets.currentonly`
  - `https://www.googleapis.com/auth/script.external_request` (listed as sensitive)

The scope lists in the manifest, the consent screen and the Marketplace SDK (step 7) must be identical. Another developer reported a Marketplace rejection in October 2026 because they weren't, and that the Marketplace SDK added `userinfo.email` and `userinfo.profile` on its own. If it does that here, check whether it lets you remove them; if not, add the same two to `src/appsscript.json`, the consent screen and the README's scope table and privacy notes, then push again.

## 4. Link the Apps Script project to qrdx-491208

Cloud console → project `qrdx-491208` → the dashboard shows the **project number** (digits, not the id). Apps Script editor → **Project Settings** → **Google Cloud Platform (GCP) Project** → **Change project** → paste the number. Apps Script asks for the consent screen to exist first, which is why step 3 comes before this.

## 5. Check the domain in Search Console

OAuth verification wants `qrdx.dev` verified in Google Search Console by an account that is an Owner or Editor of `qrdx-491208`. The domain property `sc-domain:qrdx.dev` exists; make sure the account from step 1 is a verified owner on it (Search Console → Settings → Users and permissions), or add it.

## 6. Test deployment and the manual test plan

Apps Script editor → **Deploy** → **Test deployments** → **Install**. Open a Doc, a Sheet and a presentation; QRdx appears in the side panel on the right. Run the [manual test plan](README.md#manual-test-plan) in all three. Then take the screenshots `listing.md` lists, at 1280 × 800.

If anything in the plan fails, stop here and send the failure back; the code may need a change before a versioned deployment.

## 7. Versioned deployment and the Marketplace SDK

1. Apps Script editor → **Deploy** → **New deployment** → type **Add-on**, description "1" → **Deploy**. Copy the **Deployment ID**. (A versioned deployment needs `urlFetchWhitelist`, which the manifest has.)
2. Cloud console → APIs & Services → enable **Google Workspace Marketplace SDK** (the SDK, not the API).
3. Marketplace SDK → **App Configuration**:
   - **App visibility:** Public. This can't be changed after you save it.
   - **Installation settings:** Individual + Admin install.
   - **App integration:** Google Workspace add-on → deploy with the Apps Script **Deployment ID** from 1.
   - **OAuth scopes:** the same four as step 3.
   - **Developer information:** developer name, website `https://qrdx.dev`, email `support@qrdx.dev`, and the trader status question (the EU's Digital Services Act asks; a trader must give a postal address). That answer is yours to make.
4. Marketplace SDK → **Store Listing:** fill it from [listing.md](listing.md): name, short and detailed description, category, icons and banner from `assets/`, the screenshots from step 6, and the support, privacy and terms links.

## 8. Before submitting: the privacy policy and the home page

OAuth verification checks that the privacy policy, on the same domain as the home page and linked from it, says how the app accesses, uses, stores or shares Google user data, and that the home page describes the app. Two changes on qrdx.dev, each a pull request of its own:

1. **Privacy policy:** add a section like the draft below to `apps/app/content/legal/privacy-policy.mdx` (under "API, CLI and MCP server" or as its own heading), with a line in its Changes list. Review the wording yourself; it goes live as written.
2. **Home page:** add the add-on to qrdx.dev/plugins (`apps/app/app/[lang]/(home)/plugins/plugin-data.ts`), saying it's in review until the listing is live, and use that page as the consent screen's home page if the reviewer asks for one about the add-on.

Draft privacy section:

> ### Google Docs, Sheets and Slides add-on
>
> The QRdx add-on for Google Docs, Sheets and Slides asks Google for access to the file it's open in (`documents.currentonly`, `spreadsheets.currentonly`, `presentations.currentonly`) and to connect to an external service (`script.external_request`), which it uses only to reach QRdx's image API. From your file it reads only where to put a code: the cursor in Docs, the current slide in Slides, the current cell or the selected cells in Sheets, and, before adding formulas, whether the cells next to your selection are empty. It doesn't read your file's text or send anything from your file to us.
>
> What you type into the add-on's side panel to make a code (a link, text, a Wi-Fi network's name and password, email fields or a phone number) is sent to our image API in the request's address, from Google's servers, to draw the code. We don't store it in a database; like any web address, it can appear in our host's request logs and caches. The add-on saves the image in your file. If you add `=IMAGE()` formulas in Sheets, Google Sheets requests each code from our image API with that cell's text in the address.
>
> The add-on stores nothing, keeps no logs, has no analytics and doesn't connect to a QRdx account. We use the Google user data it receives only to place the codes you ask for. We don't sell it, share it, use it for advertising or use it to train AI models. QRdx's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## 9. OAuth verification

Google Auth Platform → **Audience** → **Publish app** (to "In production"), then the **Verification Center** → submit. Have ready:

- **A demo video** on YouTube, unlisted, in English: the consent screen showing the app name "QRdx – QR Code Generator", the browser's address bar showing the OAuth client id during consent, and each scope in use: inserting a code in Docs, in Slides and in Sheets (the three `currentonly` scopes) and the image arriving from `api.qrdx.dev` (Preview is the clearest view of `script.external_request`).
- **Scope justifications**, for example:
  - `script.external_request`: "The add-on fetches the QR code image (a PNG) from QRdx's own image API at https://api.qrdx.dev/v1/qr, limited to that address by urlFetchWhitelist, and inserts it into the open file. Google Docs inserts images only from a blob, and a blob from another site can only be fetched with UrlFetchApp, so no narrower scope works. It makes no other requests."
  - `documents.currentonly`, `spreadsheets.currentonly`, `presentations.currentonly` (not sensitive, but the form may ask): "Insert the code into the file the add-on is open in: at the cursor in Docs, on the current slide in Slides, over the current cell or as =IMAGE() formulas next to the selected cells in Sheets. These are the narrowest scopes for each editor."
- The privacy policy section from step 8, live.

Brand verification usually takes minutes; sensitive scope verification, Google says, up to 10 days. Don't change the app name, logo or links while it runs.

## 10. Submit the listing

Marketplace SDK → **Store Listing** → **Publish**. A public listing goes to Google's review. Once it's approved:

- Note the listing URL in the README (replace "It isn't on the Google Workspace Marketplace yet"), and add it to qrdx.dev/plugins and to the Sheets section of the Google Chart API docs page.
- Each later change: `clasp push`, then **Deploy** → **Manage deployments** → edit the deployment to a new version. The Deployment ID stays the same, so the Marketplace listing follows it. A change of scopes goes through OAuth verification again, and the scope lists in step 3 and step 7 must change with it.
