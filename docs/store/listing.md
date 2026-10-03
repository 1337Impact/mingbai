# Chrome Web Store listing

Everything to paste into the [developer dashboard](https://chrome.google.com/webstore/devconsole). Upload `.output/mingbai-0.1.1-chrome.zip` first (`npm run zip`); the name, summary and icon are read from it.

## Store listing

**Description**

```
Mingbai 明白 helps you read Chinese on any web page. Select some Chinese text, click the cat button that appears next to it, and read it with:

• Pinyin above every word. The text is split into real words, not single characters.
• An English translation of each sentence.
• The meaning of any word you press, with its HSK level.
• Audio: listen to a word or a sentence, read slowly and clearly.
• Saved words, which you can export as a CSV file (for example to import into Anki).
• Copy buttons for the word or the translation.

It also works on text inside comment sections and other embedded components, such as Bilibili comments.

FREE TO USE
Mingbai runs on your own API key, and the default setup uses Google's Gemini API, which has a free tier. Get a free key from Google AI Studio, paste it into the settings page that opens after installing, and click "Save and test".

ANY OPENAI-COMPATIBLE API
You can point Mingbai at any OpenAI-compatible chat completions API instead: OpenRouter, OpenAI, or a local server such as Ollama or LM Studio. Set the API URL, key and model ID in settings.

PRIVACY
The text you choose to translate is sent to the API you configured, and nowhere else. Your API key, saved words and cached translations stay in your browser. There are no analytics and no accounts.

OPEN SOURCE
MIT licensed. Source code and issues: https://github.com/1337Impact/mingbai
```

- **Category:** Education
- **Language:** English
- **Store icon:** `public/icon/128.png`
- **Screenshots (1280x800):** `1-word.jpg`, `2-sentence.jpg`, `3-select.jpg`, `4-settings.jpg` in this folder
- **Small promo tile (440x280):** `promo-440x280.jpg`
- **Homepage URL:** https://github.com/1337Impact/mingbai
- **Support URL:** https://github.com/1337Impact/mingbai/issues

## Privacy practices

**Single purpose**

```
Mingbai translates Chinese text that the user selects on a web page into English, showing pinyin, per-word meanings and a sentence translation in a popup next to the selection.
```

**Justification for `storage`**

```
Stores the user's settings (API URL, API key and model names), the words the user saves, and a small cache of recent translations. Everything is kept locally in chrome.storage.local.
```

**Justification for host permissions**

```
The content script runs on all pages because the user can select Chinese text on any website. It only detects a text selection containing Chinese characters and shows a button next to it; text is sent for translation only after the user clicks that button.

The optional host permissions are requested at runtime for one host only: the API the user enters in settings. The user can choose any OpenAI-compatible API, including a local server, so the host is not known in advance.
```

**Remote code:** No, I am not using remote code. All JavaScript is bundled in the package.

**Data usage** — tick:

- *Website content*: the text the user selects is sent to the API the user configured.
- *Authentication information*: the user's own API key is stored locally and sent only to that API.

Then tick all three certifications (no selling data, no unrelated use, no creditworthiness use).

**Privacy policy URL:** https://github.com/1337Impact/mingbai/blob/main/PRIVACY.md

## Distribution

- **Payments:** Free of charge
- **Visibility:** Public
- **Regions:** All regions

## Notes

- Because the content script matches all URLs, review can take longer than usual.
- Before submitting, the account needs a verified contact email (Account tab in the dashboard).
