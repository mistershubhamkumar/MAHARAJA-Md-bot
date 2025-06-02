const express = require('express');
const { Boom } = require('@hapi/boom');
const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  generatePairingCode,
  jidNormalizedUser,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

const SESSIONS_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);

app.post('/generate-pair', async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^\d{10,15}$/.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  const sessionId = `session_${Date.now()}`;
  const sessionPath = path.join(SESSIONS_DIR, sessionId);

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false
  });

  try {
    const code = await generatePairingCode(sock, phone + '@s.whatsapp.net');
    console.log(`Generated code for ${phone}: ${code}`);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        console.log('Connected!');

        const jid = sock.user.id;
        fs.writeFileSync('./config.env', `SESSION_ID=${sessionId}`);

        await sock.sendMessage(jidNormalizedUser(jid), {
          text: `✅ Your Session ID:\n${sessionId}`
        });

        res.json({ code });
        sock.ev.removeAllListeners('connection.update');
      } else if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('Disconnected. Reconnect:', shouldReconnect);
      }
    });
  } catch (e) {
    console.error('Pairing error:', e);
    res.status(500).json({ error: 'Failed to generate pair code' });
  }
});

app.listen(PORT, () => console.log(`🚀 Server ready at http://localhost:${PORT}`));
let qrCodeGlobal = '';

app.get('/qr', async (req, res) => {
  qrCodeGlobal = '';
  const sessionId = `qr_${Date.now()}`;
  const sessionPath = path.join(SESSIONS_DIR, sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    generateHighQualityLinkPreview: false
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      qrCodeGlobal = qr;
    }

    if (connection === 'open') {
      const jid = sock.user.id;
      fs.writeFileSync('./config.env', `SESSION_ID=${sessionId}`);
      await sock.sendMessage(jidNormalizedUser(jid), {
        text: `✅ Your QR-based Session ID:\n${sessionId}`
      });
    }

    if (connection === 'close') {
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
      if (reason !== DisconnectReason.loggedOut) {
        console.log("Reconnecting...");
      }
    }
  });

  setTimeout(() => {
    if (!qrCodeGlobal) {
      return res.status(500).json({ error: 'QR not ready or expired' });
    }
    res.json({ qr: qrCodeGlobal });
  }, 1000);
});