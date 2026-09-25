export type ComfortAction = "lullaby" | "voice" | "stop";
let context: AudioContext | null = null;
let channel: GainNode | null = null;
export function playLocalComfort(action: ComfortAction) {
  speechSynthesis.cancel();
  if (channel) channel.gain.value = 0;
  if (action === "stop") return;
  if (action === "voice") {
    const phrase = new SpeechSynthesisUtterance("I'm here with you. You're safe. I'll check on you now.");
    phrase.volume = .55; phrase.rate = .85;
    speechSynthesis.speak(phrase);
    return;
  }
  context ??= new AudioContext();
  void context.resume();
  channel = context.createGain(); channel.gain.value = .12; channel.connect(context.destination);
  [392, 440, 392, 330, 349, 392, 330, 294, 330, 349, 294, 262].forEach((frequency, index) => {
    const tone = context!.createOscillator(); const envelope = context!.createGain();
    const start = context!.currentTime + index * .5;
    tone.type = "sine"; tone.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(.16, start + .04);
    envelope.gain.exponentialRampToValueAtTime(.001, start + .47);
    tone.connect(envelope); envelope.connect(channel!);
    tone.start(start); tone.stop(start + .5);
  });
}
