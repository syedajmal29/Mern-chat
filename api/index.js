const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Message = require('./models/Message');
const ws = require('ws');
const fs = require('fs');
const path = require('path');

dotenv.config();

// MongoDB Connection
mongoose
  .connect(process.env.mongoUrl)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB Connection Error:', err));

const jwtSecret = process.env.JWT_SECRET;
const bcryptSalt = bcrypt.genSaltSync(10);

const app = express();
const uploadDir = path.resolve(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use('/uploads', express.static(uploadDir));
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    credentials: true,
    origin: process.env.CLIENT_URL,
  })
);

// Deployment setup
const __dirname1 = path.resolve();
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname1, '/client/build')));

  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname1, 'client', 'build', 'index.html'));
  });
} else {
  app.get('/test', (req, res) => {
    res.json('test ok');
  });
}

// Utility function to decode JWT
function verifyToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, jwtSecret, {}, (err, userData) => {
      if (err) return reject(err);
      resolve(userData);
    });
  });
}

async function getUserDataFromRequest(req) {
  const token = req.cookies?.token;
  if (!token) {
    throw new Error('No token provided');
  }
  return await verifyToken(token);
}

app.get('/messages/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const userData = await getUserDataFromRequest(req);
    const ourUserId = userData.userId;
    const messages = await Message.find({
      sender: { $in: [userId, ourUserId] },
      recipient: { $in: [userId, ourUserId] },
    }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.get('/people', async (req, res) => {
  try {
    const users = await User.find({}, { _id: 1, username: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/profile', async (req, res) => {
  try {
    const userData = await getUserDataFromRequest(req);
    res.json(userData);
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const foundUser = await User.findOne({ username });
  if (foundUser) {
    const passOk = bcrypt.compareSync(password, foundUser.password);
    if (passOk) {
      const token = jwt.sign(
        { userId: foundUser._id, username },
        jwtSecret,
        {}
      );
      return res
        .cookie('token', token, { sameSite: 'none', secure: true })
        .json({ id: foundUser._id });
    }
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/logout', (req, res) => {
  res.cookie('token', '', { sameSite: 'none', secure: true }).json('ok');
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = bcrypt.hashSync(password, bcryptSalt);
    const createdUser = await User.create({
      username,
      password: hashedPassword,
    });
    const token = jwt.sign(
      { userId: createdUser._id, username },
      jwtSecret,
      {}
    );
    res
      .cookie('token', token, { sameSite: 'none', secure: true })
      .status(201)
      .json({ id: createdUser._id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// WebSocket Server
const server = app.listen(4000, () => console.log('Server running on port 4000'));
const wss = new ws.WebSocketServer({ server });

wss.on('connection', async (connection, req) => {
  connection.isAlive = true;

  connection.timer = setInterval(() => {
    connection.ping();
    connection.deathTimer = setTimeout(() => {
      connection.isAlive = false;
      clearInterval(connection.timer);
      connection.terminate();
      notifyAboutOnlinePeople();
    }, 1000);
  }, 5000);

  connection.on('pong', () => clearTimeout(connection.deathTimer));

  const cookies = req.headers.cookie;
  if (cookies) {
    const tokenCookieString = cookies.split(';').find((str) => str.startsWith('token='));
    if (tokenCookieString) {
      const token = tokenCookieString.split('=')[1];
      try {
        const { userId, username } = await verifyToken(token);
        connection.userId = userId;
        connection.username = username;
      } catch (err) {
        console.error('Invalid token:', err);
      }
    }
  }

  connection.on('message', async (message) => {
    const messageData = JSON.parse(message.toString());
    const { recipient, text, file } = messageData;
    let filename = null;

    if (file) {
      const parts = file.name.split('.');
      const ext = parts[parts.length - 1];
      filename = `${Date.now()}.${ext}`;
      const filePath = path.join(uploadDir, filename);
      const bufferData = Buffer.from(file.data.split(',')[1], 'base64');
      fs.writeFileSync(filePath, bufferData);
    }

    if (recipient && (text || file)) {
      const messageDoc = await Message.create({
        sender: connection.userId,
        recipient,
        text,
        file: filename || null,
      });

      [...wss.clients]
        .filter((c) => c.userId === recipient)
        .forEach((c) =>
          c.send(
            JSON.stringify({
              text,
              sender: connection.userId,
              recipient,
              file: filename || null,
              _id: messageDoc._id,
            })
          )
        );
    }
  });

  function notifyAboutOnlinePeople() {
    const onlineUsers = [...wss.clients].map((c) => ({
      userId: c.userId,
      username: c.username,
    }));
    [...wss.clients].forEach((client) =>
      client.send(JSON.stringify({ online: onlineUsers }))
    );
  }

  notifyAboutOnlinePeople();
});
