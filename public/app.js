const socket = io();

const statusEl = document.getElementById("status");
const statusCard = document.getElementById("statusCard");
const onboardingScreen = document.getElementById("onboardingScreen");
const lobbyScreen = document.getElementById("lobbyScreen");
const localVideo = document.getElementById("localVideo");
const localCard = document.getElementById("localCard");
const localPlaceholder = document.getElementById("localPlaceholder");
const localUserLabel = document.getElementById("localUserLabel");
const videoGrid = document.getElementById("videoGrid");
const stageCountBadge = document.getElementById("stageCountBadge");

const nameInput = document.getElementById("nameInput");
const createPartyBtn = document.getElementById("createPartyBtn");
const partyCodeInput = document.getElementById("partyCodeInput");
const joinPartyBtn = document.getElementById("joinPartyBtn");
const startMatchBtn = document.getElementById("startMatchBtn");
const skipBtn = document.getElementById("skipBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");

const partyInfoEl = document.getElementById("partyInfo");
const partyCodeValue = document.getElementById("partyCodeValue");
const partyCountValue = document.getElementById("partyCountValue");
const queueStateValue = document.getElementById("queueStateValue");

const openPremiumBtn = document.getElementById("openPremiumBtn");
const premiumCtaBtn = document.getElementById("premiumCtaBtn");
const premiumModal = document.getElementById("premiumModal");
const closePremiumBtn = document.getElementById("closePremiumBtn");
const activatePremiumPreviewBtn = document.getElementById("activatePremiumPreviewBtn");
const premiumNote = document.getElementById("premiumNote");

let localStream = null;
let room = null;
let currentPartyCode = null;
let currentPartyCount = 0;
let currentPartyHostId = null;
let currentQueueState = "idle";
let isWaitingForMatch = false;
let isInRoom = false;
let premiumPreviewActive = false;
let userName = null;
let activeRoomName = null;
let currentRoomMode = null;

function getClientId() {
  return socket.id;
}

function isCurrentUserPartyHost() {
  return Boolean(currentPartyHostId) && currentPartyHostId === getClientId();
}

function setStatus(message, tone = "neutral") {
  statusEl.textContent = message;
  statusCard.dataset.tone = tone;
}

function updateActiveScreen() {
  const isInParty = Boolean(currentPartyCode);

  onboardingScreen.classList.toggle("app-screen--active", !isInParty);
  lobbyScreen.classList.toggle("app-screen--active", isInParty);
}

function setQueueState(state) {
  currentQueueState = state;
  updatePartyInfo();
  updateActionStates();
}

function getQueueStateLabel() {
  switch (currentQueueState) {
    case "party":
      return "Ready";
    case "queue":
      return "Matching";
    case "connecting":
      return "Joining";
    case "live":
      return "Live";
    default:
      return "Idle";
  }
}

function updatePremiumUI() {
  if (premiumPreviewActive) {
    openPremiumBtn.textContent = "Party Pro preview is on";
    premiumCtaBtn.textContent = "Party Pro preview enabled";
    activatePremiumPreviewBtn.textContent = "Party Pro preview enabled";
    premiumNote.textContent =
      "Party Pro preview is active in the UI. You can show a larger premium plan, but the current backend still enforces the live 4-member limit.";
    return;
  }

  openPremiumBtn.textContent = "Open Party Pro";
  premiumCtaBtn.textContent = "See Party Pro";
  activatePremiumPreviewBtn.textContent = "Turn on Party Pro preview";
  premiumNote.textContent =
    "Party Pro is still a frontend preview. The current live backend limit in this build still remains 4 members per party.";
}

