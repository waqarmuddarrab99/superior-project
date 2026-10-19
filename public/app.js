const $ = (s) => document.querySelector(s);
const panel = $('#chat-panel'), fab = $('#chat-fab'), mic = $('#mic'), log = $('#log'), statusEl = $('#status');
let recorder, chunks = [], stream, busy = false, player;

const openChat = () => { panel.hidden = false; fab.hidden = true; };
const closeChat = () => { panel.hidden = true; fab.hidden = false; if (recorder?.state === 'recording') stopRecording(true); player?.pause(); };
fab.onclick = openChat;
$('#chat-close').onclick = closeChat;
document.querySelectorAll('[data-open-chat]').forEach((b) => (b.onclick = openChat));

function add(text, mine) {
  const p = document.createElement('p');
  p.className = 'urdu rounded-xl px-4 py-2 ' + (mine ? 'bg-board text-chalk' : 'bg-chalk');
  p.textContent = text;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
  return p;
}
const setStatus = (t) => (statusEl.textContent = t);

mic.onclick = async () => {
  if (busy) return;
  if (recorder?.state === 'recording') return stopRecording(false);
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return setStatus('Microphone blocked. Allow it in your browser settings.');
  }
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
  recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start();
  mic.classList.add('recording');
  mic.setAttribute('aria-label', 'Stop and send');
  setStatus('Recording… tap to send');
};

function stopRecording(cancel) {
  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    if (!cancel) send(new Blob(chunks, { type: recorder.mimeType }));
  };
  recorder.stop();
  mic.classList.remove('recording');
  mic.setAttribute('aria-label', 'Start recording');
}

async function send(blob) {
  if (blob.size < 1500) return setStatus('Too short. Tap and try again.');
  busy = true; setStatus('Listening to your question…');
  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const form = new FormData();
  form.append('audio', blob, `voice.${ext}`);
  try {
    const r = await fetch('/api/voice', { method: 'POST', body: form });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    if (data.question) add(data.question, true);
    add(data.answer, false);
    if (data.audio) {
      player = new Audio('data:audio/mpeg;base64,' + data.audio);
      setStatus('Playing answer…');
      player.onended = () => setStatus('Tap to record, tap again to send');
      await player.play().catch(() => setStatus('Tap the microphone to ask again'));
    } else setStatus('Tap to record, tap again to send');
  } catch (e) {
    setStatus(e.message || 'Could not reach the server. Try again.');
  } finally { busy = false; }
}
