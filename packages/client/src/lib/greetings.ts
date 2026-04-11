/** Random multilingual greetings for empty states */

interface Greeting {
  text: string;
  language: string;
  country: string;
}

const GREETINGS: Greeting[] = [
  { text: 'Hello', language: 'English', country: 'United Kingdom' },
  { text: 'Hola', language: 'Spanish', country: 'Spain' },
  { text: 'Bonjour', language: 'French', country: 'France' },
  { text: 'Ciao', language: 'Italian', country: 'Italy' },
  { text: 'Hallo', language: 'German', country: 'Germany' },
  { text: 'Olá', language: 'Portuguese', country: 'Brazil' },
  { text: 'Merhaba', language: 'Turkish', country: 'Turkey' },
  { text: 'Namaste', language: 'Hindi', country: 'India' },
  { text: 'Salam', language: 'Arabic', country: 'UAE' },
  { text: 'Sawubona', language: 'Zulu', country: 'South Africa' },
  { text: 'Kamusta', language: 'Filipino', country: 'Philippines' },
  { text: 'Jambo', language: 'Swahili', country: 'Kenya' },
  { text: 'Sawasdee', language: 'Thai', country: 'Thailand' },
  { text: 'Annyeong', language: 'Korean', country: 'South Korea' },
  { text: 'Konnichiwa', language: 'Japanese', country: 'Japan' },
  { text: 'Nǐ hǎo', language: 'Mandarin', country: 'China' },
  { text: 'Xin chào', language: 'Vietnamese', country: 'Vietnam' },
  { text: 'Shalom', language: 'Hebrew', country: 'Israel' },
  { text: 'Hej', language: 'Swedish', country: 'Sweden' },
  { text: 'Cześć', language: 'Polish', country: 'Poland' },
  { text: 'Ahoj', language: 'Czech', country: 'Czech Republic' },
  { text: 'Szia', language: 'Hungarian', country: 'Hungary' },
  { text: 'Buna', language: 'Romanian', country: 'Romania' },
  { text: 'Selamat', language: 'Malay', country: 'Malaysia' },
  { text: 'Habari', language: 'Swahili', country: 'Tanzania' },
  { text: 'Talofa', language: 'Samoan', country: 'Samoa' },
  { text: 'Kia ora', language: 'Māori', country: 'New Zealand' },
  { text: "G'day", language: 'Australian English', country: 'Australia' },
  { text: 'Barev', language: 'Armenian', country: 'Armenia' },
  { text: 'Gamarjoba', language: 'Georgian', country: 'Georgia' },
];

/** Get a random greeting, different each page load */
export function getRandomGreeting(): Greeting {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
}
