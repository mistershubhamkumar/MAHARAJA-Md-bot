const { default: makeWASocket, useSingleFileAuthState } = require("@whiskeysockets/baileys");
const pino = require("pino");
const path = require("path");

const sessionFile = path.join(__dirname, "sessions", "qr-session.json");
const { state, saveState } = useSingleFileAuthState(sessionFile);

let qrCode = null;

async function startQR() {
  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: state,
    browser: ["LevanterBot", "Chrome", "1.0"],
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, qr } = update;

    if (qr) {
      qrCode = qr;  // QR code milte hi store karo
    }

    if (connection === "open") {
      console.log("✅ QR session WhatsApp se connect ho gaya!");
      qrCode = null;  // Connection ho gaya to QR hata do
    }
  });

  sock.ev.on("creds.update", saveState);
}

function getQRCode() {
  return qrCode;
}

module.exports = { startQR, getQRCode };