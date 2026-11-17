# Member survey → Google Sheet

`/survey` (survey.html) posts to the Pages Function `functions/api/survey.js`, which forwards
each anonymous response to the Apps Script in `Code.gs`. The script appends a row to the
responses Sheet and saves any uploaded picture to a Drive folder beside the Sheet, with a link
in the last column.

## One-off set-up

1. Open the responses Sheet in Google Drive, then **Extensions → Apps Script**.
2. Replace the contents of `Code.gs` with the `Code.gs` in this folder and save.
3. Choose the `setup` function in the toolbar and click **Run**. Approve the permissions
   (Sheets and Drive). The execution log prints a `SURVEY_SECRET` – copy it.
4. **Deploy → New deployment → Web app**. Execute as: **Me**. Who has access: **Anyone**.
   Deploy and copy the web app URL (it ends in `/exec`).
5. In Cloudflare: **Workers & Pages → kentishtownvegbox → Settings → Variables and Secrets**,
   add (as secrets, for Production):
   - `SURVEY_SCRIPT_URL` – the web app URL
   - `SURVEY_SECRET` – the secret from step 3
6. Redeploy the site, then send a test response from `/survey` and check the Sheet.

If you later edit `Code.gs`, use **Deploy → Manage deployments → Edit → New version** so the
URL stays the same.

## Changing the questions

Field names in `survey.html` must match the `COLUMNS` list in `functions/api/survey.js`;
the column headings are taken from that list the first time a response arrives. If you change
columns after responses have come in, clear or rename the `Responses` tab first.

## After the analysis

The survey promises that data is deleted once analysis is complete: delete the Sheet, the
photos folder, and remove the two Cloudflare secrets to switch the form off.
