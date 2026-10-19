import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const { GROQ_API_KEY, ELEVENLABS_API_KEY } = process.env;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
const SORRY = 'معذرت، ہم اس سوال کا جواب نہیں دے سکتے۔';

const SYSTEM_PROMPT = `You are the voice assistant of Superior School, Bhakkar.
You may answer ONLY from these facts:
- Fees: first year is 50,000 rupees. Second year is 100,000 rupees.
- First year teachers: Sir Fakhar and Sir Ali.
- Second year teachers: Sir Hassan and Sir Hussain.
- Extra-curricular activities: Sports Gala, Northern Area trips, Qawali Night.
Rules:
1. Reply in Urdu script only. Keep it to one or two short sentences, written to be spoken aloud.
2. Write numbers as Urdu words (for example پچاس ہزار روپے) so speech sounds natural.
3. Write teacher names in Urdu script (سر فخر، سر علی، سر حسن، سر حسین).
4. If the question is not about these facts, or you are unsure, reply with exactly: ${SORRY}
5. Never invent fees, dates, phone numbers, or any other detail.`;

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/voice', upload.single('audio'), async (req, res) => {
  try {
    if (!GROQ_API_KEY || !ELEVENLABS_API_KEY) throw new Error('Missing API keys in .env');
    if (!req.file) return res.status(400).json({ error: 'No audio received' });

    // 1. Speech to text (Groq Whisper)
    const form = new FormData();
    form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || 'voice.webm');
    form.append('model', 'whisper-large-v3');
    form.append('language', 'ur');
    form.append('response_format', 'json');
    const stt = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, body: form
    });
    if (!stt.ok) throw new Error('Transcription failed: ' + (await stt.text()));
    const question = ((await stt.json()).text || '').trim();
    if (!question) return res.json({ question: '', answer: SORRY, audio: await speak(SORRY) });

    // 2. Understanding + answer (Groq LLM)
    const llm = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        max_tokens: 200,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: question }]
      })
    });
    if (!llm.ok) throw new Error('LLM failed: ' + (await llm.text()));
    const answer = (await llm.json()).choices?.[0]?.message?.content?.trim() || SORRY;

    // 3. Text to speech (ElevenLabs)
    res.json({ question, answer, audio: await speak(answer) });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

async function speak(text) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' })
  });
  if (!r.ok) { console.error('TTS failed:', await r.text()); return null; }
  return Buffer.from(await r.arrayBuffer()).toString('base64');
}

app.listen(process.env.PORT || 3000, () => console.log('Superior School running on http://localhost:' + (process.env.PORT || 3000)));