function updatePartyInfo() {
  updateActiveScreen();

  if (!currentPartyCode) {
    partyCodeValue.textContent = "Not Joined";
    partyCountValue.textContent = "0 / 4";
    queueStateValue.textContent = "Idle";
    partyInfoEl.textContent =
      "You are not in a party yet. Create one to invite friends or join with a party code.";
    return;
  }

  partyCodeValue.textContent = currentPartyCode;
  partyCountValue.textContent = `${currentPartyCount} / 4`;
  queueStateValue.textContent = getQueueStateLabel();
  const hostNote = isCurrentUserPartyHost() ? " You are the party host." : " Waiting on the host for party-wide actions.";

  if (currentQueueState === "live") {
    partyInfoEl.textContent =
      `Party ${currentPartyCode} is live with ${currentPartyCount} member` +
      `${currentPartyCount === 1 ? "" : "s"} in this room.`;

    if (premiumPreviewActive) {
      partyInfoEl.textContent += " Party Pro preview is active in the interface.";
    }

    partyInfoEl.textContent += hostNote;

    return;
  }

  if (currentQueueState === "queue" || currentQueueState === "connecting") {
    partyInfoEl.textContent =
      `Party ${currentPartyCode} has ${currentPartyCount} member` +
      `${currentPartyCount === 1 ? "" : "s"} and is waiting for the next match together.`;

    if (currentPartyCount >= 4 && !premiumPreviewActive) {
      partyInfoEl.textContent += " Need a bigger group later? Open Party Pro to preview the upgrade flow.";
    }

    partyInfoEl.textContent += hostNote;

    return;
  }

  partyInfoEl.textContent =
    `Party ${currentPartyCode} is ready with ${currentPartyCount} member` +
    `${currentPartyCount === 1 ? "" : "s"}. Start matching when your group is ready.`;

  if (currentPartyCount >= 4 && !premiumPreviewActive) {
    partyInfoEl.textContent += " Your party is at the free plan cap.";
  }

  partyInfoEl.textContent += hostNote;
}

function updateLocalIdentity() {
  const typedName = nameInput.value.trim();
  localUserLabel.textContent = userName || typedName || "You";
}

function updateActionStates() {
  const hasName = nameInput.value.trim().length > 0;
  const hasPartyCode = partyCodeInput.value.trim().length > 0;
  const hasParty = Boolean(currentPartyCode);
  const isInMatchRoom = currentRoomMode === "match";
  const isHost = isCurrentUserPartyHost();

  createPartyBtn.disabled = !hasName;
  joinPartyBtn.disabled = !hasName || !hasPartyCode;
  startMatchBtn.disabled = !hasParty || !isHost || isWaitingForMatch || isInMatchRoom;
  skipBtn.disabled = !hasParty;
  leaveRoomBtn.disabled = !isInMatchRoom || !isHost;
}

function syncVideoGrid() {
  const totalCards = videoGrid.querySelectorAll(".video-card").length;
  const boundedCount = Math.max(1, Math.min(totalCards, 8));
  videoGrid.dataset.count = String(boundedCount);

  stageCountBadge.textContent =
    `${boundedCount} participant${boundedCount === 1 ? "" : "s"} on screen`;
}

function updateLocalPreviewState(isReady) {
  localCard.classList.toggle("is-live", isReady);
  localPlaceholder.setAttribute("aria-hidden", String(isReady));
}

function getUserName() {
  const name = nameInput.value.trim();
  if (!name) {
    alert("Type your name first.");
    return null;
  }

  return name;
}

