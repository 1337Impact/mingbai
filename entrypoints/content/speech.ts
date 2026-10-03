/** Reads Chinese text aloud with the browser's built-in text-to-speech. */
export function speak(text: string): void {
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 0.9;
  const voices = speechSynthesis.getVoices();
  const lang = (voice: SpeechSynthesisVoice) => voice.lang.replace('_', '-');
  const voice =
    voices.find((v) => lang(v) === 'zh-CN') ?? voices.find((v) => lang(v).startsWith('zh'));
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  speechSynthesis.cancel();
}
