require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 10000;
const SOCKET_PATH = process.env.SOCKET_PATH || "/socket.io";

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "voice-backend",
    socketPath: SOCKET_PATH
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const io = new Server(server, {
  path: SOCKET_PATH,
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const clients = new Map();
let bossSocketId = null;

function broadcastStatus() {
  io.emit("status", {
    userCount: clients.size,
    bossOnline: Boolean(bossSocketId && clients.has(bossSocketId))
  });
}

io.on("connection", (socket) => {
  clients.set(socket.id, { role: null });
  broadcastStatus();

  socket.on("set-role", (role) => {
    clients.set(socket.id, { role });

    if (role === "boss") {
      bossSocketId = socket.id;
    }

    if (role !== "boss" && bossSocketId === socket.id) {
      bossSocketId = null;
    }

    broadcastStatus();
  });

  socket.on("user-pcm-chunk", (buffer) => {
    const client = clients.get(socket.id);

    if (client && client.role === "user") {
      if (bossSocketId && clients.has(bossSocketId)) {
        socket.to(bossSocketId).emit("user-pcm-chunk", buffer);
      } else {
        socket.broadcast.emit("user-pcm-chunk", buffer);
      }
    }
  });

  socket.on("disconnect", () => {
    clients.delete(socket.id);

    if (bossSocketId === socket.id) {
      bossSocketId = null;
    }

    broadcastStatus();
  });
});

server.listen(PORT, () => {
  console.log(`Voice backend running on port ${PORT}`);
  console.log(`Socket.IO path: ${SOCKET_PATH}`);
});