function makeParticipantKey(participantRef) {
  const rawKey =
    typeof participantRef === "string"
      ? participantRef
      : participantRef?.sid || participantRef?.identity || "guest";

  return String(rawKey).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getParticipantLabel(participantRef) {
  if (typeof participantRef === "string") {
    return participantRef || "Guest";
  }

  return participantRef?.name || participantRef?.identity || "Guest";
}

function getPartyLobbyRoomName() {
  if (!currentPartyCode) return null;
  return `party_${currentPartyCode}`;
}

function openPremiumModal() {
  premiumModal.classList.add("is-open");
  premiumModal.setAttribute("aria-hidden", "false");
}

function closePremiumModal() {
  premiumModal.classList.remove("is-open");
  premiumModal.setAttribute("aria-hidden", "true");
}

function activatePremiumPreview() {
  premiumPreviewActive = true;
  updatePremiumUI();
  updatePartyInfo();
  setStatus("Party Pro preview is now visible across the app.", "info");
  closePremiumModal();
}

async function startCamera() {
  if (localStream) return localStream;

  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  localVideo.srcObject = localStream;
  updateLocalPreviewState(true);
  syncVideoGrid();

  return localStream;
}

function removeRemoteVideoBoxes() {
  const remoteCards = document.querySelectorAll(".remote-video-card");
  remoteCards.forEach((card) => card.remove());
  syncVideoGrid();
}

function createRemoteVideoBox(participant) {
  const participantKey = makeParticipantKey(participant);
  const participantLabel = getParticipantLabel(participant);
  const existing = document.getElementById(`card-${participantKey}`);

  if (existing) {
    const titleEl = existing.querySelector(".video-title");
    if (titleEl) {
      titleEl.textContent = participantLabel;
    }

    return existing.querySelector("video");
  }

  const card = document.createElement("article");
  card.className = "video-card remote-video-card";
  card.id = `card-${participantKey}`;

  const frame = document.createElement("div");
  frame.className = "video-frame";

  const video = document.createElement("video");
  video.id = `video-${participantKey}`;
  video.autoplay = true;
  video.playsInline = true;

  const overlay = document.createElement("div");
  overlay.className = "video-overlay";

  const identityStack = document.createElement("div");
  identityStack.className = "identity-stack";

  const pill = document.createElement("span");
  pill.className = "identity-pill";
  pill.textContent = premiumPreviewActive ? "Viewer" : "Friend";

  const title = document.createElement("h3");
  title.className = "video-title";
  title.textContent = participantLabel;

  const subtitle = document.createElement("p");
  subtitle.className = "video-subtitle";
  subtitle.textContent = premiumPreviewActive ? "Connected in Party Pro preview" : "Connected now";

  const chip = document.createElement("span");
  chip.className = "video-chip";
  chip.textContent = "Live video";

  identityStack.appendChild(pill);
  identityStack.appendChild(title);
  identityStack.appendChild(subtitle);

  overlay.appendChild(identityStack);
  overlay.appendChild(chip);

  frame.appendChild(video);
  frame.appendChild(overlay);

  card.appendChild(frame);
  videoGrid.appendChild(card);

  syncVideoGrid();
  return video;
}

function removeRemoteVideoBox(participant) {
  const participantKey = makeParticipantKey(participant);
  const card = document.getElementById(`card-${participantKey}`);

  if (card) {
    card.remove();
    syncVideoGrid();
  }
}

function getRemoteParticipants(roomInstance) {
  if (roomInstance.remoteParticipants instanceof Map) {
    return Array.from(roomInstance.remoteParticipants.values());
  }

  if (roomInstance.participants instanceof Map) {
    return Array.from(roomInstance.participants.values());
  }

  return [];
}

function getParticipantTrackPublications(participant) {
  if (participant.trackPublications instanceof Map) {
    return Array.from(participant.trackPublications.values());
  }

  if (participant.tracks instanceof Map) {
    return Array.from(participant.tracks.values());
  }

  return [];
}

async function publishLocalTracks(roomInstance) {
  const stream = await startCamera();
  const publishTasks = stream.getTracks().map((track) => {
    const source =
      track.kind === "video"
        ? LivekitClient.Track.Source.Camera
        : LivekitClient.Track.Source.Microphone;

    return roomInstance.localParticipant.publishTrack(track, { source });
  });

  await Promise.all(publishTasks);
}

async function leaveCurrentRoomOnly() {
  if (room) {
    room.disconnect();
    room = null;
  }

  activeRoomName = null;
  currentRoomMode = null;
  isInRoom = false;
  isWaitingForMatch = false;
  removeRemoteVideoBoxes();
  updateActionStates();
}

async function joinLiveKitRoom(roomName, roomMode = "match") {
  if (room && activeRoomName === roomName && currentRoomMode === roomMode) {
    return room;
  }

  const response = await fetch("/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      roomName,
      userName,
      clientId: getClientId()
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Could not get token");
  }

  if (room) {
    await leaveCurrentRoomOnly();
  }

  room = new LivekitClient.Room();

  room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
    if (track.kind === LivekitClient.Track.Kind.Video) {
      const videoEl = createRemoteVideoBox(participant);
      const mediaStream = new MediaStream([track.mediaStreamTrack]);
      videoEl.srcObject = mediaStream;
    }

    if (track.kind === LivekitClient.Track.Kind.Audio) {
      track.attach();
    }
  });

  room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
    if (track.kind === LivekitClient.Track.Kind.Video) {
      removeRemoteVideoBox(participant);
    }
  });

  room.on(LivekitClient.RoomEvent.ParticipantDisconnected, (participant) => {
    removeRemoteVideoBox(participant);
  });

  room.on(LivekitClient.RoomEvent.Disconnected, () => {
    if (roomMode === "match" && currentRoomMode === "match") {
      isWaitingForMatch = false;
    }

    isInRoom = false;
    removeRemoteVideoBoxes();
    updateActionStates();
  });

  await room.connect(data.livekitUrl, data.token);
  await publishLocalTracks(room);

  getRemoteParticipants(room).forEach((participant) => {
    getParticipantTrackPublications(participant).forEach((publication) => {
      const track = publication.track;
      if (!track) return;

      if (track.kind === LivekitClient.Track.Kind.Video) {
        const videoEl = createRemoteVideoBox(participant);
        const mediaStream = new MediaStream([track.mediaStreamTrack]);
        videoEl.srcObject = mediaStream;
      }

      if (track.kind === LivekitClient.Track.Kind.Audio) {
        track.attach();
      }
    });
  });

  activeRoomName = roomName;
  currentRoomMode = roomMode;
  isInRoom = true;

  if (roomMode === "match") {
    isWaitingForMatch = false;
    setQueueState("live");
    setStatus("You are connected to the match.", "success");
    return room;
  }

  setQueueState(isWaitingForMatch ? "queue" : "party");

  if (isWaitingForMatch) {
    setStatus("Waiting for another party while your group stays together.", "info");
  } else if (currentPartyCount > 1) {
    setStatus("Connected to your party lobby.", "success");
  } else {
    setStatus("Your party lobby is ready. Share your code to invite friends.", "success");
  }

  return room;
}

