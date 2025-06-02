const express = require("express");
const fs = require("fs");
const path = require("path");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");
require("dotenv").config();

// ✅ QR session import
const { startQR, getQRCode } = require("./qr-session");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ✅ Start QR session at server launch
startQR();

// ✅ QR Code endpoint
app.get("/qr", (req, res) => {
  const qr = getQRCode();
  if (qr) {
    res.json({ qr });
  } else {
    res.json({ error: "QR not available. Already connected or initializing..." });
  }
});

// ✅ Home route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ Pair Code route
app.post("/pair", async (req, res) => {
  const number = req.body.number;

  if (!number || !/^\d{10,15}$/.test(number)) {
    return res.status(400).json({ error: "❌ Valid phone number required with country code." });
  }

  const sessionId = `session_${Date.now()}`;
  const sessionFolder = path.join(__dirname, "sessions", sessionId);

  if (!fs.existsSync(sessionFolder)) fs.mkdirSync(sessionFolder, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: ["LevanterBot", "Chrome", "1.0"],
  });

  sock.ev.once("connection.update", (update) => {
    const { connection, lastDisconnect, pairingCode } = update;

    if (pairingCode) {
      fs.writeFileSync("config.env", `SESSION_ID=${sessionId}`);
      res.json({ pairingCode });
    } else if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      res.status(500).json({ error: "❌ Connection closed, try again." });
    }
  });

  try {
    await sock.requestPairingCode(number);
    sock.ev.on("creds.update", saveCreds);
  } catch (e) {
    res.status(500).json({ error: "❌ Unable to generate pairing code. Try again later." });
  }
});

// ✅ Auto session loader
(async () => {
  const sessionId = process.env.SESSION_ID;
  if (!sessionId) {
    console.log("❗ No SESSION_ID found. Please pair a number first.");
    return;
  }

  const sessionFolder = path.join(__dirname, "sessions", sessionId);
  if (!fs.existsSync(sessionFolder)) {
    console.log("❗ Session folder missing. Please pair again.");
    return;
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "info" }),
    browser: ["LevanterBot", "Chrome", "1.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      console.log("✅ Bot connected to WhatsApp!");
    } else if (connection === "close") {
      console.log("❌ Disconnected.");
      const reason = lastDisconnect?.error?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log("⚠️ Session expired. Please re-pair.");
      }
    }
  });
})();

// ✅ Server listen
app.listen(PORT, () => {
  console.log(`🌐 Server running on http://localhost:${PORT}`);
});