async function getPairCode() {
  const number = document.getElementById("number").value.trim();
  const messageBox = document.getElementById("message");

  messageBox.innerHTML = "⏳ Generating pair code...";

  if (!number || !/^\d{10,15}$/.test(number)) {
    messageBox.innerHTML = "❌ Please enter a valid number with country code.";
    return;
  }

  try {
    const response = await fetch("/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number })
    });

    const result = await response.json();

    if (result.pairingCode) {
      messageBox.innerHTML = `
        ✅ <strong>Pair Code:</strong> <code>${result.pairingCode}</code><br/>
        📱 Go to WhatsApp → Linked Devices → Use this code to connect.
      `;
    } else if (result.error) {
      messageBox.innerHTML = `❌ ${result.error}`;
    } else {
      messageBox.innerHTML = "❌ Unexpected response. Try again.";
    }
  } catch (error) {
    messageBox.innerHTML = `❌ Failed to generate pair code. Server might be down.`;
  }
}