async function ensurePartyLobbyConnected() {
  const partyLobbyRoomName = getPartyLobbyRoomName();
  if (!partyLobbyRoomName || !userName) return;

  await joinLiveKitRoom(partyLobbyRoomName, "party");
}

createPartyBtn.addEventListener("click", async () => {
  try {
    const name = getUserName();
    if (!name) return;

    userName = name;
    updateLocalIdentity();
    setStatus("Starting your camera preview...", "info");
    await startCamera();
    socket.emit("create-party");
  } catch (err) {
    console.error(err);
    setStatus("Could not start camera or microphone.", "danger");
  }
});

joinPartyBtn.addEventListener("click", async () => {
  try {
    const name = getUserName();
    if (!name) return;

    const code = partyCodeInput.value.trim().toUpperCase();
    if (!code) {
      alert("Enter a party code first.");
      return;
    }

    partyCodeInput.value = code;
    userName = name;
    updateLocalIdentity();
    setStatus("Starting your camera preview...", "info");
    await startCamera();
    socket.emit("join-party", { code });
  } catch (err) {
    console.error(err);
    setStatus("Could not start camera or microphone.", "danger");
  }
});

startMatchBtn.addEventListener("click", () => {
  if (!currentPartyCode) {
    alert("Create or join a party first.");
    return;
  }

  isWaitingForMatch = true;
  socket.emit("start-match");
  setQueueState("queue");
  setStatus("Looking for another party...", "info");
});

skipBtn.addEventListener("click", async () => {
  if (!currentPartyCode) {
    alert("Create or join a party first.");
    return;
  }

  await ensurePartyLobbyConnected();
  isWaitingForMatch = true;
  socket.emit("skip-match");
  setQueueState("queue");
  setStatus("Skipping to the next party while your group stays together.", "warning");
});

