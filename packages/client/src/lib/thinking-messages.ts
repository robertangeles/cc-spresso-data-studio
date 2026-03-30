import { useState, useEffect } from 'react';

export const THINKING_MESSAGES = [
  // Espresso shots
  'Pulling a fresh shot...',
  'Grinding the beans...',
  'Tamping down...',
  'Extracting the good stuff...',
  'Steaming the milk...',
  'Double shot incoming...',
  'No drip. Just flow.',
  'Dialing in the grind...',
  'Crema forming...',
  'Precise input. Concentrated output.',
  'One idea in. Twelve out.',
  'Heating the group head...',
  'Filtering the noise...',
  'Packing it tight...',
  'Almost ready. No rush. Actually, rush.',
  // Fast content
  'Writing faster than you think...',
  'Cutting the fluff...',
  'No filler. Just signal.',
  'Sharpening every word...',
  'Killing your darlings for you...',
  'Making it punch...',
  'Trimming the fat...',
  'Finding the hook...',
  'Nailing the angle...',
  'Building the argument...',
  'Connecting dots at speed...',
  'Locking the thesis...',
  'Sourcing the proof...',
  'Tightening the arc...',
  'Earning every sentence...',
  // Cheeky
  'Better than your last draft...',
  'Doing in seconds what took you hours...',
  'Your content hamster wheel stops here.',
  'No meetings required for this one.',
  'Skipping the committee review...',
  'This would take an agency three weeks.',
  'Already better than most LinkedIn posts.',
  'No "synergy" in this output. Promise.',
  'Faster than your coffee is cooling...',
  "Content that doesn't die in tabs.",
  // Momentum
  'Momentum loading...',
  'Zero to published...',
  'From blank page to done...',
  'The hard part is over. You showed up.',
  'Drop the idea. We handle the rest.',
  "One idea. Multiple channels. Let's go.",
  'Creating assets, not busywork.',
  "Your audience won't wait. Neither do we.",
  'Ship it before lunch.',
  'Almost there. Stay caffeinated.',
];

export function useThinkingMessage(isActive: boolean) {
  const [messageIndex, setMessageIndex] = useState(() =>
    Math.floor(Math.random() * THINKING_MESSAGES.length),
  );

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % THINKING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isActive]);

  return THINKING_MESSAGES[messageIndex];
}
