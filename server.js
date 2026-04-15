const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { AccessToken } = require("livekit-server-sdk");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use(express.json());

const PORT = process.env.PORT || 3000;

function getLiveKitConfig() {
  const livekitUrl = process.env.LIVEKIT_URL;
  const livekitApiKey = process.env.LIVEKIT_API_KEY;
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET;

  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return { ok: false };
  }

  return {
    ok: true,
    livekitUrl,
    livekitApiKey,
    livekitApiSecret
  };
}

const parties = new Map();
const userPartyMap = new Map();
const waitingParties = [];

function makePartyCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function makeRoomName() {
  return "room_" + Math.random().toString(36).slice(2, 10);
}

function sendPartyUpdate(code) {
  const party = parties.get(code);
  if (!party) return;

  for (const memberId of party.members) {
    const memberSocket = io.sockets.sockets.get(memberId);
    if (memberSocket) {
      memberSocket.emit("party-updated", {
        code,
        count: party.members.length,
        hostId: party.hostId
      });
    }
  }
}

function removePartyFromQueue(code) {
  const index = waitingParties.indexOf(code);
  if (index !== -1) {
    waitingParties.splice(index, 1);
  }

  const party = parties.get(code);
  if (party) {
    party.inQueue = false;
  }
}

function sendRoomEnded(roomName, message) {
  for (const [code, party] of parties.entries()) {
    if (party.roomName === roomName) {
      party.roomName = null;

      for (const memberId of party.members) {
        const memberSocket = io.sockets.sockets.get(memberId);
        if (memberSocket) {
          memberSocket.emit("room-ended", { message });
        }
      }
    }
  }
}

function tryMatchParties() {
  while (waitingParties.length >= 2) {
    const codeA = waitingParties.shift();
    const codeB = waitingParties.shift();

    const partyA = parties.get(codeA);
    const partyB = parties.get(codeB);

    if (!partyA || !partyB) continue;
    if (partyA.members.length === 0 || partyB.members.length === 0) continue;

    partyA.inQueue = false;
    partyB.inQueue = false;

    const roomName = makeRoomName();
    partyA.roomName = roomName;
    partyB.roomName = roomName;

    const allMembers = [...partyA.members, ...partyB.members];

    for (const memberId of allMembers) {
      const memberSocket = io.sockets.sockets.get(memberId);
      if (memberSocket) {
        memberSocket.emit("matched", { roomName });
      }
    }
  }
}

app.post("/token", async (req, res) => {
  try {
    const { roomName, userName, clientId } = req.body;

    if (!roomName || !userName || !clientId) {
      return res.status(400).json({ error: "roomName, userName, and clientId are required" });
    }

    const liveKitConfig = getLiveKitConfig();
    if (!liveKitConfig.ok) {
      return res.status(500).json({ error: "LiveKit is not configured" });
    }

    const safeUserName = String(userName).trim();
    const safeClientId = String(clientId).trim();
    const participantIdentity = `${safeUserName}-${safeClientId}`;

    const token = new AccessToken(liveKitConfig.livekitApiKey, liveKitConfig.livekitApiSecret, {
      identity: participantIdentity,
      name: safeUserName
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true
    });

    const jwt = await token.toJwt();

    res.json({
      token: jwt,
      livekitUrl: liveKitConfig.livekitUrl
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not create token" });
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create-party", () => {
    if (userPartyMap.has(socket.id)) {
      const existingCode = userPartyMap.get(socket.id);
      socket.emit("party-joined", { code: existingCode });
      return;
    }

    let code = makePartyCode();
    while (parties.has(code)) {
      code = makePartyCode();
    }

    parties.set(code, {
      members: [socket.id],
      hostId: socket.id,
      inQueue: false,
      roomName: null
    });

    userPartyMap.set(socket.id, code);
    socket.emit("party-created", { code, hostId: socket.id });
    sendPartyUpdate(code);
  });

  socket.on("join-party", ({ code }) => {
    const cleanCode = String(code || "").trim().toUpperCase();
    const party = parties.get(cleanCode);

    if (!party) {
      socket.emit("join-error", { message: "Party not found" });
      return;
    }

    if (party.members.length >= 4) {
      socket.emit("join-error", { message: "Party is full" });
      return;
    }

    if (!party.members.includes(socket.id)) {
      party.members.push(socket.id);
      userPartyMap.set(socket.id, cleanCode);
    }

    socket.emit("party-joined", { code: cleanCode, hostId: party.hostId });
    sendPartyUpdate(cleanCode);
  });

  socket.on("start-match", () => {
    const code = userPartyMap.get(socket.id);

    if (!code) {
      socket.emit("join-error", { message: "Create or join a party first" });
      return;
    }

    const party = parties.get(code);
    if (!party) return;

    if (party.hostId !== socket.id) {
      socket.emit("join-error", { message: "Only the party host can start matching" });
      return;
    }

    if (party.roomName) {
      socket.emit("join-error", { message: "Your party is already in a room" });
      return;
    }

    if (!party.inQueue) {
      waitingParties.push(code);
      party.inQueue = true;
    }

    for (const memberId of party.members) {
      const memberSocket = io.sockets.sockets.get(memberId);
      if (memberSocket) {
        memberSocket.emit("waiting");
      }
    }

    tryMatchParties();
  });

  socket.on("skip-match", () => {
    const code = userPartyMap.get(socket.id);
    if (!code) return;

    const party = parties.get(code);
    if (!party) return;

    const oldRoomName = party.roomName;

    if (oldRoomName) {
      sendRoomEnded(oldRoomName, "The other party skipped.");
    }

    if (!party.inQueue) {
      waitingParties.push(code);
      party.inQueue = true;
    }

    party.roomName = null;

    for (const memberId of party.members) {
      const memberSocket = io.sockets.sockets.get(memberId);
      if (memberSocket) {
        memberSocket.emit("waiting");
      }
    }

    tryMatchParties();
  });

  socket.on("leave-room", () => {
    const code = userPartyMap.get(socket.id);
    if (!code) return;

    const party = parties.get(code);
    if (!party || !party.roomName) return;

    if (party.hostId !== socket.id) {
      socket.emit("join-error", { message: "Only the party host can leave the match" });
      return;
    }

    const oldRoomName = party.roomName;
    sendRoomEnded(oldRoomName, "The room ended.");
  });

  socket.on("disconnect", () => {
    const code = userPartyMap.get(socket.id);
    if (!code) return;

    const party = parties.get(code);
    userPartyMap.delete(socket.id);

    if (!party) return;

    if (party.roomName) {
      sendRoomEnded(party.roomName, "Someone disconnected.");
    }

    party.members = party.members.filter((id) => id !== socket.id);

    if (party.members.length === 0) {
      removePartyFromQueue(code);
      parties.delete(code);
    } else {
      if (party.hostId === socket.id) {
        party.hostId = party.members[0];
      }

      sendPartyUpdate(code);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