leaveRoomBtn.addEventListener("click", async () => {
  await ensurePartyLobbyConnected();
  socket.emit("leave-room");
  setQueueState(currentPartyCode ? "party" : "idle");
  setStatus("You left the match and returned to your party lobby.", "warning");
});

nameInput.addEventListener("input", () => {
  updateLocalIdentity();
  updateActionStates();
});

partyCodeInput.addEventListener("input", () => {
  partyCodeInput.value = partyCodeInput.value.toUpperCase();
  updateActionStates();
});

nameInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;

  if (partyCodeInput.value.trim()) {
    joinPartyBtn.click();
    return;
  }

  createPartyBtn.click();
});

partyCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    joinPartyBtn.click();
  }
});

openPremiumBtn.addEventListener("click", openPremiumModal);
premiumCtaBtn.addEventListener("click", openPremiumModal);
closePremiumBtn.addEventListener("click", closePremiumModal);
activatePremiumPreviewBtn.addEventListener("click", activatePremiumPreview);

premiumModal.addEventListener("click", (event) => {
  if (event.target === premiumModal) {
    closePremiumModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePremiumModal();
  }
});

socket.on("party-created", async ({ code, hostId }) => {
  currentPartyCode = code;
  currentPartyCount = 1;
  currentPartyHostId = hostId || getClientId();
  isWaitingForMatch = false;
  updateActiveScreen();
  setQueueState("party");

  try {
    await ensurePartyLobbyConnected();
    setStatus("Party created. Share your code with friends.", "success");
  } catch (err) {
    console.error(err);
    setStatus("Party created, but the lobby could not start.", "danger");
  }

  alert(`Your party code is: ${code}`);
});

socket.on("party-joined", async ({ code, hostId }) => {
  currentPartyCode = code;
  currentPartyCount = Math.max(currentPartyCount, 1);
  currentPartyHostId = hostId || currentPartyHostId;
  isWaitingForMatch = false;
  updateActiveScreen();
  setQueueState("party");

  try {
    await ensurePartyLobbyConnected();
    setStatus("You joined the party lobby.", "success");
  } catch (err) {
    console.error(err);
    setStatus("You joined the party, but the lobby could not start.", "danger");
  }
});

socket.on("party-updated", ({ code, count, hostId }) => {
  currentPartyCode = code;
  currentPartyCount = count;
  currentPartyHostId = hostId || currentPartyHostId;
  updatePartyInfo();
  updateActionStates();
});

socket.on("join-error", ({ message }) => {
  isWaitingForMatch = false;
  setQueueState(currentPartyCode ? "party" : "idle");
  setStatus(message, "danger");

  if (message === "Party is full") {
    openPremiumModal();
  }

  alert(message);
});

socket.on("waiting", () => {
  isWaitingForMatch = true;
  setQueueState("queue");
  setStatus("Waiting for another party while your group stays together.", "info");
});

socket.on("matched", async ({ roomName }) => {
  try {
    setQueueState("connecting");
    setStatus("Matched. Joining room...", "success");
    await joinLiveKitRoom(roomName);
  } catch (err) {
    console.error(err);
    isWaitingForMatch = false;
    isInRoom = false;
    setQueueState(currentPartyCode ? "party" : "idle");
    setStatus(err?.message || "Could not join video room.", "danger");
  }
});

socket.on("room-ended", async ({ message }) => {
  if (currentPartyCode) {
    try {
      await ensurePartyLobbyConnected();
      setQueueState(isWaitingForMatch ? "queue" : "party");
      setStatus(message || "Room ended. You are back with your party.", "warning");
      return;
    } catch (err) {
      console.error(err);
    }
  }

  await leaveCurrentRoomOnly();
  setQueueState(currentPartyCode ? "party" : "idle");
  setStatus(message || "Room ended.", "warning");
});

updateLocalIdentity();
updatePremiumUI();
updatePartyInfo();
updateActionStates();
syncVideoGrid();
