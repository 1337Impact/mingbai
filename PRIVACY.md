# Privacy policy

Mingbai 明白 is a browser extension that translates Chinese text you select. It has no server of its own, and its developer receives no data from it.

## What the extension handles

- **Text you choose to translate or listen to.** When you click the Mingbai button or the listen button, the selected text is sent to the API you configured in settings (by default Google's Gemini API), using your own API key. It is sent nowhere else. Mingbai does not read or send page content you have not selected and asked it to translate.
- **Your API URL, API key and model names.** These are stored in this browser's extension storage and are sent only to the API you configured, to authenticate your requests.
- **Saved words and recent translations.** These are stored in this browser's extension storage so that saved words can be listed and repeated translations load instantly. They never leave your browser unless you export them yourself.

## What the extension does not do

- No analytics, tracking or advertising.
- No selling or sharing of data with anyone.
- No accounts.

## The API provider

Text sent for translation is handled by the API provider you chose, under that provider's own terms and privacy policy. For the default setup these are the [Gemini API terms](https://ai.google.dev/gemini-api/terms). On Gemini's free tier, Google may use what you send to improve its products.

## Removing your data

Uninstalling the extension deletes everything it stored. You can also remove saved words on the settings page.

## Contact

Questions and reports: [open an issue](https://github.com/1337Impact/mingbai/issues).